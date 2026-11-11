"""Bounded text-only extraction. Bytes arrive on stdin; no file is saved or executed."""
import io
import json
import re
import struct
import sys
import zipfile
import zlib

MAX_FILE = 5 * 1024 * 1024
MAX_EXPANDED = 16 * 1024 * 1024
MAX_TEXT = 10000

if sys.platform != 'win32':
    import resource
    resource.setrlimit(resource.RLIMIT_AS, (384 * 1024 * 1024, 384 * 1024 * 1024))
    resource.setrlimit(resource.RLIMIT_CPU, (12, 12))


def hwp_paragraph(data):
    # HWP 5 paragraph controls are either one UTF-16 unit or eight units.
    out, i = [], 0
    while i + 2 <= len(data):
        char = struct.unpack_from('<H', data, i)[0]
        if char < 32:
            if char in (10, 13):
                out.append('\n')
            elif char == 9:
                out.append(' ')
            i += 16 if char in (*range(1, 10), 11, 12, *range(14, 24)) else 2
        else:
            out.append(data[i:i+2].decode('utf-16le', errors='replace'))
            i += 2
    return ''.join(out)


def extract(raw, extension):
    if not raw or len(raw) > MAX_FILE:
        raise ValueError('FILE_SIZE')
    if extension == 'txt':
        return raw.decode('utf-8-sig'), []
    if extension == 'pdf':
        from pypdf import PdfReader
        if not raw.startswith(b'%PDF-'):
            raise ValueError('FILE_SIGNATURE')
        reader = PdfReader(io.BytesIO(raw), strict=False)
        if reader.is_encrypted:
            raise ValueError('ENCRYPTED_DOCUMENT')
        if len(reader.pages) > 50:
            raise ValueError('TOO_MANY_PAGES')
        parts, size = [], 0
        for page in reader.pages:
            part = page.extract_text() or ''
            size += len(part)
            if size > MAX_EXPANDED:
                raise ValueError('EXPANDED_LIMIT')
            parts.append(part)
        return '\n'.join(parts), ['PDF_LAYOUT_REVIEW']
    if extension in ('hwpx', 'docx'):
        from defusedxml import ElementTree
        if not raw.startswith(b'PK'):
            raise ValueError('FILE_SIGNATURE')
        with zipfile.ZipFile(io.BytesIO(raw)) as archive:
            entries = archive.infolist()
            if len(entries) > 1000 or sum(x.file_size for x in entries) > MAX_EXPANDED:
                raise ValueError('EXPANDED_LIMIT')
            if any(x.flag_bits & 1 for x in entries):
                raise ValueError('ENCRYPTED_DOCUMENT')
            pattern = r'Contents/section\d+\.xml' if extension == 'hwpx' else r'word/document\.xml'
            names = sorted(x.filename for x in entries if re.fullmatch(pattern, x.filename))
            if not names:
                raise ValueError('FILE_SIGNATURE')
            parts = []
            for name in names:
                root = ElementTree.fromstring(archive.read(name))
                for paragraph in root.iter():
                    if paragraph.tag.split('}')[-1] == 'p':
                        parts.append(''.join(x.text or '' for x in paragraph.iter() if x.tag.split('}')[-1] == 't'))
            return '\n'.join(parts), ['TABLE_ORDER_REVIEW']
    if extension == 'hwp':
        import olefile
        if not olefile.isOleFile(io.BytesIO(raw)):
            raise ValueError('FILE_SIGNATURE')
        with olefile.OleFileIO(io.BytesIO(raw)) as ole:
            header = ole.openstream('FileHeader').read(256)
            if not header.startswith(b'HWP Document File') or len(header) < 40:
                raise ValueError('UNSUPPORTED_HWP_VERSION')
            flags = struct.unpack_from('<I', header, 36)[0]
            if flags & 6:
                raise ValueError('ENCRYPTED_OR_DISTRIBUTION_HWP')
            sections = sorted((x for x in ole.listdir() if len(x) == 2 and x[0] == 'BodyText' and re.fullmatch(r'Section\d+', x[1])), key=lambda x: int(x[1][7:]))
            if not sections or len(sections) > 100:
                raise ValueError('INVALID_HWP')
            parts, total = [], 0
            for name in sections:
                if ole.get_size(name) > MAX_EXPANDED:
                    raise ValueError('EXPANDED_LIMIT')
                data = ole.openstream(name).read()
                if flags & 1:
                    decoder = zlib.decompressobj(-15)
                    data = decoder.decompress(data, MAX_EXPANDED + 1)
                    if len(data) > MAX_EXPANDED or not decoder.eof:
                        raise ValueError('EXPANDED_LIMIT')
                total += len(data)
                if total > MAX_EXPANDED:
                    raise ValueError('EXPANDED_LIMIT')
                i = 0
                while i < len(data):
                    if i + 4 > len(data):
                        raise ValueError('INVALID_HWP')
                    record = struct.unpack_from('<I', data, i)[0]
                    i += 4
                    size = record >> 20
                    if size == 4095:
                        if i + 4 > len(data):
                            raise ValueError('INVALID_HWP')
                        size = struct.unpack_from('<I', data, i)[0]
                        i += 4
                    if i + size > len(data):
                        raise ValueError('INVALID_HWP')
                    if record & 1023 == 67:
                        parts.append(hwp_paragraph(data[i:i+size]))
                    i += size
            return '\n'.join(parts), ['HWP5_TEXT_ONLY', 'TABLE_ORDER_REVIEW']
    raise ValueError('UNSUPPORTED_FILE_TYPE')


if __name__ == '__main__':
    try:
        text, warnings = extract(sys.stdin.buffer.read(MAX_FILE + 1), sys.argv[1])
        text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', '', text).strip()
        if not text:
            raise ValueError('NO_TEXT_OCR_REQUIRED')
        truncated = len(text) > MAX_TEXT
        print(json.dumps({'text': text[:MAX_TEXT], 'truncated': truncated, 'warnings': warnings}, ensure_ascii=True))
    except Exception as error:
        safe = str(error) if isinstance(error, ValueError) and re.fullmatch('[A-Z_]+', str(error)) else 'DOCUMENT_PARSE_FAILED'
        print(json.dumps({'error': safe}))
        sys.exit(1)
