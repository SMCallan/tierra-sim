# Decision 0019: Primary Outcome, Burn-In, and Observation Horizon for the Formal Programme

- **Status:** Accepted; amends Protocol v0.1 §6.2 and §6.4
- **Date:** 2 August 2026
- **Affects:** the primary estimand, the burn-in constant, the per-run tick count, and therefore
  every hypothesis test in Chapter 4
- **Evidence:** `D040`, `D041`, `D042`, `D043`;
  `pilot-250k-low-corner-summary.md`,
  `horizon-dependence-of-the-hgt-effect.md`
- **Taken before** any formal run has been executed. No formal outcome data existed when this was
  written, and none exists at the time of writing. That ordering is the point of the record.

## MPR authority

The Mid-Project Review commits to 48 formal runs, a 3 × 3 mutation × HGT factorial, four seeds per
cell, 500,000 ticks per run, and 200-tick export
(`assessed-scope.md`). Protocol v0.1 adds twelve
mechanism controls and fixes burn-in at 50,000 ticks with population `Δ_D` as the primary outcome.

The MPR does **not** assess the burn-in constant, the choice between population and lineage-specific
`Δ_D`, or the tick count as a scientific claim; those are implementation parameters the protocol
selected in advance of any evidence about the system's timescales. This decision changes three such
parameters. It does not change the factorial, the seeds per cell, the export interval, the
divergence construct (Decision 0001), the functional-class boundaries (Decision 0004), or the
eligibility floor (Decision 0007).

## 1. The primary outcome becomes host-lineage `Δ_D`

**Was:** the equal-organism mean population `Δ_D` over eligible organisms (Protocol v0.1 §6.2).

**Now:** the equal-organism mean `Δ_D` over eligible **host-lineage** organisms. Population `Δ_D`
is retained and reported as a secondary descriptive outcome, always accompanied by lineage
composition.

### Why

`D042`. Parasite-lineage organisms sit near `Δ_D = 0` and host-lineage organisms near 0.89, so the
population mean is close to a linear function of the parasite population share. Across the six
100,000-tick runs in which parasites survived:

| parasites remaining | population `Δ_D` | host `Δ_D` |
|---:|---:|---:|
| 1 | 0.892 | 0.894 |
| 15 | 0.876 | 0.884 |
| 234 | 0.746 | 0.873 |
| 278 | 0.774 | 0.884 |
| 628 | 0.634 | 0.889 |
| 952 | 0.492 | 0.896 |

The host column is flat; the population column spans 0.40. A condition that sustains parasites is
scored as *less* divergent although no lineage has changed its behaviour, and a condition whose
parasites go extinct is scored *higher* because the confound has been deleted along with them.

Since HGT is precisely the factor that governs parasite persistence (`D041`), the population
measure would attribute a composition artefact to the experimental manipulation. It is not
comparable across the cells of the design, which is what a primary outcome must be.

Host-lineage `Δ_D` is not a new construct. It is already specified in Protocol v0.1 §6.3, already
exported per sample, and already computed by `Analysis/src/formal/run-outcomes.ts`. This decision
promotes an existing secondary outcome; it does not invent one.

### What is given up

Population `Δ_D` answers "what does the average organism do", which is a reasonable question and
the one the protocol originally posed. It is retained for that purpose. What it cannot do is
support a between-condition comparison, and every hypothesis in this study is a between-condition
comparison.

## 2. Burn-in becomes 10,000 ticks

**Was:** 50,000 ticks; first included sample 50,200.

**Now:** 10,000 ticks; first included sample 10,200. Sensitivity analyses at 5,000 and 25,000
replace the previous 25,000 and 100,000.

### Why

`D040` and `D041`. The divergence process completes long before 50,000 ticks. Across 60 runs
spanning five mutation levels and four HGT levels, `Δ_D` reaches 90% of its asymptote between ticks
1,000 and 3,000, and the slowest condition observed reached `Δ_D = 0.5` at tick 1,400. In the
250,000-tick pilot, samples from tick 25,000 to 250,000 have mean 0.8901 and standard deviation
0.0111 — a flat line across 1,126 samples.

A 50,000-tick burn-in therefore discards the entire phenomenon under study and, in most conditions,
begins after the parasite lineage is already extinct. 10,000 ticks is more than three times the
slowest onset observed and remains an order of magnitude inside the retained horizon.

The value is chosen from onset timing alone, which is a property of the *trajectory* rather than of
any between-condition contrast, and no formal data exists to tune it against.

## 3. The horizon becomes 100,000 ticks

**Was:** 500,000 ticks per run.

**Now:** 100,000 ticks per run.

### Why

Two independent arguments, one of which cuts against a shorter figure and is the reason the horizon
is not reduced further.

**Divergence saturates early.** Beyond roughly tick 5,000 the trajectory is flat, so ticks 100,000
to 500,000 contribute 400,000 ticks of plateau to a mean that is already stable.

**Persistence does not.** `D041` is the constraint. Parasite extinction occurs between ticks 1,600
and 21,200 in most conditions but at tick 67,400 in the low-mutation, low-HGT cell. A horizon that
does not clear the slowest extinction cannot distinguish "coexisting" from "not yet extinct", and a
7,500-tick pilot that failed to clear it ranked the HGT levels in exactly the wrong order. 100,000
ticks clears the slowest observed extinction by roughly 50%.

This is the binding consideration, and it is why the horizon is set by the persistence timescale
rather than by the divergence timescale, which would permit something nearer 25,000.

### What is given up

Comparability of tick counts with the MPR projection, and any claim about behaviour beyond 100,000
ticks. The 250,000-tick pilot provides a single-cell check that nothing changes between 100,000 and
250,000 in the divergence trajectory; it does not establish that for persistence, and the
dissertation must not claim it does.

## 4. Consequences

- Protocol v0.1 §6.2 and §6.4 are superseded by
  [`statistical-analysis-plan-v1.0.md`](../../Experiments/protocols/statistical-analysis-plan-v1.0.md),
  which is frozen before formal execution and is the operative analysis specification.
- The formal programme becomes 60 runs × 100,000 ticks ≈ 6.8 minutes per run, roughly 1 h 45 m at
  concurrency 4. Feasibility is no longer a live constraint.
- `D042` and `D043` are addressed; `D040` and `D041` are closed by this record.
- Chapter 3 must state the amended values and cite this decision rather than Protocol v0.1 §6.2.

## 5. Threat to validity, stated plainly

Every change here was prompted by looking at data. The defence is not that no data was consulted —
it is that the data consulted is `CALIBRATION` class, generated at conditions chosen for
instrument characterisation, and that **no formal run has been executed**. There is no outcome, no
test statistic, and no hypothesis result that any of these choices could have been fitted to.

That defence expires the moment the formal programme runs. After that point, deviations from the
analysis plan are deviations, and §7 of the plan governs how they are reported.
