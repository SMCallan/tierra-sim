# Statistical Analysis Plan v1.0

**Status: FROZEN, 2 August 2026. Written before any formal run has been executed.**

This plan supersedes Protocol v0.1 §6.2 and §6.4 under Decision 0019. Where the two disagree, this
document governs. It is fixed at the commit that introduces it; any later change is a deviation and
is handled under §9.

Its purpose is to fix every analysis choice that could otherwise be made after seeing the results.
The calibration evidence behind these choices (`D040`–`D043`) was generated at conditions selected
for instrument characterisation, and no formal outcome, test statistic, or hypothesis result
existed when the plan was written.

---

## 1. Design

Sixty runs, the inferential unit being the run (Decision 0005).

| Block | Conditions | Seeds | Runs |
|---|---|---|---|
| Factorial | mutation {0.01, 0.02, 0.04} × HGT {0.25, 0.50, 0.75} | 4 | 36 |
| Default series | mutation 0.02, HGT 0.50 | 12 | 12 |
| Mechanism controls | (μ 0, HGT 0), (μ 0.02, HGT 0), (μ 0, HGT 0.50) | 4 each | 12 |

Seeds are frozen in `Simulator/runner/presets/batch-formal-mpr-factorial-v2.json` and were fixed
before execution. The `v1` specification carries the same 60 runs, seeds and factor levels but the
superseded 500,000-tick horizon; `v2` is the executable one (`D047`). Horizon 100,000 ticks; export every 200 ticks; burn-in 10,000 ticks, first
included sample at tick 10,200 (Decision 0019).

All other engine parameters take the certified v9 qualified regime: `regeneration_per_tick` 1,
`harvest_per_activation` 3, on the 64 × 64 toroidal grid.

---

## 2. Outcomes

### 2.1 Primary

**Host-lineage `Δ_D`**, the equal-organism mean of `δ_i` over eligible host-lineage organisms,
averaged over scheduled samples strictly after tick 10,000.

One number per run. Promoted from secondary under Decision 0019 because population `Δ_D` is
confounded by lineage composition (`D042`).

### 2.2 Secondary, confirmatory

- Late-window host-lineage `Δ_D`, ticks 90,000–100,000.
- Post-burn-in decoupling `D_info = 1 − U(F|L)`, over samples where the estimand is defined.
- **Parasite persistence**: whether the parasite lineage is extant at tick 100,000, and the
  extinction tick where applicable. Promoted to a declared outcome because `D041` establishes it as
  the mechanism through which HGT acts.

### 2.3 Secondary, descriptive — reported, not tested

Population `Δ_D` (always with lineage composition), parasite-lineage `Δ_D`, mean eligible
proportion, inactive proportion, onset time to 50% and 90% of the run's asymptote, realised
mutation and HGT exposure, attempt and success rates, and functional-class counts.

Population `Δ_D` appears in every results table so the confound is visible rather than hidden, and
is never used for a between-condition test.

### 2.4 Not analysed

Area under the curve is reported as the primary mean multiplied by its defined observation
duration; it is not a second hypothesis test. Modality and clustering of the `δ_i` distribution are
out of scope (`D019`, `D024`), notwithstanding the twenty-bin histogram added under `D039`. The
term "functional speciation" is not used.

---

## 3. Handling of undefined and degenerate values

1. **Undefined samples are excluded, never imputed.** A sample with no eligible organisms
   contributes nothing; it is not read as zero. Trajectory integration breaks at gaps rather than
   interpolating across them.
2. **Coverage floor.** A run whose mean eligible proportion falls below 25% is labelled
   `divergence_not_reliably_estimable` (Decision 0007). Its ecology, persistence and activity are
   still reported; its divergence value is excluded from primary tests. The count of such runs is
   reported per condition.
3. **Single-lineage degeneracy.** When fewer than two ancestral lineages remain, `U(F|L)` and
   `D_info` are undefined with reason `single_lineage_degenerate` (Decision 0012). Such samples are
   excluded from the `D_info` outcome. **The proportion of degenerate samples is reported for every
   run**, because calibration shows it reaching 73% at 250,000 ticks and 99% in the worst
   100,000-tick run.
4. **Host-lineage `Δ_D` remains defined after parasite extinction** and is not censored. Its
   interpretation changes — host-descended organisms exploiting other hosts — and §6 requires that
   the change be stated wherever the primary outcome is reported.
5. **Population extinction.** A run losing all organisms is a categorical outcome, reported
   separately and excluded from continuous summaries.

---

## 4. Hypothesis tests

Two-way analysis on the 36 factorial runs, with mutation and HGT as three-level factors and their
interaction. The test of each effect is a **permutation test on the F-statistic**, 10,000
permutations, seeded and recorded, because normality and homoscedasticity are not assumed and
`n = 4` per cell is too small to establish them.

| | Effect | Outcome | Prediction |
|---|---|---|---|
| **H1** | mutation | host-lineage `Δ_D` | non-null; direction not assumed |
| **H2** | HGT | host-lineage `Δ_D` | increase |
| **H3** | mutation × HGT | host-lineage `Δ_D` | non-additive |
| **H4** | — | `D_info` vs. lineage-only baseline | functional measures more informative |

Effect sizes are reported as partial η² with bootstrap 95% intervals (10,000 resamples, run-level),
alongside raw cell means and standard deviations. **Effect sizes and intervals carry the
interpretation; p-values are reported but are not the finding.**

Mechanism controls are compared descriptively against the factorial cells. They are not entered
into the factorial model, whose factors are not defined at zero.

### 4.1 A prediction the calibration evidence expects to fail

`D043` finds host-lineage `Δ_D` at 0.8837, 0.8862, 0.8855 and 0.8860 across HGT 0, 0.25, 0.50 and
0.75 at the 100,000-tick horizon — a range of 0.0023 against within-cell standard deviations three
to five times larger — and the same null across four HGT levels at 7,500 ticks.

**H2 and H3 are nevertheless tested as originally stated.** They are recorded here as assessed
predictions, and revising a hypothesis to match a pilot before running the confirmatory experiment
would defeat the purpose of running it. A null result for H2 is the expected outcome and is
reported as a finding, not as a failure.

If H2 is null, the study's account of HGT is that it governs parasite persistence (§2.2) rather
than divergence magnitude. That interpretation is declared here, in advance, so that it cannot be
presented afterwards as though it had been predicted.

### 4.2 Onset

Onset is secondary and descriptive. It is estimated per run as the first sample at which the
trajectory reaches 50% and 90% of that run's post-burn-in asymptote, with a block bootstrap
(block length 25 samples = one behavioural window) for uncertainty. No 3σ rule is used
inferentially; it may appear as a labelled visual heuristic only (Decision 0005).

### 4.3 Amendment 1 — specifying the H4 test (2 August 2026, before any formal run)

The table in section 4 named H4 as "`D_info` vs. lineage-only baseline" without defining the
baseline or the test. That is not enough to implement, and the gap was found while writing the
analysis code rather than while writing the plan — which is the argument for writing the code
first.

**The baseline is the no-evolution control.** `control-no-evolution` sets mutation and HGT to zero,
so nothing moves behaviour away from its lineage expectation and `U(F|L)` should be high. The
factorial cells supply the contrast. The design already contains the comparison H4 needs; no new
runs and no invented reference value are required.

**The test** is a two-sample permutation test on the difference in mean post-burn-in `D_info`
between the 36 factorial runs and the 4 no-evolution control runs, 10,000 seeded permutations of
the group labels, reported with a bootstrap interval on the difference. H4 is supported if
factorial `D_info` exceeds control `D_info`.

This does **not** enter the controls into the factorial model, which section 4 forbids. It is a
separate two-group comparison, and the factorial runs contribute one value each, preserving the run
as the inferential unit.

**Three limits, stated now rather than discovered later.** The control group has four runs, so this
test is weak by construction and its interval will be wide. `D_info` is undefined once a lineage
goes extinct, and calibration found that happening in most runs — a control run that loses its
parasites contributes no defined samples and drops out, which could empty the baseline group
entirely. If fewer than three runs remain in either group, the test is not run and that fact is
reported in place of a result.

## 5. Multiplicity

Four hypotheses are tested. Holm–Bonferroni correction is applied across H1–H4 and the corrected
and uncorrected values are both reported. Secondary and descriptive outcomes are not corrected and
are **not** presented as hypothesis tests. Sensitivity analyses are never used to replace a primary
result; where a sensitivity disagrees with the primary, both are reported and the disagreement is
discussed.

---

## 6. Sensitivity analyses

Declared in advance, reported whether or not they agree with the primary:

- informative-action threshold 5 and 10, against a primary of 1 (Decision 0007);
- functional-class boundaries 0.05/0.95 and 0.20/0.80, against a primary of 0.10/0.90;
- burn-in 5,000 and 25,000, against a primary of 10,000;
- active-only lineage information;
- population `Δ_D` in place of host-lineage `Δ_D`, reported **with** lineage composition, as a
  direct demonstration of the `D042` confound rather than as an alternative answer;
- attempt-based strategy as a labelled diagnostic, never substituted for the realised measure.

### 6.1 Amendment 2 — computability of the declared sensitivities (2 August 2026, before any formal run)

An independent review checked each declared sensitivity against what a run actually exports. Four
are computable as written, one is computable by a route worth stating, and one is not computable at
all as written.

**Computable as exported.** Alternate informative-action thresholds 5 and 10 are computed by the
engine at sampling time and exported in the per-sample `sensitivity` array, each entry carrying its
own `divergence`, `functional_classes` and `lineage_information` at that threshold — no
post-processing of per-organism histories is required. Alternate burn-ins, active-only lineage
information (from the 2 × 4 lineage-by-class `functional_classes` table, dropping `inactive`), and
population `Δ_D` are all recomputable from the exported samples.

**Computable with a caveat: alternate functional-class boundaries.** These must be recomputed from
the **per-lineage** `divergence_histogram`, not the total. The histogram bins `δ_i`, and
`δ_i = p_i` only for host-lineage organisms; for parasite-lineage organisms `δ_i = 1 − p_i`, so the
bin order inverts. The total histogram mixes both transforms and cannot recover `p_i`. Bin width is
0.05, so boundaries at 0.05, 0.20, 0.80 and 0.95 fall on bin edges; an organism sitting exactly on a
boundary is assigned by bin membership rather than by the `≤` rule, which is a negligible but real
difference that must not be described as exact.

**Not computable as written: attempt-based strategy.** The plan implies a per-organism attempt ratio
paralleling `δ_i`. Attempts are exported per **lineage** per interval, in `lineage_interval`, and
never per organism. A per-organism attempt-based `δ_i` cannot be recovered.

The sensitivity is therefore **restated at lineage level** rather than dropped or bought with an
engine change. It becomes the lineage-level attempt ratio
`exploitative_attempts / (autonomous_attempts + exploitative_attempts)` from `lineage_interval`,
reported beside the realised success ratio as an intent-versus-realisation contrast. That is what
§6 asks of it — "a labelled diagnostic, never substituted for the realised measure" — and what
`Research/research-questions.md` describes attempts as being for.

**It is not a per-organism quantity and must never be presented as one.** A lineage aggregate cannot
show that a *particular* organism attempted more exploitation than it achieved; it shows only that
the lineage did. The dissertation states this wherever the diagnostic appears.

No engine change is made. Modifying the export immediately before a formal run would invalidate the
qualified build and require re-verification, in exchange for a diagnostic the plan does not test.

---

## 7. Reporting requirements

Every table or figure carrying the primary outcome must also carry, for each condition: the number
of runs contributing, the number excluded by the coverage floor, the number of runs whose parasite
lineage went extinct, and the mean proportion of `single_lineage_degenerate` samples.

This is not decoration. Calibration shows parasite extinction in 18 of 24 runs at this horizon, and
a host-lineage `Δ_D` of 0.89 means something different before and after that event. A reader must
be able to see which regime the number came from.

---

## 8. Reproducibility

Every reported statistic is produced by committed code under `Analysis/`, run against immutable
bundles under `Experiments/raw-data/`, with bundle checksums verified before analysis and the
analysis commit recorded. Permutation and bootstrap seeds are fixed and recorded. State hashes are
`sha256/canonical-scientific-state-v4` (Decision 0018) and are not comparable with v2 or v3 bundles.

---

## 9. Deviations

Any departure from this plan after the formal programme has been executed is a deviation. Each
deviation is recorded in the discrepancy register with the date, the reason, and whether the
outcome data had been inspected at the time. Deviations are reported in the dissertation alongside
the affected result.

Analyses not specified here are exploratory. They may be reported and may be interesting, but they
are labelled exploratory in the text and no hypothesis claim rests on them.
