"""Build an original business-presenter look on the CC0 female MakeHuman base."""
import argparse
import json
import math
from pathlib import Path
import sys


def style(model, output):
    import bpy
    from mathutils import Vector
    output = Path(output)
    if output.exists():
        raise ValueError('Choose a new output folder')
    scene=bpy.data.scenes.new('SignAll_business_presenter')
    bpy.context.window.scene=scene
    with bpy.context.temp_override(scene=scene,view_layer=scene.view_layers[0]):
        bpy.ops.import_scene.gltf(filepath=str(Path(model).resolve()))
    bpy.context.view_layer.update()
    rig=next(o for o in scene.objects if o.type=='ARMATURE')
    body=next(o for o in scene.objects if o.type=='MESH' and len(o.data.vertices)>10000)
    eyes=next(o for o in scene.objects if o.type=='MESH' and o!=body)
    def material(name,color,roughness=.65):
        m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
        bsdf=m.node_tree.nodes.get('Principled BSDF');bsdf.inputs['Base Color'].default_value=(*color,1)
        bsdf.inputs['Roughness'].default_value=roughness
        bsdf.inputs['Specular IOR Level'].default_value=.22
        return m
    skin=material('Warm skin',(.52,.29,.19));black=material('Black tailored jacket',(.006,.008,.011))
    lapel=material('Lapel satin',(.026,.032,.04),.47);white=material('Ivory shirt',(.88,.90,.88))
    hairmat=material('Soft black bob',(.008,.006,.005),.42);lip=material('Natural lip',(.35,.10,.09))
    eyewhite=material('Eye white',(.8,.82,.78),.35);iris=material('Brown iris',(.085,.038,.019),.3)
    pupil=material('Pupil and brow',(.008,.006,.005),.35)
    body.data.materials.clear();body.data.materials.append(skin);body.data.materials.append(lip);body.data.materials.append(black)
    for p in body.data.polygons:
        p.use_smooth=True
        c=p.center
        if abs(c.x)<.024 and 1.415<c.z<1.429 and c.y<-.105:p.material_index=1
        if c.z<.85:p.material_index=2
    eyes.data.materials.clear();eyes.data.materials.append(eyewhite)
    def attach(obj,bone):
        obj.parent=rig
        vg=obj.vertex_groups.new(name=bone);vg.add(list(range(len(obj.data.vertices))),1,'REPLACE')
        mod=obj.modifiers.new('Presenter rig','ARMATURE');mod.object=rig
    def mesh(name,vertices,faces,mat,bone=None):
        m=bpy.data.meshes.new(name);m.from_pydata(vertices,[],faces);m.update()
        o=bpy.data.objects.new(name,m);scene.collection.objects.link(o);m.materials.append(mat)
        for p in m.polygons:p.use_smooth=True
        if bone:attach(o,bone)
        return o
    # Smooth tailored torso and sleeves, with nearest-body skin weights.
    from mathutils.kdtree import KDTree
    kd=KDTree(len(body.data.vertices))
    for v in body.data.vertices:kd.insert(v.co,v.index)
    kd.balance()
    def garment_weights(obj):
        obj.parent=rig
        for group in body.vertex_groups:obj.vertex_groups.new(name=group.name)
        for v in obj.data.vertices:
            _,i,_=kd.find(v.co)
            for g in body.data.vertices[i].groups:obj.vertex_groups[g.group].add([v.index],g.weight,'REPLACE')
        mod=obj.modifiers.new('Weighted outfit','ARMATURE');mod.object=rig
    rings=[(.80,.14,.09),(.90,.135,.085),(1.00,.115,.085),(1.10,.135,.105),(1.20,.16,.115),(1.27,.17,.09),(1.31,.13,.065),(1.335,.05,.045)]
    verts=[];faces=[];n=64
    for z,rx,ry in rings:
        for j in range(n):
            a=2*math.pi*j/n;verts.append((rx*math.sin(a),-.015-ry*math.cos(a),z))
    for r in range(len(rings)-1):
        for j in range(n):faces.append((r*n+j,r*n+(j+1)%n,(r+1)*n+(j+1)%n,(r+1)*n+j))
    jacket=mesh('Tailored blazer body',verts,faces,black);garment_weights(jacket)
    # White shirt insert with smooth edges in front of the blazer.
    collar_vertices=[];collar_faces=[]
    for z in (1.318,1.355):
        for j in range(48):
            a=2*math.pi*j/48
            collar_vertices.append((.054*math.sin(a),-.018-.055*math.cos(a),z))
    for j in range(48):collar_faces.append((j,(j+1)%48,(j+1)%48+48,j+48))
    mesh('Shirt collar band',collar_vertices,collar_faces,white,'spine01')
    mesh('White shirt front',[(0,-.128,1.075),(-.070,-.133,1.27),(-.035,-.075,1.335),(.035,-.075,1.335),(.070,-.133,1.27)],[(0,1,2,3,4)],white,'spine01')
    for side in ('L','R'):
        b=rig.data.bones
        shoulder=b['upperarm01.'+side].head_local;elbow=b['lowerarm01.'+side].head_local;wrist=b['wrist.'+side].head_local
        path=[]
        for k in range(9):
            t=k/8
            center=shoulder.lerp(elbow,min(t*2,1)) if t<=.5 else elbow.lerp(wrist,(t-.5)*2)
            direction=(elbow-shoulder).normalized() if t<.5 else (wrist-elbow).normalized()
            radius=.055*(1-t)+.030*t
            x=direction.cross(Vector((0,1,0))).normalized();y=direction.cross(x).normalized()
            path.append((center,direction,radius,x,y))
        verts=[];faces=[];segments=32
        for center,direction,radius,x,y in path:
            for j in range(segments):
                a=2*math.pi*j/segments;verts.append(tuple(center+radius*(math.cos(a)*x+math.sin(a)*y)))
        for r in range(len(path)-1):
            for j in range(segments):faces.append((r*segments+j,r*segments+(j+1)%segments,(r+1)*segments+(j+1)%segments,(r+1)*segments+j))
        sleeve=mesh('Jacket sleeve '+side,verts,faces,black);garment_weights(sleeve)
        with bpy.context.temp_override(scene=scene,view_layer=scene.view_layers[0]):
            bpy.ops.mesh.primitive_uv_sphere_add(segments=24,ring_count=16,location=shoulder)
            cap=bpy.context.object;cap.name='Tailored shoulder '+side;cap.scale=(.058,.059,.058)
            bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
        cap.data.materials.append(black);attach(cap,'upperarm01.'+side)
        for p in cap.data.polygons:p.use_smooth=True
    # Remove only the covered body faces, preventing skin/garment intersections.
    import bmesh
    keep_hand={v.index for v in body.data.vertices if sum(g.weight for g in v.groups if body.vertex_groups[g.group].name.startswith(('wrist','finger','metacarpal')))> .12}
    bm=bmesh.new();bm.from_mesh(body.data);bm.faces.ensure_lookup_table()
    remove=[f for f in bm.faces if (.85<f.calc_center_median().z<1.325 or (1.325<=f.calc_center_median().z<1.35 and abs(f.calc_center_median().x)>.047)) and not any(v.index in keep_hand for v in f.verts)]
    bmesh.ops.delete(bm,geom=remove,context='FACES_ONLY');bm.to_mesh(body.data);bm.free();body.data.update()
    for side in (-1,1):
        mesh('Jacket lapel '+str(side),[(side*.050,-.08,1.321),(side*.105,-.116,1.26),(side*.018,-.139,1.10),(side*.054,-.14,1.22)],[(0,1,2,3)],lapel,'spine01')
        mesh('White collar '+str(side),[(side*.012,-.063,1.342),(side*.052,-.082,1.322),(side*.043,-.116,1.278),(side*.008,-.091,1.31)],[(0,1,2,3)],white,'spine01')
    # Swept, ear-length bob: cap and sides are one smooth shell, weighted to head.
    vertices=[];faces=[];segments=96;rows=24
    for row in range(rows+1):
        t=row/rows
        for col in range(segments):
            angle=2*math.pi*col/segments
            a=(angle+math.pi)%(2*math.pi)-math.pi
            fringe=1.525+.035*math.sin(a)
            blend=min(1,max(0,(abs(a)-.72)/.48));blend=blend*blend*(3-2*blend)
            bottom=fringe*(1-blend)+1.365*blend
            z=1.615+(bottom-1.615)*t
            radius=math.sqrt(max(0,1-((z-1.49)/.126)**2)) if z>=1.49 else 1-.12*(1.49-z)/.125
            vertices.append((.097*radius*math.sin(angle),-.005-.145*radius*math.cos(angle),z))
    for row in range(rows):
        for col in range(segments):
            a=row*segments+col;b=row*segments+(col+1)%segments
            faces.append((a,b,b+segments,a+segments))
    hair=mesh('Side-part black bob',vertices,faces,hairmat,'head')
    solid=hair.modifiers.new('Hair thickness','SOLIDIFY');solid.thickness=.004
    # Eye detail on the actual rig eye locations, and thin curved eyebrows.
    for side in (-1,1):
        for name,mat,scale,dy in [('Iris',iris,(.0055,.0018,.0062),-.132),('Pupil',pupil,(.0028,.001,.0035),-.134)]:
            with bpy.context.temp_override(scene=scene,view_layer=scene.view_layers[0]):
                bpy.ops.mesh.primitive_uv_sphere_add(segments=20,ring_count=12,location=(side*.02845,dy,1.4902))
                obj=bpy.context.object;obj.name=name+str(side);obj.scale=scale
                bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
            obj.data.materials.append(mat);attach(obj,'head')
            for p in obj.data.polygons:p.use_smooth=True
        curve=bpy.data.curves.new('Brow','CURVE');curve.dimensions='3D';curve.bevel_depth=.0018;curve.bevel_resolution=3
        spline=curve.splines.new('BEZIER');spline.bezier_points.add(2)
        for point,co in zip(spline.bezier_points,[(side*.013,-.126,1.514),(side*.03,-.128,1.519),(side*.046,-.116,1.514)]):
            point.co=co;point.handle_left_type=point.handle_right_type='AUTO'
        obj=bpy.data.objects.new('Eyebrow '+str(side),curve);scene.collection.objects.link(obj);curve.materials.append(pupil)
        with bpy.context.temp_override(scene=scene,view_layer=scene.view_layers[0]):
            bpy.context.view_layer.update()
            evaluated=obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
            brow_mesh=bpy.data.meshes.new_from_object(evaluated)
        brow=bpy.data.objects.new('Eyebrow mesh '+str(side),brow_mesh);scene.collection.objects.link(brow)
        bpy.data.objects.remove(obj,do_unlink=True)
        attach(brow,'head')
    scene['design']='Original procedural business outfit and bob hairstyle inspired by user reference; CC0 base.'
    output.mkdir(parents=True)
    bpy.context.window.scene=scene;bpy.context.view_layer.update()
    bpy.ops.export_scene.gltf(filepath=str(output/'presenter-female.glb'),export_format='GLB',use_active_scene=True,export_animations=False,export_apply=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(output/'presenter-female.blend'))
    (output/'design.json').write_text(json.dumps({'base':'CC0 Innerscene/MakeHuman female','source':'https://www.innerscene.com/tools/library/3d-parts/female-base-mesh-3d-person-rigged-a-pose-dba97ed5','changes':['Procedural weighted black jacket and trousers','White shirt and collar','Black bob hair','Skin, lips, eyes and eyebrows'],'skeletonBones':len(rig.data.bones)},indent=2),encoding='utf8')


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--model',required=True);p.add_argument('--output',required=True)
    args=p.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else None)
    style(args.model,args.output)
