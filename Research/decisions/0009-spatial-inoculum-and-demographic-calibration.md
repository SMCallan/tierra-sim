# Decision 0009: Use a Spatial Inoculum and Reproduction Economics Before Adding Combat

- **Status:** Accepted for calibration before v6 outcomes
- **Date:** 19 July 2026
- **Affects:** initial placement, demographic calibration, spatial measurement, combat scope

## Context

The v1–v5 screens exposed a coexistence–density conflict. Weak random turnover allows the
autonomous lineage to fill the lattice after the exploitative lineage disappears; stronger
turnover removes the complete ecology. V5 confirmed that deterministic cardinal donor search
increased real exploitative opportunity, but it did not preserve the parasite lineage.

The legacy simulator contains useful ecological intuitions: parasites were injected locally
into an established host field, exploit attempts were cheap but not free, autonomous
reproduction was rate-limited, and spatial structure was visually prominent. It also contains
hidden energy creation and type-specific runtime rules that cannot support the reconstructed
instrument's claims. Importing the former does not require importing the latter.

Combat over occupied cells could create selection on aggression, resistance, or neighbour
encroachment. It would also introduce a new death mechanism, energy-transfer rule, behavioural
category, and causal confounder before the assessed host–parasite mechanism has been calibrated.

## Decision

V6 precedes combat and changes only governed initialization, reproduction economics,
demographic timescale, and measurement:

- a generic seeded focal-region algorithm places one fixture group within a declared rectangle
  and distributes every other group across the remaining cells;
- the v6 fixture uses the parasite ancestor as that focal group inside a 50% host background;
- the placement rule consults fixture order, never lineage, at initialization and grants no
  runtime privilege;
- `EXEC_NBR` attempt cost falls from two to one energy unit but remains non-zero;
- autonomous reproduction cost is screened at 45 and 60 units, with offspring endowment held
  at 30 and cooldown raised from five to ten ticks;
- exogenous death is screened at 1/150, 1/300, and 1/600 per organism per tick; and
- unique toroidal cardinal contacts and connected lineage patches are recorded at each sample.

Donor-funded exploitative births, the exploit levy, exact integer energy accounting, mutation,
HGT, Decision 0007 eligibility, and Decision 0008 donor search remain unchanged.

## Consequences

- V6 tests whether longer local interaction and slower autonomous replacement resolve the
  observed calibration failure without a lineage-specific survival subsidy.
- V6 trajectories are not pooled with earlier placement/configuration schemas.
- Patch size, fragmentation, and cross-lineage contact quantify spatial opportunity and
  segregation. They do not establish cooperation, colony-level selection, cognition, or group
  strategy.
- `KILL`, competitive displacement, and combat remain excluded until the assessed mechanism is
  calibrated or a later decision justifies a separate experimental extension.
