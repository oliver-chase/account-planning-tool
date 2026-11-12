'use strict';
// Org chart picture: renders the live chart's own code off-screen at a fixed width, then
// saves it as a standalone HTML page.

const ORG_EXPORT_CSS = `
:root{--color-brand-primary:${BRAND.primary};--color-brand-accent:${BRAND.accent};--color-text-primary:#1a1a1a;
--color-text-secondary:#4a4a4e;--color-border:#e0e0e2;--color-bg-page:#f5f5f6;--color-bg-card:#fff;
--font-family-base:${BRAND.fontFamily};--radius-lg:12px;--org-node-w:220px;
--org-node-h-min:96px}
*{box-sizing:border-box}
body{font-family:var(--font-family-base);background:var(--color-bg-page);color:var(--color-text-primary);margin:0;padding:40px}
h1{font-size:22px;margin:0 0 4px}
.meta{color:var(--color-text-secondary);font-size:12px;margin-bottom:24px}
.org-chart-outer{position:relative;overflow-x:auto;padding:16px;background:var(--color-bg-card);border:1px solid var(--color-border);border-radius:var(--radius-lg)}
.org-section-title{font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--color-text-secondary);margin-bottom:8px}
.org-tree{display:inline-flex;flex-direction:column;align-items:center;min-width:100%;padding-bottom:16px}
.org-tree-layout{display:flex;flex-direction:row;gap:48px;align-items:flex-start;padding:16px}
.org-branch{display:flex;flex-direction:column;align-items:center;position:relative;flex-shrink:0}
.org-node-card{width:var(--org-node-w);min-height:var(--org-node-h-min);box-sizing:border-box;background:#fff;border:1px solid var(--color-border);border-radius:var(--radius-lg);padding:10px 12px;position:relative}
.org-node-card--internal{border-color:${BRAND.internal};border-width:2px}
.org-node-card--contractor{border-color:${BRAND.contractor};border-width:2px}
.org-node-header-row{display:flex;align-items:center;gap:8px;min-width:0}
.org-node-name{font-size:14px;font-weight:600;color:var(--color-text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;min-width:0}
.org-node-meta{font-size:12px;color:var(--color-text-secondary);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.org-children{display:flex;gap:12px;padding-top:24px}
.org-lines{position:absolute;top:0;left:0;pointer-events:none;overflow:visible}
.org-empty-hint{font-size:14px;color:var(--color-text-secondary);font-style:italic;padding:8px 0}
.org-zone2-drop{border:1.5px dashed var(--color-border);border-radius:var(--radius-lg);padding:16px;margin-top:24px}
.org-dept-label{font-size:12px;font-weight:700;color:var(--color-brand-primary);margin:4px 0 2px;letter-spacing:.05em;text-transform:uppercase}
.org-unmapped-nodes{display:flex;flex-wrap:wrap;gap:8px;padding-top:4px}
`

// The whole chart as a standalone page, drawn by the live chart's own code in an off-screen host
// of fixed width so the layout is the same every time.
function downloadOrgChart() {
  const host = document.createElement('div')
  host.style.position = 'fixed'
  host.style.left = '-99999px'
  host.style.top = '0'
  host.style.width = '1200px'
  document.body.appendChild(host)

  const { outer, tree } = buildOrgChartOuter(true)
  host.appendChild(outer)
  drawOrgLines(outer, tree)
  const chartHtml = outer.outerHTML
  document.body.removeChild(host)

  const acctName = state.account.account_name || 'Account'
  const html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>' + escHtml(acctName) + ' Org Chart</title><style>' + ORG_EXPORT_CSS +
    '@page{size:landscape}@media print{.org-chart-outer{overflow:visible}}</style></head><body>' +
    '<h1>' + escHtml(acctName) + ' — Org Chart</h1>' +
    '<p class="meta">' + escHtml(fmtDate(today())) + '&nbsp;&nbsp;&bull;&nbsp;&nbsp;Read-only snapshot. Edits made after this export are not reflected here.</p>' +
    chartHtml + '</body></html>'
  downloadHtml(html, slugify(acctName) + '-org-chart-' + today() + '.html')
  showToast('Org chart downloaded')
}
