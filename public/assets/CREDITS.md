# Art credits

Everything here is free for any use. `scripts/fetch-assets.mjs` downloads and optimizes it;
nothing in this folder needs an account or a purchase to re-create.

| Folder | What | Source | Licence |
|---|---|---|---|
| `anims/ual1.glb` | 29 clips from the Universal Animation Library (Standard, free) | Quaternius, https://quaternius.itch.io/universal-animation-library | CC0 |
| `anims/ual2.glb` | 27 clips from the Universal Animation Library 2 (Standard, free) | Quaternius, https://quaternius.itch.io/universal-animation-library-2 | CC0 |
| `anims/combat.glb` | `Sword_Guard_Loop` and `Sword_Guard_Hit`, built by `scripts/compose-clips.mjs` from Quaternius clips (`Idle_Shield_Loop`, `Sword_Block`, `Idle_Shield_Break`) | derived from the two above | CC0 |
| `chars/` | Universal Base Characters, Modular Character Outfits (Fantasy), hair | Quaternius, https://quaternius.itch.io | CC0 |
| `kits/` | Medieval Village MegaKit, Fantasy Props MegaKit | Quaternius, https://quaternius.itch.io | CC0 |
| `monsters/` | Bestiary Dungeon Monsters (Imp, Puglin) | Quaternius, https://quaternius.itch.io | CC0 |
| `sky/`, `ground/` | Kloofendal 48d partly cloudy (pure sky) HDRI; ground textures | Poly Haven, https://polyhaven.com | CC0 |
| `trees/` | Bark and leaf textures from ez-tree | Daniel Greenheck, https://github.com/dgreenheck/ez-tree | MIT |
| `world/` | Height and ground maps baked by `scripts/bake-world.mjs` | this project | (project) |

Looked at for animations and not shipped (see DESIGN.md, "Art sources"): KayKit Character
Animations by Kay Lousberg (CC0, https://kaylousberg.itch.io/kaykit-character-animations);
`node scripts/fetch-assets.mjs kaykit` rebuilds them onto our rig for comparison only.
