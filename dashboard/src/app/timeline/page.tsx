import { hubFetch } from "@/lib/hub";
import type { Decision } from "@/lib/hub";

type TimelineData = { decisions: Decision[] };

export default async function TimelinePage() {
  let decisions: Decision[] = [];
  try {
    const data = await hubFetch<TimelineData>("/stats/timeline");
    decisions = data.decisions;
  } catch {}

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-white">Timeline de Decisões</h2>
      <div className="space-y-3">
        {decisions.map((d) => (
          <div key={d.id} className="flex gap-4 items-start">
            <div className="flex flex-col items-center">
              <div className={`w-3 h-3 rounded-full flex-shrink-0 mt-1 ${d.breaking_changes ? "bg-red-500" : "bg-blue-500"}`} />
              <div className="w-px flex-1 bg-gray-800 mt-1" />
            </div>
            <div className="pb-4 flex-1">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="text-xs text-gray-500 font-mono">{d.repo}</span>
                  <h4 className="text-sm text-white font-medium">PR #{d.pr_number}: {d.pr_title}</h4>
                </div>
                {d.breaking_changes && (
                  <span className="text-xs bg-red-900 text-red-300 px-2 py-0.5 rounded-full flex-shrink-0">Breaking</span>
                )}
              </div>
              <div className="flex gap-2 mt-1 flex-wrap items-center">
                <span className="text-xs text-gray-400">@{d.pr_author}</span>
                {d.merged_at && <span className="text-xs text-gray-500">{new Date(d.merged_at).toLocaleDateString("pt-BR")}</span>}
                {(d.impact_areas || []).map((a) => (
                  <span key={a} className="text-xs bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded">{a}</span>
                ))}
              </div>
            </div>
          </div>
        ))}
        {decisions.length === 0 && <p className="text-gray-500 text-sm">Nenhuma decisão registrada ainda.</p>}
      </div>
    </div>
  );
}
