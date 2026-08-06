import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useApi } from '../hooks/useApi.js';
import { Icon } from '../components/icons.js';

interface T {
  id: number;
  title: string;
  heatIndex: number;
  heatScore: number | null;
  velocityScore: number | null;
  matchedKeyword: string | null;
  isRumor: boolean | null;
  firstSeenAt: string;
  lastSeenAt: string;
  publishedAt?: string | null;
  mentionCount: number;
  source?: { name?: string; slug?: string };
}

interface KeywordOption { value: string; label: string; count: number; }
interface SourceOption { id: number; name: string; slug: string; count: number; }
interface FilterOptions { keywords: KeywordOption[]; sources: SourceOption[]; }

const SORTS = [
  { v: 'recommendScore', l: '综合推荐' },
  { v: 'heatScore', l: '热度值' },
  { v: 'velocityScore', l: '增速' },
  { v: 'heatIndex', l: '热力值' },
  { v: 'mentionCount', l: '连续上榜' },
  { v: 'publishedAt', l: '最新发布' },
  { v: 'lastSeenAt', l: '最新发现' },
];

const TIME_RANGES = [
  { v: '', l: '全部时间' },
  { v: '1h', l: '最近1小时' },
  { v: '6h', l: '最近6小时' },
  { v: '24h', l: '最近24小时' },
  { v: '7d', l: '最近7天' },
];

function formatHeat(score: number): string {
  if (score >= 10000) return (score / 10000).toFixed(1) + '万';
  return score.toLocaleString();
}

function formatTime(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function sinceIso(range: string): string {
  const hours = range === '1h' ? 1 : range === '6h' ? 6 : range === '24h' ? 24 : range === '7d' ? 168 : 0;
  return hours ? new Date(Date.now() - hours * 3600_000).toISOString() : '';
}

export function TopicsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [q, setQ] = useState(searchParams.get('q') || '');
  const [sort, setSort] = useState(() => {
    const fromUrl = searchParams.get('sort') || '';
    return SORTS.some(s => s.v === fromUrl) ? fromUrl : 'recommendScore';
  });
  const [tier, setTier] = useState(searchParams.get('tier') || '');
  const [since, setSince] = useState(searchParams.get('since') || '');
  const [keywords, setKeywords] = useState<string[]>(() => (searchParams.get('keywords') || '').split(',').filter(Boolean));
  const [sources, setSources] = useState<string[]>(() => (searchParams.get('sources') || '').split(',').filter(Boolean));
  const [page, setPage] = useState(() => Math.max(1, parseInt(searchParams.get('page') || '1') || 1));

  const { data: opts } = useApi<FilterOptions>('/api/v1/topics/filter-options');

  const syncParams = (next: Record<string, string | string[] | number>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) {
      if (Array.isArray(v)) {
        if (v.length) p.set(k, v.join(','));
      } else if (v !== '' && v !== 0) {
        p.set(k, String(v));
      }
    }
    setSearchParams(p, { replace: true });
  };

  const apply = (patch: Partial<{ q: string; sort: string; tier: string; since: string; keywords: string[]; sources: string[]; page: number }>) => {
    const filtersChanged = patch.q !== undefined || patch.sort !== undefined || patch.tier !== undefined || patch.since !== undefined || patch.keywords !== undefined || patch.sources !== undefined;
    const next = {
      q, sort, tier, since, keywords, sources,
      page: filtersChanged ? 1 : patch.page ?? page,
      ...patch,
    };
    setQ(next.q);
    setSort(next.sort);
    setTier(next.tier);
    setSince(next.since);
    setKeywords(next.keywords);
    setSources(next.sources);
    setPage(next.page);
    syncParams(next);
  };

  const url = useMemo(() => {
    const p = new URLSearchParams({ sort, order: 'desc', page: String(page), limit: '30' });
    if (q.trim()) p.set('keyword', q.trim());
    if (keywords.length) p.set('keywords', keywords.join(','));
    if (sources.length) p.set('sources', sources.join(','));
    if (tier) p.set('tier', tier);
    if (since) p.set('since', sinceIso(since));
    return `/api/v1/topics?${p}`;
  }, [q, sort, tier, since, keywords, sources, page]);

  const { data } = useApi<{ data: T[]; total: number }>(url);
  const topics = data?.data || [];
  const total = data?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / 30));

  const hasFilters = Boolean(q.trim() || keywords.length || sources.length || tier || since);
  const toggle = (list: string[], v: string) => list.includes(v) ? list.filter(x => x !== v) : [...list, v];
  const clearFilters = () => apply({ q: '', tier: '', since: '', keywords: [], sources: [] });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-heading font-extrabold text-text-primary tracking-tight">话题浏览</h1>
        <p className="text-text-muted text-sm mt-1">共 {total} 条话题 · 综合推荐优先展示正在爆发/上升的内容</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">
            <Icon name="search" className="w-3.5 h-3.5" />
          </span>
          <input
            value={q}
            onChange={e => apply({ q: e.target.value })}
            placeholder="搜索话题..."
            className="bg-surface-card border border-border rounded-lg pl-8 pr-3.5 py-2.5 text-[13px] font-mono w-48 focus:border-brand outline-none text-text-primary placeholder:text-text-muted transition-colors"
          />
        </div>
        <span className="self-center text-[11px] font-mono text-text-muted">排序</span>
        <Select value={sort} onChange={e => apply({ sort: e.target.value })} opts={SORTS} />
        <Select value={tier} onChange={e => apply({ tier: e.target.value })} opts={[
          { v: '', l: '全部级别' },
          { v: 'burst', l: '爆发' },
          { v: 'hot', l: '热点' },
          { v: 'rising', l: '潜力' },
        ]} />
        <span className="self-center text-[11px] font-mono text-text-muted">发现时间</span>
        <Select value={since} onChange={e => apply({ since: e.target.value })} opts={TIME_RANGES} />
        {hasFilters && (
          <button
            onClick={clearFilters}
            className="px-3 py-2 text-[12px] font-mono text-text-muted bg-surface-card border border-border rounded-lg hover:border-danger/40 hover:text-danger transition-colors"
          >
            ✕ 清除筛选
          </button>
        )}
      </div>

      <div>
        <p className="text-[11px] text-text-muted font-mono mb-1.5">关键词（每新增一个关键词自动多一个选项）</p>
        <div className="flex flex-wrap gap-1.5">
          {(opts?.keywords || []).map(k => (
            <button
              key={k.value}
              onClick={() => apply({ keywords: toggle(keywords, k.value) })}
              className={`px-2.5 py-1 text-[11px] font-mono rounded-lg border transition-colors ${
                keywords.includes(k.value)
                  ? 'bg-brand-soft text-brand border-brand/40'
                  : 'bg-surface-card text-text-muted border-border hover:border-brand/30 hover:text-text-primary'
              }`}
            >
              #{k.label} <span className="opacity-60">{k.count}</span>
            </button>
          ))}
          {!opts?.keywords?.length && <span className="text-[11px] text-text-muted">暂无关键词数据</span>}
        </div>
      </div>

      <div>
        <p className="text-[11px] text-text-muted font-mono mb-1.5">信息来源</p>
        <div className="flex flex-wrap gap-1.5">
          {(opts?.sources || []).map(s => (
            <button
              key={s.id}
              onClick={() => apply({ sources: toggle(sources, String(s.id)) })}
              className={`px-2.5 py-1 text-[11px] font-mono rounded-lg border transition-colors ${
                sources.includes(String(s.id))
                  ? 'bg-brand-soft text-brand border-brand/40'
                  : 'bg-surface-card text-text-muted border-border hover:border-brand/30 hover:text-text-primary'
              }`}
            >
              {s.name} <span className="opacity-60">{s.count}</span>
            </button>
          ))}
          {!opts?.sources?.length && <span className="text-[11px] text-text-muted">暂无来源数据</span>}
        </div>
      </div>

      <div className="space-y-1">
        {topics.map(t => (
          <Link key={t.id} to={`/topics/${t.id}`} className="card p-4 flex items-center gap-5 no-underline group hover:border-brand/20">
            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-medium text-text-primary truncate group-hover:text-brand transition-colors">{t.title}</p>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                {t.matchedKeyword && <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-brand-soft text-brand font-mono font-medium">#{t.matchedKeyword}</span>}
                {t.isRumor === true && <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md bg-danger/10 text-danger font-mono font-semibold"><Icon name="alert-triangle" className="w-3 h-3" /> 疑似谣言</span>}
                {t.isRumor === false && <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md bg-positive/10 text-positive font-mono"><Icon name="check-circle" className="w-3 h-3" /> 不是谣言</span>}
                <span className="text-[10px] text-text-muted">{t.source?.name}</span>
                <span className={`text-[10px] font-mono font-semibold ${(t.velocityScore ?? 0) > 0 ? 'text-positive' : (t.velocityScore ?? 0) < 0 ? 'text-danger' : 'text-text-muted'}`}>{(t.velocityScore ?? 0) > 0 ? '+' : ''}{(t.velocityScore ?? 0).toFixed(0)}</span>
              </div>
              <div className="flex items-center gap-3 mt-1 text-[10px] text-text-muted font-mono">
                <span className="inline-flex items-center gap-1"><Icon name="clock" className="w-3 h-3" /> 发布 {formatTime(t.publishedAt) || '—'}</span>
                <span className="inline-flex items-center gap-1"><Icon name="radar" className="w-3 h-3" /> 发现 {formatTime(t.firstSeenAt)}</span>
                <span className="opacity-60" title="同一来源连续多轮采集到该话题的次数">连续上榜 {t.mentionCount} 次</span>
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <span className="text-xl font-heading font-extrabold text-positive tabular-nums">{t.heatScore != null ? formatHeat(t.heatScore) : t.heatIndex.toFixed(0)}</span>
              <span className="block text-[10px] text-text-muted font-mono">热度值</span>
            </div>
          </Link>
        ))}
        {!topics.length && !data && (
          <div className="card p-10 text-center">
            <p className="text-text-muted text-sm">加载中...</p>
          </div>
        )}
        {!topics.length && data && (
          <div className="card p-10 text-center space-y-3">
            <span className="mx-auto w-12 h-12 rounded-2xl bg-brand-soft text-brand flex items-center justify-center">
              <Icon name="radar" className="w-6 h-6" />
            </span>
            <p className="text-text-muted text-sm">没有符合条件的话题</p>
            {hasFilters && (
              <button
                onClick={clearFilters}
                className="px-3.5 py-2 text-[12px] font-mono text-brand border border-brand/30 rounded-lg hover:bg-brand/10 transition-colors"
              >
                清除全部筛选
              </button>
            )}
          </div>
        )}
      </div>

      {total > 30 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <button onClick={() => apply({ page: Math.max(1, page - 1) })} disabled={page === 1} className="px-3.5 py-2 text-[12px] font-mono text-text-muted bg-surface-card border border-border rounded-lg hover:border-brand disabled:opacity-30 transition-colors">上一页</button>
          <span className="text-[12px] text-text-muted font-mono">{page} / {totalPages}</span>
          <button onClick={() => apply({ page: Math.min(totalPages, page + 1) })} disabled={page >= totalPages} className="px-3.5 py-2 text-[12px] font-mono text-text-muted bg-surface-card border border-border rounded-lg hover:border-brand disabled:opacity-30 transition-colors">下一页</button>
        </div>
      )}
    </div>
  );
}

function Select({ value, onChange, opts }: { value: string; onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void; opts: { v: string; l: string }[] }) {
  return <select value={value} onChange={onChange} className="bg-surface-card border border-border rounded-lg px-3 py-2.5 text-[13px] font-mono outline-none text-text-primary transition-colors cursor-pointer hover:border-brand/30 focus:border-brand">{opts.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}</select>;
}
