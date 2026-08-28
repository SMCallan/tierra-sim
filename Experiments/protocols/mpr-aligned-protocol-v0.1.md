# MPR-Aligned Experimental Protocol v0.1

> **Partially superseded, 2 August 2026.** Sections 6.2 and 6.4, and the duration stated in the
> header below, are superseded by [Decision 0019](../../Research/decisions/0019-primary-outcome-burn-in-and-horizon.md)
> and [Statistical Analysis Plan v1.0](statistical-analysis-plan-v1.0.md). The operative values are
> **host-lineage `Delta_D`** as the primary outcome, a **10,000-tick** burn-in, and a **100,000-tick**
> horizon. Everything else in this document remains in force. It is retained unedited below so the
> superseded values stay visible rather than being rewritten out of the record.


- **Status:** Pre-formal protocol draft; engine implemented, ecology and analysis not yet frozen
- **Date:** 18 July 2026
- **Formal run count:** 60 planned, conditional on calibration and qualification
- **Simulation duration:** 500,000 completed ticks per run
- **Sampling interval:** 200 completed ticks

## 1. Aim

Test when and to what extent ancestral lineage ceases to predict realised ecological behaviour as mutation probability and conditional horizontal gene-transfer success vary in a spatial digital ecosystem.

The experiment estimates lineage–behaviour divergence. It does not assume that divergence is monotonic and does not treat divergence alone as functional speciation.

## 2. Research question and hypotheses

The canonical question is:

> Under controlled variation in mutation rate and horizontal gene-transfer success, when and to what extent does ancestral lineage cease to predict the realised ecological behaviour of digital organisms in a spatial digital ecosystem?

The predeclared hypotheses are:

- mutation changes the magnitude or trajectory of divergence, with no globally monotonic direction assumed;
- increasing conditional HGT success increases lineage–behaviour decoupling when `SPLICE` is expressed;
- mutation and HGT interact because mutation creates or modifies instructions while HGT moves instructions across lineages; and
- realised functional class becomes less predictable from lineage as divergence develops.

## 3. Experimental unit and common environment

One independently initialised simulation run is the experimental unit. Organisms and repeated time samples within a run are not independent replicates.

All formal runs use the same frozen:

- engine source commit and dependency lock;
- spatial dimensions and toroidal Von Neumann topology;
- ancestor fixtures and starting-population composition;
- energy, reward, cooldown, genome-bound, death, and scheduling rules;
- duration, sampling, and measurement rules; and
- output and analysis schema versions.

Only the declared condition factors and assigned master seed vary. No causal claim about spatial topology will be made because topology is not manipulated.

## 4. Factors and conditions

### 4.1 Assessed 3 x 3 factorial: 36 runs

| Factor | Levels |
|---|---|
| Birth mutation probability per locus | 0.01, 0.02, 0.04 |
| Conditional `SPLICE` success probability | 0.25, 0.50, 0.75 |
| Replicates | 4 seed blocks per cell |

The HGT factor controls the probability that an attempted `SPLICE` succeeds. It does not directly set HGT event frequency. HGT attempts and realised successes are measured as mechanism exposure.

### 4.2 Assessed default-condition series: 12 runs

Twelve additional runs use mutation 0.02 and HGT success 0.50. They use seeds distinct from the four factorial seed blocks. These preserve the MPR's baseline series and improve estimation of ordinary trajectory variation at the central condition.

The central factorial cell remains part of the balanced factorial analysis. The twelve extra runs are reported as the default-condition series and are not silently added to that cell in a balanced ANOVA.

### 4.3 Mechanism controls: 12 runs

Four runs are assigned to each control:

| Control | Mutation | HGT success | Purpose |
|---|---:|---:|---|
| no-evolution | 0 | 0 | Tests change without either genome-change mechanism. |
| mutation-only | 0.02 | 0 | Isolates birth mutation under central settings. |
| HGT-only | 0 | 0.50 | Isolates horizontal transfer under central settings. |

Controls reuse the four factorial seed-block identifiers to support blocked comparisons. The ancestor fixture MUST make `SPLICE` reachable without mutation; otherwise the HGT-only condition is structurally invalid.

### 4.4 Total and optional extensions

The planned formal total is `36 + 12 + 12 = 60` runs.

A computation-reward-off condition is not part of the primary 60 because computation is not a manipulated cause in the primary question. It becomes a separately preregistered extension if the dissertation makes a causal claim that computation rewards alter divergence. A non-spatial control is likewise required before claiming that space causes an observed pattern.

## 5. Seed assignment and randomisation

Before formal execution:

1. generate four factorial/control master seeds and twelve distinct default-series seeds from a documented seed-table generator;
2. record the complete condition-by-seed table under version control;
3. assign stable `run_id`, `condition_id`, and `replicate_id` values;
4. randomise batch launch order independently of condition; and
5. freeze the table before inspecting formal outcomes.

The same four seed values are used as blocks across all nine factorial cells and three mechanism controls. This common-random-number design is intended to reduce stochastic comparison noise; after paths diverge it does not make runs identical or turn within-run organisms into replicates.

Parallel execution is permitted because runs share no state. Concurrency, scheduling order, or machine load MUST NOT affect scientific state hashes.

## 6. Operational outcomes

### 6.1 Individual strategy and divergence

For each living organism over the 5,000-tick trailing window:

- `A` is successful autonomous births through `COPY`;
- `E` is successful exploitative births through `EXEC_NBR`; and
- `p = E / (A + E)` when at least one realised birth is present.

For lineage expectation `L=0` for host and `L=1` for parasite:

`delta = abs(p - L)`

The population `Delta_D` is the equal-organism mean of eligible individual `delta` values. It is always accompanied by lineage-specific distributions and active coverage. Failed attempts are diagnostic exposures, not realised actions.

### 6.2 Primary run-level outcome

The first 50,000 completed ticks are burn-in. The primary outcome is the time-weighted mean population `Delta_D` over scheduled samples strictly after tick 50,000 through tick 500,000; the first included sample is tick 50,200.

The analysis reports the proportion of scheduled post-burn-in samples with a defined value. Following calibration Decision 0007, a run with less than 25% mean eligible-organism coverage is labelled `divergence_not_reliably_estimable`; its ecology, extinction, and activity remain reported, but its divergence value is not imputed or replaced by zero. This is a qualification floor for the conditional active-organism estimator, not a claim that eligible organisms represent the complete population.

### 6.3 Key secondary outcomes

- late-period mean `Delta_D` over ticks 400,000–500,000;
- post-burn-in and late-period host-lineage and parasite-lineage means;
- mean active coverage and inactive proportion;
- post-burn-in lineage–function decoupling `D_info = 1 - U(F|L)`;
- cumulative realised mutation and HGT exposure;
- autonomous and exploitative attempt/success rates; and
- extinction occurrence and tick.

Area under the `Delta_D` curve is reported as the primary mean multiplied by its defined observation duration; it is not treated as an independent second hypothesis test.

### 6.4 Sensitivity outcomes

- informative-action thresholds 5 and 10 instead of 1;
- active-only lineage information;
- functional boundaries 0.05/0.95 and 0.20/0.80 instead of 0.10/0.90;
- burn-in at ticks 25,000 and 100,000 instead of 50,000; and
- attempt-based strategy as a labelled diagnostic, never substituted for the realised primary outcome.

## 7. Statistical analysis

### 7.1 Factorial analysis

The 36 balanced factorial runs are analysed with mutation and HGT as categorical factors, their interaction, and seed block:

`outcome ~ mutation * hgt_success + seed_block`

Treating factor levels as categorical avoids imposing a linear or monotonic response. Report cell summaries, marginal contrasts, interaction contrasts, effect sizes, and 95% confidence intervals.

Model assumptions are checked on run-level residuals. With four blocks and potentially non-normal outcomes, the default confirmatory tests use randomisation/permutation procedures that respect seed blocks. A parametric two-way model is a companion estimate when diagnostics are adequate, not the sole evidence.

The interaction on the primary outcome is the first confirmatory test. If supported, simple mutation and HGT effects are interpreted within levels rather than as one global main effect. If not supported, marginal main effects are reported with uncertainty. Exact permutation and interval procedures will be frozen in the analysis-plan implementation before formal launch.

### 7.2 Controls and default series

Mechanism controls are compared through predeclared blocked contrasts:

- mutation-only minus no-evolution;
- HGT-only minus no-evolution; and
- central factorial condition minus each single-mechanism control.

The twelve default-condition runs estimate central-condition trajectory and outcome variability and provide a precision check against the four-run factorial cell. They are plotted and summarised separately, with a labelled supplementary pooled estimate allowed where balance is not being assumed.

### 7.3 Multiple outcomes

The primary factorial interaction has one declared primary outcome. Key secondary outcomes are reported with effect sizes and false-discovery-rate-adjusted exploratory p-values. Sensitivity analyses are robustness evidence and are not searched for a preferred significant result.

### 7.4 Extinction and missingness

Extinction is an ecological outcome, not a technical exclusion. Report it by condition and analyse time to extinction descriptively; use an exact or discrete-time survival comparison only if event counts support it.

After either ancestral lineage disappears, individual divergence remains reportable for eligible
survivors, but primary two-lineage information statistics are labelled
`single_lineage_degenerate`. The absent lineage's summary is undefined rather than zero. Formal
runs are never replaced to restore coexistence.

If more than one of four runs in any factorial cell fails the 25% divergence-coverage rule, the primary divergence comparison for that region is declared conditionally estimable and survival/activity outcomes take interpretive priority. No replacement seed is introduced.

## 8. Secondary onset analysis

Onset is secondary because simulation samples are autocorrelated and a first threshold crossing is unstable.

Before formal launch, independent calibration/control trajectories will freeze:

- a moving-block length based on the longest relevant control autocorrelation scale;
- a simultaneous 95% control envelope for post-burn-in trajectory excursions; and
- the required persistence of 50 samples, equivalent to 10,000 ticks.

For a formal run, onset is the first sample at which divergence exceeds the frozen control envelope for 50 consecutive samples while eligible population coverage remains at least 25%. If those conditions never hold, onset is undefined rather than set to 500,000.

The MPR's sustained three-standard-deviation rule may be reproduced as a clearly labelled sensitivity heuristic. It is not the confirmatory onset method and individual time samples are not treated as independent observations.

## 9. Calibration stage

Calibration occurs only after VM, accounting, and determinism validation. It selects numerical energy ecology and ancestor fixtures using declared acceptance ranges, not desired divergence outcomes.

The calibration report MUST show:

- survival and extinction across lineages;
- population occupancy;
- energy-source/sink balance;
- genome-length distributions and boundary contact;
- autonomous/exploit attempts and successes;
- HGT opportunity and success;
- computation reward contribution;
- local-resource stock, depletion, regeneration, harvest and reservoir-inclusive energy balance;
- primary eligibility coverage; and
- wall time, memory, and output volume.

Calibration MUST require a frozen minimum interaction-exposure period and cross-lineage contact,
not a chosen final lineage proportion. It MUST NOT tune parameters to maximise `Delta_D`, force
permanent coexistence, produce a visually preferred trajectory, or reproduce the unaudited MPR
pilot onset. Candidate parameters and the selection rule are retained even when rejected.

## 10. Formal execution procedure

1. Obtain the required ethical and departmental clearance for the planned data workflow.
2. Pass every mandatory validation gate.
3. Approve and hash the calibration report, seed fixture, resolved formal preset, condition table, and analysis plan.
4. Tag the clean source commit and record dependency digests.
5. Run a short validation batch and compare all expected golden hashes.
6. Launch the randomised 60-run batch without inspecting results to alter remaining assignments.
7. Verify every terminal status, manifest, state hash, checksum, and accounting identity.
8. Mark raw run directories read-only and create the batch digest.
9. Run the frozen analysis against that batch digest.
10. Record all deviations before interpreting outcomes.

## 11. Exclusion and rerun policy

Valid ecological outcomes, including extinction, low activity, no divergence, or extreme populations, are never rerun merely because they are inconvenient.

A run is technically invalid only for a documented engine invariant failure, corrupt output/checksum, incompatible environment, interruption not recoverable from a validated checkpoint, or divergence from its expected deterministic hash. After a scientific defect, every affected run is invalidated, the engine version changes, validation is repeated, and the whole affected design table is rerun with the original seeds. Versions are not pooled.

## 12. Interpretation boundaries

The experiment can support claims about:

- mutation/HGT associations with lineage–behaviour divergence under this model;
- realised autonomous, exploitative, mixed, and inactive strategy distributions;
- loss of functional information carried by ancestral lineage; and
- mechanism-dependent temporal dynamics.

Without additional experiments it cannot establish:

- that spatial structure caused an effect;
- biological universality outside the model;
- open-ended evolution or intelligence;
- predation dynamics; or
- functional speciation merely from a high divergence score.

“Functional speciation” is reserved for an extension demonstrating persistent, heritable, distinct functional clusters with ecological or fitness differentiation and direct multimodality or clustering evidence.

## 13. Items to freeze after implementation and calibration

This protocol becomes executable only when the following linked artefacts exist:

- formal resolved configuration `formal-default-v1`;
- content-addressed ancestor fixture;
- complete 60-run condition/seed table;
- validation report;
- calibration report;
- benchmark and storage report;
- exact statistical analysis-plan code and environment lock; and
- ethical/data-governance confirmation.

Changing one of these after formal launch creates a new protocol/dataset version.
