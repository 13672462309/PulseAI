import got from 'got';
import prisma from '../db.js';
import { randomUA } from './utils.js';

export async function crawlGoogle(): Promise<Array<{ title: string; url: string; rank: number; heatIndex: number; rawHeat: number | null }>> {
  try {
    const kw = await prisma.keyword.findFirst({ where: { isActive: true }, select: { keyword: true } });
    const query = kw?.keyword || 'AI';

    // Google News RSS via HTTP (not HTTPS) to avoid timeout
    const xml = await got(`http://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=zh-CN&ceid=CN:zh-Hans`, {
      headers: { 'User-Agent': randomUA(), 'Accept': 'application/rss+xml' },
      timeout: { request: 15000 },
      retry: { limit: 2 },
    }).text();

    const items: Array<{ title: string; url: string; rank: number; heatIndex: number; rawHeat: number | null }> = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let m, i = 0;
    while ((m = itemRegex.exec(xml)) !== null && i < 25) {
      const titleM = m[1].match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/);
      const linkM = m[1].match(/<link>(.*?)<\/link>/);
      if (titleM) {
        items.push({
          title: (titleM[1] || '').replace(/<\/?[^>]+>/g, '').trim(),
          url: linkM?.[1] || '',
          rank: ++i,
          heatIndex: Math.max(10, 85 - i * 3),
          rawHeat: null,
        });
      }
    }
    return items;
  } catch (err) {
    console.error('[Google] Crawl error:', (err as Error).message?.slice(0, 80));
    return [];
  }
}
