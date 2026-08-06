import { Link } from 'react-router';
import { useApi } from '../hooks/useApi.js';

interface Stats { burstCount: number; hotCount: number; risingCount: number; activeTopics: number; velocityBreakouts: number; alertsToday: number; sourcesOnline: number; sourcesTotal: number; }

type CardDef = {
  key: string; label: string; icon: string; color: string; bg: string; border: string;
  link?: string;
  fmt?: (value: number, stats: Stats) => string;
};

const cards: CardDef[] = [
  { key: 'burstCount', label: '爆发话题 · 7d', icon: '🚀', color: 'text-danger', bg: 'bg-danger/5', border: 'border-danger/20', link: '/topics?tier=burst' },
  { key: 'hotCount', label: '热点话题 · 7d', icon: '🔥', color: 'text-warning', bg: 'bg-warning/5', border: 'border-warning/20', link: '/topics?tier=hot' },
  { key: 'risingCount', label: '潜力话题 · 7d', icon: '📈', color: 'text-positive', bg: 'bg-positive/5', border: 'border-positive/20', link: '/topics?tier=rising' },
  { key: 'sourcesOnline', label: '数据源在线', icon: '📡', color: 'text-brand', bg: 'bg-brand/5', border: 'border-brand/20', fmt: (_: number, s: Stats) => `${s.sourcesOnline}/${s.sourcesTotal}` },
];

export function KpiRow() {
  const { data: s } = useApi<Stats>('/api/v1/stats');

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {cards.map(({ key, label, icon, color, bg, border, fmt, link }) => {
        const inner = (
          <>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono text-text-muted uppercase tracking-wider">{label}</span>
              <span className="text-base">{icon}</span>
            </div>
            <span className={`text-3xl font-extrabold tabular-nums tracking-tight ${color}`}>
              {s ? (fmt ? fmt(s[key as keyof Stats] as number, s) : s[key as keyof Stats] as number) : '—'}
            </span>
          </>
        );
        const cls = `${key === 'burstCount' ? 'moving-border [&::before]:opacity-100' : 'moving-border'} ${bg} ${border} rounded-2xl p-5`;
        return link ? (
          <Link key={key} to={link} className={`${cls} no-underline block group hover:border-brand/30 transition-colors`}>{inner}</Link>
        ) : (
          <div key={key} className={`${cls} cursor-default`}>{inner}</div>
        );
      })}
    </div>
  );
}
