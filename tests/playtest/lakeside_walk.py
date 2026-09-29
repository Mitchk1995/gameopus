# ci paths=src/world/,src/actors/player.js,public/assets/world/,public/assets/lakeside/
# Walk from the actual fresh-game start along Lake Street and the cottage path.
# Heading is steered toward the authored road, but movement, ground and collisions
# are the game's normal controller; no teleports or invulnerability are used.
STEPS = [
  {'eval': """(() => {
    const g=__game,h=g.world.lakeside,p=g.player;
    const road=g.world.sites.map.ROADS.find(r=>r.id==='lake');
    const points=[...road.pts, ...h.place.path.slice().reverse(), [h.place.x+.1,h.place.z+6.2]];
    const start=p.pos.clone(); let seconds=0, distance=0;
    for(const [x,z] of points) {
      let ticks=0;
      while(Math.hypot(x-p.pos.x,z-p.pos.z)>.6 && ticks++<900) {
        g.rig.yaw=Math.atan2(p.pos.x-x,p.pos.z-z);
        g.input.keys.add('KeyW'); const before=p.pos.clone();
        g.sim(1/60);seconds+=1/60;distance+=before.distanceTo(p.pos);
        if(p.state==='dead') throw new Error('FAIL player died on opening cottage route');
      }
      if(ticks>=900) throw new Error('FAIL blocked on cottage route toward '+[x,z]+' at '+p.pos.toArray());
    }
    g.input.keys.clear();g.run(.3);
    if(Math.hypot(p.pos.x-h.place.x,p.pos.z-h.place.z-6.2)>1) throw new Error('FAIL cottage approach not reached');
    return {from:start.toArray(),to:p.pos.toArray(),metres:Math.round(distance),seconds:Math.round(seconds),hp:g.state.hp};
  })()"""},
  {'shot':'cottage-arrival'},
]
