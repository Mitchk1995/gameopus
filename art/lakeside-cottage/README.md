# Rowan cottage and Elin's garden

Editable sources: `rowan-cottage.blend`, `elin-garden.blend`. Packed source textures are included. `preview-exterior.png`, `preview-interior.png`, `preview-plan.png`, and `preview-garden.png` are actual Blender renders. They show the assets, not the game's lighting or gameplay.

Rebuild from the repository root with Blender 5.2.2 (no add-ons):

```powershell
& 'D:\pokemon\tools\blender-5.2.2\blender.exe' --background --python scripts/blender/build-lakeside-cottage.py
& 'D:\pokemon\tools\blender-5.2.2\blender.exe' --background --python scripts/blender/build-cottage-garden.py
```

The cottage must be built first because the garden reuses its packed wood material. Each script exports its GLB and manifest to `public/assets/lakeside/`, saves an editable scene, and renders a preview. Blender backup files and build logs remain local.

The cottage floor is at model Y=0, front faces +Z, main wall centres span 8 by 7 metres. The porch reaches Z=5.13. Eaves are 3.15 metres and the ridge 5.55. All manifests describe model-space game XYZ, with full collider dimensions in metres. Floors are standable, other cottage boxes solid. The garden sits at cottage-local (-7.5, 0, 5.8); its two soil surfaces are Y=.02, with separate narrow timber rim and peg boxes. Plant leaves have `staticCameraSolid=false` and remain passable.

The `door_leaf` node is a hinge parent at (-.75, 0, 3.56). Its leaf is 1.49m wide, 2.35m high, about .08m deep including ironwork; the clear masonry opening is 1.5 by 2.4m. Local Y rotation +pi/2 opens the leaf inward. Runtime owns animation, interaction and collision registration. Door descendants must stay outside the static camera index. The actual hearth fire point is (-3.4, .4, -.5).

The room has a clear centre passage, a working hearth and rug on the west wall, pantry dresser behind it, dining/mending table with two chairs on the east, a rear sleeping nook and chest, wall shelf, towel pegs, crockery, bedding, and a candle. Outdoors are a sheltered entrance, lantern, herb pots, net basket and coiled rope. The garden has six original leaf-by-leaf cabbage rosettes and six optimised scanned nettle plants, plus a hand fork.

See `REFERENCE-NOTES.md` for source photographs, exact attribution and CC0 texture links. The supplied concept remains a direction reference; these files are the first complete individual cottage for in-game review, not a completed replacement village.
