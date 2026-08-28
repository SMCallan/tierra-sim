# Frozen Protocol: EXEC_NBR Donor-Compatibility Control v7

- **Status:** Frozen before outcome inspection
- **Date frozen:** 19 July 2026
- **Authority:** Research Decision 0011 and discrepancy D029
- **Stage:** Calibration mechanism control; not formal evidence or candidate selection
- **Machine specification:** `Simulator/runner/presets/exec-nbr-donor-compatibility-control-v7.json`

## Question

Does the rebuilt exact B-address compatibility gate materially suppress donor-funded
`EXEC_NBR` reproduction relative to a deterministic donor-level `COPY` capability rule under
the same v6 ecology?

This tests a mechanism, not whether the condition with the larger parasite population is
automatically scientifically preferable.

## Conditions

Exactly one factor varies:

| Condition | Rule |
|---|---|
| Reference | `addressed_locus`: require `COPY` at `B modulo donor length`. |
| Mechanism control | `cyclic_copy_search`: starting at the same locus, inspect every donor element once and accept the first `COPY`. |

The cyclic search is deterministic, consumes no PRNG draw, does not change which neighbour is
selected, and does not inspect lineage, energy, or donor suitability while searching.

## Frozen common settings

- world: 64×64 toroidal Von Neumann grid;
- fixture: v6 spatial inoculum, digest retained by the sweep bundle;
- seed: `20260718`;
- duration: 2,000 ticks, sampled and reported every 200 ticks;
- environmental income: 3;
- exogenous death: 1/300 per activated organism;
- autonomous reproduction cost: 45;
- reproduction cooldown: 10 ticks;
- `EXEC_NBR` attempt cost: 1;
- offspring endowment and exploit levy: 30 and 10, donor funded;
- mutation, HGT, computation rewards, scheduling, destination search, measurement, and all other
  configuration fields: unchanged from the retained v6 base.

The reference uses the v6 rank-1-at-600-ticks parameter combination. That rank was determined
before this control; it is not reselected using v7 outcomes.

## Retained diagnostics

For each condition retain the resolved schema-0.3 configuration, standard run hierarchy,
benchmark report, complete and late-window lineage diagnostics, spatial summaries, exact energy
identities, hashes, manifests, and checksums. In particular report parasite-lineage `EXEC_NBR`:

- attempts and successes;
- `donor_locus_not_copy` under the reference;
- `donor_copy_absent` under cyclic search;
- no-neighbour, cooldown, no-empty-cell, donor-energy, and caller-energy failures; and
- interval changes alongside population, births, deaths, occupancy, and cross-lineage contact.

## Predeclared interpretation

- A large increase in exploitative success with the same donor and energy rules supports the
  claim that exact addressing is a material compatibility bottleneck in this ecology.
- Persistence or recovery of parasite lineage is supporting demographic context, not the sole
  decision criterion.
- Saturation, loss of contact, or replacement by another failure mode must be reported rather
  than hidden behind total success.
- Exact energy-ledger and source-event residuals are mandatory in both conditions.
- One seed and 2,000 ticks are development evidence only. No inferential statistics, formal
  divergence claims, production-rule adoption, or confirmation promotion follows automatically.

## Execution and output

From `Simulator/`:

```sh
npm run calibrate -- \
  --sweep runner/presets/exec-nbr-donor-compatibility-control-v7.json \
  --output ../Experiments/raw-data/calibration
```

The runner must refuse to overwrite an existing bundle. Outcome interpretation is written only
after the atomic evidence hierarchy has completed and its checksums have been verified.
