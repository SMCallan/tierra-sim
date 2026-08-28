import { isOpcode, opcodeName } from "@tierra-sim/engine";

import type { BrowserEvent, BrowserOrganism } from "../simulation/session.js";

interface OrganismInspectorProps {
  readonly organism: BrowserOrganism | null;
  readonly maximumEnergy: number;
  readonly events: readonly BrowserEvent[];
}

function number(value: number): string {
  return new Intl.NumberFormat("en-GB").format(value);
}

function nameForOpcode(value: number): string {
  return isOpcode(value) ? opcodeName(value) : "INVALID";
}

export function OrganismInspector({ organism, maximumEnergy, events }: OrganismInspectorProps) {
  if (organism === null) {
    return (
      <aside className="inspector panel" aria-labelledby="inspector-heading">
        <p className="eyebrow">Organism inspector</p>
        <h2 id="inspector-heading">Select a living cell</h2>
        <p className="empty-state-copy">
          Choose an occupied cell to inspect its genome, VM state, energy, ancestry, and
          trailing behaviour.
        </p>
      </aside>
    );
  }

  const state = organism.state;
  const energyWidth = `${Math.min(100, (state.energy / maximumEnergy) * 100)}%`;
  const relevantEvents = events
    .filter((event) => event.participant_ids.includes(state.id))
    .slice(-5)
    .reverse();
  return (
    <aside className="inspector panel" aria-labelledby="inspector-heading">
      <div className="inspector-title-row">
        <div>
          <p className="eyebrow">Organism inspector</p>
          <h2 id="inspector-heading">Organism {state.id}</h2>
        </div>
        <span className={`status-pill status-${organism.functional_class}`}>
          {organism.functional_class}
        </span>
      </div>

      <div className="energy-readout">
        <div className="metric-line">
          <span>Energy</span>
          <strong>{number(state.energy)}</strong>
        </div>
        <div className="energy-track" aria-hidden="true">
          <span style={{ width: energyWidth }} />
        </div>
      </div>

      <dl className="inspector-facts">
        <div>
          <dt>Lineage</dt>
          <dd>{state.lineage}</dd>
        </div>
        <div>
          <dt>Generation</dt>
          <dd>{state.generation}</dd>
        </div>
        <div>
          <dt>Parent</dt>
          <dd>{state.parent_id === null ? "ancestor" : state.parent_id}</dd>
        </div>
        <div>
          <dt>Age</dt>
          <dd>{number(state.age_ticks)} ticks</dd>
        </div>
        <div>
          <dt>Position</dt>
          <dd>
            {state.coordinate.x}, {state.coordinate.y}
          </dd>
        </div>
        <div>
          <dt>Cooldown</dt>
          <dd>{state.reproduction_cooldown}</dd>
        </div>
      </dl>

      <section className="inspector-section" aria-labelledby="vm-heading">
        <h3 id="vm-heading">Virtual machine</h3>
        <div className="register-row">
          <span>A <strong>{state.vm.register_a}</strong></span>
          <span>B <strong>{state.vm.register_b}</strong></span>
          <span>Flag <strong>{state.vm.comparison_flag}</strong></span>
          <span>IP <strong>{state.vm.instruction_pointer}</strong></span>
        </div>
        <p className="task-line">
          Task {state.vm.task.id}: {state.vm.task.input_a}, {state.vm.task.input_b}
        </p>
      </section>

      <section className="inspector-section" aria-labelledby="genome-heading">
        <div className="metric-line">
          <h3 id="genome-heading">Genome</h3>
          <span>{state.genome.length} loci</span>
        </div>
        <div className="genome-strip">
          {state.genome.map((opcode, index) => (
            <code
              className={`genome-locus${index === state.vm.instruction_pointer ? " is-current" : ""}`}
              aria-label={`Locus ${index}: ${nameForOpcode(opcode)}${index === state.vm.instruction_pointer ? ", current instruction" : ""}`}
              key={`${index}-${opcode}`}
            >
              {opcode.toString(16).toUpperCase()}
            </code>
          ))}
        </div>
        <p className="genome-current">
          Next: {nameForOpcode(state.genome[state.vm.instruction_pointer] ?? 0)}
        </p>
      </section>

      <section className="inspector-section" aria-labelledby="behaviour-heading">
        <div className="metric-line">
          <h3 id="behaviour-heading">Realised behaviour</h3>
          <span>{organism.informative_actions} informative</span>
        </div>
        <dl className="behaviour-grid">
          <div>
            <dt>Autonomous births</dt>
            <dd>{organism.autonomous_successes}</dd>
          </div>
          <div>
            <dt>Exploitative births</dt>
            <dd>{organism.exploitative_successes}</dd>
          </div>
          <div>
            <dt>HGT</dt>
            <dd>{organism.hgt_successes}/{organism.hgt_attempts}</dd>
          </div>
          <div>
            <dt>Exploitative tendency</dt>
            <dd>{organism.exploitative_tendency === null ? "undefined" : organism.exploitative_tendency.toFixed(3)}</dd>
          </div>
          <div>
            <dt>Lineage divergence</dt>
            <dd>{organism.divergence === null ? "undefined" : organism.divergence.toFixed(3)}</dd>
          </div>
        </dl>
      </section>

      <section className="inspector-section" aria-labelledby="trace-heading">
        <div className="metric-line">
          <h3 id="trace-heading">Recent trace</h3>
          <span>{relevantEvents.length} retained</span>
        </div>
        {relevantEvents.length === 0 ? (
          <p className="trace-empty">No retained notable events involve this living organism.</p>
        ) : (
          <ol className="organism-trace">
            {relevantEvents.map((event) => (
              <li key={event.sequence}>
                <span>t{event.tick}</span>
                {event.summary}
              </li>
            ))}
          </ol>
        )}
      </section>
    </aside>
  );
}
