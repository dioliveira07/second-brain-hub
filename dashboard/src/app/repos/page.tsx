import Link from "next/link";
import { hubFetch, Repo } from "@/lib/hub";

export default async function ReposPage() {
  let repos: Repo[] = [];
  try { repos = await hubFetch<Repo[]>("/repos"); } catch {}

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-white">Repositórios</h2>
      <div className="grid gap-3">
        {repos.map((r) => {
          const [owner, repo] = r.repo.split("/");
          return (
            <Link key={r.repo} href={`/repos/${owner}/${repo}`}
              className="block bg-gray-900 rounded-xl p-4 border border-gray-800 hover:border-blue-700 transition-colors">
              <div className="flex justify-between items-center">
                <span className="text-blue-400 font-mono text-sm">{r.repo}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${r.status === "done" ? "bg-green-900 text-green-300" : "bg-yellow-900 text-yellow-300"}`}>
                  {r.status}
                </span>
              </div>
              {r.last_indexed_at && (
                <p className="text-xs text-gray-500 mt-1">
                  Indexado: {new Date(r.last_indexed_at).toLocaleString("pt-BR")}
                </p>
              )}
            </Link>
          );
        })}
        {repos.length === 0 && <p className="text-gray-500 text-sm">Nenhum repositório indexado.</p>}
      </div>
    </div>
  );
}
