import { useEffect, useRef } from 'react';
import { Link } from 'react-router';
import { useApi } from '../hooks/useApi.js';

interface VT { id: number; title: string; velocityScore: number | null; heatIndex: number; growthRate: number | null; aiCategory: string | null; tier: string | null; source: { name: string }; }

export function VelocityGrid() {
  const { data, loading } = useApi<VT[]>('/api/v1/stats/velocity');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!data?.length || !ref.current) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    import('gsap').then(({ gsap }) => {
      gsap.from(ref.current!.querySelectorAll('.grid-item'), {
        opacity: 0, y: 20, scale: 0.96,
        duration: 0.4, stagger: { each: 0.05, from: 'start', grid: 'auto' },
        ease: 'power3.out',
      });
    });
  }, [data]);

  if (loading) return <GridSkeleton />;
  if (!data?.length) return <EmptyState />;

  return (
    <div ref={ref} className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-3">
      {data.map(t => {
        const tierBadge = t.tier === 'burst' ? { emoji: '🚀', label: '爆发', bg: 'bg-danger/10', border: 'border-danger/30', text: 'text-danger' }
          : t.tier === 'hot' ? { emoji: '🔥', label: '热点', bg: 'bg-warning/10', border: 'border-warning/20', text: 'text-warning' }
          : t.tier === 'rising' ? { emoji: '📈', label: '潜力', bg: 'bg-positive/10', border: 'border-positive/20', text: 'text-positive' }
          : null;

        const accent = t.tier === 'burst' ? 'border-danger/30' : t.tier === 'rising' ? 'border-positive/20' : 'border-border';
        const heatBar = t.heatIndex > 80 ? 'bg-danger' : t.heatIndex > 60 ? 'bg-warning' : 'bg-positive';

        return (
          <Link key={t.id} to={`/topics/${t.id}`} className={`grid-item card p-4 no-underline group ${accent} hover:border-brand/30`}>
            <div className="flex items-center justify-between mb-2">
              {tierBadge ? (
                <span className={`text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded ${tierBadge.bg} ${tierBadge.text}`}>
                  {tierBadge.emoji} {tierBadge.label}
                </span>
              ) : (
                <span className="text-[10px] font-mono text-text-muted uppercase tracking-wider">{t.aiCategory || '未分类'}</span>
              )}
              {t.velocityScore != null && (
                <span className={`text-[11px] font-mono font-semibold ${t.velocityScore > 20 ? 'text-danger' : t.velocityScore > 8 ? 'text-warning' : 'text-positive'}`}>
                  {t.velocityScore > 0 ? '+' : ''}{t.velocityScore.toFixed(0)}
                </span>
              )}
            </div>
            <p className="text-[13px] font-medium text-text-primary leading-snug line-clamp-2 mb-3">{t.title}</p>
            <div className="h-1 bg-white/[0.06] rounded-full overflow-hidden mb-2.5">
              <div className={`h-full rounded-full transition-all duration-700 ${heatBar}`} style={{ width: `${Math.min(Math.max(t.heatIndex, 0), 100)}%` }} />
            </div>
            <div className="flex items-center justify-between text-[10px] text-text-muted font-mono">
              <span className="truncate">{t.source?.name}</span>
              <span className="tabular-nums ml-2">{t.heatIndex.toFixed(0)}</span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-3">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="card p-4 space-y-2.5">
          <div className="skeleton h-2.5 w-10" />
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
    <div className="card p-10 text-center">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="mx-auto mb-3 text-text-muted opacity-40">
        <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
      </svg>
      <p className="text-text-muted text-sm">暂无数据</p>
      <p className="text-text-muted text-xs mt-1 opacity-60">等待首次爬取或手动触发</p>
    </div>
  );
}
