"use client";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { GitCommit, Edit3, AlertTriangle, Cpu, GitBranch, FileCode, ArrowLeft, Clock } from "lucide-react";

const C = {
  border: "#1a2840", cyan: "#06b6d4", green: "#22c55e", yellow: "#eab308",
  purple: "#a855f7", orange: "#f97316", red: "#ef4444",
  text: "#e2e8f0", muted: "#8ab4cc", dim: "#4a6a8a", card: "rgba(15,30,55,0.7)",
};

type Sinal = { id: string; tipo: string; dev: string; projeto: string; dados: Record<string, unknown>; ts: string };
type Sessao = { dev: string; projeto: string; branch: string; arquivos: string[]; ultimo_commit: string; minutos_atras: number; timestamp: string };

function devColor(dev: string): string {
  const colors = [C.cyan, C.green, C.yellow, C.purple, C.orange, "#ec4899"];
  let hash = 0;
  for (const c of dev) hash = (hash * 31 + c.charCodeAt(0)) & 0xffffffff;
  return colors[Math.abs(hash) % colors.length];
}

function timeAgoFromIso(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${mins}min atrás`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h atrás`;
  return `${Math.floor(h / 24)}d atrás`;
}

const TIPO_CONFIG: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  commit_realizado: { icon: <GitCommit size={13} />, color: C.green,  label: "commit" },
  arquivo_editado:  { icon: <Edit3 size={13} />,     color: C.cyan,   label: "edição" },
  erro_bash:        { icon: <AlertTriangle size={13} />, color: C.red, label: "erro"  },
  skill_usada:      { icon: <Cpu size={13} />,        color: C.purple, label: "skill" },
};

function sinalDesc(s: Sinal): string {
  switch (s.tipo) {
    case "commit_realizado": {
      const msg = (s.dados.msg as string) ?? "";
      const op  = (s.dados.tipo_operacao as string) === "push" ? "push" : "commit";
      return `${op}: ${msg.slice(0, 60)}`;
    }
    case "arquivo_editado": {
      const f = (s.dados.arquivo as string) ?? "";
      return f.split("/").slice(-2).join("/");
    }
    case "erro_bash":
      return ((s.dados.cmd_decoded as string) ?? "?").slice(0, 60);
    case "skill_usada":
      return `/${s.dados.skill as string}`;
    default:
      return s.tipo;
  }
}

function TimelineEvent({ sinal }: { sinal: Sinal }) {
  const cfg = TIPO_CONFIG[sinal.tipo] ?? { icon: <Clock size={13} />, color: C.muted, label: sinal.tipo };
  return (
    <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start" }}>
      {/* linha + dot */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0, width: 24 }}>
        <div style={{
          width: 24, height: 24, borderRadius: "50%",
          background: `${cfg.color}15`, border: `1px solid ${cfg.color}44`,
          display: "flex", alignItems: "center", justifyContent: "center",
          color: cfg.color,
        }}>{cfg.icon}</div>
        <div style={{ width: 1, flex: 1, minHeight: 8, background: `${C.border}`, marginTop: 2 }} />
      </div>
      {/* conteúdo */}
      <div style={{ flex: 1, paddingBottom: "0.75rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
          <span style={{ fontFamily: "var(--mono)", fontSize: "0.72rem", fontWeight: 600, color: devColor(sinal.dev) }}>
            {sinal.dev}
          </span>
          <span style={{ fontFamily: "var(--mono)", fontSize: "0.68rem", color: C.dim }}>{cfg.label}</span>
          <span style={{ fontFamily: "var(--mono)", fontSize: "0.65rem", color: C.dim, marginLeft: "auto" }}>
            {timeAgoFromIso(sinal.ts)}
          </span>
        </div>
        <div style={{ fontFamily: "var(--mono)", fontSize: "0.75rem", color: cfg.color === C.red ? C.red : C.text, marginTop: "0.2rem" }}>
          {sinalDesc(sinal)}
        </div>
        {sinal.tipo === "commit_realizado" && (
          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.25rem", flexWrap: "wrap" }}>
            {(sinal.dados.files_changed as number) > 0 && (
              <span style={{ fontFamily: "var(--mono)", fontSize: "0.65rem", color: C.dim }}>
                {sinal.dados.files_changed as number} arquivo{(sinal.dados.files_changed as number) > 1 ? "s" : ""}
              </span>
            )}
            {(sinal.dados.insertions as number) > 0 && (
              <span style={{ fontFamily: "var(--mono)", fontSize: "0.65rem", color: C.green }}>+{sinal.dados.insertions as number}</span>
            )}
            {(sinal.dados.deletions as number) > 0 && (
              <span style={{ fontFamily: "var(--mono)", fontSize: "0.65rem", color: C.red }}>-{sinal.dados.deletions as number}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ProjetoTimelineContent() {
  const params = useSearchParams();
  const slug = params.get("slug") ?? "";
  const [sinais, setSinais] = useState<Sinal[]>([]);
  const [sessoes, setSessoes] = useState<Sessao[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;
    const proj_enc = encodeURIComponent(slug);
    Promise.all([
      fetch(`/painel/api/cerebro-proxy?path=/sinais?projeto=${proj_enc}&limit=100`).then(r => r.json()).catch(() => []),
      fetch(`/painel/api/cerebro-proxy?path=/projeto/${proj_enc}/sessoes?limit=20`).then(r => r.json()).catch(() => []),
    ]).then(([s, sess]) => {
      setSinais(Array.isArray(s) ? s : []);
      setSessoes(Array.isArray(sess) ? sess : []);
      setLoading(false);
    });
  }, [slug]);

  const nome = slug.split("/").pop() ?? slug;

  const [repos, setRepos] = useState<{owner: string; name: string; full_name: string}[]>([]);
  useEffect(() => {
    if (slug) return;
    fetch("/painel/api/live-status", { cache: "no-store" }).then(r => r.json()).then(d => {
      if (Array.isArray(d.repos)) setRepos(d.repos.map((r: {owner?: string; name?: string; full_name?: string}) => ({ owner: r.owner ?? "", name: r.name ?? "", full_name: r.full_name ?? "" })));
    }).catch(() => {});
  }, [slug]);

  if (!slug) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem", maxWidth: 600 }}>
        <div style={{ fontFamily: "var(--mono)", fontSize: "0.72rem", color: C.dim, letterSpacing: "0.08em" }}>Selecione um projeto</div>
        {repos.length === 0 && <div style={{ color: C.dim, fontFamily: "var(--mono)", fontSize: "0.8rem" }}>Carregando repos...</div>}
        {repos.map(r => (
          <Link key={r.full_name} href={`/projeto?slug=${encodeURIComponent(r.full_name)}`}
            style={{ display: "flex", alignItems: "center", gap: "0.75rem", background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "0.85rem 1.1rem", textDecoration: "none", color: C.text, fontFamily: "var(--mono)", fontSize: "0.82rem" }}>
            <FileCode size={14} color={C.cyan} />
            <span style={{ flex: 1 }}>{r.full_name}</span>
            <ArrowLeft size={12} color={C.dim} style={{ transform: "rotate(180deg)" }} />
          </Link>
        ))}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem", maxWidth: 800 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontFamily: "var(--mono)", fontSize: "0.72rem", color: C.dim, textDecoration: "none", marginBottom: "0.5rem" }}>
          <ArrowLeft size={12} /> Dashboard
        </Link>
        <div style={{ fontFamily: "var(--mono)", fontSize: "0.72rem", color: C.dim, letterSpacing: "0.08em" }}>Timeline</div>
        <h2 style={{ fontFamily: "var(--mono)", fontSize: "1.5rem", fontWeight: 700, color: C.text, letterSpacing: "-0.02em" }}>
          {nome}
        </h2>
        <div style={{ fontFamily: "var(--mono)", fontSize: "0.75rem", color: C.dim }}>{slug}</div>
      </div>

      {/* Devs ativos neste projeto */}
      {sessoes.length > 0 && (
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          {[...new Map(sessoes.map(s => [s.dev, s])).values()].map(s => (
            <div key={s.dev} style={{
              background: `${devColor(s.dev)}12`, border: `1px solid ${devColor(s.dev)}33`,
              borderRadius: 8, padding: "0.5rem 0.85rem",
              display: "flex", flexDirection: "column", gap: "0.2rem",
            }}>
              <span style={{ fontFamily: "var(--mono)", fontSize: "0.78rem", fontWeight: 600, color: devColor(s.dev) }}>{s.dev}</span>
              {s.branch && (
                <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                  <GitBranch size={10} color={C.dim} />
                  <span style={{ fontFamily: "var(--mono)", fontSize: "0.67rem", color: C.dim }}>{s.branch}</span>
                </div>
              )}
              {s.arquivos?.slice(0, 2).map((f, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                  <FileCode size={10} color={C.dim} />
                  <span style={{ fontFamily: "var(--mono)", fontSize: "0.65rem", color: C.muted }}>{f.split("/").pop()}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Timeline */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "1rem 1.25rem" }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: "2rem", color: C.dim, fontFamily: "var(--mono)", fontSize: "0.8rem" }}>
            Carregando...
          </div>
        ) : sinais.length === 0 ? (
          <div style={{ textAlign: "center", padding: "2rem", color: C.dim, fontFamily: "var(--mono)", fontSize: "0.8rem" }}>
            Nenhum sinal registrado para este projeto.
          </div>
        ) : (
          sinais.map((s, i) => <TimelineEvent key={i} sinal={s} />)
        )}
      </div>
    </div>
  );
}

export default function ProjetoPage() {
  return (
    <Suspense fallback={<div style={{ padding: "2rem", color: "#4a6a8a", fontFamily: "monospace" }}>Carregando...</div>}>
      <ProjetoTimelineContent />
    </Suspense>
  );
}
