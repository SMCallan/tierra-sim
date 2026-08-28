# 64×64 Calibration Sweep v1

- **Status:** frozen coarse-screen protocol
- **Protocol version:** 1.0
- **Machine-readable design:** `Simulator/runner/presets/calibration-sweep-v1.json`
- **Purpose:** identify ecologically observable and computationally practical candidates for later independent-seed confirmation
- **Scientific status:** calibration evidence only; never formal hypothesis-test data

## 1. Decision being made

The screen asks whether an energy/turnover setting can support a non-saturated 64×64 ecology
in which both founding lineages persist, autonomous and exploitative births remain possible,
HGT encounters continue, the behavioural estimator has adequate coverage, computation provides
some but not most created energy, exact accounting holds, and long headless runs remain
practical on the intended machine.

The screen does **not** ask whether behavioural divergence is large or interesting. Mean or
maximum divergence, divergence onset, and visual preference are prohibited selection inputs.
Only the proportion eligible for the already-specified estimator may be used.

## 2. Corrected calibration ancestors

The earlier development fixture could never earn a computation reward and its parasite
contained `COPY`, making it autonomously reproductive from birth. It is therefore unsuitable
for mechanism calibration.

The content-addressed v1 fixture starts 128 organisms of each lineage at energy 120 and places
them by seeded shuffled cells:

- host: `COPY INPUT_A INPUT_B AND OUTPUT COPY SPLICE COPY`;
- parasite: `EXEC_NBR INPUT_A INPUT_B XOR OUTPUT SPLICE`.

Both genomes contain a valid input–operation–output computation trace. The host contains three
`COPY` loci. The parasite has no `COPY`, and its initial register state targets host locus zero,
so its founding exploitative pathway can succeed only when the selected neighbour is an
appropriate donor. Mutation and HGT may subsequently change either genome; lineage remains a
pedigree property and is not re-labelled from behaviour.

## 3. Frozen coarse matrix

All candidates use the same 64×64 world, 256 ancestors, energy costs, computation rewards,
mutation rate, HGT settings, measurement window, duration, and seed. The only crossed factors
are:

| Factor | Frozen levels |
|---|---|
| Environmental income per activation | 1, 2, 3 |
| Exogenous death probability per organism per tick | 1/1000, 1/400, 1/200 |

This creates nine candidates under seed `20260718`. The coarse duration is 2,000 ticks with
measurements and resource progress every 200 ticks. Its last-quarter diagnostics are a screen,
not full-window confirmation.

## 4. Frozen screening gates

A candidate passes only if every gate below passes:

- completed requested duration without extinction;
- energy-ledger residual and event-source residual both exactly zero;
- late mean occupancy 0.20–0.80 and no late sample above 0.90;
- each lineage at least 0.05 of final population and both present at every late sample;
- at least one late autonomous birth, exploitative birth, HGT donor opportunity, and HGT success;
- late mean behavioural eligibility at least 0.25;
- computation supplies 0.005–0.25 of all created energy;
- no more than 0.25 of a sampled population at either configured genome-length bound;
- naive linear 500,000-tick projection no more than 120 minutes; and
- process peak RSS no more than 4 GiB.

The genome-bound gate detects calibration dominated by an artificial mutation boundary. The
runtime projection and process high-water memory are planning diagnostics, not claims of
linear scaling.

## 5. Frozen ranking and confirmation rule

Candidates are ranked lexicographically by: fewest mandatory validity/resource failures;
most ecological gates passed; occupancy closest to 0.50; strongest final minority-lineage
share; greatest late eligibility; then shortest projected runtime. Candidate identifier is
the deterministic final tie-break.

A coarse-screen pass is only eligible for confirmation. Confirmation requires at least
10,000 ticks, at least three independent pre-declared seeds, late eligibility of at least
0.80, and a complete 5,000-tick behavioural window. Confirmation settings and seeds must be
frozen before those runs. A short `--ticks` or `--limit` invocation is explicitly marked
development-only and cannot qualify a candidate.

## 6. Reproducibility and retention

From `Simulator/`:

```sh
npm run calibrate -- --output ../Experiments/raw-data/calibration
```

The runner writes a non-overwriting, atomically published, checksummed sweep directory. It
contains the exact sweep specification, resolved base configuration, ancestor fixture, ranked
candidate table, sweep report, and a standard auditable benchmark/run bundle for every
candidate. Formal result folders remain separate.

If no candidate passes, the complete frozen screen is retained and reported. Parameter levels
may then be revised as a new protocol version using ecological and resource failure modes,
never by selecting for a desired divergence result.
