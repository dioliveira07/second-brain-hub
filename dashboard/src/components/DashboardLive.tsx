"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { Database, Cpu, GitMerge, Bell, Circle, ChevronRight, AlertTriangle, GitBranch, CheckCircle2, XCircle, Loader2, Clock } from "lucide-react";
import { SpotlightCard } from "@/components/reactbits/SpotlightCard";
import { CountUp }       from "@/components/reactbits/CountUp";
import type { StatsOverview, Repo, TaskNotification, TaskItem } from "@/lib/hub";

type ProjetoAbandono = {
  projeto: string;
  nome: string;
  uncommitted: number;
  branch: string;
  ultimo_commit: string;
};

interface Props {
  initialStats: StatsOverview;
  initialRepos: Repo[];
  projetos_abandono?: ProjetoAbandono[];
  initialTaskNotifications?: TaskNotification[];
}

function TaskIcon({ status }: { status: TaskItem["status"] }) {
  if (status === "done")    return <CheckCircle2 size={13} color="var(--green)" />;
  if (status === "error")   return <XCircle      size={13} color="var(--red, #f87171)" />;
  if (status === "running") return <Loader2      size={13} color="var(--cyan)" style={{ animation: "spin 1s linear infinite" }} />;
  return <Clock size={13} color="var(--muted-foreground)" />;
}

type Notif = { id: string; type: string; message: string; created_at: string; metadata?: Record<string, unknown> };

export function DashboardLive({ initialStats, initialRepos, projetos_abandono = [], initialTaskNotifications = [] }: Props) {
  const [stats, setStats]                       = useState(initialStats);
  const [repos, setRepos]                       = useState(initialRepos);
  const [taskNotifs, setTaskNotifs]             = useState<TaskNotification[]>(initialTaskNotifications);
  const [notifOpen, setNotifOpen]               = useState(false);
  const [notifs, setNotifs]                     = useState<Notif[]>([]);
  const [notifsLoading, setNotifsLoading]       = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadNotifs = useCallback(async () => {
    setNotifsLoading(true);
    try {
      const res = await fetch("/painel/api/notif-proxy?unread_only=true&limit=50", { cache: "no-store" });
      const data = await res.json();
      if (Array.isArray(data)) setNotifs(data);
    } catch {}
    setNotifsLoading(false);
  }, []);

  const markAllRead = useCallback(async () => {
    await Promise.all(notifs.map(n =>
      fetch(`/painel/api/notif-proxy?id=${n.id}&action=read`, { method: "PATCH" })
    ));
    setNotifs([]);
    setStats(s => ({ ...s, notifications_unread: 0 }));
    setNotifOpen(false);
  }, [notifs]);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      if (cancelled) return;

      const hasActive = repos.some(r => r.status === "indexing" || r.status === "queued");
      const hasTasks  = taskNotifs.length > 0;
      const interval  = (hasActive || hasTasks) ? 4_000 : 30_000;

      try {
        const res  = await fetch("/painel/api/live-status", { cache: "no-store" });
        const data = await res.json();
        if (!cancelled) {
          if (data.repos?.length) setRepos(data.repos);
          if (data.stats)         setStats(data.stats);
          if (data.task_notifications !== undefined) setTaskNotifs(data.task_notifications);
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
        {CARDS.map(({ label, value, Icon, color, spot, border, sub }) => {
          const isNotif = label === "Notificações";
          const card = (
            <div key={label} onClick={isNotif ? () => { setNotifOpen(o => { if (!o) loadNotifs(); return !o; }); } : undefined} style={{ cursor: isNotif ? "pointer" : "default" }}>
            <SpotlightCard spotColor={spot} borderColor={border} style={{ padding: "1.5rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.25rem" }}>
                <span className="label" style={{ maxWidth: 130, lineHeight: 1.4 }}>{label}</span>
                <div style={{ width: 32, height: 32, borderRadius: "var(--r)", display: "flex", alignItems: "center", justifyContent: "center", background: spot, border: `1px solid ${border}`, flexShrink: 0 }}>
                  <Icon size={15} color={color} />
                </div>
              </div>
              <div style={{ fontFamily: "var(--mono)", fontSize: "2.2rem", fontWeight: 700, color, lineHeight: 1, textShadow: color === "var(--cyan)" ? "var(--glow-cyan)" : color === "var(--green)" ? "var(--glow-green)" : color === "var(--purple)" ? "var(--glow-purple)" : "none", marginBottom: "0.5rem" }}>
                <CountUp to={value} />
              </div>
              <div style={{ fontFamily: "var(--mono)", fontSize: "0.72rem", color: "var(--muted-foreground)" }}>{isNotif ? (notifOpen ? "clique para fechar" : "clique para ver") : sub}</div>
            </SpotlightCard>
            </div>
          );
          return card;
        })}
      </div>

      {/* Painel de notificações */}
      {notifOpen && (
        <div style={{ background: "rgba(15,30,55,0.85)", border: "1px solid rgba(251,191,36,0.25)", borderRadius: 8, padding: "1rem 1.25rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.25rem" }}>
            <span style={{ fontFamily: "var(--mono)", fontSize: "0.72rem", color: "var(--amber, #fbbf24)", letterSpacing: "0.08em" }}>NOTIFICAÇÕES NÃO LIDAS</span>
            {notifs.length > 0 && (
              <button onClick={markAllRead} style={{ background: "none", border: "1px solid rgba(251,191,36,0.3)", color: "var(--amber, #fbbf24)", borderRadius: 4, padding: "2px 10px", fontFamily: "var(--mono)", fontSize: "0.62rem", cursor: "pointer" }}>
                marcar todas como lidas
              </button>
            )}
          </div>
          {notifsLoading && <div style={{ fontFamily: "var(--mono)", fontSize: "0.72rem", color: "var(--muted-foreground)" }}>carregando...</div>}
          {!notifsLoading && notifs.length === 0 && <div style={{ fontFamily: "var(--mono)", fontSize: "0.72rem", color: "var(--muted-foreground)" }}>nenhuma notificação não lida</div>}
          {notifs.map(n => (
            <div key={n.id} style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem", padding: "0.5rem 0.75rem", background: "rgba(251,191,36,0.05)", border: "1px solid rgba(251,191,36,0.12)", borderRadius: 6 }}>
              <Bell size={12} color="var(--amber, #fbbf24)" style={{ marginTop: 2, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "var(--mono)", fontSize: "0.7rem", color: "var(--text, #e2e8f0)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.message}</div>
                <div style={{ fontFamily: "var(--mono)", fontSize: "0.6rem", color: "var(--muted-foreground)", marginTop: 2 }}>{n.type} · {new Date(n.created_at).toLocaleDateString("pt-BR")}</div>
              </div>
              <button onClick={() => fetch(`/painel/api/notif-proxy?id=${n.id}&action=read`, { method: "PATCH" }).then(() => { setNotifs(prev => prev.filter(x => x.id !== n.id)); setStats(s => ({ ...s, notifications_unread: Math.max(0, s.notifications_unread - 1) })); })}
                style={{ background: "none", border: "none", color: "var(--muted-foreground)", cursor: "pointer", flexShrink: 0, padding: "0 2px" }} title="marcar como lida">
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

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

      {/* Task progress notifications */}
      {taskNotifs.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Loader2 size={13} color="var(--cyan)" style={{ animation: "spin 1.5s linear infinite" }} />
            <div className="label-accent" style={{ color: "var(--cyan)" }}>Em execução</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {taskNotifs.map((notif) => {
              const tasks   = notif.metadata?.tasks ?? [];
              const done    = tasks.filter(t => t.status === "done").length;
              const hasErr  = tasks.some(t => t.status === "error");
              const pct     = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
              return (
                <div key={notif.id} style={{
                  padding: "0.9rem 1.1rem", borderRadius: "var(--r)",
                  background: "rgba(6,182,212,0.04)", border: "1px solid rgba(6,182,212,0.2)",
                  display: "flex", flexDirection: "column", gap: "0.6rem",
                }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem" }}>
                    <span style={{ fontFamily: "var(--mono)", fontSize: "0.8rem", fontWeight: 600, color: "var(--text)", flex: 1, wordBreak: "break-word", overflowWrap: "anywhere", minWidth: 0 }}>
                      {notif.message}
                    </span>
                    <span style={{
                      fontFamily: "var(--mono)", fontSize: "0.65rem",
                      color: hasErr ? "var(--red, #f87171)" : "var(--cyan)",
                      background: hasErr ? "rgba(248,113,113,0.1)" : "rgba(6,182,212,0.1)",
                      border: `1px solid ${hasErr ? "rgba(248,113,113,0.3)" : "rgba(6,182,212,0.3)"}`,
                      borderRadius: 4, padding: "1px 7px", flexShrink: 0,
                    }}>
                      {pct}%
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div style={{ height: 3, borderRadius: 2, background: "var(--border)", overflow: "hidden" }}>
                    <div style={{
                      height: "100%", borderRadius: 2,
                      width: `${pct}%`,
                      background: hasErr ? "var(--red, #f87171)" : "var(--cyan)",
                      transition: "width 0.4s ease",
                    }} />
                  </div>

                  {/* Task list */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                    {tasks.map((task, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "0.4rem" }}>
                        <div style={{ flexShrink: 0, marginTop: "1px" }}><TaskIcon status={task.status} /></div>
                        <span style={{
                          fontFamily: "var(--mono)", fontSize: "0.72rem",
                          color: task.status === "done" ? "var(--muted-foreground)" : task.status === "error" ? "var(--red, #f87171)" : "var(--text)",
                          textDecoration: task.status === "done" ? "line-through" : "none",
                          opacity: task.status === "pending" ? 0.5 : 1,
                          wordBreak: "break-word", overflowWrap: "anywhere", minWidth: 0,
                        }}>
                          {task.title}
                        </span>
                      </div>
                    ))}
                  </div>

                  {notif.repo && (
                    <span style={{ fontFamily: "var(--mono)", fontSize: "0.65rem", color: "var(--muted-foreground)", wordBreak: "break-all" }}>
                      {notif.repo}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Projetos em abandono */}
      {projetos_abandono.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <AlertTriangle size={13} color="var(--amber)" />
            <div className="label-accent" style={{ color: "var(--amber)" }}>Trabalho Pendente</div>
            <span style={{ fontFamily: "var(--mono)", fontSize: "0.68rem", color: "var(--muted-foreground)", marginLeft: "auto" }}>
              sem atividade nos últimos 3 dias
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "0.5rem" }}>
            {projetos_abandono.map((p) => (
              <div key={p.projeto} style={{
                display: "flex", flexDirection: "column", gap: "0.3rem",
                padding: "0.7rem 1rem", borderRadius: "var(--r)",
                background: "rgba(251,191,36,0.04)", border: "1px solid rgba(251,191,36,0.2)",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span style={{ fontFamily: "var(--mono)", fontSize: "0.78rem", fontWeight: 600, color: "var(--text)", flex: 1 }}>
                    {p.nome}
                  </span>
                  <span style={{
                    background: "rgba(251,191,36,0.15)", border: "1px solid rgba(251,191,36,0.3)",
                    color: "var(--amber)", borderRadius: 4, padding: "0px 6px",
                    fontFamily: "var(--mono)", fontSize: "0.65rem",
                  }}>
                    {p.uncommitted} não commitados
                  </span>
                </div>
                {p.branch && (
                  <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                    <GitBranch size={10} color="var(--muted-foreground)" />
                    <span style={{ fontFamily: "var(--mono)", fontSize: "0.68rem", color: "var(--muted-foreground)" }}>{p.branch}</span>
                  </div>
                )}
                {p.ultimo_commit && (
                  <span style={{ fontFamily: "var(--mono)", fontSize: "0.67rem", color: "var(--muted-foreground)", opacity: 0.7 }}>
                    {p.ultimo_commit.split("(")[0].slice(0, 50)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
