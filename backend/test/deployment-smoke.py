"""Run after Docker Compose is healthy. Synthetic documents only; no external AI."""
import io
import json
import runpy
import sys
import urllib.request
import zipfile
from pathlib import Path

base = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8080'
fixtures = runpy.run_path(str(Path(__file__).with_name('document-parser.test.py')))


def call(path, body=None, token=None, filename=None):
    headers = {}
    if token:
        headers['X-Session-Token'] = token
    if filename:
        headers.update({'Content-Type': 'application/octet-stream', 'X-File-Name': filename})
    elif body is not None:
        headers['Content-Type'] = 'application/json'
        body = json.dumps(body).encode()
    with urllib.request.urlopen(urllib.request.Request(base+path, data=body, headers=headers), timeout=25) as response:
        return json.load(response)['data']


assert call('/api/health')['aiMode'] == 'demo-rule-based', 'This script must not call a real AI'
token = call('/api/session', {})['sessionToken']
try:
    samples = {'txt': '가상 경험'.encode(), 'hwp': fixtures['hwp_fixture']()}
    for ext, name in [('hwpx', 'Contents/section0.xml'), ('docx', 'word/document.xml')]:
        stream = io.BytesIO()
        with zipfile.ZipFile(stream, 'w') as archive:
            archive.writestr(name, '<root><p><t>가상 경험</t></p></root>')
        samples[ext] = stream.getvalue()
    writer = fixtures['PdfWriter']()
    page = writer.add_blank_page(width=300, height=300)
    D, N, S = fixtures['DictionaryObject'], fixtures['NameObject'], fixtures['DecodedStreamObject']
    font = D({N('/Type'): N('/Font'), N('/Subtype'): N('/Type1'), N('/BaseFont'): N('/Helvetica')})
    page[N('/Resources')] = D({N('/Font'): D({N('/F1'): writer._add_object(font)})})
    content = S(); content.set_data(b'BT /F1 12 Tf 20 200 Td (Synthetic experience) Tj ET')
    page[N('/Contents')] = writer._add_object(content)
    stream = io.BytesIO(); writer.write(stream); samples['pdf'] = stream.getvalue()
    for ext, raw in samples.items():
        result = call('/api/documents/extract', raw, token, 'synthetic.'+ext)
        assert result['text'].strip() and result['stored'] is False
        print(ext.upper()+': extraction passed through frontend proxy and Docker backend')
    signs = call('/api/signs?keyword=%EA%B2%BD%ED%97%98')
    assert signs['items'] and signs['items'][0]['mediaUsage'] == 'source-link-only'
    print('Source-backed sign reference: passed')
finally:
    call('/api/session/end', {}, token)
