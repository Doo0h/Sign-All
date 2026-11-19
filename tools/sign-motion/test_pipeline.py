import json
from pathlib import Path
import struct
import tempfile
import unittest

from pipeline import quality, validate_manifest, write_json, digest
from register import inspect_glb, prepare


class WorkflowTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.manifest = self.root / 'manifest.json'
        (self.root / 'clip.mp4').write_bytes(b'test fixture, not a sign video')
        (self.root / 'permission.txt').write_text('Synthetic test fixture only')
        self.doc = {'id': 'question-001', 'questionText': '자기소개를 해 주세요.',
                    'language': 'ksl', 'video': 'clip.mp4', 'source': 'synthetic test',
                    'signerId': 'test', 'mirrored': False,
                    'rights': {'motionExtraction': True, 'derivativeDistribution': True,
                               'evidenceFile': 'permission.txt'}}
        write_json(self.manifest, self.doc)

    def glb(self, **extra):
        doc = {'asset': {'version': '2.0'}, 'animations': [{'name': 'question-001',
               'channels': [{'sampler': 0}], 'samplers': [{'input': 0, 'output': 1}]}], **extra}
        chunk = json.dumps(doc).encode()
        chunk += b' ' * (-len(chunk) % 4)
        target = self.root / 'test.glb'
        target.write_bytes(struct.pack('<4sIII4s', b'glTF', 2, 20 + len(chunk), len(chunk), b'JSON') + chunk)
        return target

    def test_permission_and_source_are_required(self):
        self.assertTrue(validate_manifest(self.manifest)[1].is_file())
        self.doc['rights']['motionExtraction'] = False
        write_json(self.manifest, self.doc)
        with self.assertRaisesRegex(ValueError, 'permission'):
            validate_manifest(self.manifest)
        self.doc['rights']['motionExtraction'] = True
        self.doc['rights']['evidenceFile'] = 'missing.txt'
        write_json(self.manifest, self.doc)
        with self.assertRaisesRegex(ValueError, 'evidence'):
            validate_manifest(self.manifest)

    def test_missing_detections_remain_missing(self):
        frames = [{'pose': [], 'face': [], 'hands': []} for _ in range(3)]
        report = quality(frames)
        self.assertEqual(report['detectionCoverage'], {'pose': 0, 'face': 0, 'twoHands': 0})
        self.assertTrue(report['reviewRequired'])
        with self.assertRaises(ValueError):
            quality([])

    def test_glb_external_resources_and_missing_clips_rejected(self):
        with self.assertRaisesRegex(ValueError, 'embed'):
            inspect_glb(self.glb(buffers=[{'uri': 'https://example.com/model.bin'}]), ['question-001'])
        with self.assertRaisesRegex(ValueError, 'clips'):
            inspect_glb(self.glb(), ['unknown'])
        with self.assertRaisesRegex(ValueError, 'extensions'):
            inspect_glb(self.glb(extensionsRequired=['KHR_draco_mesh_compression']), ['question-001'])

    def test_review_must_match_final_asset_and_question(self):
        glb = self.glb()
        review = {'questionText': self.doc['questionText'], 'status': 'reviewed',
                  'reviewedBy': 'synthetic reviewer', 'reviewedAt': '2026-11-19', 'version': '1',
                  'assetSha256': digest(glb), 'clips': ['question-001'],
                  'checks': dict.fromkeys(['meaning', 'hands', 'faceAndBody', 'transitions', 'avatarPlayback'], True)}
        path = self.root / 'review.json'
        write_json(path, review)
        self.assertEqual(prepare(self.manifest, path, glb)['status'], 'reviewed')
        review['status'] = 'draft'
        write_json(path, review)
        with self.assertRaisesRegex(ValueError, 'completed'):
            prepare(self.manifest, path, glb)
        review['status'] = 'reviewed'
        review['assetSha256'] = 'wrong'
        write_json(path, review)
        with self.assertRaisesRegex(ValueError, 'hash'):
            prepare(self.manifest, path, glb)


if __name__ == '__main__':
    unittest.main()
