# First lakeside household: independent review, 29 September 2026

Scope: Rowan and Elin's first furnished cottage, against the approved `docs/design/ashford-lakeside-proposal-v1.png`. This is not a review or approval of the remaining old town. Read-only production review; no production fixes by this reviewer.

## Evidence and current verdict

Reviewed the editable cottage's exterior/interior/plan previews, exported GLB structure and manifest, household content, doorway and collision integration, terrain placement, and authored test scenarios. The inspected asset contains 38 meshes and 29,980 triangles. The initial inspected GLB was 11,993,524 bytes, exported at 10:35 on 29 September. Blender previews are authoring evidence, not gameplay proof. Earlier `cottage-first` gameplay shots are superseded and were not used to approve the latest asset. Also inspected the 10:37 `tests/playtest/out/readiness/lakeside_home/cottage-approach.png` and `cottage-inside.png`: these precede the final garden and fixes, so establish only the appearance at that stage. Their accompanying result records 144 camera checks with no clips; final testing has since been extended.

**Visual verdict: pass for the first-house playtest.** Independently inspected the four final 10:48 gameplay frames in `tests/playtest/out/lakeside-final/`: `lakeside-home-and-garden.png`, `elin-garden.png`, `lakeside-interior.png`, and `lake-from-home.png`. The cottage and furnished interior are coherent with the approved direction, the garden now exists at Elin's work stop, and the reviewed views show no floating foundation, doorway gap or furniture/character collision. This is a bounded visual approval of one household, not a claim that the old town or enclosed mountain landscape has been redesigned. Continuous motion and gameplay timing still rely on the separate runtime tests and the owner's playtest.

## Findings

| ID | Severity | Finding | Status |
|---|---|---|---|
| LH1 | Resolved | Elin's dialogue and routine described tending cabbages, but the initial build contained only a graded garden patch. | Final gameplay shows two planted beds, the hand fork, and Elin working beside the near bed. Their soil and borders meet the graded ground. |
| LH2 | Resolved | Blender exports `staticCameraSolid=false` for glass and fine exterior details, but the original loader ignored that flag and indexed those triangles. | Re-read the updated loader: it honors the flag, preserves measured window-glazing blockers, omits opaque shadows from transparent glass, and excludes garden foliage from the camera index. Final interior is readable; parent-run final regression reports 192 camera cases, zero clips, and all four soft plant meshes excluded from the index. |
| LH3 | Visual polish | Interior floor texturing aligns repeated short plank ends into a noticeable grid in the Blender plan and the 10:37 gameplay interior shot. It is less convincing than the otherwise restrained joinery. | Low-priority polish; stagger the visible joints/UV offsets on a future material pass. Does not block the first-house playtest. |
| LH4 | Resolved | The original cottage hearth used generic station targeting with no wall check. A visitor at local `(-4.6,-0.5)`, facing east, was within the hearth's interaction range through the solid west wall. | Updated source provides the room-side access point and visibility filtering. Parent-run final regression confirms outside-wall access is blocked and the cooking menu opens from inside. |
| LH5 | Visual polish | A nearby tree canopy partly obscures the cottage from the specific approach in `lakeside-home-and-garden.png`. Other angles, including the garden view, remain clear. | Nonblocking. Adjust one canopy or approach sightline when refining the surrounding grounds; do not hide this limitation by presenting the asset-only Blender render as gameplay. |

## What works in the authoring previews

- A single stone/slate palette, sensible eaves and chimney, dressed corners, modest timber porch, and real window openings give the home a readable construction and silhouette.
- The hearth, pantry, table, chairs, bed, chest, towel and tableware make the room recognizably occupied without blocking the central passage. Dimensions support human-scale furnishings rather than oversized decoration.
- The door hinge and leaf are explicitly separated from static structure; the runtime registers its entire swing envelope before updating the moving slab. Occupied-door checks prevent closing on a resident or player.
- Placement and path are isolated in `lakeside-plan.js`, with terrain grading and vegetation clearance confined to the first household. This preserves the boundary between a reviewed first home and a future replacement village.
- The preliminary gameplay interior is bright enough to read furniture and clear floor space; the preliminary exterior shows sensible porch scale and ground contact. There is no demonstrated need to change the window lighting based on those views.

## Final runtime evidence (executed by the parent agent)

The parent reported both final scenarios exiting successfully after the garden was integrated. This reviewer inspected the source and images independently but did not execute those browser scenarios.

- `lakeside_home`: 63 cottage/garden collision boxes; 192 camera cases with zero clips, inside-geometry cases or skipped cases; closed door blocks the player and E opens it; occupied door refuses to close; held input enters and leaves the house; cooking works inside and is rejected through the outside wall; garden soil height is 3.37 m and matches its solid top; four foliage meshes are excluded from the static camera index. Final scenario images: `tests/playtest/out/final-home/`.
- `lakeside_household`: three logs gathered through the game's gathering action, full-backpack hand-in grants its reward once, and following the Tam lead only changes tracking; ten simulated minutes visit all six work/rest stops, with eight Rowan and six Elin doorway crossings, minimum separation 0.68 m and no sustained stalls. Final scenario images: `tests/playtest/out/final-household/`.

## Boundary and follow-up

The lake view still faces the old steep, noisy mountain wall, and parts of the old town remain visible behind the cottage. These are explicitly deferred world changes; this pass does not approve them as the planned open lakeside village. Preserve the new architectural/material vocabulary and the useful household routine when the wider village is redesigned. The remaining first-house visual polish is LH3/LH5. Runtime tests do not certify subjective movement feel, sustained frame rate or the eventual whole-village layout. This reviewer launched no browser and changed no production files.
