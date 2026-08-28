# EXP-001 — Governed Formal Experimental Batch Protocol Specification v1.0

> **Superseded, 2 August 2026 — do not execute from this document.** Its duration (10,000 ticks),
> ecology (`regeneration_per_tick: 2`), evidence-class label (`EXPERIMENTAL`), and base preset are
> all contradicted by later governed artefacts. See `D047`.
>
> The formal programme is now governed by
> [Decision 0019](../../Research/decisions/0019-primary-outcome-burn-in-and-horizon.md) for the
> primary outcome, burn-in and horizon;
> [Statistical Analysis Plan v1.0](../../Experiments/protocols/statistical-analysis-plan-v1.0.md)
> for the analysis; and
> [`batch-formal-mpr-factorial-v2.json`](../../Simulator/runner/presets/batch-formal-mpr-factorial-v2.json)
> as the executable specification: 60 runs at 100,000 ticks on the certified `regen=1, harvest=3`
> ecology.
>
> Retained unedited below so the superseded values remain visible rather than being rewritten out
> of the record.


- **Status:** Frozen before execution
- **Date frozen:** 1 August 2026
- **Evidence class of products:** `EXPERIMENTAL`
- **Governing Decisions:** [Decision 0001](../../Research/decisions/0001-behavioural-divergence-measure.md), [Decision 0014](../../Research/decisions/0014-local-renewable-resource-field.md), [Decision 0015](../../Research/decisions/0015-genome-maintenance-cost.md), [Decision 0016](../../Research/decisions/0016-shared-resource-redesign.md), and [Decision 0017](../../Research/decisions/0017-corrected-research-gap-statement.md)
- **Base Configuration Preset:** [`Simulator/runner/presets/formal-batch-base-config-v1.json`](../../Simulator/runner/presets/formal-batch-base-config-v1.json)
- **Sweep Preset:** [`Simulator/runner/presets/formal-batch-v1.json`](../../Simulator/runner/presets/formal-batch-v1.json)
- **Output location:** `Experiments/raw-data/exp-001-formal-batch/` (Git-ignored, non-overwriting)

---

## 1. Purpose and Scope

This specification freezes the experimental protocol, parameter matrix, replicate seeds, duration, and output structure for the formal experimental batch campaign (`EXP-001`).

The formal campaign tests the interaction between local resource renewal dynamics (Decision 0014), continuous genome maintenance cost floors (Decision 0015), and shared neighbourhood depletion (Decision 0016) on horizontal gene transfer (HGT) efficacy and cross-lineage dynamics.

---

## 2. Frozen Experimental Parameter Matrix

- **Grid Size:** $64 \times 64$ toroidal grid (4,096 cells).
- **Duration:** 10,000 ticks per formal experimental run.
- **Ecological Baseline (Qualified under ENG-001 / ENG-002):**
  - `resource_regeneration_per_tick`: $2$
  - `resource_harvest_per_activation`: $4$
  - `harvest_neighbourhood_radius`: $1$ (5-cell cardinal harvesting)
  - `min_cost`: $1$ (Continuous linear maintenance cost floor $\max(1, \lfloor L/8 \rfloor)$)
- **Experimental Factors:**
  - `exec_nbr_donor_copy_rule`: `["cyclic_copy_search", "disabled"]` (HGT enabled vs HGT control)
  - `exogenous_death_probability`: $1 / 1000$
  - `autonomous_reproduction_cost`: $45$
  - `reproduction_cooldown_ticks`: $10$
- **Replicate Seeds:** 5 independent fresh seeds (`202608031`, `202608032`, `202608033`, `202608034`, `202608035`).
- **Total Experimental Runs:** $2 \times 5 = 10$ formal experimental runs (with options for extended condition sweeps).

---

## 3. Verification & Accounting Gates

Every formal experimental run must satisfy:
1. **Exact Energy Conservation Identity:** $\Delta E = 0$ across all 10,000 ticks.
2. **Determinism:** Identical state hash output on repeated executions under the same PRNG seed.
3. **Manifest Integrity:** Complete SHA-256 checksum list generated atomically for all raw output files.

---

## 4. Execution and Retained Outputs

Execution outputs must be written to `Experiments/raw-data/exp-001-formal-batch/` with deterministic manifests, timeseries CSVs, lineage records, state hashes, and output checksums.
