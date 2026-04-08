import { hubFetch } from "@/lib/hub";
import type { Decision } from "@/lib/hub";
import { GitMerge, AlertTriangle, User, Calendar, GitPullRequest } from "lucide-react";

type TimelineData = { decisions: Decision[] };

export default async function TimelinePage() {
  let decisions: Decision[] = [];
  try {
    const data = await hubFetch<TimelineData>("/stats/timeline");
    decisions = data.decisions;
  } catch {}

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem", maxWidth: 800 }}>
      <div>
        <div className="label-accent" style={{ marginBottom: "0.5rem" }}>Decisões Arquiteturais</div>
        <h2 style={{ fontFamily: "var(--mono)", fontSize: "1.6rem", fontWeight: 700, color: "var(--text)", letterSpacing: "-0.02em", marginBottom: "0.35rem" }}>
          Timeline
        </h2>
        <p style={{ fontFamily: "var(--sans)", fontSize: "0.85rem", color: "var(--muted)" }}>
          Decisões capturadas via merge de PRs
        </p>
      </div>

      {decisions.length === 0 ? (
        <div
          className="panel"
          style={{
            padding: "3rem",
            display: "flex", flexDirection: "column", alignItems: "center",
            gap: "1rem", textAlign: "center",
          }}
        >
          <GitPullRequest size={36} color="var(--dim)" />
          <p style={{ fontFamily: "var(--mono)", fontSize: "0.85rem", color: "var(--muted)" }}>
            Nenhuma decisão registrada ainda.
          </p>
          <p style={{ fontFamily: "var(--sans)", fontSize: "0.78rem", color: "var(--dim)" }}>
            Configure webhooks de PR no GitHub para capturar decisões.
          </p>
        </div>
      ) : (
        <div style={{ paddingLeft: "0.25rem" }}>
          {decisions.map((d, i) => (
            <div key={d.id} style={{ display: "flex", gap: "1.25rem" }}>
              {/* Dot + line */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0, width: 16 }}>
                <div
                  style={{
                    width: 10, height: 10,
                    borderRadius: "50%",
                    background: d.breaking_changes ? "var(--red)" : "var(--cyan)",
                    boxShadow:  d.breaking_changes ? "0 0 8px var(--red)" : "var(--glow-cyan)",
                    marginTop:  "0.4rem", flexShrink: 0,
                  }}
                />
                {i < decisions.length - 1 && (
                  <div
                    style={{
                      width: 1, flex: 1,
                      minHeight: "2rem",
                      background: "linear-gradient(to bottom, rgba(6,182,212,.3), transparent)",
                      margin: "4px 0",
                    }}
                  />
                )}
              </div>

              {/* Card */}
              <div
                className="panel"
                style={{
                  flex: 1,
                  padding: "1.25rem 1.5rem",
                  marginBottom: "0.75rem",
                  borderLeft: `2px solid ${d.breaking_changes ? "var(--red)" : "var(--cyan)"}`,
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem", marginBottom: "0.75rem" }}>
                  <div style={{ minWidth: 0 }}>
                    <span style={{ fontFamily: "var(--mono)", fontSize: "0.65rem", color: "var(--cyan)", display: "block", marginBottom: "0.35rem", letterSpacing: "0.06em" }}>
                      {d.repo}
                    </span>
                    <h4 style={{ fontFamily: "var(--sans)", fontSize: "0.95rem", fontWeight: 500, color: "var(--text)", lineHeight: 1.4 }}>
                      PR #{d.pr_number}: {d.pr_title}
                    </h4>
                  </div>
                  {d.breaking_changes && (
                    <div
                      style={{
                        display: "flex", alignItems: "center", gap: "5px",
                        background: "rgba(248,113,113,.08)",
                        border: "1px solid rgba(248,113,113,.25)",
                        borderRadius: "var(--r)",
                        padding: "3px 10px",
                        flexShrink: 0,
                      }}
                    >
                      <AlertTriangle size={10} color="var(--red)" />
                      <span style={{ fontFamily: "var(--mono)", fontSize: "0.58rem", color: "var(--red)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                        Breaking
                      </span>
                    </div>
                  )}
                </div>

                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                    <User size={11} color="var(--muted)" />
                    <span style={{ fontFamily: "var(--mono)", fontSize: "0.7rem", color: "var(--muted)" }}>{d.pr_author}</span>
                  </div>
                  {d.merged_at && (
                    <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                      <Calendar size={11} color="var(--dim)" />
                      <span style={{ fontFamily: "var(--mono)", fontSize: "0.7rem", color: "var(--muted)" }}>
                        {new Date(d.merged_at).toLocaleDateString("pt-BR")}
                      </span>
                    </div>
                  )}
                  {(d.impact_areas || []).map((a) => (
                    <span
                      key={a}
                      style={{
                        fontFamily: "var(--mono)", fontSize: "0.62rem",
                        color: "var(--purple)",
                        background: "rgba(167,139,250,.08)",
                        border: "1px solid rgba(167,139,250,.2)",
                        borderRadius: "3px",
                        padding: "2px 7px",
                      }}
                    >
                      {a}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
