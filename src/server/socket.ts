import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import type { TopicSummary, AlertSummary } from '../shared/types.js';

let io: Server;

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

    socket.on('disconnect', (reason) => {
      console.log(`[Socket.io] Client disconnected: ${socket.id} (${reason})`);
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
  if (topic.aiCategory) {
    io.to(`category:${topic.aiCategory}`).emit('new_topic', topic);
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

export { io };
