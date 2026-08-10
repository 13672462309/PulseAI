export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^一-龥a-z0-9]/g, '')
    .trim();
}

// Unified crawler output. `engagement` carries per-source interaction details
// (views/comments/points/...) as a JSON-serializable object; sources without
// interaction data leave it null/undefined.
export interface CrawlerItem {
  title: string;
  url: string;
  rank: number;
  heatIndex: number;
  heatScore: number | null;
  publishedAt?: number | string | Date | null;
  engagement?: Record<string, number | string | null> | null;
  snippet?: string | null;
  searchQuery?: string | null;
}
// ── Absolute heat score (0 ~ thousands) ──
// heatScore = sqrt(weighted engagement) / 2 — sqrt compression keeps the scale
// compact (max ~8-10k for once-in-a-year mega hits) while preserving order-of-magnitude
// differences (爆款 ~2700 vs 中小热点 ~270 vs 代理源 ~100).
export function calcHeatScore(engagement: number): number {
  return Math.round(Math.sqrt(Math.max(engagement, 0)) / 2);
}

// Proxy sources (36kr/sogou/bing/web-search) have no interaction data —
// user-specified linear scaling: 100 热力值 → 1500 热度值 (ratio 15),
// so proxy-source scores land in the same numeric range as real sources.
export function calcProxyHeatScore(heatIndex: number): number {
  return Math.round(Math.min(Math.max(heatIndex, 0), 100) * 15);
}

export function randomUA(): string {
  const uas = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
  ];
  return uas[Math.floor(Math.random() * uas.length)];
}

/**
 * Resolve search-engine redirect wrapper URLs to the real target URL.
 * Bing stores the target as base64url in the `u` param (prefixed with `a1`),
 * Baidu/Sogou use `/link?url=<encoded>`. Without this, brand-domain detection
 * sees bing.com/sogou.com instead of huawei.com/apple.com, so official pages
 * slip through the content filter.
 */
export function resolveSearchUrl(rawUrl: string): string {
  if (!rawUrl) return rawUrl;
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.toLowerCase();

    // Bing: https://www.bing.com/ck/a?...&u=a1<base64url(target)>
    if (host.includes('bing.com') && parsed.pathname.includes('/ck/a')) {
      const u = parsed.searchParams.get('u') || '';
      const decoded = decodeBingTarget(u);
      if (decoded && /^https?:\/\//i.test(decoded)) return decoded;
    }

    // Baidu/Sogou: /link?url=<urlencoded target>
    if ((host.includes('baidu.com') || host.includes('sogou.com')) && parsed.pathname.startsWith('/link')) {
      const u = parsed.searchParams.get('url') || '';
      if (u && /^https?:\/\//i.test(u)) return u;
    }
  } catch {
    // keep the original URL on any parse failure
  }
  return rawUrl;
}

function decodeBingTarget(u: string): string {
  if (!u) return '';
  try {
    let s = u;
    // Bing prefixes the base64 payload with a1; strip it before decoding.
    if (s.startsWith('a1')) s = s.slice(2);
    const padded = s + '='.repeat((4 - (s.length % 4)) % 4);
    return Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
  } catch {
    return '';
  }
}
