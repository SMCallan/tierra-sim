# Research Questions and Measurement Decisions

## Canonical research question

**Under controlled variation in mutation rate and horizontal gene-transfer success, when and to what extent does ancestral lineage cease to predict the realised ecological behaviour of digital organisms in a spatial digital ecosystem?**

## Secondary questions

1. How does mutation rate affect the onset, magnitude, and persistence of lineage–behaviour divergence?
2. How does HGT success probability affect those outcomes?
3. Is there an interaction between mutation and HGT, such that their joint effect differs from the sum of their separate effects?
4. Do lineage-specific divergence distributions reveal heterogeneous strategies that a population mean conceals?
5. Does a functional measurement derived from realised behaviour retain more ecological information than ancestral lineage alone?

## Hypotheses

### H1: Mutation effect

Increasing mutation rate will change lineage–behaviour divergence. The direction is not assumed to be globally monotonic: high mutation may initially accelerate innovation but can also destroy persistent strategies near an error threshold.

### H2: HGT effect

Increasing successful horizontal transfer will increase the rate at which behaviour becomes decoupled from vertical ancestry, provided transferred instructions are expressed and affect realised ecological actions.

### H3: Interaction

Mutation and HGT will interact. Mutation supplies and modifies behaviours; HGT moves them across lineages. Their combined effect is expected to be stronger than either mechanism alone over at least part of the parameter space.

### H4: Functional information

Behavioural measurements and functional classes will explain realised ecological actions better than ancestral labels. This must be evaluated using predictive or information-based measures, not asserted from visual disagreement alone.

## Measurement level: individual first, population second

Lineage is an individual attribute, so divergence should first be defined for each organism. Population and lineage summaries are then derived from the individual distribution.

This avoids the ecological fallacy in which a population-wide average is treated as if every organism exhibits that average strategy.

At time `t`, for organism `i`, consider a trailing behavioural window `W`:

- `A_i(t)`: realised autonomous ecological actions, defined as successful offspring production through the organism's own `COPY` instruction;
- `E_i(t)`: realised exploitative ecological actions, defined as successful offspring production through `EXEC_NBR` using an energy endowment and levy paid by the selected neighbour; and
- `N_i(t) = A_i(t) + E_i(t)`: total strategy-informative actions.

The continuous exploitative tendency is:

`p_i(t) = E_i(t) / N_i(t)`

for organisms with sufficient strategy-informative activity.

The lineage expectation is:

- `L_i = 0` for host-lineage organisms; and
- `L_i = 1` for parasite-lineage organisms.

Individual behavioural divergence is:

`δ_i(t) = |p_i(t) - L_i|`

The population Divergence Delta is the equal-organism mean among eligible organisms:

`Δ_D(t) = mean_i(δ_i(t))`

Equal-organism weighting prevents unusually active organisms from dominating the score. The following must always accompany `Δ_D(t)`:

- the full distribution of `δ_i(t)`;
- host-lineage and parasite-lineage means;
- lineage and functional-class counts;
- the number and proportion of eligible organisms; and
- the inactive/undefined proportion.

## Why the denominator is not all opcode executions

NOPs, jumps, register movement, and failed instructions can dominate instruction counts without representing an ecological strategy. Dividing exploitative calls by all executed opcodes would make the metric highly sensitive to genome length, control-flow style, and padding.

The primary ratio therefore compares realised autonomous and exploitative ecological actions. Attempted actions will also be recorded as diagnostic variables, allowing analysis of intent/capability versus realised effect.

Computation is a separate phenotype dimension. It should not be forced onto the autonomous–exploitative axis. A phenotype vector can record autonomous reproduction, exploitation, rewarded computation, inactivity, and other future action classes independently.

## Mixed behaviour

Mixed behaviour is represented continuously rather than assigned an arbitrary binary label for the primary analysis.

If a host-lineage organism obtains 20% of its strategy-informative realised actions through exploitation, then:

`p_i = 0.20`, `L_i = 0`, and `δ_i = 0.20`.

It does **not** follow that executing `EXEC_NBR` on 20% of all ticks automatically gives `δ_i = 0.20`. Failed attempts and unrelated opcodes are tracked separately.

For a parasite-lineage organism with the same realised exploitative tendency:

`p_i = 0.20`, `L_i = 1`, and `δ_i = 0.80`.

Descriptive classes such as predominantly autonomous, mixed, and predominantly exploitative may be added for visualisation, but threshold choices must be declared and tested for sensitivity. They are not substitutes for the continuous measure.

## Inactive organisms

When `N_i(t) = 0`, the exploitative tendency is undefined, not zero. Treating inactivity as autotrophy would bias host-lineage agreement and misclassify inert organisms.

The primary `Δ_D` summary will exclude behaviourally undefined organisms while reporting their frequency and lineage. A secondary categorical analysis will include `inactive/inert` as an explicit phenotype, so inactivity cannot disappear from the ecological account.

Calibration demonstrated that five realised births selects a small prolific-survivor subset in a stable birth–death ecology. Decision 0007 therefore uses one realised action as the primary minimum, with sensitivity analyses at five and ten. Coverage and inactivity remain explicit outcomes rather than being tuned away.

## Is `KILL` required?

No. `KILL` is not conceptually required to test lineage–behaviour divergence and would add predation as a second exploitative mechanism, complicating causal interpretation.

The minimum defensible first experiment needs one autonomous reproductive pathway and one genuinely exploitative pathway. `EXEC_NBR` can supply the exploitative pathway only if success imposes a measurable cost on, or transfers a constrained resource from, the neighbour. Merely reading a neighbour’s instruction without affecting it is better described as neighbour-assisted reproduction or informational exploitation than biological parasitism.

The MPR’s `KILL` opcode is therefore an assessed design proposal whose removal from the first formal engine is scientifically justified, subject to a recorded decision. Predation can be a later extension.

## Threshold and autocorrelation

A simple “three standard deviations for 10,000 ticks” rule is not sufficient inferential evidence. Consecutive simulation samples are autocorrelated, the baseline may be non-stationary or non-normal, and repeated threshold testing inflates false positives.

The MPR rule may be retained as a descriptive visual heuristic, but formal onset detection should use:

1. independent simulation runs as the replication unit;
2. an explicitly declared burn-in period;
3. control-derived thresholds calibrated from whole-trajectory maxima or sustained excursions;
4. block bootstrap or another method that preserves temporal dependence;
5. change-point analysis with false-positive behaviour tested on controls; and
6. sensitivity analysis over window length and persistence requirements.

Primary run-level outcomes should include:

- mean or area-under-curve `Δ_D` after burn-in;
- late-window mean `Δ_D`;
- host- and parasite-lineage divergence separately;
- calibrated onset time, if an onset is detected;
- active-coverage and inactive proportions; and
- lineage–phenotype information or predictive scores.

Maximum `Δ_D` is useful descriptively but is vulnerable to extreme-value bias and should not be the sole response variable.

The mutation × HGT factorial analysis will estimate effect sizes and uncertainty at the run level. Two-way regression/ANOVA is acceptable only after checking assumptions; permutation, robust regression, or hierarchical time-series models are preferred where assumptions fail. Organisms and time points within one run are repeated observations, not independent replicates.

## Lineage informativeness as validation

`Δ_D` is accompanied by Theil's uncertainty coefficient `U(F|L) = I(F;L)/H(F)` and its complementary decoupling score `D_info = 1-U`. The primary contingency table includes autonomous, mixed, exploitative, and inactive classes; active-only and alternate-threshold versions are sensitivity analyses.

Decision 0012 adds a second interpretive boundary: when fewer than two ancestral lineage
categories remain, primary `U(F|L)` and `D_info` are exported as undefined with reason
`single_lineage_degenerate`. Individual divergence for eligible survivors remains available, but
a constant lineage label cannot support the claim that lineage has lost predictive information.

This provides a direct test of the phrase “lineage ceases to predict function” and protects against weaknesses of any single scalar distance.

## Does “functional speciation” overstate the result?

Yes, unless additional criteria are satisfied. Lineage–behaviour divergence, the presence of hybrids, or a broad trait distribution does not by itself demonstrate speciation.

The default terminology will be:

- **lineage–behaviour divergence**;
- **phenotypic drift**;
- **ecological strategy differentiation**; or
- **functional-role diversification**.

“Functional speciation” will be reserved for evidence of persistent and heritable clustering into distinct strategies, with demonstrated temporal stability and ecological or fitness differentiation. Multimodality must be tested directly; a coefficient of variation is not proof of separate modes.

## Experimental continuity with the MPR

The MPR’s 3 × 3 factorial design remains the starting design:

- mutation: 1%, 2%, 4%;
- HGT success: 0.25, 0.50, 0.75; and
- four independent runs per cell, plus twelve baseline runs.

The planned 12 additional mechanism controls are:

- mutation disabled and HGT disabled;
- mutation enabled and HGT disabled;
- mutation disabled and HGT enabled.

A computation-reward-off extension is required only if computation is given a causal interpretation. If spatial structure is claimed to cause an effect, a non-spatial or altered-neighbourhood comparison is required. The planned formal total is 60, subject to performance and precision qualification.

## Decisions resolved for the current specification

1. Exploitation transfers offspring energy and an exploit levy from neighbour to caller's offspring event; numerical costs are calibrated and frozen in config.
2. Only successful exploitative reproduction contributes to `E_i`; resource transfer is its required mechanism and a separate audit measure.
3. Behaviour uses 25 global 200-tick buckets for a 5,000-tick trailing window.
4. The primary informative-action threshold is one, with five and ten as conservative sensitivities.
5. The lineage-informativeness validation is Theil's `U(F|L)` and complementary `D_info`.
6. The assessed 48 runs are augmented by 12 mutation/HGT controls.
7. The 16-opcode VM and exact instruction semantics are fixed in the engine specification.
8. Lineage extinction is retained as an outcome; single-lineage information estimands are
   explicitly degenerate rather than interpreted numerically.
9. Cyclic donor `COPY` search is the primary exploitation construct; exact addressing is a
   separately labelled sensitivity.
10. Schema 0.4 replaces passive per-organism income with a lineage-neutral local renewable
    resource field under a reservoir-inclusive energy identity.

These resolutions are governed by `Research/decisions/` and `Simulator/docs/`. Calibration-dependent numeric values remain deliberately open until the validated engine can be piloted.
