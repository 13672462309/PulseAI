import { useState } from 'react';
import { Link } from 'react-router';
import type { Engagement, StockLinkSummary } from '@shared/types.js';
import { Icon } from './icons.js';
import { formatHeat, formatTime, primaryEngagement } from '../utils/format.js';

export interface TopicRowData {
  id: number;
  title: string;
  normalizedTitle?: string;
  heatIndex: number;
  heatScore: number | null;
  growthRate?: number | null;
  velocityScore: number | null;
  matchedKeyword: string | null;
  isRumor: boolean | null;
  isActionable: boolean | null;
  matchReason?: string | null;
  matchConfidence?: number | null;
  engagement?: Engagement | null;
  tier?: string | null;
  sourceRank?: number | null;
  source?: { name?: string; slug?: string } | null;
  firstSeenAt?: string | null;
  publishedAt?: string | null;
  mentionCount?: number;
  stockLinks?: StockLinkSummary[] | null;
}

// Only sources with a real hot list get a "#N 来源" rank badge.
const HOTLIST_SOURCES = new Set(['weibo', 'baidu', 'bilibili']);

const TIER: Record<string, { icon: string; label: string; cls: string; border: string; bar: string }> = {
  burst: { icon: 'rocket', label: '爆发', cls: 'bg-danger/10 text-danger border-danger/25', border: 'border-danger/25', bar: 'from-danger to-warning' },
  hot: { icon: 'flame', label: '热点', cls: 'bg-warning/10 text-warning border-warning/25', border: 'border-warning/25', bar: 'from-warning to-amber-400' },
  rising: { icon: 'trending-up', label: '潜力', cls: 'bg-positive/10 text-positive border-positive/25', border: 'border-positive/25', bar: 'from-positive to-brand' },
};

export function TopicRow({ topic: t }: { topic: TopicRowData }) {
  const [expanded, setExpanded] = useState(false);
  const slug = t.source?.slug;
  const showRank = Boolean(
    slug && HOTLIST_SOURCES.has(slug) && t.sourceRank != null && t.sourceRank > 0 && t.sourceRank <= 10,
  );
  const primary = primaryEngagement(t.engagement, slug);
  const reason = t.matchReason;
  const tier = t.tier ? TIER[t.tier] : undefined;
  const velocity = t.velocityScore ?? 0;

  return (
    <div className={`card p-4 relative overflow-hidden ${tier ? tier.border : 'border-border'} transition-colors hover:border-brand/25`}>
      {tier && <span className={`absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r ${tier.bar} opacity-60`} />}

      <div className="flex items-start gap-4">
        {/* Source + hot-list rank */}
        <div className="w-32 shrink-0 pt-0.5">
          {showRank ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-mono font-semibold px-2 py-1 rounded-lg bg-brand-soft text-brand border border-brand/20 whitespace-nowrap">
              #{t.sourceRank} {t.source?.name}
            </span>
          ) : (
            <span className="text-[11px] font-mono text-text-muted">{t.source?.name ?? '未知来源'}</span>
          )}
        </div>

        {/* Title / badges / AI reason / meta */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <Link
              to={`/topics/${t.id}`}
              className="text-[14px] font-medium text-text-primary line-clamp-2 leading-snug hover:text-brand transition-colors no-underline mr-1"
            >
              {t.title}
            </Link>
            {tier && (
              <span className={`inline-flex items-center gap-1 text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded border ${tier.cls}`}>
                <Icon name={tier.icon} className="w-3 h-3" /> {tier.label}
              </span>
            )}
            {t.matchedKeyword && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-brand-soft text-brand font-mono font-medium">
                #{t.matchedKeyword}
              </span>
            )}
            {t.isRumor === true && (
              <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md bg-danger/10 text-danger font-mono font-semibold">
                <Icon name="alert-triangle" className="w-3 h-3" /> 疑似谣言
              </span>
            )}
            {t.isRumor === false && (
              <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md bg-positive/10 text-positive font-mono">
                <Icon name="check-circle" className="w-3 h-3" /> 不是谣言
              </span>
            )}
            {t.isActionable === true && (
              <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md bg-warning/10 text-warning font-mono font-semibold">
                <Icon name="zap" className="w-3 h-3" /> 值得关注
              </span>
            )}
          </div>

          {(reason || t.matchConfidence != null) && (
            <div className="mt-1.5 flex items-center gap-2 text-[11px] font-mono text-text-muted">
              <span className="inline-flex items-center gap-1">
                <Icon name="activity" className="w-3 h-3 opacity-70" />
                {t.matchConfidence != null ? `AI 置信 ${Math.round(t.matchConfidence * 100)}%` : 'AI 匹配'}
              </span>
              {reason && (
                <button
                  onClick={() => setExpanded(v => !v)}
                  className="text-brand-cyan hover:text-text-primary hover:underline cursor-pointer"
                >
                  {expanded ? '收起理由' : '展开理由'}
                </button>
              )}
            </div>
          )}
          {expanded && reason && (
            <p className="mt-1.5 text-[11px] font-mono text-text-secondary leading-relaxed break-words">
              {reason}
            </p>
          )}

          <div className="flex items-center gap-3 mt-1.5 text-[10px] text-text-muted font-mono">
            <span className="inline-flex items-center gap-1"><Icon name="clock" className="w-3 h-3" /> 发布 {formatTime(t.publishedAt) || '—'}</span>
            <span className="inline-flex items-center gap-1"><Icon name="radar" className="w-3 h-3" /> 发现 {formatTime(t.firstSeenAt)}</span>
            <span className="opacity-60" title="同一来源连续多轮采集到该话题的次数">连续上榜 {t.mentionCount ?? 1} 次</span>
          </div>

          {t.stockLinks && t.stockLinks.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
              <span className="text-[10px] font-mono text-text-muted">行情</span>
              {t.stockLinks.map(l => (
                <span
                  key={l.stockCode}
                  className={`inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded-md border ${
                    l.pctToday != null && l.pctToday > 0
                      ? 'text-danger border-danger/25 bg-danger/5'
                      : l.pctToday != null && l.pctToday < 0
                        ? 'text-positive border-positive/25 bg-positive/5'
                        : 'text-text-muted border-border bg-surface-elevated'
                  }`}
                >
                  {l.stockName} {l.isStale ? '过去' : ''}{l.pctToday != null ? `${l.pctToday > 0 ? '+' : ''}${l.pctToday.toFixed(1)}%` : '—'}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Engagement / heat metrics */}
        <div className="text-right flex-shrink-0 flex flex-col items-end gap-1.5 min-w-[96px]">
          {primary && (
            <div>
              <span className="block text-[10px] text-text-muted font-mono">{primary.label}</span>
              <span className="text-sm font-semibold text-text-primary tabular-nums">{primary.value}</span>
            </div>
          )}
          <div>
            <span className="text-xl font-heading font-extrabold text-positive tabular-nums">
              {t.heatScore != null ? formatHeat(t.heatScore) : t.heatIndex.toFixed(0)}
            </span>
            <span className="block text-[10px] text-text-muted font-mono">热度值</span>
          </div>
          <div>
            <span className={`text-xl font-heading font-extrabold tabular-nums ${velocity > 0 ? 'text-positive' : velocity < 0 ? 'text-danger' : 'text-text-primary'}`}>
              {velocity > 0 ? '+' : ''}{velocity.toFixed(0)}
            </span>
            <span className="block text-[10px] text-text-muted font-mono">增速</span>
          </div>
        </div>
      </div>
    </div>
  );
}
