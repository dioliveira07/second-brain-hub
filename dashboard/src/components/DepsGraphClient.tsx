"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { X, GitBranch, ArrowRight, Layers } from "lucide-react";

// ─── Categories (layer equivalent for repo-level graph) ───────────────────────
const CATS: Record<string, { color: string; label: string }> = {
  fullstack: { color: "#a78bfa", label: "Full-stack"   },
  backend:   { color: "#f87171", label: "Backend"      },
  frontend:  { color: "#06b6d4", label: "Frontend"     },
  tooling:   { color: "#fbbf24", label: "Tooling"      },
  infra:     { color: "#fb923c", label: "Infra / Ops"  },
  service:   { color: "#34d399", label: "Serviço / API" },
};

// ─── All 29 repos ─────────────────────────────────────────────────────────────
const REPO_NODES = [
  // ── Full-stack ──────────────────────────────────────────────────────────────
  { id: "fluxionai",          label: "fluxionai",                   cat: "fullstack", desc: "Plataforma de IA conversacional com agentes e memória"       },
  { id: "fluxiom-crm",        label: "fluxiom-crm",                 cat: "fullstack", desc: "CRM completo com automações e integrações"                   },
  { id: "cotacao-crm",        label: "cotacao-inteligente-crm",     cat: "fullstack", desc: "CRM de cotação de planos de saúde com IA"                    },
  { id: "second-brain-hub",   label: "second-brain-hub",            cat: "fullstack", desc: "Hub de conhecimento e memória de repositórios"               },
  { id: "autoconect-oficial", label: "autoconect-oficial",          cat: "fullstack", desc: "Versão oficial do sistema de conexão automática"             },
  { id: "autoconect",         label: "autoconect",                  cat: "fullstack", desc: "Sistema de conexão automática (base)"                        },
  { id: "laravel",            label: "laravel",                     cat: "fullstack", desc: "Projeto Laravel base"                                        },
  { id: "innove-ledger",      label: "innove-ledger",               cat: "fullstack", desc: "Ledger financeiro com controle de transações"                },
  { id: "faturamento",        label: "faturamento-associacoes",     cat: "fullstack", desc: "Módulo de faturamento para associações"                      },
  { id: "associacoes",        label: "associacoes-projeto",         cat: "fullstack", desc: "Sistema de gestão de associações"                            },
  { id: "associacoes-fork",   label: "associacoes-projeto-883296f8",cat: "fullstack", desc: "Fork do projeto de associações"                              },
  { id: "criacao-projetos",   label: "criacao-de-projetos",         cat: "fullstack", desc: "Scaffold e criação automatizada de projetos"                 },
  // ── Backend ─────────────────────────────────────────────────────────────────
  { id: "garimpo",            label: "garimpo-backend",             cat: "backend",   desc: "Backend de busca e indexação de dados (garimpo)"             },
  { id: "nfse-proxy",         label: "nfse-proxy",                  cat: "backend",   desc: "Proxy para emissão de NFS-e"                                 },
  { id: "webhook-doutor",     label: "webhook-doutorSeguros",       cat: "backend",   desc: "Receptor de webhooks do DoutorSeguros"                       },
  { id: "sistemainterno",     label: "sistemainterno",              cat: "backend",   desc: "Sistema interno de gestão"                                   },
  // ── Frontend ────────────────────────────────────────────────────────────────
  { id: "pixel-perfect",      label: "pixel-perfect-clone-9021",    cat: "frontend",  desc: "Clone pixel-perfect para comparação de UI"                   },
  { id: "valorize",           label: "valorize-teste",              cat: "frontend",  desc: "App de testes para o produto Valorize"                       },
  { id: "mind-growth",        label: "mind-growth-diagnostics",     cat: "frontend",  desc: "Diagnósticos de crescimento pessoal"                         },
  { id: "batalha",            label: "batalhadethor",               cat: "frontend",  desc: "Jogo de batalha temático"                                    },
  { id: "designertools",      label: "designerferramentas",         cat: "frontend",  desc: "Ferramentas para designers"                                  },
  // ── Tooling ─────────────────────────────────────────────────────────────────
  { id: "skills",             label: "skills",                      cat: "tooling",   desc: "Vault de skills do Claude Code"                              },
  { id: "playbooks",          label: "playbooks",                   cat: "tooling",   desc: "Playbooks de processos e decisões"                           },
  { id: "bugs",               label: "bugs",                        cat: "tooling",   desc: "Tracker de bugs e issues"                                    },
  { id: "n8n-workflows",      label: "n8n-workflows",               cat: "tooling",   desc: "Workflows de automação no n8n"                               },
  { id: "project-duplicator", label: "project-duplicator",          cat: "tooling",   desc: "Utilitário de duplicação de projetos"                        },
  { id: "my-first-repo",      label: "my-first-repository",         cat: "tooling",   desc: "Repositório inicial"                                         },
  // ── Infra ────────────────────────────────────────────────────────────────────
  { id: "github-connector",   label: "github-connector-hub",        cat: "infra",     desc: "Conector GitHub para webhooks e indexação"                   },
  { id: "n8n",                label: "n8n",                         cat: "infra",     desc: "Plataforma n8n self-hosted"                                  },
];

// ─── Inter-repo dependency edges ──────────────────────────────────────────────
// Edge = "s depende de / consome t"
const REPO_EDGES = [
  // Infra base
  { s: "n8n-workflows",      t: "n8n",                desc: "workflows rodam no n8n"              },
  { s: "second-brain-hub",   t: "github-connector",   desc: "indexação via github-connector"      },
  { s: "criacao-projetos",   t: "github-connector",   desc: "cria repos via connector"            },
  // CRM / negócios
  { s: "cotacao-crm",        t: "webhook-doutor",     desc: "envia cotações via webhook"          },
  { s: "cotacao-crm",        t: "garimpo",            desc: "busca dados no garimpo"              },
  { s: "fluxiom-crm",        t: "nfse-proxy",         desc: "emite NFS-e via proxy"               },
  { s: "fluxiom-crm",        t: "garimpo",            desc: "indexação de leads no garimpo"       },
  { s: "sistemainterno",     t: "fluxiom-crm",        desc: "integra com o CRM"                   },
  { s: "webhook-doutor",     t: "sistemainterno",     desc: "alimenta sistema interno"            },
  // Faturamento / associações
  { s: "faturamento",        t: "nfse-proxy",         desc: "emite notas fiscais"                 },
  { s: "faturamento",        t: "associacoes",        desc: "módulo de billing das associações"   },
  { s: "associacoes-fork",   t: "associacoes",        desc: "fork do projeto base"                },
  { s: "innove-ledger",      t: "nfse-proxy",         desc: "integra NFS-e para transações"       },
  // Autoconect
  { s: "autoconect-oficial", t: "autoconect",         desc: "versão oficial sobre a base"         },
  // Brain / IA
  { s: "fluxionai",          t: "second-brain-hub",   desc: "alimenta hub com memória de IA"      },
  { s: "garimpo",            t: "second-brain-hub",   desc: "dados indexados no hub"              },
  { s: "mind-growth",        t: "fluxionai",          desc: "usa IA do fluxionai"                 },
  // n8n automações
  { s: "n8n-workflows",      t: "webhook-doutor",     desc: "dispara webhooks via n8n"            },
  { s: "n8n-workflows",      t: "fluxiom-crm",        desc: "automação de CRM via n8n"            },
  { s: "n8n-workflows",      t: "cotacao-crm",        desc: "automação de cotações"               },
  // Tooling → Hub
  { s: "bugs",               t: "second-brain-hub",   desc: "bugs indexados no hub"               },
  { s: "skills",             t: "second-brain-hub",   desc: "skills indexadas no hub"             },
  { s: "playbooks",          t: "second-brain-hub",   desc: "playbooks indexados no hub"          },
  // Frontend
  { s: "designertools",      t: "pixel-perfect",      desc: "usa pixel-perfect para comparação"   },
  { s: "criacao-projetos",   t: "laravel",            desc: "scaffolda projetos Laravel"          },
  { s: "valorize",           t: "sistemainterno",     desc: "testa contra sistema interno"        },
];

// ─── Shared services / external APIs ─────────────────────────────────────────
// Nós de infra/serviço que múltiplos repos consomem — criam o hub-and-spoke
const SERVICE_NODES = [
  { id: "svc-postgres", label: "PostgreSQL",      cat: "service", desc: "Banco relacional principal — usado por backend, CRM e infra"   },
  { id: "svc-redis",    label: "Redis",            cat: "service", desc: "Cache e filas — sessões, jobs e pub/sub"                       },
  { id: "svc-qdrant",   label: "Qdrant",           cat: "service", desc: "Vector database para busca semântica e embeddings"             },
  { id: "svc-supabase", label: "Supabase",         cat: "service", desc: "BaaS com Postgres, auth e realtime"                           },
  { id: "svc-github",   label: "GitHub API",       cat: "service", desc: "API do GitHub — webhooks, repos, issues e PRs"                },
  { id: "svc-claude",   label: "Anthropic Claude", cat: "service", desc: "LLM da Anthropic — geração, análise e agentes"                },
  { id: "svc-doutor",   label: "DoutorSeguros API",cat: "service", desc: "API da operadora de seguros para cotações"                    },
  { id: "svc-nfse",     label: "NFSe API",         cat: "service", desc: "API para emissão de Notas Fiscais de Serviço Eletrônicas"     },
  { id: "svc-cnpj",     label: "CNPJ.ws",          cat: "service", desc: "API de consulta de dados empresariais por CNPJ"               },
  { id: "svc-vercel",   label: "Vercel",            cat: "service", desc: "Plataforma de deploy para apps Next.js e frontends estáticos" },
  { id: "svc-stripe",   label: "Stripe",            cat: "service", desc: "Gateway de pagamentos — assinaturas e cobranças"              },
  { id: "svc-docker",   label: "Docker / Compose",  cat: "service", desc: "Containerização e orquestração local de serviços"            },
];

// Edges: repo → service (repo "usa" o serviço)
const SERVICE_EDGES = [
  // PostgreSQL
  { s: "second-brain-hub",   t: "svc-postgres", desc: "armazena repos, decisões e embeddings"    },
  { s: "fluxionai",          t: "svc-postgres", desc: "persistência de agentes e histórico"       },
  { s: "fluxiom-crm",        t: "svc-postgres", desc: "CRM e pipeline de vendas"                 },
  { s: "garimpo",            t: "svc-postgres", desc: "índice de dados garimpados"                },
  { s: "cotacao-crm",        t: "svc-postgres", desc: "cotações e leads"                          },
  { s: "innove-ledger",      t: "svc-postgres", desc: "transações financeiras"                    },
  { s: "faturamento",        t: "svc-postgres", desc: "faturamento e notas"                       },
  { s: "associacoes",        t: "svc-postgres", desc: "cadastro de associados"                    },
  { s: "sistemainterno",     t: "svc-postgres", desc: "dados internos da empresa"                 },
  { s: "autoconect-oficial", t: "svc-postgres", desc: "dados de conexão automática"               },
  // Redis
  { s: "second-brain-hub",   t: "svc-redis",    desc: "cache de queries e sessões"               },
  { s: "fluxionai",          t: "svc-redis",    desc: "filas de jobs e cache de contexto"        },
  { s: "garimpo",            t: "svc-redis",    desc: "cache de resultados de busca"             },
  { s: "n8n",                t: "svc-redis",    desc: "estado de workflows e filas"              },
  // Qdrant
  { s: "second-brain-hub",   t: "svc-qdrant",   desc: "busca semântica em código indexado"       },
  { s: "fluxionai",          t: "svc-qdrant",   desc: "memória vetorial dos agentes"             },
  { s: "garimpo",            t: "svc-qdrant",   desc: "similaridade semântica de dados"          },
  // Supabase
  { s: "cotacao-crm",        t: "svc-supabase", desc: "auth e realtime de cotações"              },
  { s: "valorize",           t: "svc-supabase", desc: "backend-as-a-service"                     },
  { s: "mind-growth",        t: "svc-supabase", desc: "persistência e auth"                      },
  // GitHub API
  { s: "github-connector",   t: "svc-github",   desc: "webhook e leitura de repos"               },
  { s: "second-brain-hub",   t: "svc-github",   desc: "indexação de PRs e commits"               },
  { s: "criacao-projetos",   t: "svc-github",   desc: "criação de repos via API"                 },
  { s: "bugs",               t: "svc-github",   desc: "sincronização de issues"                  },
  // Anthropic Claude
  { s: "fluxionai",          t: "svc-claude",   desc: "motor de IA dos agentes"                  },
  { s: "second-brain-hub",   t: "svc-claude",   desc: "análise e resumo de código"               },
  { s: "cotacao-crm",        t: "svc-claude",   desc: "recomendação inteligente de planos"       },
  // Externos específicos
  { s: "webhook-doutor",     t: "svc-doutor",   desc: "recebe eventos do DoutorSeguros"          },
  { s: "cotacao-crm",        t: "svc-doutor",   desc: "cotações direto na operadora"             },
  { s: "nfse-proxy",         t: "svc-nfse",     desc: "emissão de notas fiscais"                 },
  { s: "cotacao-crm",        t: "svc-cnpj",     desc: "consulta dados da empresa do cliente"     },
  { s: "fluxiom-crm",        t: "svc-cnpj",     desc: "validação de CNPJ no cadastro"            },
  // Vercel
  { s: "cotacao-crm",        t: "svc-vercel",   desc: "deploy do frontend React"                 },
  { s: "pixel-perfect",      t: "svc-vercel",   desc: "deploy do clone pixel-perfect"            },
  { s: "valorize",           t: "svc-vercel",   desc: "deploy"                                   },
  { s: "mind-growth",        t: "svc-vercel",   desc: "deploy"                                   },
  { s: "designertools",      t: "svc-vercel",   desc: "deploy de ferramentas"                    },
  // Stripe
  { s: "innove-ledger",      t: "svc-stripe",   desc: "cobranças e assinaturas"                  },
  { s: "faturamento",        t: "svc-stripe",   desc: "pagamentos de associados"                 },
  { s: "fluxiom-crm",        t: "svc-stripe",   desc: "billing do CRM"                           },
  // Docker
  { s: "second-brain-hub",   t: "svc-docker",   desc: "compose: api + dashboard + dbs"           },
  { s: "fluxionai",          t: "svc-docker",   desc: "containers de agentes"                    },
  { s: "garimpo",            t: "svc-docker",   desc: "ambiente isolado de indexação"            },
  { s: "n8n",                t: "svc-docker",   desc: "n8n self-hosted em container"             },
];

// ─── Merged datasets ──────────────────────────────────────────────────────────
const ALL_NODES = [...REPO_NODES, ...SERVICE_NODES];
const ALL_EDGES = [...REPO_EDGES, ...SERVICE_EDGES];

// ─── Selection detail ─────────────────────────────────────────────────────────
interface SelRepo {
  id:        string;
  label:     string;
  cat:       string;
  desc:      string;
  dependsOn: string[];
  usedBy:    string[];
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────
function RepoSidebar({ node, onClose }: { node: SelRepo; onClose: () => void }) {
  const accent = CATS[node.cat]?.color ?? "#5a7a9a";

  return (
    <div
      style={{
        position:      "absolute",
        top: 0, right: 0, bottom: 0,
        width:         300,
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
      <div style={{ height: 1, background: `linear-gradient(90deg, transparent, ${accent}88, transparent)` }} />

      {/* Header */}
      <div style={{ padding: "1rem", borderBottom: `1px solid ${accent}18`, display: "flex", alignItems: "flex-start", gap: "0.5rem" }}>
        <div style={{ width: 36, height: 36, borderRadius: 8, background: `${accent}12`, border: `1px solid ${accent}33`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2 }}>
          <GitBranch size={16} color={accent} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: "0.72rem", color: accent, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "0.2rem" }}>
            {CATS[node.cat]?.label}
          </div>
          <div style={{ fontFamily: "var(--mono)", fontSize: "0.88rem", fontWeight: 700, color: "var(--text)", wordBreak: "break-all", lineHeight: 1.3, textShadow: `0 0 10px ${accent}44` }}>
            {node.label}
          </div>
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
        {/* Desc */}
        <p style={{ fontFamily: "var(--sans)", fontSize: "0.78rem", color: "var(--muted-foreground)", lineHeight: 1.6, margin: 0 }}>
          {node.desc}
        </p>

        {/* Depende de */}
        {node.dependsOn.length > 0 && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.5rem" }}>
              <ArrowRight size={11} color="var(--cyan)" />
              <span style={{ fontFamily: "var(--mono)", fontSize: "0.72rem", color: "var(--dim)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                depende de ({node.dependsOn.length})
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
              {node.dependsOn.map((dep) => {
                const edge = ALL_EDGES.find(e => e.s === node.id && ALL_NODES.find(n => n.id === e.t)?.label === dep);
                const tgt  = REPO_NODES.find(n => n.label === dep);
                const c    = CATS[tgt?.cat ?? "tooling"]?.color ?? "#5a7a9a";
                return (
                  <div key={dep} style={{ display: "flex", flexDirection: "column", gap: 2, padding: "4px 8px", background: "var(--bg-panel)", borderRadius: 4 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ width: 5, height: 5, borderRadius: "50%", background: c, flexShrink: 0 }} />
                      <span style={{ fontFamily: "var(--mono)", fontSize: "0.75rem", color: "var(--text)" }}>{dep}</span>
                    </div>
                    {edge?.desc && (
                      <span style={{ fontFamily: "var(--sans)", fontSize: "0.68rem", color: "var(--muted-foreground)", paddingLeft: 11 }}>{edge.desc}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Usado por */}
        {node.usedBy.length > 0 && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.5rem" }}>
              <GitBranch size={11} color="#a78bfa" />
              <span style={{ fontFamily: "var(--mono)", fontSize: "0.72rem", color: "var(--dim)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                usado por ({node.usedBy.length})
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
              {node.usedBy.map((dep) => {
                const src = ALL_NODES.find(n => n.label === dep);
                const c   = CATS[src?.cat ?? "tooling"]?.color ?? "#5a7a9a";
                return (
                  <div key={dep} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 8px", background: "var(--bg-panel)", borderRadius: 4 }}>
                    <div style={{ width: 5, height: 5, borderRadius: "50%", background: c, flexShrink: 0 }} />
                    <span style={{ fontFamily: "var(--mono)", fontSize: "0.75rem", color: "var(--text)" }}>{dep}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

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
  const [selNode,      setSelNode]      = useState<SelRepo | null>(null);

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

        // ── G6 nodes ──────────────────────────────────────────────────────────
        const gNodes = ALL_NODES.map((n) => {
          const color = CATS[n.cat]?.color ?? "#5a7a9a";
          const d     = deg[n.id] ?? 0;
          const size  = 24 + (d / maxDeg) * 26;
          const isHub = d >= 4;
          const isSvc = n.cat === "service";
          const name  = n.label.length > 20 ? n.label.slice(0, 19) + "…" : n.label;
          const icon  = isSvc ? "◆" : "⬡";

          return {
            id:    n.id,
            style: {
              size,
              fill:             isSvc ? `${color}18` : isHub ? `${color}0d` : `${color}0a`,
              stroke:           color,
              lineWidth:        isSvc ? 2 : isHub ? 2.5 : 1.5,
              shadowColor:      color,
              shadowBlur:       isSvc ? 16 : isHub ? 20 : 10,
              label:            isHub || isSvc || d >= 2,
              labelText:        name,
              labelFill:        isHub || isSvc ? color : "#94a3b8",
              labelFontFamily:  "'Fira Code', monospace",
              labelFontSize:    isHub ? 11 : 9,
              labelMaxWidth:    160,
              labelOffsetY:     6,
              labelWordWrap:    false,
              labelBackground:        true,
              labelBackgroundFill:    "rgba(2,6,23,0.85)",
              labelBackgroundRadius:  3,
              labelBackgroundPadding: [2, 7, 2, 7] as [number,number,number,number],
              iconText:         icon,
              iconFill:         color,
              iconFontSize:     isHub ? 13 : 10,
              iconFontFamily:   "'Fira Code', monospace",
            },
            data: { cat: n.cat, label: n.label, desc: n.desc, degree: d },
          };
        });

        // ── G6 edges ──────────────────────────────────────────────────────────
        const gEdges = ALL_EDGES.map((e, i) => {
          const src   = ALL_NODES.find((n) => n.id === e.s);
          const color = CATS[src?.cat ?? "tooling"]?.color ?? "#5a7a9a";
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
            nodeSize:                   50,
            unitRadius:                 155,
            linkDistance:               300,
            preventOverlap:             true,
            maxPreventOverlapIteration: 200,
            sortBy:                     "cat",
            sortStrength:               45,
          },

          node: {
            type:  "circle",
            state: {
              active:   { label: true, lineWidth: 3,   shadowBlur: 28, zIndex: 100 },
              selected: { label: true, lineWidth: 3,   shadowBlur: 32, stroke: "#fbbf24", shadowColor: "#fbbf24", zIndex: 100 },
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

        // ── Click → sidebar ───────────────────────────────────────────────────
        graph.on("node:click", (evt: unknown) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const e      = evt as any;
          const nodeId = e?.target?.id ?? e?.itemId;
          if (!nodeId) return;
          const node = ALL_NODES.find((n) => n.id === nodeId);
          if (!node) return;
          setSelNode({
            id:        nodeId,
            label:     node.label,
            cat:       node.cat,
            desc:      node.desc,
            dependsOn: ALL_EDGES.filter((ed) => ed.s === nodeId).map((ed) => ALL_NODES.find((n) => n.id === ed.t)?.label ?? ed.t),
            usedBy:    ALL_EDGES.filter((ed) => ed.t === nodeId).map((ed) => ALL_NODES.find((n) => n.id === ed.s)?.label ?? ed.s),
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
      {/* Grid */}
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
        <div style={{ position: "absolute", top: 12, right: selNode ? 312 : 12, display: "flex", flexDirection: "column", gap: 6, zIndex: 20, transition: "right 200ms ease" }}>
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

      {/* Contador */}
      {ready && (
        <div style={{ position: "absolute", top: 12, left: 12, display: "flex", gap: "0.5rem", zIndex: 20 }}>
          {[
            { label: `${REPO_NODES.length} repos`,      color: "#06b6d4" },
            { label: `${SERVICE_NODES.length} serviços`, color: "#34d399" },
            { label: `${ALL_EDGES.length} conexões`,     color: "#22c55e" },
          ].map(({ label, color }) => (
            <span key={label} style={{ fontFamily: "var(--mono)", fontSize: "0.7rem", color, background: `${color}11`, border: `1px solid ${color}33`, borderRadius: "var(--r)", padding: "0.2rem 0.65rem", letterSpacing: "0.06em" }}>
              {label}
            </span>
          ))}
        </div>
      )}

      {/* G6 canvas */}
      <div ref={containerRef} style={{ position: "absolute", inset: 0, zIndex: 2 }} />

      {/* Sidebar */}
      {selNode && <RepoSidebar node={selNode} onClose={() => setSelNode(null)} />}
    </div>
  );
}
