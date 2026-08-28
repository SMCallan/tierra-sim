/// <reference lib="webworker" />

import { FunctionalClass } from "@tierra-sim/engine";

import { createCockpitSession } from "./demo.js";
import type { BrowserSimulationSession, BrowserSnapshot } from "./session.js";
import type {
  SimulationWorkerRequest,
  SimulationWorkerResponse,
} from "./worker-protocol.js";

const worker = self as DedicatedWorkerGlobalScope;

let session: BrowserSimulationSession | null = null;
let currentSnapshot: BrowserSnapshot | null = null;
let running = false;
let loopGeneration = 0;

function respond(response: SimulationWorkerResponse): void {
  worker.postMessage(response);
}

function publish(pauseReason: string | null = null): void {
  if (currentSnapshot === null) {
    return;
  }
  respond({
    type: "snapshot",
    snapshot: currentSnapshot,
    running,
    pause_reason: pauseReason,
  });
}

function stop(pauseReason: string | null = null): void {
  running = false;
  loopGeneration += 1;
  publish(pauseReason);
}

function startRun(request: Extract<SimulationWorkerRequest, { type: "run" }>): void {
  if (session === null || currentSnapshot === null || currentSnapshot.terminal_reason !== null) {
    return;
  }
  running = true;
  loopGeneration += 1;
  const generation = loopGeneration;

  const advance = () => {
    if (!running || generation !== loopGeneration || session === null || currentSnapshot === null) {
      return;
    }
    const previous = currentSnapshot;
    const triggerSensitive = request.pause_on_mixed || request.pause_on_hgt;
    currentSnapshot = session.step(triggerSensitive ? 1 : request.ticks_per_update);

    const mixedAppeared = request.pause_on_mixed &&
      previous.functional_counts[FunctionalClass.Mixed] === 0 &&
      currentSnapshot.functional_counts[FunctionalClass.Mixed] > 0;
    const hgtSucceeded = request.pause_on_hgt &&
      previous.counters.hgt_successes === 0 &&
      currentSnapshot.counters.hgt_successes > 0;

    if (mixedAppeared || hgtSucceeded) {
      stop(mixedAppeared
        ? `Mixed realised behaviour first appeared at tick ${currentSnapshot.completed_tick}.`
        : `The first successful HGT transition occurred at tick ${currentSnapshot.completed_tick}.`);
      return;
    }
    if (currentSnapshot.terminal_reason !== null) {
      stop();
      return;
    }
    publish();
    setTimeout(advance, 0);
  };

  publish();
  setTimeout(advance, 0);
}

worker.onmessage = (event: MessageEvent<SimulationWorkerRequest>) => {
  try {
    const request = event.data;
    switch (request.type) {
      case "initialise":
        running = false;
        loopGeneration += 1;
        session = createCockpitSession(request.mode, {
          seed: request.seed,
          completed_ticks: request.completed_ticks,
          world_width: request.world_width,
          world_height: request.world_height,
        });
        currentSnapshot = session.snapshot();
        publish();
        return;
      case "run":
        startRun(request);
        return;
      case "pause":
        stop();
        return;
      case "step":
        running = false;
        loopGeneration += 1;
        if (session !== null && session.terminalReason === null) {
          currentSnapshot = session.step(1);
        }
        publish();
        return;
    }
  } catch (caught) {
    running = false;
    loopGeneration += 1;
    respond({
      type: "error",
      message: caught instanceof Error ? caught.message : String(caught),
    });
  }
};
