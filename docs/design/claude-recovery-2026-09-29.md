# Interrupted work recovery

The 19 Claude worktrees were inspected before integration. Three contained tracked unfinished edits. Their original folders remain unchanged. Exact binary patches and a manifest are in `.scratch/claude-recovery-2026-09-29/`; durable local snapshot branches preserve their tracked file trees as well.

| Work | Snapshot branch | Snapshot commit |
| --- | --- | --- |
| Town grounds | `codex/recovered-town-grounds-20260929` | `44b87fb7182d675b132c08ade91450b681281fe9` |
| Vale polish | `codex/recovered-vale-polish-20260929` | `0989cf8fef79c5fcc06f36ebca946ff0bf650233` |
| Town buildings | `codex/recovered-town-buildings-20260929` | `a5c14ede76525be60c9118e152513c2e72a7ba27` |

These snapshot commits were made with `git stash create` and referenced by branches without applying a stash or cleaning the source folders. A snapshot's first parent is its original branch. Ignored artifacts are not guaranteed to be in these snapshots: do not remove the source worktrees without checking them.

All three snapshot branches were also pushed successfully to the existing `origin` repository on 29 September. The original worktree folders and local patches remain preserved.

The completed remote `world-v2`, `town-grounds` and `town-buildings` branches were integrated into `codex/playtest-readiness`, based on current `origin/main`. Both completed critic report branches were also integrated so their findings and screenshots remain available in `docs/critic/`. Useful unfinished correctness fixes were recovered: cabbage vertex colour, doorway and barrel clearance, barn aisle clearance, and camera treatment of thin decorative geometry. Unfinished stylistic changes and half-door behavior were not blindly applied.

The interrupted terrain patch is preserved but deliberately unmerged. Independent numerical review found metre-scale discontinuities where its nearest-cell biome value changes ledge spacing (for example approximately 4.17 m across 0.00002 m near x=306.039724,z=-270). It also substantially changes much of the terrain and needs a separate visual and movement review. Do not substitute its baked maps into the current build.

The existing held pull request #15 is older integration work, not visual approval. Keep unfinished visual work held until the actual game has been reviewed. Do not close or delete recovery work merely because its content was inspected.
