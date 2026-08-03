import { useApi } from '../hooks/useApi.js';

interface Stats { burstCount: number; hotCount: number; risingCount: number; activeTopics: number; velocityBreakouts: number; alertsToday: number; sourcesOnline: number; sourcesTotal: number; }

const cards = [
  { key: 'burstCount', label: '爆发话题', icon: '🚀', color: 'text-danger', bg: 'bg-danger/5', border: 'border-danger/20' },
  { key: 'hotCount', label: '热点话题', icon: '🔥', color: 'text-warning', bg: 'bg-warning/5', border: 'border-warning/20' },
  { key: 'risingCount', label: '潜力话题', icon: '📈', color: 'text-positive', bg: 'bg-positive/5', border: 'border-positive/20' },
  { key: 'sourcesOnline', label: '数据源在线', icon: '📡', color: 'text-brand', bg: 'bg-brand/5', border: 'border-brand/20', fmt: (_: number, s: Stats) => `${s.sourcesOnline}/${s.sourcesTotal}` },
] as const;

export function KpiRow() {
  const { data: s } = useApi<Stats>('/api/v1/stats');

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {cards.map(({ key, label, icon, color, bg, border, fmt }) => (
        <div key={key} className={`moving-border ${bg} ${border} rounded-2xl p-5 cursor-default`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-mono text-text-muted uppercase tracking-wider">{label}</span>
            <span className="text-base">{icon}</span>
          </div>
          <span className={`text-3xl font-extrabold tabular-nums tracking-tight ${color}`}>
            {s ? (fmt ? fmt(s[key as keyof Stats] as number, s) : s[key as keyof Stats] as number) : '—'}
          </span>
        </div>
      ))}
    </div>
  );
}
