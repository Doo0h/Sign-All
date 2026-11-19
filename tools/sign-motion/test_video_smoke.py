"""Optional real MediaPipe smoke test. Synthetic blank video is NOT KSL data."""
import os
from pathlib import Path
import tempfile
import unittest

from pipeline import extract, read_json, write_json


@unittest.skipUnless(os.environ.get('SIGN_MOTION_MODELS'), 'Set SIGN_MOTION_MODELS to run actual inference')
class VideoSmoke(unittest.TestCase):
    def test_empty_video_does_not_invent_landmarks(self):
        import cv2
        import numpy as np
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            writer = cv2.VideoWriter(str(root / 'blank.mp4'), cv2.VideoWriter_fourcc(*'mp4v'), 10, (320, 240))
            self.assertTrue(writer.isOpened())
            for _ in range(5):
                writer.write(np.zeros((240, 320, 3), dtype=np.uint8))
            writer.release()
            (root / 'permission.txt').write_text('Generated blank test frames; no human data.')
            write_json(root / 'manifest.json', {'id': 'blank-test', 'questionText': 'Synthetic test, not KSL',
                'language': 'ksl', 'source': 'locally generated blank frames', 'signerId': 'none',
                'video': 'blank.mp4', 'mirrored': False,
                'rights': {'motionExtraction': True, 'evidenceFile': 'permission.txt'}})
            extract(root / 'manifest.json', os.environ['SIGN_MOTION_MODELS'], root / 'output')
            result = read_json(root / 'output/motion.json')
            self.assertEqual(len(result['frames']), 5)
            self.assertEqual([f['timestampMs'] for f in result['frames']], [0, 100, 200, 300, 400])
            self.assertTrue(all(not f['pose'] and not f['hands'] and not f['face'] for f in result['frames']))
            self.assertEqual(result['status'], 'unreviewed')


if __name__ == '__main__':
    unittest.main()
