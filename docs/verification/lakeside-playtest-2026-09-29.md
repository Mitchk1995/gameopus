# First lakeside household: verification record

This is a bounded household and opening-route playtest, not certification of the remaining old town, the full game's balance or a completed open-landscape redesign. The owner approved the concept and then the actual first-house style on 29 September. The independent critic reviewed source and gameplay screenshots; the runtime scenarios below are automated player-controller tests.

## Completed checks

| Area | Evidence |
| --- | --- |
| Unit checks | 28/28 passed: full-pack transactions, quest guidance/persistence, safe death saves, household stops/doorway passing, height/scenery-aware melee, and five packaging replacement/failure paths. |
| Opening and systems | 15/15 scenarios passed: movement, combat_flow, melee, melee_aim, guard, combat_safety, pause_combat, inventory_transactions, gathering, save_spot, shop_menu, opening_save, quest_gnasher, quest_ledger and lakeside_home. |
| Region | town, world, landmarks, camera and camera_buildings passed against a frozen build snapshot. The broad camera check reported one doorway flutter, subsequently fixed and covered by a focused stability regression. |
| Doorway camera | Final sweep: 434 walks/spins, 16,926 mesh checks, zero failures/clips/inside-solid samples. A corrected dungeon selector also found 116 passage candidates and checked 120 passage walks. Focused formerly-fluttering approach passes; open-ground zoom still extends normally. |
| Final cottage and garden | 63 measured boxes, 192 camera poses, zero clips/inside samples/skips. Closed door blocks; E opens; real held-input entry/exit; floor contact; occupied door cannot close; hearth works indoors but not through the exterior wall. Garden soil matches its rendered 3.37 m surface; four foliage meshes are excluded from camera blocking. |
| Household | Actual dialogue and gathering code, three logs, full-pack one-time food/coin reward, and optional Tam lead passed. Ten simulated minutes visited all six work/rest stops, with 8 Rowan and 6 Elin doorway crossings; closest separation 0.68 m and no sustained route stalls. |
| Fresh arrival | Controller walked from (-8,53) along Lake Street and the cottage footpath: 156 m in 31 simulated seconds, ending with 10/10 health. No teleport or invulnerability in this route. |
| Surface appearance | Updated look scenario passed on an immutable build: 87 village normal-mapped materials, 86 using grain detail, seven intentionally geometric-normal materials, no missing detail. Six validity/corruption canaries passed. This is a material-integrity test, not proof of artistic quality. |
| Geometry and runner reliability | Focused six-category geometry review and 24 deliberate geometry canaries passed. Ten deliberate runner failures verified nonzero exit status for broken scenarios/assets/page requests. |
| Asset exports | Binary GLBs parsed successfully: all textures embedded and at most 1024 px, required door pivot correct, measured walking lanes and garden soil/borders/pegs preserved. Repeatable report: `art/lakeside-cottage/export-verification.json`. |
| Visual review | `docs/critic/lakeside-home-2026-09-29.md`: pass for the first-house slice. `docs/design/gameplay-garden.png` and `gameplay-interior.png` are the actual owner-reviewed game frames. |

Local logs and captures are in ignored `tests/playtest/out/`: `readiness/`, `region-regression/`, `final-home/`, `final-household/`, `final-walk/`, `material-final/`, plus agent-specific camera/geometry folders. `.scratch/readiness-results.json` and `.scratch/region-results.json` retain the initial batch exit codes. The initial material scenario failed on overbroad assumptions and two real missing-detail issues; source and assertions were repaired, canaries added, and the updated scenario passed. One later attempt was invalidated by rebuilding the served `dist` during loading; it was rerun against an immutable snapshot. Do not hide either failure or mistake the stale initial result for the final one.

## Packaged application

The initial candidate packaged successfully at `release/Aldermere/Aldermere.exe`. Fresh disposable-profile smoke passed offline startup and bundled fonts, actual pointer lock and W movement (4.28 m), then save/relaunch with matching inventory and position. Copied-owner-save smoke also passed progression restoration, offline startup, W movement (4.30 m) and full save/relaunch. Reports are in `tests/playtest/out/codex-package-fresh/` and `codex-package-owner-copy/`. All successful QA app processes were closed.

The owner then requested a pause to preserve usage. The latest plain-clothes/equipment implementation and floor/canopy polish compile successfully but are NOT in that verified package. Final character fit review and both packaged smoke repeats remain outstanding. In particular, the initial hero scenario's guard screenshot does not actually sustain guard input; correct this before claiming animation-fit coverage. Do not turn this checkpoint into a release claim.

The smoke never uses the owner's live profile for writes. `--owner-save` copies existing Local Storage into a unique temporary profile and checks progression before exercising save/relaunch there. The app-placement tool was fault-tested to preserve the previous app if installation or rollback is blocked.

## Limits and next review

Scripted quest/combat scenarios sometimes set positions, deterministic randomness or controlled enemy/player conditions to isolate behaviors. They do not establish a naturally balanced complete first adventure. Headless timings are not player GPU performance or mouse-feel measurements. The owner should try the household, cooking/fishing and initial exploration in the packaged app.

The older dense town and steep mountain enclosure remain visible. They are a separate design phase with historical critic debt; this pass does not approve or claim to repair all of it. First-house floor-joint and approach-canopy polish is being applied alongside the explicit request for a simple base-clothed player whose gear comes from equipment.
