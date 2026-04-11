"use client";

import { useEffect, useRef, useState } from "react";
import { X, FileCode, ArrowRight, Layers, GitBranch } from "lucide-react";

// ─── Layer config ─────────────────────────────────────────────────────────────
const LAYERS: Record<string, { color: string; label: string; size: number }> = {
  entry:     { color: "#06b6d4", label: "entry",      size: 44 },
  pages:     { color: "#38bdf8", label: "pages",      size: 38 },
  components:{ color: "#a78bfa", label: "components", size: 32 },
  wizard:    { color: "#c084fc", label: "wizard",     size: 28 },
  hooks:     { color: "#22c55e", label: "hooks",      size: 28 },
  lib:       { color: "#fbbf24", label: "lib",        size: 30 },
  utils:     { color: "#f97316", label: "utils/types",size: 26 },
  ui:        { color: "#475569", label: "ui",         size: 20 },
  backend:   { color: "#f87171", label: "backend",    size: 32 },
  operator:  { color: "#fb923c", label: "operator",   size: 26 },
  core:      { color: "#e2e8f0", label: "core",       size: 36 },
  orphan:    { color: "#334155", label: "orphan",     size: 16 },
};

// ─── Simulated file nodes ─────────────────────────────────────────────────────
const SIM_NODES = [
  // Entry
  { id: "main",         label: "main.tsx",               layer: "entry",      imports: 2 },
  { id: "App",          label: "App.tsx",                 layer: "entry",      imports: 5 },

  // Pages
  { id: "Index",        label: "pages/Index.tsx",         layer: "pages",      imports: 8 },
  { id: "NotFound",     label: "pages/NotFound.tsx",      layer: "pages",      imports: 1 },

  // Components
  { id: "AppHeader",    label: "AppHeader.tsx",           layer: "components", imports: 3 },
  { id: "QuoteForm",    label: "QuoteForm.tsx",           layer: "components", imports: 6 },
  { id: "QuoteResults", label: "QuoteResults.tsx",        layer: "components", imports: 5 },
  { id: "HistoryPanel", label: "HistoryPanel.tsx",        layer: "components", imports: 4 },
  { id: "IntelPanel",   label: "IntelPanel.tsx",          layer: "components", imports: 3 },
  { id: "SistemaPanel", label: "SistemaPanel.tsx",        layer: "components", imports: 3 },
  { id: "StatusPanel",  label: "StatusPanel.tsx",         layer: "components", imports: 2 },
  { id: "StatusBanner", label: "StatusBanner.tsx",        layer: "components", imports: 2 },
  { id: "NavLink",      label: "NavLink.tsx",             layer: "components", imports: 1 },
  { id: "OperatorLogos",label: "OperatorLogos.tsx",       layer: "components", imports: 1 },

  // Wizard
  { id: "WizardSteps",  label: "wizard/WizardSteps.tsx",  layer: "wizard",     imports: 5 },
  { id: "StepEmpresa",  label: "wizard/StepEmpresa.tsx",  layer: "wizard",     imports: 4 },
  { id: "StepBenef",    label: "wizard/StepBenef.tsx",    layer: "wizard",     imports: 4 },
  { id: "StepPref",     label: "wizard/StepPref.tsx",     layer: "wizard",     imports: 3 },
  { id: "StepRevisao",  label: "wizard/StepRevisao.tsx",  layer: "wizard",     imports: 3 },

  // Hooks
  { id: "useToast",     label: "hooks/use-toast.ts",      layer: "hooks",      imports: 1 },
  { id: "useMobile",    label: "hooks/use-mobile.tsx",    layer: "hooks",      imports: 0 },

  // Lib / services
  { id: "cotacao",      label: "lib/cotacao.ts",          layer: "lib",        imports: 3 },
  { id: "inteligencia", label: "lib/inteligencia.ts",     layer: "lib",        imports: 2 },
  { id: "history",      label: "lib/history.ts",          layer: "lib",        imports: 2 },
  { id: "pdfGenerator", label: "lib/pdfGenerator.ts",     layer: "lib",        imports: 2 },
  { id: "supabaseSvc",  label: "lib/supabaseService.ts",  layer: "lib",        imports: 2 },
  { id: "cnpjLookup",   label: "lib/cnpjLookup.ts",       layer: "lib",        imports: 1 },

  // Utils / types
  { id: "types",        label: "lib/types.ts",            layer: "utils",      imports: 0 },
  { id: "utils",        label: "lib/utils.ts",            layer: "utils",      imports: 0 },
  { id: "supabase",     label: "lib/supabase.ts",         layer: "utils",      imports: 0 },

  // UI (grouped)
  { id: "ui_button",    label: "ui/button.tsx",           layer: "ui",         imports: 0 },
  { id: "ui_input",     label: "ui/input.tsx",            layer: "ui",         imports: 0 },
  { id: "ui_select",    label: "ui/select.tsx",           layer: "ui",         imports: 0 },
  { id: "ui_card",      label: "ui/card.tsx",             layer: "ui",         imports: 0 },
  { id: "ui_table",     label: "ui/table.tsx",            layer: "ui",         imports: 0 },
  { id: "ui_badge",     label: "ui/badge.tsx",            layer: "ui",         imports: 0 },
  { id: "ui_form",      label: "ui/form.tsx",             layer: "ui",         imports: 0 },
  { id: "ui_dialog",    label: "ui/dialog.tsx",           layer: "ui",         imports: 0 },

  // Backend core
  { id: "be_api",       label: "backend/api.js",          layer: "backend",    imports: 5 },
  { id: "be_logger",    label: "backend/logger.js",       layer: "core",       imports: 0 },
  { id: "be_health",    label: "backend/health_manager.js",layer: "backend",   imports: 1 },
  { id: "be_mcp",       label: "backend/mcp-server.js",   layer: "backend",    imports: 3 },
  { id: "be_agent",     label: "backend/agent-analyzer.js",layer: "backend",   imports: 1 },
  { id: "be_cdp",       label: "backend/load_cookies_cdp.js",layer: "core",    imports: 0 },

  // Órfãos — arquivos sem imports nem importados (config, standalone)
  { id: "eslint_cfg",   label: "eslint.config.js",      layer: "orphan",   imports: 0 },
  { id: "tailwind_cfg", label: "tailwind.config.ts",    layer: "orphan",   imports: 0 },
  { id: "vite_cfg",     label: "vite.config.ts",        layer: "orphan",   imports: 0 },
  { id: "vitest_cfg",   label: "vitest.config.ts",      layer: "orphan",   imports: 0 },
  { id: "postcss_cfg",  label: "postcss.config.js",     layer: "orphan",   imports: 0 },
  { id: "pw_cfg",       label: "playwright.config.ts",  layer: "orphan",   imports: 0 },
  { id: "pw_fix",       label: "playwright-fixture.ts", layer: "orphan",   imports: 0 },
  { id: "test_setup",   label: "src/test/setup.ts",     layer: "orphan",   imports: 0 },
  { id: "vite_env",     label: "src/vite-env.d.ts",     layer: "orphan",   imports: 0 },
  { id: "porto_bkm",    label: "backend/porto_bookmarklet.js", layer: "orphan", imports: 0 },
  { id: "gmail_auth",   label: "backend/gmail_auth_local.js", layer: "orphan", imports: 0 },

  // Backend operators
  { id: "amil_prod",    label: "backend/amil_producao.js",   layer: "operator", imports: 3 },
  { id: "amil_pool",    label: "backend/amil_pool.js",        layer: "operator", imports: 2 },
  { id: "amil_login",   label: "backend/amil_login_module.js",layer: "operator",imports: 3 },
  { id: "amil_cookie",  label: "backend/amil_cookie_extractor.js",layer: "operator",imports: 0},
  { id: "amil_cache",   label: "backend/amil_cache_precos.js",layer: "operator",imports: 0 },
  { id: "brad_prod",    label: "backend/bradesco_producao.js",layer: "operator",imports: 2 },
  { id: "brad_login",   label: "backend/bradesco_login.js",   layer: "operator",imports: 1 },
  { id: "porto_prod",   label: "backend/porto_producao.js",   layer: "operator",imports: 3 },
  { id: "porto_sess",   label: "backend/porto_session_manager.js",layer:"operator",imports: 3},
  { id: "porto_cdp_e",  label: "backend/porto_cdp_extractor.js",layer:"operator",imports: 1},
  { id: "porto_cdp_l",  label: "backend/porto_cdp_login.js",  layer: "operator",imports: 2 },
  { id: "porto_login",  label: "backend/porto_login.js",      layer: "operator",imports: 1 },
  { id: "sul_coleta",   label: "backend/sulamerica_coleta.js",layer: "operator",imports: 2 },
  { id: "sul_login",    label: "backend/sulamerica_login.js", layer: "operator",imports: 1 },
];

// ─── Simulated import edges ───────────────────────────────────────────────────
const SIM_EDGES = [
  // Entry → App → Pages
  { source: "main",         target: "App" },
  { source: "App",          target: "Index" },
  { source: "App",          target: "NotFound" },
  { source: "App",          target: "AppHeader" },

  // Index → components
  { source: "Index",        target: "QuoteForm" },
  { source: "Index",        target: "QuoteResults" },
  { source: "Index",        target: "HistoryPanel" },
  { source: "Index",        target: "IntelPanel" },
  { source: "Index",        target: "SistemaPanel" },
  { source: "Index",        target: "StatusPanel" },
  { source: "Index",        target: "WizardSteps" },

  // Components → wizard
  { source: "WizardSteps",  target: "StepEmpresa" },
  { source: "WizardSteps",  target: "StepBenef" },
  { source: "WizardSteps",  target: "StepPref" },
  { source: "WizardSteps",  target: "StepRevisao" },

  // Components → lib
  { source: "QuoteForm",    target: "cotacao" },
  { source: "QuoteForm",    target: "types" },
  { source: "QuoteForm",    target: "useMobile" },
  { source: "QuoteForm",    target: "ui_select" },
  { source: "QuoteForm",    target: "ui_input" },
  { source: "QuoteForm",    target: "ui_button" },
  { source: "QuoteResults", target: "cotacao" },
  { source: "QuoteResults", target: "pdfGenerator" },
  { source: "QuoteResults", target: "types" },
  { source: "QuoteResults", target: "ui_card" },
  { source: "QuoteResults", target: "ui_badge" },
  { source: "HistoryPanel", target: "history" },
  { source: "HistoryPanel", target: "types" },
  { source: "HistoryPanel", target: "ui_table" },
  { source: "IntelPanel",   target: "inteligencia" },
  { source: "IntelPanel",   target: "types" },
  { source: "SistemaPanel", target: "supabaseSvc" },
  { source: "SistemaPanel", target: "types" },
  { source: "AppHeader",    target: "NavLink" },
  { source: "AppHeader",    target: "OperatorLogos" },
  { source: "StatusPanel",  target: "supabaseSvc" },

  // Wizard → lib
  { source: "StepEmpresa",  target: "cotacao" },
  { source: "StepEmpresa",  target: "cnpjLookup" },
  { source: "StepEmpresa",  target: "types" },
  { source: "StepBenef",    target: "types" },
  { source: "StepPref",     target: "cotacao" },
  { source: "StepRevisao",  target: "types" },

  // Hooks
  { source: "QuoteForm",    target: "useToast" },
  { source: "useToast",     target: "ui_dialog" },

  // Lib → core
  { source: "cotacao",      target: "supabase" },
  { source: "cotacao",      target: "types" },
  { source: "cotacao",      target: "utils" },
  { source: "inteligencia", target: "cotacao" },
  { source: "inteligencia", target: "types" },
  { source: "history",      target: "types" },
  { source: "history",      target: "utils" },
  { source: "pdfGenerator", target: "types" },
  { source: "pdfGenerator", target: "utils" },
  { source: "supabaseSvc",  target: "supabase" },
  { source: "supabaseSvc",  target: "types" },
  { source: "cnpjLookup",   target: "utils" },
  { source: "ui_form",      target: "ui_input" },
  { source: "ui_form",      target: "ui_button" },

  // Backend
  { source: "be_mcp",       target: "be_api" },
  { source: "be_mcp",       target: "be_logger" },
  { source: "be_mcp",       target: "be_agent" },
  { source: "be_api",       target: "be_logger" },
  { source: "be_api",       target: "be_health" },
  { source: "be_api",       target: "amil_prod" },
  { source: "be_api",       target: "brad_prod" },
  { source: "be_api",       target: "porto_prod" },
  { source: "be_api",       target: "sul_coleta" },
  { source: "be_health",    target: "be_logger" },
  { source: "be_agent",     target: "be_logger" },

  // Operator → core
  { source: "amil_prod",    target: "amil_pool" },
  { source: "amil_prod",    target: "be_logger" },
  { source: "amil_prod",    target: "amil_cache" },
  { source: "amil_pool",    target: "amil_login" },
  { source: "amil_pool",    target: "be_logger" },
  { source: "amil_login",   target: "amil_cookie" },
  { source: "amil_login",   target: "be_cdp" },
  { source: "amil_login",   target: "be_logger" },
  { source: "brad_prod",    target: "brad_login" },
  { source: "brad_prod",    target: "be_logger" },
  { source: "brad_login",   target: "be_cdp" },
  { source: "porto_prod",   target: "porto_sess" },
  { source: "porto_prod",   target: "be_logger" },
  { source: "porto_sess",   target: "porto_cdp_e" },
  { source: "porto_sess",   target: "porto_cdp_l" },
  { source: "porto_sess",   target: "be_logger" },
  { source: "porto_cdp_e",  target: "be_cdp" },
  { source: "porto_cdp_l",  target: "porto_login" },
  { source: "porto_cdp_l",  target: "be_cdp" },
  { source: "sul_coleta",   target: "sul_login" },
  { source: "sul_coleta",   target: "be_logger" },
  { source: "sul_login",    target: "be_cdp" },
];

// ─── Selected node detail ─────────────────────────────────────────────────────
interface SelNode {
  id:       string;
  label:    string;
  layer:    string;
  imports:  number;
  importedBy: string[];
  importsTo:  string[];
}

// ─── Pré-calcular grau de cada nó (in + out) ─────────────────────────────────
function getDegreeMap(): Record<string, number> {
  const map: Record<string, number> = {};
  SIM_NODES.forEach((n) => { map[n.id] = 0; });
  SIM_EDGES.forEach((e) => {
    map[e.source] = (map[e.source] ?? 0) + 1;
    map[e.target] = (map[e.target] ?? 0) + 1;
  });
  return map;
}

// ─── Transform to G6 format ───────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildG6Data(): any {
  const degrees = getDegreeMap();
  const maxDeg  = Math.max(...Object.values(degrees));

  const nodes = SIM_NODES.map((n) => {
    const layer  = LAYERS[n.layer];
    const color  = layer.color;
    const deg    = degrees[n.id] ?? 0;

    // Tamanho proporcional ao grau — como o Obsidian
    const minSize = 14;
    const maxSize = 52;
    const size    = minSize + ((deg / Math.max(maxDeg, 1)) * (maxSize - minSize));

    const name   = n.label.split("/").pop() ?? n.label;
    const isHub  = deg >= 5; // nós altamente conectados sempre mostram label

    return {
      id: n.id,
      style: {
        size,
        fill:        `${color}${deg >= 4 ? "18" : "0c"}`,
        stroke:      color,
        lineWidth:   deg >= 6 ? 2.5 : 1.5,
        shadowColor: color,
        shadowBlur:  deg >= 5 ? 20 : deg >= 2 ? 10 : 4,

        label:           isHub,
        labelText:       name,
        labelFill:       color,
        labelFontFamily: "'Fira Code', monospace",
        labelFontSize:   isHub ? 10 : 8,
        labelMaxWidth:   160,
        labelOffsetY:    6,
        labelWordWrap:   false,
        labelBackground:        true,
        labelBackgroundFill:    "rgba(2,6,23,0.92)",
        labelBackgroundRadius:  3,
        labelBackgroundPadding: [2, 6, 2, 6],

        iconText:      size > 24 ? name.replace(/\.(tsx?|jsx?|ts|js)$/, "").slice(0, 2) : "",
        iconFill:      color,
        iconFontSize:  size > 32 ? 10 : 8,
        iconFontFamily: "'Fira Code', monospace",
      },
      data: { layer: n.layer, label: n.label, imports: n.imports, degree: deg },
    };
  });

  const edges = SIM_EDGES.map((e, i) => {
    const srcNode = SIM_NODES.find((n) => n.id === e.source);
    const color   = LAYERS[srcNode?.layer ?? "utils"].color;
    return {
      id:     `e${i}`,
      source: e.source,
      target: e.target,
      style:  {
        stroke:       `${color}30`,
        lineWidth:    1,
        opacity:      0.65,
        endArrow:     true,
        endArrowSize: 4,
        endArrowFill: `${color}55`,
        lineDash:     [4, 4],
        shadowColor:  color,
        shadowBlur:   1.5,
      },
    };
  });

  return { nodes, edges };
}

// ─── Simulação física própria ─────────────────────────────────────────────────
interface PhysNode {
  id:  string;
  x:   number;
  y:   number;
  vx:  number;
  vy:  number;
  r:   number;   // raio de colisão
  pinned: boolean;
}

function runPhysics(
  phys:   PhysNode[],
  edges:  { source: string; target: string }[],
  cx:     number,
  cy:     number,
  alpha:  number,
) {
  const n = phys.length;

  // 1. Força central (gravidade): puxa cada nó para o centro
  const GRAVITY = 0.06 * alpha;
  for (const p of phys) {
    if (p.pinned) continue;
    p.vx += (cx - p.x) * GRAVITY;
    p.vy += (cy - p.y) * GRAVITY;
  }

  // 2. Força de repulsão (n-body): todos empurram todos
  const REPEL = 9000 * alpha;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx   = phys[j].x - phys[i].x || 0.01;
      const dy   = phys[j].y - phys[i].y || 0.01;
      const dist2 = dx * dx + dy * dy;
      const dist  = Math.sqrt(dist2);
      const force = REPEL / dist2;
      const fx    = (dx / dist) * force;
      const fy    = (dy / dist) * force;
      if (!phys[i].pinned) { phys[i].vx -= fx; phys[i].vy -= fy; }
      if (!phys[j].pinned) { phys[j].vx += fx; phys[j].vy += fy; }
    }
  }

  // 3. Força de link (elástico): conectados se atraem ao comprimento ideal
  const LINK_DIST   = 115;
  const LINK_STRENGTH = 0.45 * alpha;
  const nodeById = Object.fromEntries(phys.map((p) => [p.id, p]));
  for (const e of edges) {
    const a = nodeById[e.source];
    const b = nodeById[e.target];
    if (!a || !b) continue;
    const dx   = b.x - a.x || 0.01;
    const dy   = b.y - a.y || 0.01;
    const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
    const stretch = (dist - LINK_DIST) / dist * LINK_STRENGTH;
    if (!a.pinned) { a.vx += dx * stretch; a.vy += dy * stretch; }
    if (!b.pinned) { b.vx -= dx * stretch; b.vy -= dy * stretch; }
  }

  // 4. Colisão: impede sobreposição (resolve overlap diretamente)
  const COLLIDE_STRENGTH = 0.7;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx      = phys[j].x - phys[i].x || 0.01;
      const dy      = phys[j].y - phys[i].y || 0.01;
      const dist    = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const minDist = phys[i].r + phys[j].r + 6;
      if (dist < minDist) {
        const overlap = (minDist - dist) / dist * COLLIDE_STRENGTH;
        const fx = dx * overlap * 0.5;
        const fy = dy * overlap * 0.5;
        if (!phys[i].pinned) { phys[i].vx -= fx; phys[i].vy -= fy; }
        if (!phys[j].pinned) { phys[j].vx += fx; phys[j].vy += fy; }
      }
    }
  }

  // 5. Integrar velocidade + amortecimento
  const DAMPING = 0.72;
  for (const p of phys) {
    if (p.pinned) continue;
    p.x  += p.vx;
    p.y  += p.vy;
    p.vx *= DAMPING;
    p.vy *= DAMPING;
  }
}

// ─── Main component ───────────────────────────────────────────────────────────
export function DepsGraphClient() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading]       = useState(true);
  const [selected, setSelected]     = useState<SelNode | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    let destroyed  = false;
    let rafId      = 0;

    const init = async () => {
      try {
        const { Graph } = await import("@antv/g6");
        if (destroyed) return;

        const el     = containerRef.current!;
        const width  = el.clientWidth  || 1000;
        const height = el.clientHeight || 700;
        const cx     = width  / 2;
        const cy     = height / 2;

        // ── Pré-calcular graus para raio de colisão ──────────────
        const degrees = getDegreeMap();
        const maxDeg  = Math.max(...Object.values(degrees), 1);

        // ── Posições iniciais em círculo ──────────────────────────
        const allNodes = SIM_NODES;
        const phys: PhysNode[] = allNodes.map((n, i) => {
          const angle  = (2 * Math.PI * i) / allNodes.length;
          const radius = 260;
          const deg    = degrees[n.id] ?? 0;
          const size   = 8 + ((deg / maxDeg) * 22);
          return {
            id:     n.id,
            x:      cx + Math.cos(angle) * radius + (Math.random() - 0.5) * 20,
            y:      cy + Math.sin(angle) * radius + (Math.random() - 0.5) * 20,
            vx:     0,
            vy:     0,
            r:      size + 4,
            pinned: false,
          };
        });
        const physById = Object.fromEntries(phys.map((p) => [p.id, p]));

        // ── Montar dados G6 com posições iniciais ─────────────────
        const g6data = buildG6Data();
        g6data.nodes = g6data.nodes.map((n: { id: string; style: Record<string, unknown>; data: Record<string, unknown> }) => ({
          ...n,
          style: { ...n.style, x: physById[n.id]?.x ?? cx, y: physById[n.id]?.y ?? cy },
        }));

        const graph = new Graph({
          container: el,
          width,
          height,
          autoResize:  true,
          autoFit:     "center",
          background:  "transparent",
          data:        g6data,
          layout:      { type: "preset" },   // usa as posições que passamos

          node: {
            type:  "circle",
            state: {
              active:   { lineWidth: 3, shadowBlur: 28, label: true, zIndex: 100 },
              selected: { lineWidth: 3, shadowBlur: 36, stroke: "#fbbf24", shadowColor: "#fbbf24", label: true, zIndex: 100 },
              inactive: { opacity: 0.12, shadowBlur: 0 },
            },
          },
          edge: {
            type:  "line",
            state: {
              active:   { opacity: 0.9, lineWidth: 1.5, shadowBlur: 6 },
              selected: { opacity: 1,   lineWidth: 2,   shadowBlur: 8 },
              inactive: { opacity: 0.04 },
            },
          },
          behaviors: [
            "drag-canvas",
            { type: "zoom-canvas", sensitivity: 0.5 },
            {
              type:     "drag-element",
              onFinish: (ids: string[]) => {
                // Pin o nó após drag manual para não ser movido pela simulação
                ids.forEach((id) => {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const nd = (graph as any).getNodeData?.(id);
                  if (nd && physById[id]) {
                    physById[id].x = nd.style?.x ?? physById[id].x;
                    physById[id].y = nd.style?.y ?? physById[id].y;
                    physById[id].pinned = true;
                  }
                });
              },
            },
            { type: "hover-activate", degree: 1 },
            "click-select",
          ],
          plugins: [],
        });

        await graph.render();
        setLoading(false);

        // ── Loop de simulação física ──────────────────────────────
        let tick  = 0;
        const MAX_TICKS   = 400;
        const ALPHA_START = 1.0;
        const ALPHA_DECAY = 0.018;

        const simLoop = async () => {
          if (destroyed) return;
          if (tick >= MAX_TICKS) return;

          const alpha = ALPHA_START * Math.pow(1 - ALPHA_DECAY, tick);
          tick++;

          runPhysics(phys, SIM_EDGES, cx, cy, alpha);

          // Atualizar posições no G6
          const updates = phys
            .filter((p) => !p.pinned)
            .map((p) => ({ id: p.id, style: { x: p.x, y: p.y } }));

          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (graph as any).updateNodeData(updates);
            await graph.draw();
          } catch {}

          rafId = requestAnimationFrame(simLoop);
        };

        rafId = requestAnimationFrame(simLoop);

        // Click handler
        graph.on("node:click", (evt: unknown) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const e      = evt as any;
          const nodeId = e?.target?.id ?? e?.itemId;
          if (!nodeId) return;

          const node = SIM_NODES.find((n) => n.id === nodeId);
          if (!node) return;

          const importsTo   = SIM_EDGES.filter((e) => e.source === nodeId).map((e) => {
            const t = SIM_NODES.find((n) => n.id === e.target);
            return t?.label ?? e.target;
          });
          const importedBy  = SIM_EDGES.filter((e) => e.target === nodeId).map((e) => {
            const s = SIM_NODES.find((n) => n.id === e.source);
            return s?.label ?? e.source;
          });

          setSelected({ ...node, importsTo, importedBy });
        });

        graph.on("canvas:click", () => setSelected(null));

      } catch (err) {
        console.error("G6 init error", err);
        setLoading(false);
      }
    };

    init();
    return () => {
      destroyed = true;
      cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", background: "var(--bg-void)", borderRadius: "var(--r-lg)", border: "1px solid var(--border)", overflow: "hidden" }}>

      {/* Loading */}
      {loading && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: "0.75rem", zIndex: 10 }}>
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--cyan)", animation: "pulse 1s ease-in-out infinite" }} />
          <span style={{ fontFamily: "var(--mono)", fontSize: "0.78rem", color: "var(--muted-foreground)" }}>calculando layout…</span>
        </div>
      )}

      {/* Canvas */}
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />

      {/* Node detail panel */}
      {selected && (
        <div style={{
          position:     "absolute",
          top:          "1rem",
          right:        "1rem",
          width:        280,
          background:   "rgba(10,22,40,0.97)",
          border:       `1px solid ${LAYERS[selected.layer].color}40`,
          borderLeft:   `3px solid ${LAYERS[selected.layer].color}`,
          borderRadius: "var(--r-lg)",
          padding:      "1.1rem 1.25rem",
          zIndex:       20,
          backdropFilter: "blur(8px)",
          boxShadow:    `0 8px 32px rgba(0,0,0,0.5), 0 0 20px ${LAYERS[selected.layer].color}18`,
        }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "0.85rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flex: 1, minWidth: 0 }}>
              <FileCode size={13} color={LAYERS[selected.layer].color} style={{ flexShrink: 0 }} />
              <div style={{ minWidth: 0 }}>
                <div style={{
                  fontFamily:   "var(--mono)",
                  fontSize:     "0.8rem",
                  fontWeight:   600,
                  color:        "var(--text)",
                  overflow:     "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace:   "nowrap",
                }}>
                  {selected.label.split("/").pop()}
                </div>
                <div style={{ fontFamily: "var(--mono)", fontSize: "0.65rem", color: "var(--muted-foreground)", marginTop: 2 }}>
                  {selected.label}
                </div>
              </div>
            </div>
            <button
              onClick={() => setSelected(null)}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--dim)", padding: 2, flexShrink: 0 }}
            >
              <X size={13} />
            </button>
          </div>

          {/* Layer badge */}
          <div style={{ marginBottom: "1rem" }}>
            <span style={{
              fontFamily:   "var(--mono)",
              fontSize:     "0.65rem",
              color:        LAYERS[selected.layer].color,
              background:   `${LAYERS[selected.layer].color}14`,
              border:       `1px solid ${LAYERS[selected.layer].color}30`,
              borderRadius: "3px",
              padding:      "2px 8px",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
            }}>
              {LAYERS[selected.layer].label}
            </span>
          </div>

          {/* Imports to */}
          {selected.importsTo.length > 0 && (
            <div style={{ marginBottom: "0.85rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "4px", marginBottom: "0.4rem" }}>
                <ArrowRight size={10} color="var(--cyan)" />
                <span style={{ fontFamily: "var(--mono)", fontSize: "0.65rem", color: "var(--cyan)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                  importa ({selected.importsTo.length})
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                {selected.importsTo.map((f) => (
                  <span key={f} style={{
                    fontFamily:   "var(--mono)",
                    fontSize:     "0.7rem",
                    color:        "var(--muted-foreground)",
                    padding:      "1px 6px",
                    background:   "var(--bg-panel)",
                    borderRadius: "3px",
                    overflow:     "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace:   "nowrap",
                  }}>
                    {f.split("/").pop()}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Imported by */}
          {selected.importedBy.length > 0 && (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "4px", marginBottom: "0.4rem" }}>
                <GitBranch size={10} color="var(--purple, #a78bfa)" />
                <span style={{ fontFamily: "var(--mono)", fontSize: "0.65rem", color: "var(--purple, #a78bfa)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                  importado por ({selected.importedBy.length})
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                {selected.importedBy.map((f) => (
                  <span key={f} style={{
                    fontFamily:   "var(--mono)",
                    fontSize:     "0.7rem",
                    color:        "var(--muted-foreground)",
                    padding:      "1px 6px",
                    background:   "var(--bg-panel)",
                    borderRadius: "3px",
                    overflow:     "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace:   "nowrap",
                  }}>
                    {f.split("/").pop()}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* No connections */}
          {selected.importsTo.length === 0 && selected.importedBy.length === 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: "5px", opacity: 0.5 }}>
              <Layers size={11} color="var(--dim)" />
              <span style={{ fontFamily: "var(--mono)", fontSize: "0.72rem", color: "var(--dim)" }}>
                nenhuma dependência mapeada
              </span>
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.4; transform: scale(0.7); }
        }
      `}</style>
    </div>
  );
}
