# Decision 0006: Separate Engine, Runner, and Visualisation

- **Status:** Accepted for specification
- **Date:** 18 July 2026
- **Affects:** Repository architecture, reproducibility, testing

## Context

The frozen simulator couples scientific state transitions, React rendering, data collection, and CSV export in one file. This prevents trustworthy headless experiments and makes configuration drift difficult to detect.

## Decision

Implement the rebuild in TypeScript as three packages:

- a pure deterministic engine with no browser or filesystem dependency;
- a headless Node runner responsible for configuration, batches, checkpoints, manifests, and outputs; and
- a React application that consumes the same engine API for visual inspection.

Use an explicitly named, serialisable 32-bit PRNG with golden-sequence tests. All scientific parameters must come from a validated immutable configuration. Every formal run records the Git commit, engine/schema versions, seed, canonical configuration, runtime information, state hashes, and output checksums.

Python will be used for formal analysis, not for simulation state transitions.

## Consequences

- Browser and headless execution can be compared by state hash.
- UI frame rate cannot define scientific time.
- A formal dataset can be reproduced from manifest plus source commit.
- Implementation does not begin until the normative specifications pass review.
