"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Brain, Users, Clock, GitBranch, FileCode, Zap, Wifi, Terminal,
  ChevronDown, ChevronRight, GitCommit, AlertTriangle, Edit3, Cpu,
} from "lucide-react";
import type { Sessao, AfinidadeItem, MCPConn, SSHIdentity, SSHSession, Sinal, PadraoGlobal, ScorecardDev, Conflito } from "@/app/cerebro/page";

const C = {
  bg:      "rgba(10,22,40,0.6)",
  border:  "#1a2840",
  cyan:    "#06b6d4",
  green:   "#22c55e",
  yellow:  "#eab308",
  purple:  "#a855f7",
  orange:  "#f97316",
  red:     "#ef4444",
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

function timeAgoFromIso(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  return timeAgo(mins);
}

function devColor(dev: string): string {
  const colors = [C.cyan, C.green, C.yellow, C.purple, C.orange, "#ec4899"];
  let hash = 0;
  for (const c of dev) hash = (hash * 31 + c.charCodeAt(0)) & 0xffffffff;
  return colors[Math.abs(hash) % colors.length];
}

function Avatar({ name, size = 28 }: { name: string; size?: number }) {
  const color = devColor(name);
  const initials = name.slice(0, 2).toUpperCase();
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: `${color}22`, border: `1px solid ${color}66`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "var(--mono)", fontSize: size * 0.38 + "px", fontWeight: 700,
      color, flexShrink: 0,
    }}>
      {initials}
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
  const color = pct > 80 ? C.red : pct > 60 ? C.yellow : C.green;
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
  const modelColor = s.model?.includes("opus") ? C.red : s.model?.includes("sonnet") ? C.green : C.cyan;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.3rem" }}>
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
        <span style={{ fontFamily: "var(--mono)", fontSize: "0.7rem", color: modelColor }}>{modelLabel}</span>
      )}
      {(s.account_name || s.plan) && (
        <span style={{ fontFamily: "var(--mono)", fontSize: "0.7rem", color: C.cyan }}>
          {[s.account_name, s.plan].filter(Boolean).join(" · ")}
        </span>
      )}
    </div>
  );
}

// ── Ops Board ─────────────────────────────────────────────────────────────────

function CtxSemaforo({ pct }: { pct: number | null }) {
  if (pct == null) return null;
  const color = pct > 80 ? C.red : pct > 60 ? C.yellow : C.green;
  const pulse = pct > 80;
  return (
    <div style={{
      width: 10, height: 10, borderRadius: "50%",
      background: color,
      boxShadow: `0 0 ${pulse ? "8px" : "4px"} ${color}`,
      flexShrink: 0,
      animation: pulse ? "pulse-glow 1.2s ease-in-out infinite" : undefined,
    }} title={`ctx ${pct}%`} />
  );
}

function OpsCard({ identity, sessao }: { identity: SSHIdentity; sessao: Sessao | undefined }) {
  const [expanded, setExpanded] = useState(false);
  const expiresDate = new Date(identity.expires_at);
  const minutesLeft = Math.round((expiresDate.getTime() - Date.now()) / 60000);
  const hoursLeft = Math.floor(minutesLeft / 60);
  const timeLeft = hoursLeft > 0 ? `${hoursLeft}h restantes` : `${minutesLeft}min restantes`;

  const projeto = identity.sessions[0]?.projeto ?? sessao?.projeto ?? null;
  const branch = sessao?.branch;
  const ultimoCommit = sessao?.ultimo_commit;
  const arquivos = sessao?.arquivos ?? [];
  const minsSessao = sessao?.minutos_atras;

  return (
    <div style={{
      background: C.card, border: `1px solid ${C.green}33`,
      borderRadius: 8, overflow: "hidden",
    }}>
      <div
        onClick={() => setExpanded(e => !e)}
        style={{ padding: "0.85rem 1rem", cursor: "pointer", display: "flex", alignItems: "flex-start", gap: "0.75rem", userSelect: "none" }}
      >
        <CtxSemaforo pct={identity.ctx_pct} />
        <Terminal size={14} color={C.green} style={{ flexShrink: 0, marginTop: 3 }} />
        <Avatar name={identity.dev} size={32} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
            <span style={{ fontFamily: "var(--mono)", fontSize: "0.85rem", fontWeight: 700, color: devColor(identity.dev) }}>
              {identity.dev}
            </span>
            <span style={{
              background: `${C.green}22`, border: `1px solid ${C.green}44`,
              color: C.green, borderRadius: 4, padding: "0px 6px",
              fontFamily: "var(--mono)", fontSize: "0.6rem", letterSpacing: "0.08em",
            }}>ONLINE</span>
            {identity.sessoes > 1 && (
              <span style={{
                background: `${C.cyan}15`, border: `1px solid ${C.cyan}33`,
                color: C.cyan, borderRadius: 4, padding: "0px 6px",
                fontFamily: "var(--mono)", fontSize: "0.6rem",
              }}>{identity.sessoes}×</span>
            )}
            {projeto && (
              <span style={{ fontFamily: "var(--mono)", fontSize: "0.72rem", color: C.muted }}>
                {projeto.split("/").pop()}
              </span>
            )}
            {branch && (
              <span style={{ display: "flex", alignItems: "center", gap: 3, fontFamily: "var(--mono)", fontSize: "0.7rem", color: C.cyan }}>
                <GitBranch size={10} />{branch}
              </span>
            )}
          </div>

          <StatusLine s={identity} />

          {ultimoCommit && (
            <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", marginTop: "0.35rem" }}>
              <GitCommit size={10} color={C.yellow} />
              <span style={{ fontFamily: "var(--mono)", fontSize: "0.7rem", color: C.yellow }}>
                {ultimoCommit.split("(")[0].slice(0, 55)}
              </span>
              {minsSessao != null && (
                <span style={{ fontFamily: "var(--mono)", fontSize: "0.65rem", color: C.dim, marginLeft: "auto" }}>
                  {timeAgo(minsSessao)}
                </span>
              )}
            </div>
          )}

          {arquivos.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", flexWrap: "wrap", marginTop: "0.3rem" }}>
              <FileCode size={10} color={C.dim} />
              {arquivos.slice(0, 4).map((f, i) => (
                <span key={i} style={{
                  background: "rgba(255,255,255,0.04)", border: `1px solid ${C.border}`,
                  borderRadius: 4, padding: "0px 5px",
                  fontFamily: "var(--mono)", fontSize: "0.65rem", color: C.muted,
                }}>{f.split("/").pop()}</span>
              ))}
              {arquivos.length > 4 && <span style={{ fontFamily: "var(--mono)", fontSize: "0.65rem", color: C.dim }}>+{arquivos.length - 4}</span>}
            </div>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.3rem", color: C.dim }}>
            <Clock size={11} />
            <span style={{ fontFamily: "var(--mono)", fontSize: "0.68rem" }}>{timeLeft}</span>
          </div>
          <div style={{
            width: 20, height: 20, borderRadius: 4,
            background: expanded ? `${C.cyan}22` : "rgba(255,255,255,0.05)",
            border: `1px solid ${expanded ? C.cyan + "55" : "rgba(255,255,255,0.1)"}`,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {expanded ? <ChevronDown size={11} color={C.cyan} /> : <ChevronRight size={11} color={C.muted} />}
          </div>
        </div>
      </div>

      {expanded && identity.sessions.length > 0 && (
        <div style={{
          borderTop: `1px solid ${C.border}`, padding: "0.75rem 1rem",
          background: "rgba(0,0,0,0.15)", display: "flex", flexDirection: "column", gap: "0.4rem",
        }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: "0.65rem", color: C.dim, letterSpacing: "0.08em", marginBottom: "0.2rem" }}>
            SESSÕES ({identity.sessions.length})
          </div>
          {identity.sessions.map((s, i) => (
            <div key={i} style={{
              background: "rgba(255,255,255,0.02)", border: `1px solid ${C.border}`,
              borderRadius: 6, padding: "0.5rem 0.75rem",
              display: "flex", flexDirection: "column", gap: "0.2rem",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                <span style={{ fontFamily: "var(--mono)", fontSize: "0.68rem", color: C.muted }}>
                  {s.ssh_ip}:{s.ssh_port}
                </span>
                {s.machine_hostname && (
                  <span style={{ fontFamily: "var(--mono)", fontSize: "0.67rem", color: C.purple }}>
                    → {s.machine_hostname}
                  </span>
                )}
                {s.projeto && (
                  <span style={{ fontFamily: "var(--mono)", fontSize: "0.67rem", color: C.cyan }}>{s.projeto}</span>
                )}
                <span style={{ fontFamily: "var(--mono)", fontSize: "0.65rem", color: C.dim, marginLeft: "auto" }}>
                  {s.updated_at ? new Date(s.updated_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—"}
                </span>
              </div>
              <StatusLine s={s} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Feed de sinais ─────────────────────────────────────────────────────────────

const SINAL_ICONS: Record<string, React.ReactNode> = {
  commit_realizado: <GitCommit size={13} color="#22c55e" />,
  arquivo_editado:  <Edit3     size={13} color="#06b6d4" />,
  erro_bash:        <AlertTriangle size={13} color="#ef4444" />,
  skill_usada:      <Cpu size={13} color="#a855f7" />,
};

const SINAL_COLORS: Record<string, string> = {
  commit_realizado: C.green,
  arquivo_editado:  C.cyan,
  erro_bash:        C.red,
  skill_usada:      C.purple,
};

function sinalDesc(sinal: Sinal): string {
  const proj = sinal.projeto.split("/").pop() ?? sinal.projeto;
  switch (sinal.tipo) {
    case "commit_realizado": {
      const msg = (sinal.dados.msg as string) ?? "";
      const op  = (sinal.dados.tipo_operacao as string) ?? "commit";
      return `${op === "push" ? "fez push" : "commitou"} "${msg.slice(0, 45)}" em ${proj}`;
    }
    case "arquivo_editado": {
      const f = (sinal.dados.arquivo as string) ?? "";
      return `editou ${f.split("/").pop() ?? f} em ${proj}`;
    }
    case "erro_bash": {
      const cmd = (sinal.dados.cmd_decoded as string) ?? (sinal.dados.cmd as string) ?? "?";
      return `erro em ${cmd.slice(0, 40)} (${proj})`;
    }
    case "skill_usada": {
      const skill = (sinal.dados.skill as string) ?? "?";
      return `usou /${skill} em ${proj}`;
    }
    default:
      return `${sinal.tipo} em ${proj}`;
  }
}

function FeedItem({ sinal }: { sinal: Sinal }) {
  const icon  = SINAL_ICONS[sinal.tipo]  ?? <Zap size={13} color={C.muted} />;
  const color = SINAL_COLORS[sinal.tipo] ?? C.muted;

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: "0.7rem",
      padding: "0.55rem 0.75rem",
      borderBottom: `1px solid ${C.border}22`,
    }}>
      <div style={{ flexShrink: 0 }}>{icon}</div>
      <Avatar name={sinal.dev} size={22} />
      <span style={{ fontFamily: "var(--mono)", fontSize: "0.72rem", fontWeight: 600, color: devColor(sinal.dev), flexShrink: 0 }}>
        {sinal.dev}
      </span>
      <span style={{ fontFamily: "var(--mono)", fontSize: "0.72rem", color, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {sinalDesc(sinal)}
      </span>
      <span style={{ fontFamily: "var(--mono)", fontSize: "0.65rem", color: C.dim, flexShrink: 0 }}>
        {timeAgoFromIso(sinal.ts)}
      </span>
    </div>
  );
}

// ── Padrões ───────────────────────────────────────────────────────────────────

function PadroesTable({ padroes }: { padroes: PadraoGlobal[] }) {
  if (padroes.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "3rem", color: C.dim, fontFamily: "var(--mono)", fontSize: "0.8rem" }}>
        Nenhum padrão de erro registrado (últimos 7 dias).
        <br />
        <span style={{ fontSize: "0.72rem", opacity: 0.6 }}>Erros de bash aparecem aqui quando ocorrem 2+ vezes no mesmo projeto.</span>
      </div>
    );
  }
  const max = Math.max(...padroes.map(p => p.ocorrencias), 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem", padding: "0.75rem" }}>
      {padroes.map((p, i) => (
        <div key={i} style={{
          display: "flex", alignItems: "center", gap: "0.75rem",
          padding: "0.55rem 0.85rem",
          background: "rgba(239,68,68,0.04)", border: `1px solid rgba(239,68,68,0.12)`,
          borderRadius: 6,
        }}>
          <AlertTriangle size={12} color={C.red} style={{ flexShrink: 0 }} />
          <span style={{ fontFamily: "var(--mono)", fontSize: "0.75rem", fontWeight: 600, color: C.red, minWidth: 120 }}>
            {p.comando}
          </span>
          <div style={{ flex: 1, height: 4, background: "rgba(255,255,255,0.05)", borderRadius: 2, overflow: "hidden" }}>
            <div style={{
              height: "100%", borderRadius: 2,
              width: `${(p.ocorrencias / max) * 100}%`,
              background: `rgba(239,68,68,${0.3 + (p.ocorrencias / max) * 0.6})`,
            }} />
          </div>
          <span style={{ fontFamily: "var(--mono)", fontSize: "0.72rem", color: C.red, minWidth: 30, textAlign: "right" }}>
            {p.ocorrencias}×
          </span>
          <span style={{ fontFamily: "var(--mono)", fontSize: "0.68rem", color: C.dim, minWidth: 100 }}>
            {p.projeto.split("/").pop()}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Afinidade ─────────────────────────────────────────────────────────────────

function AfinidadeTable({ afinidade }: { afinidade: AfinidadeItem[] }) {
  const devs = [...new Set(afinidade.map(a => a.dev))];
  const projetos = [...new Set(afinidade.map(a => a.projeto))].slice(0, 12);
  const scoreMap = new Map(afinidade.map(a => [`${a.dev}|${a.projeto}`, a.score]));
  const maxScore = Math.max(...afinidade.map(a => a.score), 1);

  if (devs.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "3rem", color: C.dim, fontFamily: "var(--mono)", fontSize: "0.8rem" }}>
        Nenhum sinal de atividade registrado ainda.
        <br />
        <span style={{ fontSize: "0.72rem", opacity: 0.6 }}>Dados aparecem após sessões de trabalho nos projetos.</span>
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
              <th key={p} style={{ textAlign: "center", padding: "0.5rem 0.5rem", color: C.muted, borderBottom: `1px solid ${C.border}`, fontWeight: 400, maxWidth: 80 }}>
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
                        color: `rgba(${pct > 0.5 ? "224,242,254" : "139,180,204"},1)`, minWidth: 32,
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

// ── MCP ───────────────────────────────────────────────────────────────────────

type SSHIdentityWithLocal = SSHIdentity & { _sessionsHere: SSHSession[] };

function MCPConnCard({ c, sshIdentities }: { c: MCPConn; sshIdentities: SSHIdentity[] }) {
  const [expanded, setExpanded] = useState(false);
  const devs: SSHIdentityWithLocal[] = sshIdentities
    .filter(id => id.sessions.some(s => s.machine_ip === c.client_ip))
    .map(id => ({ ...id, _sessionsHere: id.sessions.filter(s => s.machine_ip === c.client_ip) }));

  return (
    <div style={{ background: C.card, border: `1px solid ${c.ativo ? C.cyan + "33" : C.border}`, borderRadius: 8, overflow: "hidden" }}>
      <div
        onClick={() => devs.length > 0 && setExpanded(e => !e)}
        style={{ padding: "0.75rem 1rem", display: "flex", alignItems: "center", gap: "0.75rem", cursor: devs.length > 0 ? "pointer" : "default", userSelect: "none" }}
      >
        <Wifi size={14} color={c.ativo ? C.cyan : C.dim} style={{ flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
            <span style={{ fontFamily: "var(--mono)", fontSize: "0.8rem", fontWeight: 600, color: c.ativo ? C.cyan : C.muted }}>
              {c.machine || c.client_ip}
            </span>
            {c.ativo && (
              <span style={{ background: `${C.green}22`, border: `1px solid ${C.green}44`, color: C.green, borderRadius: 4, padding: "0px 6px", fontFamily: "var(--mono)", fontSize: "0.62rem", letterSpacing: "0.08em" }}>ATIVO</span>
            )}
            {devs.map(d => (
              <span key={d.dev} style={{ background: `${devColor(d.dev)}15`, border: `1px solid ${devColor(d.dev)}33`, color: devColor(d.dev), borderRadius: 4, padding: "0px 6px", fontFamily: "var(--mono)", fontSize: "0.62rem", display: "flex", alignItems: "center", gap: 3 }}>
                <Terminal size={9} />{d.dev}
                {d._sessionsHere.length > 1 && <span style={{ opacity: 0.7 }}>×{d._sessionsHere.length}</span>}
              </span>
            ))}
          </div>
          <div style={{ fontFamily: "var(--mono)", fontSize: "0.7rem", color: C.dim, marginTop: 2 }}>
            {c.client_ip}
            {c.client_name && <span style={{ marginLeft: "0.5rem", opacity: 0.6 }}>· {c.client_name.slice(0, 50)}</span>}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.3rem", color: C.dim }}>
            <Clock size={11} />
            <span style={{ fontFamily: "var(--mono)", fontSize: "0.7rem" }}>{timeAgo(c.minutos_atras)}</span>
          </div>
          {devs.length > 0 && (
            <div style={{ width: 20, height: 20, borderRadius: 4, background: expanded ? `${C.cyan}22` : "rgba(255,255,255,0.05)", border: `1px solid ${expanded ? C.cyan + "55" : "rgba(255,255,255,0.1)"}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {expanded ? <ChevronDown size={11} color={C.cyan} /> : <ChevronRight size={11} color={C.muted} />}
            </div>
          )}
        </div>
      </div>

      {expanded && devs.length > 0 && (
        <div style={{ borderTop: `1px solid ${C.border}`, background: "rgba(0,0,0,0.15)", padding: "0.75rem 1rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {devs.map(d => (
            <div key={d.dev}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.4rem" }}>
                <Avatar name={d.dev} />
                <span style={{ fontFamily: "var(--mono)", fontSize: "0.75rem", fontWeight: 600, color: devColor(d.dev) }}>{d.dev}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem", paddingLeft: "0.5rem" }}>
                {d._sessionsHere.map((s, i) => (
                  <div key={i} style={{ background: "rgba(255,255,255,0.02)", border: `1px solid ${C.border}`, borderRadius: 6, padding: "0.5rem 0.75rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                      <span style={{ fontFamily: "var(--mono)", fontSize: "0.68rem", color: C.muted }}>{s.ssh_ip}:{s.ssh_port}</span>
                      {s.machine_hostname && <span style={{ fontFamily: "var(--mono)", fontSize: "0.67rem", color: C.purple }}>→ {s.machine_hostname}</span>}
                      {s.projeto && <span style={{ fontFamily: "var(--mono)", fontSize: "0.67rem", color: C.cyan }}>{s.projeto}</span>}
                    </div>
                    <StatusLine s={s} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Devs (SSH Identities) ─────────────────────────────────────────────────────

function SSHIdentityCard({ id }: { id: SSHIdentity }) {
  const [expanded, setExpanded] = useState(false);
  const expiresDate = new Date(id.expires_at);
  const minutesLeft = Math.round((expiresDate.getTime() - Date.now()) / 60000);
  const hoursLeft = Math.floor(minutesLeft / 60);
  const timeLeft = hoursLeft > 0 ? `${hoursLeft}h restantes` : `${minutesLeft}min restantes`;

  return (
    <div style={{ background: C.card, border: `1px solid ${C.green}33`, borderRadius: 8, overflow: "hidden" }}>
      <div
        onClick={() => setExpanded(e => !e)}
        style={{ padding: "0.75rem 1rem", cursor: "pointer", display: "flex", alignItems: "center", gap: "0.75rem", userSelect: "none" }}
      >
        <Terminal size={14} color={C.green} style={{ flexShrink: 0 }} />
        <Avatar name={id.dev} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ fontFamily: "var(--mono)", fontSize: "0.8rem", fontWeight: 600, color: devColor(id.dev) }}>{id.dev}</span>
            <span style={{ background: `${C.green}22`, border: `1px solid ${C.green}44`, color: C.green, borderRadius: 4, padding: "0px 6px", fontFamily: "var(--mono)", fontSize: "0.62rem", letterSpacing: "0.08em" }}>ATIVO</span>
            {id.sessoes > 1 && (
              <span style={{ background: `${C.cyan}15`, border: `1px solid ${C.cyan}33`, color: C.cyan, borderRadius: 4, padding: "0px 6px", fontFamily: "var(--mono)", fontSize: "0.62rem" }}>{id.sessoes} sessões</span>
            )}
          </div>
          <StatusLine s={id} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.3rem", color: C.dim }}>
            <Clock size={11} />
            <span style={{ fontFamily: "var(--mono)", fontSize: "0.7rem" }}>{timeLeft}</span>
          </div>
          <div style={{ width: 20, height: 20, borderRadius: 4, background: expanded ? `${C.cyan}22` : "rgba(255,255,255,0.05)", border: `1px solid ${expanded ? C.cyan + "55" : "rgba(255,255,255,0.1)"}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {expanded ? <ChevronDown size={11} color={C.cyan} /> : <ChevronRight size={11} color={C.muted} />}
          </div>
        </div>
      </div>

      {expanded && id.sessions.length > 0 && (
        <div style={{ borderTop: `1px solid ${C.border}`, padding: "0.75rem 1rem", display: "flex", flexDirection: "column", gap: "0.5rem", background: "rgba(0,0,0,0.15)" }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: "0.67rem", color: C.dim, letterSpacing: "0.08em", marginBottom: "0.15rem" }}>
            SESSÕES ATIVAS ({id.sessions.length})
          </div>
          {id.sessions.map((s, i) => (
            <div key={i} style={{ background: "rgba(255,255,255,0.02)", border: `1px solid ${C.border}`, borderRadius: 6, padding: "0.6rem 0.85rem", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
                <span style={{ fontFamily: "var(--mono)", fontSize: "0.7rem", color: C.muted }}>{s.ssh_ip}:{s.ssh_port}</span>
                {s.machine_hostname ? (
                  <><span style={{ color: C.dim, fontSize: "0.65rem" }}>→</span>
                  <span style={{ fontFamily: "var(--mono)", fontSize: "0.68rem", color: C.purple }}>{s.machine_hostname}</span></>
                ) : (
                  <span style={{ fontFamily: "var(--mono)", fontSize: "0.65rem", color: C.dim }}>→ ?</span>
                )}
                {s.projeto && <span style={{ fontFamily: "var(--mono)", fontSize: "0.68rem", color: C.cyan }}>{s.projeto}</span>}
                <span style={{ fontFamily: "var(--mono)", fontSize: "0.67rem", color: C.dim, marginLeft: "auto" }}>
                  {s.updated_at ? new Date(s.updated_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "sem dados"}
                </span>
              </div>
              <StatusLine s={s} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Scorecard ─────────────────────────────────────────────────────────────────

function ScorecardTable({ devs }: { devs: ScorecardDev[] }) {
  if (devs.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "3rem", color: C.dim, fontFamily: "var(--mono)", fontSize: "0.8rem" }}>
        Nenhuma atividade registrada nos últimos 7 dias.
      </div>
    );
  }
  const maxScore = Math.max(...devs.map(d => d.score), 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", padding: "0.75rem" }}>
      {devs.map((dev, i) => {
        const color = devColor(dev.dev);
        const pct = dev.score / maxScore;
        return (
          <div key={i} style={{
            background: C.card, border: `1px solid ${C.border}`,
            borderRadius: 8, padding: "0.75rem 1rem",
            borderLeft: `3px solid ${color}`,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.5rem" }}>
              <Avatar name={dev.dev} size={26} />
              <span style={{ fontFamily: "var(--mono)", fontSize: "0.8rem", fontWeight: 700, color, flex: 1 }}>{dev.dev}</span>
              <div style={{ width: 100, height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${pct * 100}%`, background: color, borderRadius: 2 }} />
              </div>
              <span style={{ fontFamily: "var(--mono)", fontSize: "0.7rem", color: C.dim, minWidth: 40, textAlign: "right" }}>
                {dev.score}pts
              </span>
            </div>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              {[
                { label: "commits", value: dev.commits, color: C.green,  icon: <GitCommit size={10} /> },
                { label: "edições", value: dev.edits,   color: C.cyan,   icon: <Edit3 size={10} /> },
                { label: "erros",   value: dev.errors,  color: C.red,    icon: <AlertTriangle size={10} /> },
                { label: "skills",  value: dev.skills,  color: C.purple, icon: <Cpu size={10} /> },
                { label: "sessões", value: dev.sessoes, color: C.muted,  icon: <Brain size={10} /> },
              ].map(({ label, value, color: c, icon }) => (
                <div key={label} style={{
                  display: "flex", alignItems: "center", gap: "0.25rem",
                  background: `${c}10`, border: `1px solid ${c}25`,
                  borderRadius: 5, padding: "2px 7px",
                }}>
                  <span style={{ color: c }}>{icon}</span>
                  <span style={{ fontFamily: "var(--mono)", fontSize: "0.7rem", fontWeight: 600, color: c }}>{value}</span>
                  <span style={{ fontFamily: "var(--sans)", fontSize: "0.65rem", color: C.dim }}>{label}</span>
                </div>
              ))}
              {dev.projetos.length > 0 && (
                <span style={{ fontFamily: "var(--mono)", fontSize: "0.67rem", color: C.dim, alignSelf: "center" }}>
                  {dev.projetos.join(", ")}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Conflitos ─────────────────────────────────────────────────────────────────

function ConflitosSection({ conflitos }: { conflitos: Conflito[] }) {
  if (conflitos.length === 0) return null;
  return (
    <div style={{
      background: "rgba(239,68,68,0.05)", border: `1px solid rgba(239,68,68,0.2)`,
      borderRadius: 8, overflow: "hidden", marginBottom: "0.5rem",
    }}>
      <div style={{ padding: "0.65rem 1rem", borderBottom: `1px solid rgba(239,68,68,0.15)`, display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <AlertTriangle size={13} color={C.red} />
        <span style={{ fontFamily: "var(--mono)", fontSize: "0.75rem", color: C.red, fontWeight: 600 }}>
          {conflitos.length} conflito{conflitos.length > 1 ? "s" : ""} potencial{conflitos.length > 1 ? "is" : ""}
        </span>
        <span style={{ fontFamily: "var(--mono)", fontSize: "0.65rem", color: C.dim, marginLeft: "auto" }}>
          últimas 24h, sem commit entre devs
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
        {conflitos.slice(0, 5).map((c, i) => {
          const minAtras = Math.round((Date.now() - new Date(c.ultima_edicao).getTime()) / 60000);
          const tempoLabel = minAtras < 60
            ? `${minAtras}min atrás`
            : `${Math.round(minAtras / 60)}h atrás`;
          return (
            <div key={i} style={{ padding: "0.6rem 1rem", borderBottom: i < conflitos.length - 1 ? `1px solid rgba(239,68,68,0.08)` : "none", display: "flex", flexDirection: "column", gap: "0.3rem" }}>
              {/* linha 1: projeto + arquivo + tempo */}
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                <FileCode size={11} color={C.red} style={{ flexShrink: 0 }} />
                <span style={{ fontFamily: "var(--mono)", fontSize: "0.72rem", color: C.text, flex: 1, minWidth: 0, wordBreak: "break-all" }}>
                  {c.arquivo}
                </span>
                <span style={{ fontFamily: "var(--mono)", fontSize: "0.62rem", color: C.dim, flexShrink: 0 }}>
                  {tempoLabel}
                </span>
              </div>
              {/* linha 2: projeto + devs */}
              <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", paddingLeft: "1.1rem", flexWrap: "wrap" }}>
                <span style={{ fontFamily: "var(--mono)", fontSize: "0.62rem", color: C.dim, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 4, padding: "0px 5px" }}>
                  {c.projeto.split("/").pop()}
                </span>
                {c.devs.map(dev => (
                  <span key={dev} style={{ background: `${devColor(dev)}15`, border: `1px solid ${devColor(dev)}33`, color: devColor(dev), borderRadius: 4, padding: "0px 5px", fontFamily: "var(--mono)", fontSize: "0.62rem" }}>
                    {dev}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Root component ────────────────────────────────────────────────────────────

type Tab = "ops" | "devs" | "feed" | "scorecard" | "afinidade" | "padroes" | "mcp";

export function CerebroClient({
  sessoes, afinidade, mcpConns, sshIdentities, sinais, padroes, scorecard, conflitos,
}: {
  sessoes: Sessao[];
  afinidade: AfinidadeItem[];
  mcpConns: MCPConn[];
  sshIdentities: SSHIdentity[];
  sinais: Sinal[];
  padroes: PadraoGlobal[];
  scorecard: ScorecardDev[];
  conflitos: Conflito[];
}) {
  const [tab, setTab] = useState<Tab>("devs");
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => router.refresh(), 30_000);
    return () => clearInterval(id);
  }, [router]);

  const activeMCP  = mcpConns.filter(c => c.ativo);
  const recentSess = sessoes.filter(s => s.minutos_atras < 60);

  // Para o Ops: mapeia dev → sessao mais recente
  const sessaoByDev = new Map<string, Sessao>();
  for (const s of sessoes) {
    const existing = sessaoByDev.get(s.dev);
    if (!existing || s.minutos_atras < existing.minutos_atras) {
      sessaoByDev.set(s.dev, s);
    }
  }

  const TABS: { id: Tab; label: string }[] = [
    { id: "devs",     label: `Devs (${sshIdentities.length})` },
    { id: "ops",      label: conflitos.length > 0 ? `Ops ⚠${conflitos.length}` : "Ops" },
    { id: "feed",     label: `Feed (${sinais.length})` },
    { id: "scorecard",label: "Scorecard" },
    { id: "afinidade",label: "Afinidade" },
    { id: "padroes",  label: `Padrões (${padroes.length})` },
    { id: "mcp",      label: `MCP (${activeMCP.length})` },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Stats */}
      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
        {[
          { label: "Devs online",          value: sshIdentities.length,                                 icon: <Terminal size={14} />, color: C.green  },
          { label: "Sessões ativas (1h)",   value: recentSess.length,                                    icon: <Users size={14} />,    color: C.cyan   },
          { label: "Projetos ativos",        value: [...new Set(sessoes.map(s => s.projeto))].length,    icon: <FileCode size={14} />, color: C.yellow },
          { label: "Sinais hoje",            value: sinais.filter(s => new Date(s.ts) > new Date(Date.now() - 86400000)).length, icon: <Zap size={14} />, color: C.purple },
          { label: "Clientes MCP",           value: activeMCP.length,                                    icon: <Wifi size={14} />,     color: C.orange },
        ].map(({ label, value, icon, color }) => (
          <div key={label} style={{ flex: "1 1 150px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "0.85rem 1rem", display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <div style={{ color, opacity: 0.8 }}>{icon}</div>
            <div>
              <div style={{ fontFamily: "var(--mono)", fontSize: "1.3rem", fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
              <div style={{ fontFamily: "var(--sans)", fontSize: "0.72rem", color: C.muted, marginTop: 3 }}>{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: "0.25rem", borderBottom: `1px solid ${C.border}` }}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              background: tab === t.id ? C.active : "transparent",
              border: "none", borderBottom: `2px solid ${tab === t.id ? C.cyan : "transparent"}`,
              color: tab === t.id ? C.cyan : C.muted,
              padding: "0.55rem 1rem", cursor: "pointer",
              fontFamily: "var(--mono)", fontSize: "0.76rem",
              letterSpacing: "0.05em", transition: "all 150ms",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Devs */}
      {tab === "devs" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
          {sshIdentities.length === 0 ? (
            <div style={{ textAlign: "center", padding: "3rem", color: C.dim, fontFamily: "var(--mono)", fontSize: "0.8rem" }}>
              Nenhum dev identificado no momento.
              <br />
              <span style={{ fontSize: "0.72rem", opacity: 0.6 }}>Use <code>/eu seu-nome</code> para se identificar.</span>
            </div>
          ) : (
            sshIdentities.map((id, i) => <SSHIdentityCard key={i} id={id} />)
          )}
        </div>
      )}

      {/* Ops */}
      {tab === "ops" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
          <ConflitosSection conflitos={conflitos} />
          {sshIdentities.length === 0 ? (
            <div style={{ textAlign: "center", padding: "3rem", color: C.dim, fontFamily: "var(--mono)", fontSize: "0.8rem" }}>
              Nenhum dev identificado no momento.
              <br />
              <span style={{ fontSize: "0.72rem", opacity: 0.6 }}>Use <code>/eu seu-nome</code> para se identificar.</span>
            </div>
          ) : (
            sshIdentities.map((id, i) => (
              <OpsCard key={i} identity={id} sessao={sessaoByDev.get(id.dev)} />
            ))
          )}
        </div>
      )}

      {/* Feed */}
      {tab === "feed" && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
          <div style={{ padding: "0.85rem 1rem", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Zap size={13} color={C.cyan} />
            <span style={{ fontFamily: "var(--mono)", fontSize: "0.78rem", color: C.text }}>Feed de atividade</span>
            <span style={{ fontFamily: "var(--mono)", fontSize: "0.68rem", color: C.dim, marginLeft: "auto" }}>últimos {sinais.length} sinais</span>
          </div>
          {sinais.length === 0 ? (
            <div style={{ textAlign: "center", padding: "3rem", color: C.dim, fontFamily: "var(--mono)", fontSize: "0.8rem" }}>
              Nenhum sinal registrado ainda.
            </div>
          ) : (
            sinais.map((s, i) => <FeedItem key={i} sinal={s} />)
          )}
        </div>
      )}

      {/* Scorecard */}
      {tab === "scorecard" && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
          <div style={{ padding: "0.85rem 1rem", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Brain size={13} color={C.cyan} />
            <span style={{ fontFamily: "var(--mono)", fontSize: "0.78rem", color: C.text }}>Scorecard — últimos 7 dias</span>
            <span style={{ fontFamily: "var(--mono)", fontSize: "0.68rem", color: C.dim, marginLeft: "auto" }}>commits×5 + skills×2 + edições</span>
          </div>
          <ScorecardTable devs={scorecard} />
        </div>
      )}

      {/* Afinidade */}
      {tab === "afinidade" && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
          <div style={{ padding: "0.85rem 1rem", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Users size={13} color={C.cyan} />
            <span style={{ fontFamily: "var(--mono)", fontSize: "0.78rem", color: C.text }}>Afinidade dev × projeto (30 dias)</span>
            <span style={{ fontFamily: "var(--mono)", fontSize: "0.68rem", color: C.dim, marginLeft: "auto" }}>score ponderado por recência</span>
          </div>
          <div style={{ padding: "1rem" }}>
            <AfinidadeTable afinidade={afinidade} />
          </div>
        </div>
      )}

      {/* Padrões */}
      {tab === "padroes" && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
          <div style={{ padding: "0.85rem 1rem", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <AlertTriangle size={13} color={C.red} />
            <span style={{ fontFamily: "var(--mono)", fontSize: "0.78rem", color: C.text }}>Padrões de erro (últimos 7 dias)</span>
            <span style={{ fontFamily: "var(--mono)", fontSize: "0.68rem", color: C.dim, marginLeft: "auto" }}>comandos bash que falham recorrentemente</span>
          </div>
          <PadroesTable padroes={padroes} />
        </div>
      )}

      {/* MCP */}
      {tab === "mcp" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
          {mcpConns.length === 0 ? (
            <div style={{ textAlign: "center", padding: "3rem", color: C.dim, fontFamily: "var(--mono)", fontSize: "0.8rem" }}>
              Nenhum cliente MCP conectado nas últimas 24h.
              <br />
              <span style={{ fontSize: "0.72rem", opacity: 0.6 }}>
                Bootstrap: <code>claude mcp add --transport sse second-brain-hub http://hub.fluxiom.com.br:8020/sse</code>
              </span>
            </div>
          ) : (
            mcpConns.map((c, i) => <MCPConnCard key={i} c={c} sshIdentities={sshIdentities} />)
          )}
        </div>
      )}
    </div>
  );
}
