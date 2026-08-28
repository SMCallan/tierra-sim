# Decision 0020: Report H4 as Untestable Rather Than Substitute a Baseline

- **Status:** Accepted; resolves `D052`
- **Date:** 2 August 2026
- **Affects:** how H4 is reported in Chapter 4; nothing else
- **Evidence:** `formal-v2` bundle, `control-no-evolution` block; SAP v1.0 Amendment 1
- **Taken after** the formal programme executed. That ordering matters and §4 addresses it.

## The situation

SAP v1.0 Amendment 1 made `control-no-evolution` the baseline for H4: mutation and horizontal
transfer both zero, so nothing can move behaviour away from its lineage expectation and `U(F|L)`
should be high.

All four `control-no-evolution` runs reached **total population extinction** at ticks 6,951, 7,399,
7,704 and 8,426 — before the 10,000-tick burn-in. Each therefore contributes zero post-burn-in
samples and no defined `D_info`. `testH4` returned `tested: false` with zero control runs, which is
what Amendment 1 instructed it to do.

## Decision

**H4 is reported as not testable as specified, with the reason.** No substitute baseline is used.

Three things are reported alongside it:

1. **The substantive finding the failure represents.** A population with neither mutation nor
   horizontal transfer is not viable over 100,000 ticks in this ecology; it dies in under 8,500.
   That is a result about the system, not a defect of execution.
2. **The measurement H4 was reaching for**, as a description rather than a test: across the 25
   factorial runs with any defined post-burn-in `D_info`, mean decoupling is **0.9991**, so
   `U(F|L) ≈ 0.0009`. Lineage explains around one tenth of one percent of the uncertainty in
   functional class. This requires no baseline to state.
3. **A horizon-matched comparison, labelled exploratory.** Over ticks 3,000–6,900 — after the
   divergence transient and before the earliest control extinction — factorial decoupling is 0.9989
   against control decoupling of **0.3591**. The difference is large and in H4's predicted
   direction.

## Why not substitute a baseline

Three substitutes were available and all three are rejected.

**`control-mutation-only`** (μ = 0.02, HGT = 0) survived to 100,000 ticks. It is not a
lineage-predicts-function baseline: mutation alone decouples behaviour from ancestry, and its
observed decoupling of 0.989–0.999 shows exactly that. Using it would compare two conditions that
both decouple and call the absence of a difference a null.

**`control-hgt-only`** (μ = 0, HGT = 0.5) also survived, with decoupling 0.856–0.973. Same
objection.

**Re-running the controls at a shorter horizon** to obtain a usable baseline would choose the
comparison after seeing that the declared one failed. That is the failure the whole pre-registration
apparatus exists to prevent, and it would be worse here than anywhere else in the study because the
substitution would be visibly outcome-driven.

## Why the exploratory comparison is admissible and the test is not

The window is fixed by **when the control runs died**, which is a property of the runs and not of
any outcome. It was not selected by inspecting decoupling values, and the decoupling values were not
consulted in choosing it.

But it is still a window chosen after execution, over a pre-burn-in interval the plan did not
declare, comparing four runs against twenty-nine. It is reported as **exploratory** under SAP §9,
labelled as such in the text, and no hypothesis claim rests on it.

The distinction is not pedantry. A confirmatory H4 would have licensed the sentence "functional
measurements explain realised action better than ancestral labels, `p` = …". What is licensed
instead is "lineage carries almost no information about function in every condition where it could
be measured, and a no-evolution control — which did not survive to the analysis window — showed
markedly less decoupling over the interval it did survive."

## What this costs, stated plainly

The study reports three of its four hypotheses. H4 is the one that most directly addresses the
research question's phrase "ceases to predict", and it is untested.

The mitigation is that `D_info = 0.9991` addresses the same question without a comparison: a
`U(F|L)` of 0.0009 is a direct statement that lineage does not predict function, and it does not
need a control to be interpretable. What is lost is the *comparative* claim that functional
measurement is better than ancestral labelling, which required the baseline.

## The design lesson, for Chapter 5

A control chosen to isolate a mechanism is not automatically viable over the analysis horizon.
`control-no-evolution` was specified to remove both variation mechanisms; removing both also removed
the population's capacity to persist. Nothing in the qualification process tested whether the
controls would survive, because qualification ran to 10,000 ticks and the controls die at 7,000 to
8,400 — inside the qualification horizon but never checked as a criterion.

**A future design should require every block, including controls, to survive the analysis horizon —
and should verify it before freezing the plan, not after running it.**

## Consequences

- Chapter 4 §4.3.7 reports H4 as untestable with the reason, the descriptive `D_info`, and the
  exploratory comparison labelled as exploratory.
- The Holm correction is applied across the **three** hypotheses actually tested. H4 contributes no
  p-value, so including it in the family would be correcting for a test that was not performed.
- `D052` is resolved by this record.
