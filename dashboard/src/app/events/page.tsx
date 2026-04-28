import { cerebroFetch, EventItem } from "@/lib/hub";
import { EventsTimeline } from "@/components/EventsTimeline";

export default async function EventsPage() {
  let events: EventItem[] = [];
  try {
    events = await cerebroFetch<EventItem[]>("/events?limit=200");
  } catch {}

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem", maxWidth: 1100 }}>
      <div>
        <div className="label-accent" style={{ marginBottom: "0.5rem" }}>Timeline Unificada</div>
        <h1 style={{ fontFamily: "'Fira Code', monospace", color: "#06b6d4", fontSize: "1.4rem", margin: 0 }}>
          ◈ EVENTS — {events.length} recentes
        </h1>
      </div>
      <EventsTimeline initial={events} />
    </div>
  );
}
