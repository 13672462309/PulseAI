import got from 'got';
import { calcProxyHeatScore, randomUA } from './utils.js';

// Parse RSS-like JSON feed from 36Kr
interface Kr36Item {
  id: string;
  title: string;
  published_at: string;
  news_url: string;
  total_words: number;
  summary?: string;
}

export async function crawl36Kr(): Promise<Array<{ title: string; url: string; rank: number; heatIndex: number; heatScore: number | null; rawHeat: number | null; publishedAt?: number | string | Date | null }>> {
  // Channel 1: quick-news JSON API. Any failure (blocked page, parse error,
  // empty payload) falls through to the RSS channel instead of dropping the source.
  try {
    const resp = await got('https://36kr.com/api/search-column/flowing_news?per_page=30', {
      headers: {
        'User-Agent': randomUA(),
        'Accept': 'application/json',
        'Referer': 'https://36kr.com/',
      },
      timeout: { request: 15000 },
      retry: { limit: 2 },
    }).json<{ code: number; data: { items: Kr36Item[] } }>();

    if (resp.code === 0 && resp.data?.items?.length) {
      return resp.data.items.slice(0, 30).map((item, i) => {
        const heatIndex = Math.max(5, 80 - i * 2);
        return {
          title: item.title,
          url: item.news_url || `https://36kr.com/p/${item.id}`,
          rank: i + 1,
          heatIndex,
          heatScore: calcProxyHeatScore(heatIndex),
          rawHeat: item.total_words || null,
          publishedAt: item.published_at || null,
        };
      });
    }
    console.warn('[36Kr] API returned no items, trying RSS fallback');
  } catch (err) {
    console.warn('[36Kr] API failed, trying RSS fallback:', (err as Error).message?.slice(0, 120));
  }

  // Channel 2: RSS fallback
  try {
    const rssResp = await got('https://36kr.com/feed', {
      headers: { 'User-Agent': randomUA() },
      timeout: { request: 10000 },
    }).text();

    const items: Array<{ title: string; url: string; rank: number; heatIndex: number; heatScore: number | null; rawHeat: number | null; publishedAt?: number | string | Date | null }> = [];
    const titleMatches = rssResp.matchAll(/<title>(.+?)<\/title>/g);
    const linkMatches = rssResp.matchAll(/<link>(.+?)<\/link>/g);
    const pubDateMatches = rssResp.matchAll(/<pubDate>(.+?)<\/pubDate>/g);

    const titles = [...titleMatches].map(m => m[1]).filter((t, i) => i > 0); // skip feed title
    const links = [...linkMatches].map(m => m[1]).filter((l, i) => i > 0);
    const pubDates = [...pubDateMatches].map(m => m[1]);

    titles.forEach((title, i) => {
      const heatIndex = Math.max(5, 80 - i * 2);
      items.push({
        title,
        url: links[i] || '',
        rank: i + 1,
        heatIndex,
        heatScore: calcProxyHeatScore(heatIndex),
        rawHeat: null,
        publishedAt: pubDates[i] || null,
      });
    });

    if (items.length) return items.slice(0, 30);
    console.warn('[36Kr] RSS fallback returned no items');
  } catch (err) {
    console.error('[36Kr] RSS fallback also failed:', (err as Error).message?.slice(0, 120));
  }

  return [];
}
