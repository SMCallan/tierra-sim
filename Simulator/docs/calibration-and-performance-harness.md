# Calibration and Performance Harness

- **Status:** Implemented development instrument, benchmark report schema `0.8.0`, sweep report schema `0.5.0`
- **Purpose:** Measure whether a candidate ecology is scientifically observable and computationally practical before any formal configuration is frozen

## 1. Why the reconstructed simulator appears slower

The legacy display counter and the reconstructed scientific tick are not equivalent units. In
the reconstructed engine, one tick schedules every organism alive at the start of the tick.
A 1,200-organism world therefore performs roughly 1,200 VM activations per tick, while a
50-organism world performs roughly 50. Comparisons MUST report both ticks per second and
organism activations per second.

The reconstructed path also performs work the legacy visual prototype did not retain:

- seeded random-sequential scheduling and exact integer energy accounting;
- immutable tick-event construction and event-derived mechanism counters;
- trailing behavioural windows and scheduled divergence measurements;
- a permanent birth/death pedigree;
- complete scientific-state hashes and restorable checkpoints; and
- whole-state invariant validation after every tick.

Whole-state invariant checking currently rescans the complete pedigree on every tick, while
each scheduled state hash canonicalises and hashes that pedigree again. Both costs can grow
with every birth even when population occupancy is stable. The harness measures the resulting
trajectory before either policy is optimised. Presentation rendering and browser frame rate
are outside this harness.

## 2. Versioned candidate preset

The default benchmark is deliberately denser than the eight-ancestor first-look run:

- 48 × 32 toroidal world (1,536 cells);
- 192 host-lineage and 64 parasite-lineage shuffled ancestors;
- 10,000 requested ticks;
- scientific samples every 200 ticks and checkpoints every 2,000 ticks;
- the planned 25 × 200-tick behavioural window; and
- detailed event retention disabled by default.

This is a **calibration candidate**, not the formal ecology. Its numerical energy and
mechanism settings inherit the first-look values so their weaknesses can be measured rather
than concealed. The preset and fixture live under `runner/presets/` and are content addressed.

The historical governed successor to this first benchmark was the explicit 64×64 nine-candidate sweep described by
`Experiments/protocols/calibration-sweep-v1.md`. Its corrected fixture makes computation
possible in both founding genomes and removes `COPY` from the founding parasite. The sweep
crosses three environmental-income levels with three exogenous-turnover levels while holding
all other mechanisms fixed.

## 3. Running it

From `Simulator/`, use a short shakedown first:

```sh
npm run benchmark -- --ticks 1000 --report-every 200
```

Run the frozen multi-candidate screen with:

```sh
npm run calibrate -- \
  --sweep runner/presets/calibration-sweep-v1.json \
  --output ../Experiments/raw-data/calibration
```

There is no default scientific sweep. Replace the explicit path only with another versioned
protocol input whose evidence class and disposition you have checked in the
[preset catalogue](../runner/presets/README.md). Omitting `--sweep` is an error.

`--ticks N` and `--limit N` are development shakedown overrides. Their reports are permanently
labelled non-confirmatory. Without `--output`, the screen writes nothing.

Retain a non-overwriting, checksummed evidence bundle with:

```sh
npm run benchmark -- \
  --ticks 10000 \
  --report-every 1000 \
  --benchmark-id candidate-v1-seed-20260718 \
  --output ../Experiments/raw-data/calibration
```

`--seed`, `--run-id`, `--target-ticks`, and `--run-count` can be overridden. A resolved
configuration can replace the default with `--config FILE`; its fixture is resolved in the
same way as a normal headless run. `--retain-events` deliberately measures the expensive
detailed-event storage case. Without `--output`, nothing is written.

## 4. Evidence bundle

Retained output has this structure:

```text
benchmark_id/
├── benchmark-report.json
├── progress.csv
├── checksums.sha256
└── retained-run/
    └── run_id/
        ├── manifest.json
        ├── resolved-config.json
        ├── timeseries.csv
        ├── measurements.json
        ├── lineage.csv
        ├── state-hashes.csv
        ├── final-summary.json
        ├── checkpoints/
        ├── events/
        └── checksums.sha256
```

The nested run is the ordinary runner output, so storage is measured from actual scientific
evidence rather than guessed object sizes. The benchmark directory is created through a
temporary sibling and atomically renamed; an existing identifier is never overwritten.

A calibration sweep wraps one such bundle per candidate and adds `sweep-specification.json`,
`base-configuration.json`, `ancestor-fixture.json`, `sweep-report.json`, `candidates.csv`, and
a checksum manifest covering the complete hierarchy. Candidate selection summaries exclude
divergence magnitude and onset by construction.

## 5. Metric definitions

### Performance and scaling

- execution wall time excludes build time and file export;
- throughput is reported as ticks/s and organism activations/s;
- peak RSS uses the process-wide operating-system high-water mark;
- heap is sampled at progress boundaries, so a brief intermediate peak can be missed;
- retained bytes and file count are measured after the standard run payload is written; and
- 500,000-tick and 60-run values are explicitly labelled naive linear projections.

The projections are planning alarms, not qualification evidence. Population, birth history,
event volume, garbage collection, thermal throttling, and concurrent workers may all scale
non-linearly. Progress rows expose interval throughput so degradation can be detected.

### Ecological qualification

- **occupancy:** population divided by fixed cell capacity, initially, at every sample, and finally;
- **extinction:** terminal occurrence and exact tick, never a technical exclusion;
- **energy balance:** initial plus created energy must equal living plus dissipated plus discarded energy; residual must be zero;
- **energy contribution:** environmental and computation credits are reconstructed from engine events even when those events are not retained;
- **HGT instruction exposure:** every executed `SPLICE` attempt;
- **HGT donor opportunity:** a `SPLICE` attempt whose selected neighbouring donor existed;
- **HGT success:** successful transfers, reported conditionally on donor opportunity as well as absolutely;
- **mutation exposure:** attempted, accepted, and rejected changes by class and per birth; and
- **genome boundary contact:** observed length range and the proportion at configured minimum or maximum length; and
- **divergence eligibility:** scheduled-sample eligible and inactive proportions, defined-divergence count, and coverage at or above the Decision 0007 floor of 25%; and
- **spatial structure:** unique lineage-contact and occupied-boundary edges plus connected host and parasite patch summaries; and
- **lineage diagnostics:** every operation result and death cause by ancestral lineage, with exact attempt/success/death reconciliation.

This distinction prevents a high configured HGT probability from being mistaken for actual
HGT exposure in a spatial world.

## 6. Interpretation gate

The single-candidate benchmark intentionally does not emit a `pass` flag. The governed sweep
does emit gate-level and complete-screen decisions because its acceptance ranges and
lexicographic ranking rule are frozen in a versioned specification before outcomes. It
compares candidates on survival, occupancy, energy balance, mechanism opportunity,
eligibility, genome-bound contact, runtime, and memory. A fast ecology that makes a mechanism
impossible is not qualified; neither is an interesting ecology whose formal batch cannot be
retained and audited on the intended machine.

Further optimisation decisions should be made only after comparing interval throughput,
occupancy, and pedigree growth. Candidate changes to state representation or invariant-audit
frequency must demonstrate identical scientific measurements and explicit versioned hash
semantics before they are allowed in headless formal execution.

## 7. Initial profiling observation

An unretained 1,000-tick development run of the default dense candidate on the intended Mac
reached 99.9% occupancy. Interval throughput remained approximately 103–118 ticks/s while
activation throughput rose to approximately 159,000 activations/s. This confirms that the
displayed tick rate falls mainly because a dense tick performs far more organism work.

The same run also reached only 1–1.5% primary divergence eligibility, ceased generating most
new HGT exposure after the early phase, attributed 0% of created energy to computation, and
reached a process peak RSS of approximately 1.37 GiB. It is therefore neither scientifically
nor computationally qualified as the formal preset.

A sampled 400-tick CPU profile attributed more samples to canonical scientific-state
serialisation and browser-safe SHA-256 than to invariant validation. In a controlled direct
engine comparison, 400 ticks without scheduled runner measurements took approximately 1.52 s,
while one final full-state hash took approximately 1.00 s.

The subsequent optimisation retained the exact state format and digest bytes while selecting
Node's native SHA-256 for headless runs, caching repeated canonical-object shapes, replacing
recursive tick-event freezing with verified detached shallow freezing, and avoiding pedigree
snapshot allocation when only an event's lineage enum is required. Cross-implementation tests
cover hashes, checkpoints, restoration, and continuation.

On the same 1,000-tick dense diagnostic, total throughput improved from approximately 101 to
236 ticks/s, activation throughput from approximately 145,000 to 336,000 activations/s, peak
RSS from approximately 1.37 GiB to 669 MiB, and the naive 500,000-tick projection from 82 to
35 minutes. The ecology itself remained unqualified: it saturated the lattice, produced no
computation-energy contribution, lost most continuing HGT opportunity, and retained only
about 1–1.5% primary divergence eligibility.

These measurements argue against changing the hash-state representation prematurely. The
next decision point is ecological calibration at realistic occupancy, including the assessed
64 × 64 scale. Compact or incremental state hashing should be reconsidered only if calibrated
formal candidates still fail the resource gate. These figures are diagnostic observations
from development code, not frozen acceptance thresholds or formal results.

A subsequent 400-tick 64 × 64 scale probe reinforced that decision. The unchanged ecology
rose from 6.25% initial occupancy to 93.0%, reached only about 0.13% eligibility at tick 400,
and produced a naive 500,000-tick projection of approximately 85 minutes. This does not show
that the assessed grid is intrinsically impractical; it shows that the inherited energy and
death ecology rapidly saturates both tested grid sizes. Performance qualification must
therefore follow, not precede, an occupancy-qualified calibration sweep.

## 8. Governed 64×64 screen sequence

Six frozen calibration versions have now been retained. V1 established the energy threshold:
income 1 went extinct, income 2 was unstable or lost the parasite, and income 3 saturated.
V2 showed a sharp transition from host saturation at 1/75 turnover to whole-population
extinction at 1/50. V3 restored the legacy parasite's redundant exploit attempts and obtained
qualified occupancy at 1/60, but parasites still disappeared. V4 raised initial occupancy to
25% and adopted the calibrated threshold-one primary estimator; its 1/75 candidate passed
every gate except parasite survival. V5 replaced the arbitrary one-direction donor probe with
deterministic cardinal search. Early exploitative births increased, but coexistence still
failed and stronger turnover caused extinction.

V6 then used a local parasite inoculum in an established host background, reduced the non-zero
`EXEC_NBR` attempt cost, crossed higher autonomous operation costs, raised cooldown, and tested
weaker turnover. It also added patch/contact measurement and a late-contact gate. All six
candidates ultimately reached 99.5–99.9% late mean occupancy. Five lost the parasite lineage;
the sixth retained one inactive parasite at tick 2,000. Every energy residual remained zero,
and all candidates passed runtime, memory, mechanism-exposure, and primary-eligibility gates.

This rules out a broader blind sweep of the same fixed costs and turnover probabilities.
Decision 0010 now adds lineage-stratified operation failure and death-cause counts without
changing engine trajectories. The frozen v6.1 diagnostic applied them to the first 600 ticks
of all six candidates. Parasite-lineage `EXEC_NBR` succeeded in only 0.762% of 72,951 attempts;
80.4% ended at exact donor-locus mismatch. Energy deaths comprised 57.5% of parasite deaths,
and contact loss became the dominant attempt failure only after the initial decline. The next
decision must therefore evaluate exact-locus compatibility before a density-dependent/local
resource redesign addresses the separate saturation problem. Combat remains excluded. No
divergence magnitude or onset was used to select or reject a calibration setting.

The frozen v7 mechanism control made that comparison at the v6 cost-45, turnover-1/300 setting.
Deterministic cyclic donor `COPY` search raised parasite-lineage exploitative successes from 99
to 503 and retained 57 parasite descendants at tick 2,000, while the exact-address lineage was
extinct by tick 1,400. Compatibility failures fell from 81.69% to 23.94% of parasite attempts.
However, both conditions reached more than 99.7% late mean occupancy; under cyclic search,
56.92% of all and 79.40% of late parasite exploit attempts failed for lack of empty space.
Zero of two conditions passed every gate, all accounting residuals were zero, and neither was
promoted. This identified exact addressing as a material bottleneck in the tested ecology,
left production semantics unresolved at that point, and strengthened the case for a local resource or
density-regulation design review before v8.

V8 implements that governed correction under configuration schema 0.4 and engine specification
0.2. A lineage-neutral integer reservoir now regenerates in every cell before scheduling and is
harvested after exogenous survival but before instruction execution. Headless reports reconcile
initial resource, regeneration, harvesting, current stock, organism energy and all sinks; they
also retain sampled stock, depletion, occupied/empty resource, harvest shortfall and event
residuals. The cockpit exposes the same cell state through a dedicated resource lens.

The frozen v8 screen crosses regeneration `{1, 2}` with harvest cap `{3, 6}` for four one-seed,
4,000-tick conditions. Final lineage abundance is prohibited from ranking. Qualification instead
requires minimum observed lineage/contact exposure, realised exploitation, sustainable
non-saturated occupancy, non-degenerate resource availability, continuing mechanisms,
eligibility, exact accounting and practical resources. It cannot promote a confirmation
candidate; see `Experiments/protocols/calibration-sweep-v8.md`.
