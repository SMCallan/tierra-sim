import { decodeSignedNibble, isOpcode, Opcode, type Opcode as OpcodeValue } from "./opcodes.js";

export const ComputationOperation = {
  And: "and",
  Xor: "xor",
  Equ: "equ",
  Add: "add",
} as const;

export type ComputationOperation =
  (typeof ComputationOperation)[keyof typeof ComputationOperation];

export type ComparisonFlag = -1 | 0 | 1;

export interface ComputationTask {
  readonly id: number;
  readonly input_a: number;
  readonly input_b: number;
}

export interface ComputationRewardConfig {
  readonly and: number;
  readonly xor: number;
  readonly equ: number;
  readonly add: number;
}

type InputKind = "task_input_a" | "task_input_b" | "computed";

export interface RegisterProvenance {
  readonly kind: InputKind;
  readonly task_id: number;
}

export interface LastComputation {
  readonly operation: ComputationOperation;
  readonly task_id: number;
  readonly result: number;
  readonly used_current_task_inputs: boolean;
}

export interface VmState {
  instruction_pointer: number;
  register_a: number;
  register_b: number;
  comparison_flag: ComparisonFlag;
  provenance_a: RegisterProvenance | null;
  provenance_b: RegisterProvenance | null;
  last_computation: LastComputation | null;
  rewarded_task_mask: number;
  task: ComputationTask;
}

export interface VmExecutionContext {
  readonly occupied_neighbours: number;
  readonly empty_neighbours: number;
  readonly computation_rewards: ComputationRewardConfig;
}

export type VmEffect =
  | { readonly kind: "none" }
  | { readonly kind: "copy_request" }
  | { readonly kind: "exec_nbr_request" }
  | { readonly kind: "splice_request" }
  | {
      readonly kind: "output";
      readonly operation: ComputationOperation | null;
      readonly correct: boolean;
      readonly rewarded: boolean;
      readonly reward_energy: number;
    };

export interface VmStepResult {
  readonly state: VmState;
  readonly executed_opcode: OpcodeValue;
  readonly effect: VmEffect;
}

const taskBits: Readonly<Record<ComputationOperation, number>> = Object.freeze({
  [ComputationOperation.And]: 1 << 0,
  [ComputationOperation.Xor]: 1 << 1,
  [ComputationOperation.Equ]: 1 << 2,
  [ComputationOperation.Add]: 1 << 3,
});

function assertUint8(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0 || value > 0xff) {
    throw new RangeError(`${name} must be an unsigned eight-bit integer.`);
  }
}

function assertTask(task: ComputationTask): void {
  if (!Number.isSafeInteger(task.id) || task.id < 0) {
    throw new RangeError("Task identifier must be a non-negative safe integer.");
  }
  assertUint8(task.input_a, "task.input_a");
  assertUint8(task.input_b, "task.input_b");
}

function wrapIndex(index: number, length: number): number {
  return ((index % length) + length) % length;
}

function applyOperation(operation: ComputationOperation, left: number, right: number): number {
  switch (operation) {
    case ComputationOperation.And:
      return (left & right) >>> 0;
    case ComputationOperation.Xor:
      return (left ^ right) >>> 0;
    case ComputationOperation.Equ:
      return (~(left ^ right) & 0xff) >>> 0;
    case ComputationOperation.Add:
      return (left + right) & 0xff;
  }
}

function operationForOpcode(opcode: OpcodeValue): ComputationOperation | null {
  switch (opcode) {
    case Opcode.AND:
      return ComputationOperation.And;
    case Opcode.XOR:
      return ComputationOperation.Xor;
    case Opcode.EQU:
      return ComputationOperation.Equ;
    case Opcode.ADD:
      return ComputationOperation.Add;
    default:
      return null;
  }
}

function hasCurrentTaskInputs(state: VmState): boolean {
  const provenances = [state.provenance_a, state.provenance_b];
  return (
    provenances.every((item) => item?.task_id === state.task.id) &&
    provenances.some((item) => item?.kind === "task_input_a") &&
    provenances.some((item) => item?.kind === "task_input_b")
  );
}

function cloneState(state: Readonly<VmState>): VmState {
  return {
    instruction_pointer: state.instruction_pointer,
    register_a: state.register_a,
    register_b: state.register_b,
    comparison_flag: state.comparison_flag,
    provenance_a: state.provenance_a === null ? null : { ...state.provenance_a },
    provenance_b: state.provenance_b === null ? null : { ...state.provenance_b },
    last_computation: state.last_computation === null ? null : { ...state.last_computation },
    rewarded_task_mask: state.rewarded_task_mask,
    task: { ...state.task },
  };
}

export function createVmState(task: ComputationTask): VmState {
  assertTask(task);
  return {
    instruction_pointer: 0,
    register_a: 0,
    register_b: 0,
    comparison_flag: 0,
    provenance_a: null,
    provenance_b: null,
    last_computation: null,
    rewarded_task_mask: 0,
    task: { ...task },
  };
}

export function resetReproductiveCycle(state: Readonly<VmState>, task: ComputationTask): VmState {
  assertTask(task);
  return {
    ...cloneState(state),
    provenance_a: null,
    provenance_b: null,
    last_computation: null,
    rewarded_task_mask: 0,
    task: { ...task },
  };
}

export function executeVmInstruction(
  currentState: Readonly<VmState>,
  genome: readonly number[],
  context: VmExecutionContext,
): VmStepResult {
  if (genome.length === 0) {
    throw new RangeError("Cannot execute an empty genome.");
  }
  assertUint8(currentState.register_a, "register_a");
  assertUint8(currentState.register_b, "register_b");
  assertTask(currentState.task);

  const state = cloneState(currentState);
  const currentPointer = wrapIndex(state.instruction_pointer, genome.length);
  const opcode = genome[currentPointer];
  if (opcode === undefined || !isOpcode(opcode)) {
    throw new RangeError(`Genome element ${currentPointer} is not a valid opcode.`);
  }

  state.instruction_pointer = wrapIndex(currentPointer + 1, genome.length);
  let effect: VmEffect = { kind: "none" };

  const computationOperation = operationForOpcode(opcode);
  if (computationOperation !== null) {
    const result = applyOperation(computationOperation, state.register_a, state.register_b);
    state.last_computation = {
      operation: computationOperation,
      task_id: state.task.id,
      result,
      used_current_task_inputs: hasCurrentTaskInputs(state),
    };
    state.register_a = result;
    state.provenance_a = { kind: "computed", task_id: state.task.id };
    return { state, executed_opcode: opcode, effect };
  }

  switch (opcode) {
    case Opcode.NOP:
      break;
    case Opcode.INPUT_A:
      state.register_a = state.task.input_a;
      state.provenance_a = { kind: "task_input_a", task_id: state.task.id };
      state.last_computation = null;
      break;
    case Opcode.INPUT_B:
      state.register_b = state.task.input_b;
      state.provenance_b = { kind: "task_input_b", task_id: state.task.id };
      state.last_computation = null;
      break;
    case Opcode.OUTPUT: {
      const computation = state.last_computation;
      const operation = computation?.operation ?? null;
      const expected =
        operation === null
          ? null
          : applyOperation(operation, state.task.input_a, state.task.input_b);
      const correct =
        computation !== null &&
        computation.task_id === state.task.id &&
        computation.used_current_task_inputs &&
        computation.result === state.register_a &&
        expected === state.register_a;
      const taskBit = operation === null ? 0 : taskBits[operation];
      const alreadyRewarded = (state.rewarded_task_mask & taskBit) !== 0;
      const rewarded = correct && !alreadyRewarded;
      const rewardEnergy = rewarded && operation !== null ? context.computation_rewards[operation] : 0;
      if (rewarded) {
        state.rewarded_task_mask |= taskBit;
      }
      effect = {
        kind: "output",
        operation,
        correct,
        rewarded,
        reward_energy: rewardEnergy,
      };
      break;
    }
    case Opcode.CMP:
      state.comparison_flag =
        state.register_a < state.register_b ? -1 : state.register_a > state.register_b ? 1 : 0;
      break;
    case Opcode.JZ:
    case Opcode.JMP: {
      const immediateIndex = wrapIndex(currentPointer + 1, genome.length);
      const immediate = genome[immediateIndex];
      if (immediate === undefined || !isOpcode(immediate)) {
        throw new RangeError(`Genome element ${immediateIndex} is not a valid jump immediate.`);
      }
      const fallThrough = currentPointer + 2;
      const isTaken = opcode === Opcode.JMP || state.comparison_flag === 0;
      state.instruction_pointer = wrapIndex(
        isTaken ? fallThrough + decodeSignedNibble(immediate) : fallThrough,
        genome.length,
      );
      break;
    }
    case Opcode.COPY:
      effect = { kind: "copy_request" };
      break;
    case Opcode.SENSE:
      if (
        !Number.isInteger(context.occupied_neighbours) ||
        !Number.isInteger(context.empty_neighbours) ||
        context.occupied_neighbours < 0 ||
        context.empty_neighbours < 0 ||
        context.occupied_neighbours + context.empty_neighbours !== 4
      ) {
        throw new RangeError("SENSE context must describe exactly four cardinal neighbours.");
      }
      state.register_a = context.occupied_neighbours;
      state.register_b = context.empty_neighbours;
      state.provenance_a = null;
      state.provenance_b = null;
      state.last_computation = null;
      break;
    case Opcode.SWAP: {
      [state.register_a, state.register_b] = [state.register_b, state.register_a];
      [state.provenance_a, state.provenance_b] = [state.provenance_b, state.provenance_a];
      break;
    }
    case Opcode.EXEC_NBR:
      effect = { kind: "exec_nbr_request" };
      break;
    case Opcode.SPLICE:
      effect = { kind: "splice_request" };
      break;
  }

  return { state, executed_opcode: opcode, effect };
}
