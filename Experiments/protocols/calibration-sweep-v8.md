# 64×64 Local-Resource Calibration v8

- **Status:** Frozen before outcomes
- **Date frozen:** 19 July 2026
- **Authority:** Decisions 0012–0014
- **Machine-readable design:** `Simulator/runner/presets/calibration-sweep-v8.json`
- **Base configuration:** `Simulator/runner/presets/calibration-sweep-base-config-v8.json`
- **Fixture:** retained v6 established-host/focal-inoculum fixture

## Question

Can the governed local renewable-resource field produce a sustainable, non-saturated ecology
with exact reservoir-inclusive accounting, usable mechanism exposure and practical headless
performance, without selecting for a desired divergence result or permanent lineage coexistence?

## Frozen screen

The one-seed development screen runs four 4,000-tick conditions on the 64×64 world. It crosses
per-cell regeneration `{1, 2}` with harvest cap `{3, 6}`. All other engine parameters are held
at the retained v6 rank-1 setting, exogenous turnover is weakened to `1/1000`, passive income is
zero, and cyclic donor `COPY` search is primary. Uniform cells begin with 60 of capacity 120.

The run seed is `20260719`. This seed count and duration cannot qualify confirmation. A later
candidate must still pass at least 10,000 ticks, a full behavioural window and three independent
seeds under a separately frozen protocol.

## Frozen acceptance and ranking

Mandatory gates require completion, exact energy/source/transfer/resource-event identities,
runtime, and memory. Ecological gates require 20–80% late mean occupancy, no late sample above
90%, non-degenerate resource stock/depletion, continuing autonomous/exploitative/HGT activity,
eligibility, non-dominant computation rewards, and genome-bound control.

Lineage extinction is not a technical failure and final lineage abundance is prohibited from
selection. Instead, both lineages must remain observable through tick 1,000 and the whole run
must contain at least ten realised exploitative births. Cross-lineage contact, extinction tick,
and later mechanism persistence remain reported outcomes.

Ranking is lexicographic exactly as declared in the JSON: mandatory failures, ecological passes,
distance from 50% late occupancy, distance from 50% late resource stock, interaction-exposure
duration, eligibility, then projected runtime. Mean divergence, maximum divergence, divergence
onset, final lineage abundance and visual preference are prohibited inputs.

## Execution

From `Simulator/`:

```bash
npm run calibrate -- \
  --sweep runner/presets/calibration-sweep-v8.json \
  --output ../Experiments/raw-data/calibration
```

The retained bundle is development/calibration evidence only. Outcomes may motivate a new frozen
screen; they cannot silently change this protocol or enter the formal factorial dataset.
