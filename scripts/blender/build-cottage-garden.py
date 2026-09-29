"""Two modest kitchen beds: modelled cabbage rosettes and scanned CC0 nettles.
Local garden origin is its centre, Y up on export. Place at cottage local(-7.5,0,5.8).
"""
import bpy, math, random, json
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2];ART=ROOT/'art/lakeside-cottage';OUT=ROOT/'public/assets/lakeside'
random.seed(84)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
S=bpy.context.scene
def v(p):return Vector((p[0],-p[2],p[1]))
with bpy.data.libraries.load(str(ART/'rowan-cottage.blend'),link=False) as (src,dst):
    dst.materials=[n for n in src.materials if n in ['Weathered structural oak','Forged dark iron','Honey glazed crockery']]
wood=bpy.data.materials['Weathered structural oak'];iron=bpy.data.materials['Forged dark iron']
def mat(name,color=(1,1,1,1),image=None,normal=None):
    m=bpy.data.materials.new(name);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=color;p.inputs['Roughness'].default_value=.94
    if image:
        t=m.node_tree.nodes.new('ShaderNodeTexImage');t.image=bpy.data.images.load(str(image));m.node_tree.links.new(t.outputs['Color'],p.inputs['Base Color'])
    if normal:
        t=m.node_tree.nodes.new('ShaderNodeTexImage');t.image=bpy.data.images.load(str(normal));t.image.colorspace_settings.name='Non-Color';n=m.node_tree.nodes.new('ShaderNodeNormalMap');n.inputs['Strength'].default_value=.4;m.node_tree.links.new(t.outputs['Color'],n.inputs['Color']);m.node_tree.links.new(n.outputs['Normal'],p.inputs['Normal'])
    return m
soil=mat('Kitchen garden cultivated soil',image=ROOT/'public/assets/props/soil_a.webp',normal=ROOT/'public/assets/props/soil_n.webp')
leaf=mat('Cabbage outer leaf',(.105,.205,.090,1))
leaf2=mat('Cabbage tender heart',(.235,.34,.13,1))
vein=mat('Pale cabbage midribs',(.28,.35,.17,1))
stem=mat('Nettle cut stalk',(.12,.17,.055,1))
# The leaf microtexture is from a real CC0 scan. Shapes and veins belong to these cabbage meshes.
for m in(leaf,leaf2):
    t=m.node_tree.nodes.new('ShaderNodeTexImage');t.image=bpy.data.images.load(str(ART/'sources/nettle/textures/nettle_plant_nor_gl_1k.jpg'));t.image.colorspace_settings.name='Non-Color'
    n=m.node_tree.nodes.new('ShaderNodeNormalMap');n.inputs['Strength'].default_value=.25;m.node_tree.links.new(t.outputs['Color'],n.inputs['Color']);m.node_tree.links.new(n.outputs['Normal'],m.node_tree.nodes.get('Principled BSDF').inputs['Normal'])
root=bpy.data.objects.new('elin_kitchen_garden',None);S.collection.objects.link(root);root['assetPart']='garden'
def add(o,name,m):
    o.name=name;o.parent=root;o.data.materials.append(m);o['assetPart']='garden';return o
def uv(o,tile=1):
    u=o.data.uv_layers.new(name='UVMap') if not o.data.uv_layers else o.data.uv_layers.active
    for p in o.data.polygons:
        axis=max(range(3),key=lambda i:abs(p.normal[i]))
        for li in p.loop_indices:
            q=o.matrix_world@o.data.vertices[o.data.loops[li].vertex_index].co
            c=(q.y,q.z) if axis==0 else(q.x,q.z) if axis==1 else(q.x,q.y);u.data[li].uv=(c[0]/tile,c[1]/tile)
def cube(name,p,size,m,bevel=.012):
    bpy.ops.mesh.primitive_cube_add(size=1,location=v(p));o=bpy.context.object;o.dimensions=(size[0],size[2],size[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);add(o,name,m);uv(o,1.8)
    if bevel:
        mod=o.modifiers.new('Weathered edges','BEVEL');mod.width=bevel;mod.segments=1;bpy.ops.object.modifier_apply(modifier=mod.name)
    return o
def mesh(name,verts,faces,m):
    me=bpy.data.meshes.new(name);me.from_pydata([v(p) for p in verts],[],faces);me.update();o=bpy.data.objects.new(name,me);S.collection.objects.link(o);add(o,name,m);uv(o)
    for p in me.polygons:p.use_smooth=True
    return o
def line(name,points,r,m):
    curve=bpy.data.curves.new(name,'CURVE');curve.dimensions='3D';curve.bevel_depth=r;curve.bevel_resolution=0;curve.resolution_u=1
    spline=curve.splines.new('POLY');spline.points.add(len(points)-1)
    for k,p in enumerate(points):spline.points[k].co=(*v(p),1)
    o=bpy.data.objects.new(name,curve);S.collection.objects.link(o);o.parent=root;o.data.materials.append(m);o['assetPart']='garden';return o
colliders=[]
for x in(-1.15,1.15):
    cube('garden_soil',(x,-.035,0),(1.62,.11,3.42),soil,.025)
    # Hand-hewn boards held by corner pegs, low enough to step over.
    for dx in(-.82,.82):
        cube('bed_border',(x+dx,.045,0),(.07,.20,3.54),wood)
        colliders.append(dict(id='garden_border',center=[x+dx,.045,0],size=[.07,.20,3.54],floor=True))
    for z in(-1.76,1.76):
        cube('bed_end',(x,.045,z),(1.70,.20,.065),wood)
        colliders.append(dict(id='garden_border',center=[x,.045,z],size=[1.7,.20,.065],floor=True))
    for dx in(-.86,.86):
      for z in(-1.79,1.79):
        cube('bed_corner_peg',(x+dx,.09,z),(.08,.28,.08),wood,.008)
        colliders.append(dict(id='garden_corner_peg',center=[x+dx,.09,z],size=[.08,.28,.08],floor=True))
    colliders.append(dict(id='garden_soil',center=[x,-.035,0],size=[1.62,.11,3.42],floor=True))
def cabbage(cx,cz,s):
    angle=random.random()*math.tau
    # Loose outer leaves curl upward around the smaller, tightly overlapping heart.
    for inner,count in((False,8),(True,8)):
      for k in range(count):
        a=angle+k*math.tau/count+(0.3 if inner else 0)+random.uniform(-.11,.11);verts=[];faces=[];mid=[]
        nt=14;nw=10;leafsize=random.uniform(.93,1.05)
        def point(t,w):
            if inner:
                radial=.18*math.sin(math.pi*t);y=.025+.33*math.sin(t*math.pi/2)
                width=.11*math.sin(math.pi*t)**.7
            else:
                radial=.018+.38*t*leafsize;y=.020+.19*math.sin(t*math.pi*.87)+.013*t
                width=.19*math.sin(math.pi*t)**.45
            lateral=w*width;wave=.010*math.sin(t*15+k)*abs(w)**3
            y+=(w*w*.045+wave) if not inner else (w*w*.02+wave)
            return(cx+s*(radial*math.cos(a)-lateral*math.sin(a)),.022+s*y,cz+s*(radial*math.sin(a)+lateral*math.cos(a)))
        for j in range(nt+1):
          for i in range(nw+1):verts.append(point(j/nt,(i/nw)*2-1))
        for j in range(nt):
          for i in range(nw):idx=j*(nw+1)+i;faces.append((idx,idx+1,idx+nw+2,idx+nw+1))
        o=mesh('cabbage_curled_leaf',verts,faces,leaf2 if inner else leaf)
        # Sample a vein-bearing, fully filled part of the scanned nettle normal atlas.
        for p in o.data.polygons:
          for li in p.loop_indices:
            idx=o.data.loops[li].vertex_index;j=idx//(nw+1);i=idx%(nw+1)
            o.data.uv_layers.active.data[li].uv=(.44+.09*i/nw,.19+.065*j/nt)
        if not inner:
            pts=[point(t,0) for t in (.07,.25,.43,.61,.79,.94)]
            pts=[(x,y+.004,z) for x,y,z in pts];line('cabbage_midrib',pts,.0035*s,vein)
            for t in(.30,.47,.64):
              for side in(-1,1):
                pts=[point(t,0),point(t+.08,side*.48),point(t+.13,side*.84)]
                line('cabbage_side_vein',[(x,y+.004,z) for x,y,z in pts],.0019*s,vein)
for x in(-1.52,-.79):
 for z in(-1.12,-.03,1.08):cabbage(x+random.uniform(-.025,.025),z+random.uniform(-.035,.035),random.uniform(.82,1.02))
# Scanned nettles retain their authored geometry/UVs; six young edible greens in a separate bed.
bpy.ops.import_scene.gltf(filepath=str(ART/'sources/nettle/nettle.gltf'))
imported=[o for o in bpy.context.selected_objects if o.type=='MESH']
all_imported=set(bpy.context.selected_objects)
sources=[o for o in imported if 'medium_a' in o.name or 'small_a' in o.name]
for o in imported:
    bpy.context.view_layer.objects.active=o;bpy.ops.object.select_all(action='DESELECT');o.select_set(True)
    mod=o.modifiers.new('Garden distance optimisation','DECIMATE');mod.ratio=.42;bpy.ops.object.modifier_apply(modifier=mod.name)
for i,(x,z) in enumerate([(x,z) for x in(.78,1.48) for z in(-1.15,-.07,1.05)]):
    original=sources[i%len(sources)];o=original.copy();o.data=original.data.copy();S.collection.objects.link(o)
    bpy.context.view_layer.update()
    # Apply inherited transforms then centre each scan at its real root / soil.
    mw=original.matrix_world.copy();verts=[mw@q.co for q in o.data.vertices]
    minz=min(q.z for q in verts);meanx=sum(q.x for q in verts)/len(verts);meany=sum(q.y for q in verts)/len(verts)
    scale=.49/(max(q.z for q in verts)-minz)
    for q,p in zip(o.data.vertices,verts):q.co=(p-Vector((meanx,meany,minz)))*scale
    o.matrix_world.identity();o.parent=root;o.location=v((x,.023,z));o.rotation_euler[2]=random.random()*math.tau;o.name='garden_scanned_nettle';o['assetPart']='garden'
for o in all_imported:
    if o.name in bpy.data.objects:bpy.data.objects.remove(o,do_unlink=True)
# A hand fork leaning alongside a bed gives the work stop a real activity.
cube('garden_fork_handle',(2.01,.52,1.40),(.035,.88,.035),wood,.005)
cube('garden_fork_socket',(2.01,.13,1.40),(.065,.14,.055),iron,.005)
cube('garden_fork_crosspiece',(2.01,.055,1.40),(.19,.055,.045),iron,.004)
for x in(1.94,2.01,2.08):cube('garden_fork_tine',(x,-.005,1.40),(.014,.11,.015),iron,.002)
# Convert curves and group by material into a handful of draw calls.
bpy.ops.object.select_all(action='DESELECT')
for o in list(root.children):o.select_set(True)
bpy.context.view_layer.objects.active=next(o for o in root.children if o.type=='MESH')
bpy.ops.object.convert(target='MESH')
groups={}
for o in root.children:
 if o.type=='MESH':groups.setdefault(tuple(m.name for m in o.data.materials),[]).append(o)
for i,obs in enumerate(groups.values()):
    bpy.ops.object.select_all(action='DESELECT')
    for o in obs:o.select_set(True)
    bpy.context.view_layer.objects.active=obs[0]
    if len(obs)>1:bpy.ops.object.join()
    o=bpy.context.object;o.name=f'garden_{i:02d}';o['assetPart']='garden'
    o['staticCameraSolid']=any(m in (wood,iron,soil) for m in o.data.materials)
for im in bpy.data.images:
    if im.source=='FILE':im.pack()
bpy.ops.object.select_all(action='DESELECT');root.select_set(True)
for o in root.children:o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'elin-garden.glb'),export_format='GLB',use_selection=True,export_yup=True,export_extras=True)
triangles=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in root.children if o.type=='MESH')
manifest=dict(asset='elin-garden',units='metres',upAxis='Y',placeAtCottageLocal=[-7.5,0,5.8],size=[4.21,.96,3.66],soilTop=.02,colliders=colliders,triangles=triangles,materialSources=[dict(id='nettle_plant',url='https://polyhaven.com/a/nettle_plant',licence='CC0',use='Scanned nettle geometry, leaf maps and cabbage leaf micro-normal detail'),dict(id='farm_soil',url='https://polyhaven.com/a/farm_soil',licence='CC0')],notes=['Two low timber raised beds. Centre walkway is clear. Border/soil boxes are walkable; foliage stays soft.','Cabbages are original curved leaf meshes with visible ribs, based on the CC0 Alabama Extension raised-bed photograph; they are not harvested by this asset alone.'])
(OUT/'elin-garden.manifest.json').write_text(json.dumps(manifest,indent=2));(ART/'garden-manifest.json').write_text(json.dumps(manifest,indent=2))
S.render.engine='CYCLES';S.cycles.samples=32;S.cycles.use_denoising=True;S.render.resolution_x=1400;S.render.resolution_y=1100;S.render.resolution_percentage=100;S.world.color=(.3,.3,.3);S.view_settings.view_transform='AgX'
ground=mat('PREVIEW garden ground',(.19,.22,.12,1));g=cube('PREVIEW_ground',(0,-.13,0),(200,.05,200),ground,0);g.parent=None
bpy.ops.object.light_add(type='SUN');sun=bpy.context.object;sun.data.energy=2.4;sun.data.angle=.15;sun.rotation_euler=(.4,-.55,-.5)
bpy.ops.object.light_add(type='AREA',location=(0,0,6));bpy.context.object.data.energy=650;bpy.context.object.data.size=8
bpy.ops.object.camera_add(location=v((5.6,4.5,6.6)));cam=bpy.context.object;cam.rotation_euler=(v((0,.1,0))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.lens=48;S.camera=cam
S.render.filepath=str(ART/'preview-garden.png');bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=str(ART/'elin-garden.blend'));print(f'GARDEN_EXPORTED {triangles} triangles')
