import { hubFetch, StatsOverview, Repo } from "@/lib/hub";

export default async function HomePage() {
  let stats: StatsOverview = { repos_indexed: 0, chunks_total: 0, qdrant_points: 0, decisions_captured: 0, notifications_unread: 0 };
  let repos: Repo[] = [];

  try {
    stats = await hubFetch<StatsOverview>("/stats/overview");
    repos = await hubFetch<Repo[]>("/repos");
  } catch {}

  const cards = [
    { label: "Repos Indexados", value: stats.repos_indexed, color: "text-blue-400", icon: "📦" },
    { label: "Chunks no Qdrant", value: stats.qdrant_points.toLocaleString(), color: "text-purple-400", icon: "🧩" },
    { label: "Decisões Capturadas", value: stats.decisions_captured, color: "text-green-400", icon: "⚡" },
    { label: "Notificações", value: stats.notifications_unread, color: "text-orange-400", icon: "🔔" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Dashboard</h2>
        <p className="text-gray-400 text-sm mt-1">Visão geral do Segundo Cérebro Corporativo</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <div key={c.label} className="bg-gray-900 rounded-xl p-4 border border-gray-800">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xl">{c.icon}</span>
              <span className="text-xs text-gray-400">{c.label}</span>
            </div>
            <div className={`text-3xl font-bold ${c.color}`}>{c.value}</div>
          </div>
        ))}
      </div>

      <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
        <h3 className="text-sm font-semibold text-gray-300 mb-3">Repositórios Indexados</h3>
        {repos.length === 0 ? (
          <p className="text-gray-500 text-sm">Nenhum repositório indexado ainda.</p>
        ) : (
          <div className="space-y-2">
            {repos.map((r) => (
              <div key={r.repo} className="flex items-center justify-between p-2 rounded-lg bg-gray-800">
                <span className="text-sm text-blue-400 font-mono">{r.repo}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${r.status === "done" ? "bg-green-900 text-green-300" : "bg-yellow-900 text-yellow-300"}`}>
                  {r.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
