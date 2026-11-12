'use strict';
// On-page instructions, reachable any time via the sidebar's How-to guide button. They open only
// on request, and closing them sets an in-memory flag that a reload resets.

let helpForcedOpen = false

function renderHelpBanner() {
  const slot = document.getElementById('help-banner-slot')
  slot.innerHTML = ''
  if (!helpForcedOpen) return

  const card = el('div', 'app-card help-card', null)
  const headerRow = el('div', 'flexRow help-header', null)
  headerRow.appendChild(el('span', 'app-card-label', 'How-to guide'))

  const closeBtn = el('button', 'app-modal-close help-close', '×')
  closeBtn.type = 'button'
  closeBtn.setAttribute('aria-label', 'Dismiss instructions')
  closeBtn.addEventListener('click', () => { helpForcedOpen = false; renderHelpBanner() })
  headerRow.appendChild(closeBtn)
  card.appendChild(headerRow)

  // Each bullet: a bold lead-in names the step, then short sentences say what to do and why.
  const bullets = [
    ['Start', 'A new account offers three ways in. Start a new account, open an Excel file you already keep, or try a sample account and discard it later with New blank workbook in the sidebar. The start screen also downloads a blank workbook and a sample workbook'],
    ['Check who is on the call', 'Read the Plan page. Open People to see the org chart. Drag a card onto another to set who reports to whom. More fields on a card shows sentiment, owners, engagement, worker type and the executive flag'],
    ['Capture the call', 'Add actions with an owner and a due date. Write the call into Notes. Everything you type saves in this browser right away. Deleting an action shows Undo for a few seconds, and deleting a person or note asks you to confirm'],
    ['Send the recap', 'Click Export, then Call summary. Copy the text into an email, or download it as a page. Export also makes a picture of the org chart'],
    ['Save your work to the file', 'Click Update Excel. In Chrome and Edge it writes into your workbook. In Safari and Firefox it downloads a new file, so replace your working copy with it'],
    ['Come back next time', 'Open the file again. Chrome and Edge reconnect your workbook and may ask permission. Edits you had not saved yet are kept, and Connect Excel file loads the workbook over them if you want that'],
    ['Remember where the record lives', 'Your autosave exists only in this browser. Click Update Excel before you close it, because the workbook is the record'],
  ]
  const list = el('ul', 'howto-list', null)
  bullets.forEach(([lead, rest]) => {
    const li = el('li', 'fontXs textSecondary', null)
    li.appendChild(el('strong', null, lead + ': '))
    li.appendChild(document.createTextNode(rest))
    list.appendChild(li)
  })
  card.appendChild(list)
  slot.appendChild(card)
}

function toggleHelp() {
  helpForcedOpen = !helpForcedOpen
  renderHelpBanner()
}
