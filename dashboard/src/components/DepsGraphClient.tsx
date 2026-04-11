"use client";

import { useEffect, useRef, useState } from "react";
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

// ─── Selection detail ─────────────────────────────────────────────────────────
interface SelNode {
  id:         string;
  label:      string;
  layer:      string;
  importsTo:  string[];
  importedBy: string[];
}

// ─── Main component ───────────────────────────────────────────────────────────
export function DepsGraphClient() {
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef     = useRef<unknown>(null);
  const [loading,  setLoading]  = useState(true);
  const [selNode,  setSelNode]  = useState<SelNode | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    let destroyed = false;

    const init = async () => {
      try {
        const { Graph } = await import("@antv/g6");
        if (destroyed) return;

        const el     = containerRef.current!;
        const width  = el.clientWidth  || 900;
        const height = el.clientHeight || 600;

        // ── Degree map ────────────────────────────────────────────────────────
        const deg: Record<string, number> = {};
        SIM_NODES.forEach((n) => { deg[n.id] = 0; });
        SIM_EDGES.forEach((e) => {
          deg[e.s] = (deg[e.s] ?? 0) + 1;
          deg[e.t] = (deg[e.t] ?? 0) + 1;
        });
        const maxDeg = Math.max(...Object.values(deg), 1);

        // ── Build G6 node/edge data ───────────────────────────────────────────
        const gNodes = SIM_NODES.map((n) => {
          const color   = LAYERS[n.layer]?.color ?? "#5a7a9a";
          const d       = deg[n.id] ?? 0;
          const size    = 18 + (d / maxDeg) * 26;
          const name    = n.label.split("/").pop()?.replace(/\.(tsx?|jsx?|ts|js)$/, "") ?? n.label;
          const showLbl = d >= 5 || n.layer === "entry" || n.layer === "core";

          return {
            id:    n.id,
            style: {
              size,
              fill:          `${color}12`,
              stroke:        color,
              lineWidth:     1.5,
              shadowColor:   color,
              shadowBlur:    showLbl ? 14 : 8,
              label:         showLbl,
              labelText:     name,
              labelFill:     color,
              labelFontFamily: "'Fira Code', monospace",
              labelFontSize:  10,
              labelOffsetY:   6,
              labelBackground:        true,
              labelBackgroundFill:    "rgba(2,6,23,0.88)",
              labelBackgroundRadius:  3,
              labelBackgroundPadding: [2, 6, 2, 6] as [number,number,number,number],
            },
            data: {
              layer:     n.layer,
              fullLabel: n.label,
              degree:    d,
            },
          };
        });

        const gEdges = SIM_EDGES.map((e, i) => {
          const src   = SIM_NODES.find((n) => n.id === e.s);
          const color = LAYERS[src?.layer ?? "orphan"]?.color ?? "#5a7a9a";
          return {
            id:     `edge-${i}`,
            source: e.s,
            target: e.t,
            style:  {
              stroke:       `${color}38`,
              lineWidth:    1,
              opacity:      0.75,
              endArrow:     true,
              endArrowSize: 4,
            },
          };
        });

        const graph = new Graph({
          container: el,
          width,
          height,
          autoResize:  true,
          autoFit:     "center",
          background:  "transparent",
          data:        { nodes: gNodes, edges: gEdges },

          // ── Radial layout — same algorithm as /graph page ─────────────────
          layout: {
            type:                       "radial",
            nodeSize:                   44,
            unitRadius:                 130,
            linkDistance:               240,
            preventOverlap:             true,
            maxPreventOverlapIteration: 200,
            sortBy:                     "layer",   // group same-layer nodes on each ring
            sortStrength:               60,
          },

          node: {
            type:  "circle",
            state: {
              active: {
                label:      true,
                lineWidth:  2.5,
                shadowBlur: 22,
                zIndex:     100,
              },
              selected: {
                label:       true,
                lineWidth:   3,
                shadowBlur:  32,
                stroke:      "#fbbf24",
                shadowColor: "#fbbf24",
                zIndex:      100,
              },
              inactive: { opacity: 0.14, shadowBlur: 0 },
            },
          },

          edge: {
            type:  "line",
            state: {
              active:   { opacity: 0.9, lineWidth: 1.5 },
              selected: { opacity: 1,   lineWidth: 2   },
              inactive: { opacity: 0.05 },
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

        // ── Click → show detail panel ─────────────────────────────────────────
        graph.on("node:click", (evt: unknown) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const e      = evt as any;
          const nodeId = e?.target?.id ?? e?.itemId;
          if (!nodeId) return;
          const node = SIM_NODES.find((n) => n.id === nodeId);
          if (!node) return;
          setSelNode({
            id:         nodeId,
            label:      node.label,
            layer:      node.layer,
            importsTo:  SIM_EDGES.filter((e) => e.s === nodeId).map((e) => SIM_NODES.find((n) => n.id === e.t)?.label ?? e.t),
            importedBy: SIM_EDGES.filter((e) => e.t === nodeId).map((e) => SIM_NODES.find((n) => n.id === e.s)?.label ?? e.s),
          });
        });

        graph.on("canvas:click", () => setSelNode(null));

        if (!destroyed) {
          graphRef.current = graph;
          setLoading(false);
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
  }, []);

  const accent = selNode ? (LAYERS[selNode.layer]?.color ?? "#5a7a9a") : "#06b6d4";

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
          position:      "absolute",
          top:           "50%",
          left:          "50%",
          transform:     "translate(-50%, -50%)",
          width:         "60%",
          height:        "60%",
          background:    "radial-gradient(ellipse, rgba(6,182,212,0.04) 0%, transparent 70%)",
          pointerEvents: "none",
          zIndex:        0,
        }}
      />

      {/* Loading */}
      {loading && (
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "1rem", zIndex: 20, background: "#020812" }}>
          <div style={{ width: 32, height: 32, border: "2px solid #0d1f35", borderTopColor: "#06b6d4", borderRadius: "50%", animation: "spin-slow 0.7s linear infinite" }} />
          <span style={{ fontFamily: "var(--mono)", fontSize: "0.7rem", color: "#06b6d4", letterSpacing: "0.14em", textTransform: "uppercase", textShadow: "0 0 12px rgba(6,182,212,0.5)" }}>
            Calculando grafo...
          </span>
        </div>
      )}

      {/* G6 container */}
      <div ref={containerRef} style={{ position: "absolute", inset: 0, zIndex: 2 }} />

      {/* Selected node panel */}
      {selNode && (
        <div style={{
          position:       "absolute",
          top:            "1rem",
          right:          "1rem",
          width:          272,
          background:     "rgba(2,6,23,0.97)",
          border:         `1px solid ${accent}30`,
          borderLeft:     `3px solid ${accent}`,
          borderRadius:   "var(--r-lg)",
          padding:        "1rem 1.15rem",
          zIndex:         20,
          backdropFilter: "blur(12px)",
          boxShadow:      `-6px 0 24px ${accent}10`,
          animation:      "fade-left 0.2s cubic-bezier(.16,1,.3,1) both",
        }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "0.75rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", minWidth: 0, flex: 1 }}>
              <FileCode size={12} color={accent} style={{ flexShrink: 0 }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: "var(--mono)", fontSize: "0.78rem", fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {selNode.label.split("/").pop()}
                </div>
                <div style={{ fontFamily: "var(--mono)", fontSize: "0.62rem", color: "var(--muted-foreground)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {selNode.label}
                </div>
              </div>
            </div>
            <button
              onClick={() => setSelNode(null)}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--dim)", padding: 2, flexShrink: 0 }}
            >
              <X size={12} />
            </button>
          </div>

          {/* Layer badge */}
          <span style={{
            fontFamily:    "var(--mono)",
            fontSize:      "0.62rem",
            color:         accent,
            background:    `${accent}14`,
            border:        `1px solid ${accent}28`,
            borderRadius:  "3px",
            padding:       "1px 7px",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
          }}>
            {LAYERS[selNode.layer]?.label}
          </span>

          {/* Imports to */}
          {selNode.importsTo.length > 0 && (
            <div style={{ marginTop: "0.85rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: "0.35rem" }}>
                <ArrowRight size={9} color="var(--cyan)" />
                <span style={{ fontFamily: "var(--mono)", fontSize: "0.62rem", color: "var(--cyan)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                  importa ({selNode.importsTo.length})
                </span>
              </div>
              {selNode.importsTo.map((f) => (
                <div
                  key={f}
                  style={{ fontFamily: "var(--mono)", fontSize: "0.68rem", color: "var(--muted-foreground)", padding: "1px 6px", background: "var(--bg-panel)", borderRadius: 3, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                >
                  {f.split("/").pop()}
                </div>
              ))}
            </div>
          )}

          {/* Imported by */}
          {selNode.importedBy.length > 0 && (
            <div style={{ marginTop: "0.75rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: "0.35rem" }}>
                <GitBranch size={9} color="#a78bfa" />
                <span style={{ fontFamily: "var(--mono)", fontSize: "0.62rem", color: "#a78bfa", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                  importado por ({selNode.importedBy.length})
                </span>
              </div>
              {selNode.importedBy.map((f) => (
                <div
                  key={f}
                  style={{ fontFamily: "var(--mono)", fontSize: "0.68rem", color: "var(--muted-foreground)", padding: "1px 6px", background: "var(--bg-panel)", borderRadius: 3, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                >
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
