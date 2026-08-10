import prisma from '../db.js';
import { aiChat, MODELS } from '../ai/client.js';
import { seedCompaniesForKeyword, findSeedCompany } from './company-map.js';
import {
  buildSecid,
  fetchQuotesWithFallback,
  searchStock,
  type Quote,
  type KlinePoint,
} from './provider.js';

// ── Topic ↔ Stock linkage pipeline ──
// Runs after each crawl for tiered topics + top-heat topics. Cost is bounded by
// DAILY_TOPIC_LIMIT, a 30-minute refresh cache and per-topic 3-stock cap.

const DAILY_TOPIC_LIMIT = Number(process.env.STOCK_DAILY_TOPIC_LIMIT || 50);
const ROUND_LIMIT = 20;
const REFRESH_CACHE_MS = 30 * 60_000;
const RECAP_THRESHOLD = 1.5;
const MAX_STOCKS_PER_TOPIC = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run a fallible async producer with bounded retries + backoff.
 * Returns the first non-null result; null/throws are retried until attempts
 * are exhausted (transient 429/timeout failures recover on the next round).
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T | null>,
  attempts = 3,
  delayMs: number[] = [1000, 3000],
): Promise<T | null> {
  for (let i = 0; i < attempts; i++) {
    try {
      const result = await fn();
      if (result != null) return result;
    } catch (err) {
      console.warn(`[Stocks] retryable call failed (attempt ${i + 1}/${attempts}):`, (err as Error).message?.slice(0, 160));
    }
    if (i < attempts - 1) {
      await sleep(delayMs[i] ?? delayMs[delayMs.length - 1] ?? 1000);
    }
  }
  return null;
}

function parseDateKey(d: string): number {
  return Number(d.replace(/-/g, ''));
}

async function extractCompanyNames(title: string, snippet: string | null): Promise<string[]> {
  try {
    const result = await aiChat({
      model: MODELS.fast,
      prompt: `你是A股上市公司识别器。从话题中提取可能直接相关的中国A股上市公司名称（不含未上市公司、不含港股/美股）。

规则：
- 只输出明确可对应的公司名（如"中芯国际""北方华创"），不要输出行业泛称（如"半导体设备商"）
- 提取 1-3 个，按相关度排序；没有把握就返回空数组
- 只根据标题和摘要判断，不要猜测

标题: ${title}
${snippet ? `摘要: ${snippet}` : ''}

返回 JSON: {"companies": ["..."]}`,
      jsonSchema: {
        name: 'StockCompanyExtraction',
        schema: {
          type: 'object',
          properties: {
            companies: { type: 'array', items: { type: 'string' }, maxItems: 3 },
          },
          required: ['companies'],
        },
      },
      maxTokens: 256,
    }) as { companies?: string[] };
    return (result?.companies || []).filter((c) => typeof c === 'string' && c.trim()).slice(0, 3);
  } catch {
    return [];
  }
}

async function resolveCompany(keyword: string, name: string): Promise<{ name: string; code: string; secid: string } | null> {
  const seed = findSeedCompany(keyword, name);
  if (seed) return { name: seed.name, code: seed.code, secid: buildSecid(seed.code) };
  const found = await searchStock(name);
  if (found?.code) return { name: found.name, code: found.code, secid: found.secid || buildSecid(found.code) };
  return null;
}

function fallbackSeeds(keyword: string): Array<{ name: string; code: string; secid: string }> {
  return seedCompaniesForKeyword(keyword).slice(0, MAX_STOCKS_PER_TOPIC).map((s) => ({
    name: s.name,
    code: s.code,
    secid: buildSecid(s.code),
  }));
}

// Kept for tests/documentation; the live pipeline uses only today's quote now.
export function computeMetrics(kline: KlinePoint[], discoveryDate: string) {
  if (!kline.length) return null;
  const last = kline[kline.length - 1].close;
  const key = parseDateKey(discoveryDate);

  // 5 trading days ago (or the earliest point if the window is short)
  const base5 = kline.length >= 6 ? kline[kline.length - 6].close : kline[0].close;
  const pct5d = base5 > 0 ? ((last - base5) / base5) * 100 : null;

  // last close at/before discovery → discovery baseline
  let baseIdx = 0;
  for (let i = 0; i < kline.length; i++) {
    if (parseDateKey(kline[i].date) <= key) baseIdx = i;
    else break;
  }
  const base = kline[baseIdx].close;
  const pctSince = base > 0 ? ((last - base) / base) * 100 : null;

  const trend = kline.slice(baseIdx).map((p) => p.close).slice(-30);
  return { pct5d, pctSince, trend };
}

async function generateRecap(title: string, rows: Array<{ name: string; pctToday: number | null }>): Promise<string | null> {
  try {
    const result = await aiChat({
      model: MODELS.fast,
      prompt: `你是A股投资复盘助手。根据话题和行情数据写 1-2 句中文复盘（不超过 60 字），说明话题出现后相关A股的表现与可能的关联。不要给买卖建议，不要编造行情之外的信息。

话题: ${title}
标的行情:
${rows.map((r) => `- ${r.name} 涨跌 ${r.pctToday?.toFixed(1) ?? '—'}%`).join('\n')}

返回 JSON: {"recap": "..."}`,
      jsonSchema: {
        name: 'StockRecap',
        schema: {
          type: 'object',
          properties: { recap: { type: 'string' } },
          required: ['recap'],
        },
      },
      maxTokens: 256,
    }) as { recap?: string };
    return typeof result?.recap === 'string' && result.recap.trim() ? result.recap.trim().slice(0, 200) : null;
  } catch {
    return null;
  }
}

/** Refresh stock links for ONE topic (extract → resolve → quote → kline → recap). */
export async function refreshTopicStocks(topicId: number): Promise<number> {
  const topic = await prisma.topic.findUnique({ where: { id: topicId } });
  if (!topic || topic.isHidden || !topic.matchedKeyword) return 0;

  // 1) extract company names (LLM) → resolve codes
  const names = await extractCompanyNames(topic.title, topic.snippet);
  let companies: Array<{ name: string; code: string; secid: string }> = [];
  for (const name of names) {
    const resolved = await resolveCompany(topic.matchedKeyword, name);
    if (resolved) companies.push(resolved);
    if (companies.length >= MAX_STOCKS_PER_TOPIC) break;
  }
  if (!companies.length) companies = fallbackSeeds(topic.matchedKeyword);
  if (!companies.length) return 0;

  // dedupe by code
  const seen = new Set<string>();
  companies = companies.filter((c) => (seen.has(c.code) ? false : (seen.add(c.code), true)));

  // 2) quotes (Eastmoney → Sina fallback)
  const quotes = await fetchQuotesWithFallback(companies.map((c) => c.secid));

  let saved = 0;
  const recapRows: Array<{ name: string; pctToday: number | null }> = [];
  for (const c of companies) {
    const q: Quote | undefined = quotes.get(c.secid);
    const data = {
      stockCode: c.code,
      stockName: q?.name || c.name,
      exchange: 'A股',
      secid: c.secid,
      price: q?.price ?? null,
      pctToday: q?.pct ?? null,
      pct5d: null,
      pctSinceDiscovery: null,
      trendJson: null,
      isStale: false,
      quoteTime: q ? new Date() : null,
      fetchedAt: new Date(),
    };
    await prisma.topicStockLink.upsert({
      where: { topicId_stockCode: { topicId, stockCode: c.code } },
      update: data,
      create: { topicId, ...data },
    });
    saved++;
    recapRows.push({ name: data.stockName, pctToday: data.pctToday });
  }

  // 4) recap only when something moved enough, and not already cached
  const maxMove = Math.max(0, ...recapRows.map((r) => Math.abs(r.pctToday ?? 0)));
  if (maxMove >= RECAP_THRESHOLD && !topic.stockRecap) {
    const recap = await retryWithBackoff(() => generateRecap(topic.title, recapRows), 3, [1000, 3000]);
    if (recap) {
      await prisma.topic.update({ where: { id: topicId }, data: { stockRecap: recap } });
    } else {
      console.warn(`[Stocks] recap generation failed for topic #${topicId} after retries; will retry next refresh`);
    }
  }
  return saved;
}

/** Refresh stock links for eligible topics (tiered first, then top heat). */
export async function refreshStockLinks(): Promise<{ topics: number; links: number }> {
  const kwNames = (await prisma.keyword.findMany({ where: { deletedAt: null }, select: { keyword: true } })).map((k) => k.keyword);
  if (!kwNames.length) return { topics: 0, links: 0 };

  const weekAgo = new Date(Date.now() - 7 * 24 * 3600_000);
  const cacheCutoff = new Date(Date.now() - REFRESH_CACHE_MS);
  const baseWhere: any = {
    isHidden: false,
    matchedKeyword: { in: kwNames },
    lastSeenAt: { gte: weekAgo },
    stockLinks: { none: { fetchedAt: { gte: cacheCutoff } } },
  };

  const [tiered, topHeat, eligibleTiered, eligibleTopHeat] = await Promise.all([
    prisma.topic.findMany({
      where: { ...baseWhere, tier: { not: null } },
      orderBy: [{ velocityScore: 'desc' }, { heatScore: 'desc' }],
      take: ROUND_LIMIT,
      select: { id: true },
    }),
    prisma.topic.findMany({
      where: { ...baseWhere, tier: null },
      orderBy: [{ heatScore: 'desc' }],
      take: 10,
      select: { id: true },
    }),
    prisma.topic.findMany({
      where: { isHidden: false, matchedKeyword: { in: kwNames }, lastSeenAt: { gte: weekAgo }, tier: { not: null } },
      take: 100,
      select: { id: true },
    }),
    prisma.topic.findMany({
      where: { isHidden: false, matchedKeyword: { in: kwNames }, lastSeenAt: { gte: weekAgo }, tier: null },
      orderBy: [{ heatScore: 'desc' }],
      take: 10,
      select: { id: true },
    }),
  ]);

  const eligibleIds = [...new Set([...eligibleTiered.map((t) => t.id), ...eligibleTopHeat.map((t) => t.id)])];
  const ids = [...new Set([...tiered.map((t) => t.id), ...topHeat.map((t) => t.id)])].slice(0, Math.min(DAILY_TOPIC_LIMIT, ROUND_LIMIT));
  let links = 0;
  for (const id of ids) {
    try {
      links += await refreshTopicStocks(id);
    } catch (err) {
      console.warn(`[Stocks] refresh failed for topic #${id}:`, (err as Error).message?.slice(0, 160));
    }
  }
  // Topics that fell out of the candidate set keep their last quote but are
  // flagged stale → frontend shows "过去涨跌" instead of "今日涨跌".
  if (eligibleIds.length) {
    await prisma.topicStockLink.updateMany({
      where: { topicId: { notIn: eligibleIds }, isStale: false },
      data: { isStale: true },
    });
  }
  console.log(`[Stocks] refreshed ${ids.length} topics, ${links} stock links`);
  return { topics: ids.length, links };
}
