# Neural team search v3: run, import and transfer

## Run tonight

From `Desktop/Projects/PvPokeTeamTrainer`:

```sh
node training/team-search/launch-next.cjs --hours 8
```

Uses all available cores (12 on the M2 Max), keeps macOS awake, and stops automatically. It starts a fresh `training/runs/team-search-v3` experiment with the prepared top-300 Pokémon / up-to-five-movesets pool. Existing output is protected: use `--resume` with unchanged code/settings, or `--out training/runs/my-new-run` for another experiment. No long training run was started during this update.

```sh
node training/team-search/status.cjs training/runs/team-search-v3
tail -f training/runs/team-search-v3/training.log
node training/team-search/stop.cjs training/runs/team-search-v3
```

The stop command checkpoints after active work. The deadline reserves time for screening and final testing; active battles and export can finish shortly afterward.

## Display a run

The trainer automatically writes **`report.pvpteams.json.gz`** inside its run directory. In PvPoke Pro → Full Team Neural Network, click **Import Report** and select this file. Keep it to reopen after a browser reload. Importing processes data locally; it does not upload the report to a shared database or change the published archive.

A manual export is also available:

```sh
node training/team-search/export-report.cjs training/runs/team-search-v3
```

The file contains all saved teams and matchup outcomes, frozen species/move/search metadata, training history, timing, meta assumptions, simulator/data fingerprints, completed evaluation panels, and finalist uncertainty. It excludes model tensors, machine paths, credentials and the raw checkpoint. A stopped run can be imported, with incomplete validation clearly identified.

The UI provides rankings, search, lead/backline columns, moveset badges, team comparisons, performance graphs, and matchup replay. Replay is allowed only when the report's simulator and data hashes match the installed adapter. A mismatch still permits viewing saved evidence; never simulate it with the legacy engine or label a reconstruction as verified.

## What changed

- Battle correctness: isolated Champion scouting from live battle state and RNG; fixed duplicated native buffs, transformed-form CPM, switch resets, cooldown tracking, switch-clock elapsed time, illegal responses and asymmetric forced replacements.
- Search: deliberate same-species moveset mutations and lead changes; preserved random exploration during leader retests.
- Evaluation: all screened teams share an opponent panel; finalists and baselines share another. Deadline truncation retains a common completed prefix instead of favoring the first team. The primary is selected before the final test. Simultaneous paired uncertainty distinguishes evidence from unresolved small differences.
- Meta: optional dated observations decay exponentially, with explicit as-of date and shrinkage toward a synthetic prior. Efficient sampling preserved 10,000 identical seeded normal-pool fixtures; a local sampling benchmark improved about 4.8×. This is not a claim that battle simulation is 4.8× faster.
- Model: removed redundant work without changing numerical training output. A whole-team bootstrap experiment worsened two held-out folds, so the existing fixture bootstrap remains the production default. No demonstrated overall win-rate improvement is claimed before the new run.
- Portability: versioned compressed report and a browser replay adapter generated from the exact v3 trainer source, with parity tests against Node simulation.

## Keep historical results separate

Do **not** reuse v1/v2 battle labels or trained model weights in v3: mechanics changed, so their targets describe a different simulator. The warm-start guard rejects incompatible versions/mechanics/meta. The published v1 report stays an archive.

The unchanged exhaustive 1v1 scouting pool is reused. Old winning **team compositions** remain useful candidates for fresh testing, but their old scores are not evidence of v3 performance. Old labels are useful for software regression and controlled model-method research, not as current v3 training truth. Compatible v3 evidence can be merged with version-aware tools and fresh held-out evaluation seeds.

## What would improve results most next

1. Recent observed **joint team** frequencies, stratified by cup/rating/date; independent Pokémon weights do not capture actual cores and leads.
2. Hidden-information policies and beliefs over unrevealed teammates/moves. The current controller knows the whole opposing roster.
3. Longer/full-team continuation, delayed switches/catches and diverse charge/shield policies. Current switching is bounded minimax with a heuristic terminal value.
4. Independent seeds and meta-sensitivity tests, larger common finalist panels, and controlled alternate-moveset comparisons. Small score gaps may be noise.
5. Team-context moveset retention and alternative IV builds; the candidate pool is still limited to five 1v1-scouted sets per entry.

The neural network predicts outcomes and guides team selection; it does not learn optimal battle play or establish real-player win rates.

## Other environment: copy/paste instructions

> Integrate the provided neural v3 report support into the existing Full Team Neural Network page. Preserve the historical v1 archive. Use `includes/pro/neural-report-core.js` to validate and decompress `report.pvpteams.json.gz`, then render it through `NeuralPortable.render(report)` after the existing TeamBrowser/search/detail dependencies load. The implementation is in `neural-portable.js`; `neural.js` adds the Import Report selector. Copy the matching replay adapter, manifest, lookahead and worker files listed below. Do not recompute rankings or mix reports. Require matching mechanics/data hashes for replay. Test import, team search, a stored matchup replay, comparisons, charts and switching back to the v1 archive. Follow this document's schema and keep all imported content as text, never executable code.

Viewer files under `includes/pro/`:

- `neural.js`, `neural.css`, `neural-report-core.js`, `neural-portable.js`
- `team-browser.js`, `team-comparison.js` (retain existing comparison-core/search/detail dependencies)
- `team-replay-v3-runtime.js`, `team-replay-v3-worker.js`, `team-replay-v3-manifest.js`, `team-lookahead-v3.js`
- `NEURAL_REPORTS.md`

Keep the same `includes/pro/data/` Game Master and `includes/pro/vendor/` battle engine/training AI files for matching replay. If the other environment updates them, regenerate the adapter from its matching trainer with `node scripts/build-neural-replay.cjs`, run `node --test training/team-search/replay-v3.test.cjs`, and retain the old adapter for old reports or disable mismatched replay. Imported JSON never supplies executable code.

### Data contract (schema 1)

Top level: `format: "pvp-team-report"`, `schemaVersion: 1`, `id`, `engineVersion`, `mechanicsHash`, `dataHash`, `fixtureMode` (`single` for v3, `paired` for v1), `engineOptions`, `meta`, `population`, `runtime`, `history`, `screenPanel`, `finalPanel`, `finalistComparisons`, `snapshot`, `table`.

`table.rows` are team records; each `team` is three indices into `table.variants`, lead first. `table.matches[row.id]` has `training`, `screen`, `test`, `baseline` arrays. Each matchup is `[opponentIndices, battleSeed, score]`; opponentIndices reference `table.opponents`. Score is win=1/draw=0.5/loss=0; v1 averages mirrored games, v3 uses one canonical game. Identical v3 team mirrors have a symmetric 0.5 expectation and show a representative physical battle.

Finalist intervals compare `primary − challenger`, using shared fixtures and adjustment across finalists. Preserve the screening-selected primary even if another finalist has a higher final point estimate. `finalPanel.completedFixtures < requestedFixtures` means partial final evidence.

For a redesigned UI, this contract is sufficient to render scores, charts and comparisons without Node or training code. The browser adapter is only needed to reconstruct battle graphs. Keep results from different engines/metas in different reports.
