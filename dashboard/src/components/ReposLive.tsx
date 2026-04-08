"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { GitBranch, Clock, ChevronRight, FolderGit2 } from "lucide-react";
import type { Repo } from "@/lib/hub";

export function ReposLive({ initialRepos }: { initialRepos: Repo[] }) {
  const [repos, setRepos] = useState(initialRepos);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      if (cancelled) return;

      const hasActive = repos.some(r => r.status === "indexing" || r.status === "queued");
      const interval  = hasActive ? 4_000 : 30_000;

      try {
        const res  = await fetch("/painel/api/live-status", { cache: "no-store" });
        const data = await res.json();
        if (!cancelled && data.repos?.length) setRepos(data.repos);
      } catch {}

      if (!cancelled) timerRef.current = setTimeout(poll, interval);
    }

    timerRef.current = setTimeout(poll, 4_000);
    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const done    = repos.filter(r => r.status === "done");
  const pending = repos.filter(r => r.status !== "done");
  const sorted  = [...done, ...pending];

  return (
    <>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "1rem" }}>
        <h2 style={{ fontFamily: "var(--mono)", fontSize: "1.6rem", fontWeight: 700, color: "var(--text)", letterSpacing: "-0.02em" }}>
          Repositórios
        </h2>
        <div style={{ fontFamily: "var(--mono)", fontSize: "0.72rem", color: "var(--green)", background: "rgba(34,197,94,.07)", border: "1px solid rgba(34,197,94,.2)", borderRadius: "var(--r)", padding: "0.3rem 0.85rem", letterSpacing: "0.08em" }}>
          {done.length} / {repos.length} indexados
        </div>
      </div>

      {repos.length === 0 ? (
        <div className="panel" style={{ padding: "3rem", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem" }}>
          <FolderGit2 size={36} color="var(--dim)" />
          <p style={{ fontFamily: "var(--mono)", fontSize: "0.85rem", color: "var(--muted-foreground)" }}>
            Nenhum repositório indexado.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {sorted.map((r) => {
            const [owner, repo] = r.repo.split("/");
            const isDone        = r.status === "done";
            return (
              <Link key={r.repo} href={`/repos/${owner}/${repo}`} className="repo-card">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.85rem", minWidth: 0, flex: 1 }}>
                    <div style={{ width: 34, height: 34, borderRadius: "var(--r)", display: "flex", alignItems: "center", justifyContent: "center", background: isDone ? "rgba(6,182,212,.06)" : "rgba(251,191,36,.06)", border: isDone ? "1px solid rgba(6,182,212,.15)" : "1px solid rgba(251,191,36,.15)", flexShrink: 0 }}>
                      <GitBranch size={14} color={isDone ? "var(--cyan)" : "var(--amber)"} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontFamily: "var(--mono)", fontSize: "0.82rem", color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginBottom: "0.2rem" }}>
                        <span style={{ color: "var(--muted-foreground)" }}>{owner} /&nbsp;</span>
                        <span style={{ color: isDone ? "var(--cyan)" : "var(--amber)" }}>{repo}</span>
                      </div>
                      {r.last_indexed_at && (
                        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                          <Clock size={10} color="var(--dim)" />
                          <span style={{ fontFamily: "var(--mono)", fontSize: "0.72rem", color: "var(--muted-foreground)" }}>
                            {new Date(r.last_indexed_at).toLocaleString("pt-BR")}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexShrink: 0 }}>
                    <span className={`badge badge-${isDone ? "done" : "pending"}`}>{r.status}</span>
                    <ChevronRight size={14} color="var(--dim)" />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
