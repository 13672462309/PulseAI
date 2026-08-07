import prisma from '../db.js';
import { aiChat, MODELS } from './client.js';
import { broadcastAlert, broadcastNewTopic } from '../socket.js';
import { defaultIntent } from '../crawlers/keyword-queries.js';

// ── Config ──
// Heat-score-driven velocity: growthRate% × √heatScore × source diversity (÷10 for scale).
// sqrt weight gives the heat base 6.6× influence (vs 2× for log10), so small-base topics
// don't get inflated velocity from percentage growth alone.
// RISING ≥ 30 ≈ mid-tier topic growing ~30%; BURST = hot + accelerating.
const RISING_THRESHOLD = 30;
const BURST_THRESHOLD = 100;
const HEAT_THRESHOLD = 80;    // heatIndex threshold for "hot" (raised from 50: search-source rank-based scores flooded the hot list)

// ── Stage 1: Keyword Relevance Check (THE GATE) ──

interface RelevanceResult {
  relevant: boolean;
  matchedKeyword: string | null;
  confidence: number;
  reason: string | null;
}

export interface RelevanceInput {
  title: string;
  snippet?: string | null;
  source?: string | null;
}

export function buildRelevancePrompt(
  items: RelevanceInput[],
  kwList: string[],
  intentMap: Map<string, string>,
): string {
  return `你是一个关键词匹配引擎。逐条判断以下内容标题是否与指定关键词语义相关。

关键词及其关注意图:
${kwList.map((kw) => `- ${kw}：${intentMap.get(kw) ?? defaultIntent(kw)}`).join('\n')}

规则：
- 结合关键词意图判断，语义相关即可（不需要出现原词，例如关键词"半导体"应匹配"台积电3nm量产"）
- 标题包含关键词不等于相关（例如"半导体照明"对芯片产业不相关），需结合意图与摘要判断
- 完全不相关才判定为不匹配
- 有摘要时优先结合摘要判断，标题相似但摘要无关的应判为不相关
- 标题信息不足时，以摘要为主要判断依据（例如标题只有"AI新品"，摘要描述模型能力则应判相关）
- 营销活动、展会、娱乐内容若无明确产业动态或公司信息，判为不相关
- 教程/技巧、二手回收、第三方改装等非产业信息，除非涉及上市公司公告或重大产业动态，判为不相关
- 逐条对应输入顺序返回
- 每条附带一句简短匹配理由（15-25字，中文）

内容标题列表:
${items.map((item, idx) => {
    let line = `[${idx}] 标题：${item.title}`;
    if (item.snippet) line += `\n    摘要：${item.snippet}`;
    if (item.source) line += `\n    来源：${item.source}`;
    return line;
  }).join('\n')}

返回 JSON：
{"results": [{"index": 0, "relevant": true/false, "matchedKeyword": "匹配到的关键词或null", "confidence": 0.0-1.0, "reason": "匹配理由"}]}`;
}

export async function checkKeywordRelevance(title: string): Promise<RelevanceResult> {
  const [result] = await checkKeywordRelevanceBatch([{ title }]);
  return result ?? { relevant: false, matchedKeyword: null, confidence: 0, reason: null };
}

/**
 * Batch keyword relevance check — one AI call per ~25 titles instead of one per title.
 * Returns null for titles whose AI call failed (caller must NOT delete those — they
 * get retried next round rather than being dropped on a transient AI error).
 */
export async function checkKeywordRelevanceBatch(items: RelevanceInput[]): Promise<Array<RelevanceResult | null>> {
  if (!items.length) return [];

  const keywords = await prisma.keyword.findMany({ where: { isActive: true } });
  if (!keywords.length) return items.map(() => ({ relevant: false, matchedKeyword: null, confidence: 0, reason: null }));

  const kwList = keywords.map(k => k.keyword);
  const intentMap = new Map(keywords.map(k => [k.keyword, k.intentContext || defaultIntent(k.keyword)]));

  // Fast path removed: string containment is a strong signal but not a verdict
  // (e.g. "半导体照明" contains the keyword but is off-topic). Every title now
  // goes through AI judgement; failures stay null and are retried next round.
  const results: Array<RelevanceResult | null> = items.map(() => null);
  const aiNeeded = items.map((item, idx) => ({ item, idx }));
  if (!aiNeeded.length) return results;

  const prompt = buildRelevancePrompt(aiNeeded.map((n) => n.item), kwList, intentMap);

  try {
    const result = await aiChat({
      model: MODELS.fast,
      prompt,
      jsonSchema: {
        name: 'RelevanceCheckBatch',
        schema: {
          type: 'object',
          properties: {
            results: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  index: { type: 'number' },
                  relevant: { type: 'boolean' },
                  matchedKeyword: { type: 'string', nullable: true },
                  confidence: { type: 'number' },
                  reason: { type: 'string' },
                },
                required: ['index', 'relevant', 'matchedKeyword', 'confidence'],
              },
            },
          },
          required: ['results'],
        },
      },
      maxTokens: 2048,
    }) as { results?: Array<{ index: number; relevant: boolean; matchedKeyword: string | null; confidence: number; reason?: string }> };

    const byIndex = new Map((result?.results || []).map((r) => [r.index, r]));
    for (const { idx } of aiNeeded) {
      const r = byIndex.get(idx);
      if (r) {
        results[idx] = {
          relevant: r.relevant,
          matchedKeyword: r.matchedKeyword || null,
          confidence: r.confidence ?? 0,
          reason: typeof r.reason === 'string' && r.reason.trim() ? r.reason.trim() : null,
        };
      }
      // missing entries stay null → retried next round
    }
    return results;
  } catch (err) {
    console.error('[AI] Batch relevance check error:', err);
    return results; // nulls stay null → retried next round, nothing deleted
  }
}

// ── Stage 2: Content Verification ──

interface VerifyResult {
  isRumor: boolean;
  isActionable: boolean;
  isVerified: boolean;
}

export async function verifyTopic(title: string): Promise<VerifyResult | null> {
  const [result] = await verifyTopicsBatch([title]);
  return result;
}

/**
 * Batch content verification — one AI call per batch instead of one per title.
 * Slimmed down: only the three booleans actually consumed are requested
 * (verified / rumor / actionable) to shorten responses and speed up batches.
 */
export async function verifyTopicsBatch(titles: string[]): Promise<Array<VerifyResult | null>> {
  if (!titles.length) return [];

  const prompt = `你是热点内容审核员。逐条分析以下话题并分类，按输入顺序返回。

规则（逐条）:
isVerified: 是否为真实可信内容（排除营销/谣言/娱乐/低价值噪音）
isRumor: 是否疑似未经证实的谣言
isActionable: 该内容是否值得采取行动（如引发市场关注/可投资参考）

话题列表:
${titles.map((t, i) => `[${i}] "${t}"`).join('\n')}

返回 JSON: {"results": [{"index": 0, "isVerified":true, "isRumor":false, "isActionable":true}]}`;

  try {
    const result = await aiChat({
      model: MODELS.fast,
      prompt,
      jsonSchema: {
        name: 'VerifyBatch',
        schema: {
          type: 'object',
          properties: {
            results: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  index: { type: 'number' },
                  isVerified: { type: 'boolean' },
                  isRumor: { type: 'boolean' },
                  isActionable: { type: 'boolean' },
                },
                required: ['index','isVerified','isRumor','isActionable'],
              },
            },
          },
          required: ['results'],
        },
      },
      maxTokens: 1024,
    }) as { results?: Array<VerifyResult & { index: number }> };

    const results: Array<VerifyResult | null> = new Array(titles.length).fill(null);
    for (const r of result?.results || []) {
      if (r && typeof r.index === 'number' && r.index >= 0 && r.index < titles.length) {
        results[r.index] = { isVerified: !!r.isVerified, isRumor: !!r.isRumor, isActionable: !!r.isActionable };
      }
    }
    return results;
  } catch (err) {
    console.error('[AI] Batch verify error:', err);
    return new Array(titles.length).fill(null);
  }
}

// ── Stage 3: Velocity + Tier Classification ──

export async function classifyTiers(): Promise<void> {
  // Compute velocityScore for ALL recent keyword-relevant topics (not just tiered ones),
  // so every card shows a growth number. Only topics confirmed relevant by the AI pipeline
  // (matchedKeyword set) get classified — unprocessed topics stay invisible in the lists.
  // Topics that already carry a tier are also included so stale tiers get demoted
  // once they stop appearing for a full active window (7 days).
  const now = Date.now();
  const activeWindow = new Date(now - 7 * 24 * 3600_000);
  const topics = await prisma.topic.findMany({
    where: {
      OR: [
        { matchedKeyword: { not: null }, lastSeenAt: { gte: activeWindow } },
        { tier: { not: null } },
      ],
    },
    include: { history: { orderBy: { recordedAt: 'desc' }, take: 10 } },
  });

  for (const t of topics) {
    // 超过 7 天没再被抓到 → 热度已回落，级别自动降级（不再占用 KPI/列表名额）
    if (t.lastSeenAt.getTime() < now - 7 * 24 * 3600_000) {
      await prisma.topic.update({
        where: { id: t.id },
        data: { tier: null, recommendScore: t.heatScore ?? 0 },
      });
      continue;
    }

    // Count unique sources
    const sourceCount = await prisma.topic.count({
      where: { normalizedTitle: t.normalizedTitle, lastSeenAt: { gte: activeWindow } },
    });

    // Velocity from heatScore observations (growthRate = % change vs first observation)
    const growthRate = t.growthRate;
    if (growthRate == null || t.heatScore == null) {
      // No baseline yet — write a visible 0 so the card still shows a number
      const tierWeight = t.tier === 'burst' ? 5000 : t.tier === 'hot' ? 3000 : t.tier === 'rising' ? 1500 : 0;
      const freshness = Math.max(0, 48 - (Date.now() - t.lastSeenAt.getTime()) / 3600_000) * 10;
      await prisma.topic.update({
        where: { id: t.id },
        data: {
          velocityScore: 0,
          recommendScore: tierWeight + (t.heatScore ?? 0) + freshness,
        },
      });
      continue;
    }
    const sourceDiv = 1 + sourceCount * 0.2;
    const velocityScore = (growthRate * Math.sqrt(t.heatScore + 1) * sourceDiv) / 10;

    // Recompute tier from CURRENT state every round (no stale escalation):
    //   heat ≥ 80 → burst (if accelerating ≥100) or hot
    //   heat < 80 → rising (if velocity ≥ 30) or untiered
    // This lets a slowed-down topic fall back out of rising/burst naturally.
    const isHot = t.heatIndex >= HEAT_THRESHOLD;
    let tier: string | null;
    if (isHot) {
      tier = velocityScore >= BURST_THRESHOLD ? 'burst' : 'hot';
    } else {
      tier = velocityScore >= RISING_THRESHOLD ? 'rising' : null;
    }

    // Comprehensive recommendation: tier priority dominates, then velocity + heat + freshness.
    const tierWeight = tier === 'burst' ? 5000 : tier === 'hot' ? 3000 : tier === 'rising' ? 1500 : 0;
    const freshness = Math.max(0, 48 - (Date.now() - t.lastSeenAt.getTime()) / 3600_000) * 10;
    const recommendScore = tierWeight + Math.max(0, velocityScore) + t.heatScore + freshness;

    await prisma.topic.update({
      where: { id: t.id },
      data: { velocityScore, tier, recommendScore },
    });

    // Alert for burst
    if (tier === 'burst') {
      await createAlert(t.id, null, 'velocity_breakout', 'critical', `🚀 爆发话题: "${t.title}" (热度${t.heatIndex.toFixed(0)} 增速${velocityScore.toFixed(0)})`);
    } else if (tier === 'rising') {
      await createAlert(t.id, null, 'rising_topic', 'info', `📈 潜力话题: "${t.title}" (热度${t.heatIndex.toFixed(0)} 增速${velocityScore.toFixed(0)})`);
    }
  }
}

// ── Master Pipeline ──

const BATCH_SIZE = 12; // smaller batches: DeepSeek generates long JSON — 25-title batches hang

// Should this topic get a verify (marketing/rumor detection) call?
// Only topics that can make a tier (hot/burst via heat ≥ 80, or rising via
// predicted velocity ≥ threshold) are worth verifying — low-heat slow topics skip it.
function needsVerify(t: { heatIndex: number; heatScore: number | null; growthRate: number | null }): boolean {
  if (t.heatIndex >= HEAT_THRESHOLD) return true;
  const predictedVel = (t.growthRate ?? 0) * Math.sqrt((t.heatScore ?? 0) + 1) / 10;
  return predictedVel >= RISING_THRESHOLD;
}

async function processChunk(
  chunk: Awaited<ReturnType<typeof prisma.topic.findMany>>[number][],
  batchNo: number,
  totalBatches: number,
  sourceMap: Map<number, string>,
): Promise<{ kept: number; discarded: number; retried: number }> {
  const batchStart = Date.now();
  console.log(`[AI Pipeline] Batch ${batchNo}/${totalBatches} start ${new Date().toISOString().slice(11, 19)}...`);
  const relevances = await checkKeywordRelevanceBatch(chunk.map(t => ({
    title: t.title,
    snippet: t.snippet,
    source: sourceMap.get(t.sourceId) ?? null,
  })));

  let kept = 0, discarded = 0, retried = 0;

  // Stage 2: verify only topics that can enter a tier, in one batch AI call
  const keptIdx: number[] = [];
  for (let j = 0; j < chunk.length; j++) {
    const relevance = relevances[j];
    if (relevance === null) {
      retried++; // AI failed for this title — keep for next round, never delete on uncertainty
    } else if (!relevance.relevant) {
      // deleteMany: tolerant of concurrent deletion (P2025) — alerts cascade now
      await prisma.topic.deleteMany({ where: { id: chunk[j].id } });
      discarded++;
    } else {
      keptIdx.push(j);
    }
  }
  const verifyIdx = keptIdx.filter(j => needsVerify(chunk[j]));
  const verifies = verifyIdx.length
    ? await verifyTopicsBatch(verifyIdx.map(j => chunk[j].title))
    : [];
  const verifyMap = new Map(verifyIdx.map((j, k) => [j, verifies[k]]));

  for (const j of keptIdx) {
    const t = chunk[j];
    const relevance = relevances[j]!;
    const verify = verifyMap.get(j) ?? null;

    const aiVerified = verify ? (verify.isVerified ? 1 : 2) : 2;
    const isRumor = verify ? verify.isRumor : null;
    const isActionable = verify ? verify.isActionable : null;

    // tier = hot if heat >= HEAT_THRESHOLD, otherwise null (shown in topics but not dashboard)
    const tier: string | null = t.heatIndex >= HEAT_THRESHOLD ? 'hot' : null;

    await prisma.topic.update({
      where: { id: t.id },
      data: {
        aiVerified,
        isRumor,
        isActionable,
        matchedKeyword: relevance.matchedKeyword,
        matchReason: relevance.reason,
        matchConfidence: relevance.confidence,
        tier,
      },
    });

    kept++;

    // Broadcast
    broadcastNewTopic({
      id: t.id, title: t.title, normalizedTitle: t.normalizedTitle,
      sourceId: t.sourceId, sourceRank: t.sourceRank, url: t.url,
      heatIndex: t.heatIndex, growthRate: t.growthRate,
      velocityScore: t.velocityScore, aiVerified,
      matchReason: relevance.reason, matchConfidence: relevance.confidence,
      isActionable, isRumor, tier, matchedKeyword: relevance.matchedKeyword,
      firstSeenAt: t.firstSeenAt.toISOString(), lastSeenAt: t.lastSeenAt.toISOString(),
      publishedAt: t.publishedAt?.toISOString() ?? null,
      peakHeat: t.peakHeat, mentionCount: t.mentionCount,
      engagement: t.engagement ? JSON.parse(t.engagement) : null,
    });

    // Alert for new hot topic
    if (tier === 'hot' && verify?.isActionable) {
      await createAlert(t.id, null, 'new_hot', 'warning', `🔥 新热点: "${t.title}" — ${relevance.reason ?? '热度上升'}`);
    }
  }

  console.log(`[AI Pipeline] Batch ${batchNo}/${totalBatches} done in ${((Date.now() - batchStart) / 1000).toFixed(1)}s (kept ${kept}, discarded ${discarded}, retried ${retried})`);
  return { kept, discarded, retried };
}

export async function runAiPipeline(onProgress?: (progress: number) => void): Promise<{ kept: number; discarded: number }> {
  console.log('[AI Pipeline] Starting keyword-driven pipeline...');

  // Get topics from last 2 hours without tier classification
  const rawTopics = await prisma.topic.findMany({
    where: {
      tier: null,
      lastSeenAt: { gte: new Date(Date.now() - 2 * 3600_000) },
    },
    take: 500,
  });

  if (!rawTopics.length) {
    console.log('[AI Pipeline] No new topics');
    onProgress?.(100);
    return { kept: 0, discarded: 0 };
  }

  const sources = await prisma.source.findMany({ select: { id: true, name: true } });
  const sourceMap = new Map(sources.map(s => [s.id, s.name]));
  let kept = 0, discarded = 0, retried = 0;

  // Stage 1+2: keyword relevance (GATE) with verify, processed 2 batches concurrently.
  // Concurrency halves the AI latency wall-clock; batches are independent.
  const totalBatches = Math.ceil(rawTopics.length / BATCH_SIZE);
  for (let i = 0; i < rawTopics.length; i += BATCH_SIZE * 2) {
    const batchNo = i / BATCH_SIZE + 1;
    const chunkA = rawTopics.slice(i, i + BATCH_SIZE);
    const chunkB = rawTopics.slice(i + BATCH_SIZE, i + BATCH_SIZE * 2);
    const [resA, resB] = await Promise.all([
      processChunk(chunkA, batchNo, totalBatches, sourceMap),
      chunkB.length ? processChunk(chunkB, batchNo + 1, totalBatches, sourceMap) : Promise.resolve({ kept: 0, discarded: 0, retried: 0 }),
    ]);
    kept += resA.kept + resB.kept;
    discarded += resA.discarded + resB.discarded;
    retried += resA.retried + resB.retried;
    const processed = Math.min(i + BATCH_SIZE * 2, rawTopics.length);
    onProgress?.(Math.round((processed / rawTopics.length) * 100));
  }

  console.log('[AI Pipeline] Batch relevance done, classifying tiers...');
  // Stage 3: Classify tiers (velocity-based refinement)
  await classifyTiers();

  console.log(`[AI Pipeline] Done: kept ${kept}, discarded ${discarded}, retried ${retried}`);
  return { kept, discarded };
}

// ── Helpers ──

async function createAlert(topicId: number, keywordId: number | null, type: string, severity: string, message: string) {
  const exists = await prisma.alert.findFirst({
    where: { topicId, alertType: type, createdAt: { gte: new Date(Date.now() - 30 * 60000) } },
  });
  if (exists) return;

  const alert = await prisma.alert.create({
    data: { topicId, keywordId, alertType: type, severity, message },
    include: { topic: { select: { title: true } }, keyword: { select: { keyword: true } } },
  });

  broadcastAlert({
    id: alert.id, topicId: alert.topicId, keywordId: alert.keywordId,
    alertType: alert.alertType, severity: alert.severity, message: alert.message,
    isRead: alert.isRead, createdAt: alert.createdAt.toISOString(), topicTitle: alert.topic?.title,
  });
}
