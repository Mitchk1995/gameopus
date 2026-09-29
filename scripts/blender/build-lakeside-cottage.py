"""Rebuild the editable Rowan cottage and portable GLB. Blender 5.2, no add-ons.
Model coordinates in helpers are game XYZ (Y up, front +Z); Blender uses (X,-Z,Y).
Run: blender --background --python scripts/blender/build-lakeside-cottage.py
"""
import bpy, math, json, random, os
from pathlib import Path
from mathutils import Vector
random.seed(41)
ROOT=Path(__file__).resolve().parents[2]
ART=ROOT/'art/lakeside-cottage'
OUT=ROOT/'public/assets/lakeside'
for d in (ART,OUT): d.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
for m in bpy.data.materials: bpy.data.materials.remove(m)
S=bpy.context.scene
S.unit_settings.system='METRIC'
S.render.engine='CYCLES'; S.cycles.samples=40
S.cycles.use_denoising=True
S.render.resolution_x=1600; S.render.resolution_y=1100; S.render.resolution_percentage=100
S.render.image_settings.file_format='PNG'
S.view_settings.view_transform='AgX'
S.world.color=(.35,.35,.35)
root=bpy.data.objects.new('rowan_cottage',None); S.collection.objects.link(root)
root['assetVersion']=1; root['front']='+Z'; root['units']='metres'
parts={}; colliders=[]
def v(p): return Vector((p[0],-p[2],p[1]))
def register(o,name,mat=None,group='architecture'):
    o.name=name; o.parent=root
    if mat:o.data.materials.append(mat)
    o['assetPart']=group
    parts.setdefault(group,[]).append(o)
    return o
def material(name,col=(1,1,1,1),image=None,normal=None,rough=.85,metal=0):
    m=bpy.data.materials.new(name);m.use_nodes=True
    n=m.node_tree.nodes;p=n.get('Principled BSDF')
    p.inputs['Base Color'].default_value=col;p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal
    if image:
        tex=n.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(str(image),check_existing=True)
        m.node_tree.links.new(tex.outputs['Color'],p.inputs['Base Color'])
    if normal:
        tex=n.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(str(normal),check_existing=True);tex.image.colorspace_settings.name='Non-Color'
        nor=n.new('ShaderNodeNormalMap');nor.inputs['Strength'].default_value=.55
        m.node_tree.links.new(tex.outputs['Color'],nor.inputs['Color']);m.node_tree.links.new(nor.outputs['Normal'],p.inputs['Normal'])
    return m
def textured(name,stem,rough=.85):
    return material(name,image=ART/'textures'/f'{stem}_Diffuse.jpg',normal=ART/'textures'/f'{stem}_nor_gl.jpg',rough=rough)
stone=textured('Pale lime pointed fieldstone','plaster_stone_wall_02')
plaster=textured('Interior warm lime plaster','white_plaster_rough_01')
plinth=textured('Dressed sandstone and hearth','old_stone_wall_02')
wood=textured('Old oak joinery','oak_wood_planks',.76)
# A dedicated floor copy keeps cupboard/table materials unchanged. Its fine end
# seam is staggered independently on each real board by the floor UVs below.
floor_image=bpy.data.images.load(str(ART/'textures/oak_wood_planks_Diffuse.jpg'),check_existing=False)
floor_pixels=list(floor_image.pixels[:]);floor_width,floor_height=floor_image.size
for row in range(floor_height):
    for column,strength in ((0,.32),(floor_width-1,.65)):
        pixel=(row*floor_width+column)*4
        for channel in range(3):floor_pixels[pixel+channel]*=strength
floor_image.pixels[:]=floor_pixels;floor_image.filepath_raw=str(ART/'textures/oak-floor-endgrain.png');floor_image.file_format='PNG';floor_image.save()
floor_wood=wood.copy();floor_wood.name='Staggered interior oak floorboards'
for n in floor_wood.node_tree.nodes:
    if n.type=='TEX_IMAGE' and n.image.colorspace_settings.name!='Non-Color':n.image=floor_image
# Colour-grading the diffuse itself preserves the material appearance in glTF.
def tinted_image(src,name,tint):
    im=bpy.data.images.load(str(src),check_existing=False)
    pixels=list(im.pixels[:])
    for i in range(0,len(pixels),4):
        for c in range(3):pixels[i+c]*=tint[c]
    im.pixels[:]=pixels
    im.filepath_raw=str(ART/'textures'/name);im.file_format='PNG';im.save()
    return ART/'textures'/name
oak_dark=tinted_image(ART/'textures/oak_wood_planks_Diffuse.jpg','oak-aged.png',(.38,.42,.45))
oak=material('Weathered structural oak',image=oak_dark,normal=ART/'textures/oak_wood_planks_nor_gl.jpg',rough=.86)
# Retain scanned plaster texture but reduce grime contrast to a maintained limewash.
plaster_im=bpy.data.images.load(str(ART/'textures/white_plaster_rough_01_Diffuse.jpg'),check_existing=False)
pix=list(plaster_im.pixels[:])
for i in range(0,len(pix),4):
    lum=.2126*pix[i]+.7152*pix[i+1]+.0722*pix[i+2]
    for c,base in enumerate((.65,.59,.48)):pix[i+c]=min(.95,max(.02,base+(lum-.22)*.22))
plaster_im.pixels[:]=pix;plaster_im.filepath_raw=str(ART/'textures/limewash-warm.png');plaster_im.file_format='PNG';plaster_im.save()
for n in plaster.node_tree.nodes:
    if n.type=='TEX_IMAGE' and n.image.colorspace_settings.name!='Non-Color':n.image=plaster_im
    if n.type=='NORMAL_MAP':n.inputs['Strength'].default_value=.20
slate_image=tinted_image(ART/'textures/roof_slates_03_Diffuse.jpg','slate-bluegrey.png',(.46,.50,.55))
slate=material('Weathered blue grey slate',image=slate_image,normal=ART/'textures/roof_slates_03_nor_gl.jpg',rough=.88)
slate_edge=material('Split slate edges',(.10,.13,.155,1),rough=.94)
linen=material('Flax cloth',image=ROOT/'public/assets/props/linen_a.webp',normal=ROOT/'public/assets/props/linen_n.webp',rough=.97)
blue=material('Indigo woven wool',(.13,.24,.30,1),normal=ROOT/'public/assets/props/linen_n.webp',rough=.97)
red=material('Madder woven stripe',(.30,.13,.095,1),rough=.95)
iron=material('Forged dark iron',(.035,.041,.046,1),rough=.7,metal=.75)
ceramic=material('Honey glazed crockery',(.33,.20,.085,1),rough=.3)
cream=material('Cream slipware',(.66,.60,.43,1),rough=.33)
rope=material('Hemp rope',(.29,.25,.16,1),rough=.95)
soot=material('Soot in firebox',(.025,.02,.016,1),rough=1)
glass=material('Small imperfect window panes',(.23,.35,.38,.35),rough=.2)
gp=glass.node_tree.nodes.get('Principled BSDF');gp.inputs['Alpha'].default_value=.35
glass.surface_render_method='DITHERED'
green=material('Sage foliage',(.075,.15,.052,1),rough=.94)
flower=material('Small marigolds',(.80,.39,.065,1),rough=.82)
ember=material('Hearth embers',(.18,.025,.005,1),rough=.9)
ep=ember.node_tree.nodes.get('Principled BSDF');ep.inputs['Emission Color'].default_value=(1,.14,.008,1);ep.inputs['Emission Strength'].default_value=1.8
def uv_box(o,scale=2):
    """World-metre box projection after scale; keeps masonry continuous across bays."""
    mesh=o.data;uv=mesh.uv_layers.new(name='UVMap') if not mesh.uv_layers else mesh.uv_layers.active
    for p in mesh.polygons:
        n=(o.matrix_world.to_3x3()@p.normal);axis=max(range(3),key=lambda i:abs(n[i]))
        for li in p.loop_indices:
            q=o.matrix_world@mesh.vertices[mesh.loops[li].vertex_index].co
            co=((q.y,q.z) if axis==0 else (q.x,q.z) if axis==1 else (q.x,q.y))
            uv.data[li].uv=(co[0]/scale,co[1]/scale)
def mesh(name,verts,faces,mat,group='architecture',scale=2):
    me=bpy.data.meshes.new(name);me.from_pydata([v(p) for p in verts],[],faces);me.update()
    o=bpy.data.objects.new(name,me);S.collection.objects.link(o);register(o,name,mat,group)
    uv_box(o,scale);return o
def cube(name,p,size,mat,group='architecture',bevel=.015,scale=2):
    bpy.ops.mesh.primitive_cube_add(size=1,location=v(p));o=bpy.context.object;o.dimensions=(size[0],size[2],size[1])
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    register(o,name,mat,group);uv_box(o,scale)
    if bevel:
        mod=o.modifiers.new('Worn edges','BEVEL');mod.width=bevel;mod.segments=1
        mod.affect='EDGES'
        bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name)
        mod=o.modifiers.new('Weighted face normals','WEIGHTED_NORMAL');mod.keep_sharp=True
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return o
def box_collider(name,p,size,floor=False):
    colliders.append(dict(id=name,center=p,size=size,floor=floor))
def beam(name,a,b,w,d,mat=oak,group='architecture'):
    midpoint=(Vector(a)+Vector(b))/2
    o=cube(name,midpoint,(w,(Vector(b)-Vector(a)).length,d),mat,group,bevel=.009)
    direction=v(Vector(b)-Vector(a));o.rotation_euler=direction.to_track_quat('Z','Y').to_euler()
    return o
def cyl(name,p,r,depth,mat,group='furnishings',vertices=12,r2=None):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices,radius1=r,radius2=r if r2 is None else r2,depth=depth,location=v(p))
    o=bpy.context.object;register(o,name,mat,group);uv_box(o,.75)
    for f in o.data.polygons:f.use_smooth=len(f.vertices)==4
    return o
def torus(name,p,major,minor,mat,group='furnishings'):
    bpy.ops.mesh.primitive_torus_add(major_radius=major,minor_radius=minor,major_segments=20,minor_segments=6,location=v(p))
    o=bpy.context.object;register(o,name,mat,group);uv_box(o,.5)
    for f in o.data.polygons:f.use_smooth=True
    return o
def lathe(name,p,profile,mat,group='furnishings',segments=20):
    verts=[]
    for rad,h in profile:
        for i in range(segments):
            a=i*math.tau/segments;verts.append((p[0]+rad*math.cos(a),p[1]+h,p[2]+rad*math.sin(a)))
    faces=[]
    for j in range(len(profile)-1):
        for i in range(segments):
            a=j*segments+i;b=j*segments+(i+1)%segments;faces.append((a,b,b+segments,a+segments))
    o=mesh(name,verts,faces,mat,group,.5)
    for f in o.data.polygons:f.use_smooth=True
    return o

# Walls are assembled around genuine openings, never an opaque facade behind a window.
openings_front=[(-3.04,-1.86,1.02,2.37),(-.75,.75,0,2.4),(1.86,3.04,1.02,2.37)]
openings_back=[(-2.96,-1.84,1.05,2.30),(1.90,3.04,1.05,2.30)]
side_open=[(1.15,2.35,1.02,2.37)]
def wall(name,axis,at,lo,hi,holes):
    cuts=sorted(set([lo,hi]+[h[0] for h in holes]+[h[1] for h in holes]))
    for a,b in zip(cuts,cuts[1:]):
        hit=next((h for h in holes if h[0]<=a+.001 and h[1]>=b-.001),None)
        spans=[(0,3.15)] if not hit else [(0,hit[2]),(hit[3],3.15)]
        for bottom,top in spans:
            if top-bottom<.01:continue
            p=((a+b)/2,(bottom+top)/2,at) if axis=='x' else (at,(bottom+top)/2,(a+b)/2)
            size=(b-a,top-bottom,.28) if axis=='x' else (.28,top-bottom,b-a)
            o=cube(name,p,size,stone,bevel=0,scale=3.2)
            o.data.materials.append(plaster)
            for f in o.data.polygons:
                normal=o.matrix_world.to_3x3()@f.normal
                if (axis=='x' and normal.y*at>0) or (axis=='z' and normal.x*at<0):f.material_index=1
            box_collider(name,p,size)
    # A texture-scaled low masonry base; same actual opening cutouts as wall.
    for a,b in zip(cuts,cuts[1:]):
        if any(h[0]<=a+.001 and h[1]>=b-.001 and h[2]==0 for h in holes):continue
        p=((a+b)/2,.23,at) if axis=='x' else (at,.23,(a+b)/2)
        size=(b-a,.46,.31) if axis=='x' else (.31,.46,b-a)
        cube(name+'_plinth',p,size,plinth,bevel=.016,scale=2.8)
wall('wall_front','x',3.5,-4.14,4.14,openings_front)
wall('wall_back','x',-3.5,-4.14,4.14,openings_back)
wall('wall_left','z',-4,-3.36,3.36,side_open)
wall('wall_right','z',4,-3.36,3.36,side_open)
cube('floor_foundation',(0,-.16,0),(8.25,.30,7.25),plinth,bevel=.025)
box_collider('interior_floor',(0,-.08,0),(7.74,.16,6.74),True)
for i in range(26):
    xx=-3.83+(i+.5)*(7.66/26)
    board_width=7.66/26-.008
    board=cube('floor_oak_boards',(xx,-.035,0),(board_width,.07,6.70),floor_wood,'floor',.004,2.5)
    # Grain runs along the board, with varied timber lengths and staggered joints.
    # Each board samples within one scanned oak strip, avoiding a cross-grain grid.
    board_length=(2.85,3.25,3.65,3.05,3.45)[i%5]
    phase=(i*.38196601125)%1
    strip=.035+.2*((i*3)%5)
    for poly in board.data.polygons:
        if abs(poly.normal.z)<.5:continue
        for li in poly.loop_indices:
            q=board.matrix_world@board.data.vertices[board.data.loops[li].vertex_index].co
            board.data.uv_layers.active.data[li].uv=(-q.y/board_length+phase,strip+.13*((q.x-xx)/board_width+.5))
cube('entry_threshold',(0,-.01,3.5),(1.50,.08,.45),plinth,bevel=.02)
cube('porch_slab',(0,-.06,4.25),(3.05,.15,1.8),plinth,'porch',.015)
box_collider('porch_floor',(0,-.06,4.25),(3.05,.15,1.8),True)
# Subtle quoin stones give the corners construction and depth.
for x in (-4,4):
 for z in (-3.5,3.5):
  cube('corner_plinth',(x,.23,z),(.34,.46,.34),plinth,bevel=.01,scale=2.8)
  for j in range(8):
   wide=.53 if j%2==0 else .34;deep=.34 if j%2==0 else .53
   cube('corner_stone_front',(x-math.copysign(wide/2-.16,x),.65+j*.315,z+math.copysign(.15,z)),(wide,.30,.075),plinth,bevel=.01,scale=2.8)
   cube('corner_stone_side',(x+math.copysign(.15,x),.65+j*.315,z-math.copysign(deep/2-.16,z)),(.075,.30,deep),plinth,bevel=.01,scale=2.8)
def window(name,axis,at,mid,bottom=1.02,top=2.37,width=1.18):
    out=math.copysign(.035,at);height=top-bottom
    def wp(u,y,depth): return (mid+u,y,at+depth) if axis=='x' else (at+depth,y,mid+u)
    def ws(w,h,d): return (w,h,d) if axis=='x' else(d,h,w)
    for u in (-width/2,width/2):
        cube(name+'_jamb',wp(u,(top+bottom)/2,0),ws(.105,height+.12,.32),oak,'windows',.008,1.8)
    for y in (bottom,top):cube(name+'_rail',wp(0,y,0),ws(width+.13,.11,.34),oak,'windows',.008,1.8)
    cube(name+'_sill',wp(0,bottom-.08,out),ws(width+.30,.14,.48),plinth,'windows',.012)
    for u in (-width/6,width/6):cube(name+'_mullion',wp(u,(top+bottom)/2,0),ws(.04,height,.06),oak,'windows',.006)
    cube(name+'_transom',wp(0,(top+bottom)/2,0),ws(width,.045,.06),oak,'windows',.004)
    for u in (-width/3,0,width/3):
     for y in (bottom+height/4,bottom+height*3/4):
      cube(name+'_glass',wp(u,y,0),ws(width/3-.05,height/2-.04,.012),glass,'glass',0)
    box_collider(name+'_glazing',wp(0,(top+bottom)/2,0),ws(width,height,.06))
for x in(-2.45,2.45):window('front_window','x',3.5,x)
for x in(-2.4,2.47):window('rear_window','x',-3.5,x,1.05,2.30,1.12)
for x in(-4,4):window('side_window','z',x,1.75)
# Main door: actual hinge at the left jamb, leaves and ironwork move as one node.
for x in(-.80,.80):cube('entry_jamb',(x,1.22,3.50),(.13,2.44,.34),oak,bevel=.012)
cube('entry_lintel',(0,2.47,3.50),(1.83,.20,.37),oak,bevel=.012)
door=bpy.data.objects.new('door_leaf',None);S.collection.objects.link(door);door.parent=root;door.location=v((-.75,0,3.56));door['hingeAxis']='Y';door['openRadians']=math.pi/2;door['dynamic']=True
before=set(bpy.data.objects)
for i in range(7):cube('door_board',(-.745+(i+.5)*(1.49/7),1.18,3.56),(1.49/7-.006,2.35,.065),oak,'door',.007,1.7)
for y in(.34,1.15,2.03):cube('door_ledge',(0,y,3.505),(1.35,.12,.06),wood,'door',.006)
beam('door_brace',(-.62,.4,3.49),(.62,2,3.49),.085,.045,wood,'door')
for y in(.45,1.90):
    cube('door_strap',(-.28,y,3.615),(.91,.075,.021),iron,'door',.003)
    for x in(-.65,-.34,.04):
        o=cyl('door_rivet',(x,y,3.634),.018,.016,iron,'door',8);o.rotation_euler[0]=math.pi/2
cube('door_latch_plate',(.55,1.16,3.62),(.10,.20,.02),iron,'door',.005)
o=torus('door_ring',(.55,1.15,3.66),.057,.011,iron,'door');o.rotation_euler[0]=math.pi/2
for o in set(bpy.data.objects)-before:
    mw=o.matrix_world.copy();o.parent=door;o.matrix_world=mw
# Roof slabs have slate normal maps, real staggered eave courses and ridge caps.
def roof_slope(name,z0,z1,y0,y1,x0,x1,group='roof',scale=7):
    verts=[(x0,y0,z0),(x1,y0,z0),(x1,y1,z1),(x0,y1,z1),(x0,y0-.075,z0),(x1,y0-.075,z0),(x1,y1-.075,z1),(x0,y1-.075,z1)]
    o=mesh(name,verts,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],slate,group,scale)
    o.data.materials.append(oak);o.data.materials.append(slate_edge)
    for i,p in enumerate(o.data.polygons):p.material_index=1 if i==1 else 2 if i>1 else 0
    # Project using slope length so slate rows retain correct dimensions.
    slope=math.hypot(z1-z0,y1-y0)
    for p in o.data.polygons:
      for li in p.loop_indices:
        q=o.data.vertices[o.data.loops[li].vertex_index].co
        o.data.uv_layers.active.data[li].uv=((q.x-x0)/scale,((-q.y-z0)/(z1-z0))*slope/scale)
    return o
roof_slope('roof_front',0,3.91,5.55,3.06,-4.43,4.43)
roof_slope('roof_rear',-3.91,0,3.06,5.55,-4.43,4.43)
for x in(-4,4):
    # A solid triangular gable with interior plaster, spanning the end-wall thickness.
    verts=[(x-.14,3.13,-3.5),(x-.14,3.13,3.5),(x-.14,5.47,0),(x+.14,3.13,-3.5),(x+.14,3.13,3.5),(x+.14,5.47,0)]
    mesh('upper_gable',verts,[(0,2,1),(3,4,5),(0,1,4,3),(1,2,5,4),(2,0,3,5)],stone,'upper',3.2)
    for z in(-3.92,3.92):beam('roof_bargeboard',(x+math.copysign(.39,x),3.02,z),(x+math.copysign(.39,x),5.57,0),.15,.15,oak,'roof')
for z in(-3.83,3.83):cube('roof_fascia',(0,3.04,z),(8.78,.21,.13),oak,'roof',.008)
for x in [i*.39-4.095 for i in range(22)]:
    roof_slope('roof_ridge_cap_front',-.03,.19,5.62,5.51,x-.204,x+.204,'roof',7)
    roof_slope('roof_ridge_cap_rear',-.19,.03,5.51,5.62,x-.204,x+.204,'roof',7)
# Delicate slate lips at the two visible eaves make the roof physically thin.
for z in(-3.88,3.88):
 for i in range(26):
    x=-4.30+i*.343
    cube('roof_eave_slate',(x,3.08+random.uniform(-.012,.012),z),(.338,.027,.28),slate_edge,'roof',.005,7)
# Interior open rafters are above camera height and conceal no invented upstairs room.
for x in(-3.1,-1.55,0,1.55,3.1):
    beam('roof_rafter',(x,3.09,-3.48),(x,5.36,0),.13,.16,oak,'roof')
    beam('roof_rafter',(x,5.36,0),(x,3.09,3.48),.13,.16,oak,'roof')
    cube('roof_tie_beam',(x,3.12,0),(.16,.19,6.96),oak,'roof',.012)
cube('roof_ridge_beam',(0,5.32,0),(8.0,.20,.22),oak,'roof',.013)
# Entry porch is attached below the eave: knee braces, posts and drip edge.
for x in(-1.18,1.18):
    cube('porch_post',(x,1.20,4.87),(.15,2.40,.15),oak,'porch',.01)
    cube('porch_foot',(x,.11,4.87),(.24,.22,.24),plinth,'porch',.015)
    beam('porch_knee',(x,1.91,4.87),(x,2.40,4.40),.10,.10,oak,'porch')
    beam('porch_crossbrace',(x,1.91,4.87),(x-math.copysign(.43,x),2.40,4.87),.10,.10,oak,'porch')
    box_collider('porch_post',(x,1.2,4.87),(.20,2.4,.20))
cube('porch_front_beam',(0,2.42,4.87),(2.65,.17,.18),oak,'porch',.01)
cube('porch_ledger',(0,2.82,3.65),(2.65,.17,.16),oak,'porch',.01)
roof_slope('porch_roof',3.44,5.13,2.98,2.43,-1.45,1.45,'porch',7)
for x in(-1.35,0,1.35):beam('porch_rafter',(x,2.82,3.57),(x,2.34,5.09),.09,.12,oak,'porch')
# Hearth on the west wall, cooking and drying area around it.
cube('hearth_flagstones',(-3.22,.06,-.50),(1.39,.12,1.84),plinth,'furnishings',.028)
cube('hearth_soot_back',(-3.82,1.03,-.50),(.06,1.8,1.27),soot,'furnishings',.002)
for z in(-1.18,.18):cube('hearth_pier',(-3.45,.85,z),(.83,1.7,.27),plinth,'furnishings',.022)
cube('hearth_lintel',(-3.44,1.75,-.5),(.90,.29,1.73),plinth,'furnishings',.025)
cube('hearth_hood',(-3.57,2.55,-.50),(.65,1.33,1.42),plaster,'furnishings',.035)
cube('hearth_mantel',(-3.35,1.98,-.50),(1.0,.12,1.82),oak,'furnishings',.025)
box_collider('hearth',(-3.36,1.10,-.50),(1.23,2.20,1.86))
cube('chimney_shaft',(-3.55,4.67,-.50),(.83,3.06,.99),plinth,'chimney',.015,2.3)
cube('chimney_cap',(-3.55,6.20,-.50),(1.03,.18,1.19),plinth,'chimney',.012)
for z in(-.77,-.24):
    lathe('chimney_terracotta_pot',(-3.55,6.26,z),[(.15,0),(.17,.06),(.13,.09),(.13,.47),(.16,.50),(.16,.56),(.105,.56),(.105,.40)],ceramic,'chimney')
for z in(-.95,-.72,-.49,-.26,-.03):
    beam('hearth_grate',(-3.8,.30,z),(-3.02,.30,z),.032,.032,iron,'furnishings')
for i in range(4):
    o=cyl('hearth_split_log',(-3.43,.20+i*.035,-.83+i*.2),.095,.67,soot,vertices=8);o.rotation_euler[1]=math.pi/2
for i in range(12):cyl('hearth_ember',(-3.20+random.uniform(-.25,.12),.21,-.85+random.random()*.7),.03,.02,ember,vertices=6)
lathe('cooking_pot',(-3.40,.48,-.50),[(0,0),(.17,0),(.23,.06),(.26,.22),(.21,.34),(.18,.35),(.17,.33),(.17,.28)],iron)
o=torus('cooking_pot_bail',(-3.40,.93,-.50),.25,.016,iron);o.rotation_euler[1]=math.pi/2
beam('hearth_crossbar',(-3.1,1.33,-1.07),(-3.1,1.33,.07),.025,.025,iron,'furnishings')
# Table, chairs, useable work surface. Legs have stretchers rather than floating tops.
def chair(name,x,z,turn=0):
    before=set(bpy.data.objects)
    cube(name+'_seat',(x,.46,z),(.50,.065,.47),wood,'furnishings',.025,1.4)
    for dx in(-.19,.19):
      for dz in(-.18,.18):
        cube(name+'_leg',(x+dx,.23,z+dz),(.065,.46,.065),oak,'furnishings',.009)
      cube(name+'_backpost',(x+dx,.78,z-.18),(.06,.64,.065),oak,'furnishings',.009)
    for y in(.69,.94):cube(name+'_backrail',(x,y,z-.18),(.45,.12,.05),wood,'furnishings',.009)
    for dx in(-.19,.19):cube(name+'_stretcher',(x+dx,.18,z),(.04,.04,.38),oak,'furnishings',.004)
    if turn:
      from mathutils import Matrix
      R=Matrix.Rotation(turn,4,'Z');c=v((x,0,z))
      for o in set(bpy.data.objects)-before:o.matrix_world=Matrix.Translation(c)@R@Matrix.Translation(-c)@o.matrix_world
    box_collider(name,(x,.53,z),(.56,1.06,.57))
for i in range(5):cube('table_top_board',(2.30,.79,.80+(i-2)*.196),(1.66,.075,.189),wood,'furnishings',.01,1.8)
for x in(1.62,2.98):
 for z in(.45,1.15):cube('table_leg',(x,.38,z),(.10,.76,.10),oak,'furnishings',.012)
cube('table_front_apron',(2.30,.67,1.17),(1.52,.18,.07),oak,'furnishings',.008)
cube('table_back_apron',(2.30,.67,.43),(1.52,.18,.07),oak,'furnishings',.008)
cube('table_long_stretcher',(2.30,.23,.80),(1.44,.10,.10),oak,'furnishings',.008)
box_collider('table',(2.30,.43,.80),(1.72,.86,1.03))
chair('dining_chair',2.37,-.02)
chair('mending_chair',2.36,1.67,math.pi)
# Woven runner and hand-thrown household crockery.
cube('table_runner',(2.30,.836,.8),(.44,.010,.94),linen,'furnishings',0,.7)
for z in(.37,.42,1.18,1.23):cube('runner_border',(2.30,.844,z),(.44,.009,.018),red,'furnishings',0)
def bowl(name,x,y,z,r=.16,mat=ceramic):
    return lathe(name,(x,y,z),[(0,0),(.55*r,0),(.60*r,.025),(r,.095),(r,.12),(.9*r,.12),(.78*r,.047),(0,.042)],mat)
bowl('supper_bowl',1.9,.839,.86,.17,cream)
bowl('mending_buttons',2.8,.839,.84,.13)
lathe('table_jug',(2.30,.841,.71),[(0,0),(.10,0),(.14,.07),(.14,.19),(.08,.27),(.07,.36),(.10,.37),(.09,.40),(.05,.40),(.05,.34)],ceramic)
o=torus('jug_handle',(2.44,1.045,.71),.095,.02,ceramic);o.rotation_euler[1]=math.pi/2
for x in(1.90,2.68):lathe('table_cup',(x,.84,.55),[(0,0),(.068,0),(.078,.13),(.067,.14),(.056,.12),(.053,.02)],cream)
# Pantry dresser rear-left: shelves open, pots actually resting on boards.
pantry_start=set(bpy.data.objects)
cube('pantry_back',(-2.50,.98,-3.15),(1.70,1.95,.08),oak,'furnishings',.008)
for x in(-3.30,-1.70):cube('pantry_upright',(x,.99,-2.92),(.09,1.98,.51),oak,'furnishings',.009)
for y in(.16,.87,1.34,1.82):cube('pantry_shelf',(-2.50,y,-2.92),(1.66,.065,.51),wood,'furnishings',.008)
for x in(-2.9,-2.1):
    cube('pantry_lower_door',(x,.50,-2.65),(.77,.63,.052),oak,'furnishings',.014)
    cyl('pantry_latch',(x,.52,-2.609),.028,.02,iron,vertices=8).rotation_euler[0]=math.pi/2
for x in(-3.0,-2.6,-2.2,-1.92):
    lathe('pantry_storage_pot',(x,.903,-2.96),[(0,0),(.10,0),(.14,.09),(.13,.29),(.10,.32),(.10,.34),(.08,.34)],ceramic)
for x in(-3.0,-2.57,-2.13):bowl('pantry_bowl',x,1.373,-2.92,.16,cream)
# Turn the dresser onto the side wall to preserve the rear window and daylight.
from mathutils import Matrix
pantry_old=v((-2.5,0,-2.92));pantry_new=v((-3.46,0,-2.50))
for o in set(bpy.data.objects)-pantry_start:
    o.matrix_world=Matrix.Translation(pantry_new)@Matrix.Rotation(math.pi/2,4,'Z')@Matrix.Translation(-pantry_old)@o.matrix_world
box_collider('pantry',(-3.46,.99,-2.50),(.60,1.98,1.8))
# Bed and blanket tucked into quiet rear-right corner.
for x in(1.81,3.35):
 for z in(-3.05,-1.03):cube('bed_post',(x,.37,z),(.105,.74,.105),oak,'furnishings',.018)
for x in(1.81,3.35):cube('bed_side',(x,.34,-2.04),(.12,.24,2.05),oak,'furnishings',.012)
cube('bed_headboard',(2.58,.64,-3.06),(1.63,.68,.10),wood,'furnishings',.025)
cube('bed_footboard',(2.58,.43,-1.03),(1.63,.36,.10),wood,'furnishings',.022)
cube('bed_linen_mattress',(2.58,.47,-2.04),(1.44,.24,1.97),linen,'furnishings',.10,.65)
cube('bed_pillow',(2.58,.65,-2.70),(1.14,.21,.43),linen,'furnishings',.10,.5)
# Draped, softly undulating cover including its side drops.
verts=[];faces=[];nx=18;nz=18
for j in range(nz+1):
 z=-2.42+j*1.36/nz
 for i in range(nx+1):
  x=1.69+i*1.79/nx;u=abs(x-2.58)
  y=.625-max(0,u-.68)*1.65+.013*math.sin(i*1.2+j*.25)
  verts.append((x,y,z))
for j in range(nz):
 for i in range(nx):a=j*(nx+1)+i;faces.append((a,a+1,a+nx+2,a+nx+1))
o=mesh('bed_wool_cover',verts,faces,blue,'furnishings',.5)
for f in o.data.polygons:f.use_smooth=True
box_collider('bed',(2.58,.42,-2.04),(1.72,.84,2.19))
# Small chest, bedside stool, candle and homespun rug.
cube('linen_chest',(3.12,.35,-.30),(1.04,.70,.50),oak,'furnishings',.025)
cube('chest_lid',(3.12,.73,-.30),(1.10,.09,.56),wood,'furnishings',.025)
for x in(2.76,3.48):cube('chest_iron_band',(x,.39,-.565),(.07,.69,.025),iron,'furnishings',.005)
box_collider('chest',(3.12,.395,-.30),(1.10,.79,.56))
cube('bedside_stool',(1.2,.46,-2.48),(.45,.065,.45),wood,'furnishings',.02)
for x in(1.04,1.36):
 for z in(-2.64,-2.32):cube('stool_leg',(x,.22,z),(.05,.44,.05),oak,'furnishings',.006)
box_collider('bedside_stool',(1.2,.25,-2.48),(.49,.5,.49))
lathe('candle_holder',(1.20,.497,-2.48),[(0,0),(.09,0),(.09,.025),(.04,.035),(.04,.11),(.06,.13),(.06,.15),(.03,.15)],iron)
cyl('beeswax_candle',(1.20,.72,-2.48),.031,.22,cream,vertices=12)
# Daily belongings: a hand towel and iron pegs by the door, a shelf between the back windows.
cube('back_wall_shelf',(0,1.78,-3.30),(1.20,.075,.32),oak,'furnishings',.012)
for x in(-.43,.43):beam('shelf_bracket',(x,1.43,-3.38),(x,1.74,-3.13),.055,.055,oak,'furnishings')
bowl('shelf_bowl',-.32,1.82,-3.29,.14,cream)
lathe('shelf_flask',(.26,1.82,-3.29),[(0,0),(.09,0),(.13,.08),(.13,.22),(.05,.30),(.045,.39),(.055,.40)],ceramic)
cube('entry_pegboard',(1.26,1.88,3.30),(.69,.14,.075),oak,'furnishings',.012)
for x in(1.05,1.28,1.49):beam('coat_peg',(x,1.9,3.25),(x,1.9,3.11),.04,.04,oak,'furnishings')
verts=[];faces=[]
for j in range(9):
 for i in range(7):
  verts.append((1.14+i*.038,1.91-j*.072,3.17+.033*math.sin(i*1.4)+.011*math.sin(j*.4)))
for j in range(8):
 for i in range(6):a=j*7+i;faces.append((a,a+1,a+8,a+7))
mesh('hanging_flax_towel',verts,faces,linen,'furnishings',.55)
# The small rug never extends into the door swing or masks obstacles.
cube('hearth_rug',(-1.90,.007,-.40),(1.05,.014,1.9),blue,'furnishings',0,.6)
for z in(-1.25,-1.18,.37,.45):cube('rug_woven_border',(-1.90,.017,z),(1.05,.004,.028),linen,'furnishings',0)
# Exterior net basket and rope, useful identifiable belongings for this household.
lathe('porch_net_basket',(2.64,0,3.96),[(.24,0),(.28,.03),(.37,.48),(.38,.50),(.34,.53),(.32,.46),(.23,.06)],rope,'exterior',24)
for y in(.09,.17,.25,.33,.41,.49):torus('basket_woven_band',(2.64,y,3.96),.26+y*.21,.014,oak,'exterior')
for i in range(20):
    a=i*math.tau/20
    beam('basket_stake',(2.64+.26*math.cos(a),.03,3.96+.26*math.sin(a)),(2.64+.37*math.cos(a),.49,3.96+.37*math.sin(a)),.019,.019,rope,'exterior')
for i in range(5):torus('coiled_hemp_rope',(3.18,.035+i*.026,3.98),.22-i*.011,.021,rope,'exterior')
box_collider('net_basket',(2.64,.27,3.96),(.78,.54,.78))
# Net hangs from the basket lip, an actual lattice with a modest triangle budget.
for i in range(9):
    t=i/8
    beam('fishing_net',(2.33+t*.6,.51,3.69),(2.33+t*.6,.04,3.48),.008,.008,rope,'exterior')
    beam('fishing_net',(2.33,.51-t*.47,3.69-t*.21),(2.93,.51-t*.47,3.69-t*.21),.008,.008,rope,'exterior')
# Herbs by the kitchen door: slender stems and shaped leaves, small enough to read honestly.
for x,z in[(-2.34,3.96),(-3.2,3.87)]:
    lathe('herb_terracotta_pot',(x,0,z),[(.16,0),(.24,.32),(.265,.33),(.265,.38),(.22,.38),(.205,.31)],ceramic,'exterior')
    cyl('herb_soil',(x,.345,z),.205,.025,soot,'exterior',16)
    for i in range(8):
        a=i*math.tau/8;h=random.uniform(.27,.42);xx=x+.13*math.cos(a);zz=z+.13*math.sin(a)
        beam('herb_stem',(x,.35,z),(xx,.35+h,zz),.009,.009,green,'exterior')
        for t in(.35,.65,.9):
            cx=x+(xx-x)*t;cz=z+(zz-z)*t;yy=.35+h*t
            dx=.065*math.cos(a+1.1);dz=.065*math.sin(a+1.1)
            mesh('herb_leaf',[(cx,yy,cz),(cx+dx,yy+.026,cz+dz),(cx+dx*1.65,yy+.01,cz+dz*1.65),(cx+dx,yy-.012,cz+dz)],[(0,1,2,3)],green,'exterior')
    box_collider('herb_pot',(x,.18,z),(.52,.36,.52))
# Exterior lantern, compact iron frame and honey glass; parent may supply light.
cube('lantern_wall_plate',(.99,1.98,3.69),(.08,.29,.04),iron,'exterior',.005)
beam('lantern_bracket',(.99,2.11,3.7),(.99,2.11,3.98),.025,.025,iron,'exterior')
cube('lantern_glow',(.99,1.86,3.94),(.15,.22,.15),cream,'exterior',.01)
for y in(1.72,2.0):cube('lantern_cap',(.99,y,3.94),(.23,.045,.23),iron,'exterior',.015)
for x in(.89,1.09):
 for z in(3.84,4.04):cube('lantern_corner',(x,1.86,z),(.018,.27,.018),iron,'exterior',.003)

# Merge by functional category and material for economical static rendering; preserve door pivot.
bpy.context.view_layer.update()
for group,objects in list(parts.items()):
    objects=[o for o in objects if o.type=='MESH']
    bymat={}
    for o in objects:
        key=tuple(m.name for m in o.data.materials);bymat.setdefault(key,[]).append(o)
    for n,obs in enumerate(bymat.values()):
        bpy.ops.object.select_all(action='DESELECT')
        for o in obs:o.select_set(True)
        bpy.context.view_layer.objects.active=obs[0]
        if len(obs)>1:bpy.ops.object.join()
        o=bpy.context.object;o.name=f'{group}_{n:02d}'
        o['assetPart']=group;o['staticCameraSolid']=group not in ('door','glass','exterior')
        # Alpha planes are intentionally not opaque blockers for triangle camera tests.
for im in bpy.data.images:
    if im.source=='FILE':im.pack()
manifest=dict(asset='rowan-cottage',version=2,units='metres',upAxis='Y',front='+Z',footprint=[8,7],floorY=0,eavesY=3.15,ridgeY=5.55,chimneyY=6.82,
    doorway=dict(center=[0,1.2,3.5],width=1.5,height=2.4,leafWidth=1.49,leafHeight=2.35,leafThickness=.08,hinge=[-.75,0,3.56],node='door_leaf',closedRotationY=0,openRotationY=math.pi/2,opens='inward; tip moves toward -Z'),
    hearthFire=[-3.4,.4,-.5],
    boundsExpected=dict(x=[-4.47,4.47],y=[-.31,6.82],z=[-4.02,5.15]),
    navigation=dict(clearCentreLane=[[-.52,-2.3],[.98,3.5]],hearthStop=[-2.05,0,-.50],tableStop=[1,0,1],porchStop=[2,0,4.8]),
    colliders=colliders,
    materialSources=[dict(id=id,url=f'https://polyhaven.com/a/{id}',licence='CC0') for id in ['plaster_stone_wall_02','old_stone_wall_02','oak_wood_planks','white_plaster_rough_01','roof_slates_03','rough_linen']],
    integrationNotes=['Load all static meshes with castShadow/receiveShadow. door_leaf is an Empty carrying its door mesh children; rotate it around local Y.', 'Collider positions and full sizes use model-space game XYZ; world integration owns static body registration.', 'floor colliders have walkable tops; other boxes are solid. Glazing boxes close real window openings.', 'roof_* and upper_* can be culled on interior views if needed, though this asset uses an open rafter ceiling.', 'Exclude door descendants from static camera triangle index; retain a dynamic closed-door blocker. Glass and fine exterior ornament need no camera blocking.'])
triangles=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in bpy.data.objects if o.type=='MESH')
manifest['triangles']=triangles;manifest['meshCount']=sum(o.type=='MESH' for o in bpy.data.objects)
(OUT/'rowan-cottage.manifest.json').write_text(json.dumps(manifest,indent=2))
(ART/'manifest.json').write_text(json.dumps(manifest,indent=2))
# Export selected asset only, before preview-only environment and cameras are added.
bpy.ops.object.select_all(action='DESELECT')
for o in bpy.data.objects:
    if o==root or o.parent:o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'rowan-cottage.glb'),export_format='GLB',use_selection=True,export_extras=True,export_yup=True,export_materials='EXPORT',export_image_format='AUTO',export_cameras=False,export_lights=False)
print(f'ASSET_EXPORTED {triangles} triangles')
# Preview stage; no ground, lights or cameras are included in the GLB.
groundmat=material('PREVIEW pale warm ground',(.23,.26,.19,1),rough=1)
ground=cube('PREVIEW_ground',(0,-.04,0),(200,.05,200),groundmat,'preview',0)
ground.parent=None
def area(name,p,energy,size,col,target):
    bpy.ops.object.light_add(type='AREA',location=v(p));o=bpy.context.object;o.name=name;o.data.energy=energy;o.data.shape='DISK';o.data.size=size;o.data.color=col;o.rotation_euler=(v(target)-o.location).to_track_quat('-Z','Y').to_euler();return o
bpy.ops.object.light_add(type='SUN',location=(0,0,10));sun=bpy.context.object;sun.name='PREVIEW_sun';sun.data.energy=2.5;sun.data.angle=.10;sun.rotation_euler=(.4,-.55,-.5)
area('PREVIEW_sky',(0,10,1),1800,15,(.75,.84,1),(0,0,0))
area('PREVIEW_front_fill',(4,5,8),550,7,(1,.87,.70),(0,1,0))
area('PREVIEW_hearth',(-2.95,.6,-.5),28,.8,(1,.42,.11),(-1,.8,-.5))
def camera(name,p,target,lens=43):
    bpy.ops.object.camera_add(location=v(p));cam=bpy.context.object;cam.name=name;cam.data.lens=lens;cam.data.clip_start=.05;cam.rotation_euler=(v(target)-cam.location).to_track_quat('-Z','Y').to_euler();S.camera=cam;return cam
camera('PREVIEW_exterior',(-12.5,7.0,15.8),(0,2.2,0),46)
S.render.filepath=str(ART/'preview-exterior.png');bpy.ops.render.render(write_still=True)
# Show the actual connected furnished floor through a low front-room camera.
door.rotation_euler[2]=math.pi/2
area('PREVIEW_interior_fill',(0,2.55,1.8),120,3.8,(1,.85,.64),(0,1,-1))
camera('PREVIEW_interior',(.38,1.84,3.15),(-.28,1.20,-1.35),22)
S.render.filepath=str(ART/'preview-interior.png');bpy.ops.render.render(write_still=True)
door.rotation_euler[2]=0
camera('PREVIEW_plan',(0,13,1.6),(0,0,0),40)
for o in bpy.data.objects:
    if o.get('assetPart') in ('roof','upper','chimney'):o.hide_render=True
S.render.filepath=str(ART/'preview-plan.png');bpy.ops.render.render(write_still=True)
for o in bpy.data.objects:
    if o.get('assetPart') in ('roof','upper','chimney'):o.hide_render=False
S.camera=bpy.data.objects.get('PREVIEW_exterior')
bpy.ops.wm.save_as_mainfile(filepath=str(ART/'rowan-cottage.blend'))
print('DONE rowan-cottage')
