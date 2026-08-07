import got from 'got';
import { calcHeatScore, randomUA, type CrawlerItem } from './utils.js';

interface BaiduItem {
  word: string;
  hotScore: string;
  desc?: string;
  url?: string;
  isTop?: boolean;
}

export async function crawlBaidu(): Promise<CrawlerItem[]> {
  try {
    const html = await got('https://top.baidu.com/board?tab=realtime', {
      headers: { 'User-Agent': randomUA(), 'Accept': 'text/html' },
      timeout: { request: 15000 },
      retry: { limit: 2 },
    }).text();

    // Baidu embeds hot list data as JSON in an HTML comment: <!--s-data:{...}-->
    const match = html.match(/<!--s-data:\s*(\{[\s\S]*?\})\s*-->/);
    if (!match) return [];

    const raw = JSON.parse(match[1]);
    const cards = raw?.data?.cards || [];

    // Find the "realtime" hot list card
    const hotList = cards.find((c: any) => c.component === 'hotList');
    if (!hotList?.content) return [];

    const items: BaiduItem[] = hotList.content;
    // Normalize: scale heatIndex relative to max hotScore in this batch
    const rawHeats = items.map(i => parseInt(i.hotScore) || 0);
    const maxHeat = Math.max(...rawHeats, 1);

    return items.slice(0, 30).map((item, i) => {
      const rawHeat = parseInt(item.hotScore) || null;
      return {
        title: item.word || '',
        url: `https://www.baidu.com/s?wd=${encodeURIComponent(item.word || '')}`,
        rank: i + 1,
        heatIndex: rawHeat ? Math.round((rawHeat / maxHeat) * 100) : Math.max(5, 100 - i * 3),
        heatScore: rawHeat ? calcHeatScore(rawHeat) : null,
        engagement: rawHeat != null ? { hotScore: rawHeat } : null,
        snippet: item.desc?.trim() || null,
      };
    }).filter(t => t.title);
  } catch (err) {
    console.error('[Baidu] Crawl error:', err);
    return [];
  }
}
