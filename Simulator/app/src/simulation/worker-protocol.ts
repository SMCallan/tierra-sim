import type { CockpitMode } from "./demo.js";
import type { BrowserSnapshot } from "./session.js";

export type SimulationWorkerRequest =
  | {
      readonly type: "initialise";
      readonly mode: CockpitMode;
      readonly seed: number;
      readonly completed_ticks: number;
      readonly world_width: number;
      readonly world_height: number;
    }
  | {
      readonly type: "run";
      readonly ticks_per_update: number;
      readonly pause_on_mixed: boolean;
      readonly pause_on_hgt: boolean;
    }
  | { readonly type: "pause" }
  | { readonly type: "step" };

export type SimulationWorkerResponse =
  | {
      readonly type: "snapshot";
      readonly snapshot: BrowserSnapshot;
      readonly running: boolean;
      readonly pause_reason: string | null;
    }
  | {
      readonly type: "error";
      readonly message: string;
    };
