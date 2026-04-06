"use client";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";

type ActivityData = {
  weeks: string[];
  repos: string[];
  data: Array<Record<string, string | number>>;
};

const COLORS = ["#3b82f6", "#22c55e", "#f97316", "#a855f7", "#ef4444", "#06b6d4"];

export function ActivityClient({ activity }: { activity: ActivityData }) {
  if (!activity.repos.length) {
    return <p className="text-gray-500 text-sm">Sem dados de atividade ainda.</p>;
  }
  return (
    <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
      <h3 className="text-sm font-semibold text-gray-300 mb-4">PRs por Repo por Semana</h3>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={activity.data}>
          <XAxis dataKey="week" tick={{ fill: "#9ca3af", fontSize: 11 }} />
          <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} />
          <Tooltip contentStyle={{ background: "#111827", border: "1px solid #374151", borderRadius: "8px" }} />
          <Legend />
          {activity.repos.map((repo, i) => (
            <Bar key={repo} dataKey={repo} stackId="a" fill={COLORS[i % COLORS.length]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
