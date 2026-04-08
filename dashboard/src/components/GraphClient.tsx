"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { X, GitBranch, Clock, Layers, Box, ExternalLink } from "lucide-react";

// ─── API types ────────────────────────────────────────────────────────────────

export interface APIGraphNode {
  id: string;
  type: "repo" | "technology" | "developer";
  label: string;
  size: number;
  color: string;
  data: {
    full_name?: string;
    status?: string;
    last_indexed_at?: string | null;
    stack?: { languages?: string[]; frameworks?: string[]; infra?: string[] };
    summary?: string;
    name?: string;
    repo_count?: number;
  };
}

export interface APIGraphEdge {
  source: string;
  target: string;
  type: string;
  weight: number;
}

// ─── Tipos internos ───────────────────────────────────────────────────────────

interface SelectedNode {
  nodeType: "repo" | "technology" | "developer";
  originalLabel: string;
  status?: string;
  last_indexed_at?: string | null;
  stack?: { languages?: string[]; frameworks?: string[]; infra?: string[] };
  summary?: string;
  repo_count?: number;
  comboId?: string;
}

// ─── Categoria / cor dos nós ──────────────────────────────────────────────────

const CATEGORY_COLOR: Record<string, string> = {
  "combo:frontend": "#06b6d4",
  "combo:backend":  "#a78bfa",
  "combo:data":     "#fbbf24",
  "combo:infra":    "#f87171",
  "combo:tooling":  "#22c55e",
};

const CATEGORY_LABEL: Record<string, string> = {
  "combo:frontend": "Frontend & Web",
  "combo:backend":  "Backend & APIs",
  "combo:data":     "Data & Storage",
  "combo:infra":    "Infrastructure",
  "combo:tooling":  "Tooling & Testing",
};

const TECH_COMBO_MAP: Record<string, string> = {
  React: "combo:frontend", "Vue.js": "combo:frontend", Angular: "combo:frontend",
  "Next.js": "combo:frontend", Vite: "combo:frontend", "Tailwind CSS": "combo:frontend",
  HTML: "combo:frontend", CSS: "combo:frontend", Gatsby: "combo:frontend",
  Svelte: "combo:frontend", Astro: "combo:frontend",
  Python: "combo:backend", "Node.js": "combo:backend", TypeScript: "combo:backend",
  JavaScript: "combo:backend", FastAPI: "combo:backend", Express: "combo:backend",
  Django: "combo:backend", Flask: "combo:backend", Go: "combo:backend",
  Java: "combo:backend", "Anthropic/Claude": "combo:backend",
  HTTPX: "combo:backend", Celery: "combo:backend",
  PostgreSQL: "combo:data", "PostgreSQL (asyncpg)": "combo:data", MySQL: "combo:data",
  MongoDB: "combo:data", Redis: "combo:data", Qdrant: "combo:data",
  Supabase: "combo:data", SQLAlchemy: "combo:data", Alembic: "combo:data",
  Prisma: "combo:data", Drizzle: "combo:data",
  Docker: "combo:infra", "Docker Compose": "combo:infra",
  Kubernetes: "combo:infra", Nginx: "combo:infra", AWS: "combo:infra", GCP: "combo:infra",
  Vitest: "combo:tooling", Jest: "combo:tooling", pytest: "combo:tooling",
  Zod: "combo:tooling", Pydantic: "combo:tooling", ESLint: "combo:tooling",
};

const TECH_ICONS: Record<string, string> = {
  React: "⚛", "Vue.js": "V", Angular: "A", "Next.js": "N⁺", Vite: "⚡",
  "Tailwind CSS": "TW", Python: "Py", "Node.js": "N", TypeScript: "TS",
  JavaScript: "JS", FastAPI: "FA", Docker: "🐳", "Docker Compose": "DC",
  PostgreSQL: "PG", "PostgreSQL (asyncpg)": "PG", Redis: "RD", Qdrant: "Q",
  Supabase: "SB", SQLAlchemy: "SA", Alembic: "AL", Celery: "CL",
  HTTPX: "HX", Pydantic: "PD", Zod: "ZD", Vitest: "VT", pytest: "PT",
  "Anthropic/Claude": "AI", Go: "Go", Java: "Jv", Nginx: "Nx", Kubernetes: "K8",
};

function getComboId(node: APIGraphNode): string {
  if (node.type !== "repo") return TECH_COMBO_MAP[node.label] ?? "combo:backend";
  const s = node.data.stack;
  if (!s) return "combo:backend";
  const all = [...(s.frameworks ?? []), ...(s.languages ?? []), ...(s.infra ?? [])];
  const score = (keys: string[]) => all.filter((t) => keys.includes(t)).length;
  const fe    = score(["React","Vue.js","Angular","Next.js","Vite","Tailwind CSS","HTML","CSS","Gatsby","Svelte","Astro"]);
  const be    = score(["Python","FastAPI","Django","Flask","Express","Go","Java","Celery","HTTPX"]);
  const infra = score(["Docker","Docker Compose","Kubernetes","Nginx","AWS"]);
  if (fe > be && fe > infra) return "combo:frontend";
  if (infra > be && infra >= fe) return "combo:infra";
  return "combo:backend";
}

// ─── Transformação API → G6 (sem combos) ─────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function transformData(apiNodes: APIGraphNode[], apiEdges: APIGraphEdge[]): any {
  const nodes = apiNodes.map((n) => {
    const comboId = getComboId(n);
    const color   = CATEGORY_COLOR[comboId] ?? "#06b6d4";
    const isRepo  = n.type === "repo";
    const name    = n.label.includes("/") ? n.label.split("/")[1] : n.label;
    const icon    = isRepo
      ? "⬡"
      : (TECH_ICONS[n.label] ?? n.label.slice(0, 2).toUpperCase());
    const status  = n.data.status ?? "";

    return {
      id: n.id,
      style: {
        size:            isRepo ? 46 : 34,
        fill:            isRepo ? "#0d1b2e" : "#0a1628",
        stroke:          color + (isRepo ? "cc" : "77"),
        lineWidth:       isRepo ? 1.5 : 1,
        shadowColor:     isRepo ? color + "22" : "transparent",
        shadowBlur:      isRepo ? 12 : 0,
        label:           false,   // oculto por padrão, aparece no hover/select
        labelText:       name,
        labelFill:       isRepo ? "#e2e8f0" : "#94a3b8",
        labelFontFamily: "'Fira Code', monospace",
        labelFontSize:   isRepo ? 11 : 9,
        labelMaxWidth:   140,
        labelOffsetY:    4,
        labelWordWrap:   false,
        labelBackground:            true,
        labelBackgroundFill:        "rgba(6,14,29,0.92)",
        labelBackgroundRadius:      4,
        labelBackgroundPadding:     [3, 8, 3, 8],
        iconText:        icon,
        iconFill:        color,
        iconFontSize:    11,
        iconFontFamily:  "'Fira Code', monospace",
        badges: [],
      },
      data: { ...n.data, nodeType: n.type, originalLabel: n.label, comboId },
    };
  });

  const edges = apiEdges.map((e, i) => ({
    id:     `edge-${i}`,
    source: e.source,
    target: e.target,
    style:  {
      stroke:    "#1e3a5f",
      lineWidth: 1,
      opacity:   0.6,
      lineDash:  [6, 4],   // padrão para o flow animation
      endArrow:  false,
    },
    data: { type: e.type, weight: e.weight },
  }));

  return { nodes, edges };
}

// ─── Sidebar de detalhes ──────────────────────────────────────────────────────

function NodeSidebar({
  node,
  onClose,
}: {
  node: SelectedNode;
  onClose: () => void;
}) {
  const isRepo   = node.nodeType === "repo";
  const comboId  = node.comboId ?? "combo:backend";
  const accent   = CATEGORY_COLOR[comboId] ?? "#06b6d4";
  const category = CATEGORY_LABEL[comboId] ?? "";

  const lastIndex = node.last_indexed_at
    ? new Date(node.last_indexed_at).toLocaleDateString("pt-BR", {
        day: "2-digit", month: "short", year: "numeric",
      })
    : "Nunca";

  const allTech = isRepo
    ? [
        ...(node.stack?.frameworks ?? []),
        ...(node.stack?.languages ?? []),
        ...(node.stack?.infra ?? []),
      ]
    : [];

  return (
    <div
      style={{
        position:      "absolute",
        top:           0,
        right:         0,
        bottom:        0,
        width:         280,
        background:    "rgba(9,17,32,0.97)",
        borderLeft:    "1px solid #1a2840",
        backdropFilter: "blur(16px)",
        display:       "flex",
        flexDirection: "column",
        zIndex:        30,
        animation:     "fade-left 0.2s cubic-bezier(.16,1,.3,1) both",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding:      "1rem 1rem 0.75rem",
          borderBottom: "1px solid #1a2840",
          display:      "flex",
          alignItems:   "flex-start",
          gap:          "0.5rem",
        }}
      >
        {/* Ícone do tipo */}
        <div
          style={{
            width:          36,
            height:         36,
            borderRadius:   8,
            background:     accent + "18",
            border:         `1px solid ${accent}44`,
            display:        "flex",
            alignItems:     "center",
            justifyContent: "center",
            flexShrink:     0,
            marginTop:      2,
          }}
        >
          {isRepo
            ? <GitBranch size={16} color={accent} />
            : <Box size={16} color={accent} />
          }
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontFamily:    "var(--mono)",
              fontSize:      "0.72rem",
              color:         accent,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              marginBottom:  "0.2rem",
            }}
          >
            {isRepo ? "Repositório" : "Tecnologia"}
          </div>
          <div
            style={{
              fontFamily:    "var(--mono)",
              fontSize:      "0.9rem",
              fontWeight:    700,
              color:         "var(--text)",
              wordBreak:     "break-all",
              lineHeight:    1.3,
            }}
          >
            {node.originalLabel.includes("/")
              ? node.originalLabel.split("/")[1]
              : node.originalLabel}
          </div>
          {node.originalLabel.includes("/") && (
            <div
              style={{
                fontFamily: "var(--mono)",
                fontSize:   "0.65rem",
                color:      "var(--muted)",
                marginTop:  "0.1rem",
              }}
            >
              {node.originalLabel.split("/")[0]}
            </div>
          )}
        </div>

        <button
          onClick={onClose}
          style={{
            background: "transparent",
            border:     "none",
            cursor:     "pointer",
            color:      "var(--dim)",
            padding:    4,
            flexShrink: 0,
          }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--text)")}
          onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--dim)")}
        >
          <X size={15} />
        </button>
      </div>

      {/* Body */}
      <div
        style={{
          flex:      1,
          overflowY: "auto",
          padding:   "0.85rem 1rem",
          display:   "flex",
          flexDirection: "column",
          gap:       "1rem",
        }}
      >
        {/* Status / Categoria */}
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <span
            style={{
              fontFamily:    "var(--mono)",
              fontSize:      "0.65rem",
              color:         accent,
              background:    accent + "18",
              border:        `1px solid ${accent}44`,
              borderRadius:  4,
              padding:       "2px 8px",
              letterSpacing: "0.08em",
            }}
          >
            {category}
          </span>

          {isRepo && node.status && (
            <span
              style={{
                fontFamily:    "var(--mono)",
                fontSize:      "0.65rem",
                color:         node.status === "done" ? "#22c55e" : "#fbbf24",
                background:    node.status === "done" ? "rgba(34,197,94,.12)" : "rgba(251,191,36,.12)",
                border:        `1px solid ${node.status === "done" ? "#22c55e" : "#fbbf24"}44`,
                borderRadius:  4,
                padding:       "2px 8px",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              {node.status === "done" ? "Active" : node.status}
            </span>
          )}

          {!isRepo && node.repo_count != null && (
            <span
              style={{
                fontFamily:    "var(--mono)",
                fontSize:      "0.65rem",
                color:         "#22c55e",
                background:    "rgba(34,197,94,.12)",
                border:        "1px solid rgba(34,197,94,.3)",
                borderRadius:  4,
                padding:       "2px 8px",
              }}
            >
              {node.repo_count} repos
            </span>
          )}
        </div>

        {/* Metadados de repo */}
        {isRepo && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <Clock size={12} color="var(--dim)" style={{ flexShrink: 0 }} />
              <span style={{ fontFamily: "var(--mono)", fontSize: "0.7rem", color: "var(--muted)" }}>
                {lastIndex}
              </span>
            </div>
          </div>
        )}

        {/* Stack completo */}
        {allTech.length > 0 && (
          <div>
            <div
              style={{
                display:        "flex",
                alignItems:     "center",
                gap:            "0.4rem",
                marginBottom:   "0.5rem",
              }}
            >
              <Layers size={12} color="var(--dim)" />
              <span
                style={{
                  fontFamily:    "var(--mono)",
                  fontSize:      "0.62rem",
                  color:         "var(--dim)",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                }}
              >
                Stack
              </span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
              {allTech.map((t) => {
                const tColor = CATEGORY_COLOR[TECH_COMBO_MAP[t] ?? "combo:backend"] ?? "#64748b";
                return (
                  <span
                    key={t}
                    style={{
                      fontFamily:   "var(--mono)",
                      fontSize:     "0.65rem",
                      color:        tColor,
                      background:   tColor + "14",
                      border:       `1px solid ${tColor}33`,
                      borderRadius: 4,
                      padding:      "2px 7px",
                    }}
                  >
                    {t}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* Summary */}
        {node.summary && (
          <div>
            <div
              style={{
                fontFamily:    "var(--mono)",
                fontSize:      "0.62rem",
                color:         "var(--dim)",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                marginBottom:  "0.4rem",
              }}
            >
              Resumo
            </div>
            <p
              style={{
                fontFamily:  "var(--sans)",
                fontSize:    "0.78rem",
                color:       "var(--muted)",
                lineHeight:  1.6,
                margin:      0,
              }}
            >
              {node.summary.slice(0, 300)}
              {node.summary.length > 300 ? "…" : ""}
            </p>
          </div>
        )}

        {/* Link GitHub */}
        {isRepo && (
          <a
            href={`https://github.com/${node.originalLabel}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display:        "flex",
              alignItems:     "center",
              gap:            "0.4rem",
              fontFamily:     "var(--mono)",
              fontSize:       "0.7rem",
              color:          accent,
              textDecoration: "none",
              marginTop:      "auto",
              paddingTop:     "0.5rem",
            }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.opacity = "0.75")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.opacity = "1")}
          >
            <ExternalLink size={11} />
            Abrir no GitHub
          </a>
        )}
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

interface Props {
  nodes: APIGraphNode[];
  edges: APIGraphEdge[];
}

export function GraphClient({ nodes, edges }: Props) {
  const containerRef                    = useRef<HTMLDivElement>(null);
  const graphRef                        = useRef<unknown>(null);
  const [loading,      setLoading]      = useState(true);
  const [ready,        setReady]        = useState(false);
  const [selectedNode, setSelectedNode] = useState<SelectedNode | null>(null);

  const zoomIn  = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g = graphRef.current as any;
    if (!g) return;
    g.zoomTo?.((g.getZoom?.() ?? 1) * 1.3, undefined, { duration: 250 });
  }, []);

  const zoomOut = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g = graphRef.current as any;
    if (!g) return;
    g.zoomTo?.((g.getZoom?.() ?? 1) / 1.3, undefined, { duration: 250 });
  }, []);

  const fitView = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (graphRef.current as any)?.fitView?.(undefined, { duration: 400 });
  }, []);

  useEffect(() => {
    if (!containerRef.current || nodes.length === 0) {
      setLoading(false);
      return;
    }

    let destroyed = false;

    const init = async () => {
      try {
        const { Graph } = await import("@antv/g6");
        if (destroyed) return;

        const el     = containerRef.current!;
        const width  = el.clientWidth  || 900;
        const height = el.clientHeight || 600;

        const graph = new Graph({
          container: el,
          width,
          height,
          autoResize:  true,
          autoFit:     "center",
          background:  "transparent",
          data:        transformData(nodes, edges),

          layout: {
            type:                       "radial",
            nodeSize:                   46,
            unitRadius:                 145,
            linkDistance:               280,
            preventOverlap:             true,
            maxPreventOverlapIteration: 200,
            sortBy:                     "comboId",
            sortStrength:               40,
          },

          node: {
            type:  "circle",
            state: {
              active: {
                label:  true,
                zIndex: 100,
              },
              selected: {
                label:       true,
                zIndex:      100,
                stroke:      "#fbbf24",
                lineWidth:   2,
                shadowBlur:  16,
                shadowColor: "rgba(251,191,36,0.3)",
              },
              inactive: { opacity: 0.2 },
            },
          },

          edge: {
            type:  "quadratic",
            state: {
              selected: { stroke: "#06b6d4", lineWidth: 1.5 },
              inactive: { opacity: 0.1 },
            },
          },

          behaviors: [
            "drag-canvas",
            { type: "zoom-canvas", sensitivity: 0.5, animation: { duration: 200, easing: "ease-out" } },
            "drag-element",
            { type: "hover-activate", degree: 1 },
            "click-select",
          ],

          plugins: [
            { type: "minimap", key: "minimap", width: 130, height: 85, padding: 6 },
          ],
        });

        await graph.render();

        // Flow animation nas arestas — lineDashOffset de 18→0 em loop
        graph.getEdgeData().forEach((edge: unknown) => {
          try {
            const id  = (edge as { id: string }).id;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const el  = (graph as any).context?.element?.getElement?.(id);
            const key = el?.getShape?.("key") ?? el?.children?.[0];
            key?.animate?.(
              [{ lineDashOffset: 20 }, { lineDashOffset: 0 }],
              { duration: 4800, iterations: Infinity, easing: "linear" },
            );
          } catch {}
        });

        // Click em nó → abre sidebar
        graph.on("node:click", (evt: unknown) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const e      = evt as any;
          const nodeId = e?.target?.id ?? e?.itemId;
          if (!nodeId) return;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const nd = (graph as any).getNodeData?.(nodeId);
          if (nd?.data) setSelectedNode(nd.data as SelectedNode);
        });

        // Click no canvas vazio → fecha sidebar
        graph.on("canvas:click", () => setSelectedNode(null));

        if (!destroyed) {
          graphRef.current = graph;
          setLoading(false);
          setReady(true);
        } else {
          graph.destroy();
        }
      } catch (err) {
        if (!destroyed) {
          console.error("[GraphClient] G6 init error:", err);
          setLoading(false);
        }
      }
    };

    init();

    return () => {
      destroyed = true;
      if (graphRef.current) {
        try { (graphRef.current as { destroy(): void }).destroy(); } catch {}
        graphRef.current = null;
      }
    };
  }, [nodes, edges]);

  // ─── Legend ────────────────────────────────────────────────────────────────
  const LEGEND = Object.entries(CATEGORY_LABEL).map(([id, label]) => ({
    label,
    color: CATEGORY_COLOR[id],
  }));

  return (
    <div
      className="panel"
      style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", padding: 0 }}
    >
      {/* Loading */}
      {loading && (
        <div
          style={{
            position: "absolute", inset: 0, display: "flex",
            flexDirection: "column", alignItems: "center", justifyContent: "center",
            gap: "1rem", zIndex: 10, background: "var(--bg-panel)",
          }}
        >
          <div
            style={{
              width: 32, height: 32,
              border: "2px solid #1a2840", borderTopColor: "#06b6d4",
              borderRadius: "50%", animation: "spin-slow 0.7s linear infinite",
            }}
          />
          <span style={{ fontFamily: "var(--mono)", fontSize: "0.72rem", color: "var(--muted)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
            Renderizando grafo...
          </span>
        </div>
      )}

      {/* Empty state */}
      {!loading && nodes.length === 0 && (
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "0.75rem" }}>
          <span style={{ fontSize: "2.5rem", opacity: 0.3 }}>⬡</span>
          <span style={{ fontFamily: "var(--mono)", fontSize: "0.8rem", color: "var(--muted)" }}>Nenhum dado indexado</span>
        </div>
      )}

      {/* Toolbar */}
      {ready && (
        <div style={{ position: "absolute", top: 12, right: selectedNode ? 292 : 12, display: "flex", flexDirection: "column", gap: 6, zIndex: 20, transition: "right 200ms ease" }}>
          {([
            { icon: "+", action: zoomIn,  title: "Zoom In"  },
            { icon: "−", action: zoomOut, title: "Zoom Out" },
            { icon: "⊡", action: fitView, title: "Fit View" },
          ] as const).map(({ icon, action, title }) => (
            <button
              key={title}
              onClick={action}
              title={title}
              style={{
                width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center",
                background: "rgba(10,22,40,0.92)", border: "1px solid #1a2840",
                borderRadius: 6, color: "#7a9ab8", fontFamily: "var(--mono)", fontSize: "1rem",
                cursor: "pointer", backdropFilter: "blur(8px)", transition: "color 150ms, border-color 150ms",
              }}
              onMouseEnter={(e) => { const el = e.currentTarget; el.style.color = "#06b6d4"; el.style.borderColor = "rgba(6,182,212,.3)"; }}
              onMouseLeave={(e) => { const el = e.currentTarget; el.style.color = "#7a9ab8"; el.style.borderColor = "#1a2840"; }}
            >
              {icon}
            </button>
          ))}
        </div>
      )}

      {/* Legend */}
      {ready && (
        <div
          style={{
            position: "absolute", bottom: 12, left: 12, display: "flex",
            flexDirection: "column", gap: 5, zIndex: 20,
            background: "rgba(10,22,40,0.88)", border: "1px solid #1a2840",
            borderRadius: 6, padding: "8px 12px", backdropFilter: "blur(8px)",
          }}
        >
          <span style={{ fontFamily: "var(--mono)", fontSize: "0.58rem", color: "#475569", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 2 }}>
            Categorias
          </span>
          {LEGEND.map(({ label, color }) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: color + "66", border: `1px solid ${color}99`, flexShrink: 0 }} />
              <span style={{ fontFamily: "var(--mono)", fontSize: "0.63rem", color: "#7a9ab8" }}>{label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Canvas G6 */}
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />

      {/* Sidebar de detalhes */}
      {selectedNode && (
        <NodeSidebar node={selectedNode} onClose={() => setSelectedNode(null)} />
      )}
    </div>
  );
}
