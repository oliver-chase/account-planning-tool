'use strict';
// The one place that names the product's look in generated pages. Exported pages are
// standalone files, so they read these values. To rebrand, change
// them here and in css/tokens.css (--color-brand-primary is primary, --color-brand-accent is
// accent); tests/neutral-defaults.js checks that the two agree.
const BRAND = {
  primary: '#1f2a44',
  accent: '#dc0170',
  internal: '#3d4f8f', // border of internal-staff cards on the org chart page
  contractor: '#b86c0a', // border of contractor cards
  fontFamily: "'Aptos',system-ui,-apple-system,sans-serif",
}
