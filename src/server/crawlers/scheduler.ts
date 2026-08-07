import prisma from '../db.js';
import type { Source } from '@prisma/client';
import { crawlWeibo } from './weibo.js';
import { crawlBaidu } from './baidu.js';
import { crawlBilibili } from './bilibili.js';
import { crawl36Kr } from './kr36.js';
import { crawlWebSearch } from './web-search.js';
import { crawlBing } from './bing.js';
import { crawlSogou } from './sogou.js';
import { crawlHackerNews } from './hacker-news.js';
import { ensureAllSearchQueries, ensureAllSearchContext } from './keyword-queries.js';
import { isLowValueContent } from './content-filter.js';
import { normalizeTitle, type CrawlerItem } from './utils.js';
import { broadcastNewTopic, broadcastSourceStatus, broadcastCrawlStatus } from '../socket.js';
import { runAiPipeline } from '../ai/pipeline.js';
import type { CrawlStatus } from '../../shared/types.js';

type CrawlerFn = () => Promise<CrawlerItem[]>;

// Heat decay: half-life of 24h — mega-hits cool down naturally instead of dominating forever
const HEAT_HALF_LIFE_HOURS = 24;
const DECAY_SETTING_KEY = 'last_heat_decay_at';

const CRAWLERS: Record<string, CrawlerFn> = {
  weibo: crawlWeibo,
  baidu: crawlBaidu,
  bilibili: crawlBilibili,
  '36kr': crawl36Kr,
  'web-search': crawlWebSearch,
  bing: crawlBing,
  sogou: crawlSogou,
  'hacker-news': crawlHackerNews,
};

const CRAWL_INTERVAL = parseInt(process.env.CRAWL_INTERVAL_MS || '1800000');
const RETRY_BACKOFF_BASE = 60000; // 1 min base

let running = false;
let timer: ReturnType<typeof setInterval> | null = null;

let crawlStatus: CrawlStatus = {
  running: false,
  phase: 'idle',
  progress: 0,
  currentSource: null,
  sourcesDone: 0,
  sourcesTotal: 0,
  topicsFound: 0,
  startedAt: null,
  updatedAt: null,
};

export function getCrawlStatus(): CrawlStatus {
  return { ...crawlStatus };
}

function updateCrawlStatus(patch: Partial<CrawlStatus>): void {
  crawlStatus = { ...crawlStatus, ...patch, updatedAt: new Date().toISOString() };
  broadcastCrawlStatus(getCrawlStatus());
}

export async function crawlAllSources(): Promise<number> {
  updateCrawlStatus({
    running: true,
    phase: 'crawling',
    progress: 0,
    currentSource: null,
    sourcesDone: 0,
    sourcesTotal: 0,
    topicsFound: 0,
    startedAt: new Date().toISOString(),
  });

  try {
    // Decay existing heat scores before the new crawl (24h half-life)
    await decayHeatScores().catch((err) => console.error('[Scheduler] Heat decay error:', err));

    const sources = await prisma.source.findMany({ where: { isActive: true } });
    updateCrawlStatus({ sourcesTotal: sources.length });
    let totalTopics = 0;

    for (const source of sources) {
      updateCrawlStatus({ currentSource: source.name });
      try {
        const count = await crawlSource(source);
        totalTopics += count;
        const done = crawlStatus.sourcesDone + 1;
        updateCrawlStatus({
          sourcesDone: done,
          topicsFound: totalTopics,
          progress: Math.round((done / Math.max(sources.length, 1)) * 80),
        });
        // Stagger: 2-second gap between sources
        await sleep(2000);
      } catch (err) {
        console.error(`[Scheduler] Error crawling ${source.slug}:`, err);
      }
    }

    // After all sources crawled, run AI pipeline
    if (totalTopics > 0) {
      updateCrawlStatus({ phase: 'ai', progress: 82, currentSource: null });
      try {
        await runAiPipeline((aiProgress) => {
          updateCrawlStatus({ progress: Math.min(98, 82 + Math.round(aiProgress * 0.16)) });
        });
      } catch (err) {
        console.error('[Scheduler] AI pipeline error:', err);
      }
    }

    updateCrawlStatus({
      running: false,
      phase: 'idle',
      progress: 100,
      currentSource: null,
      sourcesDone: sources.length,
    });
    return totalTopics;
  } catch (err) {
    updateCrawlStatus({ running: false, phase: 'idle', progress: 100, currentSource: null });
    throw err;
  }
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

    // Rule-based low-value filter: encyclopedia/dictionary/official-site/tutorial noise
    const kept = rawTopics.filter((t) => !isLowValueContent(t.title, t.url));
    const dropped = rawTopics.length - kept.length;
    if (dropped > 0) {
      console.log(`[Scheduler] ${source.slug}: dropped ${dropped} low-value items (${rawTopics.length} → ${kept.length})`);
    }
    topicsFound = kept.length;

    // Save ALL kept topics — AI pipeline will filter by keyword relevance
    for (const raw of kept) {
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
  raw: CrawlerItem,
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

    // Growth rate vs the FIRST observation (baseline, written once on first sight):
    // growthRate = (current − baseline) / baseline × 100. Baseline is unaffected by decay.
    let growthRate: number | null = null;
    if (raw.heatScore != null && existing.prevHeatScore != null && existing.prevHeatScore > 0) {
      growthRate = ((raw.heatScore - existing.prevHeatScore) / existing.prevHeatScore) * 100;
    }

    await prisma.topic.update({
      where: { id: existing.id },
      data: {
        heatIndex: newHeat,
        // Refresh with the freshest observed heat score (previous value was decayed)
        ...(raw.heatScore != null ? { heatScore: raw.heatScore } : {}),
        // Baseline is written only once (if this topic's first observation is still missing)
        ...(raw.heatScore != null && existing.prevHeatScore == null ? { prevHeatScore: raw.heatScore } : {}),
        // Keep the original publish time if the source provides one (never overwrite with null)
        ...(raw.publishedAt != null ? { publishedAt: toDate(raw.publishedAt) } : {}),
        ...(raw.snippet != null ? { snippet: raw.snippet } : {}),
        ...(raw.searchQuery != null ? { searchQuery: raw.searchQuery } : {}),
        engagement: raw.engagement ? JSON.stringify(raw.engagement) : null,
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
        heatScore: raw.heatScore,
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
        heatScore: raw.heatScore,
        prevHeatScore: raw.heatScore, // first observation becomes the growth baseline
        engagement: raw.engagement ? JSON.stringify(raw.engagement) : null,
        snippet: raw.snippet ?? null,
        searchQuery: raw.searchQuery ?? null,
        publishedAt: toDate(raw.publishedAt),
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
      growthRate: null,
      velocityScore: null,
      publishedAt: topic.publishedAt?.toISOString() ?? null,
      aiVerified: 0,
      isRumor: null,
      matchReason: null,
      matchConfidence: null,
      isActionable: null,
      engagement: topic.engagement ? JSON.parse(topic.engagement) : null,
      firstSeenAt: topic.firstSeenAt.toISOString(),
      lastSeenAt: topic.lastSeenAt.toISOString(),
      peakHeat: topic.peakHeat,
      mentionCount: 1,
      tier: null,
      matchedKeyword: null,
    });
  }
}

function toDate(v: number | string | Date | null | undefined): Date | null {
  if (v == null) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
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

// ── Heat decay (24h half-life) ──
// Applies exponential decay to all heat scores based on time since the last decay.
async function decayHeatScores(): Promise<void> {
  const setting = await prisma.setting.findUnique({ where: { key: DECAY_SETTING_KEY } });
  const now = Date.now();
  const last = setting?.value ? new Date(setting.value).getTime() : now;
  const hours = (now - last) / 3600_000;
  if (hours <= 0) return;

  const factor = Math.pow(0.5, hours / HEAT_HALF_LIFE_HOURS);
  await prisma.topic.updateMany({
    where: { heatScore: { not: null } },
    data: { heatScore: { multiply: factor } },
  });

  await prisma.setting.upsert({
    where: { key: DECAY_SETTING_KEY },
    create: { key: DECAY_SETTING_KEY, value: new Date(now).toISOString() },
    update: { value: new Date(now).toISOString() },
  });

  if (hours > 1) console.log(`[Scheduler] Heat decayed by factor ${factor.toFixed(4)} (${hours.toFixed(1)}h since last)`);
}

// ── Scheduler ──

export function startScheduler(): void {
  console.log(`[Scheduler] Starting with ${CRAWL_INTERVAL}ms interval`);

  // Backfill search queries for keywords without a cached mapping (lazy generation)
  ensureAllSearchQueries().catch((err) => {
    console.error('[Scheduler] Keyword query backfill error:', err);
  });
  ensureAllSearchContext().catch((err) => {
    console.error('[Scheduler] Search context backfill error:', err);
  });

  // Run immediately on start (guarded by `running` so the interval never overlaps)
  running = true;
  crawlAllSources()
    .then((count) => console.log(`[Scheduler] Initial crawl: ${count} topics`))
    .catch((err) => console.error('[Scheduler] Initial crawl error:', err))
    .finally(() => { running = false; });

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

/**
 * Manual crawl trigger (used by POST /api/v1/crawl/trigger).
 * Shares the `running` guard with the interval scheduler so a manual trigger
 * never launches a second concurrent crawl + AI pipeline (which caused
 * duplicate-delete P2025 errors).
 */
export async function triggerCrawl(): Promise<{ ok: boolean; count?: number; error?: string }> {
  if (running) {
    return { ok: false, error: '爬取已在进行中，请稍候' };
  }
  running = true;
  try {
    const count = await crawlAllSources();
    return { ok: true, count };
  } finally {
    running = false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
