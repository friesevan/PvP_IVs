# PvPoke Pro — ranking logic README

This guide describes the third tab of PvP IV Pro. It documents the code currently shipped, rather than an idealized ranking algorithm. It is also available as a plain Markdown file for AI tools.

## 1. Three different kinds of result

| Result | Where it comes from | Meaning |
| --- | --- | --- |
| Published PvPoke | Bundled upstream ranking JSON | Exact published scores at the pinned source snapshot, including any editor adjustments already in those files. |
| Generated custom roster | Upstream battle engine, category ranker, and overall ranker executed in a browser worker | Relative performance against the accepted Pokémon and their weights, with published movesets fixed. No editor adjustments. |
| Moveset lab | Every enumerated moveset for one selected Pokémon, simulated against the accepted roster | Weighted mean raw Battle Rating, on a 0–1000 scale. This is not the overall ranking formula. |

An overall score of 94 is not a 94% win rate, and a score from one roster is not directly comparable with a score from another. Category normalization and opponent weighting make the results relative to the current population. The IV Pro tab's stat-product rankings are separate from this entire pipeline.

## 2. Source, data, and reproducibility

All vendor code and bundled data use PvPoke commit `f627e89e53c0c7b903fff097df7a0ad0ac95decc`. The upstream engine and ranker files are copied unchanged and licensed under MIT. The adapter is our code. This is a snapshot, not a live fetch from pvpoke.com, so later changes on that website will not automatically appear here.

- [Pinned PvPoke source](https://github.com/pvpoke/pvpoke/tree/f627e89e53c0c7b903fff097df7a0ad0ac95decc)
- [Browser adapter](worker.js): worker setup, generation, moveset simulation, and output capture.
- [Interface](ui.js): accepted roster, weights, filters, state invalidation, and presentation.
- [Validation and combination helpers](core.js).
- [Game master data](data/gamemaster.json): species, base stats, types, moves, default IVs, release flags, forms, cups, and scenarios.
- League bundles: [500 CP](data/league-500.json), [1500 CP](data/league-1500.json), [2500 CP](data/league-2500.json), [Master](data/league-10000.json). Each contains overall, leads, closers, switches, chargers, and attackers arrays.
- Override bundles: [500 CP](data/overrides-500.json), [1500 CP](data/overrides-1500.json), [2500 CP](data/overrides-2500.json), [Master](data/overrides-10000.json).
- [MIT license](vendor/LICENSE).

The Master league uses `10000` as the engine's unlimited-league identifier. Current UI choices are the four open leagues; themed cup rules and custom IV entry are not exposed on this tab.

## 3. Published mode

Selecting a league loads its bundled arrays. Published mode performs no battles and does not recompute scores. It displays the upstream order/ranks, scores, moves, stats, category scores, editor notes where present, key wins, and counters. Thus this mode reproduces the saved upstream rankings even when a full regeneration would depend on upstream curation or settings not selected in this app.

Search matches the Pokémon name, types, or recommended move names. Score/name sorting changes display order. The Rank column preserves the position in the source array. Pagination displays 25 rows per page. Search and sort do not alter the simulation roster.

## 4. Accepted Pokémon and weights

The selectable population is the league's published overall list. Initially, its first 30 Pokémon are accepted. Each weight starts at its bundled override's `weight`, or 1 if unspecified. Accept top N, accept all, clear, and individual checkboxes modify membership. Equal weights sets every entry to 1; Published weights restores bundled values. Roster search only changes which controls are visible.

Generation requires at least two unique accepted species IDs. Each must be in the published population, with a finite weight greater than 0 and at most 1000. An unchecked Pokémon is excluded; zero is not an accepted weight. Base, Shadow, and other forms with different species IDs are separate entries.

For generation, the adapter constructs a `custom` cup with an explicit ID inclusion list, no exclusions, `includeLowStatProduct: true`, and `excludeLowPokemon: false`. It does not discard accepted Pokémon merely because their published score is below 70. It passes each Pokémon's requested weight as an upstream moveset override, along with its published fast and charged moves. Higher weight increases that Pokémon's influence as an opponent, not a direct bonus to its own score.

[GameMaster.generateFilteredPokemonList](vendor/GameMaster.js) still applies upstream initialization and eligibility rules: release flags, low-CP bans, duplicate-form restrictions, Little Cup Shadow level restrictions, and inclusion filtering. The custom cup bypasses the normal minimum stat-product threshold. If upstream filtering removes a requested Pokémon, the adapter reports the excluded IDs and stops instead of silently ranking a smaller roster.

The upstream function's ordinary stat-product thresholds are 0 / 1370 / 2800 / 4900 for 500 / 1500 / 2500 / 10000 CP, using Attack × Defense × HP / 1000. These thresholds are bypassed in our custom cup. Upstream open-league target filtering and curated overrides can therefore differ from this app's custom-roster rules.

## 5. Pokémon initialization and fixed movesets

[Pokemon.initialize](vendor/Pokemon.js) uses the league's gamemaster default IV and level combination. The normal battle level cap is 50, with upstream species/form-specific exceptions. Master normally uses 15/15/15 at the applicable cap. CP-limited defaults come from `defaultIVs.cp500`, `cp1500`, or `cp2500`; absent combinations follow the upstream fallback. These are not the user's IV entries from the first tab, and they are not an exhaustive IV optimization performed for each ranking run.

Effective base battle stats are CPM × (base stat + IV). HP is floored with a minimum of 10; Shedinja has its explicit upstream HP rule. Shadow modifiers, stat stages, form transitions, and move-specific properties remain in the engine.

The category ranker runs in `force` moveset mode. GameMaster first initializes move choices from existing ranking move-use data, then our overrides force the published `moveset`: one fast move, up to two ordinary charged moves, and the supported extra charged move where present. All five scenarios use those fixed choices. The custom generator does not search all movesets or adapt the moveset separately to each opponent. The upstream auto-selection path exists in the vendor source but is not enabled by this interface.

## 6. Five ranking scenarios

[Ranker.rankLoop / rank](vendor/Ranker.js) simulates each accepted Pokémon against the accepted opponent population in each of these scenarios. Both start at full HP. Energy values below are turns of advantage, not raw energy units.

| Category | Pokémon shields | Opponent shields | Pokémon energy advantage | Opponent energy advantage |
| --- | --- | --- | --- | --- |
| Leads | 1 | 1 | 0 turns | 0 turns |
| Closers | 0 | 0 | 0 turns | 0 turns |
| Switches | 1 | 1 | 4 turns | 0 turns |
| Chargers | 1 | 1 | 6 turns | 0 turns |
| Attackers | 0 | 1 | 0 turns | 0 turns |

For a nonzero advantage `t`, the subject starts with the energy from `max(1, floor(t × 500 / fastMove.cooldown))` fast moves, capped at 100 energy. A turn is 500 milliseconds. For example, a two-turn fast move gives two fast moves' energy in the Switches scenario. No prior damage is applied for those imaginary fast moves.

For symmetric shield/energy scenarios, the ranker reuses an already computed reverse matchup where available, swapping subject/opponent ratings and move usage. Asymmetric scenarios are simulated in each direction. Mirror matchups are simulated but get zero weight in the later score calculation.

## 7. What happens inside a battle

[Battle.js](vendor/Battle.js) advances the upstream turn simulation until a Pokémon faints (default battle-end mode), or until the elapsed simulation time exceeds 240,000 milliseconds. It resolves fast-move timing and energy, charged-move spending, shields, simultaneous actions and charged-move priority, buffs/debuffs, and supported form mechanics. There is no sampled tournament, human-play dataset, or actual three-Pokémon team battle in this calculation.

[ActionLogic.js](vendor/ActionLogic.js) makes the action decisions. It considers available charged moves, projected survival, opponent energy, fast-move knockouts, charged-move knockouts, shield baiting, self debuffs, and move timing. Pokémon defaults include selective shield baiting; the adapter does not override those tactical settings. These heuristics are part of the result, not a proof of optimal play. For complete branch-by-branch behavior, the linked shipped source is authoritative.

[DamageCalculator.js](vendor/DamageCalculator.js) normally computes:

```
damage = floor(power × STAB × effectiveAttack / effectiveDefense
               × typeEffectiveness × chargeMultiplier × megaMultiplier
               × 0.5 × battleBonus) + 1
```

`battleBonus` is approximately 1.3; STAB approximately 1.2; a type weakness approximately 1.6, resistance 0.625, and an immunity-style double resistance 0.390625. Dual-type multipliers multiply. Effective stats include stat stages and applicable Shadow effects. The file includes exact floating-point constants, percentage-of-max-HP damage, and form-specific exceptions; the approximation above is not a replacement for those branches.

The default simulation buff modifier is -1. Guaranteed effects still apply. For chance effects with a buff-application meter, the engine increments that meter by the activation probability and applies the effect when it crosses an integer. Other sandbox/forced/random branches remain upstream behavior. The adapter does not run Monte Carlo repeats or estimate confidence intervals.

## 8. Raw Battle Rating and shield adjustment

After a battle, each side's raw Battle Rating is:

```
H = remainingHP / startingMaxHP
D = (opponentStartingMaxHP - opponentRemainingHP) / opponentStartingMaxHP
BR = floor(500 × (H + D))
```

Raw BR ranges from 0 to 1000: above 500 indicates a win, below 500 a loss, and 500 a tie. For example, a winner retaining half its HP has BR 750. This is the rating displayed for individual key matchups and used directly by the moveset lab.

The category ranker then rewards the winning side for shields burned and retained:

```
adjustedBR = BR + winnerFlag × 100 × (opponentShieldsSpent + ownShieldsRemaining)
```

`winnerFlag` is 1 only for the winner determined by comparing the two raw ratings; both flags are zero for a 500 tie. This adjusted number can exceed 1000 before later score curves. It is an intermediate scoring value, not the raw matchup rating shown to users.

The initial category score S[i,0] is the floored arithmetic average of adjusted ratings across the target count, including the mirror at this initial stage. Later passes assign the mirror zero weight.

## 9. Iterative category weighting — the exact custom path

Our cup name is `custom`, which makes the upstream category ranker run seven weighting passes. Its non-custom path uses one pass. Each pass uses the previous pass's scores, and progressively downweights lower-performing opponents.

For pass n = 0 through 6, let B be the largest S[j,n] and c = 0.1 + 0.06n. In our equal subject/target population:

```
metaWeight[j] = max(S[j,n] / B - c, 0) ^ 1.65
weight[i,j] = metaWeight[j] × userWeight[j]
weight[i,i] = 0
```

The cutoff c grows from 0.10 to 0.46. The weight is not simply the entered number: it is that number multiplied by the opponent's current meta relevance. As scores change, later passes change the importance of opponents. Scaling all user weights by the same positive factor normally cancels in weighted averages; changing their ratios changes the result.

Before summing, the ranker modifies the stored adjusted matchup rating a:

```
if a > 700: a = 700 + sqrt(a - 700)
if a < 300: a = 300 ^ ((300 + a) / 600)
```

This compresses extreme wins and makes hard losses more costly. For Switches, a loss also increases its opponent's weight:

```
if a < 500: weight *= 1 + (500 - a)^2 / 20000
```

The intention is to reward safer switches instead of Pokémon with strongly polarized matchups. The next score is the floored weighted average:

```
S[i,n+1] = floor(sum(a[i,j] × weight[i,j]) / sum(weight[i,j]))
```

Important implementation details: the score curves modify `matches[j].adjRating` in place, so the seven-pass custom path can reapply them to an already curved value. The source also computes a contribution and an opponent-strength ordering value before a final cutoff assignment to the denominator weight. In the normal equal-population path, opponents below that cutoff already have zero meta weight. These details are retained because the vendor source is unchanged; a clean reimplementation that curves each raw rating only once would not be numerically identical.

The final pass supplies the category's unnormalized score. For Chargers only, it is multiplied by a fast-pressure / energy-carryover factor:

```
fastDPT = fastMove.power × fastMove.stab × shadowAttackMultiplier
          × (Attack / 100) / (fastMove.cooldown / 500)
carryover = 100 - minimum(activeChargedMove.energy)
chargerFactor = ((carryover / 100)^(1/2) × (fastDPT / 5)^(1/6))^(1/6)
```

Finally, each category is sorted descending and normalized to its own leader:

```
categoryScore = floor(1000 × unnormalizedScore / highestUnnormalizedScore) / 10
```

The best category score is 100. Other scores are truncated to one decimal place, not rounded to the nearest tenth. Category scores are relative to the current accepted population.

## 10. Key wins and counters

The category ranker stores up to five wins and up to five losses. Counters are selected after ordering by `adjustedOpponentRating × 4^weight`, then displayed in ascending raw BR. The win-selection code attempts to order by weighted contribution and displays selected wins descending by raw BR. Overall results inherit the Lead category's matchup lists; changing the category shows that category's lists.

A source-level subtlety: the counter-selection loop deletes intermediate `score` fields from visited matchup records before the subsequent win sort. Consequently, the shipped implementation's key wins are not guaranteed to be a fresh global top-five weighted-contribution selection. The app displays the upstream lists without correcting or recomputing them. They are illustrative key matchups, not an exhaustive matchup matrix.

## 11. Consistency score

[Pokemon.calculateConsistency](vendor/Pokemon.js) is a moveset heuristic rather than another set of battles. It estimates reliance on shield baiting and chance effects.

- Start with a factor of 1. Set fast/charged damage to power × STAB.
- If there are multiple charged moves, consider both neutral; if their first two types differ, also consider either one resisted at 0.625.
- Recompute charged damage per energy for each effectiveness scenario; sort by efficiency. An extra charged move gets the resistance factor of a matching first/second type, otherwise neutral. Power-Up Punch's efficiency gets its special doubling branch when it is the least efficient move.
- Calculate a cycle using `ceil(bestChargedEnergy / fastEnergyGain)` fast moves, their damage, and the best charged move's damage. The source applies its fast-type effectiveness adjustment after constructing total cycle damage; this order is preserved.
- Apply a bait-dependence factor when the most efficient move costs more than the alternative, when equal-cost Acid Spray acts as the alternative, or when the self-debuff branches apply. The factor combines the cycle's fast damage fraction with the alternate/best charged efficiency ratio. Close energy costs partially soften the penalty, with a separate self-buffing branch.
- For each charged move with a chance effect greater than 15% but below 100%, derive `buffConsistency = 0.5 + abs(0.5 - chance)`, `stages = abs(buffAtk) + abs(buffDef)`, and `buffsAsDamage = damage + stages × 25 × (1 - buffConsistency)`. Its factor is `damage / buffsAsDamage`; other charged moves contribute 1. Average these factors across charged moves.
- Multiply the bait and chance factors across effectiveness scenarios, then take their geometric mean.
- Multiply by 0.85 for Power-Up Punch and separately 0.85 for Lunge; multiply by 0.75 for Feather Dance and separately 0.75 for Bubble Beam, if present.
- Return `round(consistency × 1000) / 10`. The commented-out fast-duration penalty does not execute.

The full bait-condition expression and energy corrections are in the linked `calculateConsistency` method. This guide provides the calculation flow; that method is the exact executable definition, including precedence and special cases.

## 12. Overall score

[RankerOverall.js](vendor/RankerOverall.js) combines the five normalized category scores and consistency C. It aligns category entries by species name. Let L, K, S, G, A mean Lead, Closer, Switch, Charger, and Attacker scores respectively. Form four values and sort descending:

```
q = descendingSort([L, K, max(S, G), A])
overall = (q[0]^12 × q[1]^6 × q[2]^4 × q[3]^2 × C^2)^(1/26)
```

This is a weighted geometric mean. It emphasizes the best roles, uses the stronger of Switch and Charger, and includes consistency. The actual exponents above govern the result; an older nearby source comment describes a different weighting and is not the executable formula.

If both Attacker and consistency scores are at most 75, apply a second penalty:

```
overall = (overall^14 × A × C)^(1/16)
```

Upstream can then blend an editor score E, if a matching cup/league override exists with a truthy editor score:

```
overall = 0.25 × overall + 0.75 × E
```

Our custom worker supplies no overall editor override. Therefore this blend is not applied to generated results. Published mode displays the stored upstream values, including any blend already used. The adapter uses bundled overrides only to seed roster weights; it does not feed their editor scores into custom overall scoring.

Finally, `floor(overall × 10) / 10` truncates the overall score to one decimal and results are sorted descending. Overall scores are not rescaled to force a leader of 100. The six detail scores are Lead, Closer, Switch, Charger, Attacker, and Consistency.

## 13. Moveset lab — separate algorithm

The lab evaluates the selected species against accepted opponents, excluding its own species ID. The subject need not itself be accepted. There must still be at least two accepted roster entries. Every opponent keeps its published moveset and gamemaster default IVs.

The engine's actual fast and charged move pools are deduplicated and enumerated. For F fast moves and C ordinary charged moves (C at least 2), there are `F × C × (C - 1) / 2` combinations. Charged-move order permutations are not separately tested. Supported extra charged move pools multiply those pairs by the number of distinct extra choices. A single ordinary charged move uses a second-slot `none`. Pool accessibility is handled upstream, including available Elite TM, legacy, Return/Frustration, and form-specific rules; this is not a live check of the user's TM inventory or event access.

Each matchup starts with full HP, zero energy, and the chosen equal shield count (0, 1, or 2). Fresh opponent objects and reset battle state prevent previous matchups carrying over. For each moveset m:

```
labRating[m] = sum(rawBR[m,j] × userWeight[j]) / sum(userWeight[j])
```

This uses raw BR. It does not use category shield bonuses, seven-pass meta reweighting, score curves, Charger factors, consistency, or editor adjustments. It therefore answers a different question from Overall: how does this moveset perform against this weighted roster in this one shield scenario?

Movesets are sorted by labRating. Best-only keeps all ties within `1e-8` of the best. Otherwise, a threshold p shows `rating >= best × (1 - p / 100)`. A 10% threshold means at least 90% of the best weighted BR, not 10 points below the overall score. Set 100% to show every evaluated moveset. Below-best percentage is `(1 - rating / best) × 100`, with a zero-best guard.

The combination limit defaults to 500 and can be set from 1 to 10,000. If the complete set exceeds the limit, the run stops with an explicit error; it does not silently sample combinations. A species with no selectable combination reports an error. This version compares one species' alternatives at a time; it does not produce a joint ranking of every species × moveset or let all opponents optimize in response.

## 14. Browser execution, state, and limits

Generation and lab runs execute in a fresh Web Worker, using bundled data. A small adapter supplies the upstream GameMaster and intercepts the ranker's output; no upstream PHP endpoint is called and no results are uploaded. The overall ranker's JSON POST is captured as a local message. Cancel terminates the worker. Changing roster or weights invalidates generated results and lab results; changing league reloads its data. Selecting another Pokémon clears its predecessor's lab output. Results remain in page memory and are lost on reload.

Rank generation is approximately quadratic in roster size across five scenarios, with symmetric reuse where possible and seven score passes. Lab cost is proportional to moveset count × opponent count. Battle durations and special mechanics affect actual runtime. A large accepted roster can be expensive even if the interface remains responsive. The roster counter is an estimate of pair/scenario work, not a runtime prediction.

The original engine and rankers retain their rounding, indexing assumptions, heuristics, and unusual edge cases. Very small or pathological rosters can be less informative, and a degenerate zero denominator or non-finite upstream score is not mathematically repaired by this adapter. Scores should be interpreted within their selected roster and assumptions. They do not predict every player decision, team composition, lag condition, or IV-dependent breakpoint.

## 15. Developer and AI reading map

Read these files in order to inspect or modify the algorithm. All links resolve directly from this static page; no account or JavaScript execution is required to read this guide.

| File | Responsibility |
| --- | --- |
| [worker.js](worker.js) | Input setup, fixed moveset overrides, category/overall orchestration, output capture, lab battles. |
| [core.js](core.js) | Roster validation, combination enumeration, threshold/tie filtering. |
| [ui.js](ui.js) | Initial population, weights, user actions, results and state. |
| [GameMaster.js](vendor/GameMaster.js) | Data lookup, filtering, override application. |
| [Pokemon.js](vendor/Pokemon.js) | IV/level/stats, move pools, forms, reset behavior, consistency. |
| [Battle.js](vendor/Battle.js) | Turn simulation, action resolution, shields, buffs, end conditions. |
| [ActionLogic.js](vendor/ActionLogic.js) | Tactical move/energy/bait decisions. |
| [DamageCalculator.js](vendor/DamageCalculator.js) | Exact damage and type multipliers, special damage methods. |
| [Ranker.js](vendor/Ranker.js) | Scenarios, BR, shield adjustments, iterative weighting, normalization, key matchups. |
| [RankerOverall.js](vendor/RankerOverall.js) | Category combination, consistency, editor blend, final truncation. |
| [TimelineAction.js](vendor/TimelineAction.js), [TimelineEvent.js](vendor/TimelineEvent.js), [DecisionOption.js](vendor/DecisionOption.js) | Supporting action/event/decision structures. |

Run the repository's checks with `node --test familyRanks.test.cjs analysis.test.cjs pro.test.cjs`. They cover the existing tools, actual custom engine generation, weight sensitivity, combination enumeration, threshold ties, combination limits, and four-league bundle coverage. Bundled published arrays were also compared with the pinned upstream files. Tests establish these behaviors, not perfect parity with every future upstream release or exhaustive tactical optimality.

To refresh the snapshot, update all vendor sources, gamemaster, the four complete league bundles, override bundles, and the pinned commit references together. To globally rank alternative movesets in the future, first choose how opponents' movesets are fixed or optimized, whether weights attach to species or variants, and whether each variant gets the same five-scenario and consistency/editor treatment. The current lab's BR should not be silently substituted for Overall.
