import { useParams, Link } from 'react-router';
import { useApi } from '../hooks/useApi.js';
import { TopicDetailChart } from '../components/TopicDetailChart.js';

interface HP { heatIndex: number; heatScore: number | null; growthRate: number | null; recordedAt: string; }
interface TD { id: number; title: string; url: string | null; heatIndex: number; heatScore: number | null; velocityScore: number | null; growthRate: number | null; peakHeat: number; mentionCount: number; sourceRank: number | null; aiVerified: number; aiSummary: string | null; aiCategory: string | null; matchedKeyword: string | null; firstSeenAt: string; lastSeenAt: string; source?: { name: string; slug: string }; history: HP[]; }

function formatHeat(score: number): string {
  if (score >= 10000) return (score / 10000).toFixed(1) + '万';
  return score.toLocaleString();
}

export function TopicDetailPage() {
  const { id } = useParams();
  const { data: t } = useApi<TD>(`/api/v1/topics/${id}`);

  if (!t) return <div className="space-y-3"><div className="skeleton h-8 w-1/2" /><div className="skeleton h-24 w-full rounded-xl" /><div className="skeleton h-60 w-full rounded-xl" /></div>;
  if (t.id === undefined) return <div className="card p-8 text-center"><p className="text-text-muted">话题未找到</p><Link to="/topics" className="text-brand text-sm mt-2 inline-block">返回列表</Link></div>;

  return (
    <div className="space-y-5">
      <Link to="/topics" className="inline-flex items-center gap-1 text-text-muted text-sm hover:text-brand transition-colors">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
        话题列表
      </Link>

      <div className="card p-6">
        <div className="flex items-start gap-6">
          <div className="flex-1">
            <h1 className="text-xl font-heading font-extrabold text-text-primary mb-3">{t.title}</h1>
            <div className="flex flex-wrap items-center gap-2 mb-3">
              {t.matchedKeyword && <span className="text-[11px] px-2.5 py-1 rounded-lg bg-brand-soft text-brand font-mono font-medium">#{t.matchedKeyword}</span>}
              {t.source && <span className="text-[11px] text-text-muted font-mono">{t.source.name}</span>}
            </div>
          </div>
          <div className="flex gap-3">
            <StatPill value={t.heatScore != null ? formatHeat(t.heatScore) : '—'} label="热度值" />
            <StatPill value={t.heatIndex.toFixed(0)} label="热力值" />
            {t.velocityScore != null && <StatPill value={t.velocityScore.toFixed(0)} label="增速" color="warning" />}
          </div>
        </div>
      </div>

      <TopicDetailChart history={t.history || []} />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Meta label="峰值热力值" value={t.peakHeat.toFixed(0)} />
        <Meta label="提及次数" value={String(t.mentionCount)} />
        <Meta label="来源排名" value={t.sourceRank?.toString() || '—'} />
        <Meta label="首次发现" value={new Date(t.firstSeenAt).toLocaleDateString('zh-CN')} />
      </div>
    </div>
  );
}

function StatPill({ value, label, color }: { value: string; label: string; color?: string }) {
  return <div className="card px-4 py-3 text-center"><span className={`text-2xl font-heading font-extrabold tabular-nums ${color === 'warning' ? 'text-warning' : 'text-positive'}`}>{value}</span><span className="block text-[10px] text-text-muted font-mono mt-0.5">{label}</span></div>;
}

function Meta({ label, value }: { label: string; value: string }) {
  return <div className="card p-3.5 text-center"><span className="text-base font-heading font-bold text-text-primary">{value}</span><span className="block text-[10px] text-text-muted mt-1">{label}</span></div>;
}
