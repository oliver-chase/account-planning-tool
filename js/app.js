'use strict';
// Which sections exist (SECTIONS) and what a full render renders (renderAll). js/app-shell.js
// loads after this file and does the wiring.

const SECTIONS = [
  ['overview', 'Plan'],
  ['people', 'People'],
  ['actions', 'Actions'],
  ['notes', 'Notes'],
]

function renderAll() {
  renderHelpBanner()
  renderStartScreen()
  renderAccountHeader()
  renderOverview()
  renderPeople()
  renderActions()
  renderNotes()
  updateActiveNav()
}
