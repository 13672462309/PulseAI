import { Router, Request, Response } from 'express';
import prisma from '../db.js';

export const sourcesRouter = Router();

// GET /api/v1/sources
sourcesRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const yesterday = new Date(Date.now() - 24 * 3600_000);

    const sources = await prisma.source.findMany({
      orderBy: { id: 'asc' },
      include: {
        crawlLogs: {
          where: { createdAt: { gte: yesterday }, status: 'success' },
          orderBy: { createdAt: 'desc' },
          select: { topicsFound: true, createdAt: true },
        },
      },
    });

    const result = sources.map((s) => ({
      id: s.id,
      slug: s.slug,
      name: s.name,
      url: s.url,
      accessType: s.accessType,
      isActive: s.isActive,
      status: s.status,
      lastFetchedAt: s.lastFetchedAt,
      topicsFound24h: s.crawlLogs.reduce((sum, l) => sum + l.topicsFound, 0),
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch sources' });
  }
});
