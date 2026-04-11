import { hubFetch } from "@/lib/hub";
import type { Repo } from "@/lib/hub";
import { FadeIn } from "@/components/reactbits/FadeIn";
import { GitCommitHorizontal, Clock, Package } from "lucide-react";

// Fetch stack info from graph nodes to enrich the timeline
type GraphNode = {
  id: string; type: string; label: string;
  data: { stack?: { languages?: string[]; frameworks?: string[]; infra?: string[] }; last_indexed_at?: string | null };
};

function timeAgo(iso: string | null): string {
  if (!iso) return "nunca";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(diff / 86400000);
  if (m < 60) return `${m}min atrás`;
  if (h < 24) return `${h}h atrás`;
  if (d < 30) return `${d}d atrás`;
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

function recencyColor(iso: string | null): string {
  if (!iso) return "#5a7a9a";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d <= 1)  return "#22c55e";  // verde — hoje/ontem
  if (d <= 7)  return "#06b6d4";  // cyan — esta semana
  if (d <= 30) return "#a78bfa";  // roxo — este mês
  return "#5a7a9a";               // dim — antigo
}

const TECH_CAT: Record<string, string> = {
  React: "#06b6d4", "Vue.js": "#06b6d4", "Next.js": "#06b6d4", Vite: "#06b6d4",
  "Tailwind CSS": "#06b6d4", Angular: "#06b6d4",
  Python: "#a78bfa", FastAPI: "#f87171", Django: "#f87171", Flask: "#f87171",
  "Node.js": "#a78bfa", TypeScript: "#a78bfa", JavaScript: "#a78bfa",
  PostgreSQL: "#fbbf24", Redis: "#fbbf24", Supabase: "#fbbf24", Qdrant: "#fbbf24",
  MongoDB: "#fbbf24", SQLAlchemy: "#fbbf24",
  Docker: "#fb923c", "Docker Compose": "#fb923c", Kubernetes: "#fb923c",
  Vitest: "#34d399", Jest: "#34d399", pytest: "#34d399", Zod: "#34d399",
  "Anthropic/Claude": "#34d399",
};

export default async function TimelinePage() {
  let repos: Repo[] = [];
  let nodes: GraphNode[] = [];

  try {
    [repos, { nodes }] = await Promise.all([
      hubFetch<Repo[]>("/repos"),
      hubFetch<{ nodes: GraphNode[] }>("/graph/nodes", { revalidate: 60 }),
    ]);
  } catch {}

  // Sort by last activity descending
  repos = [...repos].sort((a, b) => {
    if (!a.last_indexed_at) return 1;
    if (!b.last_indexed_at) return -1;
    return new Date(b.last_indexed_at).getTime() - new Date(a.last_indexed_at).getTime();
  });

  // Group by day
  const groups: { label: string; repos: Repo[] }[] = [];
  for (const repo of repos) {
    const day = repo.last_indexed_at
      ? new Date(repo.last_indexed_at).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })
      : "Sem data";
    const existing = groups.find((g) => g.label === day);
    if (existing) existing.repos.push(repo);
    else groups.push({ label: day, repos: [repo] });
  }

  return (
    <FadeIn from="bottom" duration={400}>
      <div style={{ display: "flex", flexDirection: "column", gap: "2rem", maxWidth: 820 }}>

        {/* Header */}
        <div>
          <div className="label-accent" style={{ marginBottom: "0.5rem" }}>Git Analytics</div>
          <h2 style={{ fontFamily: "var(--mono)", fontSize: "1.6rem", fontWeight: 700, color: "var(--text)", letterSpacing: "-0.02em", marginBottom: "0.35rem" }}>
            Timeline
          </h2>
          <p style={{ fontFamily: "var(--sans)", fontSize: "0.85rem", color: "var(--muted-foreground)" }}>
            Última atividade por repositório — ordenado por push mais recente
          </p>
        </div>

        {/* Counters */}
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          {[
            { label: `${repos.length} repos`,                                       color: "#06b6d4" },
            { label: `${repos.filter(r => { const d = r.last_indexed_at ? Math.floor((Date.now() - new Date(r.last_indexed_at).getTime()) / 86400000) : 999; return d <= 1; }).length} hoje/ontem`, color: "#22c55e" },
            { label: `${repos.filter(r => { const d = r.last_indexed_at ? Math.floor((Date.now() - new Date(r.last_indexed_at).getTime()) / 86400000) : 999; return d > 1 && d <= 7; }).length} esta semana`, color: "#06b6d4" },
          ].map(({ label, color }) => (
            <span key={label} style={{ fontFamily: "var(--mono)", fontSize: "0.7rem", color, background: `${color}11`, border: `1px solid ${color}33`, borderRadius: "var(--r)", padding: "0.25rem 0.7rem", letterSpacing: "0.06em" }}>
              {label}
            </span>
          ))}
        </div>

        {/* Timeline groups */}
        {groups.map((group, gi) => (
          <div key={group.label}>
            {/* Day label */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.75rem" }}>
              <span style={{ fontFamily: "var(--mono)", fontSize: "0.72rem", color: "var(--cyan)", textTransform: "uppercase", letterSpacing: "0.12em" }}>
                {group.label}
              </span>
              <div style={{ flex: 1, height: 1, background: "rgba(6,182,212,0.1)" }} />
            </div>

            {/* Repo cards */}
            <div style={{ paddingLeft: "0.5rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {group.repos.map((repo, ri) => {
                const name     = repo.repo.includes("/") ? repo.repo.split("/")[1] : repo.repo;
                const owner    = repo.repo.includes("/") ? repo.repo.split("/")[0] : "";
                const color    = recencyColor(repo.last_indexed_at);
                const ago      = timeAgo(repo.last_indexed_at);
                const node     = nodes.find((n) => n.id === `repo:${repo.repo}`);
                const stack    = node?.data?.stack;
                const allTech  = [...(stack?.frameworks ?? []), ...(stack?.languages ?? [])].slice(0, 6);
                const isLast   = gi === groups.length - 1 && ri === group.repos.length - 1;

                return (
                  <div key={repo.repo} style={{ display: "flex", gap: "1rem" }}>
                    {/* Dot + line */}
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0, width: 14 }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, boxShadow: `0 0 8px ${color}`, marginTop: "1rem", flexShrink: 0 }} />
                      {!isLast && <div style={{ width: 1, flex: 1, minHeight: "1.5rem", background: "linear-gradient(to bottom, rgba(6,182,212,.15), transparent)", margin: "4px 0" }} />}
                    </div>

                    {/* Card */}
                    <div className="panel" style={{ flex: 1, padding: "0.85rem 1.1rem", marginBottom: "0.25rem" }}>
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "0.75rem" }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.2rem" }}>
                            <GitCommitHorizontal size={11} color={color} />
                            <span style={{ fontFamily: "var(--mono)", fontSize: "0.72rem", color: "var(--dim)", letterSpacing: "0.06em" }}>{owner}</span>
                          </div>
                          <span style={{ fontFamily: "var(--mono)", fontSize: "0.92rem", fontWeight: 600, color: "var(--text)" }}>{name}</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", flexShrink: 0 }}>
                          <Clock size={10} color="var(--dim)" />
                          <span style={{ fontFamily: "var(--mono)", fontSize: "0.7rem", color, letterSpacing: "0.06em" }}>{ago}</span>
                        </div>
                      </div>

                      {allTech.length > 0 && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem", marginTop: "0.6rem" }}>
                          {allTech.map((t) => {
                            const tc = TECH_CAT[t] ?? "#5a7a9a";
                            return (
                              <span key={t} style={{ fontFamily: "var(--mono)", fontSize: "0.68rem", color: tc, background: `${tc}14`, border: `1px solid ${tc}28`, borderRadius: 3, padding: "1px 6px" }}>{t}</span>
                            );
                          })}
                        </div>
                      )}

                      {allTech.length === 0 && (
                        <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", marginTop: "0.5rem" }}>
                          <Package size={10} color="var(--dim)" />
                          <span style={{ fontFamily: "var(--mono)", fontSize: "0.7rem", color: "var(--dim)" }}>stack não detectada</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </FadeIn>
  );
}
