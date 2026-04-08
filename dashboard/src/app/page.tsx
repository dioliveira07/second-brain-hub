import { hubFetch, StatsOverview, Repo } from "@/lib/hub";
import { Database, Cpu, GitMerge, Bell, Circle, ChevronRight } from "lucide-react";
import { SpotlightCard } from "@/components/reactbits/SpotlightCard";
import { CountUp }       from "@/components/reactbits/CountUp";
import { FadeIn }        from "@/components/reactbits/FadeIn";
import Link from "next/link";

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

  const CARDS = [
    {
      label: "Repos Indexados",
      value: stats.repos_indexed,
      isInt: true,
      Icon:  Database,
      color: "var(--cyan)",
      spot:  "rgba(6,182,212,.12)",
      border:"rgba(6,182,212,.3)",
      sub:   `${repos.filter(r => r.status === 'done').length} online`,
    },
    {
      label: "Chunks no Qdrant",
      value: stats.qdrant_points,
      isInt: true,
      Icon:  Cpu,
      color: "var(--purple)",
      spot:  "rgba(167,139,250,.12)",
      border:"rgba(167,139,250,.3)",
      sub:   `${stats.chunks_total.toLocaleString('pt-BR')} total`,
    },
    {
      label: "Decisões Capturadas",
      value: stats.decisions_captured,
      isInt: true,
      Icon:  GitMerge,
      color: "var(--green)",
      spot:  "rgba(34,197,94,.12)",
      border:"rgba(34,197,94,.3)",
      sub:   "via PRs",
    },
    {
      label: "Notificações",
      value: stats.notifications_unread,
      isInt: true,
      Icon:  Bell,
      color: "var(--amber)",
      spot:  "rgba(251,191,36,.12)",
      border:"rgba(251,191,36,.3)",
      sub:   "não lidas",
    },
  ];

  const doneRepos  = repos.filter(r => r.status === "done");
  const otherRepos = repos.filter(r => r.status !== "done");
  const sorted     = [...doneRepos, ...otherRepos];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2.5rem", maxWidth: 1200 }}>

      {/* Page header */}
      <FadeIn delay={0}>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
          <div className="label-accent" style={{ marginBottom: "0.2rem" }}>Overview</div>
          <h2 style={{ fontFamily: "var(--mono)", fontSize: "1.6rem", fontWeight: 700, color: "var(--text)", letterSpacing: "-0.02em" }}>
            Dashboard
          </h2>
          <p style={{ fontFamily: "var(--sans)", fontSize: "0.85rem", color: "var(--muted)" }}>
            Segundo cérebro corporativo — visão em tempo real
          </p>
        </div>
      </FadeIn>

      {/* Stats cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem" }}>
        {CARDS.map(({ label, value, Icon, color, spot, border, sub }, i) => (
          <FadeIn key={label} delay={80 + i * 60}>
          <SpotlightCard
            key={label}
            spotColor={spot}
            borderColor={border}
            style={{ padding: "1.5rem" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.25rem" }}>
              <span className="label" style={{ maxWidth: 130, lineHeight: 1.4 }}>{label}</span>
              <div
                style={{
                  width: 32, height: 32,
                  borderRadius: "var(--r)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: `${spot}`,
                  border: `1px solid ${border}`,
                  flexShrink: 0,
                }}
              >
                <Icon size={15} color={color} />
              </div>
            </div>
            <div
              style={{
                fontFamily: "var(--mono)",
                fontSize:   "2.2rem",
                fontWeight: 700,
                color,
                lineHeight: 1,
                textShadow: color === "var(--cyan)"   ? "var(--glow-cyan)"   :
                            color === "var(--green)"  ? "var(--glow-green)"  :
                            color === "var(--purple)" ? "var(--glow-purple)" :
                            "none",
                marginBottom: "0.5rem",
              }}
            >
              <CountUp to={value} />
            </div>
            <div style={{ fontFamily: "var(--mono)", fontSize: "0.65rem", color: "var(--muted)" }}>
              {sub}
            </div>
          </SpotlightCard>
          </FadeIn>
        ))}
      </div>

      {/* Repos list */}
      <FadeIn delay={360}>
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div className="label-accent">Repositórios Indexados</div>
          <Link
            href="/repos"
            style={{
              fontFamily:    "var(--mono)",
              fontSize:      "0.65rem",
              color:         "var(--cyan)",
              textDecoration: "none",
              letterSpacing: "0.08em",
              display:       "flex",
              alignItems:    "center",
              gap:           "4px",
            }}
          >
            ver todos <ChevronRight size={12} />
          </Link>
        </div>

        {repos.length === 0 ? (
          <p style={{ fontFamily: "var(--mono)", fontSize: "0.85rem", color: "var(--muted)" }}>
            Nenhum repositório indexado ainda.
          </p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "0.6rem" }}>
            {sorted.slice(0, 12).map((r) => {
              const isDone = r.status === "done";
              const name   = r.repo.replace("dioliveira07/", "");
              return (
                <div
                  key={r.repo}
                  style={{
                    display:       "flex",
                    alignItems:    "center",
                    justifyContent:"space-between",
                    gap:           "0.75rem",
                    padding:       "0.65rem 1rem",
                    borderRadius:  "var(--r)",
                    background:    "var(--bg-panel)",
                    border:        "1px solid var(--border)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", minWidth: 0 }}>
                    <Circle
                      size={5}
                      fill={isDone ? "var(--green)" : "var(--amber)"}
                      color={isDone ? "var(--green)" : "var(--amber)"}
                      style={{ flexShrink: 0 }}
                    />
                    <span
                      style={{
                        fontFamily:    "var(--mono)",
                        fontSize:      "0.75rem",
                        color:         "var(--text)",
                        overflow:      "hidden",
                        textOverflow:  "ellipsis",
                        whiteSpace:    "nowrap",
                      }}
                    >
                      {name}
                    </span>
                  </div>
                  <span className={`badge badge-${isDone ? "done" : "pending"}`}>
                    {r.status}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {sorted.length > 12 && (
          <div style={{ textAlign: "center", paddingTop: "0.25rem" }}>
            <Link href="/repos" style={{ fontFamily: "var(--mono)", fontSize: "0.7rem", color: "var(--muted)", textDecoration: "none", letterSpacing: "0.08em" }}>
              + {sorted.length - 12} repositórios →
            </Link>
          </div>
        )}
      </div>
      </FadeIn>
    </div>
  );
}
