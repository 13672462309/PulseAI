import { Router, Request, Response } from 'express';
import prisma from '../db.js';

export const alertsRouter = Router();

// GET /api/v1/alerts
alertsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const unread = req.query.unread === 'true';
    const page = parseInt((req.query.page as string) || '1');
    const limit = parseInt((req.query.limit as string) || '50');
    const skip = (page - 1) * limit;

    const where: any = {};
    if (unread) where.isRead = false;

    const [alerts, total] = await Promise.all([
      prisma.alert.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          topic: { select: { title: true } },
          keyword: { select: { keyword: true } },
        },
      }),
      prisma.alert.count({ where }),
    ]);

    res.json({ data: alerts, total, page, limit });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
});

// POST /api/v1/alerts/:id/read
alertsRouter.post('/:id/read', async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id));
    const alert = await prisma.alert.update({
      where: { id },
      data: { isRead: true },
    });
    res.json(alert);
  } catch (err: any) {
    if (err?.code === 'P2025') {
      return res.status(404).json({ error: 'Alert not found' });
    }
    res.status(500).json({ error: 'Failed to mark alert as read' });
  }
});

// POST /api/v1/alerts/read-all
alertsRouter.post('/read-all', async (_req: Request, res: Response) => {
  try {
    await prisma.alert.updateMany({
      where: { isRead: false },
      data: { isRead: true },
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to mark all as read' });
  }
});
