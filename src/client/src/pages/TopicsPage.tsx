import { useState, useMemo, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useApi } from '../hooks/useApi.js';

interface T { id: number; title: string; heatIndex: number; heatScore: number | null; velocityScore: number | null; aiCategory: string | null; matchedKeyword: string | null; isRumor: boolean | null; aiVerified: number; firstSeenAt: string; mentionCount: number; source?: { name?: string }; }

function formatHeat(score: number): string {
  if (score >= 10000) return (score / 10000).toFixed(1) + '万';
  return score.toLocaleString();
}

export function TopicsPage() {
  const [searchParams] = useSearchParams();
  const [q, setQ] = useState(''); const [sort, setSort] = useState('heatScore'); const [cat, setCat] = useState(''); const [tier, setTier] = useState(searchParams.get('tier') || ''); const [page, setPage] = useState(1);
  // Sync tier filter from URL (e.g. KPI cards link to /topics?tier=hot) — same route does not remount
  useEffect(() => { setTier(searchParams.get('tier') || ''); setPage(1); }, [searchParams]);
  const url = useMemo(() => { const p = new URLSearchParams({ sort, order: 'desc', page: String(page), limit: '30' }); if (q.trim()) p.set('keyword', q.trim()); if (cat) p.set('category', cat); if (tier) p.set('tier', tier); return `/api/v1/topics?${p}`; }, [q, sort, cat, tier, page]);
  const { data } = useApi<{ data: T[]; total: number }>(url);
  const topics = data?.data || [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-heading font-extrabold text-text-primary tracking-tight">话题浏览</h1>
        <p className="text-text-muted text-sm mt-1">浏览和筛选所有采集到的话题</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <input value={q} onChange={e => { setQ(e.target.value); setPage(1); }} placeholder="搜索话题..." className="bg-surface-card border border-border rounded-lg px-3.5 py-2.5 text-[13px] font-mono w-48 focus:border-brand outline-none text-text-primary placeholder:text-text-muted transition-colors" />
        <Select value={sort} onChange={e => setSort(e.target.value)} opts={[{v:'heatScore',l:'热度值'},{v:'velocityScore',l:'增速'},{v:'heatIndex',l:'热力值'},{v:'firstSeenAt',l:'时间'},{v:'mentionCount',l:'提及'}]} />
        <Select value={cat} onChange={e => { setCat(e.target.value); setPage(1); }} opts={[{v:'',l:'全部分类'},{v:'科技',l:'科技'},{v:'财经',l:'财经'},{v:'娱乐',l:'娱乐'},{v:'社会',l:'社会'},{v:'国际',l:'国际'}]} />
        <Select value={tier} onChange={e => { setTier(e.target.value); setPage(1); }} opts={[{v:'',l:'全部级别'},{v:'burst',l:'🚀 爆发'},{v:'hot',l:'🔥 热点'},{v:'rising',l:'📈 潜力'}]} />
      </div>

      <div className="space-y-1">
        {topics.map(t => (
          <Link key={t.id} to={`/topics/${t.id}`} className="card p-4 flex items-center gap-5 no-underline group hover:border-brand/20">
            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-medium text-text-primary truncate group-hover:text-brand transition-colors">{t.title}</p>
              <div className="flex items-center gap-2 mt-1.5">
                {t.matchedKeyword && <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-brand-soft text-brand font-mono font-medium">#{t.matchedKeyword}</span>}
                {t.isRumor === true && <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-danger/10 text-danger font-mono font-semibold">⚠️ 疑似谣言</span>}
                {t.isRumor === false && <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-positive/10 text-positive font-mono">√ 不是谣言</span>}
                <span className="text-[10px] text-text-muted">{t.source?.name}</span>
                <span className="text-[10px] font-mono font-semibold text-positive">{(t.velocityScore ?? 0) > 0 ? '+' : ''}{(t.velocityScore ?? 0).toFixed(0)}</span>
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <span className="text-xl font-heading font-extrabold text-positive tabular-nums">{t.heatScore != null ? formatHeat(t.heatScore) : t.heatIndex.toFixed(0)}</span>
              <span className="block text-[10px] text-text-muted font-mono">热度值</span>
            </div>
          </Link>
        ))}
      </div>

      {(data?.total || 0) > 30 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3.5 py-2 text-[12px] font-mono text-text-muted bg-surface-card border border-border rounded-lg hover:border-brand disabled:opacity-30 transition-colors">上一页</button>
          <span className="text-[12px] text-text-muted font-mono">{page} / {Math.ceil((data?.total || 0) / 30)}</span>
          <button onClick={() => setPage(p => p + 1)} disabled={page >= Math.ceil((data?.total || 0) / 30)} className="px-3.5 py-2 text-[12px] font-mono text-text-muted bg-surface-card border border-border rounded-lg hover:border-brand disabled:opacity-30 transition-colors">下一页</button>
        </div>
      )}
    </div>
  );
}

function Select({ value, onChange, opts }: { value: string; onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void; opts: { v: string; l: string }[] }) {
  return <select value={value} onChange={onChange} className="bg-surface-card border border-border rounded-lg px-3 py-2.5 text-[13px] font-mono outline-none text-text-primary transition-colors">{opts.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}</select>;
}
