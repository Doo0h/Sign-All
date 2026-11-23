"""Create a separately reviewable, capped smoothing candidate from a retarget draft."""
import argparse
import json
from pathlib import Path
from motion_filter import smooth, angle


def refine(folder, output, cap=3):
    import bpy
    folder, output = Path(folder).resolve(), Path(output).resolve()
    if output.exists():raise ValueError('Choose a new output folder')
    report=json.loads((folder/'retarget-report.json').read_text(encoding='utf8'))
    if report.get('status')!='draft-unreviewed':raise ValueError('Expected an unreviewed draft')
    bpy.ops.wm.open_mainfile(filepath=str(folder/'draft-operation.blend'))
    scene=bpy.context.scene
    rig=next(o for o in scene.objects if o.type=='ARMATURE')
    action=rig.animation_data.action
    names=sorted({c.data_path.split('"')[1] for c in action.fcurves if c.data_path.endswith('rotation_quaternion')})
    frames=list(range(scene.frame_start,scene.frame_end+1))
    tracks={name:[] for name in names}
    for frame in frames:
        scene.frame_set(frame)
        for name in names:tracks[name].append(tuple(rig.pose.bones[name].rotation_quaternion))
    corrected={name:smooth(track,cap) for name,track in tracks.items()}
    def jumps(values):return [angle(a,b) for track in values.values() for a,b in zip(track,track[1:])]
    before,after=jumps(tracks),jumps(corrected)
    deviations=[angle(a,b) for name in names for a,b in zip(tracks[name],corrected[name])]
    for i,frame in enumerate(frames):
        scene.frame_set(frame)
        for name in names:
            bone=rig.pose.bones[name];bone.rotation_quaternion=corrected[name][i]
            bone.keyframe_insert('rotation_quaternion',frame=frame)
    action.name='DRAFT_operation_smoothed_unreviewed'
    for curve in action.fcurves:
        for point in curve.keyframe_points:point.interpolation='LINEAR'
    # Approximate torso envelope: highlights candidates, not mesh collision proof.
    suspects=[]
    for frame in frames:
        scene.frame_set(frame);bpy.context.view_layer.update()
        points=[]
        for name in names:
            if not name.startswith(('wrist','finger')):continue
            p=rig.pose.bones[name].head
            if .85<p.z<1.31 and (p.x/.18)**2+((p.y+.015)/.125)**2<1:
                points.append(name)
        if points:suspects.append({'frame':frame,'joints':points})
    review={'method':'centered three-frame quaternion smoothing; endpoints preserved',
        'maxAllowedCorrectionDegrees':cap,'maxActualCorrectionDegrees':max(deviations,default=0),
        'peakFrameRotationBeforeDegrees':max(before,default=0),'peakFrameRotationAfterDegrees':max(after,default=0),
        'meanFrameRotationBeforeDegrees':sum(before)/max(1,len(before)),
        'meanFrameRotationAfterDegrees':sum(after)/max(1,len(after)),
        'torsoProximityCandidates':suspects,
        'largeRotationCandidates':[{'bone':name,'frame':frames[i+1],'degrees':angle(a,b)} for name,track in tracks.items() for i,(a,b) in enumerate(zip(track,track[1:])) if angle(a,b)>60],
        'limitations':['Torso envelope is approximate; not a mesh collision test',
        'No automatic contact correction; no finger limits imposed',
        'Smoothing can change meaningful motion; compare source and obtain KSL review']}
    output.mkdir(parents=True)
    scene.frame_set(frames[0]);bpy.context.view_layer.update()
    bpy.ops.export_scene.gltf(filepath=str(output/'draft-operation.glb'),export_format='GLB',use_active_scene=True,
        export_animations=True,export_frame_range=True,export_force_sampling=True,export_extras=True,
        export_cameras=False,export_lights=False)
    bpy.ops.wm.save_as_mainfile(filepath=str(output/'draft-operation.blend'))
    report['clipName']=action.name;report['refinement']=review
    (output/'retarget-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
    print(json.dumps(review))


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--folder',required=True);p.add_argument('--output',required=True)
    p.add_argument('--max-degrees',type=float,default=3)
    a=p.parse_args();refine(a.folder,a.output,a.max_degrees)
