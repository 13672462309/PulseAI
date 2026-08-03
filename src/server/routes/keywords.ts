import { Router, Request, Response } from 'express';
import prisma from '../db.js';

export const keywordsRouter = Router();

// GET /api/v1/keywords
keywordsRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const keywords = await prisma.keyword.findMany({
      orderBy: { createdAt: 'desc' },
    });
    res.json(keywords);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch keywords' });
  }
});

// POST /api/v1/keywords
keywordsRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { keyword, category, growthThreshold } = req.body;
    if (!keyword?.trim()) {
      return res.status(400).json({ error: 'Keyword is required' });
    }

    const created = await prisma.keyword.create({
      data: {
        keyword: keyword.trim(),
        category: category || 'custom',
        growthThreshold: growthThreshold || 0.15,
      },
    });
    res.status(201).json(created);
  } catch (err: any) {
    if (err?.code === 'P2002') {
      return res.status(409).json({ error: 'Keyword already exists' });
    }
    res.status(500).json({ error: 'Failed to create keyword' });
  }
});

// PUT /api/v1/keywords/:id
keywordsRouter.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const { keyword, category, growthThreshold } = req.body;

    const updated = await prisma.keyword.update({
      where: { id },
      data: {
        ...(keyword && { keyword: keyword.trim() }),
        ...(category !== undefined && { category }),
        ...(growthThreshold !== undefined && { growthThreshold }),
      },
    });
    res.json(updated);
  } catch (err: any) {
    if (err?.code === 'P2025') {
      return res.status(404).json({ error: 'Keyword not found' });
    }
    res.status(500).json({ error: 'Failed to update keyword' });
  }
});

// DELETE /api/v1/keywords/:id
keywordsRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    await prisma.keyword.delete({ where: { id } });
    res.status(204).send();
  } catch (err: any) {
    if (err?.code === 'P2025') {
      return res.status(404).json({ error: 'Keyword not found' });
    }
    res.status(500).json({ error: 'Failed to delete keyword' });
  }
});

// POST /api/v1/keywords/:id/pause
keywordsRouter.post('/:id/pause', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const keyword = await prisma.keyword.findUnique({ where: { id } });
    if (!keyword) return res.status(404).json({ error: 'Keyword not found' });

    const updated = await prisma.keyword.update({
      where: { id },
      data: { isActive: !keyword.isActive },
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to toggle keyword' });
  }
});
