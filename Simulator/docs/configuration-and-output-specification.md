# Configuration and Output Specification

- **Status:** Normative draft 0.5
- **Date:** 19 July 2026
- **Companion:** `engine-specification.md`

## 1. Configuration principles

A run begins from one fully resolved JSON configuration. The runner MUST validate it before creating scientific state. Unknown fields, omitted required fields, unsupported enum values, non-integer energy values, and out-of-range probabilities are errors.

There are no scientific defaults inside the engine. Human-friendly presets MAY exist, but the runner MUST resolve them into a complete configuration and preserve that resolved document before execution.

The canonical configuration is UTF-8 JSON with:

- object keys sorted lexicographically;
- no insignificant whitespace;
- JSON numbers restricted to schema-declared integers;
- probabilities represented as integer rational objects; and
- arrays retained in declared order.

Its SHA-256 digest is the `configuration_id`.

## 2. Required configuration groups

The schema MUST contain these top-level groups.

### 2.1 Identity

| Field | Type | Meaning |
|---|---|---|
| `schema_version` | string | Configuration-schema version. |
| `engine_specification` | string | Normative engine-specification version. |
| `configuration_name` | string | Human-readable frozen preset name. |
| `purpose` | enum | `calibration`, `validation`, `formal`, or `demonstration`. |
| `run_id` | string | Unique run identifier assigned before execution. |
| `condition_id` | string | Stable experimental condition identifier. |
| `replicate_id` | integer | Replicate number within the condition. |
| `seed` | integer | Unsigned 32-bit master seed. |

### 2.2 Duration and sampling

| Field | Type | Constraints |
|---|---|---|
| `completed_ticks` | integer | Positive. Formal plan: 500,000. |
| `sample_every_ticks` | integer | Positive and equal to behavioural bucket length in version 0.1. Formal plan: 200. |
| `checkpoint_every_ticks` | integer or null | Positive multiple of sample interval, or disabled. |
| `state_hash_every_ticks` | integer | Equal to sample interval in version 0.1. |

### 2.3 World and scheduler

Required values include `width`, `height`, `topology`, `cell_capacity`, `activation_order`, and exogenous-death probability. Version 0.1 accepts only `toroidal_von_neumann`, cell capacity `1`, and `seeded_random_sequential` activation.

### 2.4 Energy

The energy group declares the fixed-point scale and every term required by Engine Specification Section 6. It MUST encode the genome-maintenance rule as a supported named integer formula plus parameters, not executable text.

The initial supported rule is:

`maintenance = floor((genome_length * numerator) / denominator)`

The schema MUST require positive denominator and non-negative numerator. The complete config also declares environmental income, maximum energy, base execution cost, reproduction operation cost, offspring endowment, exploit attempt cost, exploit levy, HGT costs, and computation rewards.

### 2.5 Reproduction and genome

Required values include reproduction cooldown, inclusive minimum and maximum genome lengths, mutation probability, and integer mutation-class weights for point, insertion, and deletion. At least one mutation weight must be positive. Mutation probability is still required when its numerator is zero.

### 2.6 Exploitation

Configuration schemas 0.1 and 0.2 have the frozen `addressed_locus` `EXEC_NBR` semantics.
Schema 0.3 requires the top-level `exploitation` group with an explicit `donor_copy_rule`:
`addressed_locus` or `cyclic_copy_search`. The rule is scientific configuration and therefore
enters the canonical configuration digest, retained resolved config, checkpoint compatibility,
and state hash. It cannot be supplied to an earlier schema.

### 2.7 Horizontal transfer

Required values include HGT-success probability and inclusive transfer-chunk bounds. Chunk bounds must be positive and cannot exceed maximum genome length.

The parameter is explicitly named `hgt_success_probability`, not `hgt_rate`, because opportunity depends on realised `SPLICE` execution.

### 2.8 Measurement

Required values include bucket count, bucket length, primary informative-action threshold, sensitivity thresholds, functional-class boundaries, and whether optional detailed event logging is enabled.

For the formal plan, bucket count is 25, bucket length is 200, and the resulting trailing window is 5,000 ticks. Decision 0007 sets the primary activity threshold to one realised action; sensitivities are five and ten.

### 2.9 Initial population

The configuration refers to a content-addressed seed-population fixture and repeats its SHA-256 digest. It declares the placement algorithm and starting-tick semantics. The fixture contains each ancestor genome, lineage, count, initial energy, and any fixed coordinates.

Schema 0.2 adds `seeded_focal_region`. Its fixture declares `focal_ancestor_index`, region
origin, width, and height. The focal group must fit within the region; the complete population
must fit within the world. This is a deterministic initialization constraint, not a runtime
lineage privilege. Schema 0.1 configurations cannot request it.

The runner MUST refuse to start if fixture content does not match the declared digest.

### 2.10 Local resources (configuration schema 0.4)

Schema 0.4 requires top-level `resources`:

| Field | Type | Constraint |
|---|---|---|
| `mode` | enum | `local_renewable` |
| `cell_capacity` | integer | positive |
| `initial_stock` | integer | `0..cell_capacity` |
| `regeneration_per_tick` | integer | non-negative and no greater than capacity |
| `harvest_per_activation` | integer | positive and no greater than capacity |
| `regeneration_timing` | enum | `before_scheduler_snapshot` |
| `harvest_timing` | enum | `after_exogenous_before_instruction` |

Schema 0.4 also requires `identity.engine_specification = "0.2"`, an explicit exploitation
policy, and `energy.environmental_income = 0`. Earlier schemas forbid `resources` and retain
engine specification 0.1 passive-income semantics.

## 3. Probability representation

A probability is an object with unsigned integer `numerator` and positive integer `denominator`, constrained by `0 <= numerator <= denominator <= 2^32`.

Examples:

```json
{"numerator":1,"denominator":50}
```

represents mutation probability 0.02, and:

```json
{"numerator":1,"denominator":2}
```

represents HGT-success probability 0.50.

The engine MUST sample a probability with an unbiased bounded integer draw. It MUST NOT compare a binary floating-point random value with a decimal configuration value.

## 4. Run-directory contract

Each run writes to an initially absent directory named by `run_id`. A completed run has this minimum structure:

```text
run_id/
├── resolved-config.json
├── manifest.json
├── timeseries.csv
├── final-summary.json
├── state-hashes.csv
├── checksums.sha256
├── checkpoints/
└── events/
```

`checkpoints/` and `events/` MAY be empty when disabled. A formal runner MUST write into a temporary sibling directory and atomically rename it only after completion and checksum creation. It MUST NOT overwrite an existing completed run.

Calibration/performance execution MAY wrap this unchanged run directory inside a separately
checksummed benchmark bundle containing `benchmark-report.json` and `progress.csv`. The wrapper
records wall time, memory, actual retained bytes, scaling projections, and ecological
qualification diagnostics. These wall-clock and storage observations are provenance and MUST
NOT enter scientific state, scheduling, checkpoints, or hashes. Benchmark identifiers are
non-overwriting, and calibration bundles MUST be stored separately from formal raw data.

## 5. Manifest

`manifest.json` is machine-readable provenance, not a prose log. It MUST contain:

- run, condition, replicate, and configuration identifiers;
- run purpose and terminal status;
- master seed and final serialised PRNG state;
- source Git commit and dirty-worktree flag;
- engine, runner, configuration-schema, output-schema, and seed-fixture versions;
- canonical resolved-configuration digest;
- ancestor-fixture path and digest;
- start and finish timestamps as provenance only;
- runtime platform, Node version, architecture, and package-lock digest;
- requested and completed ticks;
- terminal reason;
- counts of births, deaths, mutations, HGT, rewards, and fatal errors;
- checkpoint lineage if the run was resumed;
- state-hash algorithm and final state hash; and
- the digest and byte length of every retained payload file other than `manifest.json` and `checksums.sha256`.

Wall-clock values MUST NOT enter scientific state or state hashes. A formal manifest with a dirty worktree is invalid for pooled formal analysis unless the exact patch is also archived and the deviation is approved before execution.

After the final manifest is written, `checksums.sha256` lists the digest of the manifest and every other retained file except `checksums.sha256` itself. This ordering avoids impossible self-referential digests.

## 6. Aggregate time series

`timeseries.csv` contains one header and one row per configured sample. If extinction terminates a run between sample boundaries, it also contains one terminal row at the exact extinction tick. Column names and order are output-schema versioned. Blank fields represent mathematically undefined values; strings such as `NaN` and `Infinity` are forbidden.

Output schema 0.2 adds the spatial columns in Section 6.5. Output schema 0.3 adds the
lineage-stratified diagnostic columns in Section 6.6 and nested final-summary fields. Output
schema 0.4 adds the donor-compatibility category in Section 6.7. Output schema 0.5 adds local
resource and degeneracy fields in Sections 6.8 and 6.9. Earlier retained bundles keep
their historical schema label and are never relabelled in place.

The minimum columns are grouped below.

### 6.1 Identity and state

- `run_id`, `condition_id`, `replicate_id`, `tick`, `sample_kind`, `state_hash`;
- `population_total`, `host_population`, `parasite_population`;
- `mean_energy`, `total_energy`, `mean_genome_length`, observed minimum and maximum genome length, configured-boundary contact counts; and
- cumulative and interval births, deaths, and extinctions.

### 6.2 Mechanism exposure

- interval autonomous attempts and successes;
- interval exploitative attempts and successes;
- interval HGT attempts and successes;
- interval accepted point, insertion, and deletion mutations;
- interval rejected mutation/HGT events by reason;
- donor energy transferred, exploit levies, and caller attempt costs; and
- rewarded outputs by task.

Each mechanism count MUST also be available split by caller lineage wherever lineage is defined.
Output schema 0.3 additionally splits every terminal result by caller lineage and operation,
including zero-valued cells for result codes that are inapplicable to that operation.

`sample_kind` is `scheduled` or `terminal`. A terminal off-boundary row carries exact state and interval/cumulative accounting through extinction, but formal trailing-window divergence fields are blank because version 0.1 defines them only on bucket-aligned boundaries. Primary trajectory calculations use scheduled rows only.

### 6.3 Continuous divergence

For total, host lineage, and parasite lineage separately:

- eligible count and proportion;
- inactive/insufficient count and proportion;
- mean and median `delta`;
- 25th and 75th percentiles;
- mean exploitative tendency `p`; and
- the authoritative sums of realised autonomous and exploitative actions.

Quantile interpolation MUST be fixed in the output schema. Version 0.1 uses the nearest-rank empirical quantile for auditability.

### 6.4 Functional classes and lineage information

Output the count in each combination of lineage and functional class: autonomous, mixed, exploitative, and inactive.

Let `F` be functional class and `L` ancestral lineage. The primary lineage-informativeness validation is Theil's uncertainty coefficient:

`U(F|L) = I(F;L) / H(F)`

and the complementary lineage–function decoupling score is:

`D_info = 1 - U(F|L)`

Both are computed from integer contingency counts using logarithm base two. When `H(F)=0`, both values are undefined and exported blank. Primary values include the inactive class; active-only values and alternative class boundaries are sensitivity outputs.

`D_info` is complementary evidence, not a replacement for individual `delta` distributions. In particular, it measures predictability and does not encode whether a lineage changed in the expected direction.

### 6.5 Spatial structure (output schema 0.2)

- unique occupied–occupied, same-lineage, host–host, parasite–parasite, host–parasite, and
  occupied–empty cardinal edge counts;
- same-lineage proportion among occupied–occupied edges; and
- for each lineage, patch count, largest patch size and population proportion, mean patch size,
  and singleton-patch count.

Edges are unique undirected toroidal Von Neumann adjacencies. A patch is a maximal connected
component under that adjacency. Undefined proportions and means are blank in CSV and `null` in
JSON. These fields measure spatial contact, fragmentation, and clustering, not cooperation.

### 6.6 Lineage failure and death attribution (output schema 0.3)

For host and parasite lineages separately, every sample interval contains:

- each stable terminal result count for `COPY`, `EXEC_NBR`, and `SPLICE`; and
- exogenous, energy, and exploitation death counts.

The complete run summary contains the same counts aggregated over all intervals, existing
lineage mechanism counters, and identity residuals. Terminal results MUST sum to attempts,
`success` MUST equal existing success counts, death causes MUST sum to deaths, and lineage sums
MUST equal authoritative global counters. Evidence export fails on any non-zero residual.

These are observational runner summaries derived from engine events. They do not alter engine
state or make a failed attempt a realised action in the divergence estimator.

### 6.7 Donor-compatibility attribution (output schema 0.4)

Resolved configurations retain the active `donor_copy_rule`. Rectangular lineage diagnostics
add `donor_copy_absent` alongside `donor_locus_not_copy`. The former is emitted only when a
`cyclic_copy_search` donor contains no `COPY`; the latter remains the exact addressed-locus
failure. This separates absence of donor capability from address incompatibility without
changing the attempt or realised-action definitions. Because terminal counts are part of each
organism's trailing behavioural buckets, checkpoint format and engine-state versions advance to
0.2 and the state-hash contract advances to `sha256/canonical-scientific-state-v2`.

### 6.8 Local-resource state and flow (output schema 0.5)

Every population sample retains:

- total resource stock and total configured resource capacity;
- stock proportion, mean stock per cell and depleted-cell count/proportion;
- resource stock in occupied and empty cells;
- interval and cumulative regeneration actually created;
- interval and cumulative harvest transferred to organisms;
- interval harvest opportunities, zero-harvest activations and partial-harvest activations; and
- reservoir-inclusive energy residual and resource source/transfer reconciliation residuals.

Resource regeneration and computation are distinct created-energy sources. Harvesting is an
internal transfer and MUST NOT be added to created energy.

### 6.9 Degenerate lineage-information state (output schema 0.5)

Lineage-information output adds `defined` and `undefined_reason`. The primary statistic is
undefined when functional entropy is zero or fewer than two ancestral lineage categories are
represented. Permitted reasons are `zero_functional_entropy` and
`single_lineage_degenerate`. Lineage extinction state and the last sample tick at which both
lineages were observed accompany run-level summaries.

## 7. Final summary

`final-summary.json` contains terminal state plus predeclared run-level outcomes derived from `timeseries.csv`. It MUST be reproducible byte-for-byte by the analysis package from resolved config and time series.

Minimum run-level outcomes are:

- post-burn-in time-weighted mean and area under the curve for population `delta`;
- late-period mean population `delta`;
- the same outcomes by lineage;
- post-burn-in active coverage and inactive proportion;
- post-burn-in `D_info`;
- extinction status and time;
- cumulative exposure and success for mutation, HGT, autonomous reproduction, and exploitation; and
- secondary onset fields, including method version and undefined reason when no onset is detected.

Output schema 0.5 also retains whole-run lineage failure/death diagnostics,
donor-compatibility/resource categories, degeneracy state, and their exact counter-reconciliation
residuals.

The burn-in and late-period boundaries come from the frozen analysis plan and MUST be repeated in the summary.

## 8. State hashes

`state-hashes.csv` contains `tick,state_hash`. SHA-256 is computed over canonical serialisation of all state capable of affecting future science, including:

- tick;
- world occupancy;
- every organism field and behavioural bucket;
- next organism identifier;
- PRNG state;
- active configuration identity; and
- pending scheduler or checkpoint state, if any.

Organisms are serialised in ascending identifier order, never map iteration order. Derived aggregate statistics, UI state, file paths, timestamps, and wall-clock performance are excluded.

The same configuration, seed, source commit, and completed tick MUST yield identical state hashes in the browser, headless runner, resumed run, and uninterrupted run.

SHA-256 is a mathematical output contract, not a requirement to use one runtime
implementation. The browser uses the portable synchronous engine implementation; the Node
headless runner uses `node:crypto`. Any injected implementation MUST pass the normative hash
vectors, and cross-implementation tests MUST demonstrate identical configuration digests,
state hashes, checkpoint payload digests, restored states, and continuation outputs. The
manifest records the implementation used for performance provenance. Changing implementation
without changing digest bytes does not create a new scientific-state format.

## 9. Checkpoints

A checkpoint is an atomic, checksummed snapshot of the complete hashable scientific state plus compatibility metadata. Resume MUST verify configuration digest, engine version, checkpoint digest, and source compatibility before continuing.

Resuming from a checkpoint MUST produce the same subsequent state hashes and outputs as uninterrupted execution. A checkpoint made after tick `t` resumes at the first operation of tick `t + 1`.

## 10. Detailed events

Detailed event logs are optional because their volume may be large. When enabled, they are append-only, partitioned by tick range, compressed, and output-schema versioned. Each event includes run, tick, event type, actor, affected organism, lineage, stable result code, integer energy amounts, genome indices or lengths where relevant, and child identifier for births.

Aggregate counters remain mandatory even when detailed events are disabled. Formal pilot work MUST demonstrate that aggregates reconstructed from an event-enabled validation run equal engine counters.

## 11. Batch index

A formal batch produces a top-level `batch-manifest.json` and `runs.csv`. The batch manifest records:

- pre-registered condition table and seeds;
- expected run identifiers;
- source and dependency digests;
- launch command and concurrency limit;
- completion status for each run; and
- a Merkle root or ordered SHA-256 digest over completed run manifests.

Run order MAY vary for performance, but the seed/condition assignment MUST be fixed before execution and independent of interim results.

## 12. Output immutability

Raw formal run directories become read-only research records after successful completion. Corrections are made by a new engine/output version and a new dataset directory. Formal raw files MUST NOT be edited in place, even to repair formatting.

Analysis outputs live outside raw run directories and record the input batch digest. Demonstration, calibration, validation, and formal outputs MUST be stored separately.
