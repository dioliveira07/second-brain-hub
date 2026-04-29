"use client";

import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Play, Plus, LayoutGrid, Table2 } from "lucide-react";
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

function CheckboxDropdown({ items, selected, onChange, placeholder }: {
  items: string[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const sorted = [...items].sort((a, b) => a.localeCompare(b));

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (btnRef.current?.contains(e.target as Node) || dropRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function toggle() {
    if (!open && btnRef.current) setRect(btnRef.current.getBoundingClientRect());
    setOpen(o => !o);
  }

  const label = selected.size === 0 ? placeholder : selected.size === 1 ? [...selected][0] : `${selected.size} selecionados`;

  const dropdown = open && rect ? createPortal(
    <div ref={dropRef} style={{
      position: "fixed", top: rect.bottom + 4, left: rect.left, zIndex: 9999,
      minWidth: Math.max(rect.width, 220), maxHeight: 280, overflowY: "auto",
      background: "rgba(8,18,36,0.98)", border: "1px solid #1e3050",
      borderRadius: 6, boxShadow: "0 12px 40px rgba(0,0,0,0.6)",
    }}>
      <label style={{
        display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.5rem 0.75rem",
        cursor: "pointer", borderBottom: "1px solid #1a2840",
        fontFamily: "'Fira Code', monospace", fontSize: "0.74rem", color: "#06b6d4",
      }}>
        <input type="checkbox" checked={items.length > 0 && selected.size === items.length}
          onChange={e => onChange(e.target.checked ? new Set(items) : new Set())}
          style={{ accentColor: "#06b6d4", cursor: "pointer" }} />
        todos ({items.length})
      </label>
      {sorted.map(item => (
        <label key={item} style={{
          display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.38rem 0.75rem",
          cursor: "pointer", fontFamily: "'Fira Code', monospace", fontSize: "0.78rem",
          color: selected.has(item) ? "#e2e8f0" : "#8ab4cc",
          background: selected.has(item) ? "rgba(6,182,212,0.07)" : "transparent",
          transition: "background 80ms",
        }}>
          <input type="checkbox" checked={selected.has(item)}
            onChange={e => {
              const next = new Set(selected);
              if (e.target.checked) next.add(item); else next.delete(item);
              onChange(next);
            }}
            style={{ accentColor: "#06b6d4", cursor: "pointer", flexShrink: 0 }} />
          {item}
        </label>
      ))}
    </div>,
    document.body
  ) : null;

  return (
    <>
      <button ref={btnRef} type="button" onClick={toggle} className="cyber-input"
        style={{
          display: "flex", alignItems: "center", gap: "0.4rem", padding: "0.4rem 0.7rem",
          fontSize: "0.8rem", cursor: "pointer", minWidth: 160, justifyContent: "space-between",
          background: open ? "rgba(6,182,212,0.08)" : undefined,
        }}>
        <span style={{ color: selected.size === 0 ? "#5a7a9a" : "#e2e8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {label}
        </span>
        <ChevronDown size={12} style={{ color: "#5a7a9a", flexShrink: 0, transform: open ? "rotate(180deg)" : undefined, transition: "transform 150ms" }} />
      </button>
      {dropdown}
    </>
  );
}

// ── Matrix view ────────────────────────────────────────────────────────────────
function MatrixView({ agents, repos, subs, setSubs }: {
  agents: AgentInfo[];
  repos: string[];
  subs: AgentSub[];
  setSubs: React.Dispatch<React.SetStateAction<AgentSub[]>>;
}) {
  const [loading, setLoading] = useState<Set<string>>(new Set());
  const sortedRepos   = [...repos].sort((a, b) => a.localeCompare(b));
  const sortedAgents  = [...agents].sort((a, b) => a.name.localeCompare(b.name));

  const subsSet = useMemo(() =>
    new Set(subs.filter(s => s.enabled).map(s => `${s.agent_name}::${s.projeto}`)),
    [subs]
  );

  async function toggle(agent_name: string, projeto: string) {
    const key = `${agent_name}::${projeto}`;
    setLoading(prev => new Set(prev).add(key));
    const active = subsSet.has(key);
    try {
      if (active) {
        await cerebroDelete("/agent_subscriptions", { agent_name, projeto });
        setSubs(prev => prev.filter(s => !(s.agent_name === agent_name && s.projeto === projeto)));
      } else {
        const sub = await cerebroPost("/agent_subscriptions", { agent_name, projeto }) as AgentSub;
        setSubs(prev => {
          const idx = prev.findIndex(s => s.agent_name === sub.agent_name && s.projeto === sub.projeto);
          if (idx >= 0) { const n = [...prev]; n[idx] = sub; return n; }
          return [...prev, sub];
        });
      }
    } catch {}
    setLoading(prev => { const n = new Set(prev); n.delete(key); return n; });
  }

  // toggle entire column (agent)
  async function toggleAgent(agent_name: string) {
    const activeRepos = sortedRepos.filter(r => subsSet.has(`${agent_name}::${r}`));
    const allActive = activeRepos.length === sortedRepos.length;
    const targets = allActive
      ? sortedRepos // remove all
      : sortedRepos.filter(r => !subsSet.has(`${agent_name}::${r}`)); // add missing
    for (const repo of targets) await toggle(agent_name, repo);
  }

  // toggle entire row (repo)
  async function toggleRepo(projeto: string) {
    const activeAgents = sortedAgents.filter(a => subsSet.has(`${a.name}::${projeto}`));
    const allActive = activeAgents.length === sortedAgents.length;
    const targets = allActive
      ? sortedAgents
      : sortedAgents.filter(a => !subsSet.has(`${a.name}::${projeto}`));
    for (const agent of targets) await toggle(agent.name, projeto);
  }

  const COL_W = 110;
  const ROW_H = 36;

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", fontFamily: "'Fira Code', monospace", fontSize: "0.75rem", width: "100%" }}>
        <thead>
          <tr>
            {/* corner */}
            <th style={{ width: 200, minWidth: 180, padding: "0.5rem 0.75rem", textAlign: "left", color: "#5a7a9a", borderBottom: "1px solid #1a2840", position: "sticky", left: 0, background: "rgba(8,16,30,0.98)", zIndex: 2 }}>
              repo \ agente
            </th>
            {sortedAgents.map(a => {
              const activeCount = sortedRepos.filter(r => subsSet.has(`${a.name}::${r}`)).length;
              return (
                <th key={a.name} style={{ width: COL_W, minWidth: COL_W, padding: "0.4rem 0.5rem", textAlign: "center", borderBottom: "1px solid #1a2840", color: "#06b6d4" }}>
                  <div
                    title={`Toggle todos para ${a.name}`}
                    onClick={() => toggleAgent(a.name)}
                    style={{ cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: "2px" }}
                  >
                    <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: COL_W - 12 }}>
                      {a.name}
                    </span>
                    <span style={{ fontSize: "0.65rem", color: activeCount === sortedRepos.length ? "#22c55e" : "#5a7a9a" }}>
                      {activeCount}/{sortedRepos.length}
                    </span>
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sortedRepos.map((repo, ri) => {
            const rowActive = sortedAgents.filter(a => subsSet.has(`${a.name}::${repo}`)).length;
            return (
              <tr key={repo} style={{ background: ri % 2 === 0 ? "rgba(6,182,212,0.02)" : "transparent" }}>
                <td style={{
                  padding: "0 0.75rem", height: ROW_H, position: "sticky", left: 0,
                  background: ri % 2 === 0 ? "rgba(8,18,36,0.98)" : "rgba(8,16,30,0.98)",
                  borderBottom: "1px solid #0d1e36", zIndex: 1, whiteSpace: "nowrap",
                }}>
                  <span
                    onClick={() => toggleRepo(repo)}
                    title={`Toggle todos para ${repo}`}
                    style={{ cursor: "pointer", color: rowActive === sortedAgents.length ? "#22c55e" : rowActive > 0 ? "#e2e8f0" : "#5a7a9a" }}
                  >
                    {repo}
                  </span>
                </td>
                {sortedAgents.map(a => {
                  const key = `${a.name}::${repo}`;
                  const active = subsSet.has(key);
                  const busy = loading.has(key);
                  return (
                    <td key={a.name} style={{ textAlign: "center", borderBottom: "1px solid #0d1e36", padding: 0, height: ROW_H }}>
                      <button
                        onClick={() => !busy && toggle(a.name, repo)}
                        title={active ? `Remover ${a.name} → ${repo}` : `Adicionar ${a.name} → ${repo}`}
                        style={{
                          width: "100%", height: "100%", border: "none", background: "transparent",
                          cursor: busy ? "wait" : "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                          transition: "background 120ms",
                        }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = active ? "rgba(239,68,68,0.1)" : "rgba(6,182,212,0.1)"; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                      >
                        {busy ? (
                          <span style={{ color: "#fbbf24", fontSize: "0.8rem" }}>·</span>
                        ) : active ? (
                          <span style={{
                            width: 14, height: 14, borderRadius: 3, display: "block",
                            background: "#06b6d4", boxShadow: "0 0 6px #06b6d488",
                          }} />
                        ) : (
                          <span style={{
                            width: 14, height: 14, borderRadius: 3, display: "block",
                            border: "1px solid #1e3050",
                          }} />
                        )}
                      </button>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export function AgentsClient({ initialAgents, initialRuns, initialSubs, repos }: {
  initialAgents: AgentInfo[];
  initialRuns: AgentRunRow[];
  initialSubs: AgentSub[];
  repos: string[];
}) {
  const [agents] = useState<AgentInfo[]>(initialAgents);
  const [runs, setRuns] = useState<AgentRunRow[]>(initialRuns);
  const [subs, setSubs] = useState<AgentSub[]>(initialSubs);
  const [view, setView] = useState<"cards" | "matrix">("cards");
  const [filterAgent, setFilterAgent] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [newSubAgents, setNewSubAgents] = useState<Set<string>>(new Set());
  const [newSubRepos,  setNewSubRepos]  = useState<Set<string>>(new Set());
  const [subLoading, setSubLoading] = useState(false);
  const [subMsg, setSubMsg] = useState("");
  const [running, setRunning] = useState<Record<string, boolean>>({});
  const [expandedRun, setExpandedRun] = useState<string | null>(null);

  useEffect(() => {
    const t = setInterval(async () => {
      try {
        const params = new URLSearchParams({ limit: "80" });
        if (filterAgent) params.set("agent_name", filterAgent);
        if (filterStatus) params.set("status", filterStatus);
        const r = await fetch(`/painel/api/cerebro-proxy?path=/agent_runs?${params}`);
        if (r.ok) setRuns((await r.json()) as AgentRunRow[]);
      } catch {}
    }, 15_000);
    return () => clearInterval(t);
  }, [filterAgent, filterStatus]);

  const stats = useMemo(() => {
    const by: Record<string, { total: number; ok: number; err: number; cost: number; avgMs: number }> = {};
    for (const r of runs) {
      const a = by[r.agent_name] ||= { total: 0, ok: 0, err: 0, cost: 0, avgMs: 0 };
      a.total++; if (r.status === "done") a.ok++; if (r.status === "error") a.err++;
      a.cost += r.cost_estimate || 0; a.avgMs += r.duration_ms || 0;
    }
    for (const k of Object.keys(by)) by[k].avgMs = Math.round(by[k].avgMs / Math.max(by[k].total, 1));
    return by;
  }, [runs]);

  const filtered = useMemo(() => runs.filter(r => {
    if (filterAgent && r.agent_name !== filterAgent) return false;
    if (filterStatus && r.status !== filterStatus) return false;
    return true;
  }), [runs, filterAgent, filterStatus]);

  async function addSub() {
    if (!newSubAgents.size || !newSubRepos.size) return;
    setSubLoading(true); setSubMsg("");
    let errors = 0; const results: AgentSub[] = [];
    for (const agent of newSubAgents) for (const repo of newSubRepos) {
      try { results.push(await cerebroPost("/agent_subscriptions", { agent_name: agent, projeto: repo }) as AgentSub); }
      catch { errors++; }
    }
    setSubs(prev => {
      let next = [...prev];
      for (const sub of results) {
        const idx = next.findIndex(s => s.agent_name === sub.agent_name && s.projeto === sub.projeto);
        if (idx >= 0) next[idx] = sub; else next = [...next, sub];
      }
      return next;
    });
    setSubMsg(errors === 0 ? `+${results.length} ok` : `${results.length} ok · ${errors} erro(s)`);
    setSubLoading(false);
  }

  async function runAgent(agent_name: string) {
    setRunning(prev => ({ ...prev, [agent_name]: true }));
    try { await cerebroPost(`/agents/${encodeURIComponent(agent_name)}/run`, {}); } catch {}
    setTimeout(() => setRunning(prev => ({ ...prev, [agent_name]: false })), 3000);
  }

  const TAB: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: "0.35rem",
    padding: "0.4rem 0.9rem", borderRadius: 5, cursor: "pointer",
    fontFamily: "'Fira Code', monospace", fontSize: "0.8rem", border: "none",
    transition: "background 150ms, color 150ms",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>

      {/* Tab switcher */}
      <div style={{ display: "flex", gap: "0.4rem" }}>
        <button onClick={() => setView("cards")} style={{
          ...TAB,
          background: view === "cards" ? "rgba(6,182,212,0.12)" : "transparent",
          color: view === "cards" ? "#06b6d4" : "#5a7a9a",
          border: `1px solid ${view === "cards" ? "#06b6d444" : "#1a2840"}`,
        }}>
          <LayoutGrid size={14} /> Cards
        </button>
        <button onClick={() => setView("matrix")} style={{
          ...TAB,
          background: view === "matrix" ? "rgba(6,182,212,0.12)" : "transparent",
          color: view === "matrix" ? "#06b6d4" : "#5a7a9a",
          border: `1px solid ${view === "matrix" ? "#06b6d444" : "#1a2840"}`,
        }}>
          <Table2 size={14} /> Matrix
        </button>
      </div>

      {view === "matrix" ? (
        <MatrixView agents={agents} repos={repos} subs={subs} setSubs={setSubs} />
      ) : (<>

        {/* Agent cards */}
        <div>
          <div className="label-accent" style={{ marginBottom: "0.5rem" }}>Registered Agents</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "0.7rem" }}>
            {agents.map(a => {
              const s = stats[a.name];
              const color = MODEL_COLOR[a.model] || "#06b6d4";
              const isRunning = running[a.name];
              return (
                <div key={a.name} className="panel" style={{ padding: "0.85rem 1rem", borderLeft: `3px solid ${color}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "0.5rem" }}>
                    <div onClick={() => setFilterAgent(filterAgent === a.name ? "" : a.name)}
                      style={{ fontFamily: "'Fira Code', monospace", fontWeight: 600, color: "#e2e8f0", fontSize: "0.92rem", cursor: "pointer" }}>
                      {a.name}
                    </div>
                    <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
                      <span style={{ padding: "1px 6px", borderRadius: 3, fontSize: "0.66rem", background: `${color}22`, color, fontFamily: "'Fira Code', monospace" }}>
                        {a.model}
                      </span>
                      <button onClick={() => runAgent(a.name)} disabled={isRunning} title="Rodar manualmente"
                        style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 24, height: 24, borderRadius: 4, border: "1px solid #22c55e44", background: isRunning ? "#22c55e22" : "transparent", color: "#22c55e", cursor: isRunning ? "default" : "pointer", padding: 0, transition: "background 150ms" }}>
                        <Play size={12} />
                      </button>
                    </div>
                  </div>
                  <div style={{ marginTop: "0.4rem", fontSize: "0.72rem", color: "#8ab4cc", fontFamily: "'Fira Code', monospace" }}>
                    {a.cron && <div>cron: <span style={{ color: "#fbbf24" }}>{a.cron}</span></div>}
                    {a.subscribes.length > 0 && <div>subs: <span style={{ color: "#06b6d4" }}>{a.subscribes.join(", ")}</span></div>}
                  </div>
                  {s && (
                    <div style={{ marginTop: "0.5rem", fontSize: "0.72rem", color: "#8ab4cc", fontFamily: "'Fira Code', monospace" }}>
                      runs: <span style={{ color: "#22c55e" }}>{s.ok}</span>
                      {s.err > 0 && <> · err: <span style={{ color: "#ef4444" }}>{s.err}</span></>}
                      {" · avg "}{s.avgMs}ms
                      {s.cost > 0 && <> · ${s.cost.toFixed(3)}</>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Quick-add subscriptions */}
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={() => setView("matrix")} style={{ display: "flex", alignItems: "center", gap: "0.35rem", padding: "0.4rem 0.7rem", borderRadius: 5, border: "1px solid #1a2840", background: "transparent", color: "#5a7a9a", cursor: "pointer", fontFamily: "'Fira Code', monospace", fontSize: "0.75rem" }}>
            <Table2 size={12} /> {subs.length} subs
          </button>
          <CheckboxDropdown items={agents.map(a => a.name)} selected={newSubAgents} onChange={setNewSubAgents} placeholder="agentes" />
          <span style={{ color: "#5a7a9a", fontFamily: "'Fira Code', monospace" }}>→</span>
          <CheckboxDropdown items={repos} selected={newSubRepos} onChange={setNewSubRepos} placeholder="repos" />
          <button onClick={addSub} disabled={subLoading || !newSubAgents.size || !newSubRepos.size}
            style={{ display: "flex", alignItems: "center", gap: "0.35rem", padding: "0.4rem 0.8rem", borderRadius: 5, border: "1px solid #06b6d444", background: "#06b6d411", color: (!newSubAgents.size || !newSubRepos.size) ? "#3a6a8a" : "#06b6d4", cursor: (subLoading || !newSubAgents.size || !newSubRepos.size) ? "default" : "pointer", fontFamily: "'Fira Code', monospace", fontSize: "0.8rem" }}>
            <Plus size={13} />
            {subLoading ? "..." : newSubAgents.size && newSubRepos.size ? `Adicionar (${newSubAgents.size * newSubRepos.size})` : "Adicionar"}
          </button>
          {subMsg && <span style={{ fontFamily: "'Fira Code', monospace", fontSize: "0.75rem", color: subMsg.includes("erro") ? "#ef4444" : "#22c55e" }}>{subMsg}</span>}
        </div>

        {/* Filtros + Runs */}
        <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
          <select value={filterAgent} onChange={e => setFilterAgent(e.target.value)} className="cyber-input" style={{ padding: "0.5rem 0.8rem", fontSize: "0.85rem" }}>
            <option value="">Todos os agentes</option>
            {agents.map(a => <option key={a.name} value={a.name}>{a.name}</option>)}
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="cyber-input" style={{ padding: "0.5rem 0.8rem", fontSize: "0.85rem" }}>
            <option value="">Todos status</option>
            <option value="done">done</option>
            <option value="running">running</option>
            <option value="error">error</option>
          </select>
        </div>

        <div>
          <div className="label-accent" style={{ marginBottom: "0.5rem" }}>Recent Runs</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            {filtered.length === 0 && <div style={{ padding: "1.5rem", textAlign: "center", color: "#5a7a9a" }}>(sem runs)</div>}
            {filtered.slice(0, 50).map(r => {
              const sColor = STATUS_COLOR[r.status] || "#8ab4cc";
              const mColor = MODEL_COLOR[r.model || ""] || "#5a7a9a";
              const expanded = expandedRun === r.id;
              const hasDetail = !!(r.error_message || (r.output && Object.keys(r.output).length > 0));
              return (
                <div key={r.id} className="panel"
                  onClick={() => hasDetail && setExpandedRun(expanded ? null : r.id)}
                  style={{ padding: "0.55rem 0.85rem", borderLeft: `2px solid ${sColor}`, fontFamily: "'Fira Code', monospace", fontSize: "0.78rem", cursor: hasDetail ? "pointer" : "default" }}>
                  <div style={{ display: "flex", gap: "0.7rem", alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ color: sColor, fontWeight: 600 }}>{r.status}</span>
                    <span style={{ color: "#e2e8f0" }}>{r.agent_name}</span>
                    <span style={{ color: mColor, fontSize: "0.7rem" }}>{r.model}</span>
                    <span style={{ color: "#8ab4cc", fontSize: "0.7rem" }}>{r.trigger_type}</span>
                    <span style={{ color: "#5a7a9a", fontSize: "0.7rem" }}>{r.duration_ms || 0}ms</span>
                    {r.cost_estimate ? <span style={{ color: "#fbbf24", fontSize: "0.7rem" }}>${r.cost_estimate.toFixed(4)}</span> : null}
                    <span style={{ color: "#5a7a9a", fontSize: "0.7rem", marginLeft: "auto" }}>{timeAgo(r.started_at)}</span>
                    {hasDetail && <ChevronDown size={11} style={{ color: "#5a7a9a", transform: expanded ? "rotate(180deg)" : undefined, transition: "transform 150ms", flexShrink: 0 }} />}
                  </div>
                  {expanded && (
                    <div style={{ marginTop: "0.6rem", borderTop: "1px solid #1a2840", paddingTop: "0.6rem" }}>
                      {r.error_message && (
                        <div style={{ color: "#ef4444", fontSize: "0.72rem", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                          {r.error_message}
                        </div>
                      )}
                      {r.output && Object.keys(r.output).length > 0 && (
                        <pre style={{ margin: 0, color: "#a8c0dc", fontSize: "0.72rem", whiteSpace: "pre-wrap", wordBreak: "break-all", background: "rgba(6,182,212,0.04)", padding: "0.5rem", borderRadius: 4 }}>
                          {JSON.stringify(r.output, null, 2)}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

      </>)}
    </div>
  );
}
