# 64×64 Local-Encounter Refinement v4

- **Status:** frozen focused coarse-screen protocol
- **Parent screens:** v1–v3 calibration protocols
- **Machine-readable design:** `Simulator/runner/presets/calibration-sweep-v4.json`
- **Scientific status:** calibration evidence only

## Rationale fixed before v4 outcomes

V3 restored four founding parasite exploit instructions and found a turnover setting (1/60)
with qualified late occupancy: mean 0.748 and maximum 0.889. Nevertheless, all parasite
lineages disappeared by tick 600. In the 1/60 run they fell from 128 founding parasites to
three at tick 200 and zero at tick 400, producing only six exploitative and twelve
autonomous births in the first interval against 143 deaths.

This failure occurs before late density regulation and reflects encounter opportunity. The
v1–v3 fixtures start only 256 organisms in 4,096 cells (6.25% occupancy). Under shuffled local
placement, a founding parasite commonly has no host in its selected cardinal direction and
cannot reproduce autonomously. Increasing `EXEC_NBR` density did not correct that spatial
bottleneck.

V4 raises the initial population to 512 hosts and 512 parasites (25% occupancy), retaining
equal lineages, shuffled placement, the v3 genomes, and initial energy. This increases local
encounter opportunity without engineering favourable fixed coordinates or granting a
lineage-specific survival rule.

Decision 0007 independently corrects the primary eligibility threshold from five realised
births to one, retaining five and ten as sensitivities. The coarse and confirmation coverage
floor is 0.25. This change follows demographic logic and stored sensitivity diagnostics; it
does not use divergence magnitude or onset.

## Frozen v4 matrix and gates

Income remains 3. Death probabilities are 1/75, 1/60, and 1/50, spanning v3 saturation,
qualified occupancy, and the earlier extinction boundary. All other gates and ranking rules
remain unchanged. The eligibility gate now evaluates the Decision 0007 primary threshold.

From `Simulator/`:

```sh
npm run calibrate -- \
  --sweep runner/presets/calibration-sweep-v4.json \
  --output ../Experiments/raw-data/calibration
```

A coarse pass remains ineligible for formal use until multi-seed, 10,000-tick confirmation.
