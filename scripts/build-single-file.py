#!/usr/bin/env python3
"""Bundles index.html, css/*.css and js/*.js into account-planning-tool.html, one self-contained
file that can be downloaded and opened on its own. Run it after any change to the source.

    python3 scripts/build-single-file.py          # rebuild the file
    python3 scripts/build-single-file.py --check  # fail if the tracked file is out of date
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
INDEX, OUTPUT = ROOT / 'index.html', ROOT / 'account-planning-tool.html'

def read(name):
    return (ROOT / name).read_text(encoding='utf-8')

def build():
    html = read('index.html')
    html = re.sub(r'<link rel="stylesheet" href="([^"]+)">', lambda m: '<style>\n' + read(m.group(1)) + '\n</style>', html)
    def script(m):
        js = read(m.group(1))
        if '</script' in js:
            raise SystemExit(f'{m.group(1)} contains a literal </script sequence, cannot inline it')
        return '<script>\n' + js + '\n</script>'
    html = re.sub(r'<script src="([^"]+)"></script>', script, html)
    if re.search(r'<link rel="stylesheet"|<script src=', html):
        raise SystemExit('bundling left a stylesheet or script unbundled')
    return html

if __name__ == '__main__':
    html = build()
    if '--check' in sys.argv:
        if not OUTPUT.exists() or OUTPUT.read_text(encoding='utf-8') != html:
            raise SystemExit('account-planning-tool.html is out of date: run python3 scripts/build-single-file.py')
        print('built page is up to date')
    else:
        OUTPUT.write_text(html, encoding='utf-8')
        print(f'wrote {OUTPUT.name} ({OUTPUT.stat().st_size:,} bytes)')
