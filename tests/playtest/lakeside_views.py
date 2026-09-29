# Visual review views, not a claim of an unscripted player session.
STEPS = [
  {'eval': """(() => {
    const g=__game,h=g.world.lakeside;
    window.__houseView=(x,z,tx,tz)=>{
      g.player.spawn(x,z,Math.atan2(tx-x,tz-z));
      g.rig.yaw=g.player.yaw+Math.PI;g.rig.pitch=-.12;g.rig.dist=3.9;g.rig.snap();
      g.run(.4);
    };
    __houseView(h.place.x-6,h.place.z+12,h.place.x,h.place.z+1);
    return {view:'actual game camera, front garden and cottage'};
  })()"""},
  {'shot':'lakeside-home-and-garden'},
  {'eval': """(() => {
    const g=__game,h=g.world.lakeside;
    __houseView(h.place.x-6.5,h.place.z+9,h.place.x-7.5,h.place.z+5.8);
    return {view:'garden from player camera'};
  })()"""},
  {'shot':'elin-garden'},
  {'eval': """(() => {
    const g=__game,h=g.world.lakeside;h.door.snap(true);
    __houseView(h.place.x+.1,h.place.z+1.6,h.place.x-.2,h.place.z-2.5);
    return {view:'furnished interior from player camera'};
  })()"""},
  {'shot':'lakeside-interior'},
  {'eval': """(() => {
    const g=__game,h=g.world.lakeside;
    __houseView(h.place.x,h.place.z+7,h.place.x+6,h.place.z+40);
    return {view:'lake view from home path'};
  })()"""},
  {'shot':'lake-from-home'},
]
