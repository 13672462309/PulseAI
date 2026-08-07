import { Router, Request, Response } from 'express';
import prisma from '../db.js';
import { getSearchQueries, getIntentContext, getZhExpansionQueries } from '../crawlers/keyword-queries.js';

export const keywordsRouter = Router();

// GET /api/v1/keywords
keywordsRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const keywords = await prisma.keyword.findMany({
      where: { deletedAt: null },
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

    const name = keyword.trim();
    const existing = await prisma.keyword.findUnique({ where: { keyword: name } });

    // Re-adding a soft-deleted keyword restores it and unhides its topics.
    if (existing?.deletedAt) {
      const restored = await prisma.keyword.update({
        where: { id: existing.id },
        data: {
          deletedAt: null,
          isActive: true,
          category: category || existing.category,
          growthThreshold: growthThreshold || existing.growthThreshold,
        },
      });
      await prisma.topic.updateMany({
        where: { matchedKeyword: name },
        data: { isHidden: false },
      });
      getSearchQueries(restored.keyword).catch(() => {});
      getIntentContext(restored.keyword).catch(() => {});
      getZhExpansionQueries(restored.keyword).catch(() => {});
      return res.status(200).json(restored);
    }

    if (existing) {
      return res.status(409).json({ error: 'Keyword already exists' });
    }

    const created = await prisma.keyword.create({
      data: {
        keyword: name,
        category: category || 'custom',
        growthThreshold: growthThreshold || 0.15,
      },
    });

    // Pre-warm English search queries (builtin map = free; LLM fallback for unmapped keywords)
    getSearchQueries(created.keyword).catch(() => {});
    // Pre-warm intent context + Chinese expansion queries
    getIntentContext(created.keyword).catch(() => {});
    getZhExpansionQueries(created.keyword).catch(() => {});

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
    const id = parseInt(String(req.params.id));
    const { keyword, category, growthThreshold } = req.body;

    const existing = await prisma.keyword.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Keyword not found' });

    const renamed = keyword?.trim() && keyword.trim() !== existing.keyword;
    const updated = await prisma.keyword.update({
      where: { id },
      data: {
        ...(keyword && { keyword: keyword.trim() }),
        ...(category !== undefined && { category }),
        ...(growthThreshold !== undefined && { growthThreshold }),
        // Renaming invalidates cached search queries/intent/expansions — regenerate
        ...(renamed ? { searchQueries: null, intentContext: null, zhExpansionQueries: null } : {}),
      },
    });

    if (renamed) {
      getSearchQueries(updated.keyword).catch(() => {});
      getIntentContext(updated.keyword).catch(() => {});
      getZhExpansionQueries(updated.keyword).catch(() => {});
    }

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
    const id = parseInt(String(req.params.id));
    const keyword = await prisma.keyword.findUnique({ where: { id } });
    if (!keyword || keyword.deletedAt) return res.status(404).json({ error: 'Keyword not found' });

    // Soft delete: stop monitoring, hide its topics, and allow re-adding the
    // same name later (which restores the keyword and unhides the topics).
    await prisma.$transaction([
      prisma.keyword.update({
        where: { id },
        data: { isActive: false, deletedAt: new Date() },
      }),
      prisma.topic.updateMany({
        where: { matchedKeyword: keyword.keyword },
        data: { isHidden: true },
      }),
    ]);
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
    const id = parseInt(String(req.params.id));
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
