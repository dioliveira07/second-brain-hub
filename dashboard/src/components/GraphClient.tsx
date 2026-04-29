"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { X, GitBranch, Clock, Layers, Box, ExternalLink, ArrowRight } from "lucide-react";

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

interface SelectedNode {
  nodeType:      "repo" | "technology" | "developer";
  originalLabel: string;
  status?:       string;
  last_indexed_at?: string | null;
  stack?: { languages?: string[]; frameworks?: string[]; infra?: string[] };
  summary?:   string;
  repo_count?:number;
  comboId?:   string;
  uses?:   string[];   // techs que o repo usa
  usedBy?: string[];   // repos que usam esta tech
}

// ─── Paleta cyberpunk ─────────────────────────────────────────────────────────

const CATS: Record<string, { color: string; label: string }> = {
  frontend: { color: "#06b6d4", label: "Frontend"       },
  fullstack:{ color: "#a78bfa", label: "Full-stack"     },
  backend:  { color: "#f87171", label: "Backend"        },
  data:     { color: "#fbbf24", label: "Data / Storage" },
  infra:    { color: "#fb923c", label: "Infra / Ops"    },
  tooling:  { color: "#34d399", label: "Tooling"        },
  tech:     { color: "#22c55e", label: "Tecnologia"     },
};

// Legacy aliases usados no transformData / sidebar
const CATEGORY_COLOR: Record<string, string> = Object.fromEntries(
  Object.entries(CATS).map(([k, v]) => [k, v.color])
);

const TECH_COMBO_MAP: Record<string, string> = {
  React: "frontend", "Vue.js": "frontend", Angular: "frontend",
  "Next.js": "frontend", Vite: "frontend", "Tailwind CSS": "frontend",
  HTML: "frontend", CSS: "frontend", Svelte: "frontend", Astro: "frontend",
  Python: "fullstack", "Node.js": "fullstack", TypeScript: "fullstack",
  JavaScript: "fullstack", FastAPI: "backend", Express: "backend",
  Django: "backend", Flask: "backend", Go: "backend", Java: "backend",
  "Anthropic/Claude": "tooling", HTTPX: "backend", Celery: "backend",
  Fastify: "backend",
  PostgreSQL: "data", "PostgreSQL (asyncpg)": "data", MySQL: "data",
  MongoDB: "data", Redis: "data", Qdrant: "data", Supabase: "data",
  SQLAlchemy: "data", Alembic: "data", Prisma: "data", Drizzle: "data",
  Docker: "infra", "Docker Compose": "infra",
  Kubernetes: "infra", Nginx: "infra", AWS: "infra", GCP: "infra",
  Vitest: "tooling", Jest: "tooling", pytest: "tooling",
  Zod: "tooling", Pydantic: "tooling", ESLint: "tooling",
  Laravel: "fullstack", PHP: "fullstack", Requests: "backend",
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
  if (node.type === "technology") return TECH_COMBO_MAP[node.label] ?? "tech";
  if (node.type !== "repo") return "tooling";
  const s = node.data.stack;
  if (!s) return "fullstack";
  const all = [...(s.frameworks ?? []), ...(s.languages ?? []), ...(s.infra ?? [])];
  const score = (keys: string[]) => all.filter((t) => keys.includes(t)).length;
  const fe   = score(["React","Vue.js","Angular","Next.js","Vite","Tailwind CSS","HTML","CSS","Svelte"]);
  const inf  = score(["Docker","Docker Compose","Kubernetes","Nginx","AWS","GCP"]);
  const be   = score(["Python","FastAPI","Django","Flask","Express","Go","Java","Celery"]);
  const data = score(["PostgreSQL","MySQL","MongoDB","Redis","Qdrant","Supabase","SQLAlchemy"]);
  const tool = score(["Vitest","Jest","pytest","ESLint","Zod","Pydantic"]);
  const max  = Math.max(fe, inf, be, data, tool);
  if (max === 0) return "fullstack";
  if (max === fe)   return fe > be ? "frontend" : "fullstack";
  if (max === inf)  return "infra";
  if (max === data) return "data";
  if (max === tool) return "tooling";
  return "backend";
}

// ─── Transform API → G6 ──────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function transformData(apiNodes: APIGraphNode[], apiEdges: APIGraphEdge[]): any {
  const nodes = apiNodes.map((n) => {
    const comboId  = getComboId(n);
    const color    = CATS[comboId]?.color ?? "#06b6d4";
    const isRepo   = n.type === "repo";
    const name     = n.label.includes("/") ? n.label.split("/")[1] : n.label;
    const icon     = isRepo
      ? "⬡"
      : (TECH_ICONS[n.label] ?? n.label.slice(0, 2).toUpperCase());

    return {
      id: n.id,
      style: {
        // Tamanho e forma
        size:       isRepo ? 50 : 32,

        // Fill escuro quase preto com leve tint da cor
        fill:       isRepo
          ? `${color}0d`   // 5% opacity do neon
          : `${color}0a`,

        // Borda neon
        stroke:     color,
        lineWidth:  isRepo ? 2.5 : 1.5,

        // Glow neon via shadow
        shadowColor: color,
        shadowBlur:  isRepo ? 20 : 10,

        // Label sempre visível para repos, hidden para techs (hover)
        label:           isRepo,
        labelText:       name,
        labelFill:       isRepo ? color : "#94a3b8",
        labelFontFamily: "'Fira Code', monospace",
        labelFontSize:   isRepo ? 11 : 9,
        labelMaxWidth:   150,
        labelOffsetY:    6,
        labelWordWrap:   false,
        labelBackground:         true,
        labelBackgroundFill:     "rgba(2,6,23,0.85)",
        labelBackgroundRadius:   3,
        labelBackgroundPadding:  [2, 7, 2, 7],

        // Ícone interno
        iconText:       icon,
        iconFill:       color,
        iconFontSize:   isRepo ? 13 : 10,
        iconFontFamily: "'Fira Code', monospace",
      },
      data: { ...n.data, nodeType: n.type, originalLabel: n.label, comboId },
    };
  });

  const edges = apiEdges.map((e, i) => {
    const sourceNode = apiNodes.find(n => n.id === e.source);
    const comboId    = sourceNode ? getComboId(sourceNode) : "fullstack";
    const color      = CATS[comboId]?.color ?? "#06b6d4";

    return {
      id:     `edge-${i}`,
      source: e.source,
      target: e.target,
      style:  {
        stroke:      `${color}40`,   // neon translúcido
        lineWidth:   1,
        opacity:     0.7,
        lineDash:    [6, 5],
        shadowColor: color,
        shadowBlur:  3,
        endArrow:    false,
      },
      data: { type: e.type, weight: e.weight },
    };
  });

  return { nodes, edges };
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function NodeSidebar({ node, onClose }: { node: SelectedNode; onClose: () => void }) {
  const isRepo   = node.nodeType === "repo";
  const comboId  = node.comboId ?? "fullstack";
  const accent   = CATS[comboId]?.color ?? "#06b6d4";
  const category = CATS[comboId]?.label ?? "";

  const lastIndex = node.last_indexed_at
    ? new Date(node.last_indexed_at).toLocaleDateString("pt-BR", {
        day: "2-digit", month: "short", year: "numeric",
      })
    : "Nunca";

  const allTech = isRepo
    ? [...(node.stack?.frameworks ?? []), ...(node.stack?.languages ?? []), ...(node.stack?.infra ?? [])]
    : [];

  return (
    <div
      style={{
        position:      "absolute",
        top:           0, right: 0, bottom: 0,
        width:         280,
        background:    "rgba(2,6,23,0.97)",
        borderLeft:    `1px solid ${accent}30`,
        backdropFilter:"blur(20px)",
        display:       "flex",
        flexDirection: "column",
        zIndex:        30,
        animation:     "fade-left 0.2s cubic-bezier(.16,1,.3,1) both",
        boxShadow:     `-8px 0 32px ${accent}10`,
      }}
    >
      {/* Linha neon no topo */}
      <div style={{ height: 1, background: `linear-gradient(90deg, transparent, ${accent}88, transparent)` }} />

      {/* Header */}
      <div style={{ padding: "1rem", borderBottom: `1px solid ${accent}18`, display: "flex", alignItems: "flex-start", gap: "0.5rem" }}>
        <div style={{ width: 36, height: 36, borderRadius: 8, background: `${accent}12`, border: `1px solid ${accent}33`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2 }}>
          {isRepo ? <GitBranch size={16} color={accent} /> : <Box size={16} color={accent} />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: "0.72rem", color: accent, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "0.2rem" }}>
            {isRepo ? "Repositório" : "Tecnologia"}
          </div>
          <div style={{ fontFamily: "var(--mono)", fontSize: "0.9rem", fontWeight: 700, color: "var(--text)", wordBreak: "break-all", lineHeight: 1.3, textShadow: `0 0 10px ${accent}44` }}>
            {node.originalLabel.includes("/") ? node.originalLabel.split("/")[1] : node.originalLabel}
          </div>
          {node.originalLabel.includes("/") && (
            <div style={{ fontFamily: "var(--mono)", fontSize: "0.72rem", color: "var(--muted-foreground)", marginTop: "0.1rem" }}>
              {node.originalLabel.split("/")[0]}
            </div>
          )}
        </div>
        <button
          onClick={onClose}
          style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--dim)", padding: 4, flexShrink: 0 }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = accent)}
          onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--dim)")}
        >
          <X size={15} />
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0.85rem 1rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
        {/* Badges */}
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <span style={{ fontFamily: "var(--mono)", fontSize: "0.72rem", color: accent, background: `${accent}18`, border: `1px solid ${accent}44`, borderRadius: 4, padding: "2px 8px", letterSpacing: "0.08em" }}>
            {category}
          </span>
          {isRepo && node.status && (
            <span style={{ fontFamily: "var(--mono)", fontSize: "0.72rem", color: node.status === "done" ? "#22c55e" : "#fbbf24", background: node.status === "done" ? "rgba(34,197,94,.12)" : "rgba(251,191,36,.12)", border: `1px solid ${node.status === "done" ? "#22c55e" : "#fbbf24"}44`, borderRadius: 4, padding: "2px 8px", letterSpacing: "0.06em", textTransform: "uppercase" }}>
              {node.status === "done" ? "active" : node.status}
            </span>
          )}
          {!isRepo && node.repo_count != null && (
            <span style={{ fontFamily: "var(--mono)", fontSize: "0.72rem", color: "#22c55e", background: "rgba(34,197,94,.12)", border: "1px solid rgba(34,197,94,.3)", borderRadius: 4, padding: "2px 8px" }}>
              {node.repo_count} repos
            </span>
          )}
        </div>

        {/* Data */}
        {isRepo && (
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Clock size={11} color="var(--dim)" style={{ flexShrink: 0 }} />
            <span style={{ fontFamily: "var(--mono)", fontSize: "0.75rem", color: "var(--muted-foreground)" }}>{lastIndex}</span>
          </div>
        )}

        {/* Stack */}
        {allTech.length > 0 && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.5rem" }}>
              <Layers size={11} color="var(--dim)" />
              <span style={{ fontFamily: "var(--mono)", fontSize: "0.72rem", color: "var(--dim)", letterSpacing: "0.1em", textTransform: "uppercase" }}>Stack</span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
              {allTech.map((t) => {
                const tc = CATS[TECH_COMBO_MAP[t] ?? "tech"]?.color ?? "#64748b";
                return (
                  <span key={t} style={{ fontFamily: "var(--mono)", fontSize: "0.72rem", color: tc, background: `${tc}14`, border: `1px solid ${tc}33`, borderRadius: 4, padding: "2px 7px" }}>{t}</span>
                );
              })}
            </div>
          </div>
        )}

        {/* Depende de (repo → techs) */}
        {node.uses && node.uses.length > 0 && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.5rem" }}>
              <ArrowRight size={11} color="var(--cyan)" />
              <span style={{ fontFamily: "var(--mono)", fontSize: "0.72rem", color: "var(--dim)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                depende de ({node.uses.length})
              </span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem" }}>
              {node.uses.map((t) => {
                const tc = CATS[TECH_COMBO_MAP[t] ?? "tech"]?.color ?? "#64748b";
                return <span key={t} style={{ fontFamily: "var(--mono)", fontSize: "0.7rem", color: tc, background: `${tc}14`, border: `1px solid ${tc}28`, borderRadius: 3, padding: "1px 6px" }}>{t}</span>;
              })}
            </div>
          </div>
        )}

        {/* Usado por (tech → repos) */}
        {node.usedBy && node.usedBy.length > 0 && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.5rem" }}>
              <GitBranch size={11} color="#a78bfa" />
              <span style={{ fontFamily: "var(--mono)", fontSize: "0.72rem", color: "var(--dim)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                usado por ({node.usedBy.length})
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
              {node.usedBy.map((r) => (
                <div key={r} style={{ fontFamily: "var(--mono)", fontSize: "0.75rem", color: "var(--muted-foreground)", padding: "2px 8px", background: "var(--bg-panel)", borderRadius: 4 }}>{r}</div>
              ))}
            </div>
          </div>
        )}

        {/* Summary */}
        {node.summary && (
          <div>
            <div style={{ fontFamily: "var(--mono)", fontSize: "0.72rem", color: "var(--dim)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "0.4rem" }}>Resumo</div>
            <p style={{ fontFamily: "var(--sans)", fontSize: "0.78rem", color: "var(--muted-foreground)", lineHeight: 1.6, margin: 0 }}>
              {node.summary.slice(0, 280)}{node.summary.length > 280 ? "…" : ""}
            </p>
          </div>
        )}

        {/* GitHub link */}
        {isRepo && (
          <a href={`https://github.com/${node.originalLabel}`} target="_blank" rel="noopener noreferrer"
            style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontFamily: "var(--mono)", fontSize: "0.75rem", color: accent, textDecoration: "none", marginTop: "auto", paddingTop: "0.5rem" }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.opacity = "0.7")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.opacity = "1")}
          >
            <ExternalLink size={11} />
            Abrir no GitHub
          </a>
        )}
      </div>

      {/* Linha neon embaixo */}
      <div style={{ height: 1, background: `linear-gradient(90deg, transparent, ${accent}44, transparent)` }} />
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function GraphClient({ nodes, edges }: { nodes: APIGraphNode[]; edges: APIGraphEdge[] }) {
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
    if (!containerRef.current || nodes.length === 0) { setLoading(false); return; }

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
            nodeSize:                   50,
            unitRadius:                 155,
            linkDistance:               300,
            preventOverlap:             true,
            maxPreventOverlapIteration: 200,
            sortBy:                     "comboId",
            sortStrength:               45,
          },

          node: {
            type:  "circle",
            state: {
              active: {
                label:       true,
                lineWidth:   3,
                shadowBlur:  28,
                zIndex:      100,
              },
              selected: {
                label:       true,
                lineWidth:   3,
                shadowBlur:  32,
                stroke:      "#fbbf24",
                shadowColor: "#fbbf24",
                zIndex:      100,
              },
              inactive: { opacity: 0.18, shadowBlur: 0 },
            },
          },

          edge: {
            type:  "quadratic",
            state: {
              active:   { opacity: 0.9, lineWidth: 1.5, shadowBlur: 6 },
              selected: { opacity: 1,   lineWidth: 2,   shadowBlur: 8 },
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

          // Sem minimap
          plugins: [],
        });

        await graph.render();

        // Flow animation nas arestas
        graph.getEdgeData().forEach((edge: unknown) => {
          try {
            const id  = (edge as { id: string }).id;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const el  = (graph as any).context?.element?.getElement?.(id);
            const key = el?.getShape?.("key") ?? el?.children?.[0];
            key?.animate?.(
              [{ lineDashOffset: 22 }, { lineDashOffset: 0 }],
              { duration: 5000, iterations: Infinity, easing: "linear" },
            );
          } catch {}
        });

        // Click em nó
        graph.on("node:click", (evt: unknown) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const e      = evt as any;
          const nodeId = e?.target?.id ?? e?.itemId;
          if (!nodeId) return;
          const node = nodes.find((n) => n.id === nodeId);
          if (!node) return;
          const isRepo = node.type === "repo";
          const uses   = isRepo
            ? edges.filter((ed) => ed.source === nodeId && ed.type === "uses_technology")
                   .map((ed) => nodes.find((n) => n.id === ed.target)?.label ?? ed.target)
            : [];
          const usedBy = !isRepo
            ? edges.filter((ed) => ed.target === nodeId)
                   .map((ed) => {
                     const src = nodes.find((n) => n.id === ed.source);
                     return src?.label.includes("/") ? src.label.split("/")[1] : (src?.label ?? ed.source);
                   })
            : [];
          setSelectedNode({
            nodeType:       node.type,
            originalLabel:  node.label,
            status:         node.data.status,
            last_indexed_at:node.data.last_indexed_at,
            stack:          node.data.stack,
            summary:        node.data.summary,
            repo_count:     node.data.repo_count,
            comboId:        getComboId(node),
            uses,
            usedBy,
          });
        });

        graph.on("canvas:click", () => setSelectedNode(null));

        if (!destroyed) {
          graphRef.current = graph;
          setLoading(false);
          setReady(true);
        } else {
          graph.destroy();
        }
      } catch (err) {
        if (!destroyed) { console.error("[GraphClient] init error:", err); setLoading(false); }
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

  const LEGEND = Object.entries(CATS).map(([, { label, color }]) => ({ label, color }));

  return (
    <div
      style={{
        position:     "relative",
        width:        "100%",
        height:       "100%",
        overflow:     "hidden",
        borderRadius: "var(--r-lg)",
        background:   "#020812",
        border:       "1px solid rgba(6,182,212,0.12)",
        boxShadow:    "0 0 40px rgba(6,182,212,0.04), inset 0 0 80px rgba(6,182,212,0.02)",
      }}
    >
      {/* Grid de fundo */}
      <div
        aria-hidden
        style={{
          position:        "absolute",
          inset:           0,
          backgroundImage: `
            linear-gradient(rgba(6,182,212,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(6,182,212,0.04) 1px, transparent 1px)
          `,
          backgroundSize:  "48px 48px",
          pointerEvents:   "none",
          zIndex:          0,
        }}
      />

      {/* Scanlines */}
      <div
        aria-hidden
        style={{
          position:        "absolute",
          inset:           0,
          backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.08) 2px, rgba(0,0,0,0.08) 4px)",
          pointerEvents:   "none",
          zIndex:          1,
        }}
      />

      {/* Glow central */}
      <div
        aria-hidden
        style={{
          position:     "absolute",
          top:          "50%",
          left:         "50%",
          transform:    "translate(-50%, -50%)",
          width:        "60%",
          height:       "60%",
          background:   "radial-gradient(ellipse, rgba(6,182,212,0.04) 0%, transparent 70%)",
          pointerEvents:"none",
          zIndex:       0,
        }}
      />

      {/* Loading */}
      {loading && (
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "1rem", zIndex: 20, background: "#020812" }}>
          <div style={{ width: 32, height: 32, border: "2px solid #0d1f35", borderTopColor: "#06b6d4", borderRadius: "50%", animation: "spin-slow 0.7s linear infinite" }} />
          <span style={{ fontFamily: "var(--mono)", fontSize: "0.7rem", color: "#06b6d4", letterSpacing: "0.14em", textTransform: "uppercase", textShadow: "0 0 12px rgba(6,182,212,0.5)" }}>
            Inicializando grafo...
          </span>
        </div>
      )}

      {/* Empty state */}
      {!loading && nodes.length === 0 && (
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "0.75rem", zIndex: 20 }}>
          <span style={{ fontSize: "2.5rem", opacity: 0.2, filter: "drop-shadow(0 0 8px #06b6d4)" }}>⬡</span>
          <span style={{ fontFamily: "var(--mono)", fontSize: "0.8rem", color: "var(--muted-foreground)" }}>Nenhum dado indexado</span>
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
              style={{ width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(2,8,18,0.9)", border: "1px solid rgba(6,182,212,0.2)", borderRadius: 6, color: "#4a7a9b", fontFamily: "var(--mono)", fontSize: "1rem", cursor: "pointer", backdropFilter: "blur(8px)", transition: "all 150ms" }}
              onMouseEnter={(e) => { const el = e.currentTarget; el.style.color = "#06b6d4"; el.style.borderColor = "rgba(6,182,212,.5)"; el.style.boxShadow = "0 0 8px rgba(6,182,212,0.2)"; }}
              onMouseLeave={(e) => { const el = e.currentTarget; el.style.color = "#4a7a9b"; el.style.borderColor = "rgba(6,182,212,0.2)"; el.style.boxShadow = "none"; }}
            >
              {icon}
            </button>
          ))}
        </div>
      )}

      {/* Legenda */}
      {ready && (
        <div style={{ position: "absolute", bottom: 12, left: 12, display: "flex", flexDirection: "column", gap: 5, zIndex: 20, background: "rgba(2,8,18,0.88)", border: "1px solid rgba(6,182,212,0.1)", borderRadius: 8, padding: "8px 12px", backdropFilter: "blur(12px)" }}>
          <span style={{ fontFamily: "var(--mono)", fontSize: "0.72rem", color: "rgba(6,182,212,0.5)", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 2 }}>
            // categorias
          </span>
          {LEGEND.map(({ label, color }) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: color, boxShadow: `0 0 5px ${color}`, flexShrink: 0 }} />
              <span style={{ fontFamily: "var(--mono)", fontSize: "0.72rem", color: "var(--muted-foreground)" }}>{label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Canvas G6 — acima do grid mas abaixo do UI */}
      <div ref={containerRef} style={{ position: "absolute", inset: 0, zIndex: 2 }} />

      {/* Sidebar */}
      {selectedNode && (
        <NodeSidebar node={selectedNode} onClose={() => setSelectedNode(null)} />
      )}
    </div>
  );
}
