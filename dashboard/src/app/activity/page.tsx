import { hubFetch } from "@/lib/hub";
import type { Repo } from "@/lib/hub";
import { FadeIn } from "@/components/reactbits/FadeIn";
import { Activity, Clock, TrendingUp } from "lucide-react";

function daysSince(iso: string | null): number {
  if (!iso) return 9999;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

interface Band { key: string; label: string; color: string; bg: string; }

function recencyBand(days: number): Band {
  if (days <= 1)  return { key: "hoje",        label: "hoje",        color: "#22c55e", bg: "rgba(34,197,94,.12)"   };
  if (days <= 7)  return { key: "esta semana", label: "esta semana", color: "#06b6d4", bg: "rgba(6,182,212,.12)"   };
  if (days <= 30) return { key: "este mês",    label: "este mês",    color: "#a78bfa", bg: "rgba(167,139,250,.1)"  };
  if (days <= 90) return { key: "3 meses",     label: "3 meses",     color: "#fbbf24", bg: "rgba(251,191,36,.08)"  };
  return              { key: "inativo",        label: "inativo",     color: "#5a7a9a", bg: "rgba(90,122,154,.06)"  };
}

const BANDS: { key: string; color: string }[] = [
  { key: "hoje",        color: "#22c55e" },
  { key: "esta semana", color: "#06b6d4" },
  { key: "este mês",   color: "#a78bfa" },
  { key: "3 meses",    color: "#fbbf24" },
  { key: "inativo",    color: "#5a7a9a" },
];

export default async function ActivityPage() {
  let repos: Repo[] = [];
  try { repos = await hubFetch<Repo[]>("/repos"); } catch {}

  repos = [...repos].sort((a, b) => daysSince(a.last_indexed_at) - daysSince(b.last_indexed_at));

  const withBand = repos.map((r) => ({
    ...r,
    days: daysSince(r.last_indexed_at),
    band: recencyBand(daysSince(r.last_indexed_at)),
    name: r.repo.includes("/") ? r.repo.split("/")[1] : r.repo,
    owner: r.repo.includes("/") ? r.repo.split("/")[0] : "",
  }));

  const grouped = BANDS.map((b) => ({
    ...b,
    repos: withBand.filter((r) => r.band.key === b.key),
  })).filter((g) => g.repos.length > 0);

  return (
    <FadeIn from="bottom" duration={400}>
      <div style={{ display: "flex", flexDirection: "column", gap: "2rem", maxWidth: 1000 }}>

        {/* Header */}
        <div>
          <div className="label-accent" style={{ marginBottom: "0.5rem" }}>Git Analytics</div>
          <h2 style={{ fontFamily: "var(--mono)", fontSize: "1.6rem", fontWeight: 700, color: "var(--text)", letterSpacing: "-0.02em", marginBottom: "0.35rem" }}>
            Atividade
          </h2>
          <p style={{ fontFamily: "var(--sans)", fontSize: "0.85rem", color: "var(--muted-foreground)" }}>
            Recência de atividade por repositório — baseado no último push indexado
          </p>
        </div>

        {/* Summary bar */}
        <div className="panel" style={{ padding: "1rem 1.25rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.85rem" }}>
            <TrendingUp size={12} color="var(--cyan)" />
            <span style={{ fontFamily: "var(--mono)", fontSize: "0.72rem", color: "var(--cyan)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
              distribuição de atividade — {repos.length} repos
            </span>
          </div>
          <div style={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden", gap: 2 }}>
            {BANDS.map((b) => {
              const count = withBand.filter((r) => r.band.key === b.key).length;
              const pct   = repos.length > 0 ? (count / repos.length) * 100 : 0;
              if (pct === 0) return null;
              return (
                <div
                  key={b.key}
                  title={`${b.key}: ${count}`}
                  style={{ height: "100%", width: `${pct}%`, background: b.color, borderRadius: 2, boxShadow: `0 0 6px ${b.color}60` }}
                />
              );
            })}
          </div>
          <div style={{ display: "flex", gap: "1.5rem", marginTop: "0.75rem", flexWrap: "wrap" }}>
            {BANDS.map((b) => {
              const count = withBand.filter((r) => r.band.key === b.key).length;
              if (count === 0) return null;
              return (
                <div key={b.key} style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  <div style={{ width: 7, height: 7, borderRadius: "50%", background: b.color, boxShadow: `0 0 5px ${b.color}` }} />
                  <span style={{ fontFamily: "var(--mono)", fontSize: "0.7rem", color: "var(--muted-foreground)" }}>{b.key}</span>
                  <span style={{ fontFamily: "var(--mono)", fontSize: "0.7rem", color: b.color, fontWeight: 600 }}>{count}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Groups */}
        {grouped.map((group) => (
          <div key={group.key}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.75rem" }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: group.color, boxShadow: `0 0 6px ${group.color}`, flexShrink: 0 }} />
              <span style={{ fontFamily: "var(--mono)", fontSize: "0.72rem", color: group.color, textTransform: "uppercase", letterSpacing: "0.12em" }}>
                {group.key}
              </span>
              <span style={{ fontFamily: "var(--mono)", fontSize: "0.68rem", color: "var(--dim)" }}>
                {group.repos.length} repo{group.repos.length !== 1 ? "s" : ""}
              </span>
              <div style={{ flex: 1, height: 1, background: `${group.color}20` }} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "0.5rem", paddingLeft: "1rem" }}>
              {group.repos.map((repo) => (
                <div
                  key={repo.repo}
                  className="panel"
                  style={{ padding: "0.75rem 1rem", borderLeft: `2px solid ${repo.band.color}`, background: repo.band.bg }}
                >
                  <div style={{ fontFamily: "var(--mono)", fontSize: "0.82rem", fontWeight: 600, color: "var(--text)", marginBottom: "0.25rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {repo.name}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                    <Clock size={9} color="var(--dim)" />
                    <span style={{ fontFamily: "var(--mono)", fontSize: "0.68rem", color: repo.band.color }}>
                      {repo.days === 0 ? "hoje" : repo.days === 1 ? "ontem" : `${repo.days}d atrás`}
                    </span>
                  </div>
                  {repo.owner && (
                    <div style={{ fontFamily: "var(--mono)", fontSize: "0.65rem", color: "var(--dim)", marginTop: "0.15rem" }}>{repo.owner}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}

        {repos.length === 0 && (
          <div className="panel" style={{ padding: "3rem", display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem", textAlign: "center" }}>
            <Activity size={36} color="var(--dim)" />
            <p style={{ fontFamily: "var(--mono)", fontSize: "0.85rem", color: "var(--muted-foreground)" }}>
              Nenhum repositório indexado ainda.
            </p>
          </div>
        )}
      </div>
    </FadeIn>
  );
}
