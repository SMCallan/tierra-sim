import type { ImmutableEngineConfig } from "../config/schema.js";
import {
  EcologicalResultCode,
  MutationClass,
  type EcologicalResultCode as EcologicalResultCodeValue,
  type MutationClass as MutationClassValue,
} from "../domain/events.js";
import type { Xoshiro128StarStar } from "../random/prng.js";

export interface MutationRecord {
  readonly mutation_class: MutationClassValue;
  readonly original_locus: number;
  readonly accepted: boolean;
  readonly result: EcologicalResultCodeValue;
  readonly previous_opcode?: number;
  readonly new_opcode?: number;
}

export interface MutationOutcome {
  readonly genome: number[];
  readonly records: readonly MutationRecord[];
}

function selectMutationClass(
  configuration: ImmutableEngineConfig["reproduction"],
  random: Xoshiro128StarStar,
): MutationClassValue {
  const weights = configuration.mutation_weights;
  const total = weights.point + weights.insertion + weights.deletion;
  const draw = random.uniformInt(total);
  if (draw < weights.point) {
    return MutationClass.Point;
  }
  if (draw < weights.point + weights.insertion) {
    return MutationClass.Insertion;
  }
  return MutationClass.Deletion;
}

function differentOpcode(opcode: number, random: Xoshiro128StarStar): number {
  const draw = random.uniformInt(15);
  return draw >= opcode ? draw + 1 : draw;
}

export function mutateCopiedGenome(
  parentGenome: readonly number[],
  configuration: ImmutableEngineConfig["reproduction"],
  random: Xoshiro128StarStar,
): MutationOutcome {
  const genome = [...parentGenome];
  const records: MutationRecord[] = [];
  let workingIndex = 0;

  for (let originalLocus = 0; originalLocus < parentGenome.length; originalLocus += 1) {
    if (!random.bernoulli(configuration.mutation_probability)) {
      workingIndex += 1;
      continue;
    }

    const mutationClass = selectMutationClass(configuration, random);
    const previousOpcode = genome[workingIndex];
    if (previousOpcode === undefined) {
      throw new Error("configuration_invariant: mutation traversal lost an original locus.");
    }

    switch (mutationClass) {
      case MutationClass.Point: {
        const newOpcode = differentOpcode(previousOpcode, random);
        genome[workingIndex] = newOpcode;
        records.push({
          mutation_class: mutationClass,
          original_locus: originalLocus,
          accepted: true,
          result: EcologicalResultCode.Success,
          previous_opcode: previousOpcode,
          new_opcode: newOpcode,
        });
        workingIndex += 1;
        break;
      }
      case MutationClass.Insertion: {
        if (genome.length >= configuration.max_genome_length) {
          records.push({
            mutation_class: mutationClass,
            original_locus: originalLocus,
            accepted: false,
            result: EcologicalResultCode.GenomeCapacity,
          });
          workingIndex += 1;
          break;
        }
        const newOpcode = random.uniformInt(16);
        genome.splice(workingIndex + 1, 0, newOpcode);
        records.push({
          mutation_class: mutationClass,
          original_locus: originalLocus,
          accepted: true,
          result: EcologicalResultCode.Success,
          new_opcode: newOpcode,
        });
        workingIndex += 2;
        break;
      }
      case MutationClass.Deletion: {
        if (genome.length <= configuration.min_genome_length) {
          records.push({
            mutation_class: mutationClass,
            original_locus: originalLocus,
            accepted: false,
            result: EcologicalResultCode.GenomeMinimum,
            previous_opcode: previousOpcode,
          });
          workingIndex += 1;
          break;
        }
        genome.splice(workingIndex, 1);
        records.push({
          mutation_class: mutationClass,
          original_locus: originalLocus,
          accepted: true,
          result: EcologicalResultCode.Success,
          previous_opcode: previousOpcode,
        });
        break;
      }
    }
  }

  return { genome, records: Object.freeze(records) };
}
