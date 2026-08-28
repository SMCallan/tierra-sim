import type { EngineEvent } from "../domain/events.js";

export type TerminalReason = "completed" | "extinction";

export interface TickReport {
  readonly tick: number;
  readonly activation_order: readonly number[];
  readonly events: readonly EngineEvent[];
  readonly population_size: number;
  readonly terminal_reason: TerminalReason | null;
}
