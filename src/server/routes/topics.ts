import { Router, Request, Response } from 'express';
import prisma from '../db.js';

export const topicsRouter = Router();

// Whitelist of sortable fields — arbitrary field injection into Prisma orderBy
// would 500 on unknown columns, so only these are accepted.
const SORT_FIELDS = new Set([
  'recommendScore', // 综合推荐
  'heatScore',      // 热度值
  'velocityScore',  // 增速分
  'growthRate',     // 增长率
  'heatIndex',      // 热力值
  'firstSeenAt',    // 首次发现时间
  'lastSeenAt',     // 最近一次被抓取时间（最新发现）
  'publishedAt',    // 原始发布时间（最新发布）
  'mentionCount',   // 提及次数
  'peakHeat',       // 峰值热力
  'title',
]);

// GET /api/v1/topics
topicsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const {
      keyword, keywords, source, sources, category, verified,
      sort = 'recommendScore', order = 'desc',
      since, page = '1', limit = '30'
    } = req.query;

    const where: any = {
      matchedKeyword: { not: null }, // 只展示 AI 确认与关键词相关的话题
    };

    if (verified !== undefined) {
      where.aiVerified = parseInt(verified as string);
    }
    if (category) {
      where.aiCategory = category as string;
    }
    if (source) {
      const sourceId = parseInt(source as string);
      if (!Number.isNaN(sourceId)) where.sourceId = sourceId;
    }
    if (sources) {
      const ids = String(sources).split(',').map(s => parseInt(s.trim())).filter(n => !Number.isNaN(n));
      if (ids.length) where.sourceId = { in: ids };
    }
    if (req.query.tier) {
      where.tier = req.query.tier as string;
    }
    if (keyword) {
      where.OR = [
        { title: { contains: keyword as string } },
        { aiSummary: { contains: keyword as string } },
      ];
    }
    if (keywords) {
      const kwList = String(keywords).split(',').map(k => k.trim()).filter(Boolean);
      if (kwList.length) where.matchedKeyword = { in: kwList };
    }
    if (since) {
      // 发现时间范围：按首次被系统发现的时间过滤
      where.firstSeenAt = { gte: new Date(since as string) };
    }

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const safePage = Number.isNaN(pageNum) || pageNum < 1 ? 1 : pageNum;
    const safeLimit = Number.isNaN(limitNum) || limitNum < 1 ? 30 : Math.min(limitNum, 200);
    const skip = (safePage - 1) * safeLimit;

    const sortField = SORT_FIELDS.has(sort as string) ? (sort as string) : 'recommendScore';
    const sortOrder = order === 'asc' ? 'asc' : 'desc';
    // Array orderBy: primary field + tie-breakers. SQLite sorts NULLs first in ASC
    // and last in DESC, so unknown publish times naturally sink in "最新发布".
    const orderBy: any[] = [{ [sortField]: sortOrder }];
    if (sortField === 'recommendScore') orderBy.push({ heatScore: 'desc' }, { firstSeenAt: 'desc' });
    if (sortField === 'publishedAt') orderBy.push({ firstSeenAt: 'desc' });
    orderBy.push({ id: 'desc' });

    const [topics, total] = await Promise.all([
      prisma.topic.findMany({
        where,
        orderBy,
        skip,
        take: safeLimit,
        include: { source: { select: { name: true, slug: true } } },
      }),
      prisma.topic.count({ where }),
    ]);

    res.json({ data: topics, total, page: safePage, limit: safeLimit });
  } catch (err) {
    console.error('Failed to fetch topics:', err);
    res.status(500).json({ error: 'Failed to fetch topics' });
  }
});

// GET /api/v1/topics/filter-options
// Dynamic filter options: every keyword that has topics (plus active keywords with 0)
// and every data source with topic counts.
topicsRouter.get('/filter-options', async (_req: Request, res: Response) => {
  try {
    const [kwGroups, sources, activeKeywords] = await Promise.all([
      prisma.topic.groupBy({
        by: ['matchedKeyword'],
        where: { matchedKeyword: { not: null } },
        _count: { _all: true },
      }),
      prisma.source.findMany({
        orderBy: { id: 'asc' },
        include: {
          _count: {
            select: { topics: { where: { matchedKeyword: { not: null } } } },
          },
        },
      }),
      prisma.keyword.findMany({ orderBy: { id: 'asc' }, select: { keyword: true } }),
    ]);

    const countMap = new Map<string, number>();
    for (const g of kwGroups) {
      if (g.matchedKeyword) countMap.set(g.matchedKeyword, g._count._all);
    }
    // 每新增一个关键词都会出现在这里（即使还没有话题，计数为 0）
    for (const kw of activeKeywords) {
      if (!countMap.has(kw.keyword)) countMap.set(kw.keyword, 0);
    }

    const keywords = [...countMap.entries()]
      .map(([value, count]) => ({ value, label: value, count }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));

    const sourceOptions = sources.map((s) => ({
      id: s.id,
      name: s.name,
      slug: s.slug,
      count: s._count.topics,
    }));

    res.json({ keywords, sources: sourceOptions });
  } catch (err) {
    console.error('Failed to fetch topic filter options:', err);
    res.status(500).json({ error: 'Failed to fetch filter options' });
  }
});

// GET /api/v1/topics/trending (must be before /:id)
topicsRouter.get('/trending', async (req: Request, res: Response) => {
  try {
    const limit = parseInt((req.query.limit as string) || '20');
    const topics = await prisma.topic.findMany({
      where: {
        tier: { not: null },
        aiVerified: 1,
        lastSeenAt: { gte: new Date(Date.now() - 7 * 24 * 3600_000) },
        velocityScore: { not: null },
      },
      orderBy: { velocityScore: 'desc' },
      take: limit,
      include: { source: { select: { name: true, slug: true } } },
    });
    res.json(topics);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch trending topics' });
  }
});

// GET /api/v1/topics/hot (must be before /:id)
topicsRouter.get('/hot', async (req: Request, res: Response) => {
  try {
    const limit = parseInt((req.query.limit as string) || '20');
    const topics = await prisma.topic.findMany({
      where: {
        tier: { not: null },
        lastSeenAt: { gte: new Date(Date.now() - 7 * 24 * 3600_000) },
      },
      orderBy: { heatScore: { sort: 'desc', nulls: 'last' } },
      take: limit,
      include: { source: { select: { name: true, slug: true } } },
    });
    res.json(topics);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch hot topics' });
  }
});

// GET /api/v1/topics/:id
topicsRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id));
    const topic = await prisma.topic.findUnique({
      where: { id },
      include: {
        source: { select: { name: true, slug: true } },
        history: { orderBy: { recordedAt: 'desc' }, take: 200 },
      },
    });
    if (!topic) return res.status(404).json({ error: 'Topic not found' });
    res.json(topic);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch topic' });
  }
});

// GET /api/v1/topics/:id/history
topicsRouter.get('/:id/history', async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id));
    const range = req.query.range as string || '24h';

    const rangeMs: Record<string, number> = {
      '1h': 3600_000,
      '6h': 6 * 3600_000,
      '24h': 24 * 3600_000,
      '7d': 7 * 24 * 3600_000,
    };
    const since = new Date(Date.now() - (rangeMs[range] || rangeMs['24h']));

    const history = await prisma.topicHistory.findMany({
      where: { topicId: id, recordedAt: { gte: since } },
      orderBy: { recordedAt: 'asc' },
    });
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch topic history' });
  }
});
