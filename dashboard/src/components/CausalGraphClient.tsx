"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { X, ArrowRight } from "lucide-react";
import type { CausalGraphData, CausalNode, CausalEdgeData } from "@/lib/hub";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false });

// ─── Paleta cyberpunk ────────────────────────────────────────────────────────

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
  triggered_by:  "#06b6d4",
  contradicts:   "#f87171",
  reinforces:    "#22c55e",
  derived_from:  "#a78bfa",
  references:    "#94a3b8",
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

// ─── Sidebar (padronizada com /graph) ───────────────────────────────────────

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
        {/* Badges */}
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

// ─── Main ────────────────────────────────────────────────────────────────────

type GraphNode = CausalNode & { x?: number; y?: number; vx?: number; vy?: number };
type GraphLink = CausalEdgeData & { source: string | GraphNode; target: string | GraphNode };

export function CausalGraphClient({ initial }: { initial: CausalGraphData }) {
  const [data, setData] = useState<CausalGraphData>(initial);
  const [filterRelation, setFilterRelation] = useState<string>("");
  const [selected, setSelected] = useState<CausalNode | null>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 800, h: 600 });
  const containerRef = useRef<HTMLDivElement>(null);

  // Resize observer (canvas ocupa todo o container disponível)
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        const sidebarOpen = !!selected;
        setSize({
          w: e.contentRect.width - (sidebarOpen ? 320 : 0),
          h: Math.max(420, e.contentRect.height),
        });
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [selected]);

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
    if (!filterRelation) return null;
    const s = new Set<string>();
    for (const e of filteredEdges) { s.add(e.source); s.add(e.target); }
    return s;
  }, [filteredEdges, filterRelation]);

  const visibleNodes = useMemo(() => {
    if (!visibleNodeIds) return data.nodes;
    return data.nodes.filter((n) => visibleNodeIds.has(n.id));
  }, [data.nodes, visibleNodeIds]);

  const nodesById = useMemo(() => {
    const m: Record<string, CausalNode> = {};
    for (const n of data.nodes) m[n.id] = n;
    return m;
  }, [data.nodes]);

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
    nodes: visibleNodes.map(n => ({ ...n })),
    links: filteredEdges.map(e => ({ ...e })),
  }), [visibleNodes, filteredEdges]);

  const handleNavigate = useCallback((id: string) => {
    const n = nodesById[id];
    if (n) setSelected(n);
  }, [nodesById]);

  const { edgesIn, edgesOut } = useMemo(() => {
    if (!selected) return { edgesIn: [], edgesOut: [] };
    return {
      edgesIn: data.edges.filter((e) => e.target === selected.id),
      edgesOut: data.edges.filter((e) => e.source === selected.id),
    };
  }, [selected, data.edges]);

  // canvas drawing helpers (mesma lógica visual do /graph: fill 5% + stroke neon + glow)
  const drawNode = useCallback((node: GraphNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const color = NODE_COLOR[node.type] || "#06b6d4";
    const isDecision = node.table === "architectural_decisions";
    const isMemory = node.table === "memories";
    const r = isDecision ? 9 : isMemory ? 7 : 5;
    const x = node.x || 0;
    const y = node.y || 0;

    // Glow
    ctx.shadowColor = color;
    ctx.shadowBlur = isDecision ? 18 : isMemory ? 14 : 8;

    // Body (rect pra decisões, círculo pro resto — como você sugeriu antes)
    ctx.beginPath();
    if (isDecision) {
      const halfR = r;
      ctx.rect(x - halfR, y - halfR, halfR * 2, halfR * 2);
    } else {
      ctx.arc(x, y, r, 0, 2 * Math.PI);
    }

    // Fill 5% opacity da cor
    ctx.fillStyle = `${color}1a`;
    ctx.fill();

    // Stroke neon
    ctx.strokeStyle = color;
    ctx.lineWidth = (isDecision ? 2 : 1.5) / globalScale;
    ctx.stroke();

    // Selection ring
    if (selected?.id === node.id) {
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.arc(x, y, r + 4, 0, 2 * Math.PI);
      ctx.strokeStyle = "#fbbf24";
      ctx.lineWidth = 2 / globalScale;
      ctx.stroke();
    }

    ctx.shadowBlur = 0;

    // Ícone interno (sempre visível)
    const icon = TABLE_ICON[node.table] || "•";
    ctx.font = `${(isDecision ? 11 : 9) / globalScale * globalScale}px 'Fira Code', monospace`;
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(icon, x, y);

    // Label (visível em zoom mais próximo, com fundo escuro tipo /graph)
    if (globalScale > 0.9) {
      const label = node.label.length > 40 ? node.label.slice(0, 40) + "…" : node.label;
      const fontSize = isDecision ? 10 : 9;
      ctx.font = `${fontSize}px 'Fira Code', monospace`;
      const textWidth = ctx.measureText(label).width;
      const padX = 5;
      const padY = 2;
      const labelY = y + r + 9;

      // Fundo escuro
      ctx.fillStyle = "rgba(2,6,23,0.85)";
      ctx.beginPath();
      const rx = x - textWidth / 2 - padX;
      const ry = labelY - fontSize / 2 - padY;
      const rw = textWidth + padX * 2;
      const rh = fontSize + padY * 2;
      const radius = 3;
      ctx.moveTo(rx + radius, ry);
      ctx.arcTo(rx + rw, ry, rx + rw, ry + rh, radius);
      ctx.arcTo(rx + rw, ry + rh, rx, ry + rh, radius);
      ctx.arcTo(rx, ry + rh, rx, ry, radius);
      ctx.arcTo(rx, ry, rx + rw, ry, radius);
      ctx.closePath();
      ctx.fill();

      // Text
      ctx.fillStyle = color;
      ctx.fillText(label, x, labelY);
    }
  }, [selected]);

  return (
    <div style={{
      flex: 1, position: "relative", overflow: "hidden", borderRadius: 4,
      background: "rgba(2,6,23,0.6)", display: "flex", flexDirection: "column",
      minHeight: 520,
    }}>
      {/* Stats overlay (top-left, como /graph) */}
      <div style={{
        position: "absolute", top: 12, left: 12, zIndex: 5,
        display: "flex", flexDirection: "column", gap: 8, maxWidth: 360,
      }}>
        <div style={{
          padding: "0.6rem 0.85rem",
          background: "rgba(2,8,18,0.85)",
          backdropFilter: "blur(12px)",
          borderRadius: 6,
          border: "1px solid rgba(6,182,212,0.18)",
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

        <div style={{
          padding: "0.6rem 0.85rem",
          background: "rgba(2,8,18,0.85)",
          backdropFilter: "blur(12px)",
          borderRadius: 6,
          border: "1px solid rgba(6,182,212,0.18)",
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

      {/* Canvas container */}
      <div ref={containerRef} style={{ flex: 1, minHeight: 480, position: "relative" }}>
        {data.nodes.length === 0 ? (
          <div style={{
            position: "absolute", inset: 0, display: "flex", alignItems: "center",
            justifyContent: "center", color: "#5a7a9a", fontFamily: "var(--mono)",
            textAlign: "center", padding: "1rem",
          }}>
            <div>
              <div style={{ fontSize: "0.85rem", marginBottom: 6 }}>(sem edges causais ainda)</div>
              <div style={{ fontSize: "0.7rem", color: "#3a5a7a" }}>
                memory_writer e conflict_detector criam edges automaticamente conforme rodam
              </div>
            </div>
          </div>
        ) : (
          <ForceGraph2D
            graphData={graphData as { nodes: GraphNode[]; links: GraphLink[] }}
            width={size.w}
            height={size.h}
            backgroundColor="rgba(2,6,23,0)"
            nodeRelSize={5}
            linkColor={(l) => `${RELATION_COLOR[(l as GraphLink).relation] || "#94a3b8"}77`}
            linkWidth={(l) => 1 + ((l as GraphLink).confidence || 0.5) * 1.2}
            linkDirectionalArrowLength={6}
            linkDirectionalArrowRelPos={1}
            linkDirectionalArrowColor={(l) => RELATION_COLOR[(l as GraphLink).relation] || "#94a3b8"}
            linkDirectionalParticles={(l) => ((l as GraphLink).relation === "contradicts" ? 3 : 0)}
            linkDirectionalParticleSpeed={0.008}
            linkDirectionalParticleColor={() => "#f87171"}
            linkDirectionalParticleWidth={2}
            linkLineDash={(l) => {
              const rel = (l as GraphLink).relation;
              return rel === "contradicts" ? [4, 4] : [6, 5];
            }}
            nodeCanvasObjectMode={() => "replace"}
            nodeCanvasObject={(node, ctx, globalScale) => drawNode(node as GraphNode, ctx, globalScale)}
            onNodeClick={(node) => setSelected(node as CausalNode)}
            cooldownTicks={120}
            d3VelocityDecay={0.32}
            d3AlphaDecay={0.025}
          />
        )}
      </div>

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
