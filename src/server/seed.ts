import prisma from './db.js';

const sources = [
  {
    slug: 'weibo',
    name: '微博热搜',
    url: 'https://weibo.com/ajax/side/hotSearch',
    accessType: 'api',
    fetchIntervalMs: 1800000,
  },
  {
    slug: 'sogou',
    name: '搜狗热搜',
    url: 'https://www.sogou.com/suggnew/hotwords',
    accessType: 'api',
    fetchIntervalMs: 1800000,
  },
  {
    slug: 'baidu',
    name: '百度热搜',
    url: 'https://top.baidu.com/board?tab=realtime',
    accessType: 'scrape',
    fetchIntervalMs: 1800000,
  },
  {
    slug: 'google',
    name: 'Google News',
    url: 'https://news.google.com',
    accessType: 'scrape',
    fetchIntervalMs: 1800000,
  },
  {
    slug: 'bilibili',
    name: 'B站热门',
    url: 'https://api.bilibili.com/x/web-interface/popular',
    accessType: 'api',
    fetchIntervalMs: 1800000,
  },
  {
    slug: '36kr',
    name: '36氪快讯',
    url: 'https://36kr.com/feed',
    accessType: 'rss',
    fetchIntervalMs: 1800000,
  },
  {
    slug: 'bing',
    name: 'Bing 搜索',
    url: 'https://www.bing.com/search',
    accessType: 'scrape',
    fetchIntervalMs: 1800000,
  },
  {
    slug: 'twitter',
    name: 'Twitter (X)',
    url: 'https://api.twitterapi.io/twitter/tweet/advanced_search',
    accessType: 'api',
    fetchIntervalMs: 1800000,
  },
  {
    slug: 'web-search',
    name: '通用网页搜索',
    url: '',
    accessType: 'scrape',
    fetchIntervalMs: 1800000,
  },
];

async function main() {
  console.log('Seeding data sources...');

  for (const source of sources) {
    await prisma.source.upsert({
      where: { slug: source.slug },
      create: source,
      update: { url: source.url, accessType: source.accessType },
    });
  }

  // Seed default settings
  const defaultSettings: Record<string, string> = {
    crawl_interval_ms: '1800000',
    ai_model_tier1: 'deepseek/deepseek-v4-flash',
    ai_model_tier2: 'deepseek/deepseek-v4-flash',
    retention_days: '30',
  };

  for (const [key, value] of Object.entries(defaultSettings)) {
    await prisma.setting.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
  }

  console.log(`Seeded ${sources.length} sources and ${Object.keys(defaultSettings).length} settings.`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
