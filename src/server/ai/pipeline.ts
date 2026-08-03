import prisma from '../db.js';
import { aiChat, MODELS } from './client.js';
import { broadcastAlert, broadcastNewTopic } from '../socket.js';

// ── Config ──
const VELOCITY_THRESHOLD = 8; // velocity_score threshold for "rising"
const HEAT_THRESHOLD = 50;     // heatIndex threshold for "hot"

// ── Stage 1: Keyword Relevance Check (THE GATE) ──

interface RelevanceResult {
  relevant: boolean;
  matchedKeyword: string | null;
  confidence: number;
}

export async function checkKeywordRelevance(title: string): Promise<RelevanceResult> {
  const keywords = await prisma.keyword.findMany({ where: { isActive: true } });
  if (!keywords.length) return { relevant: false, matchedKeyword: null, confidence: 0 };

  const kwList = keywords.map(k => k.keyword);

  // Fast path: exact string match
  for (const kw of kwList) {
    if (title.includes(kw)) {
      return { relevant: true, matchedKeyword: kw, confidence: 1.0 };
    }
  }

  // AI semantic match
  const prompt = `你是一个关键词匹配引擎。判断以下内容标题是否与指定关键词语义相关。

关键词列表: ${kwList.join(', ')}

内容标题: "${title}"

规则：
- 语义相关即可（不需要出现原词，例如关键词"半导体"应匹配"台积电3nm量产"）
- 完全不相关才判定为不匹配

返回 JSON：
{
  "relevant": true/false,
  "matchedKeyword": "匹配到的关键词（选最匹配的一个）或null",
  "confidence": 0.0-1.0
}`;

  try {
    const result = await aiChat({
      model: MODELS.fast,
      prompt,
      jsonSchema: {
        name: 'RelevanceCheck',
        schema: {
          type: 'object',
          properties: {
            relevant: { type: 'boolean' },
            matchedKeyword: { type: 'string', nullable: true },
            confidence: { type: 'number' },
          },
          required: ['relevant', 'matchedKeyword', 'confidence'],
        },
      },
      maxTokens: 256,
    }) as RelevanceResult;

    return result;
  } catch (err) {
    console.error('[AI] Relevance check error:', err);
    return { relevant: false, matchedKeyword: null, confidence: 0 };
  }
}

// ── Stage 2: Content Verification ──

interface VerifyResult {
  classification: string;
  confidence: number;
  summary: string;
  category: string;
  isActionable: boolean;
}

export async function verifyTopic(title: string): Promise<VerifyResult | null> {
  const prompt = `你是热点内容审核员。分析话题并分类。

标题: "${title}"

分类: verified_real(真实) | marketing_spam(营销) | rumor_unverified(谣言) | entertainment(娱乐) | evergreen_noise(低价值)
类别: 科技 | 财经 | 娱乐 | 社会 | 体育 | 国际 | 教育 | 健康

返回 JSON: {"classification":"verified_real","confidence":0.92,"summary":"一句话中文摘要","category":"科技","isActionable":true}`;

  try {
    return await aiChat({
      model: MODELS.fast,
      prompt,
      jsonSchema: {
        name: 'Verify',
        schema: {
          type: 'object',
          properties: {
            classification: { type: 'string', enum: ['verified_real','marketing_spam','rumor_unverified','entertainment','evergreen_noise'] },
            confidence: { type: 'number' },
            summary: { type: 'string' },
            category: { type: 'string', enum: ['科技','财经','娱乐','社会','体育','国际','教育','健康'] },
            isActionable: { type: 'boolean' },
          },
          required: ['classification','confidence','summary','category','isActionable'],
        },
      },
      maxTokens: 512,
    }) as VerifyResult;
  } catch { return null; }
}

// ── Stage 3: Velocity + Tier Classification ──

export async function classifyTiers(): Promise<void> {
  const topics = await prisma.topic.findMany({
    where: {
      tier: { not: null },
      lastSeenAt: { gte: new Date(Date.now() - 24 * 3600_000) },
    },
    include: { history: { orderBy: { recordedAt: 'desc' }, take: 10 } },
  });

  for (const t of topics) {
    // Count unique sources
    const sourceCount = await prisma.topic.count({
      where: { normalizedTitle: t.normalizedTitle, lastSeenAt: { gte: new Date(Date.now() - 24 * 3600_000) } },
    });

    // Only calculate velocity from actual growth data — no synthetic initial rate
    const growthRate = t.growthRate;
    if (growthRate == null) {
      // No history yet, skip velocity — topic stays at its current tier
      continue;
    }
    const sourceDiv = 1 + sourceCount * 0.2;
    const velocityScore = growthRate * Math.log(t.heatIndex + 1) * sourceDiv * 100;

    // Refine tier based on heat + velocity (only for topics that already have tier)
    let tier = t.tier; // keep existing tier (null for low-heat)
    if (tier) {
      if (t.heatIndex >= HEAT_THRESHOLD && velocityScore >= VELOCITY_THRESHOLD) {
        tier = 'burst';
      } else if (velocityScore >= VELOCITY_THRESHOLD) {
        tier = 'rising';
      }
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

export async function runAiPipeline(): Promise<{ kept: number; discarded: number }> {
  console.log('[AI Pipeline] Starting keyword-driven pipeline...');

  // Get topics from last 2 hours without tier classification
  const rawTopics = await prisma.topic.findMany({
    where: {
      tier: null,
      lastSeenAt: { gte: new Date(Date.now() - 2 * 3600_000) },
    },
    take: 100,
  });

  if (!rawTopics.length) { console.log('[AI Pipeline] No new topics'); return { kept: 0, discarded: 0 }; }

  let kept = 0, discarded = 0;

  for (const t of rawTopics) {
    // Stage 1: Keyword relevance (GATE)
    const relevance = await checkKeywordRelevance(t.title);

    if (!relevance.relevant) {
      // Discard — not keyword-relevant
      await prisma.topic.delete({ where: { id: t.id } });
      discarded++;
      await sleep(300);
      continue;
    }

    // Stage 2: Verify content (best effort — non-critical)
    const verify = await verifyTopic(t.title).catch(() => null);
    const aiVerified = verify?.classification === 'verified_real' ? 1 : 2;
    const category = verify?.category || relevance.matchedKeyword || '综合';
    const summary = verify?.summary || (relevance.matchedKeyword
      ? `${relevance.matchedKeyword}相关话题，热度 ${t.heatIndex.toFixed(0)}`
      : null);

    // tier = hot if heat >= 50, otherwise null (shown in topics but not dashboard)
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
      aiCategory: category,
      firstSeenAt: t.firstSeenAt.toISOString(), lastSeenAt: t.lastSeenAt.toISOString(),
      peakHeat: t.peakHeat, mentionCount: t.mentionCount,
    });

    // Alert for new hot topic
    if (tier === 'hot' && verify?.isActionable) {
      await createAlert(t.id, null, 'new_hot', 'warning', `🔥 新热点: "${t.title}" — ${verify.summary}`);
    }

    await sleep(500);
  }

  // Stage 3: Classify tiers (velocity-based refinement)
  await classifyTiers();

  console.log(`[AI Pipeline] Done: kept ${kept}, discarded ${discarded}`);
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

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }
