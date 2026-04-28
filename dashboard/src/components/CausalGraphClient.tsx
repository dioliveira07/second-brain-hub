"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { CausalGraphData, CausalNode, CausalEdgeData } from "@/lib/hub";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false });

const NODE_COLOR: Record<string, string> = {
  // memories types
  architectural_decision: "#22c55e",
  pattern:                "#a855f7",
  gotcha:                 "#ef4444",
  progress:               "#06b6d4",
  context:                "#fbbf24",
  personal:               "#8b5cf6",
  // outras tabelas
  decision:               "#22c55e",
  // signal types
  arquivo_editado:        "#0ea5e9",
  commit_realizado:       "#0891b2",
  erro_bash:              "#f43f5e",
  skill_usada:            "#f59e0b",
};

const RELATION_COLOR: Record<string, string> = {
  triggered_by:  "#06b6d4",
  contradicts:   "#ef4444",
  reinforces:    "#22c55e",
  derived_from:  "#a855f7",
  references:    "#8ab4cc",
};

const TABLE_SHAPE: Record<string, "circle" | "rect"> = {
  memories: "circle",
  architectural_decisions: "rect",
  dev_signals: "circle",
  events: "circle",
};

type GraphNode = CausalNode & { x?: number; y?: number; vx?: number; vy?: number };
type GraphLink = CausalEdgeData & { source: string | GraphNode; target: string | GraphNode };

export function CausalGraphClient({ initial }: { initial: CausalGraphData }) {
  const [data, setData] = useState<CausalGraphData>(initial);
  const [filterRelation, setFilterRelation] = useState<string>("");
  const [selected, setSelected] = useState<CausalNode | null>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 800, h: 600 });
  const containerRef = useRef<HTMLDivElement>(null);

  // Resize observer
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        setSize({ w: e.contentRect.width, h: Math.max(420, e.contentRect.height) });
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Polling 30s
  useEffect(() => {
    const t = setInterval(async () => {
      try {
        const params = new URLSearchParams();
        params.set("limit", "300");
        if (filterRelation) params.set("relation", filterRelation);
        const r = await fetch(`/painel/api/cerebro-proxy?path=/causal/graph?${params.toString()}`);
        if (r.ok) setData((await r.json()) as CausalGraphData);
      } catch {}
    }, 30_000);
    return () => clearInterval(t);
  }, [filterRelation]);

  const filteredEdges = useMemo(() => {
    if (!filterRelation) return data.edges;
    return data.edges.filter(e => e.relation === filterRelation);
  }, [data.edges, filterRelation]);

  // Conta tipos
  const typeStats = useMemo(() => {
    const c: Record<string, number> = {};
    for (const n of data.nodes) c[n.type] = (c[n.type] || 0) + 1;
    return c;
  }, [data.nodes]);

  const relationStats = useMemo(() => {
    const c: Record<string, number> = {};
    for (const e of data.edges) c[e.relation] = (c[e.relation] || 0) + 1;
    return c;
  }, [data.edges]);

  const graphData = useMemo(() => ({
    nodes: data.nodes.map(n => ({ ...n })),
    links: filteredEdges.map(e => ({ ...e })),
  }), [data.nodes, filteredEdges]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", flex: 1, minHeight: 0 }}>
      {/* Stats e filtros */}
      <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: "0.7rem", color: "#5a7a9a", fontFamily: "'Fira Code', monospace", marginBottom: 4 }}>
            TIPOS DE NÓ
          </div>
          <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
            {Object.entries(typeStats).sort((a, b) => b[1] - a[1]).map(([t, c]) => (
              <span key={t} style={{
                padding: "2px 7px", borderRadius: 3, fontSize: "0.68rem",
                fontFamily: "'Fira Code', monospace",
                background: `${NODE_COLOR[t] || "#06b6d4"}22`,
                color: NODE_COLOR[t] || "#06b6d4",
              }}>
                {t} {c}
              </span>
            ))}
          </div>
        </div>
        <div>
          <div style={{ fontSize: "0.7rem", color: "#5a7a9a", fontFamily: "'Fira Code', monospace", marginBottom: 4 }}>
            RELAÇÕES (clique para filtrar)
          </div>
          <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
            {Object.entries(relationStats).sort((a, b) => b[1] - a[1]).map(([r, c]) => (
              <button key={r}
                onClick={() => setFilterRelation(filterRelation === r ? "" : r)}
                className="panel"
                style={{
                  padding: "2px 8px", borderRadius: 3, cursor: "pointer",
                  fontSize: "0.68rem", fontFamily: "'Fira Code', monospace",
                  border: filterRelation === r ? `1px solid ${RELATION_COLOR[r] || "#06b6d4"}` : "1px solid #1a2840",
                  background: filterRelation === r ? `${RELATION_COLOR[r] || "#06b6d4"}22` : "rgba(10,22,40,0.5)",
                  color: RELATION_COLOR[r] || "#8ab4cc",
                }}>
                {r} {c}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Container do grafo */}
      <div ref={containerRef} className="panel" style={{
        flex: 1, minHeight: 480, position: "relative", overflow: "hidden", borderRadius: 4,
        background: "rgba(2,6,23,0.6)",
      }}>
        {data.nodes.length === 0 ? (
          <div style={{
            position: "absolute", inset: 0, display: "flex", alignItems: "center",
            justifyContent: "center", color: "#5a7a9a", fontFamily: "'Fira Code', monospace",
            textAlign: "center", padding: "1rem",
          }}>
            (sem edges causais ainda — agentes vão criar à medida que rodam)
          </div>
        ) : (
          <ForceGraph2D
            graphData={graphData as { nodes: GraphNode[]; links: GraphLink[] }}
            width={size.w}
            height={size.h}
            backgroundColor="rgba(2,6,23,0)"
            nodeRelSize={5}
            linkColor={(l) => RELATION_COLOR[(l as GraphLink).relation] || "#8ab4cc"}
            linkWidth={(l) => 1 + ((l as GraphLink).confidence || 0.5) * 1.5}
            linkDirectionalArrowLength={6}
            linkDirectionalArrowRelPos={1}
            linkDirectionalParticles={(l) => ((l as GraphLink).relation === "contradicts" ? 2 : 0)}
            linkDirectionalParticleSpeed={0.006}
            linkDirectionalParticleColor={() => "#ef4444"}
            nodeCanvasObjectMode={() => "after"}
            nodeCanvasObject={(node, ctx, globalScale) => {
              const n = node as GraphNode;
              const color = NODE_COLOR[n.type] || "#06b6d4";
              const r = 6;
              ctx.beginPath();
              if (TABLE_SHAPE[n.table] === "rect") {
                ctx.rect((n.x || 0) - r, (n.y || 0) - r, r * 2, r * 2);
              } else {
                ctx.arc(n.x || 0, n.y || 0, r, 0, 2 * Math.PI);
              }
              ctx.fillStyle = color;
              ctx.fill();
              if (selected?.id === n.id) {
                ctx.strokeStyle = "#fff";
                ctx.lineWidth = 2 / globalScale;
                ctx.stroke();
              }
              if (globalScale > 1.2) {
                ctx.font = `${10 / globalScale}px 'Fira Sans', sans-serif`;
                ctx.fillStyle = "#e2e8f0";
                ctx.textAlign = "left";
                ctx.fillText(n.label.slice(0, 50), (n.x || 0) + r + 2, (n.y || 0) + 3);
              }
            }}
            onNodeClick={(node) => setSelected(node as CausalNode)}
            cooldownTicks={100}
            d3VelocityDecay={0.3}
          />
        )}
      </div>

      {/* Painel do nó selecionado */}
      {selected && (
        <div className="panel" style={{
          padding: "0.85rem 1rem", borderLeft: `3px solid ${NODE_COLOR[selected.type] || "#06b6d4"}`,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem" }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", gap: "0.4rem", marginBottom: "0.4rem", flexWrap: "wrap" }}>
                <span style={{
                  padding: "1px 7px", borderRadius: 3, fontSize: "0.68rem",
                  background: `${NODE_COLOR[selected.type] || "#06b6d4"}22`,
                  color: NODE_COLOR[selected.type] || "#06b6d4",
                  fontFamily: "'Fira Code', monospace",
                }}>{selected.type}</span>
                <span style={{
                  padding: "1px 7px", borderRadius: 3, fontSize: "0.68rem",
                  background: "#1a2840", color: "#8ab4cc", fontFamily: "'Fira Code', monospace",
                }}>{selected.table}</span>
                <span style={{ fontSize: "0.68rem", color: "#5a7a9a", fontFamily: "'Fira Code', monospace" }}>
                  {selected.id.slice(0, 8)}
                </span>
              </div>
              <div style={{ fontFamily: "'Fira Sans', sans-serif", color: "#e2e8f0", fontSize: "0.92rem" }}>
                {selected.label}
              </div>
              <pre style={{
                marginTop: "0.5rem", fontSize: "0.7rem", color: "#a8c0dc",
                fontFamily: "'Fira Code', monospace", whiteSpace: "pre-wrap",
                background: "rgba(2,6,23,0.4)", padding: "0.5rem", borderRadius: 3,
                maxHeight: 150, overflow: "auto",
              }}>
                {JSON.stringify(selected.meta, null, 2)}
              </pre>
            </div>
            <button onClick={() => setSelected(null)} style={{
              background: "transparent", border: "1px solid #1a2840", color: "#5a7a9a",
              padding: "0.25rem 0.6rem", borderRadius: 3, cursor: "pointer",
              fontFamily: "'Fira Code', monospace", fontSize: "0.7rem",
            }}>×</button>
          </div>
        </div>
      )}
    </div>
  );
}
