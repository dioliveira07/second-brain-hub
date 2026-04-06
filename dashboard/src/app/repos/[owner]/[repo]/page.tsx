import { hubFetch } from "@/lib/hub";

type RepoDetail = {
  repo: string;
  summary: string;
  detected_stack: { languages: string[]; frameworks: string[]; infra: string[] };
  directory_map: unknown;
  last_indexed_at: string;
  status: string;
};

type Decision = {
  id: string;
  pr_number: number;
  pr_title: string;
  pr_author: string;
  impact_areas: string[];
  breaking_changes: boolean;
  merged_at: string | null;
};

type PageParams = { params: Promise<{ owner: string; repo: string }> };

export default async function RepoDetailPage({ params }: PageParams) {
  const { owner, repo } = await params;
  let detail: RepoDetail | null = null;
  let decisions: Decision[] = [];

  try {
    detail = await hubFetch<RepoDetail>(`/repos/${owner}/${repo}/summary`);
    const d = await hubFetch<{ decisions: Decision[] }>(`/repos/${owner}/${repo}/decisions`);
    decisions = d.decisions;
  } catch {}

  if (!detail) return <div className="text-gray-400">Repo não encontrado ou não indexado.</div>;

  const stack = detail.detected_stack || { languages: [], frameworks: [], infra: [] };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-2xl font-bold text-white">{detail.repo}</h2>
        <span className={`text-xs px-2 py-0.5 rounded-full ${detail.status === "done" ? "bg-green-900 text-green-300" : "bg-yellow-900 text-yellow-300"}`}>
          {detail.status}
        </span>
      </div>

      <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
        <h3 className="text-sm font-semibold text-gray-300 mb-2">Resumo Arquitetural</h3>
        <pre className="text-xs text-gray-300 whitespace-pre-wrap font-mono">{detail.summary || "Sem resumo disponível."}</pre>
      </div>

      <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
        <h3 className="text-sm font-semibold text-gray-300 mb-3">Stack Detectada</h3>
        <div className="space-y-2">
          {(["languages", "frameworks", "infra"] as const).map((cat) => (
            (stack[cat] || []).length > 0 && (
              <div key={cat}>
                <span className="text-xs text-gray-500 uppercase">{cat}: </span>
                {(stack[cat] || []).map((t: string) => (
                  <span key={t} className="inline-block mr-1 mb-1 px-2 py-0.5 bg-gray-800 text-gray-300 text-xs rounded-full">{t}</span>
                ))}
              </div>
            )
          ))}
        </div>
      </div>

      <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
        <h3 className="text-sm font-semibold text-gray-300 mb-3">Decisões Arquiteturais ({decisions.length})</h3>
        {decisions.length === 0 ? (
          <p className="text-gray-500 text-sm">Nenhuma decisão registrada.</p>
        ) : (
          <div className="space-y-2">
            {decisions.map((d) => (
              <div key={d.id} className="p-3 bg-gray-800 rounded-lg">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm text-white">PR #{d.pr_number}: {d.pr_title}</span>
                  {d.breaking_changes && <span className="text-xs bg-red-900 text-red-300 px-2 py-0.5 rounded-full flex-shrink-0">Breaking</span>}
                </div>
                <div className="flex gap-2 mt-1 flex-wrap">
                  <span className="text-xs text-gray-400">@{d.pr_author}</span>
                  {(d.impact_areas || []).map((a) => <span key={a} className="text-xs bg-gray-700 text-gray-300 px-1.5 py-0.5 rounded">{a}</span>)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
