# Decision 0010: Retain Lineage-Stratified Failure and Death Diagnostics

- **Status:** Accepted after v6 calibration
- **Date:** 19 July 2026
- **Affects:** runner measurements, calibration evidence, output schemas

## Context

V6 retained attempts and successes by ancestral lineage, but ordinary headless evidence did not
attribute terminal operation failures or death causes by lineage unless detailed event logging
was enabled. The parasite decline could therefore not be separated among missing neighbours,
donor-locus mismatch, cooldown, lack of space, donor/caller energy, and mortality mechanisms.
Blindly changing ecology without that attribution would risk tuning the wrong mechanism.

The engine already emits exactly one terminal result for every `COPY`, `EXEC_NBR`, and
`SPLICE` attempt and exactly one cause for every death. Lineage remains recoverable from the
permanent pedigree after an organism dies. No new state-transition rule is required.

## Decision

The headless runner counts every ecological terminal result by actor lineage, operation, and
stable result code. It also counts every death by victim lineage and cause. Counts are retained
for each sample interval, aggregated across the complete run, and aggregated across the frozen
late window in calibration reports.

Every operation × result cell is present, including structurally inapplicable zeroes, so the
schema remains rectangular and comparable. The runner verifies these identities:

- terminal results sum to attempts for each lineage and operation;
- `success` results equal existing success counters for each lineage and operation;
- death causes sum to deaths for each lineage;
- lineage sums equal authoritative global attempts, successes, and cause-specific deaths.

Any non-zero residual aborts evidence generation. Diagnostics are derived from immutable engine
events and do not enter scientific state, checkpoints, scheduling, PRNG consumption, or state
hashes. Output, benchmark-report, and sweep-report schemas advance independently.

## Consequences

- Failure attribution is available without retaining large detailed-event logs.
- Interval counts reveal changes as density, contact, and lineage abundance change.
- The same trajectory and state hash are produced before and after this observational change.
- Counts identify where attempts terminate; they do not alone establish why a lineage evolved,
  prove causal fitness effects, or turn failed attempts into realised strategy actions.
