# Decision 0007: Use One Realised Action for Primary Eligibility

- **Status:** Accepted after calibration; supersedes the threshold portion of Decision 0004
- **Date:** 19 July 2026
- **Affects:** divergence eligibility, calibration gates, formal protocol, interpretation

## Context

Decision 0004 provisionally required five realised autonomous-plus-exploitative births per
living organism within the trailing 5,000-tick window, with thresholds one and ten as
sensitivity analyses. It explicitly made that threshold a calibration target.

The 64×64 calibration screens show approximately 3–4% eligibility at threshold five even in
large, actively reproducing populations. The same stored trajectories give approximately
48–53% eligibility at threshold one. This is not simply insufficient simulation duration. In
a demographically stable population, aggregate births approximately replace aggregate deaths;
the expected lifetime reproductive output is therefore near one per organism. Requiring five
realised births selects a small, reproductively prolific survivor subset. An 80% threshold-five
coverage requirement is incompatible with the target steady ecology and would incentivise
runaway population growth or extreme reproductive skew.

## Decision

The primary individual strategy score becomes eligible after at least **one** realised
autonomous or exploitative birth in the trailing window. Thresholds five and ten are retained
as progressively conservative sensitivity analyses.

The primary continuous result is explicitly conditional on organisms with at least one
realised reproductive action. Inactive/insufficient organisms remain a named class in the
population-wide categorical analysis and are never assigned a host-like score of zero.

The frozen coarse and confirmation coverage floor becomes 0.25 rather than 0.80. This does
not claim that one quarter is representative of the whole population; it is a qualification
floor for a conditional estimator. Every result must report total and lineage-stratified
coverage, eligible counts, the inactive class, and threshold-five/ten sensitivity. Formal
inference remains at the independent-run level.

## Consequences

- The continuous estimator no longer makes demographic instability a prerequisite for
  eligibility.
- A one-action organism has a noisy extreme score, so sensitivity thresholds and run-level
  uncertainty are essential.
- Population-wide lineage information continues to include inactive organisms and guards
  against over-interpreting the active-only mean.
- Calibration may not maximise coverage or divergence; it only rejects ecologies with too
  little conditional evidence for the declared measurement.
