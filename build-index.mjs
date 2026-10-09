// Builds <dir>/index.html listing every report in <dir>/reports, newest first,
// and deletes all but the newest <keep> reports.
import { readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const [dir, keep = '30'] = process.argv.slice(2);
const reportsDir = path.join(dir, 'reports');
const rows = [];
for (const name of await readdir(reportsDir).catch(() => [])) {
  try {
    const d = JSON.parse(await readFile(path.join(reportsDir, name, 'report.json'), 'utf8'));
    const pages = d.pages.filter(Boolean);
    const lh = d.lighthouse.filter((l) => l.scores);
    const avg = (k) => (lh.length ? Math.round(lh.reduce((s, l) => s + (l.scores[k] ?? 0), 0) / lh.length) : '–');
    rows.push({
      name, target: d.target, started: d.started, partial: d.partial, pages: pages.length,
      axe: pages.reduce((s, p) => s + (p.axe?.violations.reduce((n, v) => n + v.count, 0) || 0), 0),
      broken: d.links.broken.length, perf: avg('performance'), a11y: avg('accessibility'),
    });
  } catch {} // skip folders without a readable report.json
}
rows.sort((a, b) => b.started.localeCompare(a.started));
for (const r of rows.splice(Number(keep))) await rm(path.join(reportsDir, r.name), { recursive: true });

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
await writeFile(path.join(dir, 'index.html'), `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Site audits</title>
<style>
:root { --bg: #f7f7f5; --surface: #fff; --text: #1c1c1a; --muted: #66645e; --border: #e2e0db; --accent: #2f5bd3; }
@media (prefers-color-scheme: dark) { :root { --bg: #141413; --surface: #1d1d1b; --text: #ecebe7; --muted: #a3a19a; --border: #34332f; --accent: #7b9cff; } }
body { margin: 0; background: var(--bg); color: var(--text); font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
main { max-width: 1100px; margin: 0 auto; padding: 28px 16px; }
a { color: var(--accent); }
.panel { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; overflow-x: auto; }
table { width: 100%; border-collapse: collapse; }
th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--border); }
th { color: var(--muted); font-size: 12px; }
td.n, th.n { text-align: right; font-variant-numeric: tabular-nums; }
tr:last-child td { border-bottom: 0; }
</style></head><body><main>
<h1>Site audits</h1>
<p style="color:var(--muted)">Run a new audit from the repo's Actions tab → "Site audit" → Run workflow. Newest ${esc(keep)} reports kept.</p>
<div class="panel"><table><thead><tr><th>Site</th><th>Run (UTC)</th><th class="n">Pages</th><th class="n">axe elements</th><th class="n">Broken links</th><th class="n">LH perf</th><th class="n">LH a11y</th></tr></thead><tbody>
${rows.map((r) => `<tr><td><a href="reports/${esc(r.name)}/report.html">${esc(new URL(r.target).hostname)}</a>${r.partial ? ' (partial)' : ''}</td><td>${esc(r.started.slice(0, 16).replace('T', ' '))}</td><td class="n">${r.pages}</td><td class="n">${r.axe}</td><td class="n">${r.broken}</td><td class="n">${r.perf}</td><td class="n">${r.a11y}</td></tr>`).join('\n') || '<tr><td colspan="7">No reports yet</td></tr>'}
</tbody></table></div></main></body></html>
`);
console.log(`index.html: ${rows.length} reports`);
