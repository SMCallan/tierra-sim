# Decision 0015: Continuous Linear Genome Maintenance Cost and Elimination of Zero-Cost Refuges

- **Status:** Accepted
- **Date:** 1 August 2026
- **Affects:** engine lifecycle, energy accounting, configuration schema 0.5, discrepancy register D031

## MPR Authority and Scientific Context

The Mid-Project Review (MPR) and submitted proposal establish genome length as a dynamic evolutionary trait. Organisms alter their genome length through insertion, deletion, and replication mutations. Larger genomes can express richer instruction sequences, but must pay higher replication and maintenance costs to preserve energy conservation.

Discrepancy `D031` identified a critical defect in the v8 engine's maintenance cost formula:
- For genome lengths $L \le 7$, maintenance cost was $0$ energy per activation.
- For genome lengths $L \ge 8$, maintenance cost was $1$ energy per activation.

In diagnostic seed 271828182 (Regen 1, Harvest 3), host organisms initially at length 8 collapsed under maintenance demand, but mutated down to length 6 ($0$ cost), allowing a population of 8 near-extinction hosts to recover to 2,752 organisms by tick 4,000. This "evolutionary rescue" was an artefact of escaping maintenance costs entirely, creating an unphysical zero-cost refuge.

## Decision

1. **Elimination of Zero-Cost Refuges:** No living organism, regardless of genome length $L \ge L_{\min}$, shall have a zero maintenance cost.
2. **Proportional Maintenance Cost Formula:** Maintenance cost per activation is defined as:
   $$\text{maintenance\_cost}(L) = \max\left(1, \left\lfloor \frac{L}{\text{maintenance\_divisor}} \right\rfloor\right)$$
   where $\text{maintenance\_divisor}$ is a positive integer declared in `resolved-config.json` (default $k = 8$, yielding 1 energy for $L \in [1, 15]$, 2 for $L \in [16, 23]$, etc.).
3. **Energy Accounting:** All maintenance energy debited from an organism is transferred to `dissipated_energy` and recorded in cumulative counters.
4. **Configuration Schema:** Add `maintenance_divisor` to `energy.maintenance` in configuration schema 0.5.

## Consequences

- Prevents artificial evolutionary rescue via genome shrinkage below cost thresholds.
- Preserves energy conservation: debited maintenance energy adds directly to `dissipated_energy`.
- Retains compatibility with legacy datasets via schema versioning; legacy runs preserve their historical execution semantics under schema 0.4.
