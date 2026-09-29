import * as THREE from 'three';
import { Batcher } from './kit.js';
import { SiteKit } from './sitekit.js';
import { buildBridge } from './bridge.js';
import { buildFields } from './fields.js';
import { buildRocks } from './rocks.js';

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
  }

  async load() {
    const w = this.world;
    const kit = w.village.kit;
    this.batch = new Batcher(kit);
    this.sk = new SiteKit(kit, this.batch, w.colliders, w);
    this.parts.bridge = buildBridge(this.sk);
    await buildFields(this.sk, this.assets);
    this.parts.rocks = await buildRocks(this.sk, this.assets);
    this.mesh = this.batch.build();
    this.scene.add(this.mesh);
    return this;
  }

  update(dt) {
    for (const u of this.updaters) u(dt);
  }
}
