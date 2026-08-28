import { createHash } from "node:crypto";

import type { Sha256Function } from "@tierra-sim/engine";

export const NODE_SHA256_IMPLEMENTATION = "node:crypto" as const;

/** Native Node implementation of the engine's normative UTF-8 SHA-256 contract. */
export const nodeSha256: Sha256Function = (value) =>
  createHash("sha256").update(value, "utf8").digest("hex");
