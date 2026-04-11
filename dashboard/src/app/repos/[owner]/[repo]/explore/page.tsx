import { hubFetch } from "@/lib/hub";
import { ExploreClient } from "@/components/ExploreClient";
import type { TreeNode } from "@/components/FileTree";
import { GitBranch } from "lucide-react";
import Link from "next/link";

type RepoSummary = {
  repo:          string;
  directory_map: TreeNode | null;
};

type PageParams = { params: Promise<{ owner: string; repo: string }> };

export default async function ExplorePage({ params }: PageParams) {
  const { owner, repo } = await params;

  let summary: RepoSummary | null = null;
  try {
    summary = await hubFetch<RepoSummary>(`/repos/${owner}/${repo}/summary`);
  } catch {}

  if (!summary?.directory_map) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem", padding: "4rem 2rem", textAlign: "center" }}>
        <GitBranch size={36} color="var(--dim)" />
        <p style={{ fontFamily: "var(--mono)", fontSize: "0.9rem", color: "var(--muted-foreground)" }}>
          Estrutura de arquivos não disponível para este repositório.
        </p>
        <Link href={`/repos/${owner}/${repo}`} style={{ fontFamily: "var(--mono)", fontSize: "0.75rem", color: "var(--cyan)", textDecoration: "none" }}>
          ← voltar
        </Link>
      </div>
    );
  }

  return (
    <ExploreClient
      owner={owner}
      repo={repo}
      root={summary.directory_map}
    />
  );
}
