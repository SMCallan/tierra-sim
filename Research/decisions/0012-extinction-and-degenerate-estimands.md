# Decision 0012: Treat Extinction as Outcome and Mark Degenerate Estimands

- **Status:** Accepted and implemented before v8 outcomes
- **Date:** 19 July 2026
- **Affects:** calibration gates, lineage information, divergence interpretation, formal analysis

## MPR authority

The graded Mid-Project Review requires permanent ancestral labels, longitudinal population and
cross-classification export, and measurement of lineage–function divergence under controlled
mutation and HGT. It motivates spatial refugia and maintenance of ecological diversity, but it
does not state that both founding lineages must coexist until the final tick or that extinction
invalidates a run.

The MPR's trajectory claims tacitly assume an observable population. Reconstruction must make
the boundary explicit rather than selecting an ecology merely because it preserves the desired
comparison.

## Decision

Lineage extinction is a valid ecological outcome and never a technical exclusion. Calibration
requires a predeclared minimum period of simultaneous lineage presence, cross-lineage contact,
and realised mechanism exposure; it does not require a chosen final abundance or permanent
coexistence.

After one lineage disappears:

- individual `p_i` and `delta_i` remain defined for eligible living organisms;
- the absent lineage's summaries are `null`, not zero;
- population `Delta_D` may continue as an explicitly composition-dependent living-population
  summary, accompanied by lineage counts and extinction state;
- two-lineage prediction/information claims are marked `single_lineage_degenerate` even if a
  numerical contingency-table expression could be evaluated; and
- extinction tick, functional persistence, active coverage, and surviving-lineage behaviour are
  retained as outcomes.

Theil's `U(F|L)` and complementary `D_info` require at least one living organism from each
ancestral lineage and non-zero functional entropy for their primary two-lineage interpretation.
When either condition fails, both are exported as undefined with a machine-readable reason.

Formal runs are never replaced because a lineage goes extinct or because divergence becomes
conditionally unestimable. The protocol's coverage rule and extinction analysis govern those
outcomes.

## Consequences

- Calibration no longer optimises permanent coexistence or a final lineage proportion.
- It must still show that both lineages had a scientifically useful opportunity to interact.
- A surviving population cannot be presented as evidence that lineage is uninformative when
  only one lineage category remains.
- Functional persistence after ancestral-lineage extinction becomes a reportable secondary
  phenomenon rather than disappearing from the analysis.
