# 64×64 Spatial-Demography Calibration v6

- **Status:** frozen coarse-screen protocol before outcomes
- **Parent screens:** v1–v5 calibration protocols
- **Machine-readable design:** `Simulator/runner/presets/calibration-sweep-v6.json`
- **Engine decision:** `Research/decisions/0009-spatial-inoculum-and-demographic-calibration.md`
- **Scientific status:** calibration evidence only

## Rationale fixed before v6 outcomes

V5 made local donor search symmetric with autonomous empty-cell search and substantially
increased early exploitative births, yet parasites still disappeared. Turnover at 1/60 and
1/50 caused complete extinction, while 1/75 permitted host saturation. The next screen
therefore changes interaction time and autonomous replacement economics instead of continuing
to search death denominators near the same transition.

The fixture starts 2,048 host ancestors across a 64×64 world and inoculates 128 parasite
ancestors into a seeded 16×16 central region. Parasite coordinates are selected only by the
fixture's focal-group index; every remaining host coordinate is selected from all remaining
world cells using the same seeded PRNG. Lineage labels are never consulted by runtime rules.

`EXEC_NBR` attempt cost is one energy unit: lower than v5's two, but non-zero. Autonomous
operation cost is crossed at 45 and 60 while offspring endowment remains 30; reproduction
cooldown is ten ticks. Turnover is weakened to 1/150, 1/300, and 1/600. Environmental income,
genomes, mutation, HGT, computation rewards, donor-funded births, exploit levy, measurement,
and all other rules remain fixed.

## Frozen v6 matrix and gates

The 2 × 3 factor crossing produces six 2,000-tick, one-seed coarse candidates. Late occupancy
must average 20–80% and never exceed 90%; each lineage must finish at 5% or more and remain
present throughout the late window. Autonomous, exploitative, HGT-donor, and HGT-success
opportunity must continue late. Mean eligibility must reach 25%, computation must contribute
0.5–25% of created energy, sampled genome-bound contact may not exceed 25%, and mean late
host–parasite cardinal contact must be at least one edge. Both energy residuals must be zero,
and existing runtime and memory gates remain.

Ranking is the pre-existing lexicographic rule. Divergence magnitude, divergence onset, and
visual preference are prohibited selection inputs. Connected lineage patches and contact edges
are descriptive calibration diagnostics, not evidence of cooperation or group cognition.

From `Simulator/`:

```sh
npm run calibrate -- \
  --sweep runner/presets/calibration-sweep-v6.json \
  --output ../Experiments/raw-data/calibration
```

A coarse pass nominates a candidate only. Confirmation requires at least 10,000 ticks, three
independent seeds, and a complete 5,000-tick behavioural window before any formal choice.
