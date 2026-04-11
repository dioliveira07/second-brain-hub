"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { X, FileCode, ArrowRight, GitBranch } from "lucide-react";

// ─── Layer colours ────────────────────────────────────────────────────────────
const LAYERS: Record<string, { color: string; label: string }> = {
  entry:      { color: "#06b6d4", label: "entry"      },
  pages:      { color: "#38bdf8", label: "pages"      },
  components: { color: "#a78bfa", label: "components" },
  wizard:     { color: "#c084fc", label: "wizard"     },
  hooks:      { color: "#22c55e", label: "hooks"      },
  lib:        { color: "#fbbf24", label: "lib"        },
  utils:      { color: "#f97316", label: "utils"      },
  ui:         { color: "#475569", label: "ui"         },
  backend:    { color: "#f87171", label: "backend"    },
  operator:   { color: "#fb923c", label: "operator"   },
  core:       { color: "#e2e8f0", label: "core"       },
  orphan:     { color: "#334155", label: "orphan"     },
};

// ─── Nodes ────────────────────────────────────────────────────────────────────
const SIM_NODES = [
  { id: "main",         label: "main.tsx",                        layer: "entry"      },
  { id: "App",          label: "App.tsx",                         layer: "entry"      },
  { id: "Index",        label: "pages/Index.tsx",                 layer: "pages"      },
  { id: "NotFound",     label: "pages/NotFound.tsx",              layer: "pages"      },
  { id: "AppHeader",    label: "AppHeader.tsx",                   layer: "components" },
  { id: "QuoteForm",    label: "QuoteForm.tsx",                   layer: "components" },
  { id: "QuoteResults", label: "QuoteResults.tsx",                layer: "components" },
  { id: "HistoryPanel", label: "HistoryPanel.tsx",                layer: "components" },
  { id: "IntelPanel",   label: "IntelPanel.tsx",                  layer: "components" },
  { id: "SistemaPanel", label: "SistemaPanel.tsx",                layer: "components" },
  { id: "StatusPanel",  label: "StatusPanel.tsx",                 layer: "components" },
  { id: "StatusBanner", label: "StatusBanner.tsx",                layer: "components" },
  { id: "NavLink",      label: "NavLink.tsx",                     layer: "components" },
  { id: "OperatorLogos",label: "OperatorLogos.tsx",               layer: "components" },
  { id: "WizardSteps",  label: "wizard/WizardSteps.tsx",          layer: "wizard"     },
  { id: "StepEmpresa",  label: "wizard/StepEmpresa.tsx",          layer: "wizard"     },
  { id: "StepBenef",    label: "wizard/StepBenef.tsx",            layer: "wizard"     },
  { id: "StepPref",     label: "wizard/StepPref.tsx",             layer: "wizard"     },
  { id: "StepRevisao",  label: "wizard/StepRevisao.tsx",          layer: "wizard"     },
  { id: "useToast",     label: "hooks/use-toast.ts",              layer: "hooks"      },
  { id: "useMobile",    label: "hooks/use-mobile.tsx",            layer: "hooks"      },
  { id: "cotacao",      label: "lib/cotacao.ts",                  layer: "lib"        },
  { id: "inteligencia", label: "lib/inteligencia.ts",             layer: "lib"        },
  { id: "history",      label: "lib/history.ts",                  layer: "lib"        },
  { id: "pdfGenerator", label: "lib/pdfGenerator.ts",             layer: "lib"        },
  { id: "supabaseSvc",  label: "lib/supabaseService.ts",          layer: "lib"        },
  { id: "cnpjLookup",   label: "lib/cnpjLookup.ts",               layer: "lib"        },
  { id: "types",        label: "lib/types.ts",                    layer: "utils"      },
  { id: "utils",        label: "lib/utils.ts",                    layer: "utils"      },
  { id: "supabase",     label: "lib/supabase.ts",                 layer: "utils"      },
  { id: "ui_button",    label: "ui/button.tsx",                   layer: "ui"         },
  { id: "ui_input",     label: "ui/input.tsx",                    layer: "ui"         },
  { id: "ui_select",    label: "ui/select.tsx",                   layer: "ui"         },
  { id: "ui_card",      label: "ui/card.tsx",                     layer: "ui"         },
  { id: "ui_table",     label: "ui/table.tsx",                    layer: "ui"         },
  { id: "ui_badge",     label: "ui/badge.tsx",                    layer: "ui"         },
  { id: "ui_form",      label: "ui/form.tsx",                     layer: "ui"         },
  { id: "ui_dialog",    label: "ui/dialog.tsx",                   layer: "ui"         },
  { id: "be_api",       label: "backend/api.js",                  layer: "backend"    },
  { id: "be_logger",    label: "backend/logger.js",               layer: "core"       },
  { id: "be_health",    label: "backend/health_manager.js",       layer: "backend"    },
  { id: "be_mcp",       label: "backend/mcp-server.js",           layer: "backend"    },
  { id: "be_agent",     label: "backend/agent-analyzer.js",       layer: "backend"    },
  { id: "be_cdp",       label: "backend/load_cookies_cdp.js",     layer: "core"       },
  { id: "amil_prod",    label: "backend/amil_producao.js",        layer: "operator"   },
  { id: "amil_pool",    label: "backend/amil_pool.js",            layer: "operator"   },
  { id: "amil_login",   label: "backend/amil_login_module.js",    layer: "operator"   },
  { id: "amil_cookie",  label: "backend/amil_cookie_extractor.js",layer: "operator"   },
  { id: "amil_cache",   label: "backend/amil_cache_precos.js",    layer: "operator"   },
  { id: "brad_prod",    label: "backend/bradesco_producao.js",    layer: "operator"   },
  { id: "brad_login",   label: "backend/bradesco_login.js",       layer: "operator"   },
  { id: "porto_prod",   label: "backend/porto_producao.js",       layer: "operator"   },
  { id: "porto_sess",   label: "backend/porto_session_manager.js",layer: "operator"   },
  { id: "porto_cdp_e",  label: "backend/porto_cdp_extractor.js",  layer: "operator"   },
  { id: "porto_cdp_l",  label: "backend/porto_cdp_login.js",      layer: "operator"   },
  { id: "porto_login",  label: "backend/porto_login.js",          layer: "operator"   },
  { id: "sul_coleta",   label: "backend/sulamerica_coleta.js",    layer: "operator"   },
  { id: "sul_login",    label: "backend/sulamerica_login.js",     layer: "operator"   },
  { id: "eslint_cfg",   label: "eslint.config.js",                layer: "orphan"     },
  { id: "tailwind_cfg", label: "tailwind.config.ts",              layer: "orphan"     },
  { id: "vite_cfg",     label: "vite.config.ts",                  layer: "orphan"     },
  { id: "vitest_cfg",   label: "vitest.config.ts",                layer: "orphan"     },
  { id: "postcss_cfg",  label: "postcss.config.js",               layer: "orphan"     },
  { id: "pw_cfg",       label: "playwright.config.ts",            layer: "orphan"     },
  { id: "test_setup",   label: "src/test/setup.ts",               layer: "orphan"     },
  { id: "gmail_auth",   label: "backend/gmail_auth_local.js",     layer: "orphan"     },
];

const SIM_EDGES = [
  { s: "main",         t: "App"          },
  { s: "App",          t: "Index"        },
  { s: "App",          t: "NotFound"     },
  { s: "App",          t: "AppHeader"    },
  { s: "Index",        t: "QuoteForm"    },
  { s: "Index",        t: "QuoteResults" },
  { s: "Index",        t: "HistoryPanel" },
  { s: "Index",        t: "IntelPanel"   },
  { s: "Index",        t: "SistemaPanel" },
  { s: "Index",        t: "StatusPanel"  },
  { s: "Index",        t: "WizardSteps"  },
  { s: "WizardSteps",  t: "StepEmpresa"  },
  { s: "WizardSteps",  t: "StepBenef"   },
  { s: "WizardSteps",  t: "StepPref"    },
  { s: "WizardSteps",  t: "StepRevisao" },
  { s: "QuoteForm",    t: "cotacao"      },
  { s: "QuoteForm",    t: "types"        },
  { s: "QuoteForm",    t: "useMobile"    },
  { s: "QuoteForm",    t: "ui_select"    },
  { s: "QuoteForm",    t: "ui_input"     },
  { s: "QuoteForm",    t: "ui_button"    },
  { s: "QuoteForm",    t: "useToast"     },
  { s: "QuoteResults", t: "cotacao"      },
  { s: "QuoteResults", t: "pdfGenerator" },
  { s: "QuoteResults", t: "types"        },
  { s: "QuoteResults", t: "ui_card"      },
  { s: "QuoteResults", t: "ui_badge"     },
  { s: "HistoryPanel", t: "history"      },
  { s: "HistoryPanel", t: "types"        },
  { s: "HistoryPanel", t: "ui_table"     },
  { s: "IntelPanel",   t: "inteligencia" },
  { s: "IntelPanel",   t: "types"        },
  { s: "SistemaPanel", t: "supabaseSvc"  },
  { s: "SistemaPanel", t: "types"        },
  { s: "AppHeader",    t: "NavLink"      },
  { s: "AppHeader",    t: "OperatorLogos"},
  { s: "StatusPanel",  t: "supabaseSvc"  },
  { s: "StepEmpresa",  t: "cotacao"      },
  { s: "StepEmpresa",  t: "cnpjLookup"   },
  { s: "StepEmpresa",  t: "types"        },
  { s: "StepBenef",    t: "types"        },
  { s: "StepPref",     t: "cotacao"      },
  { s: "StepRevisao",  t: "types"        },
  { s: "useToast",     t: "ui_dialog"    },
  { s: "cotacao",      t: "supabase"     },
  { s: "cotacao",      t: "types"        },
  { s: "cotacao",      t: "utils"        },
  { s: "inteligencia", t: "cotacao"      },
  { s: "inteligencia", t: "types"        },
  { s: "history",      t: "types"        },
  { s: "history",      t: "utils"        },
  { s: "pdfGenerator", t: "types"        },
  { s: "pdfGenerator", t: "utils"        },
  { s: "supabaseSvc",  t: "supabase"     },
  { s: "supabaseSvc",  t: "types"        },
  { s: "cnpjLookup",   t: "utils"        },
  { s: "ui_form",      t: "ui_input"     },
  { s: "ui_form",      t: "ui_button"    },
  { s: "be_mcp",       t: "be_api"       },
  { s: "be_mcp",       t: "be_logger"    },
  { s: "be_mcp",       t: "be_agent"     },
  { s: "be_api",       t: "be_logger"    },
  { s: "be_api",       t: "be_health"    },
  { s: "be_api",       t: "amil_prod"    },
  { s: "be_api",       t: "brad_prod"    },
  { s: "be_api",       t: "porto_prod"   },
  { s: "be_api",       t: "sul_coleta"   },
  { s: "be_health",    t: "be_logger"    },
  { s: "be_agent",     t: "be_logger"    },
  { s: "amil_prod",    t: "amil_pool"    },
  { s: "amil_prod",    t: "be_logger"    },
  { s: "amil_prod",    t: "amil_cache"   },
  { s: "amil_pool",    t: "amil_login"   },
  { s: "amil_pool",    t: "be_logger"    },
  { s: "amil_login",   t: "amil_cookie"  },
  { s: "amil_login",   t: "be_cdp"       },
  { s: "amil_login",   t: "be_logger"    },
  { s: "brad_prod",    t: "brad_login"   },
  { s: "brad_prod",    t: "be_logger"    },
  { s: "brad_login",   t: "be_cdp"       },
  { s: "porto_prod",   t: "porto_sess"   },
  { s: "porto_prod",   t: "be_logger"    },
  { s: "porto_sess",   t: "porto_cdp_e"  },
  { s: "porto_sess",   t: "porto_cdp_l"  },
  { s: "porto_sess",   t: "be_logger"    },
  { s: "porto_cdp_e",  t: "be_cdp"       },
  { s: "porto_cdp_l",  t: "porto_login"  },
  { s: "porto_cdp_l",  t: "be_cdp"       },
  { s: "sul_coleta",   t: "sul_login"    },
  { s: "sul_coleta",   t: "be_logger"    },
  { s: "sul_login",    t: "be_cdp"       },
];

// ─── Physics node ─────────────────────────────────────────────────────────────
interface PNode {
  id:     string;
  label:  string;
  layer:  string;
  x:      number;
  y:      number;
  vx:     number;
  vy:     number;
  r:      number;
  pinned: boolean;
  degree: number;
}

// ─── Selection detail ──────────────────────────────────────────────────────────
interface SelNode {
  id:         string;
  label:      string;
  layer:      string;
  importsTo:  string[];
  importedBy: string[];
}

// ─── Hex → rgba ───────────────────────────────────────────────────────────────
function hex(color: string, a: number) {
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

// ─── Draw arrow tip ───────────────────────────────────────────────────────────
function drawArrow(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, r: number, color: string) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const tx    = x2 - Math.cos(angle) * (r + 2);
  const ty    = y2 - Math.sin(angle) * (r + 2);
  const size  = 6;

  ctx.beginPath();
  ctx.moveTo(x1 + Math.cos(angle) * r, y1 + Math.sin(angle) * r);
  ctx.lineTo(tx, ty);
  ctx.strokeStyle = hex(color, 0.25);
  ctx.lineWidth   = 1;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(tx, ty);
  ctx.lineTo(tx - size * Math.cos(angle - 0.4), ty - size * Math.sin(angle - 0.4));
  ctx.lineTo(tx - size * Math.cos(angle + 0.4), ty - size * Math.sin(angle + 0.4));
  ctx.closePath();
  ctx.fillStyle = hex(color, 0.35);
  ctx.fill();
}

// ─── Draw node ────────────────────────────────────────────────────────────────
function drawNode(ctx: CanvasRenderingContext2D, n: PNode, selected: boolean, hovered: boolean, scale: number) {
  const color = LAYERS[n.layer]?.color ?? "#5a7a9a";
  const r     = n.r;

  // Glow
  if (selected || hovered || n.degree >= 5) {
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur  = selected ? 28 : hovered ? 18 : 10;
    ctx.beginPath();
    ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
    ctx.fillStyle = "transparent";
    ctx.fill();
    ctx.restore();
  }

  // Fill
  ctx.beginPath();
  ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
  ctx.fillStyle   = hex(color, selected ? 0.22 : 0.1);
  ctx.fill();

  // Border
  ctx.beginPath();
  ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
  ctx.strokeStyle = hex(color, selected ? 1 : hovered ? 0.9 : 0.65);
  ctx.lineWidth   = selected ? 2.5 : 1.5;
  ctx.stroke();

  // Label — sempre visível para hubs, hover para o resto
  const name = n.label.split("/").pop()?.replace(/\.(tsx?|jsx?|ts|js)$/, "") ?? "";
  const showLabel = selected || hovered || n.degree >= 5 || n.layer === "entry" || n.layer === "core";
  if (showLabel && scale > 0.35) {
    const fs = Math.max(9, Math.min(13, r * 0.85));
    ctx.font         = `${fs}px "Fira Code", monospace`;
    ctx.textAlign    = "center";
    ctx.textBaseline = "middle";
    const tw = ctx.measureText(name).width;
    const pad = 4;

    // Label background
    ctx.fillStyle = "rgba(2,6,23,0.88)";
    ctx.beginPath();
    ctx.roundRect(n.x - tw / 2 - pad, n.y + r + 4, tw + pad * 2, fs + 6, 3);
    ctx.fill();

    ctx.fillStyle = hex(color, selected ? 1 : 0.85);
    ctx.fillText(name, n.x, n.y + r + 4 + (fs + 6) / 2);
  }
}

// ─── Main component ───────────────────────────────────────────────────────────
export function DepsGraphClient() {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const stateRef   = useRef<{
    nodes:    PNode[];
    raf:      number;
    scale:    number;
    ox:       number;
    oy:       number;
    drag:     { nodeId: string | null; panStart: { x: number; y: number } | null };
    hovered:  string | null;
    selected: string | null;
  } | null>(null);
  const [selNode, setSelNode] = useState<SelNode | null>(null);

  // ── build selection detail ──────────────────────────────────────────────────
  const selectNode = useCallback((id: string | null) => {
    stateRef.current!.selected = id;
    if (!id) { setSelNode(null); return; }
    const node = SIM_NODES.find((n) => n.id === id);
    if (!node) return;
    setSelNode({
      id,
      label:      node.label,
      layer:      node.layer,
      importsTo:  SIM_EDGES.filter((e) => e.s === id).map((e) => SIM_NODES.find((n) => n.id === e.t)?.label ?? e.t),
      importedBy: SIM_EDGES.filter((e) => e.t === id).map((e) => SIM_NODES.find((n) => n.id === e.s)?.label ?? e.s),
    });
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const W = canvas.parentElement?.clientWidth  ?? 900;
    const H = canvas.parentElement?.clientHeight ?? 600;
    canvas.width  = W;
    canvas.height = H;
    const cx = W / 2, cy = H / 2;

    // ── Degree map ────────────────────────────────────────────────────────────
    const deg: Record<string, number> = {};
    SIM_NODES.forEach((n) => { deg[n.id] = 0; });
    SIM_EDGES.forEach((e) => { deg[e.s] = (deg[e.s] ?? 0) + 1; deg[e.t] = (deg[e.t] ?? 0) + 1; });
    const maxDeg = Math.max(...Object.values(deg), 1);

    // ── Init nodes in layer-grouped radial sectors (like G6 radial sortBy:comboId) ─
    const LAYER_ORDER = ["entry","pages","components","wizard","hooks","lib","utils","ui","backend","operator","core","orphan"];
    const byLayer: Record<string, typeof SIM_NODES[0][]> = {};
    for (const n of SIM_NODES) {
      if (!byLayer[n.layer]) byLayer[n.layer] = [];
      byLayer[n.layer].push(n);
    }
    const activeLayers = LAYER_ORDER.filter((l) => byLayer[l]?.length > 0);
    const sectorAngle  = (2 * Math.PI) / activeLayers.length;

    const nodes: PNode[] = SIM_NODES.map((n) => {
      const d          = deg[n.id] ?? 0;
      const r          = 7 + (d / maxDeg) * 18;
      const layerIdx   = activeLayers.indexOf(n.layer);
      const siblings   = byLayer[n.layer];
      const sibIdx     = siblings.indexOf(n);
      const baseAngle  = layerIdx * sectorAngle;
      const spread     = sectorAngle * 0.65;
      const angleOff   = siblings.length > 1 ? (sibIdx / (siblings.length - 1) - 0.5) * spread : 0;
      const angle      = baseAngle + angleOff;
      const radius     = n.layer === "orphan" ? 390 : n.layer === "entry" ? 120 : 200 + (1 - d / maxDeg) * 110;
      return {
        id: n.id, label: n.label, layer: n.layer,
        x: cx + Math.cos(angle) * radius,
        y: cy + Math.sin(angle) * radius,
        vx: 0, vy: 0, r, pinned: false, degree: d,
      };
    });

    const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));

    stateRef.current = {
      nodes, raf: 0, scale: 1, ox: 0, oy: 0,
      drag: { nodeId: null, panStart: null },
      hovered: null, selected: null,
    };
    const S = stateRef.current;

    // ── Physics tick ──────────────────────────────────────────────────────────
    let tick = 0;
    const MAX  = 500;
    const A0   = 1.0;
    const ADEC = 0.016;

    function physics() {
      if (tick >= MAX) return;
      const alpha = A0 * Math.pow(1 - ADEC, tick++);

      // 1 — gravity to centre
      for (const p of nodes) {
        if (p.pinned) continue;
        p.vx += (cx - p.x) * 0.055 * alpha;
        p.vy += (cy - p.y) * 0.055 * alpha;
      }

      // 2 — repulsion (Barnes-Hut approximation: skip if very far)
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j];
          let dx = b.x - a.x || 0.1;
          let dy = b.y - a.y || 0.1;
          const d2 = dx * dx + dy * dy;
          if (d2 > 250000) continue;          // skip very distant pairs
          const d  = Math.sqrt(d2);
          const f  = (8000 * alpha) / d2;
          dx /= d; dy /= d;
          if (!a.pinned) { a.vx -= dx * f; a.vy -= dy * f; }
          if (!b.pinned) { b.vx += dx * f; b.vy += dy * f; }
        }
      }

      // 3 — link spring
      for (const e of SIM_EDGES) {
        const a = byId[e.s], b = byId[e.t];
        if (!a || !b) continue;
        const dx   = b.x - a.x;
        const dy   = b.y - a.y;
        const d    = Math.sqrt(dx * dx + dy * dy) || 0.1;
        const IDEAL = 100;
        const str  = ((d - IDEAL) / d) * 0.4 * alpha;
        if (!a.pinned) { a.vx += dx * str; a.vy += dy * str; }
        if (!b.pinned) { b.vx -= dx * str; b.vy -= dy * str; }
      }

      // 4 — collision (resolve overlap)
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j];
          const dx  = b.x - a.x || 0.1;
          const dy  = b.y - a.y || 0.1;
          const d   = Math.sqrt(dx * dx + dy * dy) || 0.1;
          const min = a.r + b.r + 5;
          if (d < min) {
            const push = (min - d) / d * 0.55;
            if (!a.pinned) { a.vx -= dx * push * 0.5; a.vy -= dy * push * 0.5; }
            if (!b.pinned) { b.vx += dx * push * 0.5; b.vy += dy * push * 0.5; }
          }
        }
      }

      // 5 — integrate + damp
      for (const p of nodes) {
        if (p.pinned) continue;
        p.x += p.vx; p.y += p.vy;
        p.vx *= 0.75; p.vy *= 0.75;
      }
    }

    // ── Render ────────────────────────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const ctx = canvas.getContext("2d")!;
    if (!ctx) return;;

    function render() {
      ctx.clearRect(0, 0, W, H);
      ctx.save();
      ctx.translate(S.ox, S.oy);
      ctx.scale(S.scale, S.scale);

      // Edges
      for (const e of SIM_EDGES) {
        const a = byId[e.s], b = byId[e.t];
        if (!a || !b) continue;
        const color = LAYERS[a.layer]?.color ?? "#5a7a9a";
        drawArrow(ctx, a.x, a.y, b.x, b.y, b.r, color);
      }

      // Nodes
      for (const n of nodes) {
        drawNode(ctx, n, S.selected === n.id, S.hovered === n.id, S.scale);
      }

      ctx.restore();
    }

    // ── Pre-run simulation silently so first render is already stable ─────────
    for (let i = 0; i < 260; i++) physics();

    // ── Loop ──────────────────────────────────────────────────────────────────
    function loop() {
      physics();
      render();
      S.raf = requestAnimationFrame(loop);
    }
    S.raf = requestAnimationFrame(loop);

    // ── Mouse helpers ─────────────────────────────────────────────────────────
    function toWorld(ex: number, ey: number) {
      return {
        x: (ex - S.ox) / S.scale,
        y: (ey - S.oy) / S.scale,
      };
    }

    function hitNode(wx: number, wy: number): PNode | null {
      for (let i = nodes.length - 1; i >= 0; i--) {
        const n  = nodes[i];
        const dx = wx - n.x, dy = wy - n.y;
        if (dx * dx + dy * dy <= (n.r + 4) * (n.r + 4)) return n;
      }
      return null;
    }

    // ── Events ────────────────────────────────────────────────────────────────
    let panStart: { mx: number; my: number; ox: number; oy: number } | null = null;
    let dragNode: PNode | null = null;

    function onMouseDown(e: MouseEvent) {
      const { x, y } = toWorld(e.offsetX, e.offsetY);
      const hit = hitNode(x, y);
      if (hit) {
        dragNode     = hit;
        hit.pinned   = true;
        hit.vx = hit.vy = 0;
      } else {
        panStart = { mx: e.offsetX, my: e.offsetY, ox: S.ox, oy: S.oy };
      }
    }

    function onMouseMove(e: MouseEvent) {
      const { x, y } = toWorld(e.offsetX, e.offsetY);
      if (dragNode) {
        dragNode.x = x; dragNode.y = y;
        return;
      }
      if (panStart) {
        S.ox = panStart.ox + (e.offsetX - panStart.mx);
        S.oy = panStart.oy + (e.offsetY - panStart.my);
        return;
      }
      const hit = hitNode(x, y);
      S.hovered = hit?.id ?? null;
      if (canvas) canvas.style.cursor = hit ? "pointer" : panStart ? "grabbing" : "grab";
    }

    function onMouseUp(e: MouseEvent) {
      if (dragNode && !panStart) {
        // click vs drag: if barely moved, treat as click
        const { x, y } = toWorld(e.offsetX, e.offsetY);
        const dist = Math.hypot(x - dragNode.x, y - dragNode.y);
        if (dist < 5) {
          selectNode(S.selected === dragNode.id ? null : dragNode.id);
          dragNode.pinned = false;
        }
      } else if (!dragNode) {
        const { x, y } = toWorld(e.offsetX, e.offsetY);
        if (!hitNode(x, y)) selectNode(null);
      }
      dragNode  = null;
      panStart  = null;
    }

    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 0.91;
      const mx = e.offsetX, my = e.offsetY;
      S.ox = mx - (mx - S.ox) * factor;
      S.oy = my - (my - S.oy) * factor;
      S.scale = Math.max(0.15, Math.min(4, S.scale * factor));
    }

    canvas.addEventListener("mousedown",  onMouseDown);
    canvas.addEventListener("mousemove",  onMouseMove);
    canvas.addEventListener("mouseup",    onMouseUp);
    canvas.addEventListener("wheel",      onWheel, { passive: false });

    return () => {
      cancelAnimationFrame(S.raf);
      canvas.removeEventListener("mousedown",  onMouseDown);
      canvas.removeEventListener("mousemove",  onMouseMove);
      canvas.removeEventListener("mouseup",    onMouseUp);
      canvas.removeEventListener("wheel",      onWheel);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectNode]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", background: "var(--bg-void)", borderRadius: "var(--r-lg)", border: "1px solid var(--border)", overflow: "hidden" }}>

      <canvas
        ref={canvasRef}
        style={{ display: "block", width: "100%", height: "100%", cursor: "grab" }}
      />

      {/* Selected node panel */}
      {selNode && (
        <div style={{
          position:     "absolute",
          top:          "1rem",
          right:        "1rem",
          width:        272,
          background:   "rgba(10,22,40,0.97)",
          border:       `1px solid ${LAYERS[selNode.layer]?.color ?? "#5a7a9a"}40`,
          borderLeft:   `3px solid ${LAYERS[selNode.layer]?.color ?? "#5a7a9a"}`,
          borderRadius: "var(--r-lg)",
          padding:      "1rem 1.15rem",
          zIndex:       20,
          backdropFilter: "blur(10px)",
        }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "0.75rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", minWidth: 0, flex: 1 }}>
              <FileCode size={12} color={LAYERS[selNode.layer]?.color} style={{ flexShrink: 0 }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: "var(--mono)", fontSize: "0.78rem", fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {selNode.label.split("/").pop()}
                </div>
                <div style={{ fontFamily: "var(--mono)", fontSize: "0.62rem", color: "var(--muted-foreground)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {selNode.label}
                </div>
              </div>
            </div>
            <button onClick={() => selectNode(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--dim)", padding: 2, flexShrink: 0 }}>
              <X size={12} />
            </button>
          </div>

          <span style={{ fontFamily: "var(--mono)", fontSize: "0.62rem", color: LAYERS[selNode.layer]?.color, background: `${LAYERS[selNode.layer]?.color}14`, border: `1px solid ${LAYERS[selNode.layer]?.color}28`, borderRadius: "3px", padding: "1px 7px", textTransform: "uppercase", letterSpacing: "0.1em" }}>
            {LAYERS[selNode.layer]?.label}
          </span>

          {selNode.importsTo.length > 0 && (
            <div style={{ marginTop: "0.85rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: "0.35rem" }}>
                <ArrowRight size={9} color="var(--cyan)" />
                <span style={{ fontFamily: "var(--mono)", fontSize: "0.62rem", color: "var(--cyan)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                  importa ({selNode.importsTo.length})
                </span>
              </div>
              {selNode.importsTo.map((f) => (
                <div key={f} style={{ fontFamily: "var(--mono)", fontSize: "0.68rem", color: "var(--muted-foreground)", padding: "1px 6px", background: "var(--bg-panel)", borderRadius: 3, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {f.split("/").pop()}
                </div>
              ))}
            </div>
          )}

          {selNode.importedBy.length > 0 && (
            <div style={{ marginTop: "0.75rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: "0.35rem" }}>
                <GitBranch size={9} color="#a78bfa" />
                <span style={{ fontFamily: "var(--mono)", fontSize: "0.62rem", color: "#a78bfa", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                  importado por ({selNode.importedBy.length})
                </span>
              </div>
              {selNode.importedBy.map((f) => (
                <div key={f} style={{ fontFamily: "var(--mono)", fontSize: "0.68rem", color: "var(--muted-foreground)", padding: "1px 6px", background: "var(--bg-panel)", borderRadius: 3, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {f.split("/").pop()}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
