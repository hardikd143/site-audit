# site-audit

One command: discover every URL on a site, audit every page, get one report.

```bash
npm install                      # also downloads Playwright Chromium
node audit.mjs example.com       # → reports/example.com-<timestamp>/report.html
```

## What it does

1. **Discovery** — `robots.txt` (Disallow + Sitemap lines), `sitemap.xml` / `sitemap_index.xml` (nested, gzipped), then a Playwright crawl of rendered links (catches JS-built nav). Writes `urls.txt`.
2. **Per page** (Playwright)
   - **axe-core** — WCAG 2.0/2.1/2.2 A+AA + best-practice; violations with selectors/HTML, plus "needs review" items
   - **Structure/SEO** — title, meta description, lang, viewport/zoom blocking, canonical, robots meta, Open Graph, JSON-LD, h1 count, heading outline + skipped levels, landmarks, skip link, alt text, generic link text, duplicate ids, positive tabindex, autoplay, 320px reflow (WCAG 1.4.10), word count, DOM size
   - **HTML validation** — html-validate (spec + document + WCAG technique rules) on raw server HTML
   - Console errors, failed requests, mixed content, load timing, request count, transfer size
3. **Links** — every internal + external href status-checked, with "found on" pages
4. **Site** — security headers, HTTP→HTTPS redirect, soft-404 check
5. **WAVE** — WebAIM API if you pass a key (paid credits); otherwise each page links to its free WAVE report
6. **Lighthouse** — performance / accessibility / best practices / SEO on every page (or a sample with `--lighthouse N`: homepage + one page per section), full Lighthouse HTML per page

## Output

`report.html` (tabbed, filterable, light/dark) · `report.json` (everything) · `issues.csv` (one row per issue, for spreadsheets/Jira) · `urls.txt` · `lighthouse/*.html`

## Options

```
--max-pages <n>         default 500
--concurrency <n>       default 4
--lighthouse <n|all|0>  default all (~20s per page, sequential for stable scores)
--device mobile|desktop Lighthouse form factor (default mobile)
--wave-key <key>        or env WAVE_API_KEY
--wave-max <n>          default 25 (each page costs WAVE credits)
--ignore-robots         crawl robots-disallowed paths
--skip-external         don't status-check external links
--discover-only         stop after writing urls.txt
--out <dir>
```

Automated tools catch roughly a third of WCAG issues. The report's "Still needs a human" list covers the rest (keyboard, screen reader, alt-text quality, captions).

## Hosted (GitHub Actions + Pages)

Repo → **Actions** → **Site audit** → **Run workflow** → enter URL. When it finishes, the run summary links the report:

- All reports: `https://hardikd143.github.io/site-audit/`
- Each run also uploads the report folder as a downloadable artifact (30 days)
- WAVE: add repo secret `WAVE_API_KEY` (Settings → Secrets → Actions) to enable
- Newest 30 reports are kept on Pages; the `gh-pages` branch is rewritten each run so it doesn't grow
