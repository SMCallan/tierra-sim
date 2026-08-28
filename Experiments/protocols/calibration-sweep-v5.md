# 64×64 Cardinal-Donor Refinement v5

- **Status:** frozen focused coarse-screen protocol
- **Parent screens:** v1–v4 calibration protocols
- **Machine-readable design:** `Simulator/runner/presets/calibration-sweep-v5.json`
- **Engine decision:** `Research/decisions/0008-cardinal-donor-search.md`
- **Scientific status:** calibration evidence only

## Rationale fixed before v5 outcomes

V4 increased initial occupancy from 6.25% to 25%. At 1/75 turnover it achieved qualified late
occupancy (mean 0.735; maximum 0.888), qualified threshold-one eligibility (0.494), a qualified
computation share (0.0066), and every non-lineage gate. Nevertheless, all parasite descendants
were gone by tick 600. In the first 200 ticks, parasite-lineage births totalled 299 while
parasite-lineage deaths totalled 754.

Decision 0008 identifies an arbitrary interaction asymmetry in the reconstructed draft:
`COPY` searches all four cardinal cells for empty space, while `EXEC_NBR` probes only one cell
for a donor. V5 uses deterministic cardinal donor search beginning at register A. The first
occupied neighbour is selected without regard to lineage, genome, energy, or suitability;
register B must still identify `COPY`, and all donor costs remain.

## Frozen v5 matrix and gates

V5 reuses the complete v4 configuration and fixture, varying only death probability across
1/75, 1/60, and 1/50 under the revised engine semantics. All selection gates and ranking rules
are unchanged from v4. Mean/maximum divergence, onset, and visual preference remain prohibited.

From `Simulator/`:

```sh
npm run calibrate -- \
  --sweep runner/presets/calibration-sweep-v5.json \
  --output ../Experiments/raw-data/calibration
```

Earlier runs are retained but cannot be pooled across the transition-semantic change. A v5
coarse pass still requires independent-seed, 10,000-tick confirmation.
