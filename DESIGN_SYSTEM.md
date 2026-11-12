# Design system

The components and tokens every section is built from. Check here before adding a button, card or picker, because one of these almost always fits.

## Tokens

Colors, sizes and spacing are CSS custom properties in `css/tokens.css`. Screens reference them with `var(--name)` and never write a hex color. Three SVG icons (search, sort and the popover chevron) carry their grey inside the data URI, because a data URI cannot read a custom property. Pages the tool generates for download (the call summary and the org chart picture) are standalone files, so they read their brand colors and font from `js/brand.js` and carry their own CSS for neutral greys. The call summary page uses the brand font and the org chart picture uses the brand colors too. `tests/design-rules.js` checks that screen scripts hold no hex color, and `tests/neutral-defaults.js` checks that `js/brand.js` and `css/tokens.css` agree.

To rebrand, change the brand values in `css/tokens.css` and `js/brand.js` together. `tests/neutral-defaults.js` checks that they agree.

## Typography

- Body text uses `var(--font-family-base)`, `var(--font-size-sm)` and `var(--line-height-base)`
- Section headlines use `.app-section-title`
- Each component styles its own small and secondary text, such as `.app-card-label` and `.note-date`. The `fontXs` and `textSecondary` classes in `css/local.css` serve the How-to guide and the org chart

## Color

- Brand accent, pink (`--color-brand-accent`), marks primary actions and the active nav item. The active view toggle is navy
- Brand primary, navy (`--color-brand-primary`), is the sidebar background, the closed revenue bars and the selected day button
- Sentiment dots use `--color-sentiment-*`, and worker-type dots use `--color-worker-*`

## Buttons

| Component | Use | Example |
|---|---|---|
| `inlineActionButton(label, onClick, opts)` | The one primary add action in a section header | Add person, Add action |
| `.module-filter-chip` (`.on` when active) | A two-state view toggle | Filters |
| `singleSelectEl(..., 'sort-select')` | Sort order and filter by value | Newest first, Overdue |
| `.app-view-toggle-btn` (`.active`) | Two full views of the same data | Cards, Org |
| `compactRemoveButton(title, onClick, extraClass)` | Delete or discard, always the `×` | Every card's delete button |
| `.btn` with `.btn-primary`, `.btn-ghost` or `.btn-danger` | Modal confirm and cancel, and actions outside a section header | Copy text, Cancel |
| `.app-sidebar-item` | Sidebar navigation and file actions | Export, Update Excel |


## Pickers

Every dropdown is a popover (`openPopover` in `js/pickers.js`): a trigger button plus a positioned list with hover and selected states. No screen uses a native `<select>`.

- `personSelectEl(value, onChange, className)` picks one person for Account Director, Account Manager, owners and action owners. "+ Add new…" adds the typed name to the team pool, so every other picker offers it at once
- `multiPicker(allNames, selectedNames, onChange, placeholder)` picks several people, shown as chips (`appChip`). It serves the account team, note attendees and meeting attendees
- `singleSelectEl(options, selected, onChange, className)` picks one value from a fixed list, such as status, tier, cadence, sentiment and sort order

"+ Add new…" turns into a text input in place. Enter submits and Escape or blur cancels.

Use these three for every person and every fixed-list field. A second hand-built picker would miss the add-new row, which a first-use account needs before anyone can be picked. `.card-owner-btn` is the pill style for single-value pickers, and each one has a visible label beside it.

## Cards and rows

- `.app-card` is the shell for Plan page cards. `.person-card` and `.note-card` carry the same background, border and radius in `css/accounts.css` and add their own layout
- `.card-meta-row` is a tight row that belongs with the row above it, and `.card-meta-row--spaced` starts a new idea with `--spacing-md` above
- Empty states use `emptyResultsBox(text)`
- People and notes are cards, and Actions is a table, because Actions rows are short and single-line

## Editing and keyboard

- `editable(tag, className, value, placeholder, onSave, opts)` makes a field that saves on blur and only when the text changed. `multiline` keeps line breaks, and `alwaysSave` is for new-item cards
- `makeActivatable(node, label, onActivate)` puts a clickable element in the tab order so Enter and Space work
- `deleteWithUndo(listKey, item, label, rerender)` deletes now and offers Undo
- New-item cards stay open while the user works in them (`newCardInUse`) and ignore a blur after Discard

## Modals and toasts

`showModal(opts)` builds every dialog, with `bodyBuilder` for custom content. `showToast(message, actionLabel, onAction)` confirms an action and carries Undo.

## Exceptions

- The selected day button uses navy because it is a quiet calendar toggle
- The Clear link in the cadence panel is muted grey because it resets a value
- The org chart zoom buttons take their style from the `.org-zoom-controls` container
- Pagination buttons use a bare `.btn.btn--compact`, since paging is neither primary nor destructive
- The cadence controls share the Meeting cadence heading and carry no captions of their own

## Open gap

The Actions filter reuses the `sort-select` style for a filter by value. A dedicated filter component is worth adding if a second filter appears.
