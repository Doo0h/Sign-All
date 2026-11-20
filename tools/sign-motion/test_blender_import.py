import json
import os
from pathlib import Path
import tempfile
import unittest
from blender_import import load_motion, panel_points, build_scene


def fixture():
    point = {'x': .1, 'y': .2, 'z': .3}
    return {'schemaVersion': 1, 'fps': 10, 'questionText': 'SYNTHETIC TEST, NOT SIGN LANGUAGE',
            'frames': [{'timestampMs': 0, 'poseWorld': [point.copy() for _ in range(33)],
                        'hands': [{'label': 'Left', 'score': .9, 'world': [point.copy() for _ in range(21)]}],
                        'blendshapes': {'jawOpen': .5}},
                       {'timestampMs': 100, 'poseWorld': [], 'hands': [], 'blendshapes': {}},
                       {'timestampMs': 200, 'poseWorld': [point.copy() for _ in range(33)],
                        'hands': [], 'blendshapes': {'jawOpen': .5}}]}


class ImportTests(unittest.TestCase):
    def test_panels_do_not_attach_hand_origins_to_body(self):
        frame = fixture()['frames'][0]
        self.assertEqual(panel_points(frame, 'body')[0], (.1, .3, -.2))
        self.assertAlmostEqual(panel_points(frame, 'Left')[0][0], -.8)
        self.assertEqual(panel_points(frame, 'Right'), [])
        frame['hands'].append(frame['hands'][0].copy())
        self.assertEqual(panel_points(frame, 'Left'), [])

    def test_bad_coordinates_and_time_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'motion.json'
            data = fixture()
            path.write_text(json.dumps(data), encoding='utf8')
            self.assertEqual(len(load_motion(path)['frames']), 3)
            data['frames'][1]['timestampMs'] = 0
            path.write_text(json.dumps(data), encoding='utf8')
            with self.assertRaises(ValueError):
                load_motion(path)
            data = fixture()
            data['frames'][0]['poseWorld'][0]['x'] = float('nan')
            path.write_text(json.dumps(data), encoding='utf8')
            with self.assertRaises(ValueError):
                load_motion(path)

    @unittest.skipUnless(os.environ.get('SIGN_MOTION_BLENDER_TEST') == '1', 'Optional actual Blender test')
    def test_actual_blender_animation_and_scene_preservation(self):
        import bpy
        original = set(bpy.data.scenes.keys())
        scene = build_scene(fixture())
        self.assertTrue(original.issubset(set(bpy.data.scenes.keys())))
        self.assertEqual(scene.frame_end, 3)
        body = scene.objects['body_00']
        scene.frame_set(1)
        bpy.context.view_layer.update()
        self.assertEqual(tuple(body.scale), (1, 1, 1))
        scene.frame_set(2)
        bpy.context.view_layer.update()
        self.assertEqual(tuple(body.scale), (0, 0, 0))
        self.assertEqual(tuple(scene.objects['Left_00'].scale), (0, 0, 0))
        self.assertFalse(scene.objects['Face_coefficients_NOT_APPLIED_TO_AVATAR']['detected'])
        scene.frame_set(3)
        bpy.context.view_layer.update()
        self.assertEqual(tuple(body.scale), (1, 1, 1))
        self.assertTrue(scene.objects['Face_coefficients_NOT_APPLIED_TO_AVATAR']['detected'])
        self.assertTrue(all(p.interpolation == 'CONSTANT' for curve in body.animation_data.action.fcurves for p in curve.keyframe_points))
        if os.environ.get('SIGN_MOTION_BLENDER_OUTPUT'):
            bpy.ops.wm.save_as_mainfile(filepath=os.environ['SIGN_MOTION_BLENDER_OUTPUT'])


if __name__ == '__main__':
    unittest.main()
