# 64×64 Calibration Turnover Refinement v2

- **Status:** frozen focused coarse-screen protocol
- **Parent screen:** `calibration-sweep-v1.md`
- **Machine-readable design:** `Simulator/runner/presets/calibration-sweep-v2.json`
- **Scientific status:** calibration evidence only

## Rationale fixed before v2 outcomes

The complete v1 screen produced no qualifying candidate. Income 1 led to extinction. Income 2
either led to extinction, lost the parasite lineage, or became too dense. Every surviving
income-3 candidate remained computationally practical and continued autonomous,
exploitative, and HGT events, but late occupancy reached at least 0.9946 even at 1/200
exogenous death. This is sufficient evidence to retain income 3 and test stronger turnover;
no divergence magnitude or onset was inspected or used.

The energy threshold has a mechanistic explanation. Before mechanism-specific costs, an
eight-element founding host pays one unit of base instruction cost and one unit of genome
maintenance per activation. Income 2 therefore approximately breaks even, whereas income 3
permits energy accumulation. Near saturation at death probability 1/200, late births closely
replace expected deaths. V2 tests turnover near and above the estimated energy-supported
replacement capacity instead of adding arbitrary energy levels.

## Frozen v2 matrix and gates

V2 holds the v1 fixture, income 3, seed `20260718`, 2,000-tick duration, and all non-turnover
settings constant. It screens death probabilities 1/75, 1/50, and 1/40. The three levels
bracket approximately 55, 82, and 102 expected deaths per tick at full occupancy.

All v1 screening gates, ranking order, prohibited selection inputs, and confirmation rules
apply unchanged. This preserves the meaning of a pass across versions. V2 changes only the
factor range after v1 demonstrated that 1/200 was outside the regulating region.

From `Simulator/`:

```sh
npm run calibrate -- \
  --sweep runner/presets/calibration-sweep-v2.json \
  --output ../Experiments/raw-data/calibration
```

If none passes, v2 is retained as another negative result. Any v3 change must cite gate-level
failure modes and remain independent of desired divergence outcomes.
