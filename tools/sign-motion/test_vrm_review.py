import hashlib
import json
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import urlopen,Request
import vrm_review


class VRMReviewTests(unittest.TestCase):
    def test_source_validation_and_explicit_routes(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);model=root/'avatar.vrm';model.write_bytes(b'fixture')
            player=root/'player.js';player.write_text('')
            motion=root/'motion.json';motion.write_text('{}')
            with self.assertRaises(ValueError):vrm_review.create_server(model,motion,player,port=0)
            with patch.object(vrm_review,'MODEL_SHA',hashlib.sha256(b'fixture').hexdigest()):
                with self.assertRaises(ValueError):vrm_review.create_server(model,motion,player,port=0)
                pose=[{'x':.5,'y':.5,'z':0} for _ in range(33)];pose[15]={'x':.8,'y':.5};pose[16]={'x':.2,'y':.5}
                hands=[{'score':.9,'landmarks':[{'x':x,'y':.5,'z':0}]*21,'world':[{'x':0,'y':0,'z':0}]*21} for x in (.8,.2)]
                frame={'timestampMs':0,'pose':pose,'poseWorld':[{'x':0,'y':0,'z':0}]*33,'hands':hands,'blendshapes':{'jawOpen':.2}}
                motion.write_text(json.dumps({'sourceVideoSha256':'92e79ecc08dab0ec5fcd8d57b015dcf9c81aca16f8b5d731c3c028f069ae47b6','source':'fixture','frames':[frame]*56}))
                video=root/'clip.webm';video.write_bytes(b'0123456789')
                server=vrm_review.create_server(model,motion,player,port=0,video=video)
                thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
                try:
                    base=f'http://127.0.0.1:{server.server_port}'
                    with urlopen(base+'/motion.json') as response:
                        data=json.load(response)
                    self.assertEqual(len(data['frames']),45);self.assertEqual(set(data['frames'][0]['hands']),{'L','R'})
                    self.assertTrue(data['hasVideo'])
                    with urlopen(Request(base+'/source.webm',headers={'Range':'bytes=2-5'})) as response:
                        self.assertEqual(response.status,206);self.assertEqual(response.read(),b'2345')
                    with self.assertRaises(HTTPError) as error:urlopen(Request(base+'/source.webm',headers={'Range':'bytes=50-'}))
                    self.assertEqual(error.exception.code,416)
                    with urlopen(base+'/avatar.vrm') as response:self.assertEqual(response.read(),b'fixture')
                    with self.assertRaises(HTTPError) as error:urlopen(base+'/metadata.json')
                    self.assertEqual(error.exception.code,404)
                finally:server.shutdown();server.server_close();thread.join()
