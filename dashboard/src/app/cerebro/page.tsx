import { cerebroFetch } from "@/lib/hub";
import { FadeIn } from "@/components/reactbits/FadeIn";
import { CerebroClient } from "@/components/CerebroClient";

export type Sessao = {
  dev: string;
  projeto: string;
  branch: string;
  arquivos: string[];
  ultimo_commit: string;
  minutos_atras: number;
  timestamp: string;
};

export type AfinidadeItem = {
  dev: string;
  projeto: string;
  score: number;
};

export type MCPConn = {
  client_ip: string;
  client_name: string | null;
  machine: string | null;
  connected_at: string;
  last_seen_at: string;
  minutos_atras: number;
  ativo: boolean;
};

export type SSHSession = {
  ssh_ip: string;
  ssh_port: string;
  machine_hostname: string | null;
  machine_ip: string | null;
  expires_at: string;
  projeto: string | null;
  ctx_pct: number | null;
  tokens_total: number | null;
  turns: number | null;
  model: string | null;
  account_name: string | null;
  plan: string | null;
  updated_at: string | null;
};

export type SSHIdentity = {
  dev: string;
  sessoes: number;
  ssh_ip: string;
  machine_hostname: string | null;
  machine_ip: string | null;
  expires_at: string;
  ctx_pct: number | null;
  tokens_total: number | null;
  turns: number | null;
  model: string | null;
  account_name: string | null;
  plan: string | null;
  sessions: SSHSession[];
};

export type Sinal = {
  id: string;
  tipo: string;
  dev: string;
  projeto: string;
  dados: Record<string, unknown>;
  ts: string;
};

export type PadraoGlobal = {
  projeto: string;
  comando: string;
  ocorrencias: number;
};

export type ScorecardDev = {
  dev: string;
  commits: number;
  edits: number;
  errors: number;
  skills: number;
  sessoes: number;
  projetos: string[];
  score: number;
};

export type Conflito = {
  projeto: string;
  arquivo: string;
  devs: string[];
  ultima_edicao: string;
  diffs: Record<string, string>;
};

export type ChatMensagem = {
  turno: number;
  texto: string;
  ts: string;
};

export type ChatSessao = {
  session_id: string;
  projeto: string;
  inicio: string;
  fim: string;
  mensagens: ChatMensagem[];
};

export type ChatDev = {
  dev: string;
  total: number;
  sessoes: ChatSessao[];
};

export default async function CerebroPage() {
  let sessoes: Sessao[] = [];
  let afinidade: AfinidadeItem[] = [];
  let mcpConns: MCPConn[] = [];
  let sshIdentities: SSHIdentity[] = [];
  let sinais: Sinal[] = [];
  let padroes: PadraoGlobal[] = [];
  let scorecard: ScorecardDev[] = [];
  let conflitos: Conflito[] = [];
  let mensagens: ChatDev[] = [];

  try {
    sessoes = await cerebroFetch<Sessao[]>("/sessoes?limit=50");
  } catch {}

  try {
    const af = await cerebroFetch<{ tabela: AfinidadeItem[] }>("/afinidade?dias=30");
    afinidade = af.tabela ?? [];
  } catch {}

  try {
    mcpConns = await cerebroFetch<MCPConn[]>("/mcp/connections");
  } catch {}

  try {
    sshIdentities = await cerebroFetch<SSHIdentity[]>("/ssh/identities");
  } catch {}

  try {
    sinais = await cerebroFetch<Sinal[]>("/sinais?limit=60");
  } catch {}

  try {
    const p = await cerebroFetch<{ padroes: PadraoGlobal[] }>("/padroes?dias=7&min_ocorrencias=2");
    padroes = p.padroes ?? [];
  } catch {}

  try {
    const sc = await cerebroFetch<{ devs: ScorecardDev[] }>("/scorecard?dias=7");
    scorecard = sc.devs ?? [];
  } catch {}

  try {
    const cf = await cerebroFetch<{ conflitos: Conflito[] }>("/conflitos?horas=24");
    conflitos = cf.conflitos ?? [];
  } catch {}

  try {
    mensagens = await cerebroFetch<ChatDev[]>("/mensagens?limit=200");
  } catch {}

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem", maxWidth: 1100 }}>
      <FadeIn delay={0}>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
          <div className="label-accent" style={{ marginBottom: "0.2rem" }}>Contexto</div>
          <h2 style={{ fontFamily: "var(--mono)", fontSize: "1.6rem", fontWeight: 700, color: "var(--text)", letterSpacing: "-0.02em" }}>
            Cérebro
          </h2>
          <p style={{ fontFamily: "var(--sans)", fontSize: "0.85rem", color: "var(--muted-foreground)" }}>
            Ops em tempo real, feed de atividade, afinidade de devs e clientes MCP
          </p>
        </div>
      </FadeIn>

      <CerebroClient
        sessoes={sessoes}
        afinidade={afinidade}
        mcpConns={mcpConns}
        sshIdentities={sshIdentities}
        sinais={sinais}
        padroes={padroes}
        scorecard={scorecard}
        conflitos={conflitos}
        mensagens={mensagens}
      />
    </div>
  );
}
