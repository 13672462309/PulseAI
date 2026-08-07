import type { Engagement } from '@shared/types.js';

export function formatHeat(score: number): string {
  if (score >= 10000) return (score / 10000).toFixed(1).replace(/\.0$/, '') + '万';
  return score.toLocaleString();
}

export function formatCompact(n: number): string {
  if (n >= 1e8) return (n / 1e8).toFixed(1).replace(/\.0$/, '') + '亿';
  if (n >= 1e4) return (n / 1e4).toFixed(1).replace(/\.0$/, '') + '万';
  return n.toLocaleString();
}

export function formatTime(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export interface EngagementField {
  label: string;
  value: string;
}

function num(v: unknown): number | null {
  return typeof v === 'number' ? v : null;
}

// Primary metric shown on the compact topic row. Sources without real
// interaction data return null and simply show nothing.
export function primaryEngagement(
  engagement: Engagement | null | undefined,
  sourceSlug?: string,
): EngagementField | null {
  if (!engagement) return null;
  switch (sourceSlug) {
    case 'weibo': {
      const hot = num(engagement.hot);
      return hot != null ? { label: '热度', value: formatCompact(hot) } : null;
    }
    case 'baidu': {
      const score = num(engagement.hotScore);
      return score != null ? { label: '搜索指数', value: formatCompact(score) } : null;
    }
    case 'bilibili': {
      const views = num(engagement.views);
      return views != null ? { label: '播放', value: formatCompact(views) } : null;
    }
    case 'hacker-news': {
      const points = num(engagement.points);
      const comments = num(engagement.comments);
      if (points == null && comments == null) return null;
      const parts: string[] = [];
      if (points != null) parts.push(`${points}分`);
      if (comments != null) parts.push(`${comments}评论`);
      return { label: '互动', value: parts.join(' · ') };
    }
    default:
      return null;
  }
}

// Full per-source breakdown for the detail page.
export function engagementFields(
  engagement: Engagement | null | undefined,
  sourceSlug?: string,
): EngagementField[] {
  if (!engagement) return [];
  switch (sourceSlug) {
    case 'weibo': {
      const fields: EngagementField[] = [];
      const hot = num(engagement.hot);
      if (hot != null) fields.push({ label: '热度', value: formatCompact(hot) });
      if (typeof engagement.tag === 'string' && engagement.tag) {
        fields.push({ label: '标签', value: engagement.tag });
      }
      return fields;
    }
    case 'baidu': {
      const score = num(engagement.hotScore);
      return score != null ? [{ label: '搜索指数', value: formatCompact(score) }] : [];
    }
    case 'bilibili': {
      const map: Array<[string, unknown]> = [
        ['播放', engagement.views],
        ['弹幕', engagement.danmaku],
        ['评论', engagement.comments],
        ['收藏', engagement.favorites],
        ['点赞', engagement.likes],
      ];
      return map
        .filter(([, v]) => typeof v === 'number')
        .map(([label, v]) => ({ label, value: formatCompact(v as number) }));
    }
    case 'hacker-news': {
      const fields: EngagementField[] = [];
      const points = num(engagement.points);
      const comments = num(engagement.comments);
      if (points != null) fields.push({ label: '分数', value: String(points) });
      if (comments != null) fields.push({ label: '评论', value: String(comments) });
      return fields;
    }
    default:
      return [];
  }
}
