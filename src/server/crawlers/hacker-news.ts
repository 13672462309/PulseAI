import got from 'got';
import prisma from '../db.js';
import { calcHeatScore, type CrawlerItem } from './utils.js';
import { selectQueriesForChannel, currentExpansionRound } from './keyword-queries.js';

// HN scores are small (points/comments in the hundreds) — scale up to
// an engagement-equivalent so the sqrt-compressed heatScore is comparable
// with 微博/百度/B站 (which run in the millions).
const HN_ENGAGEMENT_MULTIPLIER = 200;

interface HNHit {
  objectID: string;
  title: string;
  url?: string;
  story_text?: string;
  points: number;
  num_comments: number;
  created_at: string;
}

interface HNResponse {
  hits: HNHit[];
}

/**
 * Hacker News keyword search via hn.algolia.com.
 * Queries each active keyword (first English query term), returns recent stories.
 */
export async function crawlHackerNews(): Promise<CrawlerItem[]> {
  const keywords = await prisma.keyword.findMany({ where: { isActive: true }, select: { keyword: true } });
  if (!keywords.length) return [];

  const allHits: Array<{ hit: HNHit; query: string }> = [];
  let failures = 0;

  for (const kw of keywords) {
    try {
      const queries = await selectQueriesForChannel(kw.keyword, 'hn', currentExpansionRound(), 1);
      const query = queries[0]; // one query per keyword per round keeps the API load low
      if (!query) continue;

      const resp = await got(`https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent(query)}&tags=story&hitsPerPage=15`, {
        headers: { 'Accept': 'application/json' },
        timeout: { request: 15000 },
        retry: { limit: 1 },
      }).json<HNResponse>();

      for (const hit of resp.hits || []) {
        if (hit.title?.trim()) allHits.push({ hit, query });
      }
      await sleep(300); // be gentle with the free API
    } catch (err) {
      failures++;
      console.warn(`[HackerNews] Query failed for "${kw.keyword}":`, (err as Error).message?.slice(0, 80));
    }
  }

  // All keywords failed → propagate so scheduler records an error + backoff
  if (failures > 0 && allHits.length === 0) {
    throw new Error(`HackerNews: all ${failures} keyword queries failed`);
  }

  if (!allHits.length) return [];

  // Normalize heat from engagement (points + 2×comments) relative to batch max
  const engagement = allHits.map(({ hit }) => hit.points + hit.num_comments * 2);
  const maxEngagement = Math.max(...engagement, 1);

  return allHits.map(({ hit, query }, i) => {
    const score = hit.points + hit.num_comments * 2;
    const snippet = hit.story_text
      ? hit.story_text.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 160)
      : null;
    return {
      title: hit.title.replace(/\s+/g, ' ').trim().slice(0, 160),
      url: hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
      rank: i + 1,
      heatIndex: Math.round((score / maxEngagement) * 100),
      heatScore: calcHeatScore(score * HN_ENGAGEMENT_MULTIPLIER),
      engagement: { points: hit.points, comments: hit.num_comments },
      snippet,
      searchQuery: query,
      publishedAt: hit.created_at,
    };
  }).slice(0, 60);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
