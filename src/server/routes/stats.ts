import { Router, Request, Response } from 'express';
import prisma from '../db.js';

export const statsRouter = Router();

// 指挥中心统一使用"近 7 天仍在采集到"作为活跃口径，
// 与实时话题网格、话题浏览页的级别定义保持一致。
const ACTIVE_WINDOW_MS = 7 * 24 * 3600_000;

// GET /api/v1/stats
statsRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      activeTopics,
      velocityBreakouts,
      alertsToday,
      sources,
    ] = await Promise.all([
      prisma.topic.count({
        where: { lastSeenAt: { gte: new Date(Date.now() - ACTIVE_WINDOW_MS) } },
      }),
      prisma.topic.count({
        where: {
          velocityScore: { gte: 30 },
          lastSeenAt: { gte: new Date(Date.now() - ACTIVE_WINDOW_MS) },
        },
      }),
      prisma.alert.count({
        where: { createdAt: { gte: today } },
      }),
      prisma.source.findMany({ select: { status: true } }),
    ]);

    const sourcesOnline = sources.filter((s) => s.status === 'ok').length;

    res.json({
      activeTopics,
      velocityBreakouts,
      alertsToday,
      sourcesOnline,
      sourcesTotal: sources.length,
      burstCount: await prisma.topic.count({ where: { tier: 'burst', lastSeenAt: { gte: new Date(Date.now() - ACTIVE_WINDOW_MS) } } }),
      hotCount: await prisma.topic.count({ where: { tier: 'hot', lastSeenAt: { gte: new Date(Date.now() - ACTIVE_WINDOW_MS) } } }),
      risingCount: await prisma.topic.count({ where: { tier: 'rising', lastSeenAt: { gte: new Date(Date.now() - ACTIVE_WINDOW_MS) } } }),
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// GET /api/v1/stats/velocity
statsRouter.get('/velocity', async (_req: Request, res: Response) => {
  try {
    const topics = await prisma.topic.findMany({
      where: {
        tier: { not: null },
        lastSeenAt: { gte: new Date(Date.now() - 24 * 3600_000) },
      },
      orderBy: { velocityScore: 'desc' },
      take: 20,
      select: {
        id: true,
        title: true,
        velocityScore: true,
        heatIndex: true,
        growthRate: true,
        aiCategory: true,
        tier: true,
        source: { select: { name: true } },
      },
    });
    res.json(topics);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch velocity stats' });
  }
});
