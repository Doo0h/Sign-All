"""Experimental arm/hand retargeting for the documented MakeHuman 163-bone rig.

Outputs are DRAFTS: no face animation, no linguistic review, no service registration.
Hand origins are never concatenated with body world coordinates.
"""
import argparse
import hashlib
import json
from pathlib import Path
import sys
from blender_import import load_motion


def assign_hands(frame):
    """Associate image-space wrists; do not assume mirrored-video handedness labels."""
    hands = [h for h in frame['hands'] if h.get('score', 0) >= .5 and len(h.get('landmarks', [])) == 21 and len(h.get('world', [])) == 21]
    if len(hands) != 2 or len(frame.get('pose', [])) != 33:
        raise ValueError('Two hands and a body pose are required in every selected frame')
    def cost(hand, index):
        a, b = hand['landmarks'][0], frame['pose'][index]
        return (a['x']-b['x'])**2 + (a['y']-b['y'])**2
    direct = cost(hands[0], 15) + cost(hands[1], 16)
    reverse = cost(hands[1], 15) + cost(hands[0], 16)
    if abs(direct-reverse) < .001 or min(direct, reverse) > .1:
        raise ValueError('Ambiguous wrist assignment; trim or correct this frame')
    return dict(zip(('L', 'R'), hands if direct < reverse else hands[::-1]))


def retarget(data, model, output, start, end, render=False):
    import bpy
    from mathutils import Vector, Matrix, Quaternion
    output = Path(output)
    if output.exists():
        raise ValueError('Choose a new output folder')
    if not 0 <= start <= end < len(data['frames']):
        raise ValueError('Invalid inclusive frame interval')
    selected = data['frames'][start:end+1]
    assignments = [assign_hands(frame) for frame in selected]
    if any(len(f['poseWorld']) != 33 for f in selected):
        raise ValueError('Body world landmarks are required')
    scene = bpy.data.scenes.new('DRAFT_NOT_REVIEWED_SIGN_LANGUAGE')
    if not bpy.context.window:
        raise ValueError('Blender window context is required for glTF import')
    bpy.context.window.scene = scene
    with bpy.context.temp_override(scene=scene, view_layer=scene.view_layers[0]):
        bpy.ops.import_scene.gltf(filepath=str(Path(model).resolve()))
        bpy.context.view_layer.update()
    rigs = [o for o in scene.objects if o.type == 'ARMATURE']
    if len(rigs) != 1:
        raise ValueError('Expected one MakeHuman armature')
    rig = rigs[0]
    names = ['upperarm01','upperarm02','lowerarm01','lowerarm02','wrist'] + [f'finger{f}-{j}' for f in range(1,6) for j in range(1,4)] + [f'metacarpal{f}' for f in range(1,5)]
    if any(f'{n}.{s}' not in rig.data.bones for s in ('L','R') for n in names):
        raise ValueError('Unsupported rig: required MakeHuman hand/arm bones are missing')
    for obj in scene.objects:
        obj.animation_data_clear()
    for bone in rig.pose.bones:
        bone.rotation_mode = 'QUATERNION'
        bone.rotation_quaternion = (1,0,0,0)
        bone.location = (0,0,0)
        bone.scale = (1,1,1)
    rest = {b.name: b.matrix_local.to_quaternion() for b in rig.data.bones}
    def vector(p):
        return Vector((p['x'], p['z'], -p['y']))
    def basis(wrist, index, middle, pinky):
        y = (middle-wrist).normalized()
        x = index-pinky
        x = (x-y*x.dot(y)).normalized()
        if x.length < .5 or y.length < .5:
            raise ValueError('Degenerate palm geometry')
        z = x.cross(y).normalized()
        return Matrix((x,y,z)).transposed().to_quaternion()
    palms = {}
    for side in ('L','R'):
        b = rig.data.bones
        palms[side] = basis(b[f'wrist.{side}'].head_local, b[f'finger2-1.{side}'].head_local,
                            b[f'finger3-1.{side}'].head_local, b[f'finger5-1.{side}'].head_local)
    def aim(name, direction, twist=None):
        if direction.length < 1e-7:
            raise ValueError('Zero-length joint segment')
        initial = (twist @ rest[name]) if twist else rest[name]
        return (initial @ Vector((0,1,0))).rotation_difference(direction.normalized()) @ initial
    previous = {}
    for sample, hands in zip(selected, assignments):
        frame = 1 + (sample['timestampMs']-selected[0]['timestampMs'])*data['fps']/1000
        pose = [vector(p) for p in sample['poseWorld']]
        targets = {}
        for side, shoulder, elbow, wrist in [('L',11,13,15),('R',12,14,16)]:
            for name in ('upperarm01','upperarm02'):
                targets[f'{name}.{side}'] = aim(f'{name}.{side}',pose[elbow]-pose[shoulder])
            for name in ('lowerarm01','lowerarm02'):
                targets[f'{name}.{side}'] = aim(f'{name}.{side}',pose[wrist]-pose[elbow])
            hand = [vector(p) for p in hands[side]['world']]
            twist = basis(hand[0],hand[5],hand[9],hand[17]) @ palms[side].inverted()
            targets[f'wrist.{side}'] = twist @ rest[f'wrist.{side}']
            for finger, first in [(1,1),(2,5),(3,9),(4,13),(5,17)]:
                if finger > 1:
                    name = f'metacarpal{finger-1}.{side}'
                    targets[name] = aim(name,hand[first]-hand[0],twist)
                for joint in range(3):
                    name = f'finger{finger}-{joint+1}.{side}'
                    targets[name] = aim(name,hand[first+joint+1]-hand[first+joint],twist)
        global_rotations = {}
        for b in rig.data.bones:  # glTF importer creates parents before children
            parent_global = global_rotations[b.parent.name] if b.parent else Quaternion()
            relative = rest[b.parent.name].inverted() @ rest[b.name] if b.parent else rest[b.name]
            desired = targets.get(b.name, parent_global @ relative)
            global_rotations[b.name] = desired
            if b.name not in targets:
                continue
            local = relative.inverted() @ parent_global.inverted() @ desired
            if b.name in previous and local.dot(previous[b.name]) < 0:
                local.negate()
            previous[b.name] = local.copy()
            bone = rig.pose.bones[b.name]
            bone.rotation_quaternion = local
            bone.keyframe_insert('rotation_quaternion',frame=frame)
    action = rig.animation_data.action
    action.name = 'DRAFT_operation_unreviewed'
    for curve in action.fcurves:
        for point in curve.keyframe_points:
            point.interpolation = 'LINEAR'
    scene.render.fps = round(data['fps'])
    scene.render.fps_base = round(data['fps'])/data['fps']
    scene.frame_start = 1
    scene.frame_end = round(1+(selected[-1]['timestampMs']-selected[0]['timestampMs'])*data['fps']/1000)
    scene['status'] = 'DRAFT - arms/hands only; no linguistic review or face retargeting'
    scene['source'] = data['source']
    scene['changes'] = 'Landmark extraction; cropped interval; estimated bone rotations; no new model training'
    output.mkdir(parents=True)
    # Export only imported model, not the later review camera/lights.
    bpy.context.window.scene = scene
    bpy.context.view_layer.update()
    bpy.ops.export_scene.gltf(filepath=str(output/'draft-operation.glb'),export_format='GLB',use_active_scene=True,
        export_animations=True,export_frame_range=True,export_force_sampling=True,export_extras=True)
    camera_data = bpy.data.cameras.new('ReviewCamera')
    camera = bpy.data.objects.new('ReviewCamera',camera_data)
    scene.collection.objects.link(camera)
    camera.location = (0,-3.3,1.45)
    camera.rotation_euler = (Vector((0,0,1.45))-camera.location).to_track_quat('-Z','Y').to_euler()
    camera_data.type = 'ORTHO';camera_data.ortho_scale = 1.4
    scene.camera = camera
    for name, loc, energy in [('Key',(-2,-3,3),500),('Fill',(2,-2,2),350)]:
        light_data=bpy.data.lights.new(name,'AREA');light_data.energy=energy;light_data.shape='DISK';light_data.size=3
        light=bpy.data.objects.new(name,light_data);scene.collection.objects.link(light);light.location=loc
        light.rotation_euler=(Vector((0,0,1.3))-light.location).to_track_quat('-Z','Y').to_euler()
    scene.world = bpy.data.worlds.new('ReviewWorld');scene.world.color=(.06,.06,.06)
    scene.render.engine='CYCLES';scene.cycles.samples=12
    scene.render.resolution_x=960;scene.render.resolution_y=720;scene.render.resolution_percentage=100
    scene.frame_set(1);bpy.context.view_layer.update()
    bpy.ops.wm.save_as_mainfile(filepath=str(output/'draft-operation.blend'))
    if render:
        for frame in (1,scene.frame_end//2,scene.frame_end):
            scene.frame_set(frame);bpy.context.view_layer.update();scene.render.filepath=str(output/f'frame-{frame:03}.png')
            bpy.ops.render.render(write_still=True)
    report={'status':'draft-unreviewed','term':data['questionText'],'source':data['source'],
        'sourceVideoSha256':data['sourceVideoSha256'],'modelSha256':hashlib.sha256(Path(model).read_bytes()).hexdigest(),
        'selectedFrames':[start,end],'sourceTimeMs':[selected[0]['timestampMs'],selected[-1]['timestampMs']],
        'animatedBones':len(previous),'clipName':action.name,'outputFrames':scene.frame_end,
        'limitations':['Cropped single word, not a question translation','No new ML model trained',
        'Estimated arm/hand rotations; finger roll, contact and collisions need manual correction',
        'Face, gaze and torso remain at rest','Not linguistically reviewed; never auto-register as ready']}
    (output/'retarget-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
    return report


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    for name in ('motion','model','output'):
        parser.add_argument('--'+name,required=True)
    parser.add_argument('--start',type=int,required=True);parser.add_argument('--end',type=int,required=True)
    parser.add_argument('--render',action='store_true')
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else None)
    report=retarget(load_motion(args.motion),args.model,args.output,args.start,args.end,args.render)
    print(json.dumps(report,ensure_ascii=False))

if __name__=='__main__':
    main()
