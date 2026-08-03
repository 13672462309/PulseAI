import { useApi } from '../hooks/useApi.js';

interface Stats { activeTopics: number; velocityBreakouts: number; alertsToday: number; sourcesOnline: number; sourcesTotal: number; }

const config = [
  { key: 'burstCount', label: '🚀 爆发话题', format: (v: number) => v, color: 'text-danger' },
  { key: 'hotCount', label: '🔥 热点话题', format: (v: number) => v, color: 'text-warning' },
  { key: 'risingCount', label: '📈 潜力话题', format: (v: number) => v, color: 'text-positive' },
  { key: 'sourcesOnline', label: '数据源', format: (_: number, s: Stats) => `${(s as any).sourcesOnline ?? 0}/${(s as any).sourcesTotal ?? 0}`, color: 'text-brand' },
] as const;

interface Stats {
  burstCount: number; hotCount: number; risingCount: number;
  activeTopics: number; velocityBreakouts: number; alertsToday: number;
  sourcesOnline: number; sourcesTotal: number;
}

export function KpiRow() {
  const { data: s } = useApi<Stats>('/api/v1/stats');

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {config.map(({ key, label, format, color }) => (
        <div key={key} className="kpi-card card p-5 group">
          <span className={`text-3xl font-heading font-extrabold tabular-nums tracking-tight count-in ${color}`}>
            {s ? format(s[key as keyof Stats] as number, s) : '—'}
          </span>
          <span className="block text-text-muted text-[12px] font-medium mt-1.5">{label}</span>
        </div>
      ))}
    </div>
  );
}
