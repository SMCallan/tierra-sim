# V6.1 Lineage Failure and Mortality Diagnostic

- **Status:** frozen diagnostic protocol before outcomes
- **Parent:** `calibration-sweep-v6.md`
- **Measurement decision:** `Research/decisions/0010-lineage-stratified-failure-and-death-diagnostics.md`
- **Scientific status:** development diagnostic only; no candidate selection

## Purpose

V6 showed early parasite decline followed by lattice saturation but could not attribute the
decline among operation failure and death mechanisms. V6.1 reruns the unchanged six-candidate
v6 matrix for 600 ticks under the same seed, fixture, energy rules, mutation, HGT, placement,
and scheduler. Only runner observation and output schemas differ.

Six hundred ticks retain three 200-tick intervals spanning initial inoculum interaction and the
observed decline. No candidate can pass confirmation or alter v6's frozen result because the
tick override permanently labels this bundle development-only.

## Predeclared summaries

For host and parasite lineages separately, report by interval and across ticks 1–600:

- `COPY`, `EXEC_NBR`, and `SPLICE` attempts split across every terminal result;
- success proportion conditional on attempts;
- for `EXEC_NBR`, the shares ending in `no_neighbour`, `donor_locus_not_copy`, `cooldown`,
  `no_empty_cell`, `insufficient_donor_energy`, and `insufficient_caller_energy`;
- exogenous, energy, and exploitation death counts and shares; and
- the exact residual identities from Decision 0010.

Interpretation prioritises absolute counts alongside conditional proportions because lineage
population sizes differ and shrink through time. Divergence magnitude, onset, calibration rank,
and visual appearance are not diagnostic selection inputs. The result may motivate a later v7
decision but does not itself change ecology.

From `Simulator/`:

```sh
npm run calibrate -- \
  --sweep runner/presets/calibration-sweep-v6.json \
  --ticks 600 \
  --output ../Experiments/raw-data/calibration
```
