import * as cheerio from 'cheerio';
import got from 'got';
import prisma from '../db.js';
import { calcProxyHeatScore, randomUA } from './utils.js';

/**
 * General web search (Bing). Queries EVERY active keyword each round —
 * previously only one keyword per 30min was searched, which starved
 * less-recently-picked keywords (e.g. deepseek only once per 6.5h).
 */
export async function crawlWebSearch(): Promise<Array<{ title: string; url: string; rank: number; heatIndex: number; heatScore: number | null; rawHeat: number | null }>> {
  const keywords = await prisma.keyword.findMany({ where: { isActive: true }, select: { keyword: true } });
  const searchTerms = keywords.length > 0 ? keywords.map(k => k.keyword) : ['AI 大模型'];

  const items: Array<{ title: string; url: string; rank: number; heatIndex: number; heatScore: number | null; rawHeat: number | null }> = [];
  const seen = new Set<string>();
  let allFailed = true;

  for (const term of searchTerms) {
    try {
      const html = await got(`https://www.bing.com/search?q=${encodeURIComponent(term)}&filters=ex1:"ez1"`, {
        headers: {
          'User-Agent': randomUA(),
          'Accept': 'text/html',
          'Accept-Language': 'zh-CN,zh;q=0.9',
        },
        timeout: { request: 15000 },
        retry: { limit: 2 },
      }).text();

      const $ = cheerio.load(html);
      const found: Array<{ title: string; url: string }> = [];

      // Bing news results
      $('#news .news-card, .b_news .newsitem, #b_results .b_algo, #b_results li.b_ans').each((i, el) => {
        if (found.length >= 8) return false;
        const titleEl = $(el).find('h2 a, h3 a, .b_title a').first();
        const title = titleEl.text().trim();
        const link = titleEl.attr('href') || '';
        const snippet = $(el).find('.b_caption p, .b_snippet, .news_snpt').first().text().trim();
        if (title && title.length > 5) {
          found.push({ title: snippet ? `${title} — ${snippet.slice(0, 60)}` : title, url: link });
        }
      });

      // Fallback: general web results
      if (!found.length) {
        $('li.b_algo, .b_algo').each((i, el) => {
          if (found.length >= 8) return false;
          const titleEl = $(el).find('h2 a');
          const title = titleEl.text().trim();
          const link = titleEl.attr('href') || '';
          if (title && title.length > 5) found.push({ title, url: link });
        });
      }

      for (const [i, f] of found.entries()) {
        const key = f.title.toLowerCase().slice(0, 40);
        if (seen.has(key)) continue;
        seen.add(key);
        const heatIndex = Math.max(2, 70 - i * 2);
        items.push({
          title: f.title,
          url: f.url,
          rank: items.length + 1,
          heatIndex,
          heatScore: calcProxyHeatScore(heatIndex),
          rawHeat: null,
        });
      }

      if (found.length > 0) allFailed = false;
      await sleep(300);
    } catch (err) {
      console.warn(`[WebSearch] Query failed for "${term}":`, (err as Error).message?.slice(0, 80));
    }
  }

  // All keywords failed → propagate so scheduler records an error + backoff
  if (allFailed && items.length === 0) {
    throw new Error('WebSearch: all keyword queries failed');
  }

  return items.slice(0, 40);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
