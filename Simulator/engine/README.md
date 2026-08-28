# Deterministic Engine Package

`@tierra-sim/engine` is the browser-safe scientific core. It has no filesystem, UI, wall-clock, or platform-entropy dependency.

## Implemented engine layer

- strict, complete, deeply frozen configuration parsing;
- integer-only canonical configuration JSON;
- `xoshiro128**/tierra-splitmix32-v1` with normative golden sequences;
- unbiased bounded sampling, rational Bernoulli trials, and Fisher–Yates shuffle;
- toroidal Von Neumann coordinates and capacity-one occupancy;
- organism and behavioural-bucket state types;
- all sixteen opcode identities and signed immediate decoding; and
- a pure VM instruction step with computation provenance, once-per-cycle rewards, jumps, sensing, and world-level ecological requests;
- validated fixed and shuffled ancestor fixtures;
- complete future-affecting engine state and seeded random-sequential tick scheduling;
- capped environmental income, saturating costs, transfers, rewards, and death accounting;
- autonomous and donor-funded exploitative births with child deferral;
- stable per-locus point, insertion, and deletion mutation;
- conditional circular-chunk `SPLICE` transfer with instruction-pointer preservation;
- circular global-tick behavioural buckets and stable result counters; and
- typed tick events, run counters, energy-ledger identities, and terminal states;
- exact organism-level exploitative tendency and lineage-relative divergence;
- inactive handling, nearest-rank quantiles, functional classes, sensitivity thresholds, Theil's uncertainty coefficient, and the complementary lineage–function decoupling score;
- persistent parentage, birth, generation, and death records for every organism ever created;
- browser-safe canonical SHA-256 state hashes; and
- checksummed, configuration-bound, restorable scientific checkpoints.

## Outside this package

- filesystem and manifest writing, provided by `@tierra-sim/runner`;
- batch execution and the frozen formal condition table;
- pre-registered run-level trajectory analysis; and
- browser visualisation and interactive controls, provided by `@tierra-sim/app`.

## Commands

From `Simulator/`:

```sh
npm run typecheck
npm test
npm run build
npm run validate
```

`npm run validate` is the local implementation gate and runs the other three checks in order.
