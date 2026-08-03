import * as cheerio from 'cheerio';
import got from 'got';
import prisma from '../db.js';
import { randomUA } from './utils.js';

export async function crawlBing(): Promise<Array<{ title: string; url: string; rank: number; heatIndex: number; rawHeat: number | null }>> {
  try {
    // Use first active keyword as search term
    const kw = await prisma.keyword.findFirst({ where: { isActive: true }, select: { keyword: true } });
    const query = kw?.keyword || 'AI 热点';

    const html = await got(`https://www.bing.com/search?q=${encodeURIComponent(query + ' 最新')}&filters=ex1:"ez1"`, {
      headers: {
        'User-Agent': randomUA(),
        'Accept': 'text/html',
        'Accept-Language': 'zh-CN,zh;q=0.9',
      },
      timeout: { request: 15000 },
      retry: { limit: 2 },
    }).text();

    const $ = cheerio.load(html);
    const items: Array<{ title: string; url: string; rank: number; heatIndex: number; rawHeat: number | null }> = [];

    // Bing news results
    $('.news-card, .b_news .newsitem, #b_results .b_algo').each((i, el) => {
      const titleEl = $(el).find('h2 a, h3 a').first();
      const title = titleEl.text().trim();
      const link = titleEl.attr('href') || '';
      if (title && title.length > 3) {
        items.push({ title, url: link, rank: i + 1, heatIndex: Math.max(10, 85 - i * 3), rawHeat: null });
      }
    });

    return items.slice(0, 25).filter(t => t.title.length > 3);
  } catch (err) {
    console.error('[Bing] Crawl error:', err);
    return [];
  }
}
