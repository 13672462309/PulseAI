import prisma from '../db.js';

// ── Agent Chat Tools ──
// The Copilot exposes these tools to the model. Results are deliberately kept
// compact (truncated JSON) to control token cost inside the agent loop.

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, any>;
  };
}

export interface ToolResult {
  name: string;
  content: string;
  summary: string;
}

const MAX_RESULT_CHARS = 4000;

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'list_keywords',
      description: '列出当前监控的关键词及其话题数量（含已暂停但未删除的关键词）。',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_topics',
      description: '按关键词/级别/时间范围/文本搜索已入库的话题，返回标题、来源、热度、增速、级别等摘要。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '标题/摘要/关键词中的文本，可选' },
          keyword: { type: 'string', description: '精确的关键词名称（如 半导体），可选' },
          tier: { type: 'string', enum: ['burst', 'hot', 'rising'], description: '按级别过滤，可选' },
          sinceHours: { type: 'number', description: '只看最近 N 小时内被发现的话题，可选' },
          limit: { type: 'number', description: '返回条数，默认 5，最大 10' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_topic_detail',
      description: '获取单个话题的详情：热度/增速/级别/谣言/值得关注/匹配理由/互动数据/来源/链接/最近 10 条热度历史。',
      parameters: {
        type: 'object',
        properties: { id: { type: 'number', description: '话题 ID' } },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_stats',
      description: '获取系统整体统计：活跃话题数、爆发/热点/潜力数量、数据源在线数、今日告警数。',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_trending',
      description: '获取近 7 天增速最快的话题排行（潜力/热点/爆发优先）。',
      parameters: {
        type: 'object',
        properties: { limit: { type: 'number', description: '返回条数，默认 10，最大 20' } },
        required: [],
      },
    },
  },
];

async function visibleKeywordNames(): Promise<string[]> {
  const kws = await prisma.keyword.findMany({ where: { deletedAt: null }, select: { keyword: true } });
  return kws.map((k) => k.keyword);
}

function compactTopic(t: any): Record<string, unknown> {
  let engagement = null;
  try {
    engagement = t.engagement ? JSON.parse(t.engagement) : null;
  } catch {
    engagement = null;
  }
  return {
    id: t.id,
    title: t.title,
    source: t.source?.name ?? null,
    sourceRank: t.sourceRank ?? null,
    url: t.url ?? null,
    heatScore: t.heatScore,
    heatIndex: t.heatIndex,
    velocityScore: t.velocityScore,
    growthRate: t.growthRate,
    tier: t.tier,
    matchedKeyword: t.matchedKeyword,
    matchReason: t.matchReason,
    matchConfidence: t.matchConfidence,
    isRumor: t.isRumor,
    isActionable: t.isActionable,
    firstSeenAt: t.firstSeenAt?.toISOString?.() ?? t.firstSeenAt,
    lastSeenAt: t.lastSeenAt?.toISOString?.() ?? t.lastSeenAt,
    publishedAt: t.publishedAt?.toISOString?.() ?? t.publishedAt,
    engagement,
  };
}

async function runListKeywords(): Promise<ToolResult> {
  const kwNames = await visibleKeywordNames();
  const groups = await prisma.topic.groupBy({
    by: ['matchedKeyword'],
    where: { matchedKeyword: { in: kwNames }, isHidden: false },
    _count: { _all: true },
  });
  const counts = new Map(groups.map((g) => [g.matchedKeyword, g._count._all]));
  const keywords = await prisma.keyword.findMany({ where: { deletedAt: null }, orderBy: { createdAt: 'desc' } });
  const rows = keywords.map((k) => ({
    keyword: k.keyword,
    isActive: k.isActive,
    topicCount: counts.get(k.keyword) ?? 0,
    intentContext: k.intentContext ?? null,
  }));
  return {
    name: 'list_keywords',
    content: JSON.stringify({ keywords: rows }).slice(0, MAX_RESULT_CHARS),
    summary: `共 ${rows.length} 个关键词`,
  };
}

async function runSearchTopics(args: any): Promise<ToolResult> {
  const { query, keyword, tier, sinceHours, limit } = args ?? {};
  const kwNames = await visibleKeywordNames();
  const where: any = {
    matchedKeyword: { in: kwNames },
    isHidden: false,
  };
  if (keyword) where.matchedKeyword = String(keyword);
  if (tier) where.tier = String(tier);
  if (sinceHours) {
    const hours = Number(sinceHours);
    if (Number.isFinite(hours) && hours > 0) {
      where.lastSeenAt = { gte: new Date(Date.now() - hours * 3600_000) };
    }
  }
  if (query && String(query).trim()) {
    const q = String(query).trim();
    where.OR = [
      { title: { contains: q } },
      { snippet: { contains: q } },
      { matchedKeyword: { contains: q } },
    ];
  }
  const take = Math.min(Math.max(Number(limit) || 5, 1), 10);
  const [topics, total] = await Promise.all([
    prisma.topic.findMany({
      where,
      orderBy: [{ recommendScore: 'desc' }, { heatScore: 'desc' }],
      take,
      include: { source: { select: { name: true } } },
    }),
    prisma.topic.count({ where }),
  ]);
  return {
    name: 'search_topics',
    content: JSON.stringify({ total, topics: topics.map(compactTopic) }).slice(0, MAX_RESULT_CHARS),
    summary: `共 ${total} 条，展示 ${topics.length} 条`,
  };
}

async function runGetTopicDetail(args: any): Promise<ToolResult> {
  const id = Number(args?.id);
  if (!Number.isFinite(id)) throw new Error('无效的话题 ID');
  const topic = await prisma.topic.findUnique({
    where: { id },
    include: {
      source: { select: { name: true, slug: true } },
      history: { orderBy: { recordedAt: 'desc' }, take: 10 },
    },
  });
  if (!topic) throw new Error(`话题 #${id} 不存在`);
  return {
    name: 'get_topic_detail',
    content: JSON.stringify(compactTopic({ ...topic, history: topic.history.map((h) => ({ heatScore: h.heatScore, heatIndex: h.heatIndex, growthRate: h.growthRate, recordedAt: h.recordedAt })) })).slice(0, MAX_RESULT_CHARS),
    summary: `话题 #${id} 详情`,
  };
}

async function runGetStats(): Promise<ToolResult> {
  const kwNames = await visibleKeywordNames();
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600_000);
  const [activeTopics, burstCount, hotCount, risingCount, sources] = await Promise.all([
    prisma.topic.count({ where: { lastSeenAt: { gte: weekAgo }, isHidden: false } }),
    prisma.topic.count({ where: { tier: 'burst', isHidden: false, matchedKeyword: { in: kwNames }, lastSeenAt: { gte: weekAgo } } }),
    prisma.topic.count({ where: { tier: 'hot', isHidden: false, matchedKeyword: { in: kwNames }, lastSeenAt: { gte: weekAgo } } }),
    prisma.topic.count({ where: { tier: 'rising', isHidden: false, matchedKeyword: { in: kwNames }, lastSeenAt: { gte: weekAgo } } }),
    prisma.source.findMany({ select: { status: true } }),
  ]);
  const stats = {
    activeTopics,
    burstCount,
    hotCount,
    risingCount,
    sourcesOnline: sources.filter((s) => s.status === 'ok').length,
    sourcesTotal: sources.length,
  };
  return {
    name: 'get_stats',
    content: JSON.stringify(stats),
    summary: `活跃 ${activeTopics}，爆发 ${burstCount} / 热点 ${hotCount} / 潜力 ${risingCount}`,
  };
}

async function runGetTrending(args: any): Promise<ToolResult> {
  const take = Math.min(Math.max(Number(args?.limit) || 10, 1), 20);
  const kwNames = await visibleKeywordNames();
  const where = {
    tier: { not: null },
    isHidden: false,
    matchedKeyword: { in: kwNames },
    lastSeenAt: { gte: new Date(Date.now() - 7 * 24 * 3600_000) },
    velocityScore: { not: null },
  };
  const [topics, total] = await Promise.all([
    prisma.topic.findMany({
      where,
      orderBy: { velocityScore: 'desc' },
      take,
      include: { source: { select: { name: true } } },
    }),
    prisma.topic.count({ where }),
  ]);
  return {
    name: 'get_trending',
    content: JSON.stringify({ total, topics: topics.map(compactTopic) }).slice(0, MAX_RESULT_CHARS),
    summary: `增速榜共 ${total} 条，展示 ${topics.length} 条`,
  };
}

export async function executeTool(name: string, argsRaw: string): Promise<ToolResult> {
  let args: any = {};
  if (argsRaw && argsRaw.trim()) {
    try {
      args = JSON.parse(argsRaw);
    } catch {
      throw new Error(`工具参数解析失败: ${argsRaw.slice(0, 100)}`);
    }
  }
  switch (name) {
    case 'list_keywords': return runListKeywords();
    case 'search_topics': return runSearchTopics(args);
    case 'get_topic_detail': return runGetTopicDetail(args);
    case 'get_stats': return runGetStats();
    case 'get_trending': return runGetTrending(args);
    default: throw new Error(`未知工具: ${name}`);
  }
}
