import got from 'got';
import { randomUA } from './utils.js';

interface BiliVideo {
  title: string;
  short_link_v2: string;
  stat: { view: number; danmaku: number; reply: number; favorite: number };
}

interface BiliResponse {
  code: number;
  data: {
    list: BiliVideo[];
    no_more: boolean;
  };
}

export async function crawlBilibili(): Promise<Array<{ title: string; url: string; rank: number; heatIndex: number; rawHeat: number | null }>> {
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

    if (resp.code !== 0 || !resp.data?.list) return [];

    const list = resp.data.list;
    const maxScore = Math.max(...list.map(v =>
      v.stat.view * 1 + v.stat.danmaku * 5 + v.stat.reply * 3 + v.stat.favorite * 10
    ), 1);

    return list.map((video, i) => {
      const rawHeat = video.stat.view * 1 +
        video.stat.danmaku * 5 +
        video.stat.reply * 3 +
        video.stat.favorite * 10;

      return {
        title: video.title,
        url: video.short_link_v2 || `https://www.bilibili.com/video/av${i}`,
        rank: i + 1,
        heatIndex: Math.round((rawHeat / maxScore) * 100),
        rawHeat,
      };
    });
  } catch (err) {
    console.error('[Bilibili] Crawl error:', err);
    return [];
  }
}
