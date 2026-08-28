# Decision 0016: Shared Neighbourhood Resource Depletion and Density-Dependent Ecological Carrying Capacity

- **Status:** Accepted
- **Date:** 1 August 2026
- **Affects:** world resource field, harvest lifecycle, configuration schema 0.6, discrepancy register D026, calibration gate v9

## MPR Authority and Scientific Context

The Mid-Project Review (MPR) and submitted proposal establish space, local energy scarcity, and density-dependent competition as essential ecological drivers of host–parasite coevolution. The primary ecological requirement is a sustainable carrying capacity where population occupancy fluctuates within a middle regime ($0.20 \le \text{occupancy} \le 0.80$), creating spatial turnover and open grid gaps without global extinction or complete grid saturation.

Decision 0014 replaced passive per-organism income with a local renewable resource field where each cell $(x, y)$ stored an independent resource stock $R(x, y)$. However, the post-v8 diagnostic audit (`SCI-001`) demonstrated that independent self-cell renewal produces a severe binary outcome failure:
- At regeneration rate $r = 1$, populations collapsed or nearly collapsed (`late_mean_occupancy` $\le 0.0002$).
- At regeneration rate $r = 2$, populations completely saturated the grid (`late_mean_occupancy` $> 0.999$).

Discrepancy `D026` identified the root cause: because cell resource stocks renewed independently, an organism occupying cell $(x, y)$ suffered zero resource competition from surrounding neighbours at $(x \pm 1, y \pm 1)$. High local density did not deplete local energy availability. As long as $r \ge \text{maintenance} + \text{execution\_cost}$, 100% of grid cells could be occupied simultaneously without any negative density feedback, destroying spatial competition.

## Decision

1. **Shared Neighbourhood Resource Depletion:** When an organism at cell $(x, y)$ harvests energy, it draws from a shared local pool comprising its own cell stock $R(x, y)$ and its four cardinal neighbour cell stocks $R(x+1,y)$, $R(x-1,y)$, $R(x,y+1)$, $R(x,y-1)$ (under periodic toroidal boundary conditions).
2. **Harvest Drawdown Rule:** An organism attempts to harvest up to its configured harvest limit $h$. Energy is harvested first from the organism's home cell $(x, y)$. If home cell stock is insufficient, the remaining harvest requirement is drawn equally (or in deterministic cardinal order N, S, E, W) from available stocks in adjacent cells.
3. **Negative Density Feedback:** Dense clusters of organisms deplete their shared 5-cell neighbourhood stocks faster than local regeneration can replenish them, reducing per-capita energy uptake, delaying reproduction, and generating natural mortality gaps ($0.20 \le \text{occupancy} \le 0.80$).
4. **Configuration Schema:** Add `harvest_neighbourhood_radius` (default `1`, corresponding to 5-cell von Neumann neighbourhood) to configuration schema 0.6.

## Energy Identity

The exact energy conservation identity established in Decision 0014 remains 100% invariant under shared neighbourhood harvesting:

$$\text{initial\_organism\_energy} + \text{initial\_world\_resource} + \text{regenerated\_resource} + \text{computation\_rewards}$$
$$= \text{living\_organism\_energy} + \text{current\_world\_resource} + \text{dissipated\_energy} + \text{discarded\_energy}$$

Harvesting from neighbouring cells is an internal transfer from `current_world_resource` to `living_organism_energy`. No energy is created or lost during neighbourhood harvest operations.

## Scientific Rationale

- **Restores Negative Density Dependence:** A solitary organism in a sparse region has exclusive access to its 5-cell neighbourhood stock. A crowded organism in a dense cluster shares its 5-cell neighbourhood stock with up to 4 adjacent neighbours, automatically reducing effective resource availability as density increases.
- **Prevents Binary Collapse/Saturation:** Negative density dependence stabilizes population size at an intermediate carrying capacity, preventing cost-free grid saturation at high regeneration rates.
- **Computational Efficiency:** 5-cell neighbourhood stock lookups require $O(1)$ constant time per harvest. Across a 64×64 grid ($4,096$ cells), the CPU overhead is negligible (< 1ms per tick), maintaining fast, deterministic headless execution.

## Falsifiable Calibration Gates for v9

Formal calibration v9 must satisfy the following non-outcome-based acceptance gates:
1. **Occupancy Gate:** $0.20 \le \text{late\_mean\_occupancy} \le 0.80$ across $\ge 1,000$ ticks.
2. **Coexistence / Exposure Gate:** $\ge 1,000$ ticks of observed cross-lineage contact before extinction or completion.
3. **Conservation Gate:** Zero energy accounting discrepancy ($\Delta E = 0$) across all ticks and checkpoints.

## Consequences

- Resolves discrepancy `D026` by introducing true spatial density dependence.
- Updates configuration schema to version 0.6 while retaining schema 0.4 and 0.5 backwards compatibility for historical v8 datasets.
- Re-enables formal calibration v9 under governed resource constraints.
