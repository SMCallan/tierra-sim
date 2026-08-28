# 64×64 Ancestor and Turnover Refinement v3

- **Status:** frozen focused coarse-screen protocol
- **Parent screens:** `calibration-sweep-v1.md` and `calibration-sweep-v2.md`
- **Machine-readable design:** `Simulator/runner/presets/calibration-sweep-v3.json`
- **Scientific status:** calibration evidence only

## Rationale fixed before v3 outcomes

V2 showed that stronger global turnover alone does not solve coexistence. At 1/75 death, the
host population recovered and saturated but the parasite lineage fell from 128 ancestors to
21 organisms at tick 200 and zero by tick 1,000. Only 10 parasite-lineage exploitative births
occurred in the first 200 ticks against 205 parasite-lineage deaths. At 1/50 and 1/40 the
whole population became extinct by ticks 482 and 463 respectively.

The v1/v2 founding parasite executes `EXEC_NBR` only once per six-instruction cycle. This was
an untested simplification from the legacy parasite ancestor, which used four redundant
`EXEC_NBR` instructions per six elements and described that redundancy as mutation tolerant.
The assessed scope does not freeze an exact ancestor genome; it requires calibrated, versioned
host and parasite fixtures, neighbour-mediated exploitation, local spatial interactions, and
both lineages' survival.

V3 therefore changes the founding parasite explicitly to:

`EXEC_NBR EXEC_NBR INPUT_A INPUT_B XOR OUTPUT EXEC_NBR EXEC_NBR SPLICE`

It remains obligately exploitative at founding because it contains no `COPY`, retains a valid
computation trace, makes HGT reachable without mutation, and restores four exploit attempts
per cycle. The host genome, counts, placement, and energy are unchanged. Descendants may still
change behaviour through mutation or HGT while retaining lineage labels.

## Frozen v3 matrix and gates

V3 holds income at 3 and screens death probabilities 1/100, 1/75, and 1/60. This overlaps the
surviving v2 boundary and adds an intermediate level before whole-population extinction. All
v1 gates, ranking rules, prohibited selection inputs, and confirmation requirements remain
unchanged. No divergence magnitude or onset informed the fixture or factor levels.

From `Simulator/`:

```sh
npm run calibrate -- \
  --sweep runner/presets/calibration-sweep-v3.json \
  --output ../Experiments/raw-data/calibration
```

V3 is not confirmation. Any passing candidate must still be tested for at least 10,000 ticks
under at least three independent, pre-declared seeds and the complete behavioural window.
