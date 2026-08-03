import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import type { TopicSummary, AlertSummary } from '@shared/types.js';

const SOCKET_URL = '/'; // Vite proxy handles routing to backend

let socketInstance: Socket | null = null;

function getSocket(): Socket {
  if (!socketInstance) {
    socketInstance = io(SOCKET_URL, {
      autoConnect: false,
      transports: ['websocket', 'polling'],
    });
  }
  return socketInstance;
}

export function useSocket() {
  const socketRef = useRef<Socket>(getSocket());

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket.connected) {
      socket.connect();
    }

    socket.on('connect', () => {
      console.log('[Socket.io] Connected:', socket.id);
    });

    socket.on('disconnect', (reason) => {
      console.log('[Socket.io] Disconnected:', reason);
    });

    socket.on('connect_error', (err) => {
      console.error('[Socket.io] Connection error:', err.message);
    });

    return () => {
      // Don't disconnect on unmount — keep connection alive across navigations
    };
  }, []);

  const subscribeCategory = useCallback((category: string) => {
    socketRef.current.emit('subscribe:category', category);
  }, []);

  const unsubscribeCategory = useCallback((category: string) => {
    socketRef.current.emit('unsubscribe:category', category);
  }, []);

  const subscribeKeyword = useCallback((keywordId: number) => {
    socketRef.current.emit('subscribe:keyword', keywordId);
  }, []);

  const unsubscribeKeyword = useCallback((keywordId: number) => {
    socketRef.current.emit('unsubscribe:keyword', keywordId);
  }, []);

  const onNewTopic = useCallback((handler: (topic: TopicSummary) => void) => {
    socketRef.current.on('new_topic', handler);
    return () => socketRef.current.off('new_topic', handler);
  }, []);

  const onAlert = useCallback((handler: (alert: AlertSummary) => void) => {
    socketRef.current.on('alert', handler);
    return () => socketRef.current.off('alert', handler);
  }, []);

  const onSourceStatus = useCallback((handler: (data: { sourceId: number; status: string }) => void) => {
    socketRef.current.on('source_status', handler);
    return () => socketRef.current.off('source_status', handler);
  }, []);

  return {
    socket: socketRef.current,
    subscribeCategory,
    unsubscribeCategory,
    subscribeKeyword,
    unsubscribeKeyword,
    onNewTopic,
    onAlert,
    onSourceStatus,
  };
}
