import { Router, Request, Response } from 'express';
import prisma from '../db.js';
import type { AgentSearchResult, TopicSummary } from '../../shared/types.js';
import { parseEngagementJson } from './topics.js';
import { runAgentChat, writeSse, sanitizeHistory } from '../agent/chat.js';

export const agentRouter = Router();

// POST /api/v1/agent/chat — Copilot Q&A (SSE stream with tool calls)
agentRouter.post('/chat', async (req: Request, res: Response) => {
  let controller: AbortController | null = null;
  const startedAt = Date.now();
  try {
    const { message, history } = req.body ?? {};
    if (typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'message is required' });
    }
    if (message.length > 2000) {
      return res.status(400).json({ error: 'message too long (max 2000 chars)' });
    }

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    controller = new AbortController();
    const chatSignal = controller.signal;
    // NOTE: use res 'close' (client disconnect), NOT req 'close' — in Node the
    // request stream closes once the POST body is consumed, which would abort
    // the AI call immediately after it starts.
    res.on('close', () => {
      console.log(`[Chat] response closed after ${Date.now() - startedAt}ms (writableEnded=${res.writableEnded})`);
      controller?.abort();
    });

    await runAgentChat({
      message: message.trim(),
      history: sanitizeHistory(history),
      signal: chatSignal,
      emit: (event) => writeSse(res, event),
    });
    res.end();
  } catch (err: any) {
    console.warn(`[Chat] error after ${Date.now() - startedAt}ms: ${err?.message ?? String(err)}`);
    // Only stay silent when the client connection is really gone.
    const clientGone = req.destroyed || res.destroyed;
    if (clientGone) {
      if (!res.writableEnded) res.end();
      return;
    }
    if (!res.headersSent) {
      return res.status(500).json({ error: err?.message ?? 'Chat failed' });
    }
    try {
      writeSse(res, { type: 'error', message: err?.message ?? 'Chat failed' });
    } catch {
      // socket already gone — nothing more we can do
    }
    res.end();
  }
});

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

    const visibleKeywords = await prisma.keyword.findMany({ where: { deletedAt: null }, select: { keyword: true } });
    const topics = await prisma.topic.findMany({
      where: {
        OR: [
          { title: { contains: query.trim() } },
          { matchedKeyword: { contains: query.trim() } },
        ],
        aiVerified: 1,
        isHidden: false,
        matchedKeyword: { in: visibleKeywords.map(k => k.keyword) },
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
        growthRate: t.growthRate,
        velocityScore: t.velocityScore,
        aiVerified: t.aiVerified,
        isRumor: t.isRumor,
        isActionable: t.isActionable,
        tier: t.tier,
        matchedKeyword: t.matchedKeyword,
        matchReason: t.matchReason,
        matchConfidence: t.matchConfidence,
        engagement: parseEngagementJson(t.engagement),
        firstSeenAt: t.firstSeenAt.toISOString(),
        lastSeenAt: t.lastSeenAt.toISOString(),
        publishedAt: t.publishedAt?.toISOString() ?? null,
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

    const visibleKeywords = await prisma.keyword.findMany({ where: { deletedAt: null }, select: { keyword: true } });
    const where: any = {
      aiVerified: 1,
      velocityScore: { not: null },
      isHidden: false,
      matchedKeyword: { in: visibleKeywords.map(k => k.keyword) },
      lastSeenAt: { gte: new Date(Date.now() - 24 * 3600_000) },
    };
    if (category) where.matchedKeyword = category;

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
      const kw = String(req.body?.keyword || '').trim();
      return res.json({
        success: false,
        message: `Already monitoring "${kw}"`,
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
