"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Brain, Users, Clock, GitBranch, FileCode, Zap, Wifi, Terminal, ChevronDown, ChevronRight } from "lucide-react";
import type { Sessao, AfinidadeItem, MCPConn, SSHIdentity, SSHSession } from "@/app/cerebro/page";

const C = {
  bg:      "rgba(10,22,40,0.6)",
  border:  "#1a2840",
  cyan:    "#06b6d4",
  green:   "#22c55e",
  yellow:  "#eab308",
  purple:  "#a855f7",
  text:    "#e2e8f0",
  muted:   "#8ab4cc",
  dim:     "#4a6a8a",
  card:    "rgba(15,30,55,0.7)",
  active:  "rgba(6,182,212,0.08)",
};

function timeAgo(mins: number): string {
  if (mins < 60) return `${mins}min atrás`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h atrás`;
  return `${Math.floor(h / 24)}d atrás`;
}

function devColor(dev: string): string {
  const colors = [C.cyan, C.green, C.yellow, C.purple, "#f97316", "#ec4899"];
  let hash = 0;
  for (const c of dev) hash = (hash * 31 + c.charCodeAt(0)) & 0xffffffff;
  return colors[Math.abs(hash) % colors.length];
}

function Avatar({ name }: { name: string }) {
  const color = devColor(name);
  const initials = name.slice(0, 2).toUpperCase();
  return (
    <div style={{
      width: 28, height: 28, borderRadius: "50%",
      background: `${color}22`, border: `1px solid ${color}66`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "var(--mono)", fontSize: "0.65rem", fontWeight: 700,
      color, flexShrink: 0,
    }}>
      {initials}
    </div>
  );
}

function SessaoCard({ s }: { s: Sessao }) {
  const isRecent = s.minutos_atras < 60;
  return (
    <div style={{
      background: C.card, border: `1px solid ${isRecent ? C.cyan + "33" : C.border}`,
      borderRadius: 8, padding: "0.9rem 1rem",
      display: "flex", flexDirection: "column", gap: "0.5rem",
      transition: "border-color 200ms",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
        <Avatar name={s.dev} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ fontFamily: "var(--mono)", fontSize: "0.82rem", fontWeight: 600, color: devColor(s.dev) }}>
              {s.dev}
            </span>
            {isRecent && (
              <span style={{
                background: `${C.green}22`, border: `1px solid ${C.green}44`,
                color: C.green, borderRadius: 4, padding: "0px 6px",
                fontFamily: "var(--mono)", fontSize: "0.62rem", letterSpacing: "0.08em",
              }}>ATIVO</span>
            )}
          </div>
          <div style={{ fontFamily: "var(--sans)", fontSize: "0.75rem", color: C.muted }}>
            {s.projeto}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.3rem", color: C.dim, flexShrink: 0 }}>
          <Clock size={11} />
          <span style={{ fontFamily: "var(--mono)", fontSize: "0.7rem" }}>{timeAgo(s.minutos_atras)}</span>
        </div>
      </div>

      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
        {s.branch && (
          <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
            <GitBranch size={11} color={C.cyan} />
            <span style={{ fontFamily: "var(--mono)", fontSize: "0.72rem", color: C.cyan }}>{s.branch}</span>
          </div>
        )}
        {s.ultimo_commit && (
          <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
            <Zap size={11} color={C.yellow} />
            <span style={{ fontFamily: "var(--mono)", fontSize: "0.72rem", color: C.yellow }}>
              {s.ultimo_commit.slice(0, 40)}
            </span>
          </div>
        )}
      </div>

      {s.arquivos && s.arquivos.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" }}>
          <FileCode size={11} color={C.dim} />
          {s.arquivos.slice(0, 4).map((f, i) => (
            <span key={i} style={{
              background: "rgba(255,255,255,0.04)", border: `1px solid ${C.border}`,
              borderRadius: 4, padding: "0px 6px",
              fontFamily: "var(--mono)", fontSize: "0.67rem", color: C.muted,
            }}>{f.split("/").pop()}</span>
          ))}
          {s.arquivos.length > 4 && (
            <span style={{ fontFamily: "var(--mono)", fontSize: "0.67rem", color: C.dim }}>
              +{s.arquivos.length - 4}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function AfinidadeTable({ afinidade }: { afinidade: AfinidadeItem[] }) {
  // Agrupa por dev
  const devs = [...new Set(afinidade.map(a => a.dev))];
  const projetos = [...new Set(afinidade.map(a => a.projeto))].slice(0, 12);
  const scoreMap = new Map(afinidade.map(a => [`${a.dev}|${a.projeto}`, a.score]));
  const maxScore = Math.max(...afinidade.map(a => a.score), 1);

  if (devs.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "3rem", color: C.dim, fontFamily: "var(--mono)", fontSize: "0.8rem" }}>
        Nenhum sinal de atividade registrado ainda.
        <br />
        <span style={{ fontSize: "0.72rem", opacity: 0.6 }}>Os dados aparecem após sessões de trabalho nos projetos.</span>
      </div>
    );
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--mono)", fontSize: "0.72rem" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", padding: "0.5rem 0.75rem", color: C.dim, borderBottom: `1px solid ${C.border}`, fontWeight: 400 }}>
              Dev
            </th>
            {projetos.map(p => (
              <th key={p} style={{
                textAlign: "center", padding: "0.5rem 0.5rem",
                color: C.muted, borderBottom: `1px solid ${C.border}`,
                fontWeight: 400, maxWidth: 80, overflow: "hidden",
              }}>
                <span style={{ display: "block", transform: "rotate(-30deg)", transformOrigin: "bottom left", whiteSpace: "nowrap", marginLeft: 16 }}>
                  {p.split("/")[1] ?? p}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {devs.map((dev, di) => (
            <tr key={dev} style={{ background: di % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)" }}>
              <td style={{ padding: "0.4rem 0.75rem", color: devColor(dev), borderBottom: `1px solid ${C.border}22`, whiteSpace: "nowrap" }}>
                {dev}
              </td>
              {projetos.map(proj => {
                const score = scoreMap.get(`${dev}|${proj}`) ?? 0;
                const pct = score / maxScore;
                return (
                  <td key={proj} style={{ textAlign: "center", padding: "0.4rem 0.5rem", borderBottom: `1px solid ${C.border}22` }}>
                    {score > 0 ? (
                      <div style={{
                        display: "inline-block",
                        background: `rgba(6,182,212,${0.1 + pct * 0.7})`,
                        border: `1px solid rgba(6,182,212,${0.2 + pct * 0.5})`,
                        borderRadius: 4, padding: "2px 6px",
                        color: `rgba(${pct > 0.5 ? "224,242,254" : "139,180,204"},1)`,
                        minWidth: 32,
                      }}>
                        {score}
                      </div>
                    ) : (
                      <span style={{ color: C.dim, opacity: 0.3 }}>—</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MCPConnCard({ c }: { c: MCPConn }) {
  return (
    <div style={{
      background: C.card, border: `1px solid ${c.ativo ? C.cyan + "33" : C.border}`,
      borderRadius: 8, padding: "0.75rem 1rem",
      display: "flex", alignItems: "center", gap: "0.75rem",
    }}>
      <Wifi size={14} color={c.ativo ? C.cyan : C.dim} style={{ flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span style={{ fontFamily: "var(--mono)", fontSize: "0.8rem", fontWeight: 600, color: c.ativo ? C.cyan : C.muted }}>
            {c.machine || c.client_ip}
          </span>
          {c.ativo && (
            <span style={{
              background: `${C.green}22`, border: `1px solid ${C.green}44`,
              color: C.green, borderRadius: 4, padding: "0px 6px",
              fontFamily: "var(--mono)", fontSize: "0.62rem", letterSpacing: "0.08em",
            }}>ATIVO</span>
          )}
        </div>
        <div style={{ fontFamily: "var(--mono)", fontSize: "0.7rem", color: C.dim, marginTop: 2 }}>
          {c.client_ip}
          {c.client_name && <span style={{ marginLeft: "0.5rem", opacity: 0.6 }}>· {c.client_name.slice(0, 60)}</span>}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "0.3rem", color: C.dim, flexShrink: 0 }}>
        <Clock size={11} />
        <span style={{ fontFamily: "var(--mono)", fontSize: "0.7rem" }}>{timeAgo(c.minutos_atras)}</span>
      </div>
    </div>
  );
}

function fmtTokens(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function CtxBar({ pct }: { pct: number | null }) {
  if (pct == null) return <span style={{ color: C.dim, fontFamily: "var(--mono)", fontSize: "0.7rem" }}>—</span>;
  const filled = Math.round((pct / 100) * 10);
  const bar = "▓".repeat(filled) + "░".repeat(10 - filled);
  const color = pct > 80 ? "#ef4444" : pct > 60 ? "#eab308" : C.green;
  return (
    <span style={{ fontFamily: "var(--mono)", fontSize: "0.7rem", color }}>
      ctx {pct}% {bar}
    </span>
  );
}

function StatusLine({ s }: { s: Pick<SSHSession, "ctx_pct" | "tokens_total" | "turns" | "model" | "account_name" | "plan"> }) {
  const modelLabel = s.model
    ? s.model.includes("opus") ? "⚠ opus" : s.model.includes("sonnet") ? "sonnet" : s.model.includes("haiku") ? "haiku" : s.model
    : null;
  const modelColor = s.model?.includes("opus") ? "#ef4444" : s.model?.includes("sonnet") ? C.green : C.cyan;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.4rem" }}>
      <CtxBar pct={s.ctx_pct} />
      <span style={{ color: C.dim, fontFamily: "var(--mono)", fontSize: "0.7rem" }}>
        🔢 {fmtTokens(s.tokens_total)}
      </span>
      {s.turns != null && (
        <span style={{ color: C.muted, fontFamily: "var(--mono)", fontSize: "0.7rem" }}>
          turns {s.turns}
        </span>
      )}
      {modelLabel && (
        <span style={{ fontFamily: "var(--mono)", fontSize: "0.7rem", color: modelColor }}>
          {modelLabel}
        </span>
      )}
      {s.account_name && (
        <span style={{ fontFamily: "var(--mono)", fontSize: "0.7rem", color: C.cyan }}>
          ● conta
        </span>
      )}
      {(s.account_name || s.plan) && (
        <span style={{ fontFamily: "var(--mono)", fontSize: "0.7rem", color: C.cyan }}>
          {[s.account_name, s.plan].filter(Boolean).join(" · ")}
        </span>
      )}
    </div>
  );
}

function SSHSessionRow({ s }: { s: SSHSession }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.02)", border: `1px solid ${C.border}`,
      borderRadius: 6, padding: "0.6rem 0.85rem",
      display: "flex", flexDirection: "column", gap: "0.25rem",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
        <span style={{ fontFamily: "var(--mono)", fontSize: "0.7rem", color: C.muted }}>
          {s.ssh_ip}:{s.ssh_port}
        </span>
        {s.projeto && (
          <span style={{ fontFamily: "var(--mono)", fontSize: "0.68rem", color: C.cyan }}>
            {s.projeto}
          </span>
        )}
        <span style={{ fontFamily: "var(--mono)", fontSize: "0.67rem", color: C.dim, marginLeft: "auto" }}>
          {s.updated_at ? new Date(s.updated_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : ""}
        </span>
      </div>
      <StatusLine s={s} />
    </div>
  );
}

function SSHIdentityCard({ id }: { id: SSHIdentity }) {
  const [expanded, setExpanded] = useState(false);
  const expiresDate = new Date(id.expires_at);
  const now = new Date();
  const minutesLeft = Math.round((expiresDate.getTime() - now.getTime()) / 60000);
  const hoursLeft = Math.floor(minutesLeft / 60);
  const timeLeft = hoursLeft > 0 ? `${hoursLeft}h restantes` : `${minutesLeft}min restantes`;

  return (
    <div style={{
      background: C.card, border: `1px solid ${C.green}33`,
      borderRadius: 8, overflow: "hidden",
      transition: "border-color 150ms",
    }}>
      {/* Header — clicável */}
      <div
        onClick={() => setExpanded(e => !e)}
        style={{
          padding: "0.75rem 1rem", cursor: "pointer",
          display: "flex", alignItems: "center", gap: "0.75rem",
          userSelect: "none",
        }}
      >
        <Terminal size={14} color={C.green} style={{ flexShrink: 0 }} />
        <Avatar name={id.dev} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ fontFamily: "var(--mono)", fontSize: "0.8rem", fontWeight: 600, color: devColor(id.dev) }}>
              {id.dev}
            </span>
            <span style={{
              background: `${C.green}22`, border: `1px solid ${C.green}44`,
              color: C.green, borderRadius: 4, padding: "0px 6px",
              fontFamily: "var(--mono)", fontSize: "0.62rem", letterSpacing: "0.08em",
            }}>ATIVO</span>
            {id.sessoes > 1 && (
              <span style={{
                background: `${C.cyan}15`, border: `1px solid ${C.cyan}33`,
                color: C.cyan, borderRadius: 4, padding: "0px 6px",
                fontFamily: "var(--mono)", fontSize: "0.62rem",
              }}>{id.sessoes} sessões</span>
            )}
          </div>
          {/* Statusline compacta no header */}
          <StatusLine s={id} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.3rem", color: C.dim }}>
            <Clock size={11} />
            <span style={{ fontFamily: "var(--mono)", fontSize: "0.7rem" }}>{timeLeft}</span>
          </div>
          {expanded
            ? <ChevronDown size={13} color={C.dim} />
            : <ChevronRight size={13} color={C.dim} />
          }
        </div>
      </div>

      {/* Sessões expandidas */}
      {expanded && id.sessions.length > 0 && (
        <div style={{
          borderTop: `1px solid ${C.border}`,
          padding: "0.75rem 1rem",
          display: "flex", flexDirection: "column", gap: "0.5rem",
          background: "rgba(0,0,0,0.15)",
        }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: "0.67rem", color: C.dim, letterSpacing: "0.08em", marginBottom: "0.15rem" }}>
            SESSÕES ATIVAS ({id.sessions.length})
          </div>
          {id.sessions.map((s, i) => (
            <SSHSessionRow key={i} s={s} />
          ))}
        </div>
      )}
    </div>
  );
}

export function CerebroClient({ sessoes, afinidade, mcpConns, sshIdentities }: { sessoes: Sessao[]; afinidade: AfinidadeItem[]; mcpConns: MCPConn[]; sshIdentities: SSHIdentity[] }) {
  const [tab, setTab] = useState<"sessoes" | "afinidade" | "mcp" | "ssh">("sessoes");
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => router.refresh(), 30_000);
    return () => clearInterval(id);
  }, [router]);

  const recentSessoes = sessoes.filter(s => s.minutos_atras < 60);
  const activeMCP = mcpConns.filter(c => c.ativo);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Stats rápidas */}
      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
        {[
          { label: "Sessões registradas", value: sessoes.length, icon: <Brain size={14} />, color: C.cyan },
          { label: "Devs ativos (1h)", value: recentSessoes.length, icon: <Users size={14} />, color: C.green },
          { label: "Projetos com atividade", value: [...new Set(sessoes.map(s => s.projeto))].length, icon: <FileCode size={14} />, color: C.yellow },
          { label: "Clientes MCP", value: activeMCP.length, icon: <Wifi size={14} />, color: C.purple },
          { label: "Devs via SSH", value: sshIdentities.length, icon: <Terminal size={14} />, color: C.green },
        ].map(({ label, value, icon, color }) => (
          <div key={label} style={{
            flex: "1 1 160px", background: C.card, border: `1px solid ${C.border}`,
            borderRadius: 8, padding: "0.85rem 1rem",
            display: "flex", alignItems: "center", gap: "0.75rem",
          }}>
            <div style={{ color, opacity: 0.8 }}>{icon}</div>
            <div>
              <div style={{ fontFamily: "var(--mono)", fontSize: "1.3rem", fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
              <div style={{ fontFamily: "var(--sans)", fontSize: "0.72rem", color: C.muted, marginTop: 3 }}>{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: "0.25rem", borderBottom: `1px solid ${C.border}`, paddingBottom: "0" }}>
        {(["sessoes", "afinidade", "mcp", "ssh"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              background: tab === t ? C.active : "transparent",
              border: "none", borderBottom: `2px solid ${tab === t ? C.cyan : "transparent"}`,
              color: tab === t ? C.cyan : C.muted,
              padding: "0.55rem 1rem", cursor: "pointer",
              fontFamily: "var(--mono)", fontSize: "0.78rem",
              letterSpacing: "0.05em", transition: "all 150ms",
            }}
          >
            {t === "sessoes" ? "Sessões" : t === "afinidade" ? "Afinidade" : t === "mcp" ? `MCP (${activeMCP.length})` : `SSH (${sshIdentities.length})`}
          </button>
        ))}
      </div>

      {/* Conteúdo */}
      {tab === "sessoes" && (
        <div>
          {sessoes.length === 0 ? (
            <div style={{ textAlign: "center", padding: "3rem", color: C.dim, fontFamily: "var(--mono)", fontSize: "0.8rem" }}>
              Nenhuma sessão registrada ainda.
              <br />
              <span style={{ fontSize: "0.72rem", opacity: 0.6 }}>Sessões aparecem quando devs usam Claude Code nos projetos.</span>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
              {sessoes.map((s, i) => <SessaoCard key={i} s={s} />)}
            </div>
          )}
        </div>
      )}

      {tab === "afinidade" && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
          <div style={{ padding: "0.85rem 1rem", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Users size={13} color={C.cyan} />
            <span style={{ fontFamily: "var(--mono)", fontSize: "0.78rem", color: C.text }}>Afinidade dev × projeto (últimos 30 dias)</span>
            <span style={{ fontFamily: "var(--mono)", fontSize: "0.68rem", color: C.dim, marginLeft: "auto" }}>score ponderado por recência</span>
          </div>
          <div style={{ padding: "1rem" }}>
            <AfinidadeTable afinidade={afinidade} />
          </div>
        </div>
      )}

      {tab === "mcp" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
          {mcpConns.length === 0 ? (
            <div style={{ textAlign: "center", padding: "3rem", color: C.dim, fontFamily: "var(--mono)", fontSize: "0.8rem" }}>
              Nenhum cliente MCP conectado nas últimas 24h.
              <br />
              <span style={{ fontSize: "0.72rem", opacity: 0.6 }}>
                Rode o bootstrap para conectar: <code>claude mcp add --transport sse second-brain-hub http://hub.fluxiom.com.br:8020/sse</code>
              </span>
            </div>
          ) : (
            mcpConns.map((c, i) => <MCPConnCard key={i} c={c} />)
          )}
        </div>
      )}

      {tab === "ssh" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
          {sshIdentities.length === 0 ? (
            <div style={{ textAlign: "center", padding: "3rem", color: C.dim, fontFamily: "var(--mono)", fontSize: "0.8rem" }}>
              Nenhum dev identificado via SSH no momento.
              <br />
              <span style={{ fontSize: "0.72rem", opacity: 0.6 }}>Use <code>/s sbh-auth seu-nome</code> para se identificar.</span>
            </div>
          ) : (
            sshIdentities.map((id, i) => <SSHIdentityCard key={i} id={id} />)
          )}
        </div>
      )}
    </div>
  );
}
