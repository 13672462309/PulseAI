import got from 'got';
import prisma from '../db.js';
import { calcHeatScore, randomUA, type CrawlerItem } from './utils.js';
import { selectQueriesForChannel, currentExpansionRound } from './keyword-queries.js';

interface BiliVideo {
  title: string;
  short_link_v2: string;
  pubdate?: number;
  stat: { view: number; danmaku: number; reply: number; favorite: number };
}

interface BiliResponse {
  code: number;
  data: {
    list: BiliVideo[];
    no_more: boolean;
  };
}

interface BiliSearchVideo {
  title: string;
  bvid: string;
  arcurl?: string;
  pubdate?: number;
  description?: string;
  play: number;
  like: number;
  review: number;
}

interface BiliSearchResponse {
  code: number;
  message: string;
  data?: { result?: BiliSearchVideo[] };
}

// buvid3 cookie is required by the search API (412 without it). Fetch once, reuse.
let buvidCookie: string | null = null;
let cookieExpiresAt = 0;

async function getBuvidCookie(): Promise<string | null> {
  if (buvidCookie && Date.now() < cookieExpiresAt) return buvidCookie;
  try {
    const spi = await got('https://api.bilibili.com/x/frontend/finger/spi', {
      headers: { 'User-Agent': randomUA(), 'Referer': 'https://www.bilibili.com/' },
      timeout: { request: 8000 },
      retry: { limit: 1 },
    }).json<{ data: { b_3: string } }>();
    const b3 = spi?.data?.b_3;
    if (!b3) return null;
    buvidCookie = `buvid3=${b3}; b_nut=${Date.now()}`;
    cookieExpiresAt = Date.now() + 24 * 3600_000; // refresh daily
    return buvidCookie;
  } catch (err) {
    console.warn('[Bilibili] Failed to acquire buvid cookie:', (err as Error).message?.slice(0, 80));
    return null;
  }
}

export async function crawlBilibili(): Promise<CrawlerItem[]> {
  const results: CrawlerItem[] = [];

  // ── Channel 1: popular list ──
  try {
    const resp = await got('https://api.bilibili.com/x/web-interface/popular?ps=30', {
      headers: {
        'User-Agent': randomUA(),
        'Referer': 'https://www.bilibili.com/',
        'Accept': 'application/json',
      },
      timeout: { request: 15000 },
      retry: { limit: 2 },
    }).json<BiliResponse>();

    if (resp.code === 0 && resp.data?.list) {
      const list = resp.data.list;
      const maxScore = Math.max(...list.map(v =>
        v.stat.view * 1 + v.stat.danmaku * 5 + v.stat.reply * 3 + v.stat.favorite * 10
      ), 1);

      for (const [i, video] of list.entries()) {
        const rawHeat = video.stat.view * 1 +
          video.stat.danmaku * 5 +
          video.stat.reply * 3 +
          video.stat.favorite * 10;
        results.push({
          title: video.title,
          url: video.short_link_v2 || `https://www.bilibili.com/video/av${i}`,
          rank: i + 1,
          heatIndex: Math.round((rawHeat / maxScore) * 100),
          heatScore: calcHeatScore(rawHeat),
          engagement: {
            views: video.stat.view,
            danmaku: video.stat.danmaku,
            comments: video.stat.reply,
            favorites: video.stat.favorite,
          },
          publishedAt: video.pubdate ? video.pubdate * 1000 : null,
        });
      }
    }
  } catch (err) {
    console.error('[Bilibili] Popular list error:', err);
  }

  // ── Channel 2: keyword search (per active keyword) ──
  try {
    const keywords = await prisma.keyword.findMany({ where: { isActive: true }, select: { keyword: true } });
    if (keywords.length) {
      const cookie = await getBuvidCookie();
      if (cookie) {
        const searchResults: Array<{
          title: string;
          url: string;
          rawHeat: number;
          engagement: Record<string, number | string | null>;
          snippet: string | null;
          searchQuery: string;
          pubdate?: number;
        }> = [];
        for (const kw of keywords) {
          const queries = await selectQueriesForChannel(kw.keyword, 'zh', currentExpansionRound(), 2);
          for (const query of queries) {
            try {
              const resp = await got(`https://api.bilibili.com/x/web-interface/search/type?search_type=video&keyword=${encodeURIComponent(query)}&page=1&order=totalrank`, {
                headers: {
                  'User-Agent': randomUA(),
                  'Referer': 'https://www.bilibili.com/',
                  'Accept': 'application/json',
                  'Cookie': cookie,
                },
                timeout: { request: 12000 },
                retry: { limit: 1 },
              }).json<BiliSearchResponse>();

              if (resp.code === 0 && resp.data?.result) {
                for (const v of resp.data.result.slice(0, 5)) {
                  // strip <em class="keyword"> highlight tags from titles
                  const title = v.title.replace(/<[^>]+>/g, '').trim();
                  if (!title) continue;
                  const snippet = v.description ? stripHtml(v.description).slice(0, 160) : null;
                  searchResults.push({
                    title,
                    url: v.arcurl || `https://www.bilibili.com/video/${v.bvid}`,
                    rawHeat: v.play + v.like * 2 + v.review * 3,
                    engagement: { views: v.play, likes: v.like, comments: v.review },
                    snippet,
                    searchQuery: query,
                    pubdate: v.pubdate,
                  });
                }
              }
              await sleep(400); // avoid search rate limiting
            } catch (err) {
              console.warn(`[Bilibili] Search failed for "${query}":`, (err as Error).message?.slice(0, 80));
            }
          }
        }

        // Normalize search-channel heat relative to its own max (different scale than popular)
        const maxRaw = Math.max(...searchResults.map(r => r.rawHeat), 1);
        for (const [i, r] of searchResults.entries()) {
          results.push({
            title: r.title,
            url: r.url,
            rank: 31 + i,
            heatIndex: Math.round((r.rawHeat / maxRaw) * 100),
            heatScore: calcHeatScore(r.rawHeat),
            engagement: r.engagement,
            snippet: r.snippet,
            searchQuery: r.searchQuery,
            publishedAt: r.pubdate ? r.pubdate * 1000 : null,
          });
        }
      }
    }
  } catch (err) {
    console.error('[Bilibili] Keyword search channel error:', err);
  }

  return results;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}
