import * as cheerio from 'cheerio';
import got from 'got';
import prisma from '../db.js';
import { calcProxyHeatScore, randomUA, resolveSearchUrl, type CrawlerItem } from './utils.js';
import { selectQueriesForChannel, currentExpansionRound } from './keyword-queries.js';

const CAPTCHA_MARKERS = ['验证码', 'antispider', '请输入上图中', '安全验证'];
// Only follow Sogou's opaque /link tokens for titles that look like brand or
// official pages — following every result would add dozens of HEAD requests.
const BRAND_PAGE_HINT = /(huawei|华为|apple|苹果|iphone|claude|deepseek|tesla|特斯拉|小米|xiaomi|anthropic|vmall|官方|官网|official|home|首页)/i;

async function resolveSogouLink(url: string): Promise<string> {
  if (!url.includes('/link?url=')) return url;
  try {
    const res = await got(url, {
      method: 'HEAD',
      followRedirect: true,
      throwHttpErrors: false,
      timeout: { request: 6000 },
      retry: { limit: 0 },
    });
    return res.url || url;
  } catch {
    return url;
  }
}

export async function crawlSogou(): Promise<CrawlerItem[]> {
  const results: CrawlerItem[] = [];

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
      const queries = await selectQueriesForChannel(kw.keyword, 'zh', currentExpansionRound(), 2);
      let captcha = false;
      for (const query of queries) {
        try {
          const html = await got(`https://www.sogou.com/web?query=${encodeURIComponent(query)}`, {
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
            console.warn(`[Sogou] Captcha detected for "${query}", skipping search channel`);
            captcha = true;
            break;
          }

          const $ = cheerio.load(html);
          const items: Array<{ title: string; url: string; snippet: string }> = [];
          $('h3 a').each((i, el) => {
            if (i >= 5) return false;
            const title = $(el).text().trim();
            let href = $(el).attr('href') || '';
            if (!href) return;
            // sogou returns relative redirect links — resolve against the site,
            // then unwrap /link?url= so the real target domain is stored.
            if (href.startsWith('/')) href = 'https://www.sogou.com' + href;
            href = resolveSearchUrl(href);
            if (title.length > 3) {
              const block = $(el).closest('.vrwrap, li, .rb');
              const snippet = block.find('p, .fz-mid, .str_info, .text-layout').first().text().trim().slice(0, 160);
              items.push({ title, url: href, snippet });
            }
          });

          // Sogou /link tokens are opaque — follow the redirect (HEAD) for
          // titles that look like brand/official pages so the real domain is stored.
          for (const item of items) {
            if (item.url.includes('sogou.com/link') && BRAND_PAGE_HINT.test(item.title)) {
              item.url = await resolveSogouLink(item.url);
            }
          }

          for (const [i, item] of items.entries()) {
            const heatIndex = Math.max(5, 85 - i * 3);
            results.push({
              title: item.title,
              url: item.url,
              rank: 31 + i,
              heatIndex,
              heatScore: calcProxyHeatScore(heatIndex),
              snippet: item.snippet || null,
              searchQuery: query,
            });
          }
          await sleep(600); // sogou rate-limits aggressively
        } catch (err) {
          console.warn(`[Sogou] Search failed for "${query}":`, (err as Error).message?.slice(0, 80));
        }
      }
      if (captcha) break;
    }
  } catch (err) {
    console.error('[Sogou] Keyword search channel error:', err);
  }

  return results;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
