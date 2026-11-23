import json
from pathlib import Path
import struct
import tempfile
import threading
import unittest
from urllib.request import urlopen, Request
from urllib.error import HTTPError
from retarget_makehuman import assign_hands
from avatar_review import create_server


class RetargetTests(unittest.TestCase):
    def frame(self):
        pose = [{'x': .5, 'y': .5} for _ in range(33)]
        pose[15] = {'x': .8, 'y': .5}
        pose[16] = {'x': .2, 'y': .5}
        hands = [{'label': label, 'score': .9, 'landmarks': [{'x': x, 'y': .5} for _ in range(21)],
                  'world': [{'x': 0, 'y': 0, 'z': 0} for _ in range(21)]}
                 for label, x in [('Left', .2), ('Right', .8)]]
        return {'pose': pose, 'hands': hands}

    def test_image_wrists_override_incorrect_handedness_labels(self):
        result = assign_hands(self.frame())
        self.assertEqual(result['L']['landmarks'][0]['x'], .8)
        self.assertEqual(result['R']['landmarks'][0]['x'], .2)

    def test_missing_low_confidence_and_ambiguous_hands_are_rejected(self):
        for mode in ['missing', 'low-confidence', 'overlap']:
            frame = self.frame()
            if mode == 'missing':
                frame['hands'].pop()
            elif mode == 'low-confidence':
                frame['hands'][0]['score'] = .1
            else:
                frame['pose'][15] = frame['pose'][16]
            with self.assertRaises(ValueError):
                assign_hands(frame)

    def test_review_server_only_serves_explicit_draft_files(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            chunk = json.dumps({'animations': [{'name': 'draft'}]}).encode()
            chunk += b' ' * (-len(chunk) % 4)
            (root/'draft-operation.glb').write_bytes(struct.pack('<4sIII4s', b'glTF', 2, 20+len(chunk), len(chunk), b'JSON')+chunk)
            (root/'retarget-report.json').write_text(json.dumps({'status':'draft-unreviewed'}))
            (root/'player.js').write_text('')
            (root/'clip.webm').write_bytes(b'0123456789')
            server = create_server(root, root/'player.js', video=root/'clip.webm', port=0, comparison=root)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                base = f'http://127.0.0.1:{server.server_port}'
                with urlopen(base+'/data.json') as response:
                    result = json.load(response)
                self.assertEqual(result['status'], 'draft-unreviewed')
                self.assertEqual(result['clips'], ['draft'])
                self.assertTrue(result['hasComparison'])
                with urlopen(base+'/data.json?variant=original') as response:
                    original=json.load(response)
                self.assertEqual(original['assetUrl'],'/avatars/draft-original.glb')
                with urlopen(base+original['assetUrl']) as response:
                    self.assertEqual(response.read()[:4],b'glTF')
                with urlopen(Request(base+'/source.webm',headers={'Range':'bytes=2-5'})) as response:
                    self.assertEqual(response.status,206)
                    self.assertEqual(response.read(),b'2345')
                    self.assertEqual(response.headers['Content-Range'],'bytes 2-5/10')
                with self.assertRaises(HTTPError) as error:
                    urlopen(Request(base+'/source.webm',headers={'Range':'bytes=50-'}))
                self.assertEqual(error.exception.code,416)
                for path in ['/../.env', '/manifest.json', '/clip.webm']:
                    with self.assertRaises(HTTPError) as error:
                        urlopen(base+path)
                    self.assertEqual(error.exception.code, 404)
            finally:
                server.shutdown(); server.server_close(); thread.join()


if __name__ == '__main__':
    unittest.main()
