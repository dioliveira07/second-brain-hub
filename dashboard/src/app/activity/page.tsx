import { ActivityClient } from "@/components/ActivityClient";
import { hubFetch } from "@/lib/hub";

type ActivityData = {
  weeks: string[];
  repos: string[];
  data:  Array<Record<string, string | number>>;
};

export default async function ActivityPage() {
  let activity: ActivityData = { weeks: [], repos: [], data: [] };
  try { activity = await hubFetch<ActivityData>("/stats/activity"); } catch {}

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem", maxWidth: 1000 }}>
      <div>
        <div className="label-accent" style={{ marginBottom: "0.5rem" }}>Git Analytics</div>
        <h2 style={{ fontFamily: "var(--mono)", fontSize: "1.6rem", fontWeight: 700, color: "var(--text)", letterSpacing: "-0.02em", marginBottom: "0.35rem" }}>
          Atividade
        </h2>
        <p style={{ fontFamily: "var(--sans)", fontSize: "0.85rem", color: "var(--muted)" }}>
          Histórico de PRs por repositório e semana
        </p>
      </div>
      <ActivityClient activity={activity} />
    </div>
  );
}
