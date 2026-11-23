import copy
import unittest
from bake_face import validate_face


class FaceTests(unittest.TestCase):
    def setUp(self):
        self.report={'sourceVideoSha256':'abc','selectedFrames':[0,0],'outputFrames':1}
        self.data={'sourceVideoSha256':'abc','frames':[{'blendshapes':{'jawOpen':.2},'faceTransform':[[1,0,0,0],[0,1,0,0],[0,0,1,0],[0,0,0,1]]}]}

    def test_same_video_and_interval_required(self):
        self.assertEqual(len(validate_face(self.data,self.report)),1)
        other=copy.deepcopy(self.data);other['sourceVideoSha256']='different'
        with self.assertRaises(ValueError):validate_face(other,self.report)
        self.report['outputFrames']=2
        with self.assertRaises(ValueError):validate_face(self.data,self.report)

    def test_invalid_or_missing_channels_fail_before_render(self):
        for bad in [{},{'jawOpen':float('nan')},{'jawOpen':1.1}]:
            data=copy.deepcopy(self.data);data['frames'][0]['blendshapes']=bad
            with self.assertRaises(ValueError):validate_face(data,self.report)
        self.data['frames'][0]['faceTransform']=None
        with self.assertRaises(ValueError):validate_face(self.data,self.report)
