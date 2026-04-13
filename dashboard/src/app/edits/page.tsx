import { hubFetch } from "@/lib/hub";
import { FadeIn } from "@/components/reactbits/FadeIn";
import { GitCommitHorizontal, FileCode2, Clock, Layers, User } from "lucide-react";

type Sinal = {
  id:      string;
  tipo:    "arquivo_editado" | "commit_realizado";
  dev:     string;
  projeto: string;
  dados:   Record<string, unknown>;
  ts:      string;
};

type Sessao = {
  dev:           string;
  projeto:       string;
  branch:        string;
  arquivos:      string[];
  ultimo_commit: string | null;
  minutos_atras: number;
  timestamp:     string;
};

type DevScore = {
  dev:      string;
  commits:  number;
  edits:    number;
  errors:   number;
  skills:   number;
  sessoes:  number;
  projetos: string[];
  score:    number;
};

type Scorecard = {
  dias:  number;
  devs:  DevScore[];
};

const DEV_COLORS: Record<string, string> = {
  Gustavo:            "#06b6d4",
  Alison:             "#22c55e",
  Distefano:          "#a78bfa",
  Samuel:             "#fbbf24",
  Mateus:             "#f87171",
  Josue:              "#fb923c",
  "reviewer-worker-4":"#5a7a9a",
  desconhecido:       "#3d5a7a",
};

function devColor(dev: string): string {
  return DEV_COLORS[dev] ?? "#5a7a9a";
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(diff / 86400000);
  if (m < 1)  return "agora";
  if (m < 60) return `${m}min`;
  if (h < 24) return `${h}h`;
  return `${d}d`;
}

function basename(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

export default async function EditsPage() {
  let sinais:   Sinal[]    = [];
  let sessoes:  Sessao[]   = [];
  let scorecard: Scorecard | null = null;

  try {
    [sinais, sessoes, scorecard] = await Promise.all([
      hubFetch<Sinal[]>("/cerebro/sinais"),
      hubFetch<Sessao[]>("/cerebro/sessoes"),
      hubFetch<Scorecard>("/cerebro/scorecard"),
    ]);
  } catch {}

  const devs = scorecard?.devs.filter((d) => d.dev !== "desconhecido" && d.dev !== "dio") ?? [];

  // Sort sessoes by timestamp desc
  const sorted = [...sessoes].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  // Recent commits from sinais
  const commits = sinais
    .filter((s) => s.tipo === "commit_realizado")
    .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());

  return (
    <FadeIn from="bottom" duration={400}>
      <div style={{ display: "flex", flexDirection: "column", gap: "2rem", maxWidth: 1000 }}>

        {/* Header */}
        <div>
          <div className="label-accent" style={{ marginBottom: "0.5rem" }}>Cerebro · Devs</div>
          <h2 style={{ fontFamily: "var(--mono)", fontSize: "1.6rem", fontWeight: 700, color: "var(--text)", letterSpacing: "-0.02em", marginBottom: "0.35rem" }}>
            Edições
          </h2>
          <p style={{ fontFamily: "var(--sans)", fontSize: "0.85rem", color: "var(--muted-foreground)" }}>
            Atividade de código dos devs — edições, commits e sessões recentes
          </p>
        </div>

        {/* Scorecard strip */}
        {devs.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "0.6rem" }}>
            {devs.map((d) => {
              const color = devColor(d.dev);
              return (
                <div
                  key={d.dev}
                  className="panel"
                  style={{ padding: "0.9rem 1.1rem", borderTop: `2px solid ${color}` }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.6rem" }}>
                    <div style={{ width: 7, height: 7, borderRadius: "50%", background: color, boxShadow: `0 0 6px ${color}` }} />
                    <span style={{ fontFamily: "var(--mono)", fontSize: "0.82rem", fontWeight: 600, color: "var(--text)" }}>
                      {d.dev}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: "0.85rem", flexWrap: "wrap" }}>
                    {[
                      { label: "commits", value: d.commits, color: "#22c55e" },
                      { label: "edits",   value: d.edits,   color: color      },
                      { label: "repos",   value: d.projetos.length, color: "#fbbf24" },
                    ].map(({ label, value, color: c }) => (
                      <div key={label} style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
                        <span style={{ fontFamily: "var(--mono)", fontSize: "1rem", fontWeight: 700, color: c }}>{value}</span>
                        <span style={{ fontFamily: "var(--mono)", fontSize: "0.6rem", color: "var(--dim)", textTransform: "uppercase", letterSpacing: "0.1em" }}>{label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Recent commits */}
        {commits.length > 0 && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
              <GitCommitHorizontal size={13} color="var(--green)" />
              <span className="label-accent" style={{ color: "var(--green)" }}>Commits recentes</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              {commits.map((c) => {
                const color = devColor(c.dev);
                const d = c.dados as { msg?: string; sha?: string; insertions?: number; deletions?: number; files_changed?: number };
                return (
                  <div
                    key={c.id}
                    className="panel"
                    style={{ padding: "0.75rem 1rem", display: "flex", alignItems: "center", gap: "1rem", borderLeft: `2px solid ${color}` }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", flexShrink: 0 }}>
                      <div style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />
                      <span style={{ fontFamily: "var(--mono)", fontSize: "0.75rem", color, fontWeight: 600 }}>{c.dev}</span>
                    </div>
                    <span style={{ fontFamily: "var(--mono)", fontSize: "0.8rem", color: "var(--text)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {d.msg ?? "sem mensagem"}
                    </span>
                    <div style={{ display: "flex", gap: "0.6rem", alignItems: "center", flexShrink: 0 }}>
                      {d.insertions != null && (
                        <span style={{ fontFamily: "var(--mono)", fontSize: "0.7rem", color: "#22c55e" }}>+{d.insertions}</span>
                      )}
                      {d.deletions != null && (
                        <span style={{ fontFamily: "var(--mono)", fontSize: "0.7rem", color: "#f87171" }}>-{d.deletions}</span>
                      )}
                      <span style={{ fontFamily: "var(--mono)", fontSize: "0.68rem", color: "var(--dim)" }}>
                        {timeAgo(c.ts)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Sessions feed */}
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
            <FileCode2 size={13} color="var(--cyan)" />
            <span className="label-accent">Sessões de edição</span>
            <span style={{ fontFamily: "var(--mono)", fontSize: "0.68rem", color: "var(--dim)" }}>
              {sorted.length} sessões
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {sorted.map((s, i) => {
              const color = devColor(s.dev);
              const proj  = s.projeto.includes("/") ? s.projeto.split("/")[1] : s.projeto;
              const isLast = i === sorted.length - 1;

              return (
                <div key={`${s.dev}-${s.timestamp}`} style={{ display: "flex", gap: "0.85rem" }}>
                  {/* Timeline dot */}
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0, width: 12 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, boxShadow: `0 0 6px ${color}`, marginTop: "1.1rem", flexShrink: 0 }} />
                    {!isLast && <div style={{ width: 1, flex: 1, minHeight: "1rem", background: "linear-gradient(to bottom, rgba(6,182,212,.1), transparent)", margin: "3px 0" }} />}
                  </div>

                  {/* Card */}
                  <div className="panel" style={{ flex: 1, padding: "0.75rem 1rem", marginBottom: "0.1rem" }}>
                    {/* Row 1: dev + proj + time */}
                    <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: s.arquivos.length > 0 ? "0.5rem" : 0 }}>
                      <span style={{ fontFamily: "var(--mono)", fontSize: "0.78rem", fontWeight: 600, color }}>
                        {s.dev}
                      </span>
                      <span style={{ fontFamily: "var(--mono)", fontSize: "0.7rem", color: "var(--dim)" }}>em</span>
                      <span style={{ fontFamily: "var(--mono)", fontSize: "0.78rem", color: "var(--text)" }}>{proj}</span>
                      {s.branch && s.branch !== "main" && s.branch !== "master" && (
                        <span style={{ fontFamily: "var(--mono)", fontSize: "0.65rem", color: "var(--purple, #a78bfa)", background: "rgba(167,139,250,0.08)", border: "1px solid rgba(167,139,250,0.2)", borderRadius: "3px", padding: "0 5px" }}>
                          {s.branch}
                        </span>
                      )}
                      <div style={{ flex: 1 }} />
                      <div style={{ display: "flex", alignItems: "center", gap: "3px", flexShrink: 0 }}>
                        <Clock size={9} color="var(--dim)" />
                        <span style={{ fontFamily: "var(--mono)", fontSize: "0.68rem", color: "var(--dim)" }}>
                          {timeAgo(s.timestamp)}
                        </span>
                      </div>
                    </div>

                    {/* Files */}
                    {s.arquivos.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem" }}>
                        {s.arquivos.slice(0, 8).map((f) => (
                          <span
                            key={f}
                            style={{
                              fontFamily:   "var(--mono)",
                              fontSize:     "0.68rem",
                              color:        "var(--muted-foreground)",
                              background:   "var(--bg-deep)",
                              border:       "1px solid var(--border-dim)",
                              borderRadius: "3px",
                              padding:      "1px 6px",
                              maxWidth:     220,
                              overflow:     "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace:   "nowrap",
                            }}
                            title={f}
                          >
                            {basename(f)}
                          </span>
                        ))}
                        {s.arquivos.length > 8 && (
                          <span style={{ fontFamily: "var(--mono)", fontSize: "0.68rem", color: "var(--dim)" }}>
                            +{s.arquivos.length - 8} mais
                          </span>
                        )}
                      </div>
                    )}

                    {/* Commit msg */}
                    {s.ultimo_commit && (
                      <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", marginTop: s.arquivos.length > 0 ? "0.45rem" : 0 }}>
                        <GitCommitHorizontal size={9} color="var(--dim)" />
                        <span style={{ fontFamily: "var(--mono)", fontSize: "0.68rem", color: "var(--dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {s.ultimo_commit}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {sorted.length === 0 && (
          <div className="panel" style={{ padding: "3rem", display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem", textAlign: "center" }}>
            <User size={32} color="var(--dim)" />
            <p style={{ fontFamily: "var(--mono)", fontSize: "0.85rem", color: "var(--muted-foreground)" }}>
              Nenhuma sessão registrada.
            </p>
          </div>
        )}
      </div>
    </FadeIn>
  );
}
