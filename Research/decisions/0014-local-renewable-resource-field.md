# Decision 0014: Replace Passive Per-Organism Income with a Local Renewable Resource Field

- **Status:** Accepted and implemented before v8 outcomes
- **Date:** 19 July 2026
- **Affects:** world state, tick lifecycle, energy accounting, checkpoints, measurement, UI

## MPR authority

The graded Mid-Project Review describes passive `+1` energy per organism per tick, a matching
execution cost, reproduction costs, bloat pressure and computation rewards. Its higher-level
commitment is a strict energy economy in a 64×64 spatial environment where competition for
scarce resources helps maintain ecological differentiation. It does not specify a renewable
cell resource field.

The rebuilt passive-income rule satisfied the literal mechanism but not its intended ecological
function. Because income scaled with population while space did not, every v6 and v7 survivor
ecology approached complete occupancy. Fixed cost and random-death sweeps changed the route to
saturation rather than establishing a sustainable carrying capacity.

## Decision

Configuration schema 0.4 and engine specification 0.2 add an optional-by-version, mandatory-for-
0.4 local renewable-resource field. Every cell stores an integer resource stock from zero to a
declared capacity. New-schema configurations set legacy per-organism environmental income to
zero.

The transition order is:

1. Before the scheduler snapshot for tick `t`, every cell regenerates by
   `min(regeneration_per_tick, capacity - current_stock)` in ascending cell-index order.
2. Regeneration is declared external energy creation and is recorded exactly.
3. After an organism survives its exogenous-death trial and before cooldown/instruction
   execution, it harvests from its current cell.
4. Harvest equals the minimum of configured harvest limit, cell stock, and remaining organism
   energy capacity.
5. Harvest is an internal transfer from world resource to organism energy, not energy creation.
6. Resource remains in a cell after organism death and continues regenerating whether the cell
   is occupied or empty.

Version 0.1 contains no diffusion, sharing, movement, lineage-specific uptake, organism storage
beyond existing energy, or stochastic resource placement. Initial stock is uniform and explicit.
These extensions require later decisions rather than hidden defaults.

## Energy identity

For every sampled state:

`initial_organism_energy + initial_world_resource + regenerated_resource + computation_rewards`

must equal:

`living_organism_energy + current_world_resource + dissipated_energy + discarded_energy`.

Offspring endowments, donor transfers and resource harvesting are internal transfers and cancel
from this identity. Existing source-event reconciliation remains mandatory and gains separate
regeneration and harvest totals.

## Scientific rationale

When full-grid maintenance demand exceeds total regeneration, complete occupancy cannot be a
cost-free absorbing condition. Empty cells recharge, newborns can exploit accumulated local
stock, and resource depletion can generate spatial turnover and colonisation fronts without
combat or lineage privileges.

## Consequences

- Resource stock becomes scientific state included in invariants, checkpoints and hashes.
- Measurements report total stock, capacity proportion, depleted cells, occupied/empty stock,
  regeneration, harvest and harvest shortfall.
- The cockpit visualises resource stock as an explicit view rather than inferring it from organism
  energy.
- Earlier configurations and retained evidence preserve passive-income semantics and historical
  hashes under their declared versions.
- V8 is a resource calibration screen, not formal evidence and not a search for desired
  divergence.
