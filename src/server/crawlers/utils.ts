export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^一-龥a-z0-9]/g, '')
    .trim();
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
