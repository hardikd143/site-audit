// Renders report.json data into one self-contained HTML file.
// All rendering happens client-side from the embedded JSON so the page stays in sync with report.json.

export function renderReport(data) {
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  const host = new URL(data.target).hostname;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Site Audit — ${host}</title>
<style>
:root {
  --bg: #f7f7f5; --surface: #ffffff; --surface-2: #f0efec; --text: #1c1c1a; --muted: #66645e; --border: #e2e0db;
  --accent: #2f5bd3; --critical: #b3261e; --serious: #d0611b; --moderate: #a07a00; --minor: #5d6b7a; --good: #1e7d4f;
  --critical-bg: #fbe9e7; --serious-bg: #fdf0e6; --moderate-bg: #fbf5df; --minor-bg: #eef1f4; --good-bg: #e6f4ec;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #141413; --surface: #1d1d1b; --surface-2: #262623; --text: #ecebe7; --muted: #a3a19a; --border: #34332f;
    --accent: #7b9cff; --critical: #ff8a80; --serious: #ffab70; --moderate: #e8c95a; --minor: #a8b4c2; --good: #6fd19c;
    --critical-bg: #3a1d1b; --serious-bg: #3a2717; --moderate-bg: #352e14; --minor-bg: #262b31; --good-bg: #17301f;
  }
}
:root[data-theme="dark"] {
  --bg: #141413; --surface: #1d1d1b; --surface-2: #262623; --text: #ecebe7; --muted: #a3a19a; --border: #34332f;
  --accent: #7b9cff; --critical: #ff8a80; --serious: #ffab70; --moderate: #e8c95a; --minor: #a8b4c2; --good: #6fd19c;
  --critical-bg: #3a1d1b; --serious-bg: #3a2717; --moderate-bg: #352e14; --minor-bg: #262b31; --good-bg: #17301f;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
a { color: var(--accent); }
header { padding: 28px 16px 8px; max-width: 1280px; margin: 0 auto; }
header h1 { margin: 0 0 4px; font-size: 24px; }
header p { margin: 0; color: var(--muted); }
nav.tabs { position: sticky; top: 0; z-index: 5; background: var(--bg); border-bottom: 1px solid var(--border); }
nav.tabs div { max-width: 1280px; margin: 0 auto; padding: 0 16px; display: flex; gap: 2px; overflow-x: auto; }
nav.tabs button { background: none; border: 0; border-bottom: 2px solid transparent; color: var(--muted); padding: 12px 12px; font: inherit; cursor: pointer; white-space: nowrap; }
nav.tabs button[aria-selected="true"] { color: var(--text); border-color: var(--accent); font-weight: 600; }
main { max-width: 1280px; margin: 0 auto; padding: 20px 16px 60px; }
section[hidden] { display: none; }
h2 { font-size: 18px; margin: 28px 0 10px; }
h2:first-child { margin-top: 0; }
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 12px; }
.card { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 14px; }
.card .v { font-size: 28px; font-weight: 700; font-variant-numeric: tabular-nums; }
.card .l { color: var(--muted); font-size: 12px; }
.panel { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
.scroll { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; }
th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--border); vertical-align: top; }
th { background: var(--surface-2); font-size: 12px; color: var(--muted); font-weight: 600; position: sticky; top: 0; cursor: pointer; user-select: none; }
td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
tr:last-child td { border-bottom: 0; }
.url { word-break: break-all; max-width: 520px; }
.pill { display: inline-block; padding: 1px 8px; border-radius: 999px; font-size: 12px; font-weight: 600; white-space: nowrap; }
.critical, .error { color: var(--critical); background: var(--critical-bg); }
.serious { color: var(--serious); background: var(--serious-bg); }
.moderate, .warning { color: var(--moderate); background: var(--moderate-bg); }
.minor, .notice { color: var(--minor); background: var(--minor-bg); }
.ok { color: var(--good); background: var(--good-bg); }
.score { display: inline-block; min-width: 36px; text-align: center; padding: 2px 6px; border-radius: 6px; font-weight: 700; font-variant-numeric: tabular-nums; }
details { border-bottom: 1px solid var(--border); }
details:last-child { border-bottom: 0; }
summary { padding: 10px 12px; cursor: pointer; display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap; }
summary:hover { background: var(--surface-2); }
.det { padding: 4px 14px 14px; }
code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
pre { background: var(--surface-2); padding: 8px 10px; border-radius: 6px; white-space: pre-wrap; word-break: break-all; margin: 4px 0; }
.muted { color: var(--muted); }
.grow { flex: 1; min-width: 200px; }
input[type=search] { width: 100%; max-width: 420px; padding: 8px 10px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface); color: var(--text); font: inherit; margin-bottom: 10px; }
ul.plain { margin: 6px 0; padding-left: 18px; }
.bar { display: flex; height: 10px; border-radius: 5px; overflow: hidden; background: var(--surface-2); margin-top: 8px; }
.bar span { display: block; }
.two { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px; }
.theme { float: right; background: var(--surface); color: var(--text); border: 1px solid var(--border); border-radius: 8px; padding: 6px 10px; cursor: pointer; font: inherit; }
@media (max-width: 600px) { .card .v { font-size: 22px; } th, td { padding: 6px; } }
</style>
</head>
<body>
<header>
  <button class="theme" id="theme" type="button">Toggle theme</button>
  <h1>Site audit: ${host}</h1>
  <p id="sub"></p>
</header>
<nav class="tabs" aria-label="Report sections"><div role="tablist" id="tabs"></div></nav>
<main id="main"></main>
<script type="application/json" id="data">${json}</script>
<script>
const D = JSON.parse(document.getElementById('data').textContent);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const IMPACTS = ['critical', 'serious', 'moderate', 'minor'];
const pages = D.pages.filter(Boolean);
const okPages = pages.filter((p) => p.axe);
const pill = (cls, txt) => '<span class="pill ' + esc(cls) + '">' + esc(txt ?? cls) + '</span>';
const link = (u, t) => '<a href="' + esc(u) + '" target="_blank" rel="noopener">' + esc(t ?? u) + '</a>';
const scoreCls = (s) => (s == null ? '' : s >= 90 ? 'ok' : s >= 50 ? 'moderate' : 'critical');
const score = (s) => '<span class="score ' + scoreCls(s) + '">' + (s ?? '–') + '</span>';
const waveLink = (u) => link('https://wave.webaim.org/report#/' + encodeURIComponent(u), 'WAVE');
const table = (head, rows, numCols = []) => '<div class="panel scroll"><table><thead><tr>' +
  head.map((h, i) => '<th' + (numCols.includes(i) ? ' class="num"' : '') + '>' + esc(h) + '</th>').join('') + '</tr></thead><tbody>' +
  (rows.length ? rows.map((r) => '<tr>' + r.map((c, i) => '<td' + (numCols.includes(i) ? ' class="num"' : '') + '>' + c + '</td>').join('') + '</tr>').join('') : '<tr><td colspan="' + head.length + '" class="muted">None 🎉</td></tr>') +
  '</tbody></table></div>';

// ---- aggregations ----
const axeRules = {};
for (const p of okPages) for (const v of p.axe.violations) {
  const r = (axeRules[v.id] ||= { ...v, pages: [], nodes: 0 });
  r.pages.push({ url: p.url, count: v.count, nodes: v.nodes });
  r.nodes += v.count;
}
const axeList = Object.values(axeRules).sort((a, b) => IMPACTS.indexOf(a.impact) - IMPACTS.indexOf(b.impact) || b.pages.length - a.pages.length);
const impactNodes = Object.fromEntries(IMPACTS.map((i) => [i, axeList.filter((r) => r.impact === i).reduce((s, r) => s + r.nodes, 0)]));
const pagesWithBlocking = okPages.filter((p) => p.axe.violations.some((v) => v.impact === 'critical' || v.impact === 'serious')).length;

const structAgg = {};
for (const p of pages) for (const i of p.issues || []) (structAgg[i.id] ||= { ...i, pages: [] }).pages.push({ url: p.url, msg: i.msg });
const structList = Object.values(structAgg).sort((a, b) => ['error', 'warning', 'notice'].indexOf(a.severity) - ['error', 'warning', 'notice'].indexOf(b.severity) || b.pages.length - a.pages.length);

const htmlAgg = {};
for (const p of pages) for (const m of p.htmlValidation?.messages || []) {
  const r = (htmlAgg[m.rule] ||= { rule: m.rule, severity: m.severity, count: 0, pages: new Set(), example: m.message });
  r.count++; r.pages.add(p.url);
}
const htmlList = Object.values(htmlAgg).sort((a, b) => b.pages.size - a.pages.size);
const htmlErrors = pages.reduce((s, p) => s + (p.htmlValidation?.errors || 0), 0);

const lh = D.lighthouse.filter((l) => l.scores);
const avg = (k) => (lh.length ? Math.round(lh.reduce((s, l) => s + (l.scores[k] ?? 0), 0) / lh.length) : null);
const lhAgg = {};
for (const l of lh) for (const f of l.failing) (lhAgg[f.id] ||= { ...f, pages: 0 }).pages++;
const lhList = Object.values(lhAgg).sort((a, b) => b.pages - a.pages);

const waveErr = D.wave.results.reduce((s, w) => s + (w.categories?.error?.count || 0) + (w.categories?.contrast?.count || 0), 0);
const dur = Math.round((new Date(D.finished) - new Date(D.started)) / 1000);
document.getElementById('sub').innerHTML = (D.partial ? '<span class="pill warning">Partial report: run stopped with Ctrl+C</span> ' : '') + link(D.target) + ' · ' + new Date(D.started).toLocaleString() + ' · ' + Math.floor(dur / 60) + 'm ' + (dur % 60) + 's · ' + pages.length + ' pages audited';

// ---- sections ----
const S = {};

S.Overview = () => {
  const total = IMPACTS.reduce((s, i) => s + impactNodes[i], 0) || 1;
  const sec = D.site.security;
  return '<div class="cards">' +
    card(pages.length, 'Pages audited') +
    card(axeList.length, 'Distinct axe rules failing') +
    card(IMPACTS.reduce((s, i) => s + impactNodes[i], 0), 'Failing elements (axe)') +
    card(pagesWithBlocking + ' / ' + okPages.length, 'Pages with critical/serious') +
    card(D.links.broken.length, 'Broken links / pages') +
    card(htmlErrors, 'HTML validation errors') +
    (D.wave.enabled ? card(waveErr, 'WAVE errors + contrast') : '') +
    (lh.length ? [['performance', 'Lighthouse perf'], ['accessibility', 'Lighthouse a11y'], ['best-practices', 'Lighthouse best pr.'], ['seo', 'Lighthouse SEO']].map(([k, l]) => card(score(avg(k)), l + ' (avg)')).join('') : '') +
    '</div>' +
    '<h2>axe-core failing elements by impact</h2><div class="panel" style="padding:14px">' +
    IMPACTS.map((i) => pill(i, i + ': ' + impactNodes[i])).join(' ') +
    '<div class="bar">' + IMPACTS.map((i) => '<span style="width:' + (impactNodes[i] / total * 100) + '%;background:var(--' + i + ')"></span>').join('') + '</div></div>' +
    '<div class="two"><div><h2>Top accessibility problems</h2>' +
    table(['Rule', 'Impact', 'Pages'], axeList.slice(0, 10).map((r) => [esc(r.help) + '<br><code class="muted">' + esc(r.id) + '</code>', pill(r.impact), r.pages.length]), [2]) +
    '</div><div><h2>Top SEO / structure problems</h2>' +
    table(['Issue', 'Severity', 'Pages'], structList.slice(0, 10).map((r) => [esc(r.id), pill(r.severity), r.pages.length]), [2]) + '</div></div>' +
    '<h2>Site-level checks</h2>' +
    table(['Check', 'Result'], [
      ['robots.txt', D.discovery.robots.found ? pill('ok', 'found') : pill('warning', 'missing')],
      ['XML sitemap', D.discovery.sitemaps.length ? pill('ok', D.discovery.sitemaps.length + ' file(s), ' + D.discovery.sitemapUrlCount + ' URLs') : pill('warning', 'not found')],
      ['HTTP → HTTPS redirect', D.site.httpsRedirect ? pill('ok', 'yes') : pill('error', 'no')],
      ['Real 404 for missing pages', D.site.soft404 ? pill('error', 'soft 404 (returns 200)') : pill('ok', 'status ' + D.site.notFoundStatus)],
      ...Object.entries(sec).map(([k, v]) => [esc(k), v ? pill('ok', 'set') + ' <code class="muted">' + esc(v.slice(0, 120)) + '</code>' : pill('warning', 'missing')]),
      ['Mixed content', pages.some((p) => p.mixedContent?.length) ? pill('error', pages.filter((p) => p.mixedContent?.length).length + ' pages') : pill('ok', 'none')],
      ['Pages with JS console errors', pill(pages.some((p) => p.consoleErrors?.length) ? 'warning' : 'ok', pages.filter((p) => p.consoleErrors?.length).length)],
    ]) +
    '<h2>Still needs a human</h2><div class="panel" style="padding:4px 14px"><ul class="plain">' +
    ['Keyboard-only navigation: every control reachable, visible focus, no traps', 'Screen reader pass (VoiceOver / NVDA) on key journeys and forms', 'Meaningful alt text quality (tools only detect missing alt)', 'Captions / transcripts for video and audio', 'Error messages and form validation announced to assistive tech', 'Content readable at 200% zoom and with text spacing overrides', 'Motion / animation respects prefers-reduced-motion', 'axe "needs review" items (' + okPages.reduce((s, p) => s + p.axe.incomplete.length, 0) + ' across pages) — see Pages tab']
      .map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul></div>';
};
const card = (v, l) => '<div class="card"><div class="v">' + v + '</div><div class="l">' + esc(l) + '</div></div>';

S.Accessibility = () => '<h2>axe-core violations (' + D.options.axeTags.join(', ') + ')</h2><div class="panel">' +
  (axeList.length ? axeList.map((r) => '<details><summary>' + pill(r.impact) + '<strong class="grow">' + esc(r.help) + '</strong><code class="muted">' + esc(r.id) + '</code><span class="muted">' + r.pages.length + ' pages · ' + r.nodes + ' elements</span></summary><div class="det">' +
    '<p>' + esc(r.description) + ' ' + link(r.helpUrl, 'How to fix ↗') + '</p><p class="muted">' + r.wcag.map(esc).join(' · ') + '</p>' +
    r.pages.slice(0, 50).map((p) => '<details><summary><span class="url grow">' + esc(p.url) + '</span><span class="muted">' + p.count + ' elements</span></summary><div class="det">' +
      p.nodes.map((n) => '<p><code>' + esc(n.target) + '</code></p><pre>' + esc(n.html) + '</pre><pre class="muted">' + esc(n.summary) + '</pre>').join('') + '</div></details>').join('') +
    (r.pages.length > 50 ? '<p class="muted">…and ' + (r.pages.length - 50) + ' more pages (see report.json)</p>' : '') +
    '</div></details>').join('') : '<p style="padding:14px">No axe violations found 🎉</p>') + '</div>' +
  (D.wave.enabled ? waveSection() : '<h2>WAVE</h2><p class="muted">WAVE API not used (pass <code>--wave-key</code> or <code>WAVE_API_KEY</code>). Each page in the Pages tab links to its free WAVE web report.</p>');

const waveSection = () => '<h2>WAVE (WebAIM)</h2>' + table(['Page', 'Errors', 'Contrast', 'Alerts', 'Features', 'ARIA', 'Top errors'], D.wave.results.map((w) => w.error
  ? ['<span class="url">' + esc(w.url) + '</span>', pill('error', w.error), '', '', '', '', '']
  : ['<span class="url">' + link(w.waveUrl || w.url, w.url) + '</span>', w.categories.error?.count ?? 0, w.categories.contrast?.count ?? 0, w.categories.alert?.count ?? 0, w.categories.feature?.count ?? 0, w.categories.aria?.count ?? 0,
    [...(w.categories.error?.items || []), ...(w.categories.contrast?.items || [])].map((i) => esc(i.description) + ' ×' + i.count).join('<br>')]), [1, 2, 3, 4, 5]);

S.Pages = () => '<h2>All audited pages</h2><input type="search" id="pq" placeholder="Filter by URL…" aria-label="Filter pages by URL"><div class="panel" id="plist">' +
  pages.map((p) => {
    const c = Object.fromEntries(IMPACTS.map((i) => [i, 0]));
    (p.axe?.violations || []).forEach((v) => (c[v.impact] += v.count));
    const s = p.structure || {};
    return '<details data-url="' + esc(p.url) + '"><summary><span class="url grow">' + esc(p.url) + '</span>' +
      (p.error ? pill('error', 'audit failed') : IMPACTS.filter((i) => c[i]).map((i) => pill(i, i[0].toUpperCase() + ': ' + c[i])).join(' ') || pill('ok', 'no axe violations')) +
      '<span class="muted">' + (p.loadMs ?? '–') + ' ms · ' + (s.perf?.transferKB ?? '–') + ' KB</span></summary><div class="det">' + pageDetail(p) + '</div></details>';
  }).join('') + '</div>';

function pageDetail(p) {
  if (p.error) return '<p>' + pill('error', p.error) + '</p>';
  const s = p.structure;
  const lhr = D.lighthouse.find((l) => l.url === p.url);
  return '<p>' + link(p.url, 'Open page') + ' · ' + waveLink(p.url) + (lhr?.file ? ' · ' + link('lighthouse/' + lhr.file, 'Lighthouse report') : '') + ' · ' + (p.inSitemap ? 'in sitemap' : pill('notice', 'not in sitemap')) + '</p>' +
    '<div class="two"><div><h3>Document</h3>' + table(['Field', 'Value'], [
      ['Title', esc(s.title) + ' <span class="muted">(' + s.titleLength + ')</span>'], ['Meta description', esc(s.metaDescription || '—')],
      ['lang', esc(s.lang ?? '—')], ['Canonical', esc(s.canonical ?? '—')], ['Robots meta', esc(s.robotsMeta ?? '—')],
      ['Open Graph', esc(Object.entries(s.og).filter(([, v]) => v).map(([k]) => k).join(', ') || '—')], ['JSON-LD', esc(s.jsonLdTypes.join(', ') || '—')],
      ['Landmarks', Object.entries(s.landmarks).map(([k, v]) => pill(v ? 'ok' : 'warning', k)).join(' ')],
      ['Images', s.images + ' (' + s.imagesMissingAlt + ' no alt, ' + s.imagesEmptyAlt + ' decorative)'], ['Words / DOM nodes', s.wordCount + ' / ' + s.domNodes],
      ['TTFB / DCL / load', s.perf.ttfb + ' / ' + s.perf.domContentLoaded + ' / ' + s.perf.load + ' ms'], ['Requests / transfer', s.perf.requests + ' / ' + s.perf.transferKB + ' KB'],
    ]) + '</div><div><h3>Heading outline</h3><div class="panel" style="padding:8px 12px;max-height:340px;overflow:auto">' +
    (s.headings.map((h) => '<div style="padding-left:' + (h.level - 1) * 14 + 'px"><code class="muted">h' + h.level + '</code> ' + esc(h.text) + '</div>').join('') || '<span class="muted">No headings</span>') + '</div></div></div>' +
    '<h3>Structure / SEO findings</h3>' + table(['Severity', 'Issue'], (p.issues || []).map((i) => [pill(i.severity), esc(i.msg)])) +
    '<h3>axe violations</h3>' + table(['Impact', 'Rule', 'Elements'], p.axe.violations.map((v) => [pill(v.impact), esc(v.help) + ' ' + link(v.helpUrl, '↗') + '<br>' + v.nodes.slice(0, 3).map((n) => '<code class="muted">' + esc(n.target) + '</code>').join('<br>'), v.count]), [2]) +
    '<h3>axe needs review</h3>' + table(['Impact', 'Rule', 'Elements'], p.axe.incomplete.map((v) => [pill(v.impact || 'minor'), esc(v.help) + ' ' + link(v.helpUrl, '↗'), v.count]), [2]) +
    '<h3>HTML validation</h3>' + table(['Severity', 'Rule', 'Line', 'Message'], p.htmlValidation.messages.map((m) => [pill(m.severity), link('https://html-validate.org/rules/' + m.rule + '.html', m.rule), m.line, esc(m.message)])) +
    (p.consoleErrors.length ? '<h3>Console errors</h3>' + p.consoleErrors.map((e) => '<pre>' + esc(e) + '</pre>').join('') : '') +
    (p.failedRequests.length ? '<h3>Failed requests</h3>' + table(['Status', 'URL'], p.failedRequests.map((r) => [esc(r.status || r.error), '<span class="url">' + esc(r.url) + '</span>'])) : '') +
    (p.mixedContent.length ? '<h3>Mixed content</h3>' + p.mixedContent.map((u) => '<pre>' + esc(u) + '</pre>').join('') : '');
}

S.Lighthouse = () => !D.lighthouse.length ? '<p class="muted">Lighthouse not run (use <code>--lighthouse N</code>).</p>' :
  '<h2>Lighthouse (' + esc(D.options.device) + ') — ' + lh.length + ' pages</h2>' +
  table(['Page', 'Perf', 'A11y', 'Best pr.', 'SEO', 'LCP', 'TBT', 'CLS', 'Report'], D.lighthouse.map((l) => l.scores
    ? ['<span class="url">' + esc(l.url) + '</span>' + (l.runtimeError ? '<br>' + pill('error', l.runtimeError) : ''), score(l.scores.performance), score(l.scores.accessibility), score(l.scores['best-practices']), score(l.scores.seo), esc(l.metrics.LCP), esc(l.metrics.TBT), esc(l.metrics.CLS), link('lighthouse/' + l.file, 'open')]
    : ['<span class="url">' + esc(l.url) + '</span>', pill('error', l.error), '', '', '', '', '', '', '']), [1, 2, 3, 4]) +
  '<h2>Most common failing audits</h2>' + table(['Audit', 'Category', 'Pages', 'Example'], lhList.slice(0, 40).map((f) => [esc(f.title) + '<br><code class="muted">' + esc(f.id) + '</code>', esc(f.category), f.pages, esc(f.displayValue)]), [2]);

S['SEO & Structure'] = () => '<h2>Findings by type</h2><div class="panel">' +
  structList.map((r) => '<details><summary>' + pill(r.severity) + '<strong class="grow">' + esc(r.id) + '</strong><span class="muted">' + r.pages.length + ' pages</span></summary><div class="det">' +
    table(['Page', 'Detail'], r.pages.map((p) => ['<span class="url">' + esc(p.url) + '</span>', esc(p.msg)])) + '</div></details>').join('') + '</div>' +
  '<h2>Titles & descriptions</h2>' + table(['Page', 'Title', 'Meta description', 'H1'], pages.filter((p) => p.structure).map((p) => ['<span class="url">' + esc(p.url) + '</span>', esc(p.structure.title), esc(p.structure.metaDescription ?? '—'), p.structure.h1Count]), [3]) +
  dupes('Duplicate titles', (p) => p.structure?.title) + dupes('Duplicate meta descriptions', (p) => p.structure?.metaDescription);

function dupes(title, key) {
  const m = {};
  for (const p of pages) { const k = key(p); if (k) (m[k] ||= []).push(p.url); }
  const rows = Object.entries(m).filter(([, v]) => v.length > 1).map(([k, v]) => [esc(k), v.length, v.map((u) => '<div class="url">' + esc(u) + '</div>').join('')]);
  return '<h2>' + esc(title) + '</h2>' + table(['Value', 'Pages', 'URLs'], rows, [1]);
}

S.HTML = () => '<h2>HTML validation (html-validate: standard + document + WCAG rules) — ' + htmlErrors + ' errors</h2>' +
  table(['Rule', 'Severity', 'Pages', 'Occurrences', 'Example'], htmlList.map((r) => [link('https://html-validate.org/rules/' + r.rule + '.html', r.rule), pill(r.severity), r.pages.size, r.count, esc(r.example)]), [2, 3]) +
  '<p class="muted">Occurrence counts capped at 60 messages per page; see report.json for per-page detail.</p>';

S.Links = () => '<h2>Broken links & pages (' + D.links.broken.length + ')</h2>' +
  table(['URL', 'Status', 'Type', 'Found on'], D.links.broken.map((b) => ['<span class="url">' + esc(b.url) + '</span>', pill('error', b.status || b.error || 'error'), b.internal ? 'internal' : 'external', b.foundOn.slice(0, 5).map((u) => '<div class="url muted">' + esc(u) + '</div>').join('')])) +
  '<p class="muted">' + D.links.checked + ' URLs checked. Some sites (LinkedIn, Instagram…) block automated checks — verify 403/429/999 manually.</p>';

S.Discovery = () => {
  const d = D.discovery;
  return '<div class="cards">' + card(d.fetched.length, 'URLs fetched') + card(d.htmlPages.length, 'HTML pages') + card(d.sitemapUrlCount, 'Sitemap URLs') +
    card(d.notInSitemap.length, 'Pages missing from sitemap') + card(d.orphans.length, 'Orphans (sitemap only, no inbound link)') + card(d.skipped.robots.length, 'Skipped by robots.txt') + '</div>' +
    (d.pendingNotCrawled ? '<p>' + pill('warning', 'Crawl hit --max-pages; ' + d.pendingNotCrawled + ' queued URLs not visited') + '</p>' : '') +
    '<h2>Sitemaps</h2>' + table(['Sitemap', 'Type', 'Entries'], d.sitemaps.map((s) => [link(s.url), s.type, s.entries]), [2]) +
    '<h2>robots.txt</h2><pre>' + esc(d.robots.raw || '(none)') + '</pre>' +
    list('Orphan pages', d.orphans) + list('Pages not in sitemap', d.notInSitemap) + list('Skipped by robots.txt', d.skipped.robots) +
    '<h2>All fetched URLs</h2>' + table(['URL', 'Status', 'Source', 'Redirects to', 'Out links'], d.fetched.map((f) => ['<span class="url">' + esc(f.url) + '</span>', pill(f.status && f.status < 400 ? 'ok' : 'error', f.status || f.error || 'ERR'), esc(f.source), f.finalUrl !== f.url ? '<span class="url muted">' + esc(f.finalUrl) + '</span>' : '', f.outLinks]), [4]);
};
const list = (t, arr) => '<h2>' + esc(t) + ' (' + arr.length + ')</h2>' + (arr.length ? '<div class="panel" style="padding:8px 14px;max-height:300px;overflow:auto">' + arr.map((u) => '<div class="url">' + esc(u) + '</div>').join('') + '</div>' : '<p class="muted">None</p>');

// ---- tabs ----
const tabs = document.getElementById('tabs');
const main = document.getElementById('main');
const rendered = {};
function show(name) {
  for (const b of tabs.children) b.setAttribute('aria-selected', b.textContent === name);
  for (const s of main.children) s.hidden = s.dataset.tab !== name;
  if (!rendered[name]) {
    const sec = document.createElement('section');
    sec.dataset.tab = name;
    sec.innerHTML = S[name]();
    main.appendChild(sec);
    rendered[name] = true;
    if (name === 'Pages') sec.querySelector('#pq').addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase();
      for (const d of sec.querySelectorAll('#plist > details')) d.hidden = !d.dataset.url.toLowerCase().includes(q);
    });
  }
  try { localStorage.setItem('tab', name); } catch {}
}
for (const name of Object.keys(S)) {
  const b = document.createElement('button');
  b.type = 'button'; b.role = 'tab'; b.textContent = name;
  b.onclick = () => show(name);
  tabs.appendChild(b);
}
let saved; try { saved = localStorage.getItem('tab'); } catch {}
show(S[saved] ? saved : 'Overview');
document.getElementById('theme').onclick = () => {
  const dark = document.documentElement.dataset.theme ? document.documentElement.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.theme = dark ? 'light' : 'dark';
};
</script>
</body>
</html>`;
}
