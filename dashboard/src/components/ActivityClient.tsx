"use client";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, Cell,
} from "recharts";

type ActivityData = {
  weeks: string[];
  repos: string[];
  data: Array<Record<string, string | number>>;
};

const NEON_COLORS = [
  '#06b6d4', '#22c55e', '#8b5cf6', '#f59e0b',
  '#ef4444', '#ec4899', '#14b8a6', '#f97316',
];

const CustomTooltip = ({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) => {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: 'var(--bg-panel)',
        border: '1px solid var(--border)',
        borderRadius: '6px',
        padding: '0.75rem',
        fontFamily: 'var(--mono)',
        fontSize: '0.75rem',
      }}
    >
      <div style={{ color: 'var(--cyan)', marginBottom: '0.5rem', fontSize: '0.65rem' }}>
        {label}
      </div>
      {payload.map((p) => (
        <div key={p.name} style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', color: p.color }}>
          <span style={{ color: 'var(--muted)' }}>{p.name.replace('dioliveira07/', '')}</span>
          <span>{p.value}</span>
        </div>
      ))}
    </div>
  );
};

export function ActivityClient({ activity }: { activity: ActivityData }) {
  if (!activity.repos.length) {
    return (
      <div
        className="panel"
        style={{ padding: '2rem', textAlign: 'center', color: 'var(--muted)', fontFamily: 'var(--mono)', fontSize: '0.85rem' }}
      >
        Sem dados de atividade ainda.
      </div>
    );
  }

  return (
    <div className="panel" style={{ padding: '1.5rem' }}>
      <h3
        className="label-accent"
        style={{ fontSize: '0.8rem', marginBottom: '1.25rem' }}
      >
        PRs por Repositório por Semana
      </h3>
      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={activity.data} barCategoryGap="20%">
          <XAxis
            dataKey="week"
            tick={{ fill: 'var(--muted)', fontSize: 10, fontFamily: 'var(--mono)' }}
            axisLine={{ stroke: 'var(--border)' }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: 'var(--muted)', fontSize: 10, fontFamily: 'var(--mono)' }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(6, 182, 212, 0.05)' }} />
          <Legend
            wrapperStyle={{ fontFamily: 'var(--mono)', fontSize: '0.65rem', color: 'var(--muted)' }}
            formatter={(value) => value.replace('dioliveira07/', '')}
          />
          {activity.repos.map((repo, i) => (
            <Bar
              key={repo}
              dataKey={repo}
              stackId="a"
              fill={NEON_COLORS[i % NEON_COLORS.length]}
              radius={i === activity.repos.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]}
            >
              {activity.data.map((_, di) => (
                <Cell
                  key={di}
                  fill={NEON_COLORS[i % NEON_COLORS.length]}
                  fillOpacity={0.85}
                />
              ))}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
