import got from 'got';
import { randomUA } from './utils.js';

// Parse RSS-like JSON feed from 36Kr
interface Kr36Item {
  id: string;
  title: string;
  published_at: string;
  news_url: string;
  total_words: number;
  summary?: string;
}

export async function crawl36Kr(): Promise<Array<{ title: string; url: string; rank: number; heatIndex: number; rawHeat: number | null }>> {
  try {
    // 36Kr has a "quick news" API
    const resp = await got('https://36kr.com/api/search-column/flowing_news?per_page=30', {
      headers: {
        'User-Agent': randomUA(),
        'Accept': 'application/json',
        'Referer': 'https://36kr.com/',
      },
      timeout: { request: 15000 },
      retry: { limit: 2 },
    }).json<{ code: number; data: { items: Kr36Item[] } }>();

    if (resp.code !== 0 || !resp.data?.items) {
      // Fallback: try RSS
      const rssResp = await got('https://36kr.com/feed', {
        headers: { 'User-Agent': randomUA() },
        timeout: { request: 10000 },
      }).text();

      const items: Array<{ title: string; url: string; rank: number; heatIndex: number; rawHeat: number | null }> = [];
      const titleMatches = rssResp.matchAll(/<title>(.+?)<\/title>/g);
      const linkMatches = rssResp.matchAll(/<link>(.+?)<\/link>/g);

      const titles = [...titleMatches].map(m => m[1]).filter((t, i) => i > 0); // skip feed title
      const links = [...linkMatches].map(m => m[1]).filter((l, i) => i > 0);

      titles.forEach((title, i) => {
        items.push({
          title,
          url: links[i] || '',
          rank: i + 1,
          heatIndex: Math.max(5, 80 - i * 2),
          rawHeat: null,
        });
      });

      return items.slice(0, 30);
    }

    return resp.data.items.slice(0, 30).map((item, i) => ({
      title: item.title,
      url: item.news_url || `https://36kr.com/p/${item.id}`,
      rank: i + 1,
      heatIndex: Math.max(5, 80 - i * 2),
      rawHeat: item.total_words || null,
    }));
  } catch (err) {
    console.error('[36Kr] Crawl error:', err);
    return [];
  }
}
