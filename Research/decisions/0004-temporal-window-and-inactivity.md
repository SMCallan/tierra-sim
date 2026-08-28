# Decision 0004: Use Bucketed Trailing Windows and Explicit Inactivity

- **Status:** Accepted for window/inactivity semantics; eligibility threshold superseded by Decision 0007
- **Date:** 18 July 2026
- **Affects:** Runtime state, sampling, memory use, output schema

## Context

The MPR proposes a 5,000-tick window and 200-tick sampling. Storing every event for every organism would be unnecessarily large. Short-lived or inactive organisms may have no informative actions.

## Decision

Use 25 circular behavioural buckets of 200 ticks, giving a 5,000-tick trailing window. Each organism stores compact counts for attempted and successful autonomous reproduction, attempted and successful exploitation, HGT attempts/successes, rewarded outputs, and other required audit counters.

The initial specification proposed five realised autonomous-plus-exploitative actions, with one and ten as sensitivities. Calibration subsequently showed that this requirement is demographically incompatible with adequate coverage in a stable population. Decision 0007 makes one action primary and retains five and ten as sensitivities.

When no sufficient informative activity exists, strategy is undefined. Undefined organisms are excluded from the continuous mean but reported by lineage and classified as inactive for categorical analysis.

## Consequences

- Window semantics align exactly with the MPR’s proposed sampling interval.
- Individual histories remain bounded in memory.
- Inactivity cannot be silently interpreted as host-like behaviour.
- Window length and eligibility thresholds remain calibration targets and are reported transparently.
