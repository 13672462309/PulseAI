import { useEffect, useRef } from 'react';
import { Link } from 'react-router';
import { useApi } from '../hooks/useApi.js';

interface VT { id: number; title: string; velocityScore: number | null; heatIndex: number; heatScore: number | null; growthRate: number | null; aiCategory: string | null; tier: string | null; source: { name: string }; }

// Absolute heat display: thousands with locale separators, 万 for 10k+
function formatHeat(score: number): string {
  if (score >= 10000) return (score / 10000).toFixed(1) + '万';
  return score.toLocaleString();
}

const TIER = {
  burst:  { emoji: '🚀', label: '爆发', bg: 'bg-danger/8', border: 'border-danger/25', text: 'text-danger' },
  hot:    { emoji: '🔥', label: '热点', bg: 'bg-warning/8', border: 'border-warning/20', text: 'text-warning' },
  rising: { emoji: '📈', label: '潜力', bg: 'bg-positive/8', border: 'border-positive/20', text: 'text-positive' },
} as const;

export function VelocityGrid() {
  // 实时话题按热度值（heatScore，无界绝对热度）降序展示
  const { data, loading } = useApi<VT[]>('/api/v1/topics/hot?limit=24');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!data?.length || !ref.current) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    import('gsap').then(({ gsap }) => {
      gsap.from(ref.current!.querySelectorAll('.grid-item'), {
        opacity: 0, y: 24, scale: 0.94,
        duration: 0.5, stagger: { each: 0.05, from: 'start', grid: 'auto' },
        ease: 'power3.out',
      });
    });
  }, [data]);

  if (loading) return <GridSkeleton />;
  if (!data?.length) return <EmptyState />;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-text-primary">实时话题</h2>
        <div className="flex items-center gap-3 text-[11px] text-text-muted font-mono">
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-danger" /> 爆发</span>
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-warning" /> 热点</span>
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-positive" /> 潜力</span>
          <Link to="/topics" className="text-brand hover:underline ml-2">查看全部 →</Link>
        </div>
      </div>

      <div ref={ref} className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {data.map(t => {
          const tier = t.tier ? TIER[t.tier as keyof typeof TIER] : undefined;
          const tierBorder = tier ? tier.border : 'border-border';
          const heatPct = Math.min(t.heatIndex, 100);
          const barColor = t.tier === 'burst' ? 'bg-danger' : t.tier === 'rising' ? 'bg-positive' : 'bg-warning';

          return (
            <Link key={t.id} to={`/topics/${t.id}`}
              className={`grid-item glow-card card p-4 no-underline group ${tierBorder} ${t.tier === 'burst' ? 'fracture' : ''}`}
            >
              {/* Tier badge */}
              <div className="flex items-center justify-between mb-3">
                {tier ? (
                  <span className={`text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded ${tier.bg} ${tier.text}`}>
                    {tier.emoji} {tier.label}
                  </span>
                ) : (
                  <span className="text-[10px] font-mono text-text-muted">{t.aiCategory || '未分类'}</span>
                )}
                {(() => {
                  const v = t.velocityScore ?? 0;
                  return (
                    <span className={`text-[11px] font-mono font-semibold tabular-nums ${v > 15 ? 'text-danger' : v > 5 ? 'text-warning' : 'text-positive'}`}>
                      {v > 0 ? '+' : ''}{v.toFixed(0)}
                    </span>
                  );
                })()}
              </div>

              {/* Title */}
              <p className="text-[13px] font-medium text-text-primary leading-snug line-clamp-2 mb-3 group-hover:text-brand transition-colors">
                {t.title}
              </p>

              {/* Heat bar */}
              <div className="h-1 bg-white/[0.06] rounded-full overflow-hidden mb-2.5">
                <div className={`h-full rounded-full transition-all duration-700 ${barColor}`} style={{ width: `${heatPct}%` }} />
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between text-[10px] text-text-muted font-mono">
                <span className="truncate">{t.source?.name}</span>
                <span className="tabular-nums">{t.heatScore != null ? formatHeat(t.heatScore) : t.heatIndex.toFixed(0)}</span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-3">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="card p-4 space-y-2.5">
          <div className="skeleton h-2 w-10" />
          <div className="skeleton h-3.5 w-full" />
          <div className="skeleton h-3.5 w-3/4" />
          <div className="skeleton h-1 w-full rounded-full" />
          <div className="skeleton h-2 w-14" />
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="card p-12 text-center">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="mx-auto mb-4 text-text-muted opacity-30">
        <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
      </svg>
      <p className="text-text-muted">暂无数据 — 点击「立即扫描」开始采集</p>
    </div>
  );
}
