# ci paths=src/world/,src/actors/,public/assets/lakeside/,src/game/game.js
# Actual cottage threshold, floor, camera and cooking station checks. The avatar
# is positioned for each independent case; traversal itself uses held game input.
STEPS = [
  {'eval': '@camera_helpers.js'},
  {'eval': '@camera_mesh.js'},
  {'eval': """(() => {
    const g = __game, h = g.world.lakeside;
    if (!h || h.shapes.length < 15 || !h.door.leaf || !h.gardenRoot) throw new Error('FAIL cottage or garden failed to load measured geometry');
    window.__home = h;
    // Freeze household actors away from the entrance for a door test; their
    // unscripted multi-minute routines have a separate scenario.
    for (const n of g.npcs.filter(n => n.def.routine)) { n.talking = true; n.pos.set(h.place.x + 12, h.place.y, h.place.z + 10); }
    h.door.snap(false);
    __cam.place(h.place.x + .1, h.place.z + 6.2, 0, -.12);
    g.run(.2);
    return { boxes:h.shapes.length, meshes:__cm.build().meshes, door:h.door.t, floor:g.world.groundAt(h.place.x,h.place.z,h.place.y) };
  })()"""},
  {'shot': 'cottage-approach'},
  {'key': 'KeyW'}, {'eval': '__game.sim(1)'}, {'up': 'KeyW'},
  {'eval': """(() => {
    const g=__game,h=__home;
    if(g.player.pos.z<h.place.z+3.8) throw new Error('FAIL closed cottage door did not stop avatar');
    g.run(.1);
    if(g.target?.door!==h.door) throw new Error('FAIL cottage door not targetable from doorstep');
    return {blocked:g.player.pos.toArray(),prompt:g.target.verb};
  })()"""},
  {'press': 'KeyE'}, {'eval': '__game.sim(.6)'},
  {'eval': "if(!__home.door.open || __home.door.t<1) throw new Error('FAIL E did not open cottage door')"},
  {'key': 'KeyW'}, {'eval': '__game.sim(.9)'}, {'up': 'KeyW'},
  {'eval': """(() => {
    const g=__game,h=__home;
    g.run(.2);
    if(g.player.pos.z>h.place.z+1.7) throw new Error('FAIL could not enter cottage through open door');
    if(Math.abs(g.player.pos.y-h.place.y)>.06) throw new Error('FAIL cottage feet do not rest on floor');
    return {inside:g.player.pos.toArray()};
  })()"""},
  {'shot': 'cottage-inside'},
  {'eval': """(() => {
    const g=__game,h=__home,M=__cm;
    for (const [x,z] of [[.1,1],[.1,-1],[-2,-.5],[1,1],[0,4.3],[0,6.2],[-3.45,1.75],[3.45,1.75]]) {
      for(let k=0;k<8;k++) for(const pitch of [-.6,-.12,.3]) {
        __cam.place(h.place.x+x,h.place.z+z,k*Math.PI/4,pitch);
        g.sim(1/60); M.check('lakeside cottage'); __cam.check('lakeside cottage');
      }
    }
    if(M.F.fails.length) throw new Error(M.F.fails.join(' | '));
    if(__cam.T.fails.length) throw new Error(__cam.T.fails.join(' | '));
    return {cameraChecks:M.F.checks,clips:M.F.clips,inside:M.F.inside,skipped:M.F.skipped};
  })()"""},
  {'eval': """(() => {
    const g=__game,h=__home;
    __cam.place(h.place.x+.1,h.place.z+3.5,0,-.12);
    h.door.snap(true); const r=h.door.use();
    if(!h.door.open || h.door.goal!==1) throw new Error('FAIL cottage closes onto player in doorway');
    const fires=h.interactables.filter(s=>s.station==='fire');
    if(fires.length!==1 || !g.resources.items.includes(fires[0])) throw new Error('FAIL cottage hearth is not usable');
    return {occupiedDoor:r.text,hearth:fires[0].name};
  })()"""},
  {'eval': """(() => {
    const g=__game,h=__home;
    __cam.place(h.place.x+.1,h.place.z+1,Math.PI,-.12);
    g.input.keys.add('KeyW');g.sim(1.3);g.input.keys.clear();g.run(.1);
    if(g.player.pos.z<h.place.z+5) throw new Error('FAIL cannot leave cottage');
    return {exited:g.player.pos.toArray()};
  })()"""},
  {'eval': """(() => {
    const g=__game,h=__home;
    __cam.place(h.place.x-4.6,h.place.z-.5,-Math.PI/2,-.12);
    g.player.yaw=Math.PI/2;g.sim(.1);
    if(g.target?.name==='Cottage hearth') throw new Error('FAIL cooking hearth usable through outer wall');
    __cam.place(h.place.x-2.05,h.place.z-.5,Math.PI/2,-.12);
    g.player.yaw=-Math.PI/2;g.sim(.1);
    if(g.target?.name!=='Cottage hearth') throw new Error('FAIL hearth inaccessible from room');
    g.input.pressed.add('KeyE');g.sim(1/60);
    if(!g.menus.isOpen) throw new Error('FAIL cottage cooking menu did not open');
    g.closeAll();return 'PASS hearth works inside, blocked through outside wall';
  })()"""},
  {'eval': """(() => {
    const g=__game,h=__home,at=h.place.garden;
    const y=g.world.groundAt(at.x-1.15,at.z,h.place.y);
    if(Math.abs(y-h.place.y-h.gardenManifest.soilTop)>.035) throw new Error('FAIL garden walkable soil does not match visible surface');
    let soft=0,indexed=0;
    h.gardenRoot.traverse(o=>{if(o.isMesh&&o.userData.staticCameraSolid===false){soft++;if(o.userData.camIndexed)indexed++;}});
    if(!soft||indexed) throw new Error('FAIL garden leaves block the camera');
    return {gardenSoil:y,softFoliageMeshes:soft};
  })()"""},
]
