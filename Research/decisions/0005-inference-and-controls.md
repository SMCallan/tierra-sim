# Decision 0005: Use Run-Level Inference and Mechanism Controls

- **Status:** Accepted for protocol drafting
- **Date:** 18 July 2026
- **Affects:** Formal protocol, statistical methods, run count

## Context

The MPR proposes 48 runs and a sustained 3σ threshold. Simulation trajectories are autocorrelated, and organisms within a run are not independent replicates. The assessed factorial design also lacks zero-mechanism controls.

## Decision

Retain the assessed 48-run core:

- twelve baseline runs at mutation 0.02 and HGT success 0.50; and
- a 3 × 3 mutation/HGT factorial with four independent seeds per cell.

Add twelve mechanism-control runs, four each:

- mutation 0, HGT 0;
- mutation 0.02, HGT 0; and
- mutation 0, HGT 0.50.

The primary inferential unit is a run. Primary outcomes are post-burn-in mean/AUC divergence, late-window divergence, lineage-specific divergence, activity coverage, and lineage informativeness. Onset is secondary and uses control-calibrated, autocorrelation-preserving methods. A 3σ line may be shown only as a sensitivity heuristic.

Spatial topology remains fixed. The dissertation will not claim a causal effect of space without a separate topology experiment.

## Consequences

- Planned formal total: 60 runs before any optional extensions.
- Factorial effects and their interaction can be estimated without pseudoreplication.
- Mutation-only, HGT-only, and no-evolution baselines distinguish mechanisms.
- Final run count remains conditional on headless performance and precision analysis.
