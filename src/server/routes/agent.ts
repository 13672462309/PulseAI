import { Router, Request, Response } from 'express';
import prisma from '../db.js';
import type { AgentSearchResult, TopicSummary } from '../../shared/types.js';

export const agentRouter = Router();

// GET /api/v1/agent/search
agentRouter.get('/search', async (req: Request, res: Response) => {
  try {
    const query = req.query.query as string;
    const sort = (req.query.sort as string) || 'velocity';
    const limit = parseInt((req.query.limit as string) || '10');

    if (!query?.trim()) {
      return res.status(400).json({ error: 'Query is required' });
    }

    const sortBy: any =
      sort === 'heat' ? { heatIndex: 'desc' } :
      sort === 'newest' ? { firstSeenAt: 'desc' } :
      { velocityScore: 'desc' };

    const topics = await prisma.topic.findMany({
      where: {
        OR: [
          { title: { contains: query.trim() } },
          { aiSummary: { contains: query.trim() } },
          { aiCategory: query.trim() },
        ],
        aiVerified: 1,
        lastSeenAt: { gte: new Date(Date.now() - 24 * 3600_000) },
      },
      orderBy: sortBy,
      take: limit,
      include: { source: { select: { name: true, slug: true } } },
    });

    const result: AgentSearchResult = {
      topics: topics.map(t => ({
        id: t.id,
        title: t.title,
        normalizedTitle: t.normalizedTitle,
        sourceId: t.sourceId,
        sourceName: t.source?.name,
        sourceRank: t.sourceRank,
        url: t.url,
        heatIndex: t.heatIndex,
        rawHeat: t.rawHeat,
        growthRate: t.growthRate,
        velocityScore: t.velocityScore,
        aiVerified: t.aiVerified,
        aiSummary: t.aiSummary,
        aiCategory: t.aiCategory,
        firstSeenAt: t.firstSeenAt.toISOString(),
        lastSeenAt: t.lastSeenAt.toISOString(),
        peakHeat: t.peakHeat,
        mentionCount: t.mentionCount,
      })),
      query: query.trim(),
      total: topics.length,
    };

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Search failed' });
  }
});

// GET /api/v1/agent/trending
agentRouter.get('/trending', async (req: Request, res: Response) => {
  try {
    const category = req.query.category as string;
    const limit = parseInt((req.query.limit as string) || '20');

    const where: any = {
      aiVerified: 1,
      velocityScore: { not: null },
      lastSeenAt: { gte: new Date(Date.now() - 24 * 3600_000) },
    };
    if (category) where.aiCategory = category;

    const topics = await prisma.topic.findMany({
      where,
      orderBy: { velocityScore: 'desc' },
      take: limit,
      include: { source: { select: { name: true } } },
    });

    res.json({ topics, total: topics.length });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch trending' });
  }
});

// POST /api/v1/agent/monitor
agentRouter.post('/monitor', async (req: Request, res: Response) => {
  try {
    const { keyword, category } = req.body;
    if (!keyword?.trim()) {
      return res.status(400).json({ error: 'Keyword is required' });
    }

    const created = await prisma.keyword.create({
      data: {
        keyword: keyword.trim(),
        category: category || 'custom',
      },
    });
    res.status(201).json({
      success: true,
      keyword: created,
      message: `Now monitoring "${keyword.trim()}"`,
    });
  } catch (err: any) {
    if (err?.code === 'P2002') {
      return res.json({
        success: false,
        message: `Already monitoring "${keyword.trim()}"`,
      });
    }
    res.status(500).json({ error: 'Failed to add keyword' });
  }
});

// GET /api/v1/agent/status
agentRouter.get('/status', async (_req: Request, res: Response) => {
  try {
    const now = Date.now();
    const [activeKeywords, sources, recentAlerts] = await Promise.all([
      prisma.keyword.count({ where: { isActive: true } }),
      prisma.source.findMany({ select: { slug: true, status: true, lastFetchedAt: true } }),
      prisma.alert.count({
        where: { createdAt: { gte: new Date(now - 3600_000) } },
      }),
    ]);

    const onlineSources = sources.filter(s => s.status === 'ok');
    const degradedSources = sources.filter(s => s.status !== 'ok');

    res.json({
      status: 'active',
      monitoring: { activeKeywords, totalSources: sources.length },
      sources: {
        online: onlineSources.length,
        degraded: degradedSources.length,
        list: sources.map(s => ({
          name: s.slug,
          status: s.status,
          lastFetch: s.lastFetchedAt?.toISOString() || null,
        })),
      },
      recentAlerts,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch status' });
  }
});
