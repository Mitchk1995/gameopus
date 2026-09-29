# Aldermere handoff — 29 September 2026

Read this first, then `DESIGN.md` and `CLAUDE.md`. Latest owner feedback outranks old plans.

## PAUSED at the owner's request

Mitchell asked to pause and wrap up to preserve usage. Do not continue development or start
background follow-ups until they resume. Work is checkpointed on `codex/playtest-readiness`;
no new PR or release merge is needed merely to preserve this pause.

The existing packaged app passed fresh-profile and copied-owner-save offline/input/save/relaunch
checks, but it PRECEDES the latest character change and small cottage polish. The source builds
successfully after those changes; do not call that equivalent to a validated updated package.

The latest user requirement is a simple base-clothed character, with no permanently attached
hood/accessories. Initial implementation is in `src/main.js`, `src/actors/equipment.js`, and
the Game equipment hook. It uses plain linen/breeches and removable fitted head/body/legs/shield
models. This remains WIP pending final visual fit review and updated package verification.
The initial appearance scenario passed equip/swap/remove/save reload, but visual inspection
found concrete blockers: scalp pokes through the med helm; the shirt clips torso armour at
shoulders/waist; boot cuffs protrude through greaves. Fix those before packaging. Plain front/back
views look correct. Captures and the tested immutable build are in `tests/playtest/out/hero-first/`.
`tests/playtest/hero_equipment.py` exists, but its guard capture currently starts blocking without
holding the right mouse button; simulation cancels it. Fix that test before claiming armour fit
during guarding. Crown/mixed equipment and final animated fit still need independent review.

First-house polish after the reviewed package: floor texture UVs are staggered (same meshes,
bounds and colliders; export verification passed), and one approach oak is removed after seeded
tree placement so the rest of the forest retains its positions/IDs. Capture/review the updated
gameplay views on resumption. Rebuild and repeat both isolated packaged smoke modes only after
the character review, then commit/push the follow-up and open a held review PR if appropriate.

## Current player-approved direction

Mitchell rejected the cramped walled town, incoherent buildings, empty houses and enclosed landscape. The new village is a spread-out lakeside settlement with gardens, workshops, footpaths, a lively central green and open views. The approved concept is `docs/design/ashford-lakeside-proposal-v1.png`.

The agreed first increment is one complete furnished home and household. After viewing its actual gameplay exterior/garden and interior, Mitchell said: **"This feels like the right direction; keep developing it"**. Keep its architectural/material vocabulary. The rest of the old village and mountain bowl have NOT been redesigned or approved. Before moving many buildings, develop and review the wider measured layout. Do not substitute concept art or Blender renders for gameplay evidence.

The first adventure should start with village life: gather, craft and meet people, then explore and fight for a useful reward. Preserve saves and existing progression. Mitchell wants an active collaborator who asks useful questions, shows progress and thoroughly checks each playable increment.

## Current checkout and interrupted work

`codex/playtest-readiness` is based on `origin/main` at a8b06da. It integrates the completed `world-v2`, `town-grounds`, `town-buildings`, `critic-town-1` and `critic-world-1` work. Historical critic reports remain in `docs/critic/`; their full town/world findings are not all resolved by this cottage pass.

All 19 old Claude worktrees were inspected. Three had unfinished tracked edits; their original folders remain unchanged. Durable recovery branches plus exact local binary patches preserve them. See `docs/design/claude-recovery-2026-09-29.md` for commit IDs and safeguards. Do not remove those folders without checking ignored artifacts too.

Useful unfinished correctness fixes were recovered. The `vale-polish` terrain patch is deliberately unmerged: review found approximately 4.17 m discontinuities across tiny biome boundaries. Do not copy its baked maps into the current build. Existing PR #15 is older held integration work, not a release approval. Current work should remain held for owner playtesting.

## Implemented first household

- Original editable Blender cottage and garden: `art/lakeside-cottage/`, rebuilt by `scripts/blender/`. Blender 5.2.2 LTS is installed at `D:\pokemon\tools\blender-5.2.2\blender.exe`; no add-ons needed.
- Runtime exports and measured manifests: `public/assets/lakeside/`. 29,980 cottage triangles and 46,413 garden triangles. Embedded textures and source credits are preserved; `scripts/blender/verify-lakeside-assets.mjs` checks the exports.
- `src/world/lakeside-plan.js` places the 8 x 7 m home at (-75,150), west of the lake jetty, with a path and local terrain grading. `lakeside-home.js` owns the measured floors, furniture, moving occupied-safe door, usable hearth and garden. The minimap shows the roof.
- Rowan and Elin have distinct looks, conversations and real routes between nets/table/garden/hearth/lake, with meaningful pauses. They open the actual door, avoid overlapping, and stop when approached. Conversations and cooking cannot start through exterior walls.
- A Little Warmth asks for three ordinary logs, rewards two cooked trout and 25 coins once, and offers an optional lead to Tam. New characters initially track this lead without auto-accepting it. Existing tracked/active quests are preserved.
- The cottage has a real cooking station, table, chairs, pantry, sleeping nook, chest, crockery, net basket, plants and a planted kitchen garden.

## Correctness work included

Inventory swaps, purchases, sales and crafting are atomic when the pack is full. Death saves recover safely without reviving the live dying character. Late quest reading advances the ledger stage correctly and repeated rewards are prevented. Melee uses height-aware reach and scenery checks; interrupted rolls clear invulnerability; pausing freezes combat and animation.

Fonts are bundled for offline play. Test runners fail on missing assets, request/page errors and assertion failures; deliberate fault canaries verified this. Packaging preserves or restores the previous app on failure. The packaged smoke uses unique disposable profiles, real keyboard movement, offline reload, save and relaunch; `--owner-save` tests a COPY of owner storage only.

Thin old facade details, barn/inn clearance, cabbage colour, leaf/flower geometry, slate UV scale, clay/leather/linen materials and a doorway camera flutter were repaired. Material checks now distinguish legitimate cutout foliage and smooth metal from missing/flat normal maps; validity/corruption canaries protect those rules.

## Verification and playtest build

`npm run package` completed and placed the candidate at `D:\diablolike\release\Aldermere\Aldermere.exe`. This is an owner-review build from the held integration branch, not a declaration that the entire replacement village is finished.

Recorded validation is in `docs/verification/lakeside-playtest-2026-09-29.md`. The independent first-house critic report is `docs/critic/lakeside-home-2026-09-29.md`. Actual owner-reviewed images are `docs/design/gameplay-garden.png` and `gameplay-interior.png`.

Both packaged offline/save checks and the updated material scenario passed for the earlier
candidate. The newer hero and cottage-polish changes are deliberately left at the pause boundary
described above; their final packaged validation is outstanding.

All helper work and QA processes are stopped. The last Blender rebuild completed successfully;
its latest floor preview has not yet been visually inspected. No background continuation was
scheduled.

## Remaining work and honest limits

1. Let Mitchell play the first household and opening route; act on camera/control/scale/interaction feedback. Automated routes and scripted combat checks are not a natural player playthrough or proof of the whole game's balance.
2. Develop the larger open lakeside plan around the approved house style: sightlines, central green, resident homes, workshops and walking distances. Replace the old cliff bowl only after reviewing a coherent terrain/layout plan. Existing world critic debt remains visible.
3. First-house nonblocking polish: stagger the repeated floor-plank joints and improve one canopy-obscured approach. The independent visual reviewer passed the bounded household slice.
4. Preserve longer-term design questions: original skill/material/fish naming and progression were proposed in the earlier session but not approved. Do not infer agreement. Existing animation gaps include strafes/directional dodges/parry motions; no paid pack was purchased in this work.
5. Auto-fix UI was not available through current tools; do not claim that switch was enabled. Keep the review branch held and check actual CI results before any release merge.
