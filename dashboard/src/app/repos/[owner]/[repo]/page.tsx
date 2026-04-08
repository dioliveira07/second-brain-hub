import { hubFetch } from "@/lib/hub";
import { FadeIn }   from "@/components/reactbits/FadeIn";
import { SpotlightCard } from "@/components/reactbits/SpotlightCard";
import {
  GitBranch, Clock, Layers, Code2, Server,
  GitMerge, AlertTriangle, User, Calendar, CheckCircle2,
} from "lucide-react";
import Link from "next/link";

type RepoDetail = {
  repo:           string;
  summary:        string;
  detected_stack: { languages: string[]; frameworks: string[]; infra: string[] };
  last_indexed_at: string;
  status:         string;
};

type Decision = {
  id:              string;
  pr_number:       number;
  pr_title:        string;
  pr_author:       string;
  impact_areas:    string[];
  breaking_changes: boolean;
  merged_at:       string | null;
};

type PageParams = { params: Promise<{ owner: string; repo: string }> };

const STACK_META = {
  languages: { label: "Linguagens", Icon: Code2,   color: "#06b6d4" },
  frameworks: { label: "Frameworks", Icon: Layers,  color: "#a78bfa" },
  infra:      { label: "Infra",      Icon: Server,  color: "#34d399" },
} as const;

export default async function RepoDetailPage({ params }: PageParams) {
  const { owner, repo } = await params;
  let detail: RepoDetail | null = null;
  let decisions: Decision[] = [];

  try {
    detail    = await hubFetch<RepoDetail>(`/repos/${owner}/${repo}/summary`);
    const d   = await hubFetch<{ decisions: Decision[] }>(`/repos/${owner}/${repo}/decisions`);
    decisions = d.decisions;
  } catch {}

  if (!detail) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem", padding: "4rem 2rem", textAlign: "center" }}>
        <GitBranch size={36} color="var(--dim)" />
        <p style={{ fontFamily: "var(--mono)", fontSize: "0.9rem", color: "var(--muted)" }}>
          Repositório não encontrado ou não indexado.
        </p>
        <Link href="/repos" style={{ fontFamily: "var(--mono)", fontSize: "0.75rem", color: "var(--cyan)", textDecoration: "none" }}>
          ← voltar
        </Link>
      </div>
    );
  }

  const stack   = detail.detected_stack || { languages: [], frameworks: [], infra: [] };
  const isDone  = detail.status === "done";
  const repoName = detail.repo.replace(`${owner}/`, "");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem", maxWidth: 860 }}>

      {/* Header */}
      <FadeIn delay={0}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
              <Link
                href="/repos"
                style={{ fontFamily: "var(--mono)", fontSize: "0.65rem", color: "var(--muted)", textDecoration: "none", letterSpacing: "0.06em" }}
              >
                repos
              </Link>
              <span style={{ color: "var(--dim)", fontSize: "0.65rem" }}>/</span>
              <span style={{ fontFamily: "var(--mono)", fontSize: "0.65rem", color: "var(--cyan)" }}>{repoName}</span>
            </div>
            <h2 style={{ fontFamily: "var(--mono)", fontSize: "1.5rem", fontWeight: 700, color: "var(--text)", letterSpacing: "-0.02em", marginBottom: "0.4rem" }}>
              <span style={{ color: "var(--muted)", fontWeight: 400 }}>{owner} / </span>{repoName}
            </h2>
            {detail.last_indexed_at && (
              <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                <Clock size={11} color="var(--dim)" />
                <span style={{ fontFamily: "var(--mono)", fontSize: "0.65rem", color: "var(--muted)" }}>
                  indexado em {new Date(detail.last_indexed_at).toLocaleString("pt-BR")}
                </span>
              </div>
            )}
          </div>
          <span className={`badge badge-${isDone ? "done" : "pending"}`} style={{ alignSelf: "flex-start" }}>
            {detail.status}
          </span>
        </div>
      </FadeIn>

      {/* Stack */}
      <FadeIn delay={60}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.75rem" }}>
          {(["languages", "frameworks", "infra"] as const).map((cat) => {
            const { label, Icon, color } = STACK_META[cat];
            const items = stack[cat] || [];
            if (items.length === 0) return null;
            return (
              <SpotlightCard
                key={cat}
                spotColor={`${color}14`}
                borderColor={`${color}30`}
                style={{ padding: "1.1rem 1.25rem" }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", marginBottom: "0.75rem" }}>
                  <Icon size={13} color={color} />
                  <span style={{ fontFamily: "var(--mono)", fontSize: "0.6rem", color, textTransform: "uppercase", letterSpacing: "0.12em" }}>
                    {label}
                  </span>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
                  {items.map((t: string) => (
                    <span
                      key={t}
                      style={{
                        fontFamily:   "var(--mono)",
                        fontSize:     "0.7rem",
                        color:        "var(--text)",
                        background:   "var(--bg-panel)",
                        border:       `1px solid ${color}25`,
                        borderRadius: "4px",
                        padding:      "2px 8px",
                      }}
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </SpotlightCard>
            );
          })}
        </div>
      </FadeIn>

      {/* Resumo arquitetural */}
      <FadeIn delay={120}>
        <div className="panel panel-accent" style={{ padding: "1.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
            <GitBranch size={13} color="var(--cyan)" />
            <span className="label-accent">Resumo Arquitetural</span>
          </div>
          <pre
            style={{
              fontFamily:   "var(--mono)",
              fontSize:     "0.78rem",
              lineHeight:   1.75,
              color:        "var(--text)",
              whiteSpace:   "pre-wrap",
              wordBreak:    "break-word",
              margin:       0,
              opacity:      0.88,
            }}
          >
            {detail.summary || "Sem resumo disponível."}
          </pre>
        </div>
      </FadeIn>

      {/* Decisões arquiteturais */}
      <FadeIn delay={180}>
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <GitMerge size={13} color="var(--green)" />
              <span className="label-accent" style={{ color: "var(--green)" }}>
                Decisões Arquiteturais
              </span>
            </div>
            <span style={{ fontFamily: "var(--mono)", fontSize: "0.62rem", color: "var(--muted)" }}>
              {decisions.length} registradas
            </span>
          </div>

          {decisions.length === 0 ? (
            <div
              className="panel"
              style={{ padding: "2.5rem", display: "flex", flexDirection: "column", alignItems: "center", gap: "0.75rem", textAlign: "center" }}
            >
              <CheckCircle2 size={28} color="var(--dim)" />
              <p style={{ fontFamily: "var(--mono)", fontSize: "0.82rem", color: "var(--muted)" }}>
                Nenhuma decisão registrada.
              </p>
              <p style={{ fontFamily: "var(--sans)", fontSize: "0.75rem", color: "var(--dim)" }}>
                Configure webhooks de PR no GitHub para capturar decisões automaticamente.
              </p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
              {decisions.map((d, i) => (
                <FadeIn key={d.id} delay={200 + i * 40}>
                  <div
                    className="panel"
                    style={{
                      padding:    "1.1rem 1.35rem",
                      borderLeft: `2px solid ${d.breaking_changes ? "var(--red)" : "var(--cyan)"}`,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem", marginBottom: "0.6rem" }}>
                      <h4 style={{ fontFamily: "var(--sans)", fontSize: "0.88rem", fontWeight: 500, color: "var(--text)", lineHeight: 1.4, margin: 0 }}>
                        <span style={{ fontFamily: "var(--mono)", fontSize: "0.68rem", color: "var(--muted)", marginRight: "0.5rem" }}>
                          PR #{d.pr_number}
                        </span>
                        {d.pr_title}
                      </h4>
                      {d.breaking_changes && (
                        <div style={{ display: "flex", alignItems: "center", gap: "4px", background: "rgba(248,113,113,.08)", border: "1px solid rgba(248,113,113,.22)", borderRadius: "var(--r)", padding: "3px 8px", flexShrink: 0 }}>
                          <AlertTriangle size={10} color="var(--red)" />
                          <span style={{ fontFamily: "var(--mono)", fontSize: "0.57rem", color: "var(--red)", textTransform: "uppercase", letterSpacing: "0.1em" }}>Breaking</span>
                        </div>
                      )}
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.6rem", alignItems: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        <User size={10} color="var(--muted)" />
                        <span style={{ fontFamily: "var(--mono)", fontSize: "0.68rem", color: "var(--muted)" }}>@{d.pr_author}</span>
                      </div>
                      {d.merged_at && (
                        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                          <Calendar size={10} color="var(--dim)" />
                          <span style={{ fontFamily: "var(--mono)", fontSize: "0.68rem", color: "var(--muted)" }}>
                            {new Date(d.merged_at).toLocaleDateString("pt-BR")}
                          </span>
                        </div>
                      )}
                      {(d.impact_areas || []).map((a) => (
                        <span key={a} style={{ fontFamily: "var(--mono)", fontSize: "0.6rem", color: "var(--purple)", background: "rgba(167,139,250,.08)", border: "1px solid rgba(167,139,250,.2)", borderRadius: "3px", padding: "1px 7px" }}>
                          {a}
                        </span>
                      ))}
                    </div>
                  </div>
                </FadeIn>
              ))}
            </div>
          )}
        </div>
      </FadeIn>
    </div>
  );
}
