# Decision 0001: Behavioural Divergence Is Individual-First

- **Status:** Accepted for specification
- **Date:** 18 July 2026
- **Affects:** Primary outcome, data schema, statistical analysis

## Context

The MPR defines Divergence Delta as a distance between lineage-expected phenotype and observed exploitative behaviour, but does not fully resolve whether it is calculated per organism, lineage, or population.

## Decision

Calculate a continuous divergence value for each eligible organism from realised autonomous and exploitative ecological actions within a trailing window. Summarise that distribution separately for each lineage and for the population. Treat the independent simulation run—not organisms or time samples—as the replication unit for formal inference.

The primary per-organism strategy score is `p = E / (A + E)`, where `A` and `E` are realised autonomous and exploitative actions. Divergence is `δ = |p - L|`, with lineage expectation `L=0` for host descendants and `L=1` for parasite descendants.

## Consequences

- Mixed behaviour remains continuous.
- Population means cannot conceal lineage-specific distributions in the reported output.
- Computation is measured on a separate phenotype axis.
- Attempted and successful actions are recorded separately.
- A lineage-by-functional-strategy information measure validates the primary scalar outcome.
