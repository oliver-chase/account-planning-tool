'use strict';
// The Export menu and the HTML escape the generated pages share.

function escHtml(s) { return (s || '').toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }

// The entries of the one Export menu.
function exportMenuEntries() {
  return [
    { label: 'Call summary', text: 'The last call, open actions by owner and what was finished this week.', open: () => openCallSummary() },
    { label: 'Org chart picture', text: 'The whole reporting chart as a page you can print or send.', open: () => downloadOrgChart() },
  ]
}

function openExportMenu() {
  showModal({ title: 'Export', hideActions: true, bodyBuilder: (body, close) => {
    exportMenuEntries().forEach(({ label, text, open }) => {
      const b = el('button', 'export-menu-item', null); b.type = 'button'
      b.appendChild(el('span', 'export-menu-title', label)); b.appendChild(el('span', 'export-menu-text', text))
      b.addEventListener('click', () => { close(); setTimeout(open, 0) })
      body.appendChild(b)
    })
  } })
}
