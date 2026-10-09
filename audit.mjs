#!/usr/bin/env node
// Full-site audit: discover every URL (robots.txt, sitemaps, rendered-link crawl),
// then audit each page (axe-core, WAVE, Lighthouse, HTML validity, SEO/structure,
// links, security headers) and write report.html / report.json / issues.csv.
import { parseArgs } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';
import { chromium } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';
import { HtmlValidate } from 'html-validate';
import lighthouse from 'lighthouse';
import desktopConfig from 'lighthouse/core/config/desktop-config.js';
import * as chromeLauncher from 'chrome-launcher';
import { renderReport } from './report.mjs';

const { values: opt, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    'max-pages': { type: 'string', default: '500' },
    concurrency: { type: 'string', default: '4' },
    lighthouse: { type: 'string', default: 'all' }, // number of pages, "all" or "0"
    device: { type: 'string', default: 'mobile' }, // lighthouse form factor: mobile | desktop
    'wave-key': { type: 'string', default: process.env.WAVE_API_KEY || '' },
    'wave-max': { type: 'string', default: '25' }, // WAVE API costs credits per page
    'ignore-robots': { type: 'boolean', default: false },
    'skip-external': { type: 'boolean', default: false },
    'discover-only': { type: 'boolean', default: false },
    out: { type: 'string' },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

if (opt.help || !positionals[0]) {
  console.log(`Usage: node audit.mjs <url> [options]

  --max-pages <n>       Max pages to crawl/audit (default 500)
  --concurrency <n>     Parallel browser pages (default 4)
  --lighthouse <n|all>  Pages to run Lighthouse on (default all, 0 = off; ~20s/page)
  --device <mobile|desktop>  Lighthouse form factor (default mobile)
  --wave-key <key>      WebAIM WAVE API key (or env WAVE_API_KEY)
  --wave-max <n>        Max pages sent to WAVE API (default 25)
  --ignore-robots       Crawl paths disallowed by robots.txt
  --skip-external       Don't check external link status
  --discover-only       Stop after URL discovery
  --out <dir>           Output dir (default reports/<host>-<timestamp>)`);
  process.exit(opt.help ? 0 : 1);
}

const START = new URL(/^https?:\/\//.test(positionals[0]) ? positionals[0] : `https://${positionals[0]}`);
const MAX_PAGES = Number(opt['max-pages']);
const CONCURRENCY = Number(opt.concurrency);
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36 site-audit';
const OUT = opt.out || path.join('reports', `${START.hostname}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}`);
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
const PAGE_TIMEOUT = 180000; // hard cap per page audit (axe/evaluate have no timeout of their own)
let stopping = false;
process.on('SIGINT', () => {
  if (stopping) process.exit(130);
  stopping = true;
  console.log('\n⚠ Ctrl+C: finishing in-flight pages, then writing a partial report. Press Ctrl+C again to quit immediately.');
});
const SKIP_EXT = /\.(pdf|jpe?g|png|gif|svg|webp|avif|ico|zip|gz|rar|docx?|xlsx?|pptx?|csv|mp[34]|mov|avi|webm|woff2?|ttf|css|js|json|xml|txt)$/i;

const bareHost = (h) => h.replace(/^www\./, '');
const inScope = (u) => (u.protocol === 'http:' || u.protocol === 'https:') && bareHost(u.hostname) === bareHost(START.hostname);
const log = (...a) => console.log(...a);

function normalize(href, base) {
  try {
    const u = new URL(href, base);
    if (!/^https?:$/.test(u.protocol)) return null;
    u.hash = '';
    return u;
  } catch {
    return null;
  }
}

async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length && !stopping) { const idx = i++; await fn(items[idx], idx); }
  }));
}

async function fetchText(url, timeout = 20000) {
  try {
    const res = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(timeout), redirect: 'follow' });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return (buf[0] === 0x1f && buf[1] === 0x8b ? gunzipSync(buf) : buf).toString('utf8');
  } catch {
    return null;
  }
}

// ---------- Phase 1: discovery ----------

async function readRobots() {
  const txt = await fetchText(new URL('/robots.txt', START).href);
  const robots = { found: !!txt, raw: txt?.slice(0, 5000) || '', disallow: [], sitemaps: [] };
  if (!txt) return robots;
  let agents = [];
  let lastWasAgent = false;
  for (const line of txt.split(/\r?\n/)) {
    const [k, ...rest] = line.replace(/#.*/, '').split(':');
    const key = k.trim().toLowerCase();
    const val = rest.join(':').trim();
    if (key === 'user-agent') { agents = lastWasAgent ? [...agents, val] : [val]; lastWasAgent = true; continue; }
    lastWasAgent = false;
    if (key === 'sitemap' && val) robots.sitemaps.push(val);
    if (key === 'disallow' && val && agents.includes('*')) robots.disallow.push(val);
  }
  return robots;
}

// ponytail: prefix match only, no robots wildcard (*, $) support
const disallowed = (u, robots) => robots.disallow.some((p) => (u.pathname + u.search).startsWith(p));

async function readSitemaps(seeds) {
  const seen = new Set();
  const urls = new Set();
  const sitemaps = [];
  const queue = [...seeds];
  while (queue.length && seen.size < 200) {
    const sm = queue.shift();
    if (seen.has(sm)) continue;
    seen.add(sm);
    const xml = await fetchText(sm);
    if (!xml || !/<(urlset|sitemapindex)/i.test(xml)) continue;
    const locs = [...xml.matchAll(/<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]\s]+)\s*(?:\]\]>)?\s*<\/loc>/gi)].map((m) => m[1].replace(/&amp;/g, '&'));
    if (/<sitemapindex/i.test(xml)) queue.push(...locs);
    else locs.forEach((l) => urls.add(l));
    sitemaps.push({ url: sm, type: /<sitemapindex/i.test(xml) ? 'index' : 'urlset', entries: locs.length });
  }
  return { sitemaps, urls: [...urls] };
}

async function discover(browser, robots, sitemapUrls) {
  const pages = new Map(); // url -> { url, status, finalUrl, contentType, source, links:[] }
  const queued = new Set();
  const queue = [];
  const linkIndex = new Map(); // any href -> Set(found on)
  const skipped = { robots: [], nonHtml: [] };

  const enqueue = (u, source) => {
    const key = u.href;
    if (queued.has(key) || queued.size >= MAX_PAGES * 3) return;
    queued.add(key);
    if (SKIP_EXT.test(u.pathname)) { skipped.nonHtml.push(key); return; }
    if (!opt['ignore-robots'] && disallowed(u, robots)) { skipped.robots.push(key); return; }
    queue.push({ url: key, source });
  };

  enqueue(normalize(START.href), 'start');
  for (const s of sitemapUrls) { const u = normalize(s); if (u && inScope(u)) enqueue(u, 'sitemap'); }

  const ctx = await browser.newContext({ userAgent: UA, ignoreHTTPSErrors: true });
  await ctx.route('**/*', (r) => (['image', 'media', 'font', 'stylesheet'].includes(r.request().resourceType()) ? r.abort() : r.continue()));

  let active = 0;
  const worker = async () => {
    let page = await ctx.newPage();
    while ((queue.length || active) && !stopping) {
      if (!queue.length || pages.size + active >= MAX_PAGES) {
        if (pages.size >= MAX_PAGES) break;
        await new Promise((r) => setTimeout(r, 100));
        continue;
      }
      const item = queue.shift();
      active++;
      const rec = { url: item.url, source: item.source, status: 0, finalUrl: item.url, contentType: '', links: [] };
      try {
        const res = await page.goto(item.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
        rec.status = res?.status() ?? 0;
        rec.finalUrl = normalize(page.url())?.href || item.url;
        rec.contentType = res?.headers()['content-type'] || '';
        if (rec.contentType.includes('html')) {
          rec.links = await page.$$eval('a[href], area[href]', (els) => [...new Set(els.map((e) => e.href))]);
        }
      } catch (e) {
        rec.error = e.message.split('\n')[0];
        await page.close().catch(() => {});
        page = await ctx.newPage(); // fresh tab in case the old one crashed
        if (!item.retried) { // transient timeouts are common on serverless hosts
          queue.push({ ...item, retried: true });
          active--;
          continue;
        }
      }
      pages.set(item.url, rec);
      for (const href of rec.links) {
        const u = normalize(href, rec.finalUrl);
        if (!u) continue;
        if (!linkIndex.has(u.href)) linkIndex.set(u.href, new Set());
        linkIndex.get(u.href).add(item.url);
        if (inScope(u)) enqueue(u, 'crawl');
      }
      // redirect target is the page we actually audit
      const fu = normalize(rec.finalUrl);
      if (rec.finalUrl !== item.url && fu && inScope(fu)) queued.add(rec.finalUrl);
      log(`  [discover ${pages.size}] ${rec.status || 'ERR'} ${item.url}`);
      active--;
    }
    await page.close();
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  await ctx.close();
  return { pages: [...pages.values()], linkIndex, skipped, pendingNotCrawled: queue.length };
}

// ---------- Phase 2: per-page audit ----------

// spec-validity + document rules; "recommended" adds style noise (trailing whitespace etc.)
const htmlValidator = new HtmlValidate({
  extends: ['html-validate:standard', 'html-validate:document'],
  rules: { 'require-sri': 'warn', 'wcag/h30': 'error', 'wcag/h32': 'error', 'wcag/h36': 'error', 'wcag/h37': 'error', 'wcag/h63': 'error', 'wcag/h67': 'error', 'wcag/h71': 'error' },
});

async function auditPage(ctx, url) {
  const result = { url };
  const consoleErrors = [];
  const failedRequests = [];
  const mixedContent = [];
  let page;
  const timer = setTimeout(() => { result.timedOut = true; page?.close().catch(() => {}); }, PAGE_TIMEOUT);
  try {
    page = await ctx.newPage();
    page.on('console', (m) => m.type() === 'error' && consoleErrors.length < 30 && consoleErrors.push(m.text().slice(0, 300)));
    page.on('pageerror', (e) => consoleErrors.length < 30 && consoleErrors.push(`Uncaught: ${e.message.slice(0, 300)}`));
    page.on('requestfailed', (r) => failedRequests.length < 30 && failedRequests.push({ url: r.url(), error: r.failure()?.errorText }));
    page.on('response', (r) => r.status() >= 400 && failedRequests.length < 30 && failedRequests.push({ url: r.url(), status: r.status() }));
    page.on('request', (r) => url.startsWith('https:') && r.url().startsWith('http:') && mixedContent.push(r.url()));

    const t0 = Date.now();
    const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForLoadState('load', { timeout: 20000 }).catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
    result.status = res?.status();
    result.loadMs = Date.now() - t0;
    result.headers = res?.headers() || {};

    const axe = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    result.axe = {
      violations: axe.violations.map((v) => ({
        id: v.id, impact: v.impact, help: v.help, description: v.description, helpUrl: v.helpUrl,
        wcag: v.tags.filter((t) => /^wcag\d|^best-practice$/.test(t)),
        count: v.nodes.length,
        nodes: v.nodes.slice(0, 15).map((n) => ({ target: n.target.join(' '), html: n.html.slice(0, 400), summary: n.failureSummary?.slice(0, 600) })),
      })),
      incomplete: axe.incomplete.map((v) => ({ id: v.id, impact: v.impact, help: v.help, helpUrl: v.helpUrl, count: v.nodes.length })),
      passes: axe.passes.length,
    };

    result.structure = await page.evaluate(extractStructure);

    // WCAG 1.4.10 reflow: content must fit 320 CSS px without horizontal scroll
    await page.setViewportSize({ width: 320, height: 640 });
    await page.waitForTimeout(300);
    result.structure.horizontalOverflow320 = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);

    const raw = res ? await res.text().catch(() => '') : '';
    const report = raw ? await htmlValidator.validateString(raw) : { results: [] };
    const msgs = report.results.flatMap((r) => r.messages);
    result.htmlValidation = {
      errors: msgs.filter((m) => m.severity === 2).length,
      warnings: msgs.filter((m) => m.severity === 1).length,
      messages: msgs.slice(0, 60).map((m) => ({ rule: m.ruleId, severity: m.severity === 2 ? 'error' : 'warning', message: m.message, line: m.line, col: m.column })),
    };
  } catch (e) {
    result.error = result.timedOut ? `audit exceeded ${PAGE_TIMEOUT / 1000}s` : e.message.split('\n')[0];
  } finally {
    clearTimeout(timer);
  }
  result.consoleErrors = consoleErrors;
  result.failedRequests = failedRequests;
  result.mixedContent = [...new Set(mixedContent)].slice(0, 30);
  await page?.close().catch(() => {});
  return result;
}

// Runs in the browser.
function extractStructure() {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const meta = (n) => $(`meta[name="${n}" i]`)?.content ?? null;
  const prop = (p) => $(`meta[property="${p}"]`)?.content ?? null;
  const headings = $$('h1,h2,h3,h4,h5,h6').map((h) => ({ level: +h.tagName[1], text: h.textContent.trim().replace(/\s+/g, ' ').slice(0, 120) }));
  const skips = [];
  headings.forEach((h, i) => { if (i && h.level > headings[i - 1].level + 1) skips.push(`h${headings[i - 1].level} → h${h.level} ("${h.text}")`); });
  const ids = $$('[id]').map((e) => e.id);
  const dupIds = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
  const imgs = $$('img');
  const nav = performance.getEntriesByType('navigation')[0];
  const resources = performance.getEntriesByType('resource');
  const jsonLd = $$('script[type="application/ld+json"]').flatMap((s) => {
    try { const d = JSON.parse(s.textContent); return [d].flat().flatMap((x) => x['@graph'] || [x]).map((x) => x['@type']).flat(); } catch { return ['(invalid JSON-LD)']; }
  });
  const genericLink = /^(click here|here|read more|more|learn more|link)$/i;
  return {
    title: document.title,
    titleLength: document.title.length,
    metaDescription: meta('description'),
    lang: document.documentElement.lang || null,
    viewport: meta('viewport'),
    viewportBlocksZoom: /user-scalable\s*=\s*(no|0)|maximum-scale\s*=\s*1(\.0)?(\D|$)/i.test(meta('viewport') || ''),
    robotsMeta: meta('robots'),
    canonical: $('link[rel="canonical"]')?.href ?? null,
    favicon: !!$('link[rel~="icon"]'),
    og: { title: prop('og:title'), description: prop('og:description'), image: prop('og:image'), type: prop('og:type') },
    twitterCard: meta('twitter:card'),
    hreflang: $$('link[rel="alternate"][hreflang]').map((l) => l.hreflang),
    jsonLdTypes: [...new Set(jsonLd)],
    h1Count: headings.filter((h) => h.level === 1).length,
    headings: headings.slice(0, 80),
    headingSkips: skips,
    landmarks: {
      header: !!$('header,[role=banner]'), nav: !!$('nav,[role=navigation]'), main: !!$('main,[role=main]'),
      footer: !!$('footer,[role=contentinfo]'),
    },
    skipLink: $$('a[href^="#"]').slice(0, 5).some((a) => /skip|jump to/i.test(a.textContent)),
    images: imgs.length,
    imagesMissingAlt: imgs.filter((i) => !i.hasAttribute('alt')).length,
    imagesEmptyAlt: imgs.filter((i) => i.getAttribute('alt') === '').length,
    imagesNoDimensions: imgs.filter((i) => !i.getAttribute('width') || !i.getAttribute('height')).length,
    imagesNotLazy: imgs.filter((i) => i.loading !== 'lazy' && i.getBoundingClientRect().top > innerHeight * 2).length,
    links: $$('a[href]').length,
    genericLinkText: $$('a[href]').filter((a) => genericLink.test(a.textContent.trim())).length,
    newTabLinksNoWarning: $$('a[target="_blank"]').filter((a) => !/new (tab|window)/i.test(a.textContent + (a.getAttribute('aria-label') || '') + (a.title || ''))).length,
    forms: $$('form').length,
    inputsNoAutocomplete: $$('input[type=email],input[type=tel],input[name*=name i]').filter((i) => !i.autocomplete).length,
    iframes: $$('iframe').length,
    duplicateIds: dupIds.slice(0, 30),
    tabindexPositive: $$('[tabindex]').filter((e) => +e.getAttribute('tabindex') > 0).length,
    autoplayMedia: $$('video[autoplay],audio[autoplay]').length,
    wordCount: (document.body?.innerText || '').split(/\s+/).filter(Boolean).length,
    domNodes: document.getElementsByTagName('*').length,
    perf: {
      ttfb: nav ? Math.round(nav.responseStart) : null,
      domContentLoaded: nav ? Math.round(nav.domContentLoadedEventEnd) : null,
      load: nav ? Math.round(nav.loadEventEnd) : null,
      requests: resources.length + 1,
      transferKB: Math.round((resources.reduce((s, r) => s + (r.transferSize || 0), 0) + (nav?.transferSize || 0)) / 1024),
    },
  };
}

// SEO / structure findings derived from extracted data (one place for the rules).
function structureIssues(s) {
  if (!s) return [];
  const out = [];
  const add = (severity, id, msg) => out.push({ severity, id, msg });
  if (!s.title) add('error', 'title-missing', 'Missing <title>');
  else if (s.titleLength < 15 || s.titleLength > 65) add('warning', 'title-length', `Title length ${s.titleLength} (aim 15–65)`);
  if (!s.metaDescription) add('warning', 'meta-description-missing', 'Missing meta description');
  else if (s.metaDescription.length < 50 || s.metaDescription.length > 160) add('notice', 'meta-description-length', `Meta description length ${s.metaDescription.length} (aim 50–160)`);
  if (!s.lang) add('error', 'html-lang-missing', '<html> has no lang');
  if (!s.viewport) add('error', 'viewport-missing', 'No viewport meta');
  if (s.viewportBlocksZoom) add('error', 'viewport-blocks-zoom', 'Viewport disables pinch zoom');
  if (s.h1Count === 0) add('error', 'h1-missing', 'No <h1>');
  if (s.h1Count > 1) add('warning', 'h1-multiple', `${s.h1Count} <h1> elements`);
  if (s.headingSkips.length) add('warning', 'heading-skip', `Heading levels skipped: ${s.headingSkips.slice(0, 3).join('; ')}`);
  if (!s.canonical) add('notice', 'canonical-missing', 'No canonical link');
  if (/noindex/i.test(s.robotsMeta || '')) add('warning', 'noindex', `robots meta: ${s.robotsMeta}`);
  if (!s.og.title || !s.og.image) add('notice', 'open-graph-incomplete', 'og:title / og:image missing');
  if (!s.landmarks.main) add('warning', 'landmark-main-missing', 'No <main> landmark');
  if (!s.skipLink) add('notice', 'skip-link-missing', 'No "skip to content" link');
  if (s.imagesMissingAlt) add('error', 'img-alt-missing', `${s.imagesMissingAlt} <img> without alt`);
  if (s.genericLinkText) add('warning', 'generic-link-text', `${s.genericLinkText} links with generic text ("read more", "click here")`);
  if (s.newTabLinksNoWarning) add('notice', 'new-tab-no-warning', `${s.newTabLinksNoWarning} links open new tab without warning`);
  if (s.duplicateIds.length) add('warning', 'duplicate-id', `Duplicate ids: ${s.duplicateIds.slice(0, 5).join(', ')}`);
  if (s.tabindexPositive) add('warning', 'tabindex-positive', `${s.tabindexPositive} elements with tabindex > 0`);
  if (s.autoplayMedia) add('warning', 'autoplay-media', `${s.autoplayMedia} autoplaying media`);
  if (s.horizontalOverflow320) add('error', 'reflow-320', 'Horizontal scroll at 320px width (WCAG 1.4.10)');
  if (s.imagesNoDimensions) add('notice', 'img-no-dimensions', `${s.imagesNoDimensions} images without width/height (CLS risk)`);
  if (s.wordCount < 150) add('notice', 'thin-content', `Only ${s.wordCount} words`);
  if (!s.jsonLdTypes.length) add('notice', 'structured-data-missing', 'No JSON-LD structured data');
  if (s.domNodes > 1500) add('notice', 'dom-size', `${s.domNodes} DOM nodes`);
  return out;
}

// ---------- WAVE ----------

async function waveCheck(url, key) {
  try {
    const api = `https://wave.webaim.org/api/request?key=${encodeURIComponent(key)}&url=${encodeURIComponent(url)}&reporttype=2`;
    const res = await fetch(api, { signal: AbortSignal.timeout(90000) });
    const j = await res.json();
    if (!j.status?.success) return { error: j.status?.error || 'WAVE request failed' };
    const cats = {};
    for (const [k, c] of Object.entries(j.categories || {})) {
      cats[k] = { count: c.count, items: Object.values(c.items || {}).map((i) => ({ id: i.id, description: i.description, count: i.count })) };
    }
    return { categories: cats, creditsRemaining: j.statistics?.creditsremaining, waveUrl: j.statistics?.waveurl };
  } catch (e) {
    return { error: e.message };
  }
}

// ---------- Lighthouse ----------

function pickLighthousePages(urls, n) {
  if (n === Infinity || n >= urls.length) return urls;
  // homepage, then one page per top-level section, then fill in crawl order
  const picked = [urls[0]];
  const sections = new Set();
  for (const u of urls.slice(1)) {
    const sec = new URL(u).pathname.split('/')[1] || '';
    if (!sections.has(sec)) { sections.add(sec); picked.push(u); }
  }
  for (const u of urls) if (!picked.includes(u)) picked.push(u);
  return picked.slice(0, n);
}

async function runLighthouse(urls, dir) {
  if (!urls.length) return [];
  let chrome;
  try {
    chrome = await chromeLauncher.launch({ handleSIGINT: false, chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu'] });
  } catch {
    chrome = await chromeLauncher.launch({ handleSIGINT: false, chromePath: chromium.executablePath(), chromeFlags: ['--headless=new', '--no-sandbox'] });
  }
  const results = [];
  try {
    for (const [i, url] of urls.entries()) {
      if (stopping) break;
      log(`  [lighthouse ${i + 1}/${urls.length}] ${url}`);
      for (let attempt = 1; attempt <= 2; attempt++) try {
        const r = await lighthouse(url, {
          port: chrome.port, output: ['html', 'json'], logLevel: 'error',
          onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
        }, opt.device === 'desktop' ? desktopConfig : undefined);
        const file = `lh-${String(i + 1).padStart(3, '0')}.html`;
        await writeFile(path.join(dir, file), r.report[0]);
        const lhr = r.lhr;
        const a = lhr.audits;
        results.push({
          url, file,
          scores: Object.fromEntries(Object.entries(lhr.categories).map(([k, c]) => [k, c.score == null ? null : Math.round(c.score * 100)])),
          metrics: {
            FCP: a['first-contentful-paint']?.displayValue, LCP: a['largest-contentful-paint']?.displayValue,
            TBT: a['total-blocking-time']?.displayValue, CLS: a['cumulative-layout-shift']?.displayValue,
            SI: a['speed-index']?.displayValue,
          },
          failing: Object.values(lhr.categories).flatMap((c) => c.auditRefs.map((ref) => ({ cat: c.id, ...a[ref.id] })))
            .filter((x) => x.score !== null && x.score < 0.9 && x.scoreDisplayMode !== 'informative' && x.scoreDisplayMode !== 'notApplicable' && x.scoreDisplayMode !== 'manual')
            .map((x) => ({ category: x.cat, id: x.id, title: x.title, score: x.score, displayValue: x.displayValue || '' })),
          runtimeError: lhr.runtimeError?.message,
        });
        if (!lhr.runtimeError || attempt === 2) break;
        results.pop(); // page timed out / no paint: retry once
        await new Promise((r) => setTimeout(r, 10000));
      } catch (e) {
        if (attempt === 2) results.push({ url, error: e.message.split('\n')[0] });
        else await new Promise((r) => setTimeout(r, 10000));
      }
    }
  } finally {
    chrome.kill();
  }
  return results;
}

// ---------- Links + site-level checks ----------

async function checkUrlStatus(url) {
  for (const method of ['HEAD', 'GET']) {
    try {
      const res = await fetch(url, { method, headers: { 'user-agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(20000) });
      if (method === 'HEAD' && [403, 405, 501, 404, 400].includes(res.status)) continue;
      res.body?.cancel().catch(() => {});
      return { status: res.status, finalUrl: res.url, redirected: res.redirected };
    } catch (e) {
      if (method === 'GET') return { status: 0, error: e.cause?.code || e.message };
    }
  }
}

async function siteChecks(homeHeaders) {
  const h = homeHeaders || {};
  const security = {
    'strict-transport-security': h['strict-transport-security'] || null,
    'content-security-policy': h['content-security-policy'] || null,
    'x-content-type-options': h['x-content-type-options'] || null,
    'x-frame-options': h['x-frame-options'] || null,
    'referrer-policy': h['referrer-policy'] || null,
    'permissions-policy': h['permissions-policy'] || null,
  };
  const httpUrl = new URL(START.href); httpUrl.protocol = 'http:';
  const httpRes = await checkUrlStatus(httpUrl.href);
  const notFound = await checkUrlStatus(new URL(`/this-page-should-not-exist-${Date.now()}`, START).href);
  return {
    security,
    server: h.server || null,
    httpsRedirect: httpRes?.finalUrl?.startsWith('https:') ?? false,
    soft404: notFound?.status === 200,
    notFoundStatus: notFound?.status,
  };
}

// ---------- main ----------

async function main() {
  await mkdir(path.join(OUT, 'lighthouse'), { recursive: true });
  const started = new Date();
  log(`Auditing ${START.href} → ${OUT}`);

  log('Phase 1: discovery (robots.txt, sitemaps, crawl)');
  const robots = await readRobots();
  const sm = await readSitemaps([...new Set([...robots.sitemaps, new URL('/sitemap.xml', START).href, new URL('/sitemap_index.xml', START).href])]);
  log(`  robots.txt: ${robots.found ? 'found' : 'missing'}, sitemaps: ${sm.sitemaps.length}, sitemap URLs: ${sm.urls.length}`);

  let browser = await chromium.launch({ handleSIGINT: false }); // keep browser alive on Ctrl+C so in-flight pages finish
  const disc = await discover(browser, robots, sm.urls);
  const sitemapSet = new Set(sm.urls.map((u) => normalize(u)?.href));
  const crawledSet = new Set(disc.pages.filter((p) => p.source !== 'sitemap').map((p) => p.url));
  const okHtml = disc.pages
    .filter((p) => p.status && p.status < 400 && p.contentType.includes('html') && inScope(new URL(p.finalUrl)))
    .sort((a, b) => (b.source === 'start') - (a.source === 'start')); // homepage first
  const htmlPages = [...new Set(okHtml.map((p) => p.finalUrl))];
  const internalBroken = disc.pages.filter((p) => !p.status || p.status >= 400)
    .map((p) => ({ url: p.url, status: p.status, error: p.error, foundOn: [...(disc.linkIndex.get(p.url) || [])].slice(0, 10), source: p.source }));

  await writeFile(path.join(OUT, 'urls.txt'), htmlPages.join('\n') + '\n');
  log(`  ${disc.pages.length} URLs fetched, ${htmlPages.length} unique HTML pages, ${internalBroken.length} broken`);
  if (opt['discover-only']) { await browser.close(); log(`URL list: ${path.join(OUT, 'urls.txt')}`); return; }

  log(`Phase 2: page audits (axe-core, structure, HTML validation) × ${htmlPages.length}`);
  const newCtx = () => browser.newContext({ userAgent: UA, ignoreHTTPSErrors: true, viewport: { width: 1366, height: 900 } });
  let ctx = await newCtx();
  const pageResults = [];
  const auditOne = async (url, i) => {
    const r = await auditPage(ctx, url);
    r.issues = structureIssues(r.structure);
    r.inSitemap = sitemapSet.has(url);
    pageResults[i] = r;
    const n = r.axe?.violations.length;
    log(`  [audit ${pageResults.filter(Boolean).length}/${htmlPages.length}] ${r.error ? `✗ AUDIT ERROR (${r.error})` : `✓ ok — ${n} accessibility issue type${n === 1 ? '' : 's'} found`} ${url}`);
  };
  await pool(htmlPages, CONCURRENCY, auditOne);
  // Failures usually come in bursts (host throttling parallel requests): back off, retry one at a time.
  for (let round = 1; round <= 3; round++) {
    const failed = htmlPages.map((u, i) => i).filter((i) => pageResults[i]?.error);
    if (!failed.length || stopping) break;
    log(`  retry round ${round}: ${failed.length} failed page(s), sequential after ${round * 10}s pause`);
    await new Promise((r) => setTimeout(r, round * 10000));
    await ctx.close().catch(() => {});
    if (!browser.isConnected()) browser = await chromium.launch({ handleSIGINT: false });
    ctx = await newCtx();
    for (const i of failed) { if (stopping) break; await auditOne(htmlPages[i], i); }
  }
  await ctx.close().catch(() => {});
  await browser.close();

  log('Phase 3: link checks + site-level checks');
  const pageSet = new Set(disc.pages.map((p) => p.url));
  const toCheck = [...disc.linkIndex.keys()].filter((u) => !pageSet.has(u) && (inScope(new URL(u)) || !opt['skip-external']));
  const linkResults = [];
  await pool(toCheck, 10, async (u) => {
    const r = await checkUrlStatus(u);
    linkResults.push({ url: u, internal: inScope(new URL(u)), ...r, foundOn: [...disc.linkIndex.get(u)].slice(0, 10) });
  });
  const brokenLinks = [
    ...internalBroken.map((b) => ({ ...b, internal: true })),
    ...linkResults.filter((r) => !r.status || r.status >= 400),
  ];
  const site = await siteChecks(pageResults[0]?.headers);

  const waveKey = opt['wave-key'];
  let wave = { enabled: !!waveKey, results: [] };
  if (waveKey) {
    const targets = htmlPages.slice(0, Number(opt['wave-max']));
    log(`Phase 4: WAVE API × ${targets.length}`);
    await pool(targets, 2, async (u) => { wave.results.push({ url: u, ...(await waveCheck(u, waveKey)) }); log(`  [wave] ${u}`); });
  }

  const lhN = opt.lighthouse === 'all' ? Infinity : Number(opt.lighthouse);
  const lhTargets = lhN ? pickLighthousePages(htmlPages, lhN) : [];
  if (lhTargets.length) log(`Phase 5: Lighthouse (${opt.device}) × ${lhTargets.length}`);
  const lh = await runLighthouse(lhTargets, path.join(OUT, 'lighthouse'));

  const data = {
    target: START.href, started: started.toISOString(), finished: new Date().toISOString(),
    options: { maxPages: MAX_PAGES, device: opt.device, axeTags: AXE_TAGS, ignoreRobots: opt['ignore-robots'] },
    discovery: {
      robots, sitemaps: sm.sitemaps, sitemapUrlCount: sm.urls.length,
      fetched: disc.pages.map(({ links, ...p }) => ({ ...p, outLinks: links.length })),
      htmlPages, skipped: disc.skipped, pendingNotCrawled: disc.pendingNotCrawled,
      orphans: htmlPages.filter((u) => sitemapSet.has(u) && !crawledSet.has(u) && ![...(disc.linkIndex.get(u) || [])].length),
      notInSitemap: sm.urls.length ? htmlPages.filter((u) => !sitemapSet.has(u)) : [],
    },
    partial: stopping,
    pages: pageResults.filter(Boolean),
    links: { checked: linkResults.length + disc.pages.length, broken: brokenLinks, redirects: linkResults.filter((r) => r.redirected && r.internal).length },
    site, wave, lighthouse: lh,
  };

  await writeFile(path.join(OUT, 'report.json'), JSON.stringify(data, null, 2));
  await writeFile(path.join(OUT, 'issues.csv'), toCsv(data));
  await writeFile(path.join(OUT, 'report.html'), renderReport(data));
  log(`\nDone in ${Math.round((Date.now() - started) / 1000)}s\n  ${path.resolve(OUT, 'report.html')}`);
}

function toCsv(data) {
  const rows = [['page', 'tool', 'rule', 'severity', 'count', 'description', 'help']];
  for (const p of data.pages) {
    for (const v of p.axe?.violations || []) rows.push([p.url, 'axe', v.id, v.impact, v.count, v.help, v.helpUrl]);
    for (const i of p.issues || []) rows.push([p.url, 'structure', i.id, i.severity, 1, i.msg, '']);
    for (const m of p.htmlValidation?.messages || []) rows.push([p.url, 'html-validate', m.rule, m.severity, 1, `L${m.line}: ${m.message}`, `https://html-validate.org/rules/${m.rule}.html`]);
  }
  for (const w of data.wave.results) for (const [cat, c] of Object.entries(w.categories || {})) {
    if (['error', 'contrast', 'alert'].includes(cat)) for (const it of c.items) rows.push([w.url, 'wave', it.id, cat, it.count, it.description, '']);
  }
  for (const l of data.lighthouse) for (const f of l.failing || []) rows.push([l.url, 'lighthouse', f.id, f.category, 1, f.title, f.displayValue]);
  for (const b of data.links.broken) rows.push([b.foundOn?.[0] || '', 'links', 'broken-link', b.status || 'error', 1, b.url, b.error || '']);
  return rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n') + '\n';
}

main().catch((e) => { console.error(e); process.exit(1); });
