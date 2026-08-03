import prisma from '../db.js';
import type { Source } from '@prisma/client';
import { crawlWeibo } from './weibo.js';
import { crawlBaidu } from './baidu.js';
import { crawlBilibili } from './bilibili.js';
import { crawl36Kr } from './kr36.js';
import { crawlTwitter } from './twitter.js';
import { crawlWebSearch } from './web-search.js';
import { crawlBing } from './bing.js';
import { crawlSogou } from './sogou.js';
import { crawlGoogle } from './google.js';
import { normalizeTitle } from './utils.js';
import { broadcastNewTopic, broadcastSourceStatus } from '../socket.js';
import { runAiPipeline } from '../ai/pipeline.js';

type CrawlerFn = () => Promise<Array<{
  title: string;
  url: string;
  rank: number;
  heatIndex: number;
  rawHeat: number | null;
}>>;

const CRAWLERS: Record<string, CrawlerFn> = {
  weibo: crawlWeibo,
  baidu: crawlBaidu,
  bilibili: crawlBilibili,
  '36kr': crawl36Kr,
  twitter: crawlTwitter,
  'web-search': crawlWebSearch,
  bing: crawlBing,
  sogou: crawlSogou,
  google: crawlGoogle,
};

const CRAWL_INTERVAL = parseInt(process.env.CRAWL_INTERVAL_MS || '1800000');
const RETRY_BACKOFF_BASE = 60000; // 1 min base

let running = false;
let timer: ReturnType<typeof setInterval> | null = null;

export async function crawlAllSources(): Promise<number> {
  const sources = await prisma.source.findMany({ where: { isActive: true } });
  let totalTopics = 0;

  for (const source of sources) {
    try {
      const count = await crawlSource(source);
      totalTopics += count;
      // Stagger: 2-second gap between sources
      await sleep(2000);
    } catch (err) {
      console.error(`[Scheduler] Error crawling ${source.slug}:`, err);
    }
  }

  // After all sources crawled, run AI pipeline
  if (totalTopics > 0) {
    try {
      await runAiPipeline();
    } catch (err) {
      console.error('[Scheduler] AI pipeline error:', err);
    }
  }

  return totalTopics;
}

async function crawlSource(source: Source): Promise<number> {
  const crawler = CRAWLERS[source.slug];
  if (!crawler) {
    console.warn(`[Scheduler] No crawler for source: ${source.slug}`);
    return 0;
  }

  // Check cooldown
  if (source.cooldownUntil && new Date() < source.cooldownUntil) {
    console.log(`[Scheduler] ${source.slug} in cooldown until ${source.cooldownUntil}`);
    return 0;
  }

  const startTime = Date.now();
  let status = 'success';
  let errorMessage: string | null = null;
  let topicsFound = 0;

  try {
    const rawTopics = await crawler();
    topicsFound = rawTopics.length;

    // Save ALL topics — AI pipeline will filter by keyword relevance
    for (const raw of rawTopics) {
      await saveTopic(raw, source.id);
    }

    // Update source status
    await prisma.source.update({
      where: { id: source.id },
      data: {
        status: 'ok',
        lastFetchedAt: new Date(),
        cooldownUntil: null,
      },
    });

    broadcastSourceStatus(source.id, 'ok');
  } catch (err: any) {
    status = 'error';
    errorMessage = err.message;

    // Exponential backoff
    const failCount = await getRecentFailures(source.id);
    const backoffMs = Math.min(
      Math.pow(2, failCount) * RETRY_BACKOFF_BASE,
      30 * 60 * 1000 // max 30 min
    );

    await prisma.source.update({
      where: { id: source.id },
      data: {
        status: failCount >= 5 ? 'degraded' : 'down',
        cooldownUntil: new Date(Date.now() + backoffMs),
      },
    });

    broadcastSourceStatus(source.id, failCount >= 5 ? 'degraded' : 'down');
  }

  // Log crawl result
  await prisma.crawlLog.create({
    data: {
      sourceId: source.id,
      status,
      topicsFound,
      durationMs: Date.now() - startTime,
      errorMessage,
    },
  });

  return topicsFound;
}

async function saveTopic(
  raw: { title: string; url: string; rank: number; heatIndex: number; rawHeat: number | null },
  sourceId: number
): Promise<void> {
  const normalizedTitle = normalizeTitle(raw.title);

  // Check for existing topic within 2 hours
  const existing = await prisma.topic.findFirst({
    where: {
      normalizedTitle,
      sourceId,
      lastSeenAt: { gte: new Date(Date.now() - 2 * 3600_000) },
    },
  });

  if (existing) {
    // Update existing
    const newHeat = (existing.heatIndex * existing.mentionCount + raw.heatIndex) / (existing.mentionCount + 1);
    // Use rawHeat for growth to avoid normalization artifacts
    const growthRate = existing.rawHeat && raw.rawHeat
      ? (raw.rawHeat - existing.rawHeat) / existing.rawHeat
      : 0;

    await prisma.topic.update({
      where: { id: existing.id },
      data: {
        heatIndex: newHeat,
        growthRate,
        lastSeenAt: new Date(),
        mentionCount: { increment: 1 },
        sourceRank: raw.rank,
        peakHeat: Math.max(existing.peakHeat, raw.heatIndex),
      },
    });

    await prisma.topicHistory.create({
      data: {
        topicId: existing.id,
        heatIndex: newHeat,
        growthRate,
        sourceRank: raw.rank,
      },
    });
  } else {
    // Create new topic
    const topic = await prisma.topic.create({
      data: {
        title: raw.title,
        normalizedTitle,
        sourceId,
        sourceRank: raw.rank,
        url: raw.url,
        heatIndex: raw.heatIndex,
        rawHeat: raw.rawHeat,
        firstSeenAt: new Date(),
        lastSeenAt: new Date(),
        peakHeat: raw.heatIndex,
      },
    });

    // Broadcast via Socket.io
    broadcastNewTopic({
      id: topic.id,
      title: topic.title,
      normalizedTitle: topic.normalizedTitle,
      sourceId: topic.sourceId,
      sourceRank: topic.sourceRank,
      url: topic.url,
      heatIndex: topic.heatIndex,
      rawHeat: topic.rawHeat,
      growthRate: null,
      velocityScore: null,
      aiVerified: 0,
      aiSummary: null,
      aiCategory: null,
      firstSeenAt: topic.firstSeenAt.toISOString(),
      lastSeenAt: topic.lastSeenAt.toISOString(),
      peakHeat: topic.peakHeat,
      mentionCount: 1,
      tier: null,
      matchedKeyword: null,
    });
  }
}

async function getRecentFailures(sourceId: number): Promise<number> {
  const recent = await prisma.crawlLog.findMany({
    where: {
      sourceId,
      createdAt: { gte: new Date(Date.now() - 6 * 3600_000) },
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  let fails = 0;
  for (const log of recent) {
    if (log.status === 'error') fails++;
    else break;
  }
  return fails;
}

// ── Scheduler ──

export function startScheduler(): void {
  console.log(`[Scheduler] Starting with ${CRAWL_INTERVAL}ms interval`);

  // Run immediately on start
  crawlAllSources().then((count) => {
    console.log(`[Scheduler] Initial crawl: ${count} topics`);
  });

  // Schedule periodic runs
  timer = setInterval(() => {
    if (running) {
      console.log('[Scheduler] Previous crawl still running, skipping');
      return;
    }
    running = true;
    crawlAllSources()
      .then((count) => console.log(`[Scheduler] Crawl complete: ${count} topics`))
      .catch((err) => console.error('[Scheduler] Crawl error:', err))
      .finally(() => { running = false; });
  }, CRAWL_INTERVAL);
}

export function stopScheduler(): void {
  if (timer) clearInterval(timer);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
