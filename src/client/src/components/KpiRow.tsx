import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useApi } from '../hooks/useApi.js';
import { Icon } from './icons.js';

interface Stats {
  burstCount: number;
  hotCount: number;
  risingCount: number;
  activeTopics: number;
  velocityBreakouts: number;
  alertsToday: number;
  sourcesOnline: number;
  sourcesTotal: number;
}

type CardDef = {
  key: string;
  label: string;
  icon: string;
  color: string;
  bg: string;
  border: string;
  strip: string;
  link?: string;
  fmt?: (value: number, stats: Stats) => string;
};

const cards: CardDef[] = [
  {
    key: 'burstCount', label: '爆发话题 · 7d', icon: 'rocket',
    color: 'text-danger', bg: 'bg-danger/5', border: 'border-danger/20',
    strip: 'from-danger to-warning', link: '/topics?tier=burst',
  },
  {
    key: 'hotCount', label: '热点话题 · 7d', icon: 'flame',
    color: 'text-warning', bg: 'bg-warning/5', border: 'border-warning/20',
    strip: 'from-warning to-amber-400', link: '/topics?tier=hot',
  },
  {
    key: 'risingCount', label: '潜力话题 · 7d', icon: 'trending-up',
    color: 'text-positive', bg: 'bg-positive/5', border: 'border-positive/20',
    strip: 'from-positive to-brand', link: '/topics?tier=rising',
  },
  {
    key: 'sourcesOnline', label: '数据源在线', icon: 'radio',
    color: 'text-brand', bg: 'bg-brand/5', border: 'border-brand/20',
    strip: 'from-brand to-brand-cyan',
    fmt: (_: number, s: Stats) => `${s.sourcesOnline}/${s.sourcesTotal}`,
  },
];

// 数字滚动动画：尊重 prefers-reduced-motion
function useCountUp(target: number | undefined, duration = 700) {
  const [value, setValue] = useState(0);
  const prevRef = useRef(0);

  useEffect(() => {
    if (target === undefined) return;
    const from = prevRef.current;
    const to = target;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      prevRef.current = to;
      setValue(to);
      return;
    }
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      const v = Math.round(from + (to - from) * eased);
      prevRef.current = v;
      setValue(v);
      if (p < 1) raf = requestAnimationFrame(tick);
      else prevRef.current = to;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return value;
}

export function KpiRow() {
  const { data: s } = useApi<Stats>('/api/v1/stats');

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {cards.map(({ key, label, icon, color, bg, border, strip, fmt, link }) => {
        const raw = s ? (s[key as keyof Stats] as number) : undefined;
        const count = useCountUp(raw);
        const inner = (
          <>
            <span className={`absolute inset-x-5 top-0 h-0.5 rounded-full bg-gradient-to-r ${strip} opacity-70`} />
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono text-text-muted uppercase tracking-wider">{label}</span>
              <span className={`w-8 h-8 rounded-lg ${bg} border ${border} flex items-center justify-center ${color}`}>
                <Icon name={icon} className="w-4 h-4" />
              </span>
            </div>
            <span className={`text-3xl font-heading font-extrabold tabular-nums tracking-tight ${color}`}>
              {s ? (fmt ? fmt(count, s) : count) : '—'}
            </span>
          </>
        );
        const cls = `${key === 'burstCount' ? 'moving-border [&::before]:opacity-100' : 'moving-border'} ${bg} ${border} rounded-2xl p-5 relative overflow-hidden`;
        return link ? (
          <Link key={key} to={link} className={`${cls} no-underline block group hover:border-brand/30 transition-colors`}>{inner}</Link>
        ) : (
          <div key={key} className={`${cls} cursor-default`}>{inner}</div>
        );
      })}
    </div>
  );
}
