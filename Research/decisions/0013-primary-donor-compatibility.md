# Decision 0013: Use Donor-Level COPY Capability as the Primary Exploitation Construct

- **Status:** Accepted and implemented in the frozen v8 primary configuration
- **Date:** 19 July 2026
- **Supersedes:** Decision 0011's unresolved production-rule status
- **Affects:** `EXEC_NBR`, formal configuration, sensitivity controls, construct validity

## MPR authority

The graded Mid-Project Review describes `EXEC_NBR` as blindly selecting a random instruction
from a neighbouring genome and reproducing the caller when that instruction is `COPY`, at the
neighbour's expense. It requires neighbour-mediated parasitic exploitation but does not require
register B to point to an exact donor locus. Exact B-address compatibility was introduced during
the rebuild and therefore cannot be treated as an assessed commitment.

## Evidence

In the frozen v7 one-seed mechanism control, exact addressing rejected 81.69% of all
parasite-lineage exploit attempts at compatibility and the lineage was extinct by tick 1,400.
Deterministic cyclic donor `COPY` search reduced donor-capability failures to 23.94%, raised
parasite exploitative successes from 99 to 503, and retained the lineage through tick 2,000.
Both ecologies saturated, so this result diagnoses compatibility rather than qualifying either
ecology.

## Decision

The primary specification uses `cyclic_copy_search`: after selecting the first occupied cardinal
donor, search its genome once in deterministic cyclic order beginning at `B modulo donor length`
and accept the first `COPY`. A donor with no `COPY` fails with `donor_copy_absent`.

This rule:

- measures whether the selected neighbour possesses autonomous-reproduction capability;
- preserves local encounter, donor-funded offspring energy and exploit levy;
- consumes no additional PRNG draw;
- grants no lineage-specific privilege; and
- avoids making an unassessed lock-and-key addressing trait the dominant causal mechanism.

`addressed_locus` remains supported for historical schemas and as a preregistered sensitivity or
digital-defence mechanism control. It is not pooled with primary-rule runs.

## Consequences

- V8 and the proposed formal configuration declare `cyclic_copy_search` explicitly.
- Exact addressing can support a claim about compatibility/defence only when manipulated and
  interpreted as that distinct construct.
- The choice is justified by MPR construct alignment plus diagnostic evidence, not by selecting
  whichever condition maximised parasite abundance.
