# SCI-001 — Post-v8 Diagnostic Audit Specification v1.0

- **Status:** Frozen before outputs
- **Date frozen:** 1 August 2026
- **Evidence class of every product:** `DIAGNOSTIC`
- **Registry under audit:** `Experiments/diagnostics/post-v8-2026-07-19/`
- **Raw location:** `Experiments/raw-data/external-diagnostics/` (Git-ignored, machine-local)
- **Output location:** `Experiments/processed-data/diagnostics/post-v8-2026-07-19/`
- **Supersedes:** `Simulator/scripts/summarize-results.cjs` and the retained `.gemini` campaign memo

This specification is committed before its outputs exist. It defines what may be computed from the
post-v8 diagnostic bundle, with which denominators, and what may not be concluded from it. No
threshold here was chosen after inspecting a result.

## 1. Purpose and boundary

The post-v8 bundle was produced by an external agent campaign whose generated memo failed an
interpretation audit (miscounted runs, invalid density denominator, overstated certainty). The
runs themselves are intact: 60 manifests, 804 files, 134 checksum lists, all verified on
1 August 2026.

The audit's purpose is to replace that memo with a reproducible, correctly-denominated description
of what those 60 runs actually contain, so that the construct decision `SCI-003` rests on audited
evidence.

The audit is **read-only**. It does not run the simulator, does not modify raw bundles, and cannot
promote any run to `QUALIFICATION` or `FORMAL`. Fifty-six of the sixty manifests carry
`dirty_worktree: true`; that fact is preserved on every row of every output.

## 2. Input discovery

Runs are discovered, never hard-coded.

1. Walk `Experiments/raw-data/external-diagnostics/` and collect every file named `manifest.json`.
2. Reject any resolved path that escapes that root (path-traversal guard).
3. Key each run by `run_id`. A repeated `run_id` is a **fatal** error, not a silent overwrite:
   the audit aborts and reports both paths.
4. Compare the discovered set against
   `campaign-inventory.csv`.
   The expected totals are **60 manifests across 14 campaign directories**, with
   `4 clean / 56 dirty`. A mismatch in either direction is fatal and reported as a registry
   discrepancy; the audit never adjusts the registry to match what it found.

Campaign membership is the first path segment below the discovery root. Clean/dirty status is the
manifest's `dirty_worktree` field, never the directory name.

## 3. Integrity procedure

For every directory containing a `checksums.sha256`, recompute SHA-256 for each listed payload and
compare. The audit records, per run: files listed, files present, files verified, and any
mismatch. A mismatch does not abort the run inventory — it is reported as `integrity: FAILED` on
that row, because concealing a corrupt bundle is worse than reporting one.

The audit reports its own count of checksum lists and listed entries and compares them with the
registry's recorded `134 lists`. It does not re-verify by trusting the earlier verification.

## 4. Denominators

This is the section the superseded helper got wrong, and the reason the audit exists.

### 4.1 Prohibited

**A terminal or late-sample population count may never be the denominator of a cumulative
quantity.** `cumulative_births / final_population` is not a per-organism birth rate. In a run that
collapses, the denominator approaches zero while the numerator does not, so the quantity diverges;
in a run that saturates, the denominator is a constant unrelated to the exposure that generated
the numerator. Every "per organism" figure in the retained memo is invalid for this reason and is
not reproduced in corrected form under the same name.

Also prohibited: mixing a cumulative numerator with an interval denominator, or a whole-run
numerator with a late-window denominator, in the same ratio.

### 4.2 Exact exposure — the primary denominator

`activations` from `manifest.cumulative_counters.activations` is the exact count of organism
activation events over the run. It is the primary exposure denominator, because every attempt,
success, harvest, and energy movement in this engine occurs during an activation.

Per-exposure quantities are reported **per 1,000 activations** to keep magnitudes readable:

```
rate_per_kilo_activation(x) = 1000 * x / activations
```

applied to `births`, `deaths_total`, `autonomous_attempts`, `autonomous_successes`,
`exploitative_attempts`, `exploitative_successes`, `hgt_attempts`, `hgt_successes`,
`computation_rewards`, and `energy_transferred`.

### 4.3 Conditional success ratios — self-normalising, no exposure term

```
autonomous_success_ratio  = autonomous_successes  / autonomous_attempts
exploitative_success_ratio = exploitative_successes / exploitative_attempts
hgt_success_ratio          = hgt_successes         / hgt_attempts
```

These are exact and require no population term. They answer "given an attempt, how often did it
succeed", which is the mechanism question the campaign was actually probing.

### 4.4 Occupancy — a proportion, not a density

Occupancy is the only legitimate population-scaled quantity here, and it is defined per sample,
never cumulatively:

```
occupancy(t) = population_total(t) / (world.width * world.height)
```

with the grid taken from each run's own `resolved-config.json`. Report late-window mean occupancy,
late-window maximum occupancy, and whole-run maximum occupancy. The **late window** is the final
`1/4` of `requested_ticks`, exactly as frozen in `calibration-sweep-v8.json`
(`late_window_fraction = 1/4`); it is not re-derived from `completed_ticks`, so an extinguished run
is not silently given a different window than the protocol declared.

### 4.5 Approximate organism-ticks — declared as approximate

Where a time-integrated exposure is genuinely needed, use trapezoidal integration of
`population_total` over `tick` across `timeseries.csv` samples:

```
organism_ticks ≈ Σ over consecutive samples (t_{k+1} - t_k) * (P_k + P_{k+1}) / 2
```

Every output carrying this quantity must name it `organism_ticks_approx` and record the sampling
interval (`report_every_ticks`, 200) alongside it. It is never presented as exact and never used
where `activations` would serve.

### 4.6 Undefined is not zero

If a denominator is zero, the result is `undefined` with a machine-readable reason
(`no_attempts`, `no_activations`, `no_samples`, `extinct_before_late_window`). It is never
rendered as `0`, blank, `NaN`, or `Infinity`. Any aggregate over runs reports the count of
undefined contributors and excludes them from the mean rather than coercing them.

## 5. Screen re-evaluation

The four clean `v8-reproduction` runs are re-evaluated against the **frozen** v8 screening gates in
`calibration-sweep-v8.json` §`screening_acceptance`. The audit re-derives each gate from raw
fields and reports pass/fail per gate per run. No gate value is altered, added, or relaxed.

The 56 dirty runs are **not** screened. They receive descriptive treatment only: their conditions,
exposure, ratios, occupancy trajectory shape, terminal reason, and provenance. A dirty run may
motivate a question; it may not pass or fail a gate, because its governing inputs were untracked.

The six `qualification-sweep` runs are labelled `qualification-like (dirty)` on every row. The
audit records that all six completed, that zero passed the screen, and that no confirmation
candidate was produced — and it records this as diagnostic evidence about a construct, never as a
qualification outcome.

## 6. Coexistence and extinction

"Coexistence" is reported only in the frozen operational sense, not as a narrative label:

- `both_lineages_observed_through_tick` — the last sampled tick at which both `host_population` and
  `parasite_population` were non-zero, contiguously from tick 0;
- `first_extinction_tick` and `extinct_lineage`, where applicable;
- `whole_run_exploitative_successes`.

Per Decision 0012, lineage extinction is an outcome, not a technical failure, and lineage-
information estimands with fewer than two surviving lineage categories are reported `undefined`
with reason `single_lineage_degenerate`. The audit does not compute a mean divergence across runs
that mixes degenerate and non-degenerate cases.

## 7. Prohibited inferences

The audit reports; it does not conclude. Specifically it must not state or imply that:

- any parameter region is "confirmed", "ruled out", or "closed" — a 1-seed, 4,000-tick or 3-seed,
  10,000-tick dirty screen cannot support that;
- the local-resource construct is falsified in general, as opposed to the tested points failing;
- a difference between conditions is an effect, in the absence of replication and an uncertainty
  estimate — differences are reported as observed values with their seed count, never as findings;
- any dirty run bears on the formal factorial dataset.

Language rules from [`research-questions.md`](../../Research/research-questions.md) §"functional
speciation" apply to the audit's prose.

## 8. Output contract

All outputs are written **only** to
`Experiments/processed-data/diagnostics/post-v8-2026-07-19/` and are byte-for-byte deterministic
across repeated runs on the same inputs: stable key order, stable row order (sorted by
`campaign`, then `run_id`), `\n` line endings, fixed numeric formatting (ratios to 6 decimal
places, rates to 4), and no timestamps or absolute machine paths inside any payload.

| File | Content |
|---|---|
| `run-inventory.csv` | One row per run: identifiers, campaign, clean/dirty, source commit, seed, requested/completed ticks, terminal reason, integrity status. |
| `run-metrics.csv` | One row per run: §4 exposure, ratios, occupancy, and §6 coexistence fields, with explicit `undefined` reasons. |
| `campaign-summary.csv` | One row per campaign directory: counts, and only those aggregates whose contributors are all defined, with undefined counts reported. |
| `screen-evaluation.csv` | The four clean runs × each frozen v8 gate: observed value, threshold, pass/fail. |
| `integrity-receipt.csv` | Per checksum list: entries listed, verified, mismatched. |
| `audit-summary.md` | Prose reading of the tables, bound by §7, stating evidence class and boundary on every claim. |
| `checksums.sha256` | SHA-256 of every file above, generated last. |
| `provenance.json` | Spec version, code entry point, input registry hash, discovery root, run count, and the tool's own source-file hashes. |

Absolute paths from the auditing machine appear in **no** output; raw locations are recorded
relative to the discovery root, per risk `R-002`.

## 9. Acceptance gate

The audit is `VERIFIED` when all of the following hold and are demonstrated by pasted command
output:

1. `npm test` for the analysis workspace passes, including tests for: path traversal rejection,
   duplicate `run_id` abort, registry-count mismatch abort, checksum-mismatch reporting,
   zero-denominator producing `undefined` with a reason, late-window derivation from
   `requested_ticks`, and byte-identical output on a second run.
2. The tool runs to completion over all 60 manifests with a non-zero exit only on real failure.
3. Discovered counts equal `60 / 14 / 4 clean / 56 dirty`.
4. Re-running the tool leaves `git status --short` unchanged apart from intended outputs, and the
   raw tree's mtimes and checksums are unchanged.
5. `shasum -a 256 -c checksums.sha256` passes in the output directory.
6. Every numeric claim in `audit-summary.md` is traceable to a named column of a generated table.

## 10. Amendment

Changing any definition in §4–§7 after outputs exist requires a new version of this specification
and a statement of which outputs are superseded. Do not edit v1.0 in place once
`run-metrics.csv` exists.
