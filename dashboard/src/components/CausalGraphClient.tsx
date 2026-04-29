"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { X, ArrowRight } from "lucide-react";
import type { CausalGraphData, CausalNode, CausalEdgeData } from "@/lib/hub";

// ─── Paleta ──────────────────────────────────────────────────────────────────

const NODE_COLOR: Record<string, string> = {
  architectural_decision: "#22c55e",
  pattern:                "#a78bfa",
  gotcha:                 "#f87171",
  progress:               "#06b6d4",
  context:                "#fbbf24",
  personal:               "#a855f7",
  decision:               "#22c55e",
  arquivo_editado:        "#0ea5e9",
  commit_realizado:       "#0891b2",
  erro_bash:              "#fb7185",
  skill_usada:            "#fb923c",
};

const RELATION_COLOR: Record<string, string> = {
  triggered_by: "#06b6d4",
  contradicts:  "#f87171",
  reinforces:   "#22c55e",
  derived_from: "#a78bfa",
  references:   "#94a3b8",
};

const TABLE_LABEL: Record<string, string> = {
  memories:                "Memória",
  architectural_decisions: "Decisão",
  dev_signals:             "Sinal",
  events:                  "Evento",
};

const TABLE_ICON: Record<string, string> = {
  memories:                "◈",
  architectural_decisions: "▣",
  dev_signals:             "◇",
  events:                  "○",
};

// ─── Sidebar ─────────────────────────────────────────────────────────────────

function NodeSidebar({
  node, edgesIn, edgesOut, nodesById, onClose, onNavigate,
}: {
  node: CausalNode;
  edgesIn: CausalEdgeData[];
  edgesOut: CausalEdgeData[];
  nodesById: Record<string, CausalNode>;
  onClose: () => void;
  onNavigate: (id: string) => void;
}) {
  const accent     = NODE_COLOR[node.type] || "#06b6d4";
  const tableLabel = TABLE_LABEL[node.table] || node.table;
  const tableIcon  = TABLE_ICON[node.table] || "•";
  const meta       = node.meta as Record<string, unknown>;
  const confidence = meta.confidence as number | undefined;
  const scope      = meta.scope as string | undefined;
  const scope_ref  = meta.scope_ref as string | undefined;
  const dev        = meta.dev as string | undefined;
  const repo       = meta.repo as string | undefined;
  const fullContent = (meta as { content?: string }).content;

  return (
    <div style={{
      position: "absolute", top: 0, right: 0, bottom: 0, width: 320,
      background: "rgba(2,6,23,0.97)", borderLeft: `1px solid ${accent}30`,
      backdropFilter: "blur(20px)", display: "flex", flexDirection: "column",
      zIndex: 30, animation: "fade-left 0.2s cubic-bezier(.16,1,.3,1) both",
    }}>
      <div style={{ height: 1, background: `linear-gradient(90deg, transparent, ${accent}88, transparent)` }} />
      <div style={{ padding: "1rem", borderBottom: `1px solid ${accent}18`, display: "flex", alignItems: "flex-start", gap: "0.5rem" }}>
        <div style={{ width: 36, height: 36, borderRadius: 8, background: `${accent}12`, border: `1px solid ${accent}33`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2, fontFamily: "var(--mono)", fontSize: "1.2rem", color: accent }}>
          {tableIcon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: "0.7rem", color: accent, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "0.2rem" }}>
            {tableLabel} · {node.type}
          </div>
          <div style={{ fontFamily: "var(--mono)", fontSize: "0.85rem", fontWeight: 600, color: "var(--text)", lineHeight: 1.35, wordBreak: "break-word" }}>
            {node.label}
          </div>
          <div style={{ fontFamily: "var(--mono)", fontSize: "0.66rem", color: "var(--muted-foreground)", marginTop: 4 }}>
            {node.id.slice(0, 8)}
          </div>
        </div>
        <button onClick={onClose} style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--dim)", padding: 4, flexShrink: 0 }}>
          <X size={15} />
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "0.85rem 1rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
          {scope && <span style={{ fontFamily: "var(--mono)", fontSize: "0.66rem", color: "#06b6d4", background: "rgba(6,182,212,0.12)", border: "1px solid rgba(6,182,212,0.3)", borderRadius: 4, padding: "1px 7px" }}>{scope}{scope_ref ? `:${scope_ref.slice(-30)}` : ""}</span>}
          {confidence !== undefined && <span style={{ fontFamily: "var(--mono)", fontSize: "0.66rem", color: "#fbbf24", background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.3)", borderRadius: 4, padding: "1px 7px" }}>conf {confidence.toFixed(2)}</span>}
          {repo && <span style={{ fontFamily: "var(--mono)", fontSize: "0.66rem", color: "#94a3b8", background: "rgba(148,163,184,0.1)", border: "1px solid rgba(148,163,184,0.25)", borderRadius: 4, padding: "1px 7px" }}>{repo}</span>}
          {dev && <span style={{ fontFamily: "var(--mono)", fontSize: "0.66rem", color: "#a78bfa", background: "rgba(167,139,250,0.12)", border: "1px solid rgba(167,139,250,0.3)", borderRadius: 4, padding: "1px 7px" }}>dev:{dev}</span>}
        </div>

        {fullContent && (
          <div style={{ fontFamily: "var(--mono)", fontSize: "0.75rem", color: "var(--muted-foreground)", lineHeight: 1.6, background: "rgba(255,255,255,0.03)", borderRadius: 6, padding: "0.75rem", border: "1px solid rgba(255,255,255,0.06)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            {fullContent}
          </div>
        )}

        {edgesIn.length > 0 && (
          <div>
            <div style={{ fontFamily: "var(--mono)", fontSize: "0.66rem", color: "var(--dim)", letterSpacing: "0.08em", marginBottom: "0.5rem" }}>RECEBE DE</div>
            {edgesIn.slice(0, 6).map(e => {
              const src = nodesById[e.source];
              return src ? (
                <button key={e.id} onClick={() => onNavigate(e.source)} style={{ display: "flex", alignItems: "center", gap: "0.5rem", width: "100%", background: "none", border: "none", cursor: "pointer", padding: "0.3rem 0", color: RELATION_COLOR[e.relation] || "#94a3b8", textAlign: "left" }}>
                  <ArrowRight size={11} />
                  <span style={{ fontFamily: "var(--mono)", fontSize: "0.72rem", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{src.label}</span>
                  <span style={{ fontFamily: "var(--mono)", fontSize: "0.6rem", opacity: 0.6 }}>{e.relation}</span>
                </button>
              ) : null;
            })}
          </div>
        )}

        {edgesOut.length > 0 && (
          <div>
            <div style={{ fontFamily: "var(--mono)", fontSize: "0.66rem", color: "var(--dim)", letterSpacing: "0.08em", marginBottom: "0.5rem" }}>APONTA PARA</div>
            {edgesOut.slice(0, 6).map(e => {
              const tgt = nodesById[e.target];
              return tgt ? (
                <button key={e.id} onClick={() => onNavigate(e.target)} style={{ display: "flex", alignItems: "center", gap: "0.5rem", width: "100%", background: "none", border: "none", cursor: "pointer", padding: "0.3rem 0", color: RELATION_COLOR[e.relation] || "#94a3b8", textAlign: "left" }}>
                  <ArrowRight size={11} />
                  <span style={{ fontFamily: "var(--mono)", fontSize: "0.72rem", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tgt.label}</span>
                  <span style={{ fontFamily: "var(--mono)", fontSize: "0.6rem", opacity: 0.6 }}>{e.relation}</span>
                </button>
              ) : null;
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function CausalGraphClient({ initial }: { initial: CausalGraphData }) {
  const [data, setData]               = useState<CausalGraphData>(initial);
  const [filterRelation, setFilter]   = useState<string>("");
  const [selected, setSelected]       = useState<CausalNode | null>(null);
  const containerRef                  = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sigmaRef                      = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const graphRef                      = useRef<any>(null);
  const layoutRef                     = useRef<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const selectedRef                   = useRef<CausalNode | null>(null);

  useEffect(() => { selectedRef.current = selected; }, [selected]);

  const nodesById = useMemo(() => {
    const m: Record<string, CausalNode> = {};
    for (const n of data.nodes) m[n.id] = n;
    return m;
  }, [data.nodes]);

  const { edgesIn, edgesOut } = useMemo(() => {
    if (!selected) return { edgesIn: [], edgesOut: [] };
    return {
      edgesIn:  data.edges.filter(e => e.target === selected.id),
      edgesOut: data.edges.filter(e => e.source === selected.id),
    };
  }, [selected, data.edges]);

  const filteredEdges = useMemo(() => {
    if (!filterRelation) return data.edges;
    return data.edges.filter(e => e.relation === filterRelation);
  }, [data.edges, filterRelation]);

  const relationStats = useMemo(() => {
    const c: Record<string, number> = {};
    for (const e of data.edges) c[e.relation] = (c[e.relation] || 0) + 1;
    return c;
  }, [data.edges]);

  const typeStats = useMemo(() => {
    const c: Record<string, number> = {};
    for (const n of data.nodes) c[n.type] = (c[n.type] || 0) + 1;
    return c;
  }, [data.nodes]);

  // ── Inicializa sigma ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;

    (async () => {
      const [{ default: Graph }, { Sigma }, { default: FA2 }] = await Promise.all([
        import("graphology"),
        import("sigma"),
        import("graphology-layout-forceatlas2"),
      ]);
      if (cancelled) return;

      const el = containerRef.current!;
      const { width, height } = el.getBoundingClientRect();
      console.log("[sigma] container:", width, height, "nodes:", data.nodes.length, "edges:", filteredEdges.length);
      if (width === 0 || height === 0) {
        console.warn("[sigma] container sem dimensões — abortando");
        return;
      }

      // Constrói grafo graphology
      const graph = new Graph({ multi: false, type: "directed" });

      const visibleIds = filterRelation
        ? new Set(filteredEdges.flatMap(e => [e.source, e.target]))
        : null;

      for (const n of data.nodes) {
        if (visibleIds && !visibleIds.has(n.id)) continue;
        const color = NODE_COLOR[n.type] || "#06b6d4";
        const isDecision = n.table === "architectural_decisions";
        graph.addNode(n.id, {
          label: isDecision ? n.label.slice(0, 28) : "",
          size:  isDecision ? 16 : n.table === "memories" ? 9 : 5,
          color,
          x:     Math.random() * 1000,
          y:     Math.random() * 1000,
        });
      }

      for (const e of filteredEdges) {
        if (!graph.hasNode(e.source) || !graph.hasNode(e.target)) continue;
        if (graph.hasEdge(e.source, e.target)) continue;
        graph.addEdge(e.source, e.target, {
          color:  `${RELATION_COLOR[e.relation] || "#94a3b8"}88`,
          size:   1 + (e.confidence || 0.5),
          type:   "arrow",
        });
      }

      // Layout inicial — ForceAtlas2 assíncrono
      FA2.assign(graph, {
        iterations: 50,
        settings: {
          gravity:           1,
          scalingRatio:      4,
          slowDown:          8,
          barnesHutOptimize: graph.order > 300,
        },
      });

      if (cancelled) return;

      // Renderer sigma WebGL
      const sigma = new Sigma(graph, containerRef.current!, {
        renderEdgeLabels:      false,
        defaultEdgeType:       "arrow",
        labelFont:             "'Fira Code', monospace",
        labelSize:             11,
        labelColor:            { color: "#8ab4cc" },
        labelRenderedSizeThreshold: 6,
        enableEdgeEvents: false,
      });

      // Clique em nó
      sigma.on("clickNode", ({ node }) => {
        const n = nodesById[node];
        if (n) setSelected(n);
      });

      sigma.on("clickStage", () => setSelected(null));

      // Destaque ao selecionar
      sigma.setSetting("nodeReducer", (node, data) => {
        const sel = selectedRef.current;
        if (!sel) return data;
        if (node === sel.id) return { ...data, size: (data.size as number) * 1.8, zIndex: 1 };
        return { ...data, color: `${data.color as string}44` };
      });

      graphRef.current = graph;
      sigmaRef.current = sigma;
    })();

    return () => {
      cancelled = true;
      layoutRef.current?.stop?.();
      sigmaRef.current?.kill?.();
      sigmaRef.current = null;
      graphRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, filteredEdges]);

  // Atualiza nodeReducer quando selected muda
  useEffect(() => {
    const sigma = sigmaRef.current;
    if (!sigma) return;
    sigma.setSetting("nodeReducer", (node: string, nodeData: Record<string, unknown>) => {
      if (!selected) return nodeData;
      if (node === selected.id) return { ...nodeData, size: (nodeData.size as number) * 1.8, zIndex: 1 };
      return { ...nodeData, color: `${nodeData.color as string}44` };
    });
    sigma.refresh();
  }, [selected]);

  // Polling 60s
  useEffect(() => {
    const t = setInterval(async () => {
      try {
        const params = new URLSearchParams({ limit: "2000" });
        if (filterRelation) params.set("relation", filterRelation);
        const r = await fetch(`/painel/api/cerebro-proxy?path=/causal/graph?${params}`);
        if (!r.ok) return;
        const fresh = (await r.json()) as CausalGraphData;
        setData(prev => {
          if (prev.nodes.length === fresh.nodes.length && prev.edges.length === fresh.edges.length) return prev;
          return fresh;
        });
      } catch {}
    }, 60_000);
    return () => clearInterval(t);
  }, [filterRelation]);

  const handleNavigate = useCallback((id: string) => {
    const n = nodesById[id];
    if (n) setSelected(n);
    // Centraliza sigma no nó
    const sigma = sigmaRef.current;
    if (sigma && graphRef.current?.hasNode(id)) {
      const pos = sigma.getNodeDisplayedData(id);
      if (pos) sigma.getCamera().animate({ x: pos.x, y: pos.y, ratio: 0.3 }, { duration: 500 });
    }
  }, [nodesById]);

  return (
    <div style={{ flex: 1, position: "relative", overflow: "hidden", display: "flex", flexDirection: "column", borderRadius: 4, background: "rgba(2,6,23,0.6)" }}>

      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.5rem 0.75rem", borderBottom: "1px solid #1a2840", flexShrink: 0, flexWrap: "wrap" }}>
        <span style={{ fontFamily: "var(--mono)", fontSize: "0.65rem", color: "#4a6a8a", letterSpacing: "0.08em" }}>
          {data.nodes.length} nodes · {data.edges.length} edges
        </span>
        <div style={{ flex: 1 }} />
        {/* Filtro por relação */}
        {Object.entries(relationStats).map(([rel, count]) => (
          <button key={rel} onClick={() => setFilter(f => f === rel ? "" : rel)} style={{ background: filterRelation === rel ? `${RELATION_COLOR[rel] || "#94a3b8"}22` : "none", border: `1px solid ${filterRelation === rel ? RELATION_COLOR[rel] || "#94a3b8" : "#1a2840"}`, color: RELATION_COLOR[rel] || "#94a3b8", borderRadius: 4, padding: "2px 8px", fontFamily: "var(--mono)", fontSize: "0.6rem", cursor: "pointer" }}>
            {rel} {count}
          </button>
        ))}
        {/* Filtro por tipo */}
        {Object.entries(typeStats).slice(0, 5).map(([type, count]) => (
          <span key={type} style={{ fontFamily: "var(--mono)", fontSize: "0.6rem", color: NODE_COLOR[type] || "#94a3b8", background: `${NODE_COLOR[type] || "#94a3b8"}11`, border: `1px solid ${NODE_COLOR[type] || "#94a3b8"}33`, borderRadius: 4, padding: "2px 8px" }}>
            {type.split("_")[0]} {count}
          </span>
        ))}
      </div>

      {/* Canvas sigma */}
      <div ref={containerRef} style={{ flex: 1, minHeight: 0, minWidth: 0, position: "relative", height: "100%" }} />

      {/* Sidebar */}
      {selected && (
        <NodeSidebar
          node={selected}
          edgesIn={edgesIn}
          edgesOut={edgesOut}
          nodesById={nodesById}
          onClose={() => setSelected(null)}
          onNavigate={handleNavigate}
        />
      )}
    </div>
  );
}
