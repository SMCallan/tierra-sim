# Tierra Rebuild Engine Specification

- **Status:** Normative draft 0.4 (engine specification 0.2)
- **Date:** 19 July 2026
- **Authority:** The graded Mid-Project Review, as refined by the accepted research decisions
- **Scope:** Scientific state transitions only; interface and presentation are non-normative

## 1. Purpose

The engine is a deterministic, spatial digital-ecology system for testing when ancestral lineage ceases to predict realised ecological behaviour under controlled mutation and horizontal gene-transfer conditions.

The engine is not intended to reproduce the legacy simulator instruction for instruction. The legacy system is evidence of prior design exploration. This document defines the rebuilt scientific instrument.

Normative terms `MUST`, `MUST NOT`, `SHOULD`, and `MAY` have their usual requirements meaning.

## 2. Scientific invariants

1. The two ancestral lineage labels are `host` and `parasite`.
2. Lineage is inherited vertically and never changes during a run.
3. Lineage is an observational marker only. It MUST NOT grant different energy, mutation, instruction, scheduling, or reproduction rules.
4. Every organism uses the same virtual machine and may evolve autonomous, exploitative, mixed, computational, or inactive behaviour.
5. Mutation and `SPLICE` are the only operations that can change genome content.
6. One simulation tick is independent of wall-clock time and UI frame rate.
7. Every stochastic choice MUST use the run's specified pseudo-random number generator.
8. Scientific state transitions MUST use deterministic integer arithmetic.
9. Resource availability and harvesting MUST NOT depend on ancestral lineage.

## 3. World model

The world is a finite rectangular lattice with toroidal boundaries. Each cell contains zero or one organism. The formal experiment uses a Von Neumann neighbourhood: north, east, south, and west.

Directions have the stable numeric order:

| Value | Direction |
|---:|---|
| 0 | north |
| 1 | east |
| 2 | south |
| 3 | west |

Coordinates wrap at world boundaries. A configuration MUST declare width, height, topology, and cell capacity. Version 0.1 supports only toroidal Von Neumann topology and capacity one; other values MUST fail validation rather than silently changing the model.

Engine specification 0.2 adds an integer local-resource stock to every cell. Cell resource is
independent of occupancy and persists after birth or death. Stocks are serialised in row-major
cell-index order and remain within configured inclusive bounds `0..cell_capacity`.

## 4. Organism state

Each living organism MUST contain at least:

- a unique monotonically assigned organism identifier;
- parent identifier or `null` for an ancestor;
- immutable ancestral lineage;
- generation number;
- lattice coordinates;
- a genome containing four-bit elements;
- instruction pointer;
- unsigned eight-bit registers `A` and `B`;
- comparison flag in `{-1, 0, +1}`;
- non-negative fixed-point energy balance;
- age in ticks;
- reproduction-cooldown counter;
- current computation task inputs and provenance state;
- computation tasks rewarded in the current reproductive cycle; and
- the behavioural counters defined in Section 11.

Genome length MUST remain within configured inclusive minimum and maximum bounds. Registers wrap modulo 256. Genome indices wrap modulo current genome length.

## 5. Scheduler and tick lifecycle

Scientific state stores `completed_tick`, initially zero. The next activation cycle is tick `t = completed_tick + 1`. Under engine specification 0.2, the engine first regenerates every local-resource cell in ascending row-major index order. It then prepares the global behavioural bucket for tick `t`, clearing a circular slot if it is being reused, takes a snapshot of the identifiers alive at that boundary, and applies a seeded Fisher–Yates shuffle. Each listed organism is activated at most once in the resulting order.

For each identifier:

1. Skip it if the organism has died since the snapshot was created.
2. Apply the configured exogenous-death Bernoulli trial. On success, record the death, remove the organism, and stop its activation.
3. Under legacy engine specification 0.1, add per-activation environmental income. Under 0.2,
   harvest local resource from the organism's current cell as defined in Section 6.1.
4. Decrement a positive reproduction cooldown by one.
5. Fetch and execute one instruction.
6. Charge base execution and genome-maintenance costs, in addition to any instruction-specific costs.
7. Increment age by one.
8. If energy is zero after all charges or transfers, record energy death and remove the organism.

New offspring enter the world immediately but MUST NOT activate until the next tick. If an operation reduces another organism's energy to zero, that organism dies immediately and is skipped if its scheduler turn has not occurred.

After all scheduled activations, the engine sets `completed_tick = t`. If `t` is a configured sample boundary, it computes aggregate statistics and emits the configured state hash. Sampling therefore occurs after the completed tick whose number is recorded.

## 6. Energy accounting

Energy uses an integer fixed-point unit declared by configuration. Floating-point values MUST NOT be used in scientific state transitions.

All deductions use saturating unsigned subtraction: the amount actually dissipated is the smaller of current balance and requested cost. If a mandatory instruction cost exhausts the balance, the organism reaches zero and cannot complete a success that requires further payment. Reproduction and successful-transfer preconditions require the full declared amount, so a partially paid success is impossible.

Legacy engine specification 0.1 configuration provides:

- environmental income per activation;
- maximum organism energy;
- base instruction cost;
- genome-maintenance cost as a documented integer function of genome length;
- autonomous reproduction operation cost;
- offspring endowment;
- `EXEC_NBR` attempt cost and exploit levy;
- `SPLICE` attempt and successful-transfer costs; and
- reward for each computation task.

An autonomous birth transfers the offspring endowment from the parent to the child and dissipates the autonomous operation cost. An exploitative birth transfers the offspring endowment from the selected donor to the child and dissipates the configured exploit levy from that donor. The caller still pays its normal and `EXEC_NBR` attempt costs.

Energy MUST be conserved across transfers and changed only by declared environmental income, declared rewards, declared dissipative costs, and organism removal. Every event record MUST distinguish transferred, created, dissipated, and discarded energy.

### 6.1 Local renewable resources (engine specification 0.2)

Schema 0.4 configurations set legacy `environmental_income` to zero and declare:

- cell resource capacity;
- uniform initial stock;
- regeneration per cell per tick;
- maximum harvest per organism activation; and
- the fixed timing labels `before_scheduler_snapshot` and
  `after_exogenous_before_instruction`.

Before the tick scheduler snapshot, for every cell in ascending index order, add:

`min(regeneration_per_tick, cell_capacity - current_stock)`.

The sum actually added is external energy creation. Regeneration at capacity creates zero and
does not disappear into an unrecorded sink.

After an organism survives its exogenous-death trial, it harvests:

`min(harvest_per_activation, cell_stock, maximum_organism_energy - organism_energy)`.

The harvested amount is removed from the cell and added to the organism as an internal transfer.
A capped organism leaves unharvested resource in the cell. Resource is not destroyed when an
organism dies and regenerates in both occupied and empty cells.

The exact reservoir-inclusive identity is:

`initial organism energy + initial resource + regenerated resource + computation rewards`

`= living organism energy + current resource + dissipated energy + discarded energy`.

Offspring endowment, donor funding and harvesting are transfers and therefore cancel. The engine
also reconciles event-derived regeneration and harvest with authoritative counters. Resource
state, totals and counters enter invariants, checkpoints and state hashes.

## 7. Virtual machine

Genome elements are unsigned four-bit values. Every possible value is a valid opcode.

| Hex | Mnemonic | Normative behaviour |
|---:|---|---|
| `0` | `NOP` | No state change other than normal costs and pointer advance. |
| `1` | `INPUT_A` | Load the current task's first input into `A`; mark first-input provenance. |
| `2` | `INPUT_B` | Load the current task's second input into `B`; mark second-input provenance. |
| `3` | `OUTPUT` | Validate and, if eligible, reward the most recent declared computation result. |
| `4` | `AND` | Set `A = A AND B`; identify `AND` as the most recent computation operation. |
| `5` | `XOR` | Set `A = A XOR B`; identify `XOR` as the most recent computation operation. |
| `6` | `EQU` | Set `A = NOT(A XOR B) AND 255`; identify `EQU` as the most recent computation operation. |
| `7` | `ADD` | Set `A = (A + B) modulo 256`; identify `ADD` as the most recent computation operation. |
| `8` | `CMP` | Set the flag to `-1`, `0`, or `+1` according to unsigned comparison of `A` with `B`. |
| `9` | `JZ` | Consume the next genome element as a signed relative offset; jump only when flag is zero. |
| `A` | `JMP` | Consume the next genome element as an unconditional signed relative offset. |
| `B` | `COPY` | Attempt autonomous reproduction as defined in Section 8. |
| `C` | `SENSE` | Set `A` to occupied cardinal-neighbour count and `B` to empty cardinal-neighbour count; invalidate task-input provenance. |
| `D` | `SWAP` | Exchange `A` and `B`, including their input-provenance tags. |
| `E` | `EXEC_NBR` | Attempt exploitative reproduction as defined in Section 9. |
| `F` | `SPLICE` | Attempt horizontal transfer as defined in Section 10. |

### 7.1 Instruction-pointer rules

Ordinary instructions advance the pointer by one. The immediate element following `JZ` or `JMP` is data for that execution and is not executed as an opcode. Interpret `0..7` as offsets `0..7` and `8..15` as offsets `-8..-1`.

For a jump at pointer `i`, the fall-through pointer is `i + 2`. A taken branch sets the pointer to `i + 2 + offset`. All pointer results wrap by current genome length. If a genome is shorter than two elements, the immediate is obtained by the same circular indexing rule.

### 7.2 Computation tasks

Each organism receives a deterministic pair of eight-bit task inputs at birth and at the start of each new reproductive cycle. Both values come from the run PRNG and are scientific state.

`OUTPUT` gives a reward only when all of the following hold:

1. both current task inputs have been loaded with valid provenance;
2. the most recent computation operation is one of `AND`, `XOR`, `EQU`, or `ADD`;
3. `A` equals that operation's correct result for the current task inputs; and
4. that task has not already been rewarded in the current reproductive cycle.

One `OUTPUT` can reward at most one task. Executing a logic opcode without a valid `OUTPUT` earns no reward. A task can be rewarded at most once per reproductive cycle. Successful reproduction by either pathway begins a new cycle for the reproducing caller, clears its reward set, and assigns it a new task pair. The offspring begins its own cycle with independently generated task inputs.

This mechanism supplies a secondary selectable phenotype. It MUST NOT be described as evidence of open-ended computation.

## 8. Autonomous reproduction: `COPY`

Every execution of `COPY` is an autonomous-reproduction attempt and is audited, whether or not it succeeds.

The operation succeeds only if:

- the caller's reproduction cooldown is zero;
- an empty cardinal cell exists; and
- the caller can pay the operation cost plus offspring endowment without becoming negative.

The destination is the first empty cardinal cell in cyclic direction order beginning at `A modulo 4`. On success:

1. charge the caller the operation cost and offspring endowment;
2. copy the caller genome and apply birth mutation under Section 10.1;
3. create the offspring in the destination with the configured endowment;
4. inherit caller lineage, set caller as parent, and increment generation;
5. set caller reproduction cooldown to the configured value; and
6. record one realised autonomous action for the caller.

A failed attempt records exactly one stable failure code and creates no child. It is not a realised autonomous action.

## 9. Exploitative reproduction: `EXEC_NBR`

Every execution of `EXEC_NBR` is an exploitative-reproduction attempt and incurs the configured attempt cost. If that cost exhausts caller energy, the attempt terminates with `insufficient_caller_energy`.

Beginning at direction `A modulo 4`, inspect the four cardinal cells in cyclic order and select the first occupied donor. If all four cells are empty, the attempt fails with `no_neighbour`. The search does not prefer lineage, genome, energy, or donor suitability.

Configuration schemas 0.1 and 0.2 use `addressed_locus`: the inspected donor locus is
`B modulo donor_genome_length`, and that exact element must be `COPY`. Schema 0.3 requires one
explicit `exploitation.donor_copy_rule`:

- `addressed_locus`: require `COPY` at the exact `B`-addressed donor locus; or
- `cyclic_copy_search`: beginning at that locus, inspect each donor element once in cyclic order
  and accept the first `COPY`; fail with `donor_copy_absent` only if the donor contains none.

Schema 0.4 and the proposed formal engine specification require `cyclic_copy_search` for the
primary construct. `addressed_locus` remains a separately labelled sensitivity and historical
compatibility mode.

Neither policy draws randomness, changes donor selection, or conditions on lineage. Under the
active policy, the operation can succeed only if:

- a donor exists;
- the selected donor satisfies the configured `COPY`-compatibility rule;
- the caller's reproduction cooldown is zero;
- the caller has an empty cardinal destination; and
- the donor can pay the offspring endowment plus exploit levy without becoming negative.

The destination is the first empty cardinal cell in cyclic order beginning immediately after the donor direction. On success:

1. transfer the offspring endowment from donor to child;
2. deduct the exploit levy from the donor;
3. copy and birth-mutate the caller's genome, not the donor's genome;
4. create a child inheriting caller lineage and parentage;
5. set caller reproduction cooldown;
6. record caller benefit, donor cost, and one realised exploitative action for the caller; and
7. kill and record the donor immediately if the transfer leaves it at zero energy.

No arbitrary donor instruction is executed. Exact-locus mismatch records
`donor_locus_not_copy`; a complete cyclic search without `COPY` records `donor_copy_absent`.
A failed attempt records exactly one failure code and creates no child. Failed attempts remain
useful diagnostic behaviour but do not enter the primary realised-strategy numerator.

This is the sole parasitic mechanism in specification 0.1. There is no `KILL` opcode.

## 10. Genome change and horizontal transfer

### 10.1 Birth mutation

Each copied parental locus receives an independent mutation trial at the configured per-locus rate. On a successful trial, choose exactly one configured mutation class by integer-weighted sampling:

- point substitution: replace the locus with a uniformly selected different opcode;
- insertion: insert a uniformly selected opcode adjacent to the locus; or
- deletion: remove the locus.

Mutation events MUST be processed in a declared stable traversal order. Insertions that would exceed maximum length and deletions that would violate minimum length are rejected and counted, not silently changed into another mutation class. Offspring construction MUST be covered by golden fixtures so traversal semantics cannot drift.

Version 0.1 traverses the immutable list of original parental loci from left to right. A point mutation replaces the current original locus. An accepted insertion is placed immediately after its original locus, and inserted elements do not receive a mutation trial in the same birth. An accepted deletion removes the original locus. Earlier accepted changes affect the working genome length used by later boundary checks.

After mutation, successful reproduction assigns a new task to the caller and then a task to the child. Each task draws its first and second inputs in that order. This mutation–caller-task–child-task ordering is part of the deterministic transition contract.

### 10.2 Horizontal transfer: `SPLICE`

Every execution of `SPLICE` is an HGT attempt and incurs the configured attempt cost. If that cost exhausts caller energy, the attempt terminates with `insufficient_caller_energy`. The selected donor is the organism in direction `A modulo 4`.

If a donor exists, draw one Bernoulli trial using the configured HGT-success probability. On success:

1. draw a transfer length uniformly from the configured inclusive chunk-length bounds;
2. choose a donor start locus uniformly and copy the circular contiguous chunk;
3. choose a caller insertion boundary uniformly, including both ends;
4. reject the transfer with a capacity failure if it would exceed maximum genome length;
5. reject it with `insufficient_caller_energy` if the caller cannot pay the full success cost; and
6. otherwise insert the unchanged chunk into the caller genome, charge the success cost, and record the transfer.

The caller's instruction pointer continues to refer to the same pre-insertion instruction when that instruction still exists; the index is adjusted if insertion occurs before it. No lineage change occurs. The donor is not modified or charged in version 0.1 because the transferred entity is information rather than reproductive energy.

HGT opportunity is endogenous: it depends on an organism executing `SPLICE`. The factorial parameter controls conditional success, not a population-wide forced transfer rate. Formal outputs therefore MUST report attempts as well as successes.

## 11. Behavioural measurement state

Each organism maintains 25 circular buckets of 200 ticks, representing a 5,000-tick trailing window at authoritative sample boundaries. A bucket stores at least:

- autonomous reproduction attempts and successes;
- exploitative reproduction attempts and successes;
- HGT attempts and successes;
- rewarded outputs by task;
- energy obtained, transferred, dissipated, and lost through exploitation; and
- failure counts by stable reason code.

The initial state has completed tick zero. Events occurring during tick `t >= 1` enter bucket number `floor((t-1)/200)`. At a sample after completed tick 5,000, for example, the statistic sums events from ticks 1–5,000; at completed tick 5,200 it sums ticks 201–5,200. A circular slot is cleared immediately before it is reused for a new bucket number. New organisms begin with zero counts in the current global bucket.

Normative divergence output is calculated only at configured sample boundaries, which are aligned to bucket boundaries in version 0.1. A UI MAY show an explicitly labelled partial-window preview between samples, but that preview is not formal data.

For organism `i`, let `A_i` be successful autonomous births and `E_i` successful exploitative births in the current trailing window. When `A_i + E_i` meets the configured eligibility threshold:

`p_i = E_i / (A_i + E_i)`

and:

`delta_i = abs(p_i - L_i)`

where `L_i = 0` for host lineage and `L_i = 1` for parasite lineage. Ratios MAY use floating point in exported statistics, but their integer numerators and denominators are authoritative. Decision 0007 sets the formal primary threshold to one realised action after calibration; thresholds five and ten are mandatory sensitivities.

Organisms below the threshold have undefined `p_i` and `delta_i`. They MUST be counted as inactive/insufficient rather than assigned zero.

For categorical summaries:

- `autonomous`: `p_i <= 0.10`;
- `mixed`: `0.10 < p_i < 0.90`;
- `exploitative`: `p_i >= 0.90`; and
- `inactive`: strategy is undefined.

Primary categorical thresholds MUST be accompanied by declared sensitivity thresholds.

### 11.1 Lineage extinction and information degeneracy

Extinction never changes past lineage or behavioural records. If one lineage is absent, eligible
living organisms retain individual `p_i` and `delta_i`, and the living-population `Delta_D`
remains available with explicit lineage composition. The absent lineage's summary is `null`.

Primary `U(F|L)` and `D_info` require both ancestral lineage categories to be represented and
functional entropy to be non-zero. Outputs are `null` with reason `single_lineage_degenerate`
when only one lineage remains, or `zero_functional_entropy` when functional entropy is zero.
These cases MUST NOT be converted to numerical evidence that lineage has lost predictive value.

### 11.2 Spatial structure

Every retained population sample also reports lineage patches and local contact on the same
toroidal Von Neumann topology. A patch is a maximal cardinally connected component of occupied
cells sharing one ancestral lineage. For each lineage, output population, patch count, largest
patch size and proportion, mean patch size, and singleton count.

Edge statistics count each unique undirected toroidal cardinal edge once. They distinguish
host–host, parasite–parasite, host–parasite, and occupied–empty edges, and report the
same-lineage proportion among occupied–occupied edges. Degenerate small dimensions MUST NOT
double-count a wrapped edge. Spatial summaries are observational measurements: they do not by
themselves establish cooperation, collective cognition, colony-level selection, or strategy.

## 12. Event and failure semantics

Each attempted ecological operation produces one terminal result code. Stable minimum codes are:

- `success`;
- `no_neighbour`;
- `no_empty_cell`;
- `cooldown`;
- `insufficient_caller_energy`;
- `insufficient_donor_energy`;
- `donor_locus_not_copy`;
- `donor_copy_absent`;
- `hgt_trial_failed`;
- `genome_capacity`;
- `genome_minimum`; and
- `configuration_invariant`.

`configuration_invariant` indicates an engine defect or invalid restored state and MUST abort a formal run rather than be treated as ordinary ecology.

Birth, death, mutation, HGT, energy, and reward events MUST carry enough identifiers and integer amounts to reconstruct aggregate accounting. Whether full event logs are retained is a runner concern; the counters are mandatory scientific state.

## 13. Initial populations

Ancestor genomes, counts, coordinates or placement procedure, starting energy, and lineage labels come from a versioned seed-population fixture. The engine MUST NOT contain a hidden host or parasite genome.

Initial organisms are materialised in fixture order. Under `shuffled_cells`, the engine applies the normative Fisher–Yates procedure to the row-major list of all cell indices and assigns the first required cells in fixture order. Under `fixed`, every coordinate is explicit and no placement draw occurs.

Configuration and fixture schema 0.2 add `seeded_focal_region`. The fixture declares one focal
ancestor-group index plus a rectangular origin, width, and height. Region coordinates are
enumerated row-major with toroidal wrapping and shuffled once. The first `focal_count` cells
are reserved for that group. Those reserved cells are removed from the row-major world-cell
list; the remaining list is shuffled once and assigned to all non-focal groups in fixture
order. Unused cells inside the rectangle remain eligible for background placement. The
algorithm consults group index, never lineage, and has no effect after tick zero.

Organism identifiers and task-input pairs are then assigned in fixture order using the run
PRNG. Schema 0.1 supports only `shuffled_cells` and `fixed`; schema 0.2 adds the focal-region
algorithm.

At least one ancestral route to `SPLICE` is required in conditions intended to measure HGT without mutation; otherwise an HGT-only control would disable its own mechanism by construction.

## 14. Randomness contract

The implementation MUST choose and version one serialisable 32-bit PRNG algorithm, including seed expansion, output transformation, integer sampling, Bernoulli comparison, and shuffle procedure. `Math.random`, current time, object iteration order, and platform-specific entropy MUST NOT affect scientific state.

PRNG state is part of every checkpoint and scientific state hash. Golden-sequence tests MUST cover raw words, bounded integers, Bernoulli edge cases, and a scheduler shuffle.

## 15. Termination and invalid runs

A run terminates when it reaches its configured completed-tick count, the population becomes extinct, or the engine reports a fatal invariant failure. Extinction is a valid ecological outcome. A fatal invariant failure is a technical failure and MUST NOT be converted into extinction or silently rerun under a different seed.

## 16. Explicit exclusions from engine specification 0.2

The following are outside the first formal instrument:

- `KILL` and predation;
- arbitrary execution or modification of neighbouring genomes;
- runtime self-modification other than `SPLICE` insertion;
- lineage-specific privileges;
- multiple organisms per cell;
- non-spatial or alternative-topology causal comparisons;
- sexual recombination;
- floating-point scientific state; and
- claims of biological species formation based only on divergence; and
- resource diffusion, stochastic resource placement, movement, or lineage-specific uptake.

## 17. Items fixed by calibration rather than by this document

The mechanism is normative; its numerical ecology requires pilot calibration. The following values MUST be frozen in a named formal configuration before data collection:

- world dimensions and ancestor counts;
- all energy values and the maintenance-cost function;
- reproduction cooldown and genome bounds;
- mutation-class weights;
- HGT chunk bounds and costs;
- ancestor genomes and placement;
- computation rewards;
- exogenous-death probability;
- local-resource capacity, initial stock, regeneration and harvest limit; and
- any sensitivity-analysis thresholds.

Calibration runs are development evidence and MUST NOT be mixed with formal experimental runs.
