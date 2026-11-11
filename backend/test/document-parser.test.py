import importlib.util
import io
import struct
import unittest
import zipfile
from pathlib import Path
from pypdf import PdfWriter
from pypdf.generic import DictionaryObject, NameObject, DecodedStreamObject

spec = importlib.util.spec_from_file_location('parser', Path(__file__).parents[1] / 'scripts/extract-document.py')
parser = importlib.util.module_from_spec(spec)
spec.loader.exec_module(parser)


def hwp_fixture(flags=0):
    # Minimal synthetic OLE/HWP5 fixture. No real applicant document is committed.
    free, end = 0xffffffff, 0xfffffffe
    header = bytearray(512)
    header[:8] = bytes.fromhex('d0cf11e0a1b11ae1')
    struct.pack_into('<HHHHH', header, 24, 0x3e, 3, 0xfffe, 9, 6)
    struct.pack_into('<IIIIIIIII', header, 40, 0, 1, 0, 0, 4096, end, 0, end, 0)
    struct.pack_into('<109I', header, 76, 1, *([free] * 108))
    def entry(name, kind, start=end, size=0, child=free, right=free):
        row=bytearray(128); encoded=(name+'\0').encode('utf-16le');row[:len(encoded)]=encoded
        struct.pack_into('<HBBIII',row,64,len(encoded),kind,1,free,right,child)
        struct.pack_into('<IQ',row,116,start,size)
        return row
    directory=entry('Root Entry',5,child=1)+entry('FileHeader',2,2,4096,right=2)+entry('BodyText',1,child=3)+entry('Section0',2,10,4096)
    fat=[free]*128;fat[0]=end;fat[1]=0xfffffffd
    for start in (2,10):
        for index in range(start,start+7):fat[index]=index+1
        fat[start+7]=end
    info=bytearray(4096);info[:17]=b'HWP Document File';struct.pack_into('<I',info,32,0x05000000);struct.pack_into('<I',info,36,flags)
    text='가상 지원서 경험\r'.encode('utf-16le')
    section=bytearray(4096);struct.pack_into('<I',section,0,67|(len(text)<<20));section[4:4+len(text)]=text
    return bytes(header+directory+struct.pack('<128I',*fat)+info+section)


class Documents(unittest.TestCase):
    def test_hwp5_and_encrypted(self):
        self.assertIn('가상 지원서 경험',parser.extract(hwp_fixture(),'hwp')[0])
        with self.assertRaisesRegex(ValueError,'ENCRYPTED'):
            parser.extract(hwp_fixture(2),'hwp')

    def test_pdf_text_and_encryption(self):
        writer=PdfWriter();page=writer.add_blank_page(width=300,height=300)
        font=DictionaryObject({NameObject('/Type'):NameObject('/Font'),NameObject('/Subtype'):NameObject('/Type1'),NameObject('/BaseFont'):NameObject('/Helvetica')})
        page[NameObject('/Resources')]=DictionaryObject({NameObject('/Font'):DictionaryObject({NameObject('/F1'):writer._add_object(font)})})
        content=DecodedStreamObject();content.set_data(b'BT /F1 12 Tf 20 200 Td (Synthetic resume experience) Tj ET')
        page[NameObject('/Contents')]=writer._add_object(content)
        stream=io.BytesIO();writer.write(stream)
        self.assertIn('Synthetic resume',parser.extract(stream.getvalue(),'pdf')[0])
        writer.encrypt('private');stream=io.BytesIO();writer.write(stream)
        with self.assertRaisesRegex(ValueError,'ENCRYPTED'):parser.extract(stream.getvalue(),'pdf')

    def test_hwpx_docx_and_xml_entities(self):
        for ext,name in [('hwpx','Contents/section0.xml'),('docx','word/document.xml')]:
            stream=io.BytesIO()
            with zipfile.ZipFile(stream,'w') as archive:archive.writestr(name,'<root><p><t>가상 경험</t></p></root>')
            self.assertEqual(parser.extract(stream.getvalue(),ext)[0],'가상 경험')
        stream=io.BytesIO()
        with zipfile.ZipFile(stream,'w') as archive:archive.writestr('Contents/section0.xml','<!DOCTYPE x [<!ENTITY x "boom">]><root><p><t>&x;</t></p></root>')
        with self.assertRaises(Exception):parser.extract(stream.getvalue(),'hwpx')

    def test_zip_expansion_limit(self):
        stream=io.BytesIO()
        with zipfile.ZipFile(stream,'w',compression=zipfile.ZIP_DEFLATED) as archive:archive.writestr('Contents/section0.xml','x'*(parser.MAX_EXPANDED+1))
        with self.assertRaisesRegex(ValueError,'EXPANDED_LIMIT'):parser.extract(stream.getvalue(),'hwpx')


if __name__ == '__main__':unittest.main()
