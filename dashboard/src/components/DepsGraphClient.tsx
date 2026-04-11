"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { X, FileCode, ArrowRight, GitBranch, Layers } from "lucide-react";

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

// ─── Repos ────────────────────────────────────────────────────────────────────
// Cada repo tem um fill-tint próprio para diferenciação visual
const REPOS: Record<string, { label: string; tint: string; icon: string }> = {
  crm: { label: "cotacao-inteligente-crm", tint: "0d", icon: "⬡" },
  pp:  { label: "pixel-perfect",           tint: "1a", icon: "◈" },
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

// ─── pixel-perfect repo ───────────────────────────────────────────────────────
const PP_NODES = [
  { id: "pp_main",         label: "main.tsx",                   layer: "entry"      },
  { id: "pp_App",          label: "App.tsx",                    layer: "entry"      },
  { id: "pp_CompareView",  label: "pages/CompareView.tsx",      layer: "pages"      },
  { id: "pp_Components",   label: "pages/ComponentsLibrary.tsx",layer: "pages"      },
  { id: "pp_Settings",     label: "pages/Settings.tsx",         layer: "pages"      },
  { id: "pp_Canvas",       label: "CompareCanvas.tsx",          layer: "components" },
  { id: "pp_DiffOverlay",  label: "DiffOverlay.tsx",            layer: "components" },
  { id: "pp_Preview",      label: "ComponentPreview.tsx",       layer: "components" },
  { id: "pp_TokenPanel",   label: "TokenPanel.tsx",             layer: "components" },
  { id: "pp_ColorSwatch",  label: "ColorSwatch.tsx",            layer: "components" },
  { id: "pp_LayerTree",    label: "LayerTree.tsx",              layer: "components" },
  { id: "pp_Annotations",  label: "AnnotationList.tsx",         layer: "components" },
  { id: "pp_ExportDialog", label: "ExportDialog.tsx",           layer: "components" },
  { id: "pp_usePixelDiff", label: "hooks/usePixelDiff.ts",      layer: "hooks"      },
  { id: "pp_useZoom",      label: "hooks/useZoom.ts",           layer: "hooks"      },
  { id: "pp_useAnnotation",label: "hooks/useAnnotation.ts",     layer: "hooks"      },
  { id: "pp_diffEngine",   label: "lib/diffEngine.ts",          layer: "lib"        },
  { id: "pp_imageLoader",  label: "lib/imageLoader.ts",         layer: "lib"        },
  { id: "pp_exportPDF",    label: "lib/exportPDF.ts",           layer: "lib"        },
  { id: "pp_tokenParser",  label: "lib/tokenParser.ts",         layer: "lib"        },
  { id: "pp_colorMath",    label: "utils/colorMath.ts",         layer: "utils"      },
  { id: "pp_measureUtils", label: "utils/measureUtils.ts",      layer: "utils"      },
  { id: "pp_fileUtils",    label: "utils/fileUtils.ts",         layer: "utils"      },
  { id: "pp_btn",          label: "ui/button.tsx",              layer: "ui"         },
  { id: "pp_dialog",       label: "ui/dialog.tsx",              layer: "ui"         },
  { id: "pp_tooltip",      label: "ui/tooltip.tsx",             layer: "ui"         },
  { id: "pp_vite",         label: "vite.config.ts",             layer: "orphan"     },
  { id: "pp_eslint",       label: "eslint.config.js",           layer: "orphan"     },
];

const PP_EDGES = [
  { s: "pp_main",         t: "pp_App"          },
  { s: "pp_App",          t: "pp_CompareView"  },
  { s: "pp_App",          t: "pp_Components"   },
  { s: "pp_App",          t: "pp_Settings"     },
  { s: "pp_CompareView",  t: "pp_Canvas"       },
  { s: "pp_CompareView",  t: "pp_DiffOverlay"  },
  { s: "pp_CompareView",  t: "pp_LayerTree"    },
  { s: "pp_CompareView",  t: "pp_Annotations"  },
  { s: "pp_Components",   t: "pp_Preview"      },
  { s: "pp_Components",   t: "pp_TokenPanel"   },
  { s: "pp_Components",   t: "pp_ColorSwatch"  },
  { s: "pp_Settings",     t: "pp_tokenParser"  },
  { s: "pp_Settings",     t: "pp_exportPDF"    },
  { s: "pp_Canvas",       t: "pp_usePixelDiff" },
  { s: "pp_Canvas",       t: "pp_useZoom"      },
  { s: "pp_Canvas",       t: "pp_imageLoader"  },
  { s: "pp_DiffOverlay",  t: "pp_usePixelDiff" },
  { s: "pp_DiffOverlay",  t: "pp_colorMath"    },
  { s: "pp_TokenPanel",   t: "pp_tokenParser"  },
  { s: "pp_TokenPanel",   t: "pp_ColorSwatch"  },
  { s: "pp_LayerTree",    t: "pp_useAnnotation"},
  { s: "pp_Annotations",  t: "pp_useAnnotation"},
  { s: "pp_Annotations",  t: "pp_exportPDF"    },
  { s: "pp_ExportDialog", t: "pp_exportPDF"    },
  { s: "pp_ExportDialog", t: "pp_fileUtils"    },
  { s: "pp_ExportDialog", t: "pp_dialog"       },
  { s: "pp_usePixelDiff", t: "pp_diffEngine"   },
  { s: "pp_usePixelDiff", t: "pp_colorMath"    },
  { s: "pp_useZoom",      t: "pp_measureUtils" },
  { s: "pp_useAnnotation",t: "pp_fileUtils"    },
  { s: "pp_diffEngine",   t: "pp_colorMath"    },
  { s: "pp_diffEngine",   t: "pp_measureUtils" },
  { s: "pp_imageLoader",  t: "pp_fileUtils"    },
  { s: "pp_tokenParser",  t: "pp_colorMath"    },
  { s: "pp_Preview",      t: "pp_tokenParser"  },
  { s: "pp_Preview",      t: "pp_btn"          },
  { s: "pp_ColorSwatch",  t: "pp_colorMath"    },
  { s: "pp_ColorSwatch",  t: "pp_tooltip"      },
];

// ─── All nodes / edges merged ─────────────────────────────────────────────────
const ALL_NODES = [
  ...SIM_NODES.map((n) => ({ ...n, repo: "crm" })),
  ...PP_NODES.map((n)  => ({ ...n, repo: "pp"  })),
];
const ALL_EDGES = [
  ...SIM_EDGES.map((e) => ({ ...e, repo: "crm" })),
  ...PP_EDGES.map((e)  => ({ ...e, repo: "pp"  })),
];

// ─── Selection detail ─────────────────────────────────────────────────────────
interface SelNode {
  id:         string;
  label:      string;
  layer:      string;
  repo:       string;
  importsTo:  string[];
  importedBy: string[];
}

// ─── Sidebar (full-height, matches GraphClient NodeSidebar) ───────────────────
function NodeSidebar({ node, onClose }: { node: SelNode; onClose: () => void }) {
  const accent = LAYERS[node.layer]?.color ?? "#5a7a9a";

  return (
    <div
      style={{
        position:      "absolute",
        top: 0, right: 0, bottom: 0,
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
      {/* Linha neon topo */}
      <div style={{ height: 1, background: `linear-gradient(90deg, transparent, ${accent}88, transparent)` }} />

      {/* Header */}
      <div style={{ padding: "1rem", borderBottom: `1px solid ${accent}18`, display: "flex", alignItems: "flex-start", gap: "0.5rem" }}>
        <div style={{ width: 36, height: 36, borderRadius: 8, background: `${accent}12`, border: `1px solid ${accent}33`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2 }}>
          <FileCode size={16} color={accent} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: "0.62rem", color: "var(--muted-foreground)", letterSpacing: "0.06em", marginBottom: "0.1rem" }}>
              {REPOS[node.repo]?.label ?? node.repo}
            </div>
            <div style={{ fontFamily: "var(--mono)", fontSize: "0.72rem", color: accent, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "0.2rem" }}>
              {LAYERS[node.layer]?.label}
            </div>
          <div style={{ fontFamily: "var(--mono)", fontSize: "0.9rem", fontWeight: 700, color: "var(--text)", wordBreak: "break-all", lineHeight: 1.3, textShadow: `0 0 10px ${accent}44` }}>
            {node.label.split("/").pop()}
          </div>
          {node.label.includes("/") && (
            <div style={{ fontFamily: "var(--mono)", fontSize: "0.72rem", color: "var(--muted-foreground)", marginTop: "0.1rem" }}>
              {node.label.split("/").slice(0, -1).join("/")}
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
        {/* Layer badge */}
        <div>
          <span style={{ fontFamily: "var(--mono)", fontSize: "0.72rem", color: accent, background: `${accent}18`, border: `1px solid ${accent}44`, borderRadius: 4, padding: "2px 8px", letterSpacing: "0.08em" }}>
            {LAYERS[node.layer]?.label}
          </span>
        </div>

        {/* Imports to */}
        {node.importsTo.length > 0 && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.5rem" }}>
              <ArrowRight size={11} color="var(--cyan)" />
              <span style={{ fontFamily: "var(--mono)", fontSize: "0.72rem", color: "var(--dim)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                importa ({node.importsTo.length})
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
              {node.importsTo.map((f) => {
                const tgt = ALL_NODES.find((n) => n.label === f);
                const c   = LAYERS[tgt?.layer ?? "orphan"]?.color ?? "#5a7a9a";
                return (
                  <div key={f} style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "var(--mono)", fontSize: "0.75rem", color: "var(--muted-foreground)", padding: "2px 6px", background: "var(--bg-panel)", borderRadius: 4, overflow: "hidden" }}>
                    <div style={{ width: 5, height: 5, borderRadius: "50%", background: c, flexShrink: 0 }} />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.split("/").pop()}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Imported by */}
        {node.importedBy.length > 0 && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.5rem" }}>
              <GitBranch size={11} color="#a78bfa" />
              <span style={{ fontFamily: "var(--mono)", fontSize: "0.72rem", color: "var(--dim)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                importado por ({node.importedBy.length})
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
              {node.importedBy.map((f) => {
                const src = ALL_NODES.find((n) => n.label === f);
                const c   = LAYERS[src?.layer ?? "orphan"]?.color ?? "#5a7a9a";
                return (
                  <div key={f} style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "var(--mono)", fontSize: "0.75rem", color: "var(--muted-foreground)", padding: "2px 6px", background: "var(--bg-panel)", borderRadius: 4, overflow: "hidden" }}>
                    <div style={{ width: 5, height: 5, borderRadius: "50%", background: c, flexShrink: 0 }} />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.split("/").pop()}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Linha neon rodapé */}
      <div style={{ height: 1, background: `linear-gradient(90deg, transparent, ${accent}44, transparent)` }} />
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function DepsGraphClient() {
  const containerRef                    = useRef<HTMLDivElement>(null);
  const graphRef                        = useRef<unknown>(null);
  const [loading,      setLoading]      = useState(true);
  const [ready,        setReady]        = useState(false);
  const [selNode,      setSelNode]      = useState<SelNode | null>(null);

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
        ALL_NODES.forEach((n) => { deg[n.id] = 0; });
        ALL_EDGES.forEach((e) => {
          deg[e.s] = (deg[e.s] ?? 0) + 1;
          deg[e.t] = (deg[e.t] ?? 0) + 1;
        });
        const maxDeg = Math.max(...Object.values(deg), 1);

        // ── Build G6 node/edge data ───────────────────────────────────────────
        const gNodes = ALL_NODES.map((n) => {
          const color    = LAYERS[n.layer]?.color ?? "#5a7a9a";
          const repo     = REPOS[n.repo];
          const d        = deg[n.id] ?? 0;
          const size     = 20 + (d / maxDeg) * 24;
          const name     = n.label.split("/").pop()?.replace(/\.(tsx?|jsx?|ts|js)$/, "") ?? n.label;
          const isHub    = d >= 5 || n.layer === "entry";
          const tint     = repo.tint;
          // repoLayer groups nodes by repo first, then by layer within the radial rings
          const repoLayer = `${n.repo}-${n.layer}`;

          return {
            id:    n.id,
            style: {
              size,
              fill:             isHub ? `${color}${tint}` : `${color}0a`,
              stroke:           color,
              lineWidth:        isHub ? 2.5 : 1.5,
              shadowColor:      color,
              shadowBlur:       isHub ? 20 : 10,
              label:            isHub,
              labelText:        name,
              labelFill:        isHub ? color : "#94a3b8",
              labelFontFamily:  "'Fira Code', monospace",
              labelFontSize:    isHub ? 11 : 9,
              labelMaxWidth:    150,
              labelOffsetY:     6,
              labelWordWrap:    false,
              labelBackground:        true,
              labelBackgroundFill:    "rgba(2,6,23,0.85)",
              labelBackgroundRadius:  3,
              labelBackgroundPadding: [2, 7, 2, 7] as [number,number,number,number],
              iconText:        repo.icon,
              iconFill:        color,
              iconFontSize:    isHub ? 11 : 9,
              iconFontFamily:  "'Fira Code', monospace",
            },
            data: {
              layer:      n.layer,
              repo:       n.repo,
              repoLabel:  repo.label,
              fullLabel:  n.label,
              degree:     d,
              repoLayer,
            },
          };
        });

        const gEdges = ALL_EDGES.map((e, i) => {
          const src   = ALL_NODES.find((n) => n.id === e.s);
          const color = LAYERS[src?.layer ?? "orphan"]?.color ?? "#5a7a9a";
          return {
            id:     `edge-${i}`,
            source: e.s,
            target: e.t,
            style:  {
              stroke:      `${color}40`,
              lineWidth:   1,
              opacity:     0.7,
              lineDash:    [6, 5],
              shadowColor: color,
              shadowBlur:  3,
              endArrow:    false,
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

          layout: {
            type:                       "radial",
            nodeSize:                   44,
            unitRadius:                 140,
            linkDistance:               260,
            preventOverlap:             true,
            maxPreventOverlapIteration: 200,
            sortBy:                     "repoLayer",  // groups by repo+layer on each ring
            sortStrength:               70,
          },

          node: {
            type:  "circle",
            state: {
              active: {
                label:      true,
                lineWidth:  3,
                shadowBlur: 28,
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

          plugins: [],
        });

        await graph.render();

        // ── Flow animation nas arestas ────────────────────────────────────────
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

        // ── Click → detail sidebar ────────────────────────────────────────────
        graph.on("node:click", (evt: unknown) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const e      = evt as any;
          const nodeId = e?.target?.id ?? e?.itemId;
          if (!nodeId) return;
          const node = ALL_NODES.find((n) => n.id === nodeId);
          if (!node) return;
          setSelNode({
            id:         nodeId,
            label:      node.label,
            layer:      node.layer,
            repo:       node.repo,
            importsTo:  ALL_EDGES.filter((ed) => ed.s === nodeId).map((ed) => ALL_NODES.find((n) => n.id === ed.t)?.label ?? ed.t),
            importedBy: ALL_EDGES.filter((ed) => ed.t === nodeId).map((ed) => ALL_NODES.find((n) => n.id === ed.s)?.label ?? ed.s),
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
  }, []);

  const LEGEND = Object.entries(LAYERS)
    .filter(([k]) => k !== "entry") // entry já fica óbvio pelo centro
    .map(([, v]) => v);

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
      <div aria-hidden style={{ position: "absolute", inset: 0, backgroundImage: `linear-gradient(rgba(6,182,212,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(6,182,212,0.04) 1px, transparent 1px)`, backgroundSize: "48px 48px", pointerEvents: "none", zIndex: 0 }} />

      {/* Scanlines */}
      <div aria-hidden style={{ position: "absolute", inset: 0, backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.08) 2px, rgba(0,0,0,0.08) 4px)", pointerEvents: "none", zIndex: 1 }} />

      {/* Glow central */}
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
        <div style={{ position: "absolute", top: 12, right: selNode ? 292 : 12, display: "flex", flexDirection: "column", gap: 6, zIndex: 20, transition: "right 200ms ease" }}>
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

      {/* Legenda interna */}
      {ready && (
        <div style={{ position: "absolute", bottom: 12, left: 12, display: "flex", flexDirection: "column", gap: 5, zIndex: 20, background: "rgba(2,8,18,0.88)", border: "1px solid rgba(6,182,212,0.1)", borderRadius: 8, padding: "8px 12px", backdropFilter: "blur(12px)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 2 }}>
            <Layers size={10} color="rgba(6,182,212,0.5)" />
            <span style={{ fontFamily: "var(--mono)", fontSize: "0.72rem", color: "rgba(6,182,212,0.5)", letterSpacing: "0.14em", textTransform: "uppercase" }}>// layers</span>
          </div>
          {LEGEND.map(({ label, color }) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: color, boxShadow: `0 0 5px ${color}`, flexShrink: 0 }} />
              <span style={{ fontFamily: "var(--mono)", fontSize: "0.72rem", color: "var(--muted-foreground)" }}>{label}</span>
            </div>
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
