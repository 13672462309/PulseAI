import got from 'got';
import { randomUA } from './utils.js';

export async function crawlSogou(): Promise<Array<{ title: string; url: string; rank: number; heatIndex: number; rawHeat: number | null }>> {
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
    if (!match) return [];

    const words: string[] = JSON.parse(match[1]);
    return words.slice(0, 30).map((word, i) => ({
      title: word,
      url: `https://www.sogou.com/web?query=${encodeURIComponent(word)}`,
      rank: i + 1,
      heatIndex: Math.max(5, 100 - i * 3),
      rawHeat: null,
    }));
  } catch (err) {
    console.error('[Sogou] Crawl error:', err);
    return [];
  }
}
