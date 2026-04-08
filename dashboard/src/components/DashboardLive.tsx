"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Database, Cpu, GitMerge, Bell, Circle, ChevronRight } from "lucide-react";
import { SpotlightCard } from "@/components/reactbits/SpotlightCard";
import { CountUp }       from "@/components/reactbits/CountUp";
import type { StatsOverview, Repo } from "@/lib/hub";

interface Props {
  initialStats: StatsOverview;
  initialRepos: Repo[];
}

export function DashboardLive({ initialStats, initialRepos }: Props) {
  const [stats, setStats] = useState(initialStats);
  const [repos, setRepos] = useState(initialRepos);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      if (cancelled) return;

      const hasActive = repos.some(r => r.status === "indexing" || r.status === "queued");
      const interval  = hasActive ? 4_000 : 30_000;

      try {
        const res  = await fetch("/painel/api/live-status", { cache: "no-store" });
        const data = await res.json();
        if (!cancelled && data.repos?.length) {
          setRepos(data.repos);
          if (data.stats) setStats(data.stats);
        }
      } catch {}

      if (!cancelled) timerRef.current = setTimeout(poll, interval);
    }

    timerRef.current = setTimeout(poll, 4_000);
    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const CARDS = [
    {
      label: "Repos Indexados",
      value: stats.repos_indexed,
      Icon:  Database,
      color: "var(--cyan)",
      spot:  "rgba(6,182,212,.12)",
      border:"rgba(6,182,212,.3)",
      sub:   `${repos.filter(r => r.status === "done").length} online`,
    },
    {
      label: "Chunks no Qdrant",
      value: stats.qdrant_points,
      Icon:  Cpu,
      color: "var(--purple)",
      spot:  "rgba(167,139,250,.12)",
      border:"rgba(167,139,250,.3)",
      sub:   `${stats.chunks_total.toLocaleString("pt-BR")} total`,
    },
    {
      label: "Decisões Capturadas",
      value: stats.decisions_captured,
      Icon:  GitMerge,
      color: "var(--green)",
      spot:  "rgba(34,197,94,.12)",
      border:"rgba(34,197,94,.3)",
      sub:   "via PRs",
    },
    {
      label: "Notificações",
      value: stats.notifications_unread,
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
    <>
      {/* Stats cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem" }}>
        {CARDS.map(({ label, value, Icon, color, spot, border, sub }) => (
          <SpotlightCard key={label} spotColor={spot} borderColor={border} style={{ padding: "1.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.25rem" }}>
              <span className="label" style={{ maxWidth: 130, lineHeight: 1.4 }}>{label}</span>
              <div style={{ width: 32, height: 32, borderRadius: "var(--r)", display: "flex", alignItems: "center", justifyContent: "center", background: spot, border: `1px solid ${border}`, flexShrink: 0 }}>
                <Icon size={15} color={color} />
              </div>
            </div>
            <div style={{ fontFamily: "var(--mono)", fontSize: "2.2rem", fontWeight: 700, color, lineHeight: 1, textShadow: color === "var(--cyan)" ? "var(--glow-cyan)" : color === "var(--green)" ? "var(--glow-green)" : color === "var(--purple)" ? "var(--glow-purple)" : "none", marginBottom: "0.5rem" }}>
              <CountUp to={value} />
            </div>
            <div style={{ fontFamily: "var(--mono)", fontSize: "0.72rem", color: "var(--muted-foreground)" }}>{sub}</div>
          </SpotlightCard>
        ))}
      </div>

      {/* Repos list */}
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div className="label-accent">Repositórios Indexados</div>
          <Link href="/repos" style={{ fontFamily: "var(--mono)", fontSize: "0.72rem", color: "var(--cyan)", textDecoration: "none", letterSpacing: "0.08em", display: "flex", alignItems: "center", gap: "4px" }}>
            ver todos <ChevronRight size={12} />
          </Link>
        </div>

        {repos.length === 0 ? (
          <p style={{ fontFamily: "var(--mono)", fontSize: "0.85rem", color: "var(--muted-foreground)" }}>
            Nenhum repositório indexado ainda.
          </p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "0.6rem" }}>
            {sorted.slice(0, 12).map((r) => {
              const isDone = r.status === "done";
              const name   = r.repo.replace("dioliveira07/", "");
              return (
                <div key={r.repo} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", padding: "0.65rem 1rem", borderRadius: "var(--r)", background: "var(--bg-panel)", border: "1px solid var(--border)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", minWidth: 0 }}>
                    <Circle size={5} fill={isDone ? "var(--green)" : "var(--amber)"} color={isDone ? "var(--green)" : "var(--amber)"} style={{ flexShrink: 0 }} />
                    <span style={{ fontFamily: "var(--mono)", fontSize: "0.75rem", color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {name}
                    </span>
                  </div>
                  <span className={`badge badge-${isDone ? "done" : "pending"}`}>{r.status}</span>
                </div>
              );
            })}
          </div>
        )}

        {sorted.length > 12 && (
          <div style={{ textAlign: "center", paddingTop: "0.25rem" }}>
            <Link href="/repos" style={{ fontFamily: "var(--mono)", fontSize: "0.7rem", color: "var(--muted-foreground)", textDecoration: "none", letterSpacing: "0.08em" }}>
              + {sorted.length - 12} repositórios →
            </Link>
          </div>
        )}
      </div>
    </>
  );
}
