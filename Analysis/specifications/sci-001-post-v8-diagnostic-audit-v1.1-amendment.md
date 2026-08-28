# SCI-001 — Post-v8 Diagnostic Audit Specification v1.1 Amendment

- **Status:** Frozen before `SCI-001c` metric and screen outputs
- **Date frozen:** 1 August 2026
- **Amends:** [`v1.0`](sci-001-post-v8-diagnostic-audit-v1.0.md) §5 and §6 only
- **Authority checked:** Decision 0012; the frozen v8 protocol and sweep JSON; output schema 0.5;
  and the retained v8 runner implementation
- **Evidence class of every product:** `DIAGNOSTIC`

All v1.0 clauses not explicitly replaced below remain in force. This amendment was required when
implementation discovered that retained `timeseries.csv` files begin at tick 200 rather than tick
0, while the v1.0 coexistence wording demanded a tick-0-contiguous observation and named a
sampled lineage absence as an exact extinction tick. It also records the historical runner's
composite interpretation of one misleadingly named threshold key.

No `SCI-001c` `run-metrics.csv`, `campaign-summary.csv`, or `screen-evaluation.csv` existed when
this amendment was frozen. The existing `SCI-001b` inventory and integrity tables do not contain
or depend on the amended fields.

## 1. Sampled lineage persistence and absence — replaces v1.0 §6 bullets 1–2

The retained series supports sampled bounds, not an exact lineage-extinction event time. Ancestral
lineage is immutable and inherited vertically under the engine specification, so a lineage that
is absent cannot reappear; nevertheless, a 200-tick sampling interval does not reveal the event
tick at which it disappeared.

`run-metrics.csv` therefore emits:

- `both_lineages_observed_through_tick`: the greatest retained sample tick at which both
  `host_population > 0` and `parasite_population > 0`. This is a sampled lower bound on lineage
  persistence, not a claim that a tick-0 row was retained and not an exact extinction time.
- `both_lineages_observed_through_tick_undefined_reason`: `not_observed_in_retained_samples` when
  no retained sample contains both lineages; otherwise `undefined` because the value is defined.
- `first_sampled_lineage_absence_tick`: the least retained sample tick at which either lineage is
  zero. It replaces the misleading `first_extinction_tick` field named in v1.0.
- `first_sampled_lineage_absence_tick_undefined_reason`: `no_sampled_lineage_absence` when both
  lineages are present at every retained sample; otherwise `undefined`.
- `extinct_lineage`: `host`, `parasite`, or `both` according to which lineage population is zero
  at `first_sampled_lineage_absence_tick`. `both` means both are absent at that retained sample;
  it does not assert simultaneous lineage-extinction events.
- `extinct_lineage_undefined_reason`: `no_sampled_lineage_absence` when `extinct_lineage` is
  undefined; otherwise `undefined`.
- `global_extinction_tick`: `manifest.completed_ticks` only when `terminal_reason` is `extinction`
  and the retained terminal sample at that exact tick has `population_total == 0`.
- `global_extinction_tick_undefined_reason`: `no_global_extinction` when the run did not end in
  verified global extinction; otherwise `undefined`.
- `last_sample_tick_with_cross_lineage_contact`: the greatest retained sample tick with
  `spatial_host_parasite_contact_edges > 0`.
- `last_sample_tick_with_cross_lineage_contact_undefined_reason`:
  `not_observed_in_retained_samples` when no retained sample has a positive cross-lineage contact
  count; otherwise `undefined`.
- `whole_run_exploitative_successes`: unchanged from v1.0.

The new sampled-state reasons do **not** enlarge the closed zero-denominator reason set in v1.0
§4.6. They apply only to the descriptive fields named above. Literal `undefined` remains the CSV
value token; no blank, `null`, `NaN`, `Infinity`, or fabricated tick 0 is emitted.

## 2. Historical interaction-exposure gate — amends v1.0 §5

The frozen JSON key `minimum_both_lineages_observed_through_tick` is misleadingly singular. The
retained v8 runner implemented it as the conjunction:

```text
last_sample_tick_with_both_lineages >= threshold
AND
last_sample_tick_with_cross_lineage_contact >= threshold
```

The audit re-evaluates that historical construct; it does not reinterpret the key using lineage
persistence alone. For its `screen-evaluation.csv` row:

- when both sampled ticks are defined, `observed_value` is their minimum, `comparison` is `>=`,
  and pass/fail follows comparison with the threshold. The row reason is
  `minimum_of_sampled_lineage_and_contact_ticks`;
- when either sampled tick was never observed, `observed_value` is `undefined` and the result is
  `fail`, because the historical sampled gate itself is observably unmet. The reason identifies
  `no_retained_sample_with_both_lineages`,
  `no_retained_sample_with_cross_lineage_contact`, or both; and
- this row is not `not_derivable`: both components are retained in `timeseries.csv`. Thresholds
  whose required inputs lie outside the four allowed per-run files remain `not_derivable` with a
  reason, as required by the original brief.

This ruling preserves Decision 0012 and the MPR-aligned calibration rule: final lineage abundance
is not selected, while the predeclared opportunity for simultaneous lineage presence and
cross-lineage contact is retained.

### 2.1 Disabled final-lineage selection

The frozen v8 JSON sets `minimum_final_lineage_proportion` to zero because Decision 0012 and the
v8 protocol prohibit selection for final lineage abundance. The historical runner represented an
extinct final population with numeric zero proportions so that this disabled gate passed. The
audit must preserve the pass without converting an absent lineage's undefined summary to zero.

For this actual v8 threshold only, emit `observed_value: undefined`,
`comparison: disabled_at_zero_threshold`, `result: pass`, and
`reason: final_lineage_selection_disabled`. A non-zero threshold would be a different governed
construct and is outside this retained v8 re-evaluation; the audit must not invent its semantics.

### 2.2 Computation-energy share is not retained

`manifest.cumulative_counters.computation_rewards` counts reward events, not the amount of energy
actually credited. The configured nominal reward cannot reconstruct credited energy because an
organism energy cap can discard part of a reward. Neither `manifest.json`, `resolved-config.json`,
`timeseries.csv`, nor `final-summary.json` retains the required credited computation-energy total.

Both `computation_created_energy_share_min` and
`computation_created_energy_share_max` therefore emit `result: not_derivable` with
`reason: credited_computation_energy_not_retained`. Multiplying event count by nominal reward is
prohibited as an approximation.

## 3. Required tests

In addition to the v1.0 and `SCI-001c` gates, tests must demonstrate:

1. a series whose first retained row is tick 200 never fabricates a tick-0 observation;
2. first sampled lineage absence is named as sampled, not exact extinction;
3. a terminal global-extinction row yields the exact `global_extinction_tick`;
4. the composite interaction-exposure gate passes only when both sampled components meet the
   loaded threshold; and
5. no observed component yields a derived `fail`, not `not_derivable` or a fabricated zero;
6. the zero final-lineage threshold passes as disabled without a numeric proportion; and
7. computation-share thresholds are `not_derivable` when only event counts are retained.
