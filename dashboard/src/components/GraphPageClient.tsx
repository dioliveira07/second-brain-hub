"use client";
import dynamic from "next/dynamic";
import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import type { GraphNode, GraphEdge } from "@/lib/hub";
import { X, Search, Zap, GitBranch } from "lucide-react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false }) as any;

type Props = { initialNodes: GraphNode[]; initialEdges: GraphEdge[] };

// ── Palette ────────────────────────────────────────────────────────────────────
const CANVAS_BG = "#070b14";

const TYPE_COLOR: Record<string, string> = {
  repo:        "#00d4ff",
  technology:  "#39ff88",
  developer:   "#ff6b35",
};
const TYPE_GLOW: Record<string, string> = {
  repo:        "rgba(0,212,255,0.7)",
  technology:  "rgba(57,255,136,0.7)",
  developer:   "rgba(255,107,53,0.7)",
};

// ── Helpers ────────────────────────────────────────────────────────────────────
function hexPath(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 6;
    i === 0
      ? ctx.moveTo(x + r * Math.cos(a), y + r * Math.sin(a))
      : ctx.lineTo(x + r * Math.cos(a), y + r * Math.sin(a));
  }
  ctx.closePath();
}

function nodeR(type: string, conn: number): number {
  if (type === "technology") return 3.5 + Math.sqrt(conn) * 0.5;
  if (type === "developer")  return 5 + Math.sqrt(conn) * 0.7;
  return 6 + Math.sqrt(conn) * 0.8;
}

function isFiniteNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

// ── Component ──────────────────────────────────────────────────────────────────
export function GraphPageClient({ initialNodes, initialEdges }: Props) {
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [search, setSearch]     = useState("");

  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef     = useRef<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const dragging     = useRef(false);
  const [dims, setDims] = useState({ w: 900, h: 700 });

  // Mutable refs for draw callbacks — avoids recreating callbacks on state change
  const hoveredIdRef   = useRef<string | null>(null);
  const selectedRef    = useRef<GraphNode | null>(null);
  const searchHitsRef  = useRef<Set<string>>(new Set());
  const neighborsRef   = useRef<Map<string, Set<string>>>(new Map());
  const connCountRef   = useRef<Map<string, number>>(new Map());

  // Sync selected → ref (hoveredId synced directly in handler, not via state)
  useEffect(() => { selectedRef.current = selected; }, [selected]);

  // ── Node map ───────────────────────────────────────────────────────────────
  const nodeMap = useMemo(() => {
    const m = new Map<string, GraphNode>();
    for (const n of initialNodes) m.set(n.id, n);
    return m;
  }, [initialNodes]);

  // ── tech → repos ───────────────────────────────────────────────────────────
  const techToRepoIds = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const e of initialEdges) {
      const src = nodeMap.get(e.source);
      const tgt = nodeMap.get(e.target);
      if (tgt?.type === "technology") {
        if (!m.has(e.target)) m.set(e.target, []);
        m.get(e.target)!.push(e.source);
      }
      if (src?.type === "technology") {
        if (!m.has(e.source)) m.set(e.source, []);
        m.get(e.source)!.push(e.target);
      }
    }
    return m;
  }, [initialEdges, nodeMap]);

  // ── Bipartite projection ───────────────────────────────────────────────────
  const projectedEdges = useMemo(() => {
    const pairWeight = new Map<string, number>();
    for (const repos of techToRepoIds.values()) {
      for (let i = 0; i < repos.length; i++) {
        for (let j = i + 1; j < repos.length; j++) {
          const key = [repos[i], repos[j]].sort().join("|||");
          pairWeight.set(key, (pairWeight.get(key) || 0) + 1);
        }
      }
    }
    const edges: { source: string; target: string; weight: number; type: string }[] = [];
    for (const [key, w] of pairWeight) {
      const [a, b] = key.split("|||");
      edges.push({ source: a, target: b, weight: w, type: "shared_tech" });
    }
    for (const e of initialEdges) {
      const src = nodeMap.get(e.source);
      const tgt = nodeMap.get(e.target);
      if (src?.type === "developer" || tgt?.type === "developer") {
        edges.push({ source: e.source, target: e.target, weight: 1, type: "contributed" });
      }
    }
    return edges;
  }, [initialEdges, nodeMap, techToRepoIds]);

  // ── Neighbors & connection counts → synced to refs ────────────────────────
  const neighbors = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const e of projectedEdges) {
      if (!m.has(e.source)) m.set(e.source, new Set());
      if (!m.has(e.target)) m.set(e.target, new Set());
      m.get(e.source)!.add(e.target);
      m.get(e.target)!.add(e.source);
    }
    return m;
  }, [projectedEdges]);

  const connCount = useMemo(() => {
    const c = new Map<string, number>();
    for (const e of projectedEdges) {
      c.set(e.source, (c.get(e.source) || 0) + 1);
      c.set(e.target, (c.get(e.target) || 0) + 1);
    }
    return c;
  }, [projectedEdges]);

  useEffect(() => { neighborsRef.current = neighbors; }, [neighbors]);
  useEffect(() => { connCountRef.current = connCount; }, [connCount]);

  const searchHits = useMemo(() => {
    if (!search.trim()) return new Set<string>();
    const q = search.toLowerCase();
    return new Set(initialNodes.filter(n => n.label.toLowerCase().includes(q)).map(n => n.id));
  }, [search, initialNodes]);
  useEffect(() => { searchHitsRef.current = searchHits; }, [searchHits]);

  const graphData = useMemo(() => ({
    nodes: initialNodes.map(n => ({ ...n, name: n.label, val: connCount.get(n.id) || 1 })),
    links: projectedEdges.map(e => ({ source: e.source, target: e.target, weight: e.weight, type: e.type })),
  }), [initialNodes, projectedEdges, connCount]);

  // ── Resize ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver(([entry]) => {
      setDims({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  // ── Wheel zoom ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const g = graphRef.current;
      if (!g) return;
      const step = e.deltaY > 0 ? 0.92 : 1 / 0.92;
      g.zoom(Math.max(0.05, Math.min(12, g.zoom() * step)));
    };
    el.addEventListener("wheel", handler, { passive: false, capture: true });
    return () => el.removeEventListener("wheel", handler, { capture: true } as EventListenerOptions);
  }, []);

  // ── d3 physics ─────────────────────────────────────────────────────────────
  const applyForces = useCallback((g: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    g.d3Force("charge").strength((n: any) => n.type === "technology" ? -60 : -220); // eslint-disable-line @typescript-eslint/no-explicit-any
    g.d3Force("link")
      .distance((link: any) => Math.max(40, 180 - (link.weight || 1) * 20)) // eslint-disable-line @typescript-eslint/no-explicit-any
      .strength((link: any) => link.type === "contributed" ? 0.2 : Math.min(0.6, 0.08 * (link.weight || 1))); // eslint-disable-line @typescript-eslint/no-explicit-any
    g.d3Force("center")?.strength(0.15);
    g.d3Force("x", null);
    g.d3Force("y", null);

    g.d3Force("techAnchor", (alpha: number) => {
      const byId = new Map<string, any>(); // eslint-disable-line @typescript-eslint/no-explicit-any
      for (const n of g.graphData().nodes) byId.set(String(n.id), n);
      for (const [techId, repoIds] of techToRepoIds) {
        const tech = byId.get(techId);
        if (!tech || !isFiniteNum(tech.x)) continue;
        let cx = 0, cy = 0, count = 0;
        for (const rid of repoIds) {
          const repo = byId.get(rid);
          if (!repo || !isFiniteNum(repo.x)) continue;
          cx += repo.x; cy += repo.y; count++;
        }
        if (!count) continue;
        cx /= count; cy /= count;
        const dx = cx - tech.x, dy = cy - tech.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const pull = (dist - 55) / dist * alpha * 0.4;
        tech.vx = (tech.vx || 0) + dx * pull;
        tech.vy = (tech.vy || 0) + dy * pull;
      }
    });
  }, [techToRepoIds]);

  const configureGraph = useCallback((el: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (!el) return;
    graphRef.current = el;
    applyForces(el);
  }, [applyForces]);

  // ── Stable mode callback — MUST NOT recreate on every render ──────────────
  const modeReplace = useCallback(() => "replace" as const, []);

  // ── Draw edge — STABLE, try/catch protected ───────────────────────────────
  const drawLink = useCallback(
    (link: any, ctx: CanvasRenderingContext2D) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      try {
        const src = link.source, tgt = link.target;
        if (!src || !tgt) return;
        const x1 = Number(src.x), y1 = Number(src.y);
        const x2 = Number(tgt.x), y2 = Number(tgt.y);
        if (!isFiniteNum(x1) || !isFiniteNum(y1) || !isFiniteNum(x2) || !isFiniteNum(y2)) return;

        const srcId = String(src.id);
        const tgtId = String(tgt.id);
        const hId   = hoveredIdRef.current;
        const isDragging = dragging.current;
        const isActive   = !isDragging && hId != null && (srcId === hId || tgtId === hId);
        const anyHover   = !isDragging && hId != null;
        const weight     = link.weight || 1;
        const isContrib  = link.type === "contributed";
        const t = performance.now() * 0.001;

        ctx.save();

        if (isActive) {
          const grad = ctx.createLinearGradient(x1, y1, x2, y2);
          if (isContrib) {
            grad.addColorStop(0, "rgba(255,107,53,0.85)");
            grad.addColorStop(1, "rgba(255,107,53,0.3)");
          } else {
            grad.addColorStop(0,   "rgba(0,212,255,0.85)");
            grad.addColorStop(0.5, "rgba(57,255,136,0.65)");
            grad.addColorStop(1,   "rgba(0,212,255,0.85)");
          }
          ctx.shadowBlur  = 10;
          ctx.shadowColor = isContrib ? "#ff6b35" : "#00d4ff";
          ctx.strokeStyle = grad;
          ctx.lineWidth   = 1.8;
          ctx.setLineDash([]);
          ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();

          ctx.shadowBlur  = 4;
          ctx.shadowColor = "#ffffff";
          ctx.strokeStyle = "rgba(255,255,255,0.9)";
          ctx.lineWidth   = 0.8;
          ctx.setLineDash([3, 22]);
          ctx.lineDashOffset = -(t * 120) % 25;
          ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
          ctx.setLineDash([]);
        } else if (anyHover) {
          ctx.strokeStyle = "rgba(255,255,255,0.018)";
          ctx.lineWidth   = 0.4;
          ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        } else {
          const alpha = Math.min(0.2, 0.05 + weight * 0.025);
          ctx.strokeStyle = isContrib ? `rgba(255,107,53,${alpha})` : `rgba(0,212,255,${alpha})`;
          ctx.lineWidth = Math.min(1.5, 0.4 + weight * 0.15);
          ctx.setLineDash([5, 18]);
          ctx.lineDashOffset = -(t * 18) % 23;
          ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
          ctx.setLineDash([]);
        }

        // NOTE: do NOT ctx.restore() — library calls it after linkCanvasObject in replace mode.
      } catch { /* prevent animation loop crash */ }
    },
    [],
  );

  // ── Draw node — STABLE, try/catch protected ───────────────────────────────
  const drawNode = useCallback(
    (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      try {
        const id    = String(node.id || "");
        const type  = String(node.type || "repo");
        const label = String(node.name || node.label || "");
        const x     = Number(node.x);
        const y     = Number(node.y);
        if (!isFiniteNum(x) || !isFiniteNum(y)) return;
        const t = performance.now() * 0.001;

        const hId        = hoveredIdRef.current;
        const sel        = selectedRef.current;
        const searchHits = searchHitsRef.current;
        const nbrs       = neighborsRef.current;
        const cc         = connCountRef.current;
        const conn       = cc.get(id) || 0;
        const isDragging = dragging.current;

        const isHovered  = hId === id;
        const isNeighbor = hId ? (nbrs.get(hId)?.has(id) ?? false) : false;
        const isSelected = sel?.id === id;
        const isHit      = searchHits.has(id);
        const shouldFade = !isDragging && hId != null && !isHovered && !isNeighbor;

        const color = isHit ? "#fbbf24" : (TYPE_COLOR[type] || "#00d4ff");
        const glow  = isHit ? "rgba(251,191,36,0.8)" : (TYPE_GLOW[type] || TYPE_GLOW.repo);
        const r     = nodeR(type, conn);

        ctx.save();
        ctx.globalAlpha = shouldFade ? 0.05 : 1;

        // Opaque bg to hide edges behind node
        if (type === "repo") hexPath(ctx, x, y, r + 3);
        else { ctx.beginPath(); ctx.arc(x, y, r + 2.5, 0, Math.PI * 2); }
        ctx.fillStyle = CANVAS_BG;
        ctx.fill();

        if (type === "repo") {
          if (isHovered || isSelected) {
            const pulse = 1 + Math.sin(t * 3.5) * 0.1;
            hexPath(ctx, x, y, r * pulse + 6);
            ctx.strokeStyle = color + "30"; ctx.lineWidth = 1.2; ctx.stroke();
          }
          ctx.shadowBlur  = isHovered ? 22 : isSelected ? 18 : 10;
          ctx.shadowColor = glow;
          hexPath(ctx, x, y, r);
          ctx.fillStyle = "#0b1e38cc"; ctx.fill();
          ctx.strokeStyle = color;
          ctx.lineWidth = isHovered || isSelected ? 1.6 : 0.9;
          ctx.stroke(); ctx.shadowBlur = 0;

          ctx.shadowBlur = 12; ctx.shadowColor = color;
          ctx.beginPath(); ctx.arc(x, y, r * 0.26, 0, Math.PI * 2);
          ctx.fillStyle = color; ctx.fill(); ctx.shadowBlur = 0;

          if (isHovered || isSelected) {
            for (let i = 0; i < 6; i++) {
              const a = (Math.PI / 3) * i - Math.PI / 6;
              ctx.shadowBlur = 5; ctx.shadowColor = color;
              ctx.beginPath(); ctx.arc(x + r * Math.cos(a), y + r * Math.sin(a), 1.4, 0, Math.PI * 2);
              ctx.fillStyle = color; ctx.fill(); ctx.shadowBlur = 0;
            }
          }
        } else if (type === "technology") {
          ctx.beginPath(); ctx.arc(x, y, r + 2, 0, Math.PI * 2);
          ctx.strokeStyle = color + (isHovered ? "55" : "22"); ctx.lineWidth = 0.7; ctx.stroke();
          ctx.shadowBlur = isHovered ? 14 : 5; ctx.shadowColor = glow;
          ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fillStyle = color + "1a"; ctx.fill();
          ctx.strokeStyle = color; ctx.lineWidth = isHovered ? 1.2 : 0.7; ctx.stroke(); ctx.shadowBlur = 0;
          ctx.beginPath(); ctx.arc(x, y, r * 0.38, 0, Math.PI * 2);
          ctx.fillStyle = color; ctx.fill();
        } else {
          if (isHovered || isSelected) {
            const scanPulse = (t * 1.5) % 1;
            ctx.save();
            ctx.globalAlpha = (1 - scanPulse) * 0.5;
            ctx.beginPath(); ctx.arc(x, y, r + scanPulse * 14, 0, Math.PI * 2);
            ctx.strokeStyle = color; ctx.lineWidth = 0.6; ctx.stroke();
            ctx.restore();
          }
          ctx.shadowBlur = isHovered ? 18 : 6; ctx.shadowColor = glow;
          ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fillStyle = color + "1a"; ctx.fill();
          ctx.strokeStyle = color; ctx.lineWidth = isHovered || isSelected ? 1.5 : 0.8;
          ctx.stroke(); ctx.shadowBlur = 0;
          const tick = r * 0.6;
          ctx.strokeStyle = color + (isHovered ? "cc" : "66"); ctx.lineWidth = 0.6;
          ctx.beginPath();
          ctx.moveTo(x - r - tick, y); ctx.lineTo(x - r * 0.25, y);
          ctx.moveTo(x + r * 0.25, y); ctx.lineTo(x + r + tick, y);
          ctx.moveTo(x, y - r - tick); ctx.lineTo(x, y - r * 0.25);
          ctx.moveTo(x, y + r * 0.25); ctx.lineTo(x, y + r + tick);
          ctx.stroke();
          ctx.beginPath(); ctx.arc(x, y, r * 0.3, 0, Math.PI * 2);
          ctx.fillStyle = color; ctx.fill();
        }

        if (isSelected) {
          ctx.shadowBlur = 14; ctx.shadowColor = "rgba(251,191,36,0.6)";
          ctx.strokeStyle = "#fbbf24"; ctx.lineWidth = 1.5 / globalScale;
          ctx.setLineDash([4, 3]);
          ctx.beginPath(); ctx.arc(x, y, r + (type === "repo" ? 7 : 5.5), 0, Math.PI * 2); ctx.stroke();
          ctx.setLineDash([]); ctx.shadowBlur = 0;
        }

        if (isHovered || isSelected || isHit) {
          const fontSize = Math.max(8, 10 / globalScale);
          ctx.font = `600 ${fontSize}px 'Fira Code', monospace`;
          const text = label.replace(/^[^/]+\//, "");
          const tw = ctx.measureText(text).width;
          const ly = y + r + (type === "repo" ? 6 : 4) / globalScale;
          const pad = 4 / globalScale;
          ctx.fillStyle = "rgba(7,11,20,0.92)"; ctx.strokeStyle = color + "44"; ctx.lineWidth = 0.5;
          ctx.fillRect(x - tw / 2 - pad, ly, tw + pad * 2, fontSize + 3 / globalScale);
          ctx.strokeRect(x - tw / 2 - pad, ly, tw + pad * 2, fontSize + 3 / globalScale);
          ctx.shadowBlur = 8; ctx.shadowColor = color;
          ctx.fillStyle = isHit ? "#fbbf24" : color;
          ctx.textAlign = "center"; ctx.textBaseline = "top";
          ctx.fillText(text, x, ly + 1.5 / globalScale); ctx.shadowBlur = 0;
        }

        // NOTE: do NOT call ctx.restore() here — in "replace" mode the library
        // calls ctx.restore() after nodeCanvasObject(), which consumes our save().
        // Adding our own restore() first would cause the library's restore to pop
        // the *outer* save (shared across all nodes), corrupting the transform for
        // every subsequent node in the frame.
      } catch { /* prevent animation loop crash */ }
    },
    [],
  );

  // ── Event handlers ────────────────────────────────────────────────────────
  const handleClick = useCallback((node: unknown) => {
    if (dragging.current) return;
    const n = node as GraphNode;
    setSelected(prev => prev?.id === n.id ? null : n);
  }, []);

  // hoveredId — update ref directly (no setState, no re-render, no prop churn)
  const handleHover = useCallback((node: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    hoveredIdRef.current = node?.id ?? null;
  }, []);

  // onNodeDrag — the lib calls this on EACH mousemove during drag (onNodeDragStart does NOT exist)
  const handleDrag = useCallback(() => { dragging.current = true; }, []);

  const handleDragEnd = useCallback(() => {
    setTimeout(() => { dragging.current = false; }, 80);
    setTimeout(() => { graphRef.current?.zoomToFit?.(700, 40); }, 900);
  }, []);

  const selColor = selected ? (TYPE_COLOR[selected.type] || "#00d4ff") : "#00d4ff";

  return (
    <div style={{ display: "flex", height: "100%", margin: "-2rem -2.5rem", overflow: "hidden", background: CANVAS_BG, position: "relative" }}>
      <div style={{ position: "absolute", inset: 0, zIndex: 0, pointerEvents: "none",
        backgroundImage: "linear-gradient(rgba(0,212,255,0.028) 1px, transparent 1px), linear-gradient(90deg, rgba(0,212,255,0.028) 1px, transparent 1px)",
        backgroundSize: "48px 48px",
      }} />
      <div style={{ position: "absolute", inset: 0, zIndex: 0, pointerEvents: "none",
        background: "radial-gradient(ellipse at center, transparent 60%, rgba(7,11,20,0.7) 100%)",
      }} />

      <div ref={containerRef} style={{ position: "absolute", inset: 0, zIndex: 1 }}>
        <div style={{ position: "absolute", top: "1rem", left: "1rem", zIndex: 10 }}>
          <div style={{ position: "relative" }}>
            <Search size={11} style={{ position: "absolute", left: "0.65rem", top: "50%", transform: "translateY(-50%)", color: "rgba(0,212,255,0.5)", pointerEvents: "none" }} />
            <input type="text" placeholder="SEARCH NODE..." value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width: 190, fontSize: "0.68rem", background: "rgba(7,11,20,0.88)", border: "1px solid rgba(0,212,255,0.22)",
                borderRadius: 2, color: "#00d4ff", padding: "0.42rem 0.7rem 0.42rem 2rem", outline: "none",
                fontFamily: "'Fira Code', monospace", letterSpacing: "0.1em",
              }}
            />
          </div>
        </div>

        <div style={{ position: "absolute", bottom: "1.25rem", left: "1.25rem", zIndex: 10, display: "flex", flexDirection: "column", gap: 8 }}>
          {(["repo", "technology", "developer"] as const).map(type => (
            <div key={type} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: type === "repo" ? 1 : "50%", border: `1px solid ${TYPE_COLOR[type]}`, boxShadow: `0 0 6px ${TYPE_COLOR[type]}`, flexShrink: 0 }} />
              <span style={{ fontFamily: "'Fira Code', monospace", fontSize: "0.58rem", color: TYPE_COLOR[type] + "88", textTransform: "uppercase", letterSpacing: "0.12em" }}>{type}</span>
            </div>
          ))}
        </div>

        <div style={{ position: "absolute", bottom: "1.25rem", right: selected ? "292px" : "1.25rem", zIndex: 10,
          fontFamily: "'Fira Code', monospace", fontSize: "0.56rem", color: "rgba(0,212,255,0.22)", transition: "right 0.25s",
        }}>
          {initialNodes.length} nodes · {projectedEdges.length} links
        </div>

        <ForceGraph2D
          ref={configureGraph}
          graphData={graphData}
          backgroundColor={CANVAS_BG}
          nodeCanvasObject={drawNode}
          nodeCanvasObjectMode={modeReplace}
          linkCanvasObject={drawLink}
          linkCanvasObjectMode={modeReplace}
          onNodeClick={handleClick}
          onNodeHover={handleHover}
          onNodeDrag={handleDrag}
          onNodeDragEnd={handleDragEnd}
          autoPauseRedraw={false}
          width={dims.w}
          height={dims.h}
          warmupTicks={80}
          cooldownTicks={300}
          d3AlphaDecay={0.015}
          d3VelocityDecay={0.3}
          nodeLabel=""
          enableNodeDrag
        />
      </div>

      {selected && (
        <div style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: 278,
          background: "rgba(7,11,20,0.96)", backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)",
          borderLeft: `1px solid ${selColor}1a`, padding: "1.5rem 1.25rem 1.25rem",
          overflowY: "auto", zIndex: 20, animation: "fade-right 0.22s cubic-bezier(.16,1,.3,1) both",
        }}>
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "1px", background: `linear-gradient(90deg, ${selColor}, transparent 80%)`, boxShadow: `0 0 10px ${selColor}` }} />
          <div style={{ position: "absolute", top: 10, left: 10, width: 14, height: 14, borderTop: `1px solid ${selColor}`, borderLeft: `1px solid ${selColor}` }} />
          <div style={{ position: "absolute", top: 10, right: 10, width: 14, height: 14, borderTop: `1px solid ${selColor}`, borderRight: `1px solid ${selColor}` }} />

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem", paddingTop: "0.4rem" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: "'Fira Code', monospace", fontSize: "0.52rem", color: selColor, textTransform: "uppercase", letterSpacing: "0.22em", marginBottom: 6 }}>
                ◈ {selected.type}
              </div>
              <h3 style={{ fontFamily: "'Fira Code', monospace", fontSize: "0.78rem", color: "#e2e8f0", fontWeight: 600, wordBreak: "break-all", margin: 0, lineHeight: 1.45 }}>
                {selected.label}
              </h3>
            </div>
            <button onClick={() => setSelected(null)} style={{ background: "none", border: `1px solid ${selColor}22`, color: "#4a5568", cursor: "pointer", padding: 4, borderRadius: 2, flexShrink: 0, lineHeight: 0, marginLeft: 10 }}>
              <X size={12} />
            </button>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "'Fira Code', monospace", fontSize: "0.6rem", color: selColor + "55", marginBottom: "1.2rem", paddingBottom: "0.9rem", borderBottom: `1px solid ${selColor}0d` }}>
            <Zap size={10} color={selColor + "66"} />
            {connCountRef.current.get(selected.id) || 0} connections
            <GitBranch size={10} color={selColor + "44"} style={{ marginLeft: 6 }} />
            {selected.type}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
            {Object.entries(selected.data || {}).map(([k, v]) => (
              <div key={k} style={{ background: "rgba(0,212,255,0.025)", border: `1px solid ${selColor}0d`, borderRadius: 2, padding: "0.45rem 0.6rem" }}>
                <div style={{ fontFamily: "'Fira Code', monospace", fontSize: "0.52rem", color: selColor + "44", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 3 }}>{k.replace(/_/g, " ")}</div>
                <div style={{ fontFamily: "'Fira Code', monospace", fontSize: "0.68rem", color: "#7da8c8", wordBreak: "break-all", lineHeight: 1.4 }}>
                  {typeof v === "object" ? JSON.stringify(v) : String(v)}
                </div>
              </div>
            ))}
          </div>

          <div style={{ position: "absolute", bottom: 10, left: 10, width: 14, height: 14, borderBottom: `1px solid ${selColor}18`, borderLeft: `1px solid ${selColor}18` }} />
          <div style={{ position: "absolute", bottom: 10, right: 10, width: 14, height: 14, borderBottom: `1px solid ${selColor}18`, borderRight: `1px solid ${selColor}18` }} />
        </div>
      )}
    </div>
  );
}
