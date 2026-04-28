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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fgRef = useRef<any>(null);

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

  // Polling 60s — só atualiza state se IDs realmente mudaram (evita reset da física)
  useEffect(() => {
    const t = setInterval(async () => {
      try {
        const params = new URLSearchParams();
        params.set("limit", "300");
        if (filterRelation) params.set("relation", filterRelation);
        const r = await fetch(`/painel/api/cerebro-proxy?path=/causal/graph?${params.toString()}`);
        if (!r.ok) return;
        const fresh = (await r.json()) as CausalGraphData;
        setData((prev) => {
          // Comparação rápida: mesma quantidade e mesmos IDs em ordem
          if (prev.nodes.length === fresh.nodes.length
              && prev.edges.length === fresh.edges.length) {
            const sameNodes = prev.nodes.every((n, i) => n.id === fresh.nodes[i].id);
            const sameEdges = prev.edges.every((e, i) => e.id === fresh.edges[i].id);
            if (sameNodes && sameEdges) return prev;  // não força re-render
          }
          return fresh;
        });
      } catch {}
    }, 60_000);
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

  // Preserva referências dos nodes/edges entre renders para que o force-graph
  // não reset a física quando os mesmos nodes ainda existem.
  const lastGraphRef = useRef<{ nodes: GraphNode[]; links: GraphLink[] }>({ nodes: [], links: [] });
  const graphData = useMemo(() => {
    const prevNodes = new Map(lastGraphRef.current.nodes.map(n => [n.id, n]));
    const prevLinks = new Map(lastGraphRef.current.links.map(l => [l.id, l]));

    const newNodes = visibleNodes.map(n => {
      const existing = prevNodes.get(n.id);
      if (existing) {
        // reusa o objeto (preserva x/y/vx/vy) — só atualiza meta/label
        Object.assign(existing, n);
        return existing;
      }
      return { ...n };
    });

    const newLinks = filteredEdges.map(e => {
      const existing = prevLinks.get(e.id);
      // links precisam reusar refs também — força não reseta
      if (existing) {
        existing.relation = e.relation;
        existing.confidence = e.confidence;
        existing.detected_by = e.detected_by;
        return existing;
      }
      return { ...e };
    });

    lastGraphRef.current = { nodes: newNodes, links: newLinks };
    return lastGraphRef.current;
  }, [visibleNodes, filteredEdges]);

  const handleNavigate = useCallback((id: string) => {
    const n = nodesById[id];
    if (n) setSelected(n);
  }, [nodesById]);

  // Configura forças anti-overlap quando ref disponível
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg || typeof fg.d3Force !== "function") return;

    let cancelled = false;
    (async () => {
      // d3-force-3d é o que react-force-graph usa internamente; cair pra d3-force se não tiver
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let d3: any;
      try {
        // @ts-expect-error d3-force-3d sem types (sub-dep de react-force-graph)
        d3 = await import("d3-force-3d");
      } catch {
        d3 = await import("d3-force");
      }
      if (cancelled) return;

      // Visual radii: decisão 16, memória 13, signal 9.
      // Collide deve ser radius_visual + ~12px buffer pra não encostar.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const radiusFn = (node: any): number => {
        const n = node as GraphNode;
        if (n.table === "architectural_decisions") return 32;  // 16 + 16
        if (n.table === "memories") return 26;                  // 13 + 13
        return 20;                                              // 9 + 11
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const collide = (d3 as any).forceCollide(radiusFn).strength(1).iterations(4);
      fg.d3Force("collide", collide);

      // Charge muito mais forte para 1k+ nodes
      const charge = fg.d3Force("charge");
      if (charge?.strength) {
        charge.strength(-400);
        charge.distanceMax?.(400);  // limita alcance pra performance
      }

      const link = fg.d3Force("link");
      if (link?.distance) link.distance(90);

      try { fg.d3ReheatSimulation?.(); } catch {}
    })();

    return () => { cancelled = true; };
  }, [graphData]);

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
    // Maior — o force-graph tem nodeRelSize=8 mas drawNode replace ignora isso
    const r = isDecision ? 16 : isMemory ? 13 : 9;
    const x = node.x || 0;
    const y = node.y || 0;

    // Glow
    ctx.shadowColor = color;
    ctx.shadowBlur = isDecision ? 22 : isMemory ? 16 : 10;

    // Body (rect pra decisões, círculo pro resto)
    ctx.beginPath();
    if (isDecision) {
      ctx.rect(x - r, y - r, r * 2, r * 2);
    } else {
      ctx.arc(x, y, r, 0, 2 * Math.PI);
    }

    // Fill 10% opacity da cor (mais visível pra área maior)
    ctx.fillStyle = `${color}26`;
    ctx.fill();

    // Stroke neon
    ctx.strokeStyle = color;
    ctx.lineWidth = (isDecision ? 2.2 : 1.7) / globalScale;
    ctx.stroke();

    // Selection ring
    if (selected?.id === node.id) {
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.arc(x, y, r + 5, 0, 2 * Math.PI);
      ctx.strokeStyle = "#fbbf24";
      ctx.lineWidth = 2.5 / globalScale;
      ctx.stroke();
    }

    ctx.shadowBlur = 0;

    // Ícone interno (escala com o node)
    const icon = TABLE_ICON[node.table] || "•";
    ctx.font = `${isDecision ? 16 : isMemory ? 13 : 10}px 'Fira Code', monospace`;
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(icon, x, y);

    // Label compacta — só visível em zoom 1.5+ pra não poluir
    if (globalScale > 1.4) {
      const maxLen = 22;
      const label = node.label.length > maxLen ? node.label.slice(0, maxLen) + "…" : node.label;
      const fontSize = 7;  // pequena
      ctx.font = `${fontSize}px 'Fira Code', monospace`;
      const textWidth = ctx.measureText(label).width;
      const padX = 4;
      const padY = 2;
      const labelY = y + r + 7;

      // Fundo escuro arredondado
      ctx.fillStyle = "rgba(2,6,23,0.88)";
      ctx.beginPath();
      const rx = x - textWidth / 2 - padX;
      const ry = labelY - fontSize / 2 - padY;
      const rw = textWidth + padX * 2;
      const rh = fontSize + padY * 2;
      const radius = 2.5;
      ctx.moveTo(rx + radius, ry);
      ctx.arcTo(rx + rw, ry, rx + rw, ry + rh, radius);
      ctx.arcTo(rx + rw, ry + rh, rx, ry + rh, radius);
      ctx.arcTo(rx, ry + rh, rx, ry, radius);
      ctx.arcTo(rx, ry, rx + rw, ry, radius);
      ctx.closePath();
      ctx.fill();

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
      {/* Stats overlay — só relações (cores dos nodes já comunicam tipos) */}
      <div style={{
        position: "absolute", top: 12, left: 12, zIndex: 5, maxWidth: 360,
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
            {data.totals.nodes} NODES · {data.totals.edges} EDGES
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
            ref={fgRef}
            graphData={graphData as { nodes: GraphNode[]; links: GraphLink[] }}
            width={size.w}
            height={size.h}
            backgroundColor="rgba(2,6,23,0)"
            nodeRelSize={18}
            nodeVal={(n) => {
              // val controla collide nativo: radius = nodeRelSize × ∛val
              // 18 × ∛6 ≈ 33 (decisão), 18 × ∛3 ≈ 26 (memória), 18 × ∛1 = 18 (signal)
              const node = n as GraphNode;
              return node.table === "architectural_decisions" ? 6 : node.table === "memories" ? 3 : 1;
            }}
            linkColor={(l) => `${RELATION_COLOR[(l as GraphLink).relation] || "#94a3b8"}77`}
            linkWidth={(l) => 1 + ((l as GraphLink).confidence || 0.5) * 1.2}
            linkDirectionalArrowLength={7}
            linkDirectionalArrowRelPos={0.92}
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
            nodePointerAreaPaint={(node, color, ctx) => {
              const n = node as GraphNode;
              const r = n.table === "architectural_decisions" ? 16 : n.table === "memories" ? 13 : 9;
              ctx.fillStyle = color;
              ctx.beginPath();
              ctx.arc(n.x || 0, n.y || 0, r + 2, 0, 2 * Math.PI);
              ctx.fill();
            }}
            onNodeClick={(node) => setSelected(node as CausalNode)}
            cooldownTicks={400}
            warmupTicks={50}
            d3VelocityDecay={0.4}
            d3AlphaDecay={0.018}
            enableNodeDrag={true}
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
