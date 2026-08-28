# Decision 0008: Use Deterministic Cardinal Donor Search for EXEC_NBR

- **Status:** Accepted after calibration
- **Date:** 19 July 2026
- **Affects:** `EXEC_NBR`, spatial encounter semantics, deterministic hashes

## Context

The draft v0.1 engine made autonomous `COPY` search all four cardinal cells for its first empty
destination, but made `EXEC_NBR` inspect only the single cell selected by register A. V1–v4
calibration showed that parasite ancestors disappear before late regulation even after
restoring four exploit instructions and raising initial occupancy from 6.25% to 25%. In v4's
1/75 candidate, 512 parasite ancestors and their early descendants produced only 150
exploitative births in the first 200 ticks against 754 deaths.

The legacy mechanism selected an occupied cardinal neighbour. The assessed scope commits to
local neighbour-mediated exploitation but does not require a blind single-direction probe.
The single-cell rule was therefore a reconstruction choice, not an assessed constraint.

## Decision

`EXEC_NBR` searches the four cardinal directions in cyclic order beginning at `A modulo 4`
and selects the first occupied cell. It still fails with `no_neighbour` when all four are empty.
Register B still selects the exact donor locus, which must contain `COPY`. Cooldown, empty
destination, donor endowment, exploit levy, mutation, lineage inheritance, and event semantics
are unchanged.

The search never prefers host lineage, a particular genome, or a sufficiently energetic
donor. The first occupied neighbour may be unsuitable and then produces the appropriate
failure. No extra random draw is introduced.

## Consequences

- Autonomous and exploitative reproduction both search the local cardinal neighbourhood for
  the resource each requires: empty space or an occupied donor.
- Register A remains meaningful as deterministic search orientation.
- Sparse local opportunity is distinguished from absence of all neighbours.
- All scientific trajectories and hashes after an affected `EXEC_NBR` call change; calibration
  versions before this decision remain historical evidence and are not pooled.
