"""Build an original business-presenter look on the CC0 female MakeHuman base."""
import argparse
import json
import math
from pathlib import Path
import sys


def style(model, output, profile='business'):
    import bpy
    from mathutils import Vector
    output = Path(output)
    if profile not in ('business','blue-shirt','blonde-updo'):raise ValueError('Unknown character profile')
    blue = profile=='blue-shirt'
    updo = profile=='blonde-updo'
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
    skin=material('Warm skin',(.66,.40,.28),.85);black=material('Black tailored jacket',(.012,.017,.026),.85)
    lapel=material('Lapel satin',(.026,.032,.04),.47);white=material('Ivory shirt',(.88,.90,.88))
    hairmat=material('Soft black bob',(.014,.010,.009),.72);lip=material('Natural lip',(.43,.17,.15),.8)
    eyewhite=material('Eye white',(.8,.82,.78),.35);iris=material('Brown iris',(.085,.038,.019),.3)
    pupil=material('Pupil and brow',(.008,.006,.005),.35)
    if blue:
        black=material('Sky blue cotton shirt',(.33,.43,.64),.8)
        hairmat=material('Dark brown parted hair',(.035,.022,.016),.65)
        collar_mat=material('Blue folded collar',(.28,.37,.57),.8)
    else:collar_mat=white
    if updo:
        hairmat=material('Honey blonde hair',(.47,.24,.073),.48)
        iris=material('Hazel iris',(.16,.085,.025),.4)
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
    rings=[(.70,.15,.10),(.80,.145,.095),(.90,.135,.085),(1.00,.12,.09),(1.10,.135,.105),(1.20,.16,.115),(1.27,.17,.09),(1.31,.13,.065),(1.335,.05,.045)]
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
    mesh('Shirt collar band',collar_vertices,collar_faces,collar_mat,'spine01')
    if not blue:
        mesh('White shirt front',[(0,-.128,1.075),(-.070,-.133,1.27),(-.035,-.075,1.335),(.035,-.075,1.335),(.070,-.133,1.27)],[(0,1,2,3,4)],white,'spine01')
    else:
        placket=[]
        for z,rx,ry in rings[:-1]:
            placket.extend([(-.008,-.018-ry,z),(.008,-.018-ry,z)])
        seam=mesh('Shirt button placket',placket,[(i*2,i*2+1,i*2+3,i*2+2) for i in range(len(rings)-2)],collar_mat)
        garment_weights(seam)
        for z in (.85,.97,1.09,1.21):
            lo,hi=next((a,b) for a,b in zip(rings,rings[1:]) if a[0]<=z<=b[0])
            ry=lo[2]+(hi[2]-lo[2])*(z-lo[0])/(hi[0]-lo[0])
            with bpy.context.temp_override(scene=scene,view_layer=scene.view_layers[0]):
                bpy.ops.mesh.primitive_uv_sphere_add(segments=16,ring_count=8,location=(0,-.023-ry,z))
                button=bpy.context.object;button.name='Pearl shirt button';button.scale=(.005,.002,.005)
                bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
            button.data.materials.append(white);garment_weights(button)
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
    remove=[f for f in bm.faces if (.72<f.calc_center_median().z<1.325 or (1.325<=f.calc_center_median().z<1.35 and abs(f.calc_center_median().x)>.047)) and not any(v.index in keep_hand for v in f.verts)]
    bmesh.ops.delete(bm,geom=remove,context='FACES_ONLY');bm.to_mesh(body.data);bm.free();body.data.update()
    for side in (-1,1):
        if not blue:mesh('Jacket lapel '+str(side),[(side*.050,-.08,1.321),(side*.105,-.116,1.26),(side*.018,-.139,1.10),(side*.054,-.14,1.22)],[(0,1,2,3)],lapel,'spine01')
        mesh('Folded collar '+str(side),[(side*.012,-.063,1.342),(side*.057,-.082,1.322),(side*.060,-.116,1.272),(side*.014,-.091,1.31)],[(0,1,2,3)],collar_mat,'spine01')
    # Swept, ear-length bob: cap and sides are one smooth shell, weighted to head.
    vertices=[];faces=[];segments=96;rows=24
    for row in range(rows+1):
        t=row/rows
        for col in range(segments):
            angle=2*math.pi*col/segments
            a=(angle+math.pi)%(2*math.pi)-math.pi
            fringe=(1.55+.012*math.sin(a)) if updo else (1.525+.035*math.sin(a) if not blue else 1.51+.065*math.exp(-(a/.4)**2))
            blend=min(1,max(0,(abs(a)-.72)/.48));blend=blend*blend*(3-2*blend)
            bottom=fringe*(1-blend)+(1.48 if updo else (1.435 if blue else 1.365))*blend
            top=1.64 if blue else 1.615
            z=top+(bottom-top)*t
            radius=math.sqrt(max(0,1-((z-1.49)/(.151 if blue else .126))**2)) if z>=1.49 else 1-.12*(1.49-z)/.125
            vertices.append((.097*radius*math.sin(angle),-.005-.145*radius*math.cos(angle),z))
    for row in range(rows):
        for col in range(segments):
            a=row*segments+col;b=row*segments+(col+1)%segments
            faces.append((a,b,b+segments,a+segments))
    hair=mesh('Side-part black bob',vertices,faces,hairmat,'head')
    solid=hair.modifiers.new('Hair thickness','SOLIDIFY');solid.thickness=.004
    if updo:
        def hair_tube(name,points,radius,mat):
            verts=[];faces=[];radial=10
            for i,center in enumerate(points):
                center=Vector(center)
                tangent=(Vector(points[min(i+1,len(points)-1)])-Vector(points[max(0,i-1)])).normalized()
                x=tangent.cross(Vector((0,1,0))).normalized()
                if x.length<.5:x=tangent.cross(Vector((1,0,0))).normalized()
                y=tangent.cross(x).normalized()
                r=radius*(.30+.70*math.sin(math.pi*(i+.5)/len(points)))
                for j in range(radial):
                    a=2*math.pi*j/radial;verts.append(tuple(center+r*(math.cos(a)*x+math.sin(a)*y)))
            for i in range(len(points)-1):
                for j in range(radial):faces.append((i*radial+j,i*radial+(j+1)%radial,(i+1)*radial+(j+1)%radial,(i+1)*radial+j))
            return mesh(name,verts,faces,mat,'head')
        with bpy.context.temp_override(scene=scene,view_layer=scene.view_layers[0]):
            bpy.ops.mesh.primitive_uv_sphere_add(segments=40,ring_count=24,location=(0,.045,1.645))
            bun=bpy.context.object;bun.name='Blonde gathered bun';bun.scale=(.065,.060,.066)
            bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
        bun.data.materials.append(hairmat);attach(bun,'head')
        for p in bun.data.polygons:p.use_smooth=True
        highlight=material('Golden hair ribbons',(.58,.34,.12),.55)
        for k in range(9):
            angle=2*math.pi*k/9;points=[]
            for i in range(30):
                t=i/29;a=angle+.8*t
                points.append((.066*math.cos(a)*math.sin(math.pi*t),.045+.061*math.sin(a)*math.sin(math.pi*t),1.645+.067*math.cos(math.pi*t)))
            hair_tube('Coiled bun strand',points,.006,highlight)
        for side in (-1,1):
            for layer in range(5):
                points=[]
                for i in range(30):
                    t=i/29
                    points.append((side*(.008+.09*math.sin(t*math.pi/2)),
                        -.03-layer*.012-.083*math.sin(t*math.pi/2),1.615-layer*.003-.102*t*t))
                hair_tube('Swept golden fringe',points,.009,hairmat if layer%2 else highlight)
            points=[]
            for i in range(45):
                t=i/44;points.append((side*(.083+.011*math.sin(t*math.pi*3)), -.105-.018*math.sin(t*math.pi*2),1.525-.16*t))
            hair_tube('Loose face framing curl',points,.0045,highlight)
    if blue:
        # Tapered overlapping locks give the center-part silhouette visible volume.
        for side in (-1,1):
            for layer in range(6):
                verts=[];faces=[];steps=22;radial=10
                def path(t):
                    return Vector((side*(.006+.089*math.sin(t*math.pi/2)),
                        -.025-layer*.009-.095*math.sin(t*math.pi/2),
                        1.633-layer*.007-.13*t*t))
                for i in range(steps+1):
                    t=i/steps;c=path(t);direction=(path(min(1,t+.01))-path(max(0,t-.01))).normalized()
                    x=direction.cross(Vector((0,1,0))).normalized();y=direction.cross(x).normalized()
                    radius=.014*(.35+.65*math.sin(math.pi*t))*(1-.75*t)
                    for j in range(radial):
                        a=2*math.pi*j/radial;verts.append(tuple(c+radius*(math.cos(a)*x+.7*math.sin(a)*y)))
                for i in range(steps):
                    for j in range(radial):faces.append((i*radial+j,i*radial+(j+1)%radial,(i+1)*radial+(j+1)%radial,(i+1)*radial+j))
                mesh('Swept brown lock',verts,faces,hairmat,'head')
    # Eye detail on the actual rig eye locations, and thin curved eyebrows.
    for side in (-1,1):
        for name,mat,scale,dy in [('Iris',iris,(.008,.002,.008),-.132),('Pupil',pupil,(.004,.0015,.005),-.134),('Eye glint',white,(.0015,.001,.0015),-.136)]:
            with bpy.context.temp_override(scene=scene,view_layer=scene.view_layers[0]):
                bpy.ops.mesh.primitive_uv_sphere_add(segments=20,ring_count=12,location=(side*.02845,dy,1.4902))
                obj=bpy.context.object;obj.name=name+str(side);obj.scale=scale
                if name=='Eye glint':obj.location.x-=.002;obj.location.z+=.003
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
    # A gently oversized, softer head creates an animation-style adult presenter.
    # Only head-region vertices change; signing hands and arm bone lengths stay intact.
    for obj in list(scene.objects):
        if obj.type!='MESH':continue
        for vertex in obj.data.vertices:
            co=vertex.co
            if co.z<=1.36:continue
            blend=min(1,max(0,(co.z-1.36)/.065));blend=blend*blend*(3-2*blend)
            if obj==body:
                # Reduce the strongly projecting nose and relax the open lower lip.
                nose=math.exp(-((co.x/.018)**2+((co.z-1.455)/.025)**2))
                if co.y<-.11:co.y+=.010*nose
                mouth=math.exp(-((co.x/.029)**4+((co.z-1.422)/.014)**4))
                if co.y<-.09:co.z+=(1.424-co.z)*.45*mouth
                if blue and co.y<-.09:
                    co.z+=.0025*mouth*min(1,abs(co.x)/.018)
            if updo and (obj in (body,eyes) or obj.name.startswith(('Iris','Pupil','Eye glint'))):
                eye_x=.02845 if co.x>=0 else -.02845
                eye_weight=math.exp(-(((co.x-eye_x)/.023)**4+((co.z-1.4902)/.018)**4)) if co.y<-.085 else 0
                co.z+=(co.z-1.4902)*.28*eye_weight
                co.x+=(co.x-eye_x)*.10*eye_weight
            co.x*=1+.13*blend
            co.z+=.08*(co.z-1.40)*blend
            if blue and (obj==hair or obj.name.startswith('Swept brown lock')):
                co.x*=1.16
                co.z=1.49+(co.z-1.49)*1.09
        obj.data.update()
    scene['design']='Original animation-style adult presenter; softly enlarged head, natural signing hands; CC0 base.'
    output.mkdir(parents=True)
    bpy.context.window.scene=scene;bpy.context.view_layer.update()
    bpy.ops.export_scene.gltf(filepath=str(output/'presenter-female.glb'),export_format='GLB',use_active_scene=True,export_animations=False,export_apply=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(output/'presenter-female.blend'))
    (output/'design.json').write_text(json.dumps({'renderStyle':('soft-3d' if blue or updo else 'animation'),'profile':profile,'base':'CC0 Innerscene/MakeHuman female','source':'https://www.innerscene.com/tools/library/3d-parts/female-base-mesh-3d-person-rigged-a-pose-dba97ed5','changes':(['Sky blue shirt, folded collar, placket and buttons','Short dark brown center-part hair with swept locks','Subtle resting smile'] if blue else (['Honey blonde updo, gathered bun, swept fringe and loose curls','Black suit and white collared shirt','Larger stylized eyes with hazel irises'] if updo else ['Procedural weighted black jacket and trousers','White shirt and collar','Black bob hair']))+['Animation-style head proportions, softer face, larger irises and eye highlights','Original signing hand proportions preserved'],'skeletonBones':len(rig.data.bones)},indent=2),encoding='utf8')


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--model',required=True);p.add_argument('--output',required=True)
    p.add_argument('--profile',choices=['business','blue-shirt','blonde-updo'],default='business')
    args=p.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else None)
    style(args.model,args.output,args.profile)
