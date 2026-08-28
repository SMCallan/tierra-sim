# Decision 0017: Correct the Assessed Research-Gap Statement

- **Status:** Accepted; corrects an assessed framing, not an assessed method
- **Date:** 1 August 2026
- **Affects:** `Project-Governance/assessed-scope.md`, discrepancy `D017`, claims `C001` and `C005`,
  `Dissertation/02-literature-review`
- **Evidence:** `REF-001a` literature verdict
  and the primary source notes for
  Avida and Tierra

## Correction, 1 August 2026 — the MPR is stronger than this record first stated

This decision was written from `assessed-scope.md`'s one-sentence compression of the research gap.
Direct reading of the graded MPR shows that compression was not faithful.

The MPR's §3 already states a three-part gap: an absent formal operational definition of phenotypic
drift, an absent systematic protocol for measuring it under controlled parametric variation, and an
absent quantitative threshold characterisation — positioned explicitly against Dolson and Ofria
(2021) and the MODES toolbox. That is materially the narrowed gap this decision reached
independently.

The decision's substance therefore stands, but its scope is narrower than originally written. The
false characterisation of Tierra and Avida is confined to the MPR's §1–§2 framing prose. It does
**not** infect §3, and the assessed contribution needed no rescuing. See
`assessed-baseline.md` §1–§2.

## MPR authority

The graded Mid-Project Review argues that existing digital-evolution research has investigated
mutation, spatial ecology, horizontal gene transfer, phylogeny and emergent ecological roles, but
lacks a unified quantitative method for measuring the reliability of lineage-based classification
under their combined influence. Its supporting prose characterises Tierra and Avida as relying on
ancestral lineage labels for ecological roles.

That supporting characterisation is false, and `REF-001a` established it against the platforms'
own primary descriptions:

- **Avida** defines phenotype as comprising all observable characteristics of the organism, filled
  from realised execution — computations performed on environmental input, gestation length, age,
  mutation history, how the organism interacts with other organisms, and fitness. Its lowest
  taxonomic level, the genotype, is membership by genome identity, not descent.
- **Tierra** names genotypes by instruction count plus a within-size-class arrival code and stores
  the immediate ancestor as a separate field so that phylogeny can be reconstructed. Ecological
  roles are functional: parasites lack a working copy procedure and execute the copy procedure of
  another creature within the search limit. Ray's hand-dissected size-46 and size-64 mutualists are
  two organisms of identical ancestry with different ecological roles, demonstrated in the
  foundational paper itself.

The assessed gap therefore rests on a premise its own cited platforms contradict. Left uncorrected
it would be a direct examination liability, because it is checkable in one reading of either
platform paper.

## Decision

The research gap is restated as an absent **measurement**, not an absent awareness:

> Digital-evolution platforms already measure ancestry and realised function separately. Tierra
> identifies ecological roles such as parasitism from code structure and executed behaviour, and
> Avida defines phenotype as observable characteristics including inter-organism interaction while
> tracking phylogeny independently. Phylogeny-aware measurement is itself an active area, though
> the established metrics quantify community-level diversity or phylogenetic structure rather than
> individual lineage–function agreement. What is not established is a per-organism, longitudinal
> measure of the *disagreement* between the ecological behaviour a lineage predicts and the
> behaviour an organism realises, under mutation, spatial constraint, and horizontal transfer
> acting together. This project supplies and evaluates that measure.

The superseded assessed wording is retained in `assessed-scope.md`, marked as the MPR's statement,
with the reason for its supersession and a link to this record. It is not deleted.

## Scientific rationale

Three alternatives were considered.

1. **Retain the assessed wording and defend it.** Rejected: it is not defensible. The claim is
   contradicted by the defining publications of both named platforms, and an assessor need only
   read one section to see it.
2. **Delete the gap claim entirely and present the work as a new instrument without a gap.**
   Rejected: it discards a real and defensible contribution, and a dissertation without a stated
   gap invites the question anyway.
3. **Narrow the claim to what the sources support.** Adopted. The narrowed claim is stronger
   precisely because it survives the check that would have destroyed the original.

The narrowing also converts the contribution from a negative claim about other researchers into a
positive claim about a measurement this project supplies, which is the form a methodological
contribution should take.

## Boundary: what does not change

This decision corrects a statement about *other platforms*. It does not touch this project's
method, and nothing downstream of the research question is affected:

- the canonical research question is **unchanged**;
- the `Δ_D` construct, its individual-first definition, eligibility rules and lineage-
  informativeness validation are **unchanged**;
- hypotheses H1–H4 are **unchanged**;
- the assessed experimental programme — 48 assessed runs plus 12 mechanism controls — is
  **unchanged**;
- no engine, protocol, schema, or frozen specification is affected.

The correction is to the *justification* for the work, not the work.

## Consequences

- `D017` moves to resolved, citing this record.
- Open question `O-004` is closed.
- `Dissertation/02-literature-review/outline.md` §2.2 and §2.10 move from `at-risk` to
  `writable-now`, and their governing source becomes this decision together with the `REF-001a`
  notes. Updating that outline belongs to whoever next holds the dissertation front; this record
  does not edit it.
- `D003` is **reinforced, not altered**: the legacy static index and the execution-window `Δ_D`
  remain distinct quantities, and the corrected gap depends on that distinction being maintained.
- Claims `C001` and `C005` keep their substance. `C005`'s framing must not imply that other
  platforms lack behavioural measurement, because they do not.
- The dissertation must declare this as a post-MPR correction with its reason. A silent change
  between the assessed MPR and the submitted dissertation would be worse than the original error.
- `N3` — that no established method covers the three mechanisms jointly — rests partly on absence
  of evidence within a bounded search. It is stated as "not established", never as "does not
  exist", and a systematic database search would strengthen it.
