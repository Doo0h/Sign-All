"""Bake a limited source-derived facial draft; not a trained KSL expression model."""
import argparse
import hashlib
import json
import math
from pathlib import Path


def validate_face(data, report):
    if data['sourceVideoSha256'] != report['sourceVideoSha256']:
        raise ValueError('Face and hand source video hashes differ')
    start,end=report['selectedFrames']
    selected=data['frames'][start:end+1]
    if len(selected)!=report['outputFrames']:
        raise ValueError('Frame count mismatch')
    for frame in selected:
        values=frame.get('blendshapes',{})
        if not values or any(not isinstance(v,(float,int)) or not math.isfinite(v) or not 0<=v<=1 for v in values.values()):
            raise ValueError('Missing or invalid expression scores')
        transform=frame.get('faceTransform')
        if not transform or len(transform)!=4 or any(len(row)!=4 or any(not math.isfinite(v) for v in row) for row in transform):
            raise ValueError('Missing or invalid face transform')
    return selected


def bake(folder,motion,output):
    import bpy
    from mathutils import Matrix,Quaternion
    folder,output=Path(folder).resolve(),Path(output).resolve()
    if output.exists():raise ValueError('Choose a new output folder')
    report=json.loads((folder/'retarget-report.json').read_text(encoding='utf8'))
    if report.get('status')!='draft-unreviewed':raise ValueError('Expected an unreviewed draft')
    data=json.loads(Path(motion).read_text(encoding='utf8'));selected=validate_face(data,report)
    bpy.ops.wm.open_mainfile(filepath=str(folder/'draft-operation.blend'))
    scene=bpy.context.scene;rig=next(o for o in scene.objects if o.type=='ARMATURE')
    brows=[o for o in scene.objects if o.name.startswith('Eyebrow mesh')]
    if any(name not in rig.pose.bones for name in ('head','jaw')):raise ValueError('Head/jaw rig required')
    conversion=Matrix(((1,0,0),(0,0,-1),(0,1,0)))
    reference=Matrix(selected[0]['faceTransform']).to_3x3().normalized()
    head_rest=rig.data.bones['head'].matrix_local.to_quaternion()
    rows=[]
    for i,sample in enumerate(selected):
        frame=scene.frame_start+i;scene.frame_set(frame)
        expression=sample['blendshapes']
        relative=Matrix(sample['faceTransform']).to_3x3().normalized() @ reference.inverted()
        delta=(conversion @ relative @ conversion.inverted()).to_quaternion()
        if delta.w<0:delta.negate()
        if delta.angle>math.radians(12):delta=Quaternion().slerp(delta,math.radians(12)/delta.angle)
        head=rig.pose.bones['head'];head.rotation_mode='QUATERNION'
        head.rotation_quaternion=head_rest.inverted() @ delta @ head_rest
        head.keyframe_insert('rotation_quaternion',frame=frame)
        jaw=rig.pose.bones['jaw'];jaw.rotation_mode='QUATERNION'
        jaw.rotation_quaternion=Quaternion((1,0,0),math.radians(15)*expression.get('jawOpen',0))
        jaw.keyframe_insert('rotation_quaternion',frame=frame)
        for brow in brows:
            side='Left' if brow.name.endswith(' 1') else 'Right'
            value=.006*(expression.get('browInnerUp',0)+expression.get('browOuterUp'+side,0))-.003*expression.get('browDown'+side,0)
            # Shape keys preserve armature skinning; object transforms on skinned meshes
            # are not consistently represented by glTF viewers.
            if not brow.data.shape_keys:
                brow.shape_key_add(name='Basis');key=brow.shape_key_add(name='browRaise')
                key.slider_min=-1
                for p in key.data:p.co.z+=.012
            key=brow.data.shape_keys.key_blocks['browRaise'];key.value=value/.012
            key.keyframe_insert('value',frame=frame)
        rows.append({'sourceTimestampMs':sample['timestampMs'],'blendshapes':expression,'faceTransform':sample['faceTransform']})
    rig.animation_data.action.name='DRAFT_operation_face_unreviewed'
    output.mkdir(parents=True);scene.frame_set(scene.frame_start)
    bpy.ops.export_scene.gltf(filepath=str(output/'draft-operation.glb'),export_format='GLB',use_active_scene=True,
        export_animation_mode='SCENE',export_anim_scene_split_object=False,export_anim_slide_to_zero=True,export_animations=True,export_frame_range=True,export_force_sampling=True,
        export_cameras=False,export_lights=False,export_morph=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(output/'draft-operation.blend'))
    import struct
    raw=(output/'draft-operation.glb').read_bytes()
    gltf=json.loads(raw[20:20+struct.unpack_from('<I',raw,12)[0]])
    if len(gltf.get('animations',[]))!=1:raise ValueError('Expected one synchronized body/face clip')
    report['clipName']=gltf['animations'][0]['name']
    report['facialAnimation']={'status':'draft-unreviewed','method':'Existing MediaPipe outputs mapped to rig; no new training',
        'applied':['jawOpen','browInnerUp','browOuterUpLeft','browOuterUpRight','browDownLeft','browDownRight','headRotation'],
        'notApplied':['eyelid blink','eye gaze','lip shapes','cheeks'],
        'headReference':'first selected frame, not a verified neutral pose','headCapDegrees':12,'jawGainDegrees':15,
        'frames':len(rows),'sourceMotionSha256':hashlib.sha256(Path(motion).read_bytes()).hexdigest()}
    report['limitations']=[s for s in report['limitations'] if s!='Face, gaze and torso remain at rest']
    report['limitations'].append('Partial experimental face mapping; eyelids, gaze and torso remain at rest; KSL non-manual markers unreviewed')
    (output/'retarget-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
    (output/'face-training-candidate.json').write_text(json.dumps({'status':'unreviewed-not-training-ready',
        'source':report['source'],'sourceVideoSha256':report['sourceVideoSha256'],
        'requires':['source-specific training permission','neutral calibration','KSL non-manual annotations','signer-separated train/validation/test sets'],
        'frames':rows},ensure_ascii=False),encoding='utf8')


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    for name in ('folder','motion','output'):p.add_argument('--'+name,required=True)
    a=p.parse_args();bake(a.folder,a.motion,a.output)
