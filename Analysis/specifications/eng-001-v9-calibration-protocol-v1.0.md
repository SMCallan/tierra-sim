# ENG-001 — Governed v9 Calibration Protocol Specification v1.0

- **Status:** Frozen before execution
- **Date frozen:** 1 August 2026
- **Evidence class of products:** `CALIBRATION`
- **Governing Decisions:** [Decision 0014](../../Research/decisions/0014-local-renewable-resource-field.md), [Decision 0015](../../Research/decisions/0015-genome-maintenance-cost.md), and [Decision 0016](../../Research/decisions/0016-shared-resource-redesign.md)
- **Base Configuration Preset:** [`Simulator/runner/presets/calibration-sweep-base-config-v9.json`](../../Simulator/runner/presets/calibration-sweep-base-config-v9.json)
- **Sweep Preset:** [`Simulator/runner/presets/calibration-sweep-v9.json`](../../Simulator/runner/presets/calibration-sweep-v9.json)
- **Output location:** `Experiments/raw-data/v9-calibration/` (Git-ignored, non-overwriting)

---

## 1. Purpose and Scope

This specification freezes the experimental protocol, parameter grid, non-outcome-based screening gates, and output structure for the governed v9 calibration sweep (`ENG-001`).

The v9 calibration sweep incorporates two critical engine corrections implemented under `SCI-002` and `SCI-003`:
1. **Continuous Linear Maintenance Cost Floor (Decision 0015):** Eliminates 0-cost maintenance refuges ($D031$), enforcing $\text{maintenance\_cost}(L) = \max(1, \lfloor L / 8 \rfloor)$.
2. **Shared Neighbourhood Resource Depletion (Decision 0016):** Allows organisms to harvest energy from adjacent cardinal cells under periodic toroidal boundary conditions ($D026$), restoring spatial negative density dependence.

---

## 2. Frozen Parameter Grid

- **Grid Size:** $64 \times 64$ toroidal grid (4,096 cells).
- **Duration:** 4,000 ticks per screening run (10,000 ticks for confirmation candidates).
- **Factors Swept:**
  - `resource_regeneration_per_tick`: $[1, 2, 3]$
  - `resource_harvest_per_activation`: $[3, 4, 6]$
  - `harvest_neighbourhood_radius`: $[1]$
- **Replicate Seeds:** 3 independent seeds (`202608011`, `202608012`, `202608013`).
- **Total Screening Runs:** $3 \times 3 \times 3 = 27$ runs.

---

## 3. Non-Outcome-Based Screening Acceptance Gates

A run qualifies as a v9 calibration candidate if and only if it satisfies all of the following non-negotiable gates:

1. **Occupancy Gate:** $0.20 \le \text{late\_mean\_occupancy} \le 0.80$ over ticks 3,000–4,000 (prevents population collapse and grid saturation).
2. **Maximum Occupancy Gate:** $\text{late\_maximum\_occupancy} \le 0.90$.
3. **Coexistence / Exposure Gate:** Both ancestral lineages must be observed in contact through $\ge 1,000$ ticks before extinction or completion.
4. **Autonomous Activity Gate:** $\ge 1$ late autonomous birth success.
5. **Exploitative Activity Gate:** $\ge 1$ late donor-funded exploitative birth success.
6. **Energy Accounting Gate:** Exact energy conservation identity $\Delta E = 0$ across all ticks.

---

## 4. Prohibited Selection Inputs

Per Decision 0001, Decision 0005, and Decision 0012, no parameter set or run candidate may be selected or ranked using:
- Realised behavioural divergence ($\Delta_D$)
- Maximum or onset of divergence
- Final lineage abundance or ratio
- Visual cockpit aesthetics

Ranking of qualifying candidates is strictly determined by distance from 50% target occupancy, resource stock stability, and interaction exposure.

---

## 5. Execution and Handoff

Execution output must be written to `Experiments/raw-data/v9-calibration/` with deterministic manifest timestamps, SHA-256 state hashes, and output checksums.
