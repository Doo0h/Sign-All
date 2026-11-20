"""Create a separate Blender landmark-review scene. Does not retarget an avatar."""
import argparse
import json
import math
from pathlib import Path
import sys

HAND_EDGES = [(0, 1), (1, 2), (2, 3), (3, 4), (0, 5), (5, 6), (6, 7), (7, 8),
              (5, 9), (9, 10), (10, 11), (11, 12), (9, 13), (13, 14), (14, 15),
              (15, 16), (13, 17), (0, 17), (17, 18), (18, 19), (19, 20)]
POSE_EDGES = [(11, 12), (11, 13), (13, 15), (12, 14), (14, 16), (11, 23),
              (12, 24), (23, 24), (23, 25), (25, 27), (24, 26), (26, 28)]

def load_motion(path):
    if Path(path).stat().st_size > 150 * 1024 * 1024:
        raise ValueError('Split motion into files below 150 MiB')
    data = json.loads(Path(path).read_text(encoding='utf-8-sig'))
    if data.get('schemaVersion') != 1 or not isinstance(data.get('frames'), list) or not 1 <= len(data['frames']) <= 4000:
        raise ValueError('Expected schemaVersion 1 and 1–4000 frames')
    fps = data.get('fps')
    if isinstance(fps, bool) or not isinstance(fps, (float, int)) or not math.isfinite(fps) or not 1 <= fps <= 120:
        raise ValueError('Invalid frame rate')
    previous = -1
    for frame in data['frames']:
        timestamp = frame.get('timestampMs')
        if isinstance(timestamp, bool) or not isinstance(timestamp, (int, float)) or not math.isfinite(timestamp) or timestamp < 0 or timestamp <= previous:
            raise ValueError('Frame timestamps must be finite, nonnegative and strictly increasing')
        previous = timestamp
        if not isinstance(frame.get('hands'), list):
            raise ValueError('Missing hand detections')
        for points, expected in [(frame.get('poseWorld'), 33), *[(h.get('world'), 21) for h in frame['hands']]]:
            if not isinstance(points, list) or len(points) not in (0, expected):
                raise ValueError('Expected 33 pose or 21 hand world points, or an empty list')
            for p in points:
                if any(isinstance(p.get(axis), bool) or not isinstance(p.get(axis), (int, float)) or not math.isfinite(p[axis]) for axis in ('x', 'y', 'z')):
                    raise ValueError('Non-finite landmark coordinates')
        for value in frame.get('blendshapes', {}).values():
            if not isinstance(value, (int, float)) or not math.isfinite(value) or not 0 <= value <= 1:
                raise ValueError('Invalid facial coefficient')
    return data

def panel_points(frame, panel):
    if panel == 'body':
        points, scale, offset = frame['poseWorld'], 1, 0
    else:
        hands = [h for h in frame['hands'] if h.get('label') == panel and isinstance(h.get('score'), (int, float)) and h['score'] >= .5]
        if len(hands) != 1:  # ambiguous handedness is not silently resolved
            return []
        points, scale, offset = hands[0]['world'], 4, (-1.2 if panel == 'Left' else 1.2)
    # Camera-oriented coordinates -> Blender Z-up. Hands deliberately stay in separate panels.
    return [(p['x'] * scale + offset, p['z'] * scale, -p['y'] * scale) for p in points]

def build_scene(data):
    import bpy
    from mathutils import Vector
    scene = bpy.data.scenes.new('SignAll_UNREVIEWED_LANDMARKS')
    scene['questionText'] = data.get('questionText', '')
    scene['notice'] = 'NOT KSL animation. Independent body/hand origins; hands enlarged 4x. No avatar retargeting.'
    scene.render.fps = round(data['fps'])
    scene.render.fps_base = round(data['fps']) / data['fps']
    scene.frame_start = 1
    scene.frame_end = math.ceil(1 + data['frames'][-1]['timestampMs'] * data['fps'] / 1000)
    mesh = bpy.data.meshes.new('SignAll_review_point')
    mesh.from_pydata([(0, 0, .012), (0, 0, -.012), (.012, 0, 0), (0, .012, 0), (-.012, 0, 0), (0, -.012, 0)], [],
                     [(0, 2, 3), (0, 3, 4), (0, 4, 5), (0, 5, 2), (1, 3, 2), (1, 4, 3), (1, 5, 4), (1, 2, 5)])
    line_mesh = bpy.data.meshes.new('SignAll_review_link')
    line_mesh.from_pydata([(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)], [],
                         [(0,1,2,3),(4,7,6,5),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)])
    objects = []
    for panel, count, edges in [('body', 33, POSE_EDGES), ('Left', 21, HAND_EDGES), ('Right', 21, HAND_EDGES)]:
        collection = bpy.data.collections.new('SignAll_' + panel)
        scene.collection.children.link(collection)
        joints, links = [], []
        for i in range(count):
            obj = bpy.data.objects.new(f'{panel}_{i:02}', mesh)
            collection.objects.link(obj)
            joints.append(obj)
        for a, b in edges:
            obj = bpy.data.objects.new(f'{panel}_{a:02}_{b:02}', line_mesh)
            obj.rotation_mode = 'QUATERNION'
            collection.objects.link(obj)
            links.append(obj)
        objects += joints + links
        for sample in data['frames']:
            frame = 1 + sample['timestampMs'] * data['fps'] / 1000
            points = panel_points(sample, panel)
            for obj in joints + links:
                obj.hide_viewport = obj.hide_render = not bool(points)
                obj.keyframe_insert('hide_viewport', frame=frame)
                obj.keyframe_insert('hide_render', frame=frame)
            if not points:
                continue
            for obj, point in zip(joints, points):
                obj.location = point
                obj.keyframe_insert('location', frame=frame)
            for obj, (a, b) in zip(links, edges):
                start, end = Vector(points[a]), Vector(points[b])
                delta = end - start
                obj.location = (start + end) / 2
                obj.scale = (.003, .003, delta.length / 2)
                if delta.length > 1e-8:
                    obj.rotation_quaternion = delta.to_track_quat('Z', 'Y')
                for prop in ('location', 'scale', 'rotation_quaternion'):
                    obj.keyframe_insert(prop, frame=frame)
    face = bpy.data.objects.new('Face_coefficients_NOT_APPLIED_TO_AVATAR', None)
    scene.collection.objects.link(face)
    names = sorted({name for f in data['frames'] for name in f.get('blendshapes', {})})
    for sample in data['frames']:
        frame = 1 + sample['timestampMs'] * data['fps'] / 1000
        face['detected'] = bool(sample.get('blendshapes'))
        face.keyframe_insert('["detected"]', frame=frame)
        for name in names:
            face[name] = sample.get('blendshapes', {}).get(name, 0)
            face.keyframe_insert('[' + json.dumps(name) + ']', frame=frame)
    objects.append(face)
    # Preserve sampled frames; do not invent motion through missing detections.
    for obj in objects:
        if obj.animation_data and obj.animation_data.action:
            for curve in obj.animation_data.action.fcurves:
                for keyframe in curve.keyframe_points:
                    keyframe.interpolation = 'CONSTANT'
    scene.frame_set(1)
    if bpy.context.window:
        bpy.context.window.scene = scene
    return scene

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--motion', required=True)
    parser.add_argument('--output', required=True)
    argv = sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else sys.argv[1:]
    args = parser.parse_args(argv)
    target = Path(args.output).resolve()
    if target.exists() or target.suffix != '.blend':
        parser.error('Choose a new .blend output file; existing files are never overwritten')
    data = load_motion(args.motion)
    import bpy
    scene = build_scene(data)
    target.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(target))
    print(json.dumps({'output': str(target), 'scene': scene.name, 'status': 'unreviewed-landmarks', 'frames': len(data['frames'])}))

if __name__ == '__main__':
    main()
