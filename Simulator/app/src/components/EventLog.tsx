import type { BrowserEvent } from "../simulation/session.js";

interface EventLogProps {
  readonly events: readonly BrowserEvent[];
  readonly livingIds: ReadonlySet<number>;
  readonly selectedId: number | null;
  readonly onSelect: (organismId: number) => void;
}

function selectableParticipant(
  event: BrowserEvent,
  livingIds: ReadonlySet<number>,
): number | null {
  return event.participant_ids.find((organismId) => livingIds.has(organismId)) ?? null;
}

export function EventLog({ events, livingIds, selectedId, onSelect }: EventLogProps) {
  const discoveries = events.filter((event) => event.discovery).reverse();
  const recent = events
    .filter((event) => !event.discovery)
    .reverse()
    .slice(0, Math.max(0, 48 - discoveries.length));
  const ordered = [...discoveries, ...recent];
  return (
    <section className="event-panel panel" aria-labelledby="event-log-heading">
      <div className="section-heading-row event-heading-row">
        <div>
          <p className="eyebrow">Presentation-only observations</p>
          <h2 id="event-log-heading">Discovery log</h2>
        </div>
        <span className="event-count">{events.length} retained</span>
      </div>
      <p className="event-boundary-copy">
        These summaries never enter scientific state or alter the state hash.
      </p>
      <ol className="event-list">
        {ordered.map((event) => {
          const participant = selectableParticipant(event, livingIds);
          const selected = participant !== null && participant === selectedId;
          return (
            <li className={`event-row event-${event.category}${event.discovery ? " is-discovery" : ""}`} key={event.sequence}>
              <button
                type="button"
                disabled={participant === null}
                aria-pressed={selected}
                onClick={() => participant === null ? undefined : onSelect(participant)}
              >
                <span className="event-meta">
                  <span>tick {event.tick}</span>
                  <span>{event.discovery ? "discovery" : event.category}</span>
                </span>
                <span className="event-summary">{event.summary}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
