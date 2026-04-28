"use client";

import { useEffect, useMemo, useState } from "react";
import type { Memory } from "@/lib/hub";

const TYPE_COLOR: Record<string, string> = {
  architectural_decision: "#22c55e",
  pattern:                "#a855f7",
  gotcha:                 "#ef4444",
  progress:               "#06b6d4",
  context:                "#fbbf24",
  personal:               "#8b5cf6",
};

function formatDate(s: string | null): string {
  if (!s) return "—";
  try {
    const d = new Date(s);
    return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return s.slice(0, 16);
  }
}

function timeAgo(s: string | null): string {
  if (!s) return "—";
  const d = new Date(s).getTime();
  const diff = (Date.now() - d) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

export function MemoryList({ initial }: { initial: Memory[] }) {
  const [memories, setMemories] = useState<Memory[]>(initial);
  const [filterType, setFilterType] = useState<string>("");
  const [filterScope, setFilterScope] = useState<string>("");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  // Polling adaptativo: 30s (idle)
  useEffect(() => {
    const t = setInterval(async () => {
      try {
        const params = new URLSearchParams();
        params.set("limit", "100");
        if (filterType) params.set("type", filterType);
        if (filterScope) params.set("scope", filterScope);
        const r = await fetch(`/painel/api/cerebro-proxy?path=/memory?${params.toString()}`);
        if (r.ok) {
          const data = (await r.json()) as Memory[];
          setMemories(data);
        }
      } catch {}
    }, 30_000);
    return () => clearInterval(t);
  }, [filterType, filterScope]);

  const types = useMemo(() => {
    const s = new Set(initial.map(m => m.type));
    return Array.from(s);
  }, [initial]);

  const filtered = useMemo(() => {
    return memories.filter(m => {
      if (filterType && m.type !== filterType) return false;
      if (filterScope && m.scope !== filterScope) return false;
      if (search) {
        const q = search.toLowerCase();
        const blob = (m.title + " " + m.content + " " + (m.tags || []).join(" ")).toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [memories, filterType, filterScope, search]);

  const stats = useMemo(() => {
    const byType: Record<string, number> = {};
    for (const m of memories) {
      byType[m.type] = (byType[m.type] || 0) + 1;
    }
    return byType;
  }, [memories]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      {/* Stats por tipo */}
      <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
        {Object.entries(stats).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
          <button
            key={type}
            onClick={() => setFilterType(filterType === type ? "" : type)}
            className="panel"
            style={{
              padding: "0.45rem 0.9rem",
              borderRadius: 6,
              cursor: "pointer",
              border: filterType === type ? `1px solid ${TYPE_COLOR[type] || "#06b6d4"}` : "1px solid #1a2840",
              background: filterType === type ? `${TYPE_COLOR[type] || "#06b6d4"}11` : "rgba(10,22,40,0.5)",
              color: TYPE_COLOR[type] || "#e2e8f0",
              fontFamily: "'Fira Code', monospace",
              fontSize: "0.78rem",
            }}
          >
            {type} <span style={{ opacity: 0.7, marginLeft: 6 }}>{count}</span>
          </button>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
        <input
          type="text"
          placeholder="Buscar título, conteúdo, tags..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="cyber-input"
          style={{ flex: 1, minWidth: 240, padding: "0.5rem 0.8rem", fontSize: "0.85rem" }}
        />
        <select
          value={filterScope}
          onChange={e => setFilterScope(e.target.value)}
          className="cyber-input"
          style={{ padding: "0.5rem 0.8rem", fontSize: "0.85rem" }}
        >
          <option value="">Todos os scopes</option>
          <option value="global">global</option>
          <option value="project">project</option>
          <option value="dev">dev</option>
          <option value="session">session</option>
        </select>
      </div>

      {/* Lista */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {filtered.length === 0 && (
          <div style={{ padding: "2rem", textAlign: "center", color: "#5a7a9a", fontFamily: "'Fira Code', monospace" }}>
            (nenhuma memória)
          </div>
        )}
        {filtered.map(m => {
          const isExpanded = expanded === m.id;
          const color = TYPE_COLOR[m.type] || "#06b6d4";
          return (
            <div
              key={m.id}
              onClick={() => setExpanded(isExpanded ? null : m.id)}
              className="panel repo-card"
              style={{
                padding: "0.85rem 1rem",
                cursor: "pointer",
                borderLeft: `3px solid ${color}`,
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", gap: "0.4rem", marginBottom: "0.3rem", flexWrap: "wrap" }}>
                    <span style={{
                      padding: "1px 6px", borderRadius: 3, fontSize: "0.66rem",
                      background: `${color}22`, color, fontFamily: "'Fira Code', monospace",
                    }}>
                      {m.type}
                    </span>
                    <span style={{
                      padding: "1px 6px", borderRadius: 3, fontSize: "0.66rem",
                      background: "#1a2840", color: "#8ab4cc", fontFamily: "'Fira Code', monospace",
                    }}>
                      {m.scope}{m.scope_ref ? `:${m.scope_ref.slice(-30)}` : ""}
                    </span>
                    <span style={{
                      padding: "1px 6px", borderRadius: 3, fontSize: "0.66rem",
                      background: "transparent", color: "#5a7a9a", fontFamily: "'Fira Code', monospace",
                    }}>
                      conf {m.confidence.toFixed(2)} · acc {m.access_count} · {timeAgo(m.created_at)}
                    </span>
                  </div>
                  <div style={{
                    fontFamily: "'Fira Sans', sans-serif", fontSize: "0.92rem",
                    fontWeight: 500, color: "#e2e8f0", lineHeight: 1.35,
                  }}>
                    {m.title}
                  </div>
                  {m.tags?.length > 0 && (
                    <div style={{ marginTop: "0.4rem", display: "flex", gap: "0.3rem", flexWrap: "wrap" }}>
                      {m.tags.slice(0, 6).map(t => (
                        <span key={t} style={{
                          fontSize: "0.65rem", padding: "1px 5px", borderRadius: 2,
                          background: "rgba(6,182,212,0.06)", color: "#06b6d4",
                          fontFamily: "'Fira Code', monospace",
                        }}>
                          {t.length > 30 ? t.slice(0, 30) + "…" : t}
                        </span>
                      ))}
                      {m.tags.length > 6 && (
                        <span style={{ fontSize: "0.65rem", color: "#5a7a9a" }}>+{m.tags.length - 6}</span>
                      )}
                    </div>
                  )}
                  {isExpanded && (
                    <div style={{
                      marginTop: "0.7rem", padding: "0.7rem", background: "rgba(2,6,23,0.6)",
                      borderRadius: 4, fontFamily: "'Fira Code', monospace", fontSize: "0.78rem",
                      color: "#a8c0dc", whiteSpace: "pre-wrap", maxHeight: 400, overflow: "auto",
                    }}>
                      {m.content}
                    </div>
                  )}
                </div>
                <div style={{
                  fontSize: "0.66rem", color: "#5a7a9a", fontFamily: "'Fira Code', monospace",
                  whiteSpace: "nowrap", textAlign: "right",
                }}>
                  {m.expires_at ? `exp ${timeAgo(m.expires_at)}` : "perm"}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
