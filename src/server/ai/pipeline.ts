import prisma from '../db.js';
import { aiChat, MODELS } from './client.js';
import { broadcastAlert, broadcastNewTopic } from '../socket.js';

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
}

export async function checkKeywordRelevance(title: string): Promise<RelevanceResult> {
  const [result] = await checkKeywordRelevanceBatch([title]);
  return result ?? { relevant: false, matchedKeyword: null, confidence: 0 };
}

/**
 * Batch keyword relevance check — one AI call per ~25 titles instead of one per title.
 * Returns null for titles whose AI call failed (caller must NOT delete those — they
 * get retried next round rather than being dropped on a transient AI error).
 */
export async function checkKeywordRelevanceBatch(titles: string[]): Promise<Array<RelevanceResult | null>> {
  if (!titles.length) return [];

  const keywords = await prisma.keyword.findMany({ where: { isActive: true } });
  if (!keywords.length) return titles.map(() => ({ relevant: false, matchedKeyword: null, confidence: 0 }));

  const kwList = keywords.map(k => k.keyword);

  // Fast path: exact string match
  const results: Array<RelevanceResult | null> = titles.map((title) => {
    for (const kw of kwList) {
      if (title.includes(kw)) {
        return { relevant: true, matchedKeyword: kw, confidence: 1.0 };
      }
    }
    return null; // no exact match — needs AI judgement
  });

  const aiNeeded = titles.map((t, i) => ({ title: t, idx: i })).filter((_, i) => results[i] === null);
  if (!aiNeeded.length) return results;

  const prompt = `你是一个关键词匹配引擎。逐条判断以下内容标题是否与指定关键词语义相关。

关键词列表: ${kwList.join(', ')}

规则：
- 语义相关即可（不需要出现原词，例如关键词"半导体"应匹配"台积电3nm量产"）
- 完全不相关才判定为不匹配
- 逐条对应输入顺序返回

内容标题列表:
${aiNeeded.map(({ idx, title }) => `[${idx}] "${title}"`).join('\n')}

返回 JSON：
{"results": [{"index": 0, "relevant": true/false, "matchedKeyword": "匹配到的关键词或null", "confidence": 0.0-1.0}]}`;

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
                },
                required: ['index', 'relevant', 'matchedKeyword', 'confidence'],
              },
            },
          },
          required: ['results'],
        },
      },
      maxTokens: 2048,
    }) as { results?: Array<{ index: number; relevant: boolean; matchedKeyword: string | null; confidence: number }> };

    const byIndex = new Map((result?.results || []).map((r) => [r.index, r]));
    for (const { idx } of aiNeeded) {
      const r = byIndex.get(idx);
      if (r) {
        results[idx] = { relevant: r.relevant, matchedKeyword: r.matchedKeyword || null, confidence: r.confidence ?? 0 };
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
  classification: string;
  confidence: number;
  isActionable: boolean;
}

export async function verifyTopic(title: string): Promise<VerifyResult | null> {
  const [result] = await verifyTopicsBatch([title]);
  return result;
}

/**
 * Batch content verification — one AI call per batch instead of one per title.
 * Slimmed down: only classification (marketing/rumor detection) + isActionable are kept;
 * summary/category were dropped to shorten responses (faster per-batch latency).
 */
export async function verifyTopicsBatch(titles: string[]): Promise<Array<VerifyResult | null>> {
  if (!titles.length) return [];

  const prompt = `你是热点内容审核员。逐条分析以下话题并分类，按输入顺序返回。

规则（逐条）:
分类: verified_real(真实) | marketing_spam(营销) | rumor_unverified(谣言) | entertainment(娱乐) | evergreen_noise(低价值)
isActionable: 该内容是否值得采取行动（如引发市场关注/可投资参考）

话题列表:
${titles.map((t, i) => `[${i}] "${t}"`).join('\n')}

返回 JSON: {"results": [{"index": 0, "classification":"verified_real", "confidence":0.92, "isActionable":true}]}`;

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
                  classification: { type: 'string', enum: ['verified_real','marketing_spam','rumor_unverified','entertainment','evergreen_noise'] },
                  confidence: { type: 'number' },
                  isActionable: { type: 'boolean' },
                },
                required: ['index','classification','confidence','isActionable'],
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
        results[r.index] = { classification: r.classification, confidence: r.confidence, isActionable: r.isActionable };
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
  const topics = await prisma.topic.findMany({
    where: {
      matchedKeyword: { not: null },
      lastSeenAt: { gte: new Date(Date.now() - 24 * 3600_000) },
    },
    include: { history: { orderBy: { recordedAt: 'desc' }, take: 10 } },
  });

  for (const t of topics) {
    // Count unique sources
    const sourceCount = await prisma.topic.count({
      where: { normalizedTitle: t.normalizedTitle, lastSeenAt: { gte: new Date(Date.now() - 24 * 3600_000) } },
    });

    // Velocity from heatScore observations (growthRate = % change vs first observation)
    const growthRate = t.growthRate;
    if (growthRate == null || t.heatScore == null) {
      // No baseline yet — write a visible 0 so the card still shows a number
      if (t.velocityScore !== 0) {
        await prisma.topic.update({ where: { id: t.id }, data: { velocityScore: 0 } });
      }
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

    await prisma.topic.update({
      where: { id: t.id },
      data: { velocityScore, tier },
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

export async function runAiPipeline(): Promise<{ kept: number; discarded: number }> {
  console.log('[AI Pipeline] Starting keyword-driven pipeline...');

  // Get topics from last 2 hours without tier classification
  const rawTopics = await prisma.topic.findMany({
    where: {
      tier: null,
      lastSeenAt: { gte: new Date(Date.now() - 2 * 3600_000) },
    },
    take: 500,
  });

  if (!rawTopics.length) { console.log('[AI Pipeline] No new topics'); return { kept: 0, discarded: 0 }; }

  let kept = 0, discarded = 0, retried = 0;

  // Stage 1: Batch keyword relevance (GATE) — one AI call per BATCH_SIZE titles
  const totalBatches = Math.ceil(rawTopics.length / BATCH_SIZE);
  for (let i = 0; i < rawTopics.length; i += BATCH_SIZE) {
    const batchNo = i / BATCH_SIZE + 1;
    const batchStart = Date.now();
    console.log(`[AI Pipeline] Batch ${batchNo}/${totalBatches} start ${new Date().toISOString().slice(11, 19)}...`);
    const chunk = rawTopics.slice(i, i + BATCH_SIZE);
    const relevances = await checkKeywordRelevanceBatch(chunk.map(t => t.title));

    // Stage 2: verify only the relevant ones, in one batch AI call
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
    const verifies = keptIdx.length
      ? await verifyTopicsBatch(keptIdx.map(j => chunk[j].title))
      : [];

    for (let k = 0; k < keptIdx.length; k++) {
      const j = keptIdx[k];
      const t = chunk[j];
      const relevance = relevances[j]!;
      const verify = verifies[k];

      const aiVerified = verify?.classification === 'verified_real' ? 1 : 2;
      const category = relevance.matchedKeyword || '综合';
      const summary = relevance.matchedKeyword
        ? `${relevance.matchedKeyword}相关话题，热度 ${t.heatIndex.toFixed(0)}`
        : null;

      // tier = hot if heat >= HEAT_THRESHOLD, otherwise null (shown in topics but not dashboard)
      const tier: string | null = t.heatIndex >= HEAT_THRESHOLD ? 'hot' : null;

      await prisma.topic.update({
        where: { id: t.id },
        data: {
          aiVerified,
          aiSummary: summary,
          aiCategory: category,
          matchedKeyword: relevance.matchedKeyword,
          tier,
        },
      });

      kept++;

      // Broadcast
      broadcastNewTopic({
        id: t.id, title: t.title, normalizedTitle: t.normalizedTitle,
        sourceId: t.sourceId, sourceRank: t.sourceRank, url: t.url,
        heatIndex: t.heatIndex, rawHeat: t.rawHeat, growthRate: t.growthRate,
        velocityScore: t.velocityScore, aiVerified, aiSummary: summary,
        aiCategory: category, tier, matchedKeyword: relevance.matchedKeyword,
        firstSeenAt: t.firstSeenAt.toISOString(), lastSeenAt: t.lastSeenAt.toISOString(),
        peakHeat: t.peakHeat, mentionCount: t.mentionCount,
      });

      // Alert for new hot topic
      if (tier === 'hot' && verify?.isActionable) {
        await createAlert(t.id, null, 'new_hot', 'warning', `🔥 新热点: "${t.title}" — ${verify.summary}`);
      }
    }

    console.log(`[AI Pipeline] Batch ${batchNo}/${totalBatches} done in ${((Date.now() - batchStart) / 1000).toFixed(1)}s (kept ${kept}, discarded ${discarded}, retried ${retried})`);
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

