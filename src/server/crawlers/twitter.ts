import got from 'got';

const TWITTER_API_KEY = process.env.TWITTER_API_KEY || '';
const BASE_URL = 'https://api.twitterapi.io/twitter/tweet/advanced_search';

interface Tweet {
  id: string;
  text: string;
  likeCount: number;
  retweetCount: number;
  replyCount: number;
  viewCount: number;
  createdAt: string;
  author: { userName: string; name: string; followers: number; isBlueVerified: boolean };
}

interface TwitterResponse {
  tweets: Tweet[];
  has_next_page: boolean;
  next_cursor?: string;
}

// Hot topics query — translate Chinese keywords to Twitter search
const HOT_QUERIES = [
  '"AI" OR "artificial intelligence" OR "artificial intelligence News"',
  '"semiconductor" OR "chip" OR "NVIDIA" OR "TSMC"',
  '"China tech" OR "China AI" OR "Chinese technology"',
  '"GPT" OR "LLM" OR "large language model"',
  '"stock market" OR "market news" OR "breaking tech"',
];

export async function crawlTwitter(): Promise<Array<{ title: string; url: string; rank: number; heatIndex: number; rawHeat: number | null }>> {
  // Rotate queries to avoid hitting rate limits on a single query
  const query = HOT_QUERIES[Math.floor(Date.now() / 1800000) % HOT_QUERIES.length];

  try {
    const resp = await got(`${BASE_URL}?queryType=Latest&query=${encodeURIComponent(query)}`, {
      headers: {
        'X-API-Key': TWITTER_API_KEY,
        'Accept': 'application/json',
      },
      timeout: { request: 20000 },
      retry: { limit: 1 },
    }).json<TwitterResponse>();

    if (!resp?.tweets) return [];

    return resp.tweets.slice(0, 30).map((tweet, i) => {
      const engagement = tweet.likeCount + tweet.retweetCount * 2 + tweet.replyCount;
      const maxEngagement = Math.max(...resp.tweets.map(t => t.likeCount + t.retweetCount * 2 + t.replyCount), 1);

      // Clean and truncate tweet text
      let text = tweet.text
        .replace(/https?:\/\/\S+/g, '')
        .replace(/@\w+/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 120);

      return {
        title: text || `Tweet by @${tweet.author.userName}`,
        url: `https://x.com/${tweet.author.userName}/status/${tweet.id}`,
        rank: i + 1,
        heatIndex: Math.round((engagement / maxEngagement) * 100),
        rawHeat: engagement,
      };
    }).filter(t => t.title.length > 5);
  } catch (err) {
    console.error('[Twitter] Crawl error:', err);
    return [];
  }
}
