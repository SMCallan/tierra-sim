# Decision 0003: Adopt a Minimal Research-Oriented 16-Opcode VM

- **Status:** Accepted for specification
- **Date:** 18 July 2026
- **Affects:** Engine specification, seed genomes, computation rewards

## Context

The MPR and frozen simulator use different instruction sets. The frozen set also introduces self-modification and neighbour reads that are not required by the primary experiment. The MPR set introduces `KILL`, allocation/splitting, and direct logic operations.

## Decision

Use exactly sixteen four-bit opcodes:

1. `NOP`
2. `INPUT_A`
3. `INPUT_B`
4. `OUTPUT`
5. `AND`
6. `XOR`
7. `EQU`
8. `ADD`
9. `CMP`
10. `JZ`
11. `JMP`
12. `COPY`
13. `SENSE`
14. `SWAP`
15. `EXEC_NBR`
16. `SPLICE`

`JZ` and `JMP` consume the following four-bit genome element as a signed immediate in the range −8 to +7. All other elements are executed as opcodes when reached.

Computation rewards are granted only when `OUTPUT` submits a correct result for deterministically supplied task inputs. Merely executing a logic opcode is not rewarded.

## Consequences

- Every mutation maps to a valid opcode.
- Mutation and SPLICE are the only mechanisms that alter genome content; runtime self-modification is excluded as a confounder.
- Atomic COPY keeps the primary experiment tractable.
- Computation is a selectable ecological task, not evidence of open-ended complexity by itself.
- Exact seed genomes must be calibrated and versioned after the VM tests exist.
