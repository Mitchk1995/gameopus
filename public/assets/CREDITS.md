# Art credits

Sources and licenses for the bundled assets are listed below. Most third-party game assets
are CC0; fonts and tree textures have their own included licenses. No purchased assets are required.

| Folder | What | Source | Licence |
|---|---|---|---|
| `anims/ual1.glb` | 29 clips from the Universal Animation Library (Standard, free) | Quaternius, https://quaternius.itch.io/universal-animation-library | CC0 |
| `anims/ual2.glb` | 27 clips from the Universal Animation Library 2 (Standard, free) | Quaternius, https://quaternius.itch.io/universal-animation-library-2 | CC0 |
| `anims/combat.glb` | `Sword_Guard_Loop`, `Sword_Guard_Hit` and `Roll_Tuck`, built by `scripts/compose-clips.mjs` from Quaternius clips (`Idle_Shield_Loop`, `Sword_Block`, `Idle_Shield_Break`, `Roll`) | derived from the two above | CC0 |
| `chars/` | Universal Base Characters, Modular Character Outfits (Fantasy), hair | Quaternius, https://quaternius.itch.io | CC0 |
| `kits/` | Medieval Village MegaKit, Fantasy Props MegaKit | Quaternius, https://quaternius.itch.io | CC0 |
| `monsters/` | Bestiary Dungeon Monsters (Imp, Puglin) | Quaternius, https://quaternius.itch.io | CC0 |
| `sky/`, `ground/` | Kloofendal 48d partly cloudy (pure sky) HDRI; ground textures | Poly Haven, https://polyhaven.com | CC0 |
| `trees/` | Bark and leaf textures from ez-tree | Daniel Greenheck, https://github.com/dgreenheck/ez-tree | MIT |
| `world/` | Height and ground maps baked by `scripts/bake-world.mjs` | this project | (project) |
| `fonts/` | Cinzel and Alegreya Sans, bundled by `scripts/fetch-fonts.mjs` | Google Fonts, https://fonts.google.com | SIL Open Font License 1.1; licenses included in `fonts/` |
| `lakeside/` | Original cottage, furniture and cabbage garden; CC0 stone, slate, plaster, oak textures and scanned nettle plants | This project and Poly Haven, https://polyhaven.com; detailed attribution and source files in `art/lakeside-cottage/REFERENCE-NOTES.md` | Original project geometry plus CC0 source materials/plant |

Looked at for animations and not shipped (see DESIGN.md, "Art sources"): KayKit Character
Animations by Kay Lousberg (CC0, https://kaylousberg.itch.io/kaykit-character-animations);
`node scripts/fetch-assets.mjs kaykit` rebuilds them onto our rig for comparison only.
