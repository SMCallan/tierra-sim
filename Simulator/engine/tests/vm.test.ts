import { describe, expect, it } from "vitest";

import {
  ComputationOperation,
  createVmState,
  executeVmInstruction,
  resetReproductiveCycle,
  type VmExecutionContext,
  type VmState,
} from "../src/vm/machine.js";
import {
  decodeSignedNibble,
  Opcode,
  opcodeName,
  validateGenome,
} from "../src/vm/opcodes.js";

const context: VmExecutionContext = {
  occupied_neighbours: 1,
  empty_neighbours: 3,
  computation_rewards: {
    and: 11,
    xor: 12,
    equ: 13,
    add: 14,
  },
};

function runGenome(genome: readonly number[], steps: number): { state: VmState; effects: unknown[] } {
  let state = createVmState({ id: 4, input_a: 12, input_b: 10 });
  const effects: unknown[] = [];
  for (let index = 0; index < steps; index += 1) {
    const result = executeVmInstruction(state, genome, context);
    state = result.state;
    effects.push(result.effect);
  }
  return { state, effects };
}

describe("opcode contract", () => {
  it("maps all sixteen nibbles to the normative mnemonic order", () => {
    expect(Array.from({ length: 16 }, (_, opcode) => opcodeName(opcode as 0))).toEqual([
      "NOP",
      "INPUT_A",
      "INPUT_B",
      "OUTPUT",
      "AND",
      "XOR",
      "EQU",
      "ADD",
      "CMP",
      "JZ",
      "JMP",
      "COPY",
      "SENSE",
      "SWAP",
      "EXEC_NBR",
      "SPLICE",
    ]);
  });

  it("decodes the complete signed-nibble range", () => {
    expect(Array.from({ length: 16 }, (_, value) => decodeSignedNibble(value))).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, -8, -7, -6, -5, -4, -3, -2, -1,
    ]);
  });

  it("rejects empty genomes and values outside four bits", () => {
    expect(() => validateGenome([])).toThrow(/at least one/i);
    expect(() => validateGenome([Opcode.NOP, 16])).toThrow(/not a four-bit value/i);
  });

  it("executes every opcode value through the single VM dispatch", () => {
    for (let opcode = 0; opcode <= 0xf; opcode += 1) {
      const state = createVmState({ id: opcode, input_a: 1, input_b: 2 });
      const result = executeVmInstruction(state, [opcode, Opcode.NOP], context);
      expect(result.executed_opcode).toBe(opcode);
    }
  });
});

describe("computation and rewards", () => {
  it.each([
    [Opcode.AND, ComputationOperation.And, 8, 11],
    [Opcode.XOR, ComputationOperation.Xor, 6, 12],
    [Opcode.EQU, ComputationOperation.Equ, 249, 13],
    [Opcode.ADD, ComputationOperation.Add, 22, 14],
  ] as const)("rewards a traced %s computation only on OUTPUT", (opcode, operation, expected, reward) => {
    const { state, effects } = runGenome([Opcode.INPUT_A, Opcode.INPUT_B, opcode, Opcode.OUTPUT], 4);

    expect(state.register_a).toBe(expected);
    expect(effects.slice(0, 3)).toEqual([{ kind: "none" }, { kind: "none" }, { kind: "none" }]);
    expect(effects[3]).toEqual({
      kind: "output",
      operation,
      correct: true,
      rewarded: true,
      reward_energy: reward,
    });
  });

  it("does not reward correct-looking register contents without input provenance", () => {
    const state = createVmState({ id: 4, input_a: 12, input_b: 10 });
    state.register_a = 12;
    state.register_b = 10;
    const operation = executeVmInstruction(state, [Opcode.AND, Opcode.OUTPUT], context);
    const output = executeVmInstruction(operation.state, [Opcode.AND, Opcode.OUTPUT], context);

    expect(output.effect).toEqual({
      kind: "output",
      operation: ComputationOperation.And,
      correct: false,
      rewarded: false,
      reward_energy: 0,
    });
  });

  it("rewards a task at most once in a reproductive cycle", () => {
    const { effects } = runGenome(
      [Opcode.INPUT_A, Opcode.INPUT_B, Opcode.AND, Opcode.OUTPUT, Opcode.OUTPUT],
      5,
    );

    expect(effects[3]).toMatchObject({ correct: true, rewarded: true, reward_energy: 11 });
    expect(effects[4]).toMatchObject({ correct: true, rewarded: false, reward_energy: 0 });
  });

  it("clears task provenance and rewards for a new reproductive cycle", () => {
    const { state } = runGenome([Opcode.INPUT_A, Opcode.INPUT_B, Opcode.AND, Opcode.OUTPUT], 4);
    const reset = resetReproductiveCycle(state, { id: 5, input_a: 2, input_b: 3 });

    expect(reset.task).toEqual({ id: 5, input_a: 2, input_b: 3 });
    expect(reset.rewarded_task_mask).toBe(0);
    expect(reset.provenance_a).toBeNull();
    expect(reset.provenance_b).toBeNull();
    expect(reset.last_computation).toBeNull();
  });
});

describe("control flow and ecological requests", () => {
  it("uses fall-through-relative signed jumps and consumes the immediate", () => {
    const state = createVmState({ id: 0, input_a: 0, input_b: 0 });

    const backward = executeVmInstruction(state, [Opcode.JMP, 0xf, Opcode.NOP], context);
    expect(backward.state.instruction_pointer).toBe(1);

    const notTakenState = { ...state, comparison_flag: 1 as const };
    const notTaken = executeVmInstruction(notTakenState, [Opcode.JZ, 0x1, Opcode.NOP, Opcode.NOP], context);
    expect(notTaken.state.instruction_pointer).toBe(2);

    const taken = executeVmInstruction(state, [Opcode.JZ, 0x1, Opcode.NOP, Opcode.NOP], context);
    expect(taken.state.instruction_pointer).toBe(3);
  });

  it("reads a circular immediate from a one-element genome", () => {
    const state = createVmState({ id: 0, input_a: 0, input_b: 0 });
    const result = executeVmInstruction(state, [Opcode.JMP], context);
    expect(result.state.instruction_pointer).toBe(0);
  });

  it("compares unsigned registers and senses exactly four neighbours", () => {
    const state = createVmState({ id: 0, input_a: 0, input_b: 0 });
    state.register_a = 3;
    state.register_b = 7;
    const compared = executeVmInstruction(state, [Opcode.CMP], context);
    const sensed = executeVmInstruction(compared.state, [Opcode.SENSE], context);

    expect(compared.state.comparison_flag).toBe(-1);
    expect(sensed.state.register_a).toBe(1);
    expect(sensed.state.register_b).toBe(3);
    expect(sensed.state.provenance_a).toBeNull();
    expect(() =>
      executeVmInstruction(state, [Opcode.SENSE], { ...context, empty_neighbours: 2 }),
    ).toThrow(/exactly four/i);
  });

  it("swaps registers and their provenance without mutating the input state", () => {
    const loadedA = executeVmInstruction(
      createVmState({ id: 0, input_a: 12, input_b: 10 }),
      [Opcode.INPUT_A, Opcode.INPUT_B, Opcode.SWAP],
      context,
    );
    const loadedB = executeVmInstruction(loadedA.state, [Opcode.INPUT_A, Opcode.INPUT_B, Opcode.SWAP], context);
    const beforeSwap = loadedB.state;
    const swapped = executeVmInstruction(beforeSwap, [Opcode.INPUT_A, Opcode.INPUT_B, Opcode.SWAP], context);

    expect(beforeSwap.register_a).toBe(12);
    expect(beforeSwap.register_b).toBe(10);
    expect(swapped.state.register_a).toBe(10);
    expect(swapped.state.register_b).toBe(12);
    expect(swapped.state.provenance_a?.kind).toBe("task_input_b");
    expect(swapped.state.provenance_b?.kind).toBe("task_input_a");
    expect(beforeSwap.register_a).toBe(12);
  });

  it.each([
    [Opcode.COPY, "copy_request"],
    [Opcode.EXEC_NBR, "exec_nbr_request"],
    [Opcode.SPLICE, "splice_request"],
  ] as const)("returns %s as a world-level request", (opcode, effectKind) => {
    const state = createVmState({ id: 0, input_a: 0, input_b: 0 });
    expect(executeVmInstruction(state, [opcode], context).effect).toEqual({ kind: effectKind });
  });
});
