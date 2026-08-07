import { useParams, Link } from 'react-router';
import type { Engagement } from '@shared/types.js';
import { useApi } from '../hooks/useApi.js';
import { TopicDetailChart } from '../components/TopicDetailChart.js';
import { Icon } from '../components/icons.js';
import { engagementFields, formatHeat } from '../utils/format.js';

interface HP { heatIndex: number; heatScore: number | null; growthRate: number | null; recordedAt: string; }
interface TD { id: number; title: string; url: string | null; heatIndex: number; heatScore: number | null; velocityScore: number | null; growthRate: number | null; peakHeat: number; mentionCount: number; sourceRank: number | null; aiVerified: number; isRumor: boolean | null; isActionable: boolean | null; matchReason: string | null; matchConfidence: number | null; engagement?: Engagement | null; matchedKeyword: string | null; tier: string | null; firstSeenAt: string; lastSeenAt: string; publishedAt?: string | null; source?: { name: string; slug: string }; history: HP[]; }

const TIER_BADGE: Record<string, { icon: string; label: string; cls: string }> = {
  burst: { icon: 'rocket', label: '爆发', cls: 'bg-danger/10 text-danger border-danger/25' },
  hot: { icon: 'flame', label: '热点', cls: 'bg-warning/10 text-warning border-warning/25' },
  rising: { icon: 'trending-up', label: '潜力', cls: 'bg-positive/10 text-positive border-positive/25' },
};

export function TopicDetailPage() {
  const { id } = useParams();
  const { data: t } = useApi<TD>(`/api/v1/topics/${id}`);
  const engFields = t ? engagementFields(t.engagement, t.source?.slug) : [];

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
              {t.tier && TIER_BADGE[t.tier] && (
                <span className={`inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-lg border font-mono font-semibold ${TIER_BADGE[t.tier].cls}`}>
                  <Icon name={TIER_BADGE[t.tier].icon} className="w-3.5 h-3.5" /> {TIER_BADGE[t.tier].label}
                </span>
              )}
              {t.isRumor === true && <span className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-lg bg-danger/10 text-danger font-mono font-semibold"><Icon name="alert-triangle" className="w-3.5 h-3.5" /> 疑似谣言</span>}
              {t.isRumor === false && <span className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-lg bg-positive/10 text-positive font-mono"><Icon name="check-circle" className="w-3.5 h-3.5" /> 不是谣言</span>}
              {t.isActionable === true && <span className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-lg bg-warning/10 text-warning font-mono font-semibold"><Icon name="zap" className="w-3.5 h-3.5" /> 值得关注</span>}
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

      <div className="card p-5 space-y-4">
        <div>
          <h3 className="text-sm font-heading font-semibold text-text-primary mb-2">AI 相关性分析</h3>
          {t.matchReason ? (
            <p className="text-[13px] text-text-secondary leading-relaxed flex items-start gap-2">
              <Icon name="activity" className="w-4 h-4 mt-0.5 shrink-0 text-brand" />
              <span>{t.matchReason}</span>
              {t.matchConfidence != null && (
                <span className="ml-auto shrink-0 text-[11px] font-mono text-text-muted">
                  置信 {Math.round(t.matchConfidence * 100)}%
                </span>
              )}
            </p>
          ) : (
            <p className="text-[12px] text-text-muted">暂无理由，等待下一轮 AI 分析</p>
          )}
        </div>
        {engFields.length > 0 && (
          <div>
            <h3 className="text-sm font-heading font-semibold text-text-primary mb-2">互动数据</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
              {engFields.map(f => <Meta key={f.label} label={f.label} value={f.value} />)}
            </div>
          </div>
        )}
      </div>

      <TopicDetailChart history={t.history || []} />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Meta label="峰值热力值" value={t.peakHeat.toFixed(0)} />
        <Meta label="连续上榜次数" value={String(t.mentionCount)} />
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
