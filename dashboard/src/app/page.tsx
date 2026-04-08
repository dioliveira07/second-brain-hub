import { hubFetch, StatsOverview, Repo } from "@/lib/hub";
import { FadeIn } from "@/components/reactbits/FadeIn";
import { DashboardLive } from "@/components/DashboardLive";

export default async function HomePage() {
  let stats: StatsOverview = {
    repos_indexed: 0, chunks_total: 0, qdrant_points: 0,
    decisions_captured: 0, notifications_unread: 0,
  };
  let repos: Repo[] = [];

  try {
    [stats, repos] = await Promise.all([
      hubFetch<StatsOverview>("/stats/overview"),
      hubFetch<Repo[]>("/repos"),
    ]);
  } catch {}

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2.5rem", maxWidth: 1200 }}>

      {/* Page header */}
      <FadeIn delay={0}>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
          <div className="label-accent" style={{ marginBottom: "0.2rem" }}>Overview</div>
          <h2 style={{ fontFamily: "var(--mono)", fontSize: "1.6rem", fontWeight: 700, color: "var(--text)", letterSpacing: "-0.02em" }}>
            Dashboard
          </h2>
          <p style={{ fontFamily: "var(--sans)", fontSize: "0.85rem", color: "var(--muted-foreground)" }}>
            Segundo cérebro corporativo — visão em tempo real
          </p>
        </div>
      </FadeIn>

      <DashboardLive initialStats={stats} initialRepos={repos} />
    </div>
  );
}
