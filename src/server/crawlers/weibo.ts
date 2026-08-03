import got from 'got';
import { randomUA } from './utils.js';

interface WeiboItem {
  realpos: number;
  word: string;
  word_scheme: string;
  raw_hot: number;
  icon_desc?: string;
}

interface WeiboResponse {
  data: {
    realtime: WeiboItem[];
  };
}

export async function crawlWeibo(): Promise<Array<{ title: string; url: string; rank: number; heatIndex: number; rawHeat: number | null }>> {
  try {
    const resp = await got('https://weibo.com/ajax/side/hotSearch', {
      headers: {
        'User-Agent': randomUA(),
        'Accept': 'application/json',
        'Referer': 'https://weibo.com/',
      },
      timeout: { request: 15000 },
      retry: { limit: 2 },
    }).json<WeiboResponse>();

    const items = resp?.data?.realtime || [];
    const maxHeat = Math.max(...items.map(i => i.raw_hot || 0), 1);

    return items.slice(0, 30).map((item, i) => ({
      title: item.word || '',
      url: item.word_scheme ? `https://s.weibo.com/weibo?q=${encodeURIComponent(item.word_scheme)}` : '', // Note: typo in API
      rank: item.realpos || i + 1,
      heatIndex: Math.round(((item.raw_hot || 0) / maxHeat) * 100),
      rawHeat: item.raw_hot || null,
    })).filter(t => t.title);
  } catch (err) {
    console.error('[Weibo] Crawl error:', err);
    return [];
  }
}
