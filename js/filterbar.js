'use strict';
// The global search box and Reset button. The box filters People and Actions; Notes has its own search.

let globalFilterSearch = ''

function wireFilterbar() {
  const search = document.getElementById('global-filter-search')
  const reset = document.getElementById('global-filter-reset')
  search.value = globalFilterSearch
  search.addEventListener('input', () => {
    globalFilterSearch = search.value
    renderPeople()
    renderActions()
  })
  reset.addEventListener('click', () => {
    // No confirm dialog on purpose: this only clears view filters — nothing
    // here is destructive enough to need a second click to approve.
    globalFilterSearch = ''
    search.value = ''
    peopleFilters = { exec: false, incomplete: false, ownerFilter: '' }
    peopleFilterPanelOpen = false
    peoplePage = 0
    actionsStatusFilter = 'open-progress'
    notesFilterFrom = ''
    notesFilterTo = ''
    notesSearch = ''
    notesPage = 0
    renderPeople()
    renderActions()
    renderNotes()
    showToast('Filters reset')
  })
}
