export const Opcode = {
  NOP: 0x0,
  INPUT_A: 0x1,
  INPUT_B: 0x2,
  OUTPUT: 0x3,
  AND: 0x4,
  XOR: 0x5,
  EQU: 0x6,
  ADD: 0x7,
  CMP: 0x8,
  JZ: 0x9,
  JMP: 0xa,
  COPY: 0xb,
  SENSE: 0xc,
  SWAP: 0xd,
  EXEC_NBR: 0xe,
  SPLICE: 0xf,
} as const;

export type Opcode = (typeof Opcode)[keyof typeof Opcode];

const opcodeNames = Object.freeze([
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
] as const);

export function isOpcode(value: number): value is Opcode {
  return Number.isInteger(value) && value >= 0 && value <= 0xf;
}

export function opcodeName(opcode: Opcode): (typeof opcodeNames)[Opcode] {
  return opcodeNames[opcode];
}

export function decodeSignedNibble(value: number): number {
  if (!isOpcode(value)) {
    throw new RangeError("Signed immediate must be a four-bit genome element.");
  }
  return value <= 7 ? value : value - 16;
}

export function validateGenome(genome: readonly number[]): void {
  if (genome.length === 0) {
    throw new RangeError("Genome must contain at least one element.");
  }
  genome.forEach((element, index) => {
    if (!isOpcode(element)) {
      throw new RangeError(`Genome element ${index} is not a four-bit value.`);
    }
  });
}
