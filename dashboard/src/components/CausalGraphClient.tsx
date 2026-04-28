"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { X, ArrowRight } from "lucide-react";
import type { CausalGraphData, CausalNode, CausalEdgeData } from "@/lib/hub";

// ─── Paleta cyberpunk (alinhada com /graph) ──────────────────────────────────

const NODE_COLOR: Record<string, string> = {
  // memory types
  architectural_decision: "#22c55e",  // green — decisão sólida
  pattern:                "#a78bfa",  // violet — padrão emergente
  gotcha:                 "#f87171",  // red — perigo
  progress:               "#06b6d4",  // cyan — progresso
  context:                "#fbbf24",  // amber — contexto
  personal:               "#a855f7",  // purple — pessoal
  // architectural_decisions table
  decision:               "#22c55e",
  // dev_signals types
  arquivo_editado:        "#0ea5e9",  // sky
  commit_realizado:       "#0891b2",  // teal
  erro_bash:              "#fb7185",  // rose
  skill_usada:            "#fb923c",  // orange
};

const RELATION_COLOR: Record<string, string> = {
  triggered_by:  "#06b6d4",  // cyan
  contradicts:   "#f87171",  // red — alerta
  reinforces:    "#22c55e",  // green
  derived_from:  "#a78bfa",  // violet
  references:    "#94a3b8",  // slate
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
  node,
  edgesIn,
  edgesOut,
  nodesById,
  onClose,
  onNavigate,
}: {
  node: CausalNode;
  edgesIn: CausalEdgeData[];
  edgesOut: CausalEdgeData[];
  nodesById: Record<string, CausalNode>;
  onClose: () => void;
  onNavigate: (id: string) => void;
}) {
  const accent = NODE_COLOR[node.type] || "#06b6d4";
  const tableLabel = TABLE_LABEL[node.table] || node.table;
  const tableIcon = TABLE_ICON[node.table] || "•";

  const meta = node.meta as Record<string, unknown>;
  const tags = (meta.tags as string[] | undefined) || [];
  const confidence = meta.confidence as number | undefined;
  const scope = meta.scope as string | undefined;
  const scope_ref = meta.scope_ref as string | undefined;
  const projeto = meta.projeto as string | undefined;
  const dev = meta.dev as string | undefined;
  const ts = meta.ts as string | undefined;
  const repo = meta.repo as string | undefined;
  const pr_number = meta.pr_number as number | undefined;
  const impact_areas = (meta.impact_areas as string[] | undefined) || [];
  const breaking = meta.breaking_changes as boolean | undefined;
  const actor = meta.actor as string | undefined;

  const fullContent = (meta as { content?: string }).content;

  return (
    <div
      style={{
        position:       "absolute",
        top:            0, right: 0, bottom: 0,
        width:          320,
        background:     "rgba(2,6,23,0.97)",
        borderLeft:     `1px solid ${accent}30`,
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        display:        "flex",
        flexDirection:  "column",
        zIndex:         30,
        animation:      "fade-left 0.2s cubic-bezier(.16,1,.3,1) both",
        boxShadow:      `-8px 0 32px ${accent}10`,
      }}
    >
      {/* Linha neon no topo */}
      <div style={{ height: 1, background: `linear-gradient(90deg, transparent, ${accent}88, transparent)` }} />

      {/* Header */}
      <div style={{ padding: "1rem", borderBottom: `1px solid ${accent}18`, display: "flex", alignItems: "flex-start", gap: "0.5rem" }}>
        <div style={{
          width: 36, height: 36, borderRadius: 8,
          background: `${accent}12`, border: `1px solid ${accent}33`,
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0, marginTop: 2,
          fontFamily: "var(--mono)", fontSize: "1.2rem", color: accent,
        }}>
          {tableIcon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: "var(--mono)", fontSize: "0.7rem", color: accent,
            letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "0.2rem",
          }}>
            {tableLabel} · {node.type}
          </div>
          <div style={{
            fontFamily: "var(--mono)", fontSize: "0.85rem", fontWeight: 600,
            color: "var(--text)", lineHeight: 1.35,
            textShadow: `0 0 10px ${accent}44`, wordBreak: "break-word",
          }}>
            {node.label}
          </div>
          <div style={{ fontFamily: "var(--mono)", fontSize: "0.66rem", color: "var(--muted-foreground)", marginTop: 4 }}>
            {node.id.slice(0, 8)}
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            background: "transparent", border: "none", cursor: "pointer",
            color: "var(--dim)", padding: 4, flexShrink: 0,
          }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = accent)}
          onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--dim)")}
        >
          <X size={15} />
        </button>
      </div>

      {/* Body */}
      <div style={{
        flex: 1, overflowY: "auto", padding: "0.85rem 1rem",
        display: "flex", flexDirection: "column", gap: "1rem",
      }}>
        {/* Badges meta */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
          {scope && (
            <span style={{
              fontFamily: "var(--mono)", fontSize: "0.66rem", color: "#06b6d4",
              background: "rgba(6,182,212,0.12)", border: "1px solid rgba(6,182,212,0.3)",
              borderRadius: 4, padding: "1px 7px", letterSpacing: "0.06em",
            }}>
              {scope}{scope_ref ? `:${scope_ref.slice(-30)}` : ""}
            </span>
          )}
          {confidence !== undefined && (
            <span style={{
              fontFamily: "var(--mono)", fontSize: "0.66rem", color: "#fbbf24",
              background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.3)",
              borderRadius: 4, padding: "1px 7px",
            }}>
              conf {confidence.toFixed(2)}
            </span>
          )}
          {projeto && (
            <span style={{
              fontFamily: "var(--mono)", fontSize: "0.66rem", color: "#94a3b8",
              background: "rgba(148,163,184,0.1)", border: "1px solid rgba(148,163,184,0.25)",
              borderRadius: 4, padding: "1px 7px",
            }}>
              {projeto}
            </span>
          )}
          {repo && (
            <span style={{
              fontFamily: "var(--mono)", fontSize: "0.66rem", color: "#94a3b8",
              background: "rgba(148,163,184,0.1)", border: "1px solid rgba(148,163,184,0.25)",
              borderRadius: 4, padding: "1px 7px",
            }}>
              {repo}
            </span>
          )}
          {dev && (
            <span style={{
              fontFamily: "var(--mono)", fontSize: "0.66rem", color: "#a78bfa",
              background: "rgba(167,139,250,0.12)", border: "1px solid rgba(167,139,250,0.3)",
              borderRadius: 4, padding: "1px 7px",
            }}>
              dev:{dev}
            </span>
          )}
          {actor && (
            <span style={{
              fontFamily: "var(--mono)", fontSize: "0.66rem", color: "#a78bfa",
              background: "rgba(167,139,250,0.12)", border: "1px solid rgba(167,139,250,0.3)",
              borderRadius: 4, padding: "1px 7px",
            }}>
              actor:{actor}
            </span>
          )}
          {pr_number && (
            <span style={{
              fontFamily: "var(--mono)", fontSize: "0.66rem", color: "#22c55e",
              background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.3)",
              borderRadius: 4, padding: "1px 7px",
            }}>
              PR #{pr_number}
            </span>
          )}
          {breaking && (
            <span style={{
              fontFamily: "var(--mono)", fontSize: "0.66rem", color: "#f87171",
              background: "rgba(248,113,113,0.12)", border: "1px solid rgba(248,113,113,0.3)",
              borderRadius: 4, padding: "1px 7px",
            }}>
              BREAKING
            </span>
          )}
        </div>

        {/* Tags */}
        {tags.length > 0 && (
          <div>
            <div style={{
              fontFamily: "var(--mono)", fontSize: "0.66rem", color: "var(--dim)",
              letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6,
            }}>
              Tags
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem" }}>
              {tags.slice(0, 12).map((t) => (
                <span key={t} style={{
                  fontFamily: "var(--mono)", fontSize: "0.66rem", color: "#64748b",
                  background: "rgba(100,116,139,0.08)", border: "1px solid rgba(100,116,139,0.18)",
                  borderRadius: 3, padding: "1px 6px",
                }}>
                  {t.length > 32 ? t.slice(0, 32) + "…" : t}
                </span>
              ))}
              {tags.length > 12 && (
                <span style={{ fontSize: "0.66rem", color: "var(--dim)" }}>+{tags.length - 12}</span>
              )}
            </div>
          </div>
        )}

        {/* Impact areas (decisions) */}
        {impact_areas.length > 0 && (
          <div>
            <div style={{
              fontFamily: "var(--mono)", fontSize: "0.66rem", color: "var(--dim)",
              letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6,
            }}>
              Áreas de impacto
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem" }}>
              {impact_areas.map((a) => (
                <span key={a} style={{
                  fontFamily: "var(--mono)", fontSize: "0.7rem", color: "#22c55e",
                  background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.25)",
                  borderRadius: 4, padding: "1px 7px",
                }}>
                  {a}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Conteúdo da memória (se tiver) */}
        {fullContent && fullContent.length > 0 && (
          <div>
            <div style={{
              fontFamily: "var(--mono)", fontSize: "0.66rem", color: "var(--dim)",
              letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6,
            }}>
              Conteúdo
            </div>
            <pre style={{
              fontFamily: "var(--mono)", fontSize: "0.72rem", color: "#a8c0dc",
              background: "rgba(2,6,23,0.5)", border: `1px solid ${accent}18`,
              borderRadius: 4, padding: "0.6rem 0.7rem",
              whiteSpace: "pre-wrap", maxHeight: 220, overflow: "auto", margin: 0,
              lineHeight: 1.4,
            }}>
              {fullContent}
            </pre>
          </div>
        )}

        {ts && (
          <div style={{ fontFamily: "var(--mono)", fontSize: "0.7rem", color: "var(--muted-foreground)" }}>
            ts: {new Date(ts).toLocaleString("pt-BR")}
          </div>
        )}

        {/* Edges in (causes) */}
        {edgesIn.length > 0 && (
          <div>
            <div style={{
              fontFamily: "var(--mono)", fontSize: "0.66rem", color: "var(--dim)",
              letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6,
            }}>
              ◀ Causas ({edgesIn.length})
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {edgesIn.map((e) => {
                const causeNode = nodesById[e.source];
                if (!causeNode) return null;
                const c = NODE_COLOR[causeNode.type] || "#06b6d4";
                const r = RELATION_COLOR[e.relation] || "#94a3b8";
                return (
                  <button key={e.id}
                    onClick={() => onNavigate(causeNode.id)}
                    style={{
                      textAlign: "left", display: "flex", alignItems: "center", gap: 6,
                      padding: "5px 8px", borderRadius: 4, cursor: "pointer",
                      background: "rgba(10,22,40,0.5)", border: `1px solid ${c}22`,
                      fontFamily: "var(--mono)", fontSize: "0.7rem",
                    }}
                  >
                    <span style={{ color: r, fontSize: "0.62rem", fontWeight: 600 }}>{e.relation}</span>
                    <ArrowRight size={10} color={r} />
                    <span style={{ color: c, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {causeNode.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Edges out (effects) */}
        {edgesOut.length > 0 && (
          <div>
            <div style={{
              fontFamily: "var(--mono)", fontSize: "0.66rem", color: "var(--dim)",
              letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6,
            }}>
              Efeitos ({edgesOut.length}) ▶
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {edgesOut.map((e) => {
                const effectNode = nodesById[e.target];
                if (!effectNode) return null;
                const c = NODE_COLOR[effectNode.type] || "#06b6d4";
                const r = RELATION_COLOR[e.relation] || "#94a3b8";
                return (
                  <button key={e.id}
                    onClick={() => onNavigate(effectNode.id)}
                    style={{
                      textAlign: "left", display: "flex", alignItems: "center", gap: 6,
                      padding: "5px 8px", borderRadius: 4, cursor: "pointer",
                      background: "rgba(10,22,40,0.5)", border: `1px solid ${c}22`,
                      fontFamily: "var(--mono)", fontSize: "0.7rem",
                    }}
                  >
                    <span style={{ color: r, fontSize: "0.62rem", fontWeight: 600 }}>{e.relation}</span>
                    <ArrowRight size={10} color={r} />
                    <span style={{ color: c, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {effectNode.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Transform p/ G6 ─────────────────────────────────────────────────────────

function buildIcon(node: CausalNode): string {
  return TABLE_ICON[node.table] || "•";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function transformData(nodes: CausalNode[], edges: CausalEdgeData[]): any {
  const g6Nodes = nodes.map((n) => {
    const color = NODE_COLOR[n.type] || "#06b6d4";
    const isMemory = n.table === "memories";
    const isDecision = n.table === "architectural_decisions";
    const size = isDecision ? 50 : isMemory ? 42 : 30;

    return {
      id: n.id,
      style: {
        size,
        fill: `${color}0d`,
        stroke: color,
        lineWidth: isDecision ? 2.5 : isMemory ? 2 : 1.5,
        shadowColor: color,
        shadowBlur: isDecision ? 22 : isMemory ? 16 : 8,

        label: isDecision || isMemory,
        labelText: n.label.length > 38 ? n.label.slice(0, 38) + "…" : n.label,
        labelFill: color,
        labelFontFamily: "'Fira Code', monospace",
        labelFontSize: isDecision ? 11 : 10,
        labelMaxWidth: 200,
        labelOffsetY: isDecision ? 8 : 6,
        labelWordWrap: false,
        labelBackground: true,
        labelBackgroundFill: "rgba(2,6,23,0.85)",
        labelBackgroundRadius: 3,
        labelBackgroundPadding: [2, 7, 2, 7],

        iconText: buildIcon(n),
        iconFill: color,
        iconFontSize: isDecision ? 14 : 12,
        iconFontFamily: "'Fira Code', monospace",
      },
      data: { ...n, originalLabel: n.label },
    };
  });

  const g6Edges = edges.map((e, i) => {
    const color = RELATION_COLOR[e.relation] || "#94a3b8";
    const isContradicts = e.relation === "contradicts";

    return {
      id: `edge-${i}`,
      source: e.source,
      target: e.target,
      style: {
        stroke: `${color}55`,
        lineWidth: isContradicts ? 1.5 : 1,
        opacity: 0.75,
        lineDash: isContradicts ? [4, 4] : [6, 5],
        shadowColor: color,
        shadowBlur: isContradicts ? 5 : 3,
        endArrow: true,
        endArrowFill: color,
        endArrowSize: 6,
      },
      data: { relation: e.relation, confidence: e.confidence, edgeId: e.id },
    };
  });

  return { nodes: g6Nodes, edges: g6Edges };
}

// ─── Main ────────────────────────────────────────────────────────────────────

export function CausalGraphClient({ initial }: { initial: CausalGraphData }) {
  const [data, setData] = useState<CausalGraphData>(initial);
  const [filterRelation, setFilterRelation] = useState<string>("");
  const [selected, setSelected] = useState<CausalNode | null>(null);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const graphRef = useRef<any>(null);

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
    return data.edges.filter((e) => e.relation === filterRelation);
  }, [data.edges, filterRelation]);

  const visibleNodeIds = useMemo(() => {
    const s = new Set<string>();
    for (const e of filteredEdges) {
      s.add(e.source);
      s.add(e.target);
    }
    return s;
  }, [filteredEdges]);

  const visibleNodes = useMemo(() => {
    if (!filterRelation) return data.nodes;
    return data.nodes.filter((n) => visibleNodeIds.has(n.id));
  }, [data.nodes, visibleNodeIds, filterRelation]);

  const nodesById = useMemo(() => {
    const m: Record<string, CausalNode> = {};
    for (const n of data.nodes) m[n.id] = n;
    return m;
  }, [data.nodes]);

  // Stats
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

  // Setup G6
  useEffect(() => {
    if (!containerRef.current) {
      setLoading(false);
      return;
    }

    let destroyed = false;

    const init = async () => {
      try {
        const { Graph } = await import("@antv/g6");
        if (destroyed) return;

        const el = containerRef.current!;
        const width = el.clientWidth || 900;
        const height = el.clientHeight || 600;

        const graph = new Graph({
          container: el,
          width,
          height,
          autoResize: true,
          autoFit: "center",
          background: "transparent",
          data: transformData(visibleNodes, filteredEdges),
          layout: {
            type: "force",
            preventOverlap: true,
            nodeSize: 60,
            linkDistance: 150,
            nodeStrength: -200,
            edgeStrength: 0.4,
            damping: 0.35,
          },
          node: {
            type: "circle",
            state: {
              active: { label: true, lineWidth: 3, shadowBlur: 28, zIndex: 100 },
              selected: {
                label: true, lineWidth: 3, shadowBlur: 32,
                stroke: "#fbbf24", shadowColor: "#fbbf24", zIndex: 100,
              },
              inactive: { opacity: 0.18, shadowBlur: 0 },
            },
          },
          edge: {
            type: "quadratic",
            state: {
              active: { opacity: 0.95, lineWidth: 1.6, shadowBlur: 6 },
              selected: { opacity: 1, lineWidth: 2.2, shadowBlur: 10 },
              inactive: { opacity: 0.06 },
            },
          },
          behaviors: [
            "drag-canvas",
            { type: "zoom-canvas", sensitivity: 0.5, animation: { duration: 200, easing: "ease-out" } },
            "drag-element",
            { type: "hover-activate", degree: 1 },
            "click-select",
          ],
          plugins: [],
        });

        await graph.render();

        // Animação flow nas arestas
        graph.getEdgeData().forEach((edge: unknown) => {
          try {
            const id = (edge as { id: string }).id;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const elx = (graph as any).context?.element?.getElement?.(id);
            const key = elx?.getShape?.("key") ?? elx?.children?.[0];
            key?.animate?.(
              [{ lineDashOffset: 22 }, { lineDashOffset: 0 }],
              { duration: 5000, iterations: Infinity, easing: "linear" }
            );
          } catch {}
        });

        graph.on("node:click", (evt: unknown) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const e = evt as any;
          const nodeData = e?.target?.attributes?.data || e?.itemData?.data || e?.detail?.data;
          if (nodeData?.id) {
            const n = nodesById[nodeData.id];
            if (n) setSelected(n);
          }
        });

        graphRef.current = graph;
        setLoading(false);
      } catch (err) {
        console.error("G6 init error:", err);
        setLoading(false);
      }
    };

    init();

    return () => {
      destroyed = true;
      try { graphRef.current?.destroy?.(); } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Atualiza dados do grafo quando muda filtro/data
  useEffect(() => {
    if (!graphRef.current) return;
    try {
      graphRef.current.setData(transformData(visibleNodes, filteredEdges));
      graphRef.current.render();
    } catch {}
  }, [visibleNodes, filteredEdges]);

  const handleNavigate = useCallback((id: string) => {
    const n = nodesById[id];
    if (n) setSelected(n);
  }, [nodesById]);

  // Edges in/out do nó selecionado
  const { edgesIn, edgesOut } = useMemo(() => {
    if (!selected) return { edgesIn: [], edgesOut: [] };
    return {
      edgesIn: data.edges.filter((e) => e.target === selected.id),
      edgesOut: data.edges.filter((e) => e.source === selected.id),
    };
  }, [selected, data.edges]);

  return (
    <div style={{
      flex: 1, position: "relative", overflow: "hidden", borderRadius: 4,
      background: "rgba(2,6,23,0.6)", display: "flex", flexDirection: "column",
      minHeight: 520,
    }}>
      {/* Stats overlay */}
      <div style={{
        position: "absolute", top: 12, left: 12, zIndex: 5,
        display: "flex", flexDirection: "column", gap: 8, maxWidth: 360,
      }}>
        <div className="panel" style={{
          padding: "0.6rem 0.85rem", background: "rgba(2,8,18,0.8)",
          backdropFilter: "blur(12px)", borderRadius: 6, border: "1px solid rgba(6,182,212,0.18)",
        }}>
          <div style={{
            fontSize: "0.62rem", color: "#5a7a9a", fontFamily: "var(--mono)",
            marginBottom: 4, letterSpacing: "0.08em",
          }}>
            TIPOS · {data.totals.nodes} nodes
          </div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {Object.entries(typeStats).sort((a, b) => b[1] - a[1]).map(([t, c]) => (
              <span key={t} style={{
                padding: "1px 6px", borderRadius: 3, fontSize: "0.62rem",
                fontFamily: "var(--mono)",
                background: `${NODE_COLOR[t] || "#06b6d4"}22`,
                color: NODE_COLOR[t] || "#06b6d4",
              }}>
                {t} {c}
              </span>
            ))}
          </div>
        </div>

        <div className="panel" style={{
          padding: "0.6rem 0.85rem", background: "rgba(2,8,18,0.8)",
          backdropFilter: "blur(12px)", borderRadius: 6, border: "1px solid rgba(6,182,212,0.18)",
        }}>
          <div style={{
            fontSize: "0.62rem", color: "#5a7a9a", fontFamily: "var(--mono)",
            marginBottom: 4, letterSpacing: "0.08em",
          }}>
            RELAÇÕES · {data.totals.edges} edges
          </div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {Object.entries(relationStats).sort((a, b) => b[1] - a[1]).map(([r, c]) => (
              <button key={r}
                onClick={() => setFilterRelation(filterRelation === r ? "" : r)}
                style={{
                  padding: "1px 7px", borderRadius: 3, cursor: "pointer",
                  fontSize: "0.62rem", fontFamily: "var(--mono)",
                  border: filterRelation === r ? `1px solid ${RELATION_COLOR[r]}` : "1px solid transparent",
                  background: filterRelation === r ? `${RELATION_COLOR[r]}22` : "rgba(20,30,50,0.5)",
                  color: RELATION_COLOR[r] || "#94a3b8",
                }}>
                {r} {c}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div style={{
          position: "absolute", inset: 0, display: "flex", alignItems: "center",
          justifyContent: "center", zIndex: 4,
        }}>
          <div style={{
            width: 32, height: 32, border: "2px solid #0d1f35", borderTopColor: "#06b6d4",
            borderRadius: "50%", animation: "spin-slow 0.7s linear infinite",
          }} />
        </div>
      )}

      {/* Empty state */}
      {!loading && data.nodes.length === 0 && (
        <div style={{
          position: "absolute", inset: 0, display: "flex", alignItems: "center",
          justifyContent: "center", color: "#5a7a9a", fontFamily: "var(--mono)",
          textAlign: "center", padding: "1rem", zIndex: 3,
        }}>
          <div>
            <div style={{ fontSize: "0.85rem", marginBottom: 6 }}>(sem edges causais ainda)</div>
            <div style={{ fontSize: "0.7rem", color: "#3a5a7a" }}>
              memory_writer e conflict_detector criam edges automaticamente conforme rodam
            </div>
          </div>
        </div>
      )}

      {/* Canvas G6 */}
      <div ref={containerRef} style={{ flex: 1, minHeight: 480, position: "relative" }} />

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
