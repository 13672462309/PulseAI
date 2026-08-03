import * as cheerio from 'cheerio';
import got from 'got';
import prisma from '../db.js';
import { randomUA } from './utils.js';

export async function crawlWebSearch(): Promise<Array<{ title: string; url: string; rank: number; heatIndex: number; rawHeat: number | null }>> {
  // Get user keywords from DB as search queries
  const keywords = await prisma.keyword.findMany({ where: { isActive: true }, select: { keyword: true } });
  const searchTerms = keywords.length > 0
    ? keywords.map(k => k.keyword)
    : ['AI 大模型', '半导体', '科技热点'];
  const query = searchTerms[Math.floor(Date.now() / 1800000) % searchTerms.length];

  try {
    const html = await got(`https://www.bing.com/search?q=${encodeURIComponent(query)}&filters=ex1:"ez1"`, {
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

    // Parse Bing news results
    $('#news .news-card, .b_news .newsitem, #b_results .b_algo, #b_results li.b_ans').each((i, el) => {
      const titleEl = $(el).find('h2 a, h3 a, .b_title a').first();
      const title = titleEl.text().trim();
      const link = titleEl.attr('href') || '';
      const snippet = $(el).find('.b_caption p, .b_snippet, .news_snpt').first().text().trim();

      if (title && title.length > 5) {
        items.push({
          title: snippet ? `${title} — ${snippet.slice(0, 60)}` : title,
          url: link,
          rank: i + 1,
          heatIndex: Math.max(3, 75 - i * 2),
          rawHeat: null,
        });
      }
    });

    // Fallback: general web results
    if (!items.length) {
      $('li.b_algo, .b_algo').each((i, el) => {
        const titleEl = $(el).find('h2 a');
        const title = titleEl.text().trim();
        const link = titleEl.attr('href') || '';
        if (title && title.length > 5) {
          items.push({
            title,
            url: link,
            rank: i + 1,
            heatIndex: Math.max(2, 70 - i * 2),
            rawHeat: null,
          });
        }
      });
    }

    return items.slice(0, 20);
  } catch (err) {
    console.error('[WebSearch] Crawl error:', err);
    return [];
  }
}
