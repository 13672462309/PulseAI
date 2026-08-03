import { Router, Request, Response } from 'express';
import prisma from '../db.js';

export const topicsRouter = Router();

// GET /api/v1/topics
topicsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const {
      keyword, source, category, verified,
      sort = 'velocityScore', order = 'desc',
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
      where.sourceId = parseInt(source as string);
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
    if (since) {
      where.lastSeenAt = { gte: new Date(since as string) };
    }

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    const orderBy: any = {};
    const sortField = sort as string;
    orderBy[sortField] = order === 'asc' ? 'asc' : 'desc';

    const [topics, total] = await Promise.all([
      prisma.topic.findMany({
        where,
        orderBy,
        skip,
        take: limitNum,
        include: { source: { select: { name: true, slug: true } } },
      }),
      prisma.topic.count({ where }),
    ]);

    res.json({ data: topics, total, page: pageNum, limit: limitNum });
  } catch (err) {
    console.error('Failed to fetch topics:', err);
    res.status(500).json({ error: 'Failed to fetch topics' });
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
        lastSeenAt: { gte: new Date(Date.now() - 24 * 3600_000) },
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
        lastSeenAt: { gte: new Date(Date.now() - 24 * 3600_000) },
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
    const id = parseInt(req.params.id);
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
    const id = parseInt(req.params.id);
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
