"use client";

import { useEffect, useMemo, useState } from "react";
import { Play, Trash2, Plus } from "lucide-react";
import type { AgentInfo, AgentRunRow } from "@/lib/hub";

const STATUS_COLOR: Record<string, string> = {
  done:    "#22c55e",
  error:   "#ef4444",
  running: "#fbbf24",
};

const MODEL_COLOR: Record<string, string> = {
  opus:   "#a855f7",
  sonnet: "#06b6d4",
  haiku:  "#22c55e",
};

type AgentSub = { id: string; agent_name: string; projeto: string; enabled: boolean };

function timeAgo(s: string | null): string {
  if (!s) return "—";
  const diff = (Date.now() - new Date(s).getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

async function cerebroPost(path: string, params: Record<string, string>) {
  const qs = new URLSearchParams(params).toString();
  const r = await fetch(`/painel/api/cerebro-proxy?path=${encodeURIComponent(path + "?" + qs)}`, { method: "POST" });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

async function cerebroDelete(path: string, params: Record<string, string>) {
  const qs = new URLSearchParams(params).toString();
  const r = await fetch(`/painel/api/cerebro-proxy?path=${encodeURIComponent(path + "?" + qs)}`, { method: "DELETE" });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export function AgentsClient({
  initialAgents,
  initialRuns,
  initialSubs,
  repos,
}: {
  initialAgents: AgentInfo[];
  initialRuns: AgentRunRow[];
  initialSubs: AgentSub[];
  repos: string[];
}) {
  const [agents] = useState<AgentInfo[]>(initialAgents);
  const [runs, setRuns] = useState<AgentRunRow[]>(initialRuns);
  const [subs, setSubs] = useState<AgentSub[]>(initialSubs);
  const [filterAgent, setFilterAgent] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("");

  // Add subscription form
  const [newSubAgent, setNewSubAgent] = useState<string>(agents[0]?.name ?? "");
  const [newSubRepo, setNewSubRepo] = useState<string>(repos[0] ?? "");
  const [subLoading, setSubLoading] = useState(false);
  const [subMsg, setSubMsg] = useState("");

  // Run manually state per agent
  const [running, setRunning] = useState<Record<string, boolean>>({});

  // Polling runs 15s
  useEffect(() => {
    const t = setInterval(async () => {
      try {
        const params = new URLSearchParams();
        params.set("limit", "80");
        if (filterAgent) params.set("agent_name", filterAgent);
        if (filterStatus) params.set("status", filterStatus);
        const r = await fetch(`/painel/api/cerebro-proxy?path=/agent_runs?${params.toString()}`);
        if (r.ok) setRuns((await r.json()) as AgentRunRow[]);
      } catch {}
    }, 15_000);
    return () => clearInterval(t);
  }, [filterAgent, filterStatus]);

  const stats = useMemo(() => {
    const byAgent: Record<string, { total: number; ok: number; err: number; cost: number; avgMs: number; }> = {};
    for (const r of runs) {
      const a = byAgent[r.agent_name] ||= { total: 0, ok: 0, err: 0, cost: 0, avgMs: 0 };
      a.total++;
      if (r.status === "done") a.ok++;
      if (r.status === "error") a.err++;
      a.cost += (r.cost_estimate || 0);
      a.avgMs += (r.duration_ms || 0);
    }
    for (const k of Object.keys(byAgent)) {
      byAgent[k].avgMs = Math.round(byAgent[k].avgMs / Math.max(byAgent[k].total, 1));
    }
    return byAgent;
  }, [runs]);

  const filtered = useMemo(() => {
    return runs.filter(r => {
      if (filterAgent && r.agent_name !== filterAgent) return false;
      if (filterStatus && r.status !== filterStatus) return false;
      return true;
    });
  }, [runs, filterAgent, filterStatus]);

  async function addSub() {
    if (!newSubAgent || !newSubRepo) return;
    setSubLoading(true);
    setSubMsg("");
    try {
      const sub = await cerebroPost("/agent_subscriptions", { agent_name: newSubAgent, projeto: newSubRepo });
      setSubs(prev => {
        const exists = prev.find(s => s.agent_name === sub.agent_name && s.projeto === sub.projeto);
        if (exists) return prev.map(s => s.id === sub.id ? sub : s);
        return [...prev, sub];
      });
      setSubMsg("ok");
    } catch (e: unknown) {
      setSubMsg(e instanceof Error ? e.message : "erro");
    } finally {
      setSubLoading(false);
    }
  }

  async function removeSub(agent_name: string, projeto: string) {
    try {
      await cerebroDelete("/agent_subscriptions", { agent_name, projeto });
      setSubs(prev => prev.filter(s => !(s.agent_name === agent_name && s.projeto === projeto)));
    } catch {}
  }

  async function runAgent(agent_name: string) {
    setRunning(prev => ({ ...prev, [agent_name]: true }));
    try {
      await cerebroPost(`/agents/${encodeURIComponent(agent_name)}/run`, {});
    } catch {}
    setTimeout(() => setRunning(prev => ({ ...prev, [agent_name]: false })), 3000);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Agent cards */}
      <div>
        <div className="label-accent" style={{ marginBottom: "0.5rem" }}>Registered Agents</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "0.7rem" }}>
          {agents.map(a => {
            const s = stats[a.name];
            const color = MODEL_COLOR[a.model] || "#06b6d4";
            const isRunning = running[a.name];
            return (
              <div key={a.name} className="panel" style={{
                padding: "0.85rem 1rem", borderLeft: `3px solid ${color}`,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "0.5rem" }}>
                  <div
                    style={{ fontFamily: "'Fira Code', monospace", fontWeight: 600, color: "#e2e8f0", fontSize: "0.92rem", cursor: "pointer" }}
                    onClick={() => setFilterAgent(filterAgent === a.name ? "" : a.name)}
                  >
                    {a.name}
                  </div>
                  <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
                    <span style={{
                      padding: "1px 6px", borderRadius: 3, fontSize: "0.66rem",
                      background: `${color}22`, color, fontFamily: "'Fira Code', monospace",
                    }}>
                      {a.model}
                    </span>
                    <button
                      onClick={() => runAgent(a.name)}
                      disabled={isRunning}
                      title="Rodar manualmente"
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "center",
                        width: 24, height: 24, borderRadius: 4, border: "1px solid #22c55e44",
                        background: isRunning ? "#22c55e22" : "transparent",
                        color: "#22c55e", cursor: isRunning ? "default" : "pointer",
                        padding: 0, transition: "background 150ms",
                      }}
                    >
                      <Play size={12} />
                    </button>
                  </div>
                </div>
                <div style={{ marginTop: "0.4rem", fontSize: "0.72rem", color: "#8ab4cc", fontFamily: "'Fira Code', monospace" }}>
                  {a.cron && <div>cron: <span style={{ color: "#fbbf24" }}>{a.cron}</span></div>}
                  {a.subscribes.length > 0 && (
                    <div>subs: <span style={{ color: "#06b6d4" }}>{a.subscribes.join(", ")}</span></div>
                  )}
                </div>
                {s && (
                  <div style={{ marginTop: "0.5rem", fontSize: "0.72rem", color: "#8ab4cc", fontFamily: "'Fira Code', monospace" }}>
                    runs: <span style={{ color: "#22c55e" }}>{s.ok}</span>
                    {s.err > 0 && <> · err: <span style={{ color: "#ef4444" }}>{s.err}</span></>}
                    <> · avg {s.avgMs}ms</>
                    {s.cost > 0 && <> · ${s.cost.toFixed(3)}</>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Subscriptions */}
      <div>
        <div className="label-accent" style={{ marginBottom: "0.5rem" }}>Subscriptions</div>
        <div className="panel" style={{ padding: "1rem" }}>
          {/* List */}
          {subs.length === 0 ? (
            <div style={{ color: "#5a7a9a", fontSize: "0.82rem", fontFamily: "'Fira Code', monospace", marginBottom: "0.8rem" }}>
              nenhuma subscription ativa
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem", marginBottom: "0.8rem" }}>
              {subs.map(s => (
                <div key={s.id} style={{
                  display: "flex", alignItems: "center", gap: "0.6rem",
                  fontFamily: "'Fira Code', monospace", fontSize: "0.8rem",
                }}>
                  <span style={{
                    padding: "1px 6px", borderRadius: 3, fontSize: "0.7rem",
                    background: "#06b6d422", color: "#06b6d4",
                  }}>{s.agent_name}</span>
                  <span style={{ color: "#8ab4cc" }}>→</span>
                  <span style={{ color: "#e2e8f0" }}>{s.projeto}</span>
                  {!s.enabled && <span style={{ color: "#ef4444", fontSize: "0.68rem" }}>(disabled)</span>}
                  <button
                    onClick={() => removeSub(s.agent_name, s.projeto)}
                    title="Remover"
                    style={{
                      marginLeft: "auto", display: "flex", alignItems: "center", justifyContent: "center",
                      width: 22, height: 22, borderRadius: 4, border: "1px solid #ef444444",
                      background: "transparent", color: "#ef4444", cursor: "pointer", padding: 0,
                    }}
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add form */}
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap", borderTop: "1px solid #1a2840", paddingTop: "0.75rem" }}>
            <select
              value={newSubAgent}
              onChange={e => setNewSubAgent(e.target.value)}
              className="cyber-input"
              style={{ padding: "0.4rem 0.7rem", fontSize: "0.8rem" }}
            >
              {agents.map(a => <option key={a.name} value={a.name}>{a.name}</option>)}
            </select>
            <span style={{ color: "#5a7a9a", fontFamily: "'Fira Code', monospace" }}>→</span>
            <select
              value={newSubRepo}
              onChange={e => setNewSubRepo(e.target.value)}
              className="cyber-input"
              style={{ padding: "0.4rem 0.7rem", fontSize: "0.8rem" }}
            >
              {repos.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <button
              onClick={addSub}
              disabled={subLoading}
              style={{
                display: "flex", alignItems: "center", gap: "0.35rem",
                padding: "0.4rem 0.8rem", borderRadius: 5,
                border: "1px solid #06b6d444", background: "#06b6d411",
                color: "#06b6d4", cursor: subLoading ? "default" : "pointer",
                fontFamily: "'Fira Code', monospace", fontSize: "0.8rem",
                transition: "background 150ms",
              }}
            >
              <Plus size={13} />
              {subLoading ? "..." : "Adicionar"}
            </button>
            {subMsg && (
              <span style={{
                fontFamily: "'Fira Code', monospace", fontSize: "0.75rem",
                color: subMsg === "ok" ? "#22c55e" : "#ef4444",
              }}>
                {subMsg === "ok" ? "✓ adicionado" : subMsg}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
        <select
          value={filterAgent}
          onChange={e => setFilterAgent(e.target.value)}
          className="cyber-input"
          style={{ padding: "0.5rem 0.8rem", fontSize: "0.85rem" }}
        >
          <option value="">Todos os agentes</option>
          {agents.map(a => <option key={a.name} value={a.name}>{a.name}</option>)}
        </select>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="cyber-input"
          style={{ padding: "0.5rem 0.8rem", fontSize: "0.85rem" }}
        >
          <option value="">Todos status</option>
          <option value="done">done</option>
          <option value="running">running</option>
          <option value="error">error</option>
        </select>
      </div>

      {/* Runs */}
      <div>
        <div className="label-accent" style={{ marginBottom: "0.5rem" }}>Recent Runs</div>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
          {filtered.length === 0 && (
            <div style={{ padding: "1.5rem", textAlign: "center", color: "#5a7a9a" }}>(sem runs)</div>
          )}
          {filtered.slice(0, 50).map(r => {
            const sColor = STATUS_COLOR[r.status] || "#8ab4cc";
            const mColor = MODEL_COLOR[r.model || ""] || "#5a7a9a";
            return (
              <div key={r.id} className="panel" style={{
                padding: "0.55rem 0.85rem", borderLeft: `2px solid ${sColor}`,
                fontFamily: "'Fira Code', monospace", fontSize: "0.78rem",
              }}>
                <div style={{ display: "flex", gap: "0.7rem", alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ color: sColor, fontWeight: 600 }}>{r.status}</span>
                  <span style={{ color: "#e2e8f0" }}>{r.agent_name}</span>
                  <span style={{ color: mColor, fontSize: "0.7rem" }}>{r.model}</span>
                  <span style={{ color: "#8ab4cc", fontSize: "0.7rem" }}>{r.trigger_type}</span>
                  <span style={{ color: "#5a7a9a", fontSize: "0.7rem" }}>{r.duration_ms || 0}ms</span>
                  {r.cost_estimate ? (
                    <span style={{ color: "#fbbf24", fontSize: "0.7rem" }}>${r.cost_estimate.toFixed(4)}</span>
                  ) : null}
                  <span style={{ color: "#5a7a9a", fontSize: "0.7rem", marginLeft: "auto" }}>
                    {timeAgo(r.started_at)}
                  </span>
                </div>
                {r.error_message && (
                  <div style={{ marginTop: "0.3rem", color: "#ef4444", fontSize: "0.7rem" }}>
                    {r.error_message.slice(0, 200)}
                  </div>
                )}
                {r.output && Object.keys(r.output).length > 0 && (
                  <div style={{ marginTop: "0.25rem", color: "#a8c0dc", fontSize: "0.7rem" }}>
                    {JSON.stringify(r.output).slice(0, 220)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
