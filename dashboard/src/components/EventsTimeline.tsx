"use client";

import { useEffect, useMemo, useState } from "react";
import type { EventItem } from "@/lib/hub";

function colorForType(t: string): string {
  if (t.startsWith("signal.")) return "#06b6d4";
  if (t.startsWith("decision.")) return "#22c55e";
  if (t.startsWith("memory.")) return "#a855f7";
  if (t.startsWith("agent.done")) return "#22c55e";
  if (t.startsWith("agent.error")) return "#ef4444";
  if (t.startsWith("message.")) return "#fbbf24";
  return "#8ab4cc";
}

function timeAgo(s: string | null): string {
  if (!s) return "—";
  const diff = (Date.now() - new Date(s).getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

export function EventsTimeline({ initial }: { initial: EventItem[] }) {
  const [events, setEvents] = useState<EventItem[]>(initial);
  const [filterType, setFilterType] = useState("");
  const [filterActor, setFilterActor] = useState("");
  const [filterProjeto, setFilterProjeto] = useState("");

  useEffect(() => {
    const t = setInterval(async () => {
      try {
        const params = new URLSearchParams();
        params.set("limit", "200");
        if (filterType) params.set("type_prefix", filterType);
        if (filterActor) params.set("actor", filterActor);
        if (filterProjeto) params.set("projeto", filterProjeto);
        const r = await fetch(`/painel/api/cerebro-proxy?path=/events?${params.toString()}`);
        if (r.ok) setEvents((await r.json()) as EventItem[]);
      } catch {}
    }, 10_000);
    return () => clearInterval(t);
  }, [filterType, filterActor, filterProjeto]);

  const stats = useMemo(() => {
    const c: Record<string, number> = {};
    for (const e of events) {
      const prefix = e.type.split(".")[0];
      c[prefix] = (c[prefix] || 0) + 1;
    }
    return c;
  }, [events]);

  const actors = useMemo(() => {
    return Array.from(new Set(events.map(e => e.actor).filter(Boolean) as string[])).slice(0, 30);
  }, [events]);

  const projetos = useMemo(() => {
    return Array.from(new Set(events.map(e => e.projeto).filter(Boolean) as string[])).slice(0, 30);
  }, [events]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      {/* Stats por prefix */}
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        {Object.entries(stats).sort((a, b) => b[1] - a[1]).map(([p, c]) => (
          <button
            key={p}
            onClick={() => setFilterType(filterType === p + "." ? "" : p + ".")}
            className="panel"
            style={{
              padding: "0.4rem 0.8rem", borderRadius: 4, cursor: "pointer",
              background: filterType === p + "." ? "rgba(6,182,212,0.12)" : "rgba(10,22,40,0.5)",
              border: filterType === p + "." ? "1px solid #06b6d4" : "1px solid #1a2840",
              color: colorForType(p + "."), fontFamily: "'Fira Code', monospace", fontSize: "0.76rem",
            }}
          >
            {p}.* <span style={{ opacity: 0.7, marginLeft: 4 }}>{c}</span>
          </button>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <select value={filterActor} onChange={e => setFilterActor(e.target.value)} className="cyber-input"
          style={{ padding: "0.45rem 0.8rem", fontSize: "0.8rem" }}>
          <option value="">Todos actors</option>
          {actors.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={filterProjeto} onChange={e => setFilterProjeto(e.target.value)} className="cyber-input"
          style={{ padding: "0.45rem 0.8rem", fontSize: "0.8rem" }}>
          <option value="">Todos projetos</option>
          {projetos.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      {/* Timeline */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
        {events.length === 0 && (
          <div style={{ padding: "1.5rem", textAlign: "center", color: "#5a7a9a" }}>(sem events)</div>
        )}
        {events.map(e => {
          const c = colorForType(e.type);
          return (
            <div key={e.id} className="panel" style={{
              padding: "0.45rem 0.8rem", borderLeft: `2px solid ${c}`,
              fontFamily: "'Fira Code', monospace", fontSize: "0.76rem",
              display: "flex", gap: "0.7rem", alignItems: "center", flexWrap: "wrap",
            }}>
              <span style={{ color: "#5a7a9a", minWidth: 60 }}>{timeAgo(e.ts)}</span>
              <span style={{ color: c, fontWeight: 500 }}>{e.type}</span>
              {e.actor && <span style={{ color: "#e2e8f0" }}>{e.actor}</span>}
              {e.projeto && <span style={{ color: "#8ab4cc", fontSize: "0.7rem" }}>{e.projeto}</span>}
              {Object.keys(e.payload || {}).length > 0 && (
                <span style={{ color: "#a8c0dc", fontSize: "0.7rem", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {JSON.stringify(e.payload).slice(0, 200)}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
