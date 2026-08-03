import * as cheerio from 'cheerio';
import got from 'got';
import prisma from '../db.js';
import { calcProxyHeatScore, randomUA } from './utils.js';

const CAPTCHA_MARKERS = ['验证码', 'antispider', '请输入上图中', '安全验证'];

export async function crawlSogou(): Promise<Array<{ title: string; url: string; rank: number; heatIndex: number; heatScore: number | null; rawHeat: number | null }>> {
  const results: Array<{ title: string; url: string; rank: number; heatIndex: number; heatScore: number | null; rawHeat: number | null }> = [];

  // ── Channel 1: hot words list ──
  try {
    const text = await got('https://www.sogou.com/suggnew/hotwords', {
      headers: {
        'User-Agent': randomUA(),
        'Accept': '*/*',
        'Referer': 'https://www.sogou.com/',
      },
      timeout: { request: 15000 },
      retry: { limit: 2 },
    }).text();

    // Response is JS: var sogou_top_words = ["word1","word2",...]
    const match = text.match(/sogou_top_words\s*=\s*(\[[\s\S]*?\])/);
    if (match) {
      const words: string[] = JSON.parse(match[1]);
      for (const [i, word] of words.slice(0, 30).entries()) {
        const heatIndex = Math.max(5, 100 - i * 3);
        results.push({
          title: word,
          url: `https://www.sogou.com/web?query=${encodeURIComponent(word)}`,
          rank: i + 1,
          heatIndex,
          heatScore: calcProxyHeatScore(heatIndex),
          rawHeat: null,
        });
      }
    }
  } catch (err) {
    console.error('[Sogou] Hot words error:', err);
  }

  // ── Channel 2: keyword search (degrades gracefully on captcha) ──
  try {
    const keywords = await prisma.keyword.findMany({ where: { isActive: true }, select: { keyword: true } });
    for (const kw of keywords) {
      try {
        const html = await got(`https://www.sogou.com/web?query=${encodeURIComponent(kw.keyword)}`, {
          headers: {
            'User-Agent': randomUA(),
            'Accept': 'text/html',
            'Accept-Language': 'zh-CN,zh;q=0.9',
          },
          timeout: { request: 12000 },
          retry: { limit: 1 },
        }).text();

        // Captcha / anti-bot detection → skip search channel entirely
        if (CAPTCHA_MARKERS.some((m) => html.includes(m))) {
          console.warn(`[Sogou] Captcha detected for "${kw.keyword}", skipping search channel`);
          break;
        }

        const $ = cheerio.load(html);
        const items: Array<{ title: string; url: string }> = [];
        $('h3 a').each((i, el) => {
          if (i >= 5) return false;
          const title = $(el).text().trim();
          let href = $(el).attr('href') || '';
          if (!href) return;
          // sogou returns relative redirect links — resolve against the site
          if (href.startsWith('/')) href = 'https://www.sogou.com' + href;
          if (title.length > 3) items.push({ title, url: href });
        });

        for (const [i, item] of items.entries()) {
          const heatIndex = Math.max(5, 85 - i * 3);
          results.push({
            title: item.title,
            url: item.url,
            rank: 31 + i,
            heatIndex,
            heatScore: calcProxyHeatScore(heatIndex),
            rawHeat: null,
          });
        }
        await sleep(600); // sogou rate-limits aggressively
      } catch (err) {
        console.warn(`[Sogou] Search failed for "${kw.keyword}":`, (err as Error).message?.slice(0, 80));
      }
    }
  } catch (err) {
    console.error('[Sogou] Keyword search channel error:', err);
  }

  return results;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
