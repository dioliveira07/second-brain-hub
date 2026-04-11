"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { X, GitBranch, ArrowRight, Layers, Clock, Box } from "lucide-react";

// ─── API types (shared with GraphClient) ─────────────────────────────────────
export interface APIGraphNode {
  id:    string;
  type:  "repo" | "technology" | "developer";
  label: string;
  size:  number;
  color: string;
  data: {
    full_name?:       string;
    status?:          string;
    last_indexed_at?: string | null;
    stack?:           { languages?: string[]; frameworks?: string[]; infra?: string[] };
    summary?:         string;
    name?:            string;
    repo_count?:      number;
  };
}

export interface APIGraphEdge {
  source: string;
  target: string;
  type:   string;
  weight: number;
}

// ─── Category system ──────────────────────────────────────────────────────────
const CATS: Record<string, { color: string; label: string }> = {
  frontend: { color: "#06b6d4", label: "Frontend"      },
  fullstack:{ color: "#a78bfa", label: "Full-stack"    },
  backend:  { color: "#f87171", label: "Backend"       },
  data:     { color: "#fbbf24", label: "Data / Storage" },
  infra:    { color: "#fb923c", label: "Infra / Ops"   },
  tooling:  { color: "#34d399", label: "Tooling"       },
  tech:     { color: "#22c55e", label: "Tecnologia"    },
};

const TECH_COMBO_MAP: Record<string, string> = {
  React: "frontend", "Vue.js": "frontend", Angular: "frontend",
  "Next.js": "frontend", Vite: "frontend", "Tailwind CSS": "frontend",
  HTML: "frontend", CSS: "frontend", Svelte: "frontend", Astro: "frontend",
  Python: "fullstack", "Node.js": "fullstack", TypeScript: "fullstack",
  JavaScript: "fullstack", FastAPI: "backend", Express: "backend",
  Django: "backend", Flask: "backend", Go: "backend", Java: "backend",
  "Anthropic/Claude": "tooling", HTTPX: "backend", Celery: "backend",
  PostgreSQL: "data", "PostgreSQL (asyncpg)": "data", MySQL: "data",
  MongoDB: "data", Redis: "data", Qdrant: "data", Supabase: "data",
  SQLAlchemy: "data", Alembic: "data", Prisma: "data", Drizzle: "data",
  Docker: "infra", "Docker Compose": "infra",
  Kubernetes: "infra", Nginx: "infra", AWS: "infra", GCP: "infra",
  Vitest: "tooling", Jest: "tooling", pytest: "tooling",
  Zod: "tooling", Pydantic: "tooling", ESLint: "tooling",
  Laravel: "fullstack", PHP: "fullstack",
};

function getCat(node: APIGraphNode): string {
  if (node.type === "technology") return TECH_COMBO_MAP[node.label] ?? "tech";
  if (node.type !== "repo") return "tooling";
  const s   = node.data.stack;
  if (!s) return "fullstack";
  const all = [...(s.frameworks ?? []), ...(s.languages ?? []), ...(s.infra ?? [])];
  const score = (keys: string[]) => all.filter((t) => keys.includes(t)).length;
  const fe    = score(["React","Vue.js","Angular","Next.js","Vite","Tailwind CSS","HTML","CSS","Svelte"]);
  const inf   = score(["Docker","Docker Compose","Kubernetes","Nginx","AWS","GCP"]);
  const be    = score(["Python","FastAPI","Django","Flask","Express","Go","Java","Celery"]);
  const data  = score(["PostgreSQL","MySQL","MongoDB","Redis","Qdrant","Supabase","SQLAlchemy"]);
  const tool  = score(["Vitest","Jest","pytest","ESLint","Zod","Pydantic"]);
  const max   = Math.max(fe, inf, be, data, tool);
  if (max === 0) return "fullstack";
  if (max === fe)   return fe > be ? "frontend" : "fullstack";
  if (max === inf)  return "infra";
  if (max === data) return "data";
  if (max === tool) return "tooling";
  return "backend";
}

// ─── Selection detail ─────────────────────────────────────────────────────────
interface SelNode {
  nodeType:  "repo" | "technology" | "developer";
  label:     string;
  cat:       string;
  status?:   string;
  lastIndex?:string | null;
  stack?:    { languages?: string[]; frameworks?: string[]; infra?: string[] };
  summary?:  string;
  repoCount?:number;
  usedBy:    string[];   // repos que usam esta tecnologia
  uses:      string[];   // tecnologias que este repo usa
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────
function NodeSidebar({ node, onClose }: { node: SelNode; onClose: () => void }) {
  const accent   = CATS[node.cat]?.color ?? "#5a7a9a";
  const isRepo   = node.nodeType === "repo";
  const allStack = isRepo
    ? [...(node.stack?.frameworks ?? []), ...(node.stack?.languages ?? []), ...(node.stack?.infra ?? [])]
    : [];
  const lastIdx  = node.lastIndex
    ? new Date(node.lastIndex).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })
    : null;

  return (
    <div style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: 300, background: "rgba(2,6,23,0.97)", borderLeft: `1px solid ${accent}30`, backdropFilter: "blur(20px)", display: "flex", flexDirection: "column", zIndex: 30, animation: "fade-left 0.2s cubic-bezier(.16,1,.3,1) both", boxShadow: `-8px 0 32px ${accent}10` }}>
      <div style={{ height: 1, background: `linear-gradient(90deg, transparent, ${accent}88, transparent)` }} />

      {/* Header */}
      <div style={{ padding: "1rem", borderBottom: `1px solid ${accent}18`, display: "flex", alignItems: "flex-start", gap: "0.5rem" }}>
        <div style={{ width: 36, height: 36, borderRadius: 8, background: `${accent}12`, border: `1px solid ${accent}33`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2 }}>
          {isRepo ? <GitBranch size={16} color={accent} /> : <Box size={16} color={accent} />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: "0.72rem", color: accent, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "0.2rem" }}>
            {CATS[node.cat]?.label ?? node.cat}
          </div>
          <div style={{ fontFamily: "var(--mono)", fontSize: "0.88rem", fontWeight: 700, color: "var(--text)", wordBreak: "break-all", lineHeight: 1.3, textShadow: `0 0 10px ${accent}44` }}>
            {node.label.includes("/") ? node.label.split("/")[1] : node.label}
          </div>
          {node.label.includes("/") && (
            <div style={{ fontFamily: "var(--mono)", fontSize: "0.72rem", color: "var(--muted-foreground)", marginTop: "0.1rem" }}>
              {node.label.split("/")[0]}
            </div>
          )}
        </div>
        <button onClick={onClose} style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--dim)", padding: 4, flexShrink: 0 }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = accent)}
          onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--dim)")}>
          <X size={15} />
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0.85rem 1rem", display: "flex", flexDirection: "column", gap: "1rem" }}>

        {/* Badges */}
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <span style={{ fontFamily: "var(--mono)", fontSize: "0.72rem", color: accent, background: `${accent}18`, border: `1px solid ${accent}44`, borderRadius: 4, padding: "2px 8px" }}>
            {CATS[node.cat]?.label ?? node.cat}
          </span>
          {isRepo && node.status && (
            <span style={{ fontFamily: "var(--mono)", fontSize: "0.72rem", color: node.status === "done" ? "#22c55e" : "#fbbf24", background: node.status === "done" ? "rgba(34,197,94,.12)" : "rgba(251,191,36,.12)", border: `1px solid ${node.status === "done" ? "#22c55e" : "#fbbf24"}44`, borderRadius: 4, padding: "2px 8px", textTransform: "uppercase" }}>
              {node.status === "done" ? "indexed" : node.status}
            </span>
          )}
          {!isRepo && node.repoCount != null && (
            <span style={{ fontFamily: "var(--mono)", fontSize: "0.72rem", color: "#22c55e", background: "rgba(34,197,94,.12)", border: "1px solid rgba(34,197,94,.3)", borderRadius: 4, padding: "2px 8px" }}>
              {node.repoCount} repos
            </span>
          )}
        </div>

        {/* Last indexed */}
        {lastIdx && (
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Clock size={11} color="var(--dim)" style={{ flexShrink: 0 }} />
            <span style={{ fontFamily: "var(--mono)", fontSize: "0.75rem", color: "var(--muted-foreground)" }}>{lastIdx}</span>
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

        {/* Stack */}
        {allStack.length > 0 && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.5rem" }}>
              <Layers size={11} color="var(--dim)" />
              <span style={{ fontFamily: "var(--mono)", fontSize: "0.72rem", color: "var(--dim)", letterSpacing: "0.1em", textTransform: "uppercase" }}>Stack</span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
              {allStack.map((t) => {
                const tc = CATS[TECH_COMBO_MAP[t] ?? "tech"]?.color ?? "#64748b";
                return (
                  <span key={t} style={{ fontFamily: "var(--mono)", fontSize: "0.72rem", color: tc, background: `${tc}14`, border: `1px solid ${tc}33`, borderRadius: 4, padding: "2px 7px" }}>{t}</span>
                );
              })}
            </div>
          </div>
        )}

        {/* Usa (repo → techs) */}
        {node.uses.length > 0 && (
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

        {/* Afinidade com outros repos */}
        {node.usedBy.length > 0 && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.5rem" }}>
              <GitBranch size={11} color="#a78bfa" />
              <span style={{ fontFamily: "var(--mono)", fontSize: "0.72rem", color: "var(--dim)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                afinidade com ({node.usedBy.length})
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
              {node.usedBy.map((r) => (
                <div key={r} style={{ fontFamily: "var(--mono)", fontSize: "0.75rem", color: "var(--muted-foreground)", padding: "2px 8px", background: "var(--bg-panel)", borderRadius: 4 }}>{r}</div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div style={{ height: 1, background: `linear-gradient(90deg, transparent, ${accent}44, transparent)` }} />
    </div>
  );
}

// ─── Derive repo→repo edges from shared technologies ─────────────────────────
// Techs used by more than MAX_REPOS are too universal (e.g. TypeScript/Git)
// and would create an unreadable hairball — skip them.
const MAX_TECH_REPOS = 10;
// Explicitly skip language-level ubiquitous techs
const SKIP_TECHS = new Set([
  "TypeScript", "JavaScript", "Node.js", "Git", "GitHub Actions", "HTML", "CSS",
]);

interface SharedEdge {
  source: string; target: string;
  techLabel: string; cat: string; color: string;
}

function deriveSharedEdges(nodes: APIGraphNode[], edges: APIGraphEdge[]): SharedEdge[] {
  // 1. tech → list of repos that use it
  const techToRepos = new Map<string, string[]>();
  for (const e of edges) {
    if (e.type !== "uses_technology") continue;
    const arr = techToRepos.get(e.target) ?? [];
    arr.push(e.source);
    techToRepos.set(e.target, arr);
  }

  const result: SharedEdge[] = [];
  for (const [techId, repos] of techToRepos) {
    if (repos.length < 2 || repos.length > MAX_TECH_REPOS) continue;
    const techNode = nodes.find((n) => n.id === techId);
    if (!techNode || SKIP_TECHS.has(techNode.label)) continue;

    const cat   = getCat(techNode);
    const color = CATS[cat]?.color ?? "#5a7a9a";

    for (let i = 0; i < repos.length; i++) {
      for (let j = i + 1; j < repos.length; j++) {
        result.push({ source: repos[i], target: repos[j], techLabel: techNode.label, cat, color });
      }
    }
  }
  return result;
}

// ─── Main component ───────────────────────────────────────────────────────────
export function DepsGraphClient({ nodes, edges }: { nodes: APIGraphNode[]; edges: APIGraphEdge[] }) {
  const containerRef                    = useRef<HTMLDivElement>(null);
  const graphRef                        = useRef<unknown>(null);
  const [loading,      setLoading]      = useState(true);
  const [ready,        setReady]        = useState(false);
  const [selNode,      setSelNode]      = useState<SelNode | null>(null);

  // Pre-compute derived edges — useMemo evita novo array a cada render (quebraria o useEffect)
  const sharedEdges = useMemo(() => deriveSharedEdges(nodes, edges), [nodes, edges]);

  const zoomIn  = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g = graphRef.current as any;
    g?.zoomTo?.((g.getZoom?.() ?? 1) * 1.3, undefined, { duration: 250 });
  }, []);
  const zoomOut = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g = graphRef.current as any;
    g?.zoomTo?.((g.getZoom?.() ?? 1) / 1.3, undefined, { duration: 250 });
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

        // ── Degree map (usando arestas derivadas para sizing dos repos) ────────
        const repoNodes = nodes.filter((n) => n.type === "repo");
        const deg: Record<string, number> = {};
        repoNodes.forEach((n) => { deg[n.id] = 0; });
        sharedEdges.forEach((e) => {
          deg[e.source] = (deg[e.source] ?? 0) + 1;
          deg[e.target] = (deg[e.target] ?? 0) + 1;
        });
        const maxDeg = Math.max(...Object.values(deg), 1);

        // ── Build G6 nodes (somente repos) ────────────────────────────────────
        const gNodes = repoNodes.map((n) => {
          const cat   = getCat(n);
          const color = CATS[cat]?.color ?? "#5a7a9a";
          const d     = deg[n.id] ?? 0;
          const size  = 26 + (d / maxDeg) * 28;
          const name  = n.label.includes("/") ? n.label.split("/")[1] : n.label;
          const short = name.length > 20 ? name.slice(0, 19) + "…" : name;

          return {
            id:    n.id,
            style: {
              size,
              fill:             `${color}0d`,
              stroke:           color,
              lineWidth:        2.5,
              shadowColor:      color,
              shadowBlur:       20,
              label:            true,
              labelText:        short,
              labelFill:        color,
              labelFontFamily:  "'Fira Code', monospace",
              labelFontSize:    11,
              labelMaxWidth:    160,
              labelOffsetY:     6,
              labelWordWrap:    false,
              labelBackground:        true,
              labelBackgroundFill:    "rgba(2,6,23,0.85)",
              labelBackgroundRadius:  3,
              labelBackgroundPadding: [2, 7, 2, 7] as [number,number,number,number],
              iconText:        "⬡",
              iconFill:        color,
              iconFontSize:    13,
              iconFontFamily:  "'Fira Code', monospace",
            },
            data: { cat, originalLabel: n.label, nodeType: n.type },
          };
        });

        // ── Build G6 edges — paralelas por afinidade de tech ─────────────────
        // Agrupar por par de repos para distribuir offsets simétricos
        const pairMap = new Map<string, SharedEdge[]>();
        for (const se of sharedEdges) {
          const key = [se.source, se.target].sort().join("||");
          const arr = pairMap.get(key) ?? [];
          arr.push(se);
          pairMap.set(key, arr);
        }

        const gEdges: unknown[] = [];
        let edgeIdx = 0;
        for (const arr of pairMap.values()) {
          const capped = arr.slice(0, 8); // máximo 8 linhas paralelas por par
          const nc     = capped.length;
          capped.forEach((se, idx) => {
            const offset = nc === 1 ? 0 : (idx - (nc - 1) / 2) * 28;
            gEdges.push({
              id:     `shared-${edgeIdx++}`,
              source: se.source,
              target: se.target,
              data:   { techLabel: se.techLabel, cat: se.cat },
              style:  {
                stroke:      `${se.color}70`,
                lineWidth:   1.5,
                opacity:     0.75,
                curveOffset: offset,
                lineDash:    [4, 5],
                shadowColor: se.color,
                shadowBlur:  5,
                endArrow:    false,
              },
            });
          });
        }

        const graph = new Graph({
          container: el, width, height,
          autoResize: true, autoFit: "center", background: "transparent",
          data: { nodes: gNodes, edges: gEdges as never[] },

          layout: {
            type:           "force",
            linkDistance:   180,
            nodeStrength:   -600,
            edgeStrength:   0.6,
            preventOverlap: true,
            nodeSize:       60,
            alphaDecay:     0.025,
            velocityDecay:  0.4,
          },

          node: {
            type:  "circle",
            state: {
              active:   { label: true, lineWidth: 3,   shadowBlur: 28, zIndex: 100 },
              selected: { label: true, lineWidth: 3,   shadowBlur: 32, stroke: "#fbbf24", shadowColor: "#fbbf24", zIndex: 100 },
              inactive: { opacity: 0.2, shadowBlur: 0 },
            },
          },

          edge: {
            type:  "quadratic",
            state: {
              active:   { opacity: 0.95, lineWidth: 2,   shadowBlur: 8 },
              selected: { opacity: 1,    lineWidth: 2.5, shadowBlur: 10 },
              inactive: { opacity: 0.08 },
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

        // ── Edge flow animation ───────────────────────────────────────────────
        graph.getEdgeData().forEach((edge: unknown) => {
          try {
            const id  = (edge as { id: string }).id;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const el  = (graph as any).context?.element?.getElement?.(id);
            const key = el?.getShape?.("key") ?? el?.children?.[0];
            key?.animate?.([{ lineDashOffset: 22 }, { lineDashOffset: 0 }], { duration: 4000, iterations: Infinity, easing: "linear" });
          } catch {}
        });

        // ── Click → sidebar ───────────────────────────────────────────────────
        graph.on("node:click", (evt: unknown) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const e      = evt as any;
          const nodeId = e?.target?.id ?? e?.itemId;
          if (!nodeId) return;
          const node = nodes.find((n) => n.id === nodeId);
          if (!node) return;

          // Techs usadas por este repo (via edges originais)
          const uses = edges
            .filter((ed) => ed.source === nodeId && ed.type === "uses_technology")
            .map((ed) => nodes.find((n) => n.id === ed.target)?.label ?? ed.target);

          // Repos que compartilham techs com este repo (via derived edges)
          const usedBy = sharedEdges
            .filter((se) => se.source === nodeId || se.target === nodeId)
            .reduce((acc, se) => {
              const peer = se.source === nodeId ? se.target : se.source;
              const peerNode = nodes.find((n) => n.id === peer);
              const peerName = peerNode?.label.includes("/") ? peerNode.label.split("/")[1] : (peerNode?.label ?? peer);
              const entry = acc.find((a) => a.id === peer);
              if (entry) { entry.techs.push(se.techLabel); }
              else { acc.push({ id: peer, name: peerName, techs: [se.techLabel] }); }
              return acc;
            }, [] as { id: string; name: string; techs: string[] }[])
            .sort((a, b) => b.techs.length - a.techs.length)
            .slice(0, 8)
            .map(({ name, techs }) => `${name} (${techs.join(", ")})`);

          setSelNode({
            nodeType:  node.type,
            label:     node.label,
            cat:       getCat(node),
            status:    node.data.status,
            lastIndex: node.data.last_indexed_at,
            stack:     node.data.stack,
            summary:   node.data.summary,
            repoCount: node.data.repo_count,
            uses,
            usedBy,
          });
        });

        graph.on("canvas:click", () => setSelNode(null));

        if (!destroyed) {
          graphRef.current = graph;
          setLoading(false);
          setReady(true);
        } else {
          graph.destroy();
        }
      } catch (err) {
        if (!destroyed) { console.error("[DepsGraphClient]", err); setLoading(false); }
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
  }, [nodes, edges, sharedEdges]);

  const repoCount  = nodes.filter((n) => n.type === "repo").length;
  const techCount  = nodes.filter((n) => n.type === "technology").length;
  // Unique pairs that share at least 1 non-trivial tech
  const pairCount  = new Set(
    sharedEdges.map((se) => [se.source, se.target].sort().join("||"))
  ).size;

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", borderRadius: "var(--r-lg)", background: "#020812", border: "1px solid rgba(6,182,212,0.12)", boxShadow: "0 0 40px rgba(6,182,212,0.04), inset 0 0 80px rgba(6,182,212,0.02)" }}>
      {/* Grid */}
      <div aria-hidden style={{ position: "absolute", inset: 0, backgroundImage: `linear-gradient(rgba(6,182,212,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(6,182,212,0.04) 1px, transparent 1px)`, backgroundSize: "48px 48px", pointerEvents: "none", zIndex: 0 }} />
      {/* Scanlines */}
      <div aria-hidden style={{ position: "absolute", inset: 0, backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.08) 2px, rgba(0,0,0,0.08) 4px)", pointerEvents: "none", zIndex: 1 }} />
      {/* Glow */}
      <div aria-hidden style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: "60%", height: "60%", background: "radial-gradient(ellipse, rgba(6,182,212,0.04) 0%, transparent 70%)", pointerEvents: "none", zIndex: 0 }} />

      {/* Loading */}
      {loading && (
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "1rem", zIndex: 20, background: "#020812" }}>
          <div style={{ width: 32, height: 32, border: "2px solid #0d1f35", borderTopColor: "#06b6d4", borderRadius: "50%", animation: "spin-slow 0.7s linear infinite" }} />
          <span style={{ fontFamily: "var(--mono)", fontSize: "0.7rem", color: "#06b6d4", letterSpacing: "0.14em", textTransform: "uppercase", textShadow: "0 0 12px rgba(6,182,212,0.5)" }}>
            Calculando grafo...
          </span>
        </div>
      )}

      {/* Toolbar */}
      {ready && (
        <div style={{ position: "absolute", top: 12, right: selNode ? 312 : 12, display: "flex", flexDirection: "column", gap: 6, zIndex: 20, transition: "right 200ms ease" }}>
          {([{ icon: "+", action: zoomIn, title: "Zoom In" }, { icon: "−", action: zoomOut, title: "Zoom Out" }, { icon: "⊡", action: fitView, title: "Fit View" }] as const).map(({ icon, action, title }) => (
            <button key={title} onClick={action} title={title}
              style={{ width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(2,8,18,0.9)", border: "1px solid rgba(6,182,212,0.2)", borderRadius: 6, color: "#4a7a9b", fontFamily: "var(--mono)", fontSize: "1rem", cursor: "pointer", backdropFilter: "blur(8px)", transition: "all 150ms" }}
              onMouseEnter={(e) => { const el = e.currentTarget; el.style.color = "#06b6d4"; el.style.borderColor = "rgba(6,182,212,.5)"; el.style.boxShadow = "0 0 8px rgba(6,182,212,0.2)"; }}
              onMouseLeave={(e) => { const el = e.currentTarget; el.style.color = "#4a7a9b"; el.style.borderColor = "rgba(6,182,212,0.2)"; el.style.boxShadow = "none"; }}
            >{icon}</button>
          ))}
        </div>
      )}

      {/* Legenda */}
      {ready && (
        <div style={{ position: "absolute", bottom: 12, left: 12, display: "flex", flexDirection: "column", gap: 5, zIndex: 20, background: "rgba(2,8,18,0.88)", border: "1px solid rgba(6,182,212,0.1)", borderRadius: 8, padding: "8px 12px", backdropFilter: "blur(12px)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 2 }}>
            <Layers size={10} color="rgba(6,182,212,0.5)" />
            <span style={{ fontFamily: "var(--mono)", fontSize: "0.72rem", color: "rgba(6,182,212,0.5)", letterSpacing: "0.14em", textTransform: "uppercase" }}>// categorias</span>
          </div>
          {Object.entries(CATS).map(([, { label, color }]) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: color, boxShadow: `0 0 5px ${color}`, flexShrink: 0 }} />
              <span style={{ fontFamily: "var(--mono)", fontSize: "0.72rem", color: "var(--muted-foreground)" }}>{label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Contadores */}
      {ready && (
        <div style={{ position: "absolute", top: 12, left: 12, display: "flex", gap: "0.5rem", zIndex: 20 }}>
          {[
            { label: `${repoCount} repos`,            color: "#06b6d4" },
            { label: `${techCount} tecnologias`,      color: "#a78bfa" },
            { label: `${pairCount} pares conectados`, color: "#22c55e" },
            { label: `${sharedEdges.length} afinidades`, color: "#fbbf24" },
          ].map(({ label, color }) => (
            <span key={label} style={{ fontFamily: "var(--mono)", fontSize: "0.7rem", color, background: `${color}11`, border: `1px solid ${color}33`, borderRadius: "var(--r)", padding: "0.2rem 0.65rem", letterSpacing: "0.06em" }}>{label}</span>
          ))}
        </div>
      )}

      {/* G6 canvas */}
      <div ref={containerRef} style={{ position: "absolute", inset: 0, zIndex: 2 }} />

      {/* Sidebar */}
      {selNode && <NodeSidebar node={selNode} onClose={() => setSelNode(null)} />}
    </div>
  );
}
