# Decision 0011: Control EXEC_NBR Donor Compatibility Before Adoption

- **Status:** Completed by v7 control; production status superseded by Decision 0013
- **Date:** 19 July 2026
- **Affects:** `EXEC_NBR`, configuration schema, calibration protocol, output schemas

## Context

The assessed scope requires neighbour-mediated exploitation but does not specify an exact
donor-address compatibility mechanism. The frozen legacy simulator sampled a random donor
instruction. The rebuilt engine instead required register B to identify an exact donor locus
containing `COPY`. That deterministic rule was explicit and testable, but it was introduced
during reconstruction rather than inherited from an assessed commitment.

The v6.1 diagnostic found that 58,649 of 72,951 parasite-lineage `EXEC_NBR` attempts (80.4%)
ended at `donor_locus_not_copy`. Among attempts that selected a donor, 87.6% failed at that
gate. Exact addressing may therefore be a meaningful compatibility or defence trait, or an
arbitrary geometry that overwhelms the intended donor-funded exploitation construct. The
observational diagnostic cannot distinguish those interpretations.

## Decision

Before v7 ecology is calibrated further, run a governed one-factor mechanism control comparing:

1. `addressed_locus`: register B selects one exact donor locus, which must contain `COPY`; and
2. `cyclic_copy_search`: begin at the same B-addressed locus and search each donor element once
   in deterministic cyclic order for `COPY`.

Both conditions retain the same first occupied cardinal donor, caller attempt cost, cooldown,
destination search, donor-funded offspring endowment, exploit levy, birth mutation, scheduler,
seed, fixture, and all other ecological parameters. The search draws no randomness and does not
inspect lineage. A donor with no `COPY` fails with the distinct terminal code
`donor_copy_absent`; exact-address mismatch remains `donor_locus_not_copy`.

Configuration schema 0.3 requires the rule explicitly. Schemas 0.1 and 0.2 retain
`addressed_locus` for backward reproducibility. The calibration stage is labelled
`mechanism_control`, and its conditions can never be automatically promoted to confirmation
candidates.

## Interpretation boundary

This one-seed control can identify whether exact addressing is a material bottleneck in the
current ecology. It cannot establish a generally superior mechanism, justify selecting the
condition that merely preserves more parasites, or serve as formal experimental evidence. A
production-rule decision requires construct reasoning together with the control result and, if
needed, independent-seed confirmation.

## Consequences

- The assessed lineage–function question remains the selection authority, not coexistence alone.
- Exact addressing is not silently removed and cyclic search is not silently adopted.
- Prior runs remain interpretable under their retained 0.1/0.2 configurations.
- The additional terminal category expands behavioural-bucket state, so checkpoint format and
  engine-state versions advance to 0.2 and the state-hash contract advances to v2. Historical
  hashes remain valid for their retained artefacts and are not relabelled.
- State hashes differ across policies because the resolved scientific configuration differs,
  even when early state transitions happen to match.
