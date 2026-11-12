#!/usr/bin/env python3
"""Writes tests/fixtures/excel-dates.xlsx by hand, the way Excel stores dates: a number plus a
date number format. SheetJS did not write it, so it exercises the import path real files use.
Run: python3 tests/fixtures/make-excel-fixture.py"""
import zipfile
from datetime import date
from pathlib import Path

def serial(d): return (d - date(1899, 12, 30)).days
def text(ref, s): return f'<c r="{ref}" t="inlineStr"><is><t>{s}</t></is></c>'
def day(ref, d): return f'<c r="{ref}" s="1"><v>{serial(d)}</v></c>'

overview = ['<row r="1">' + text('A1', 'Field') + text('B1', 'Value') + '</row>',
            '<row r="2">' + text('A2', 'Account Name') + text('B2', 'Date Fixture Co') + '</row>']
actions = ['<row r="1">' + ''.join(text(c + '1', h) for c, h in zip('ABCD', ['Description', 'Owner', 'Status', 'DueDate'])) + '</row>',
           '<row r="2">' + text('A2', 'Send deck') + text('B2', 'Ada') + text('C2', 'Open') + day('D2', date(2026, 11, 20)) + '</row>',
           '<row r="3">' + text('A3', 'Book review') + text('B3', 'Bo') + text('C3', 'Open') + day('D3', date(2026, 1, 1)) + '</row>']
def sheet(rows): return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' + ''.join(rows) + '</sheetData></worksheet>'

files = {
 '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
 '_rels/.rels': '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
 'xl/workbook.xml': '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Overview" sheetId="1" r:id="rId1"/><sheet name="Actions" sheetId="2" r:id="rId2"/></sheets></workbook>',
 'xl/_rels/workbook.xml.rels': '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
 'xl/styles.xml': '<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>',
 'xl/worksheets/sheet1.xml': sheet(overview),
 'xl/worksheets/sheet2.xml': sheet(actions),
}
out = Path(__file__).with_name('excel-dates.xlsx')
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    for name, body in files.items(): z.writestr(name, body)
print('wrote', out, out.stat().st_size, 'bytes')
