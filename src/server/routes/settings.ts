import { Router, Request, Response } from 'express';
import prisma from '../db.js';

export const settingsRouter = Router();

// GET /api/v1/settings
settingsRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const settings = await prisma.setting.findMany();
    const result: Record<string, string> = {};
    for (const s of settings) {
      result[s.key] = s.value;
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// PUT /api/v1/settings/:key
settingsRouter.put('/:key', async (req: Request, res: Response) => {
  try {
    const { key } = req.params;
    const { value } = req.body;
    if (value === undefined) {
      return res.status(400).json({ error: 'Value is required' });
    }

    const setting = await prisma.setting.upsert({
      where: { key },
      create: { key, value: String(value) },
      update: { value: String(value) },
    });
    res.json(setting);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update setting' });
  }
});
