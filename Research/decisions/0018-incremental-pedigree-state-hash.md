# Decision 0018: Hash Pedigree Incrementally Rather Than Re-Serialising History

- **Status:** Accepted; changes the state-hash algorithm, not the scientific state
- **Date:** 2 August 2026
- **Affects:** `STATE_HASH_VERSION`, `stateHash()`, state-hash comparability across algorithm versions
- **Evidence:** `perf-throughput-decay-diagnosis.md`,
  `D036`, `D037`, and the late-phase profile recorded below

## MPR authority

The MPR commits to deterministic seeded runs and machine-readable longitudinal export. It does not
specify a state-hash algorithm; hashing is a reproducibility mechanism this reconstruction added.
Changing how the hash is computed therefore refines an implementation choice, not an assessed
method — provided the property being verified is preserved.

## The defect

`scientificStateSnapshot()` includes `lineage_records`: every organism that has ever existed. The
state hash consumes that snapshot every `state_hash_every_ticks`, which the schema welds to the
200-tick sample interval (`D038`).

A 500,000-tick run therefore canonical-JSON serialises a collection growing to ~6.1 million records
2,500 times — roughly **7.6 billion record serialisations, quadratic in run length**.

Measured on a 120,000-tick profile, comparing the first 15% against the last 30%:

| Frame | Early | Late |
|---|---:|---:|
| `serialise` (canonical-json) | 19.9% | **34.7%** |
| `shapeSignature` | 4.7% | 7.4% |
| canonical-json anon | 3.2% | 5.0% |
| `update` (hash) | 3.0% | 4.7% |
| garbage collector | 5.1% | 9.6% |
| `stepTick` (actual simulation) | 5.9% | 3.5% |

Serialisation and hashing reach ~52% of late-phase runtime against ~9% for simulation. Removing the
redundant sort and the hash-path clone recovered only ~6%, because the snapshot still *contains*
every record.

## Decision

The hashed state replaces `lineage_records` with two digests, each folded **per record** as history
is created:

- `lineage_pedigree_digest` — folds every record's creation-time fields (`organism_id`,
  `parent_id`, `lineage`, `generation`, `birth_tick`) once, when the record first appears.
- `lineage_death_digest` — folds `organism_id`, `death_tick` and `death_cause` at the point a death
  is written, which is the only transition a record undergoes.

`STATE_HASH_VERSION` becomes `sha256/canonical-scientific-state-v4`.

**Checkpoints are unchanged.** `scientificStateSnapshot()` still carries full `lineage_records`,
because a checkpoint must reconstruct the engine exactly. Only the hash input changes.

## Why the guarantee is preserved

The hash exists to detect divergence between runs that should be identical. Any pedigree difference
— a different parent, generation, birth tick, death tick or cause — changes the corresponding
digest, because every record is folded individually.

Folding is **per record, not per batch**, which matters: batching by hash cadence would make the
digest depend on `state_hash_every_ticks`, so the same run hashed at different cadences would
disagree. Per-record folding keeps the digest a pure function of history.

Cost becomes linear: one fold per birth and one per death, rather than a full re-serialisation
every sample.

## What this costs

**State hashes are not comparable across algorithm versions.** A run under v4 will not reproduce a
v3 hash, and must not be expected to. Existing bundles remain valid under their recorded
`state_hash_algorithm`, which is exactly why that field is recorded per run.

Concretely: the certified v9 confirmation bundle
(`Experiments/raw-data/v9-confirmation-certified-v2/`) stays `QUALIFICATION / VERIFIED` under v3.
Re-running it under v4 verifies *reproducibility within v4*, not equality with the retained hashes.
Any future claim of exact reproduction must state which algorithm version it used.

This is an acceptable trade because the comparability lost is against calibration bundles, no
formal evidence exists yet, and the alternative is a 500,000-tick programme that cannot be run.

## Alternatives rejected

1. **Reduce hash cadence.** Blocked by `D038`: the schema welds the hash interval to the sample
   interval, which is welded to the behavioural bucket length — a frozen construct under
   Decision 0004. Relaxing it would alter the primary measurement.
2. **Drop lineage from the hash entirely.** Cheaper still, but it would stop detecting pedigree
   divergence. The digest keeps the property at nearly the same cost.
3. **A non-cryptographic accumulator.** Faster per fold, but weakens a hash the project describes
   as `sha256/...`. Not worth the saving.

## Consequences

- `D037` is closed: the decay is attributed and addressed.
- The project record must state that v3 and v4 hashes are not comparable.
- Any re-run of a retained bundle for reproduction checking must declare the algorithm version.
- The formal programme becomes feasible; the measured result is recorded with the implementation.
