import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import type { TopicSummary, AlertSummary, CrawlStatus, ChatMessage, ChatStreamEvent } from '../shared/types.js';
import { runAgentChat, sanitizeHistory } from './agent/chat.js';

let io: Server;
// Per-socket pending chat controller, so a disconnect aborts the AI call.
const pendingChats = new Map<string, { controller: AbortController }>();

export function initSocket(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: {
      origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
      methods: ['GET', 'POST'],
    },
  });

  io.on('connection', (socket: Socket) => {
    console.log(`[Socket.io] Client connected: ${socket.id}`);

    socket.on('subscribe:category', (category: string) => {
      socket.join(`category:${category}`);
      console.log(`[Socket.io] ${socket.id} subscribed to category:${category}`);
    });

    socket.on('subscribe:keyword', (keywordId: number) => {
      socket.join(`keyword:${keywordId}`);
      console.log(`[Socket.io] ${socket.id} subscribed to keyword:${keywordId}`);
    });

    socket.on('unsubscribe:category', (category: string) => {
      socket.leave(`category:${category}`);
    });

    socket.on('unsubscribe:keyword', (keywordId: number) => {
      socket.leave(`keyword:${keywordId}`);
    });

    socket.on('chat_request', async (payload: { requestId?: string; message?: string; history?: ChatMessage[] }) => {
      const requestId = typeof payload?.requestId === 'string' ? payload.requestId : null;
      const message = typeof payload?.message === 'string' ? payload.message.trim() : '';
      const emit = (event: ChatStreamEvent) => {
        if (requestId) socket.emit('chat_event', { requestId, event });
      };

      if (!requestId) return;
      if (!message) {
        emit({ type: 'error', message: '消息不能为空' });
        return;
      }
      if (message.length > 2000) {
        emit({ type: 'error', message: '消息过长（最多 2000 字）' });
        return;
      }
      // A new question always supersedes a stale in-flight one (client gives up
      // on timeout/stop/disconnect, so a live request here means the previous
      // answer is no longer wanted). Abort it and start fresh.
      const existing = pendingChats.get(socket.id);
      if (existing) {
        console.log('[Socket Chat] replacing in-flight request with a new question');
        existing.controller.abort();
      }

      const entry = { controller: new AbortController() };
      pendingChats.set(socket.id, entry);
      try {
        await runAgentChat({
          message,
          history: sanitizeHistory(payload?.history),
          signal: entry.controller.signal,
          emit,
        });
      } catch (err: any) {
        const cancelled = err?.message === '请求已取消' && entry.controller.signal.aborted;
        if (!cancelled) {
          console.warn(`[Socket Chat] error: ${err?.message ?? String(err)}`);
          emit({ type: 'error', message: err?.message ?? '问答失败，请重试' });
        }
      } finally {
        if (pendingChats.get(socket.id) === entry) pendingChats.delete(socket.id);
      }
    });

    socket.on('chat_cancel', (payload: { requestId?: string }) => {
      const entry = pendingChats.get(socket.id);
      if (entry) {
        console.log(`[Socket Chat] cancelled by client (${payload?.requestId ?? ''})`);
        entry.controller.abort();
        if (pendingChats.get(socket.id) === entry) pendingChats.delete(socket.id);
      }
    });

    socket.on('disconnect', (reason) => {
      console.log(`[Socket.io] Client disconnected: ${socket.id} (${reason})`);
      pendingChats.get(socket.id)?.controller.abort();
      pendingChats.delete(socket.id);
    });
  });

  return io;
}

export function broadcastNewTopic(topic: TopicSummary): void {
  if (!io) return;
  io.emit('new_topic', topic);
  if (topic.tier) {
    io.to(`tier:${topic.tier}`).emit('new_topic', topic);
  }
  if (topic.matchedKeyword) {
    io.to(`category:${topic.matchedKeyword}`).emit('new_topic', topic);
  }
}

export function broadcastAlert(alert: AlertSummary): void {
  if (!io) return;
  io.emit('alert', alert);
  if (alert.keywordId) {
    io.to(`keyword:${alert.keywordId}`).emit('alert', alert);
  }
}

export function broadcastSourceStatus(sourceId: number, status: string): void {
  if (!io) return;
  io.emit('source_status', { sourceId, status });
}

export function broadcastCrawlStatus(status: CrawlStatus): void {
  if (!io) return;
  io.emit('crawl_status', status);
}

export { io };
