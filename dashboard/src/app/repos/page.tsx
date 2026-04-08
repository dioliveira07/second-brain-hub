import { hubFetch, Repo } from "@/lib/hub";
import { ReposLive } from "@/components/ReposLive";

export default async function ReposPage() {
  let repos: Repo[] = [];
  try { repos = await hubFetch<Repo[]>("/repos"); } catch {}

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem", maxWidth: 900 }}>
      <div>
        <div className="label-accent" style={{ marginBottom: "0.5rem" }}>Base de Conhecimento</div>
      </div>
      <ReposLive initialRepos={repos} />
    </div>
  );
}
