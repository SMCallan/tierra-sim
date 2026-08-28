# Reproducibility and Validation Standard

- **Status:** Normative draft 0.2
- **Date:** 18 July 2026
- **Applies to:** Engine, headless runner, browser application, fixtures, and formal datasets

## 1. Validation claim

Passing this standard establishes that the implementation conforms to the declared digital-ecology instrument and can reproduce identical state transitions from identical inputs. It does not by itself validate the biological interpretation of the model; construct validity is addressed by the research design, controls, and literature.

Formal data collection MUST NOT begin until every mandatory gate in Section 10 passes against the source commit used for the runs.

## 2. Deterministic random-number generator

Version 0.1 uses `xoshiro128**` with four unsigned 32-bit state words and a project-defined seed expansion named `tierra-splitmix32-v1`.

All bitwise operations below are modulo `2^32`. `rotl(x,k)` means 32-bit rotate-left. Multiplication uses the low 32 bits of the unsigned product.

### 2.1 Seed expansion

Starting with unsigned 32-bit cursor `c = master_seed`, generate each of four state words in order:

```text
c = c + 0x9E3779B9
z = c
z = (z xor (z >> 16)) * 0x21F0AAAD
z = (z xor (z >> 15)) * 0x735A2D97
word = z xor (z >> 15)
```

Here `>>` is a logical right shift. If the resulting four-word state is all zero, set the first word to `0x9E3779B9`.

### 2.2 Next-word transition

For state `s[0..3]`:

```text
result = rotl(s[1] * 5, 7) * 9
t = s[1] << 9
s[2] = s[2] xor s[0]
s[3] = s[3] xor s[1]
s[1] = s[1] xor s[2]
s[0] = s[0] xor s[3]
s[2] = s[2] xor t
s[3] = rotl(s[3], 11)
return result
```

The initial ten unsigned decimal outputs are normative golden sequences:

| Seed | Outputs |
|---:|---|
| 0 | 1789933344, 44971166, 2521387044, 3848737593, 1138324114, 749234105, 1899511038, 1995189375, 3629653958, 19166872 |
| 1 | 393288148, 2174103013, 3814759091, 2092745082, 1865176206, 2179171167, 3207394750, 2858353069, 559075315, 3395495274 |
| 4294967295 | 4104197751, 1825856343, 1152209388, 2427537429, 3685145430, 609215610, 4161674276, 1502890106, 904255344, 859094872 |

### 2.3 Derived sampling

For a uniformly distributed integer in `[0,n)`, compute `limit = floor(2^32 / n) * n`, reject raw words greater than or equal to `limit`, and return the accepted word modulo `n`. This rule prevents modulo bias.

A rational Bernoulli trial succeeds when a uniform integer in `[0, denominator)` is less than `numerator`. A Fisher–Yates shuffle iterates `i` from `length - 1` down through `1`, draws `j` uniformly from `[0, i]`, and swaps elements `i` and `j`.

Every higher-level random operation MUST be composed from these routines. The implementation MUST NOT expose alternative convenience paths for formal execution.

## 3. Unit conformance tests

Mandatory unit suites cover:

### 3.1 World and scheduler

- coordinate wrapping at all four boundaries and corners;
- stable direction numbering and neighbour order;
- capacity-one placement and movement invariants;
- deterministic shuffled, fixed, and seeded focal-region fixture placement;
- one activation per start-of-tick organism;
- child deferral until the next tick;
- immediate removal of organisms killed before their scheduled turn;
- golden seeded activation orders;
- row-major local-resource regeneration before scheduling;
- exact harvest timing after exogenous survival and before instruction execution;
- capacity, zero-stock, partial-harvest and organism-energy-cap boundaries; and
- legacy passive-income configurations remaining trajectory-compatible.

### 3.2 Virtual machine

- all sixteen opcodes over boundary register values;
- modulo-256 arithmetic and bitwise `EQU`;
- `CMP` for less, equal, and greater cases;
- positive, zero, and negative jump offsets;
- circular immediate reads and pointer wrapping;
- `SENSE` and provenance invalidation;
- `SWAP`, including provenance tags; and
- no hidden opcode or invalid four-bit genome value.

### 3.3 Computation rewards

- correct and incorrect results for every task;
- refusal without both inputs or without a declared last operation;
- at most one reward per `OUTPUT`;
- at most one reward per task per reproductive cycle;
- task reset after each reproduction pathway; and
- reward counters and energy accounting identities.

### 3.4 Reproduction and exploitation

- autonomous success and each declared failure code;
- deterministic destination selection;
- offspring lineage, generation, parentage, task state, and cooldown;
- exploit donor selection and both governed donor-COPY rules;
- exact-address success only when the inspected donor locus is `COPY`;
- deterministic cyclic search from the addressed locus, including the distinct no-`COPY` failure;
- exact caller, donor, and child energy ledgers;
- immediate donor death at zero energy;
- exploit child genome derived from caller rather than donor; and
- failure attempts excluded from realised strategy counts.

### 3.5 Mutation and HGT

- mutation probability zero and one;
- point substitution always choosing a different opcode;
- stable multi-event traversal order;
- insert/delete boundaries at minimum and maximum length;
- rejected-event counting;
- HGT probability zero and one;
- circular donor chunks, all insertion boundaries, and pointer adjustment; and
- donor immutability under `SPLICE`.

### 3.6 Behavioural measurement

- global bucket boundaries at ticks 199/200 and 399/400;
- exact expiry after 5,000 ticks;
- short-lived organisms and birth inside an open bucket;
- eligibility at thresholds 1, 5, and 10;
- synthetic host and parasite examples with known `p` and `delta`;
- inactive classification rather than zero imputation;
- nearest-rank quantiles; and
- contingency tables, Theil's `U`, `D_info`, and zero-entropy handling;
- unique toroidal edge counts, lineage connected components, extinction nulls, and rejection of duplicate coordinates;
- lineage-stratified operation results and death causes, including exact reconciliation with lineage and global counters;
- single-lineage `U(F|L)`/`D_info` degeneracy without suppressing individual divergence; and
- local-resource totals, depleted cells, occupied/empty stock and interval flow counters.

## 4. Property and invariant tests

Property-based tests MUST generate valid small worlds, genomes, and configurations and assert:

- no duplicate organism identifier or occupied coordinate;
- every organism appears in exactly one cell;
- genome lengths and values remain within bounds;
- energy never becomes negative;
- lineage never changes;
- offspring generation is parent generation plus one;
- every birth has exactly one successful autonomous or exploitative event;
- successful births equal autonomous successes plus exploitative successes;
- interval counters sum to matching cumulative counters;
- organism-plus-resource energy-ledger change equals declared sources minus sinks and terminal discard;
- success count never exceeds attempt count;
- HGT changes only caller genome and mutation changes only newborn genome;
- serialise–deserialise is state-hash preserving;
- every resource stock remains within configured bounds and its sum matches the retained total;
- regeneration and harvest counters reconcile with state transitions and emitted events; and
- lineage cannot affect resource access except through inherited organism state and spatial position.

Generated failing cases MUST be retained as regression fixtures after minimisation.

## 5. Golden integration fixtures

At least three small, fast fixtures are version-controlled:

1. a single-organism instruction fixture with mutation, HGT, and death disabled;
2. a crowded mixed-lineage ecology exercising both reproduction pathways; and
3. a high-mutation/HGT stress fixture that reaches genome bounds and donor death.

For each fixture, preserve resolved config, seed population, sample rows, event aggregates, selected checkpoints, and state hashes. Golden outputs change only with an explicit engine/output version and a reviewed explanation.

## 6. Differential execution tests

The same golden fixtures MUST be run through:

- direct engine API tests;
- the headless Node runner;
- the React/browser adapter without animation timing; and
- uninterrupted and checkpoint-resumed execution.

State hashes at every sampled tick and final scientific outputs MUST match exactly. UI rendering may differ and is outside the hash.

## 7. Statistical implementation tests

Analysis functions MUST be tested against hand-calculated synthetic data and, where appropriate, a second independent implementation. Tests cover:

- post-burn-in weighting and AUC;
- late-period selection;
- lineage stratification;
- functional-class thresholds;
- entropy and mutual information;
- missing/undefined values;
- extinction trajectories;
- block construction and resampling reproducibility; and
- factorial design matrices, contrasts, and interaction terms.

The analysis package MUST reproduce `final-summary.json` from raw time series.

## 8. Construct-validity checks

Before formal runs, targeted fixtures MUST demonstrate:

- autonomous `COPY` increases `A` but not `E`;
- successful `EXEC_NBR` benefits the caller's lineage while imposing the declared donor cost;
- failed `EXEC_NBR` affects attempt diagnostics but not realised `E`;
- a host with 20 exploitative successes among 100 realised births has `delta = 0.20`;
- a parasite with the same behaviour has `delta = 0.80`;
- inactive organisms cannot lower divergence by being coded as autonomous;
- HGT-success configuration changes conditional success but does not create attempts; and
- lineage has no causal path to execution other than inherited starting genome and vertical descent;
- local harvesting transfers exactly the removed cell stock and cannot create energy; and
- lineage-information outputs become explicitly degenerate after removal of either lineage.

These tests connect code to the operational definitions used in the dissertation.

## 9. Calibration and performance qualification

Calibration determines values that the engine specification deliberately leaves empirical. It MUST use separately labelled runs and a written selection rule.

Calibration should identify a region in which:

- both ancestral populations coexist long enough and contact often enough for a predeclared
  interaction comparison, without requiring final coexistence;
- neither reproduction pathway is mechanically impossible;
- successful exploitation has a measurable donor cost without causing immediate universal collapse;
- genomes do not spend most time pinned to a length boundary;
- activity coverage supports the primary eligibility threshold;
- HGT attempts occur in HGT-only controls;
- computation rewards neither dominate nor disappear from the energy budget; and
- local resource is neither permanently full nor permanently depleted, and its regeneration,
  harvest and reservoir-inclusive energy identities are exact.

Performance qualification measures single-run wall time, memory peak, output volume, and batch scaling on the intended machine. Scientific parameters MUST NOT be changed solely to meet the MPR runtime estimate. The formal run count is frozen only after precision and resource review.

## 10. Formal-run gates

All boxes must be satisfied and recorded in a versioned validation report:

- [ ] Engine specification and accepted decisions have no unresolved implementation ambiguity.
- [ ] Configuration and output schemas reject unknown or incomplete scientific settings.
- [ ] Static type checking, linting, unit tests, and property tests pass.
- [ ] Normative PRNG sequences pass on every supported runtime.
- [ ] Golden integration fixtures match exactly.
- [ ] Browser, headless, and resumed state hashes match.
- [ ] Portable and runtime-native SHA-256 implementations match normative vectors, state hashes, and checkpoints.
- [ ] Event-derived aggregates equal engine counters.
- [ ] Energy and birth accounting identities hold.
- [ ] Analysis reproduces run summaries and passes synthetic tests.
- [ ] Seed genomes and formal configuration have immutable digests.
- [ ] Calibration report explains every chosen numerical parameter.
- [ ] Performance and storage qualification is complete.
- [ ] Formal condition/seed table and analysis plan are frozen before launch.
- [ ] Source commit is tagged and the worktree is clean.
- [ ] Ethical-approval conditions and departmental data requirements have been checked.

## 11. Defect policy

A defect affecting scientific state, event accounting, configuration interpretation, or formal analysis invalidates all affected runs. The repair receives a new version, the validation suite is rerun, and the affected condition table is rerun from its original seeds.

Runs from scientifically different engine versions MUST NOT be pooled merely because their CSV columns match. Presentation-only defects may be corrected without rerunning science when state hashes and raw outputs are demonstrably unaffected; the correction and proof are still recorded.
