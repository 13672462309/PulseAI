import { useEffect, useRef } from 'react';
import { Link } from 'react-router';
import { useApi } from '../hooks/useApi.js';
import { TopicRow, type TopicRowData } from './TopicRow.js';

interface VT extends TopicRowData {}

export function VelocityGrid() {
  // 实时话题按热度值（heatScore，无界绝对热度）降序展示
  const { data, loading } = useApi<VT[]>('/api/v1/topics/hot?limit=24');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!data?.length || !ref.current) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    import('gsap').then(({ gsap }) => {
      gsap.from(ref.current!.querySelectorAll('.topic-row'), {
        opacity: 0, y: 16,
        duration: 0.45, stagger: 0.04,
        ease: 'power2.out',
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

      <div ref={ref} className="space-y-2">
        {data.map(t => (
          <div key={t.id} className="topic-row">
            <TopicRow topic={t} />
          </div>
        ))}
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
