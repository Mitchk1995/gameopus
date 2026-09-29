import * as THREE from 'three';
import { Batcher } from './kit.js';
import { SiteKit } from './sitekit.js';
import { buildBridge } from './bridge.js';
import { buildFields } from './fields.js';
import { buildRocks } from './rocks.js';
import { buildLandmarks } from './landmarks.js';
import { buildFort } from './fort.js';
import { buildExits } from './exits.js';
import { buildWaymarks } from './waymarks.js';
import { siteMaterials } from './siteparts.js';
import * as MAP from './map.js';

// Everything built out in the vale that is not the town: the bridge, the ways out and their notices,
// the landmarks, the fort, the signposts and the sites' markers. Read from the data in map.js.
// `interactables` are the notices you can read (game.js adds them to what E can use).
export class Sites {
  constructor({ scene, assets, world }) {
    this.scene = scene;
    this.assets = assets;
    this.world = world;
    this.interactables = [];
    this.updaters = [];
    this.parts = {};
    // The region's data (roads, exits, sites, landmarks...), for whatever needs to read it at run time (the world test).
    this.map = MAP;
  }

  async load() {
    const w = this.world;
    const kit = w.village.kit;
    this.batch = new Batcher(kit);
    this.sk = new SiteKit(kit, this.batch, w.colliders, w);
    const cliff = { map: await this.assets.texture('ground/cliff_a.webp'), normal: await this.assets.texture('ground/cliff_nr.webp', { srgb: false }) };
    this.mat = siteMaterials(this.sk, cliff);
    this.parts.bridge = buildBridge(this.sk);
    await buildFields(this.sk, this.assets);
    this.parts.rocks = await buildRocks(this.sk, this.assets);
    this.parts.landmarks = await buildLandmarks(this.sk, this);
    this.parts.fort = await buildFort(this.sk, this);
    this.parts.exits = buildExits(this);
    this.parts.waymarks = buildWaymarks(this);
    this.mesh = this.batch.build();
    this.scene.add(this.mesh);
    return this;
  }

  update(dt) {
    for (const u of this.updaters) u(dt);
  }

  // The state that gameplay reads (which ways are open, which colliders stand) advances with the game's own
  // clock, so game.update() calls this and a headless sim() moves it too.
  step(dt) {
    this.parts.exits?.step(dt);
  }

  // Opens (on = false) or shuts a way out: 'north', 'east' or 'south'. The gate swings open, the boom lifts, the
  // rubble sinks away; `{ instant: true }` skips the animation.
  setLocked(id, on, opts) {
    this.parts.exits.setLocked(id, on, opts);
  }

  isLocked(id) {
    return this.parts.exits.isLocked(id);
  }
}
