import { useEffect, useRef, useState } from 'react';
import type { ChatMessage, ChatStreamEvent } from '@shared/types.js';
import { useSocket } from '../hooks/useSocket.js';
import { Icon } from './icons.js';

const SUGGESTIONS = [
  '今天有什么值得关注？',
  '最近增速最快的话题',
  '光模块近期有什么热点？',
  '华为产业链有什么动态？',
  '有没有疑似谣言的话题？',
];

const STORAGE_KEY = 'pulseai.chat.messages.v1';
// Client-side safety net. Must be LONGER than the server's overall deadline
// (AI_CHAT_DEADLINE_MS, default 300s) so the server can finish and send its
// own result/timeout first. This is not a "generation is impossible" limit —
// it only guards against a completely silent connection.
// Override via .env: VITE_AI_CHAT_CLIENT_TIMEOUT_MS=360000
const CLIENT_TIMEOUT_MS = Number(import.meta.env.VITE_AI_CHAT_CLIENT_TIMEOUT_MS) || 320_000;

function loadStoredMessages(): ChatMessage[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      : [];
  } catch {
    return [];
  }
}

export function ChatPanel() {
  const { socket } = useSocket();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(loadStoredMessages);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [toolLogs, setToolLogs] = useState<string[]>([]);
  const [answer, setAnswer] = useState('');

  const sendingRef = useRef(false);
  const answerRef = useRef('');
  const messagesRef = useRef<ChatMessage[]>(loadStoredMessages());
  const activeCleanupRef = useRef<(() => void) | null>(null);
  const activeRequestIdRef = useRef<string | null>(null);
  const retryRef = useRef(false);
  const pendingTextRef = useRef('');
  const scrollRef = useRef<HTMLDivElement | null>(null);

  console.log('[ChatPanel] mounted, restored messages:', messagesRef.current.length);

  /** Commit messages to state AND sessionStorage synchronously (no effect race). */
  const commitMessages = (next: ChatMessage[]) => {
    messagesRef.current = next;
    setMessages(next);
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // storage unavailable — keep in memory only
    }
  };

  const cleanup = () => {
    console.log('[ChatPanel] cleanup');
    sendingRef.current = false;
    activeCleanupRef.current?.();
    activeCleanupRef.current = null;
    activeRequestIdRef.current = null;
    setSending(false);
    setStatusText(null);
    setToolLogs([]);
    answerRef.current = '';
    setAnswer('');
  };

  const interrupt = (message: string) => {
    const partial = answerRef.current;
    cleanup();
    commitMessages([
      ...messagesRef.current,
      { role: 'assistant', content: partial.trim() ? `${partial.trim()}\n\n${message}` : message },
    ]);
  };

  const stop = () => {
    if (!sendingRef.current) return;
    const partial = answerRef.current;
    const requestId = activeRequestIdRef.current;
    socket.emit('chat_cancel', { requestId });
    cleanup();
    if (partial.trim()) {
      commitMessages([
        ...messagesRef.current,
        { role: 'assistant', content: `${partial.trim()}\n\n（已停止）` },
      ]);
    }
  };

  // Socket-level handlers: keep them stable for the lifetime of the panel.
  const disconnectHandlerRef = useRef<() => void>(() => {});
  const connectHandlerRef = useRef<() => void>(() => {});
  disconnectHandlerRef.current = () => {
    console.log('[ChatPanel] socket disconnected');
    if (!sendingRef.current) return;
    if (!retryRef.current) {
      retryRef.current = true;
      const partial = answerRef.current;
      cleanup();
      // Keep the already-generated part visible while we wait to retry.
      if (partial.trim()) setAnswer(partial);
      setStatusText('连接断开，重连后自动重试…');
    } else {
      retryRef.current = false;
      pendingTextRef.current = '';
      interrupt('⚠️ 连接中断（WebSocket 断开），请重试');
    }
  };
  connectHandlerRef.current = () => {
    console.log('[ChatPanel] socket connected');
    if (retryRef.current && pendingTextRef.current) {
      const text = pendingTextRef.current;
      retryRef.current = false;
      pendingTextRef.current = '';
      setTimeout(() => send(text, true), 200);
    }
  };

  useEffect(() => {
    const onDisconnect = () => disconnectHandlerRef.current();
    const onConnect = () => connectHandlerRef.current();
    socket.on('disconnect', onDisconnect);
    socket.on('connect', onConnect);
    socket.on('connect_error', onDisconnect);
    return () => {
      socket.off('disconnect', onDisconnect);
      socket.off('connect', onConnect);
      socket.off('connect_error', onDisconnect);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, statusText, toolLogs, sending, answer]);

  const send = async (raw?: string, retry = false) => {
    const text = (raw ?? input).trim();
    if (!text || sendingRef.current) return;

    const history = retry
      ? messagesRef.current.slice(-10)
      : [...messagesRef.current, { role: 'user' as const, content: text }].slice(-10);
    if (!retry) commitMessages(history);

    pendingTextRef.current = text;
    setInput('');
    setStatusText('正在连接…');
    setToolLogs([]);
    answerRef.current = '';
    setAnswer('');
    sendingRef.current = true;
    setSending(true);

    if (!socket.connected) {
      socket.connect();
      try {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('WebSocket 连接超时')), 5000);
          socket.once('connect', () => {
            clearTimeout(timer);
            resolve();
          });
        });
      } catch (err: any) {
        interrupt(`⚠️ ${err.message}`);
        return;
      }
    }

    const requestId = crypto.randomUUID();
    activeRequestIdRef.current = requestId;
    console.log('[ChatPanel] send', requestId, text.slice(0, 40));

    const finish = () => {
      pendingTextRef.current = '';
      cleanup();
    };

    const applyEvent = (event: ChatStreamEvent) => {
      switch (event.type) {
        case 'status':
          console.log('[ChatPanel] event status:', event.text);
          setStatusText(event.text);
          break;
        case 'tool_start':
          setToolLogs((prev) => [...prev, `调用 ${event.name}`]);
          break;
        case 'tool_end':
          setToolLogs((prev) => [...prev, `✓ ${event.name} · ${event.summary}`]);
          break;
        case 'delta':
          answerRef.current += event.text;
          setAnswer(answerRef.current);
          setStatusText(null);
          break;
        case 'done':
          console.log('[ChatPanel] event done, answer length:', answerRef.current.length);
          if (answerRef.current.trim()) {
            commitMessages([
              ...messagesRef.current,
              { role: 'assistant', content: answerRef.current },
            ]);
          }
          finish();
          break;
        case 'error':
          console.log('[ChatPanel] event error:', event.message);
          commitMessages([
            ...messagesRef.current,
            { role: 'assistant', content: `⚠️ ${event.message}` },
          ]);
          finish();
          break;
      }
    };

    const onEvent = (payload: { requestId: string; event: ChatStreamEvent }) => {
      if (payload.requestId !== requestId) return;
      applyEvent(payload.event);
    };
    socket.on('chat_event', onEvent);
    activeCleanupRef.current = () => socket.off('chat_event', onEvent);
    socket.emit('chat_request', { requestId, message: text, history });

    // Watchdog: if the server never answers, cancel it and fail gracefully.
    setTimeout(() => {
      if (sendingRef.current && activeCleanupRef.current) {
        const requestId = activeRequestIdRef.current;
        if (requestId) socket.emit('chat_cancel', { requestId });
        interrupt(`⚠️ AI 响应超时（${Math.round(CLIENT_TIMEOUT_MS / 1000)}s），请重试`);
      }
    }, CLIENT_TIMEOUT_MS);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed right-4 bottom-24 md:bottom-6 z-40 w-14 h-14 rounded-2xl gradient-brand text-[#03120A] flex items-center justify-center shadow-lg shadow-brand/20 hover:scale-105 transition-transform cursor-pointer"
        title="投资问答 Copilot"
      >
        <Icon name="message-circle" className="w-6 h-6" />
      </button>
    );
  }

  return (
    <div className="fixed right-4 bottom-24 md:bottom-6 z-40 w-[min(92vw,380px)] h-[min(560px,calc(100vh-8rem))] flex flex-col card overflow-hidden shadow-2xl shadow-black/40">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface-card/80 backdrop-blur">
        <div className="flex items-center gap-2.5">
          <span className="w-8 h-8 rounded-lg gradient-brand flex items-center justify-center text-[#03120A]">
            <Icon name="message-circle" className="w-4 h-4" />
          </span>
          <div>
            <p className="text-[13px] font-heading font-bold text-text-primary leading-none">投资问答 Copilot</p>
            <p className="text-[10px] text-text-muted font-mono mt-1">基于当前监控数据 · AI 生成仅供参考</p>
          </div>
        </div>
        <button onClick={() => setOpen(false)} className="text-text-muted hover:text-text-primary transition-colors cursor-pointer">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        <div className="space-y-2">
          {messages.length === 0 && !sending && (
            <p className="text-[12px] text-text-muted leading-relaxed">
              问我任何关于当前监控的问题，比如热点、增速、关键词、谣言风险等。我会查询数据库后回答。
            </p>
          )}
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                disabled={sending}
                className="text-[11px] px-2.5 py-1.5 rounded-lg bg-surface-card border border-border text-text-muted hover:border-brand/40 hover:text-brand transition-colors disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {messages.map((m, i) => (
          <div key={i} className={`max-w-[90%] text-[12px] leading-relaxed whitespace-pre-wrap break-words rounded-xl px-3 py-2 ${m.role === 'user' ? 'ml-auto bg-brand-soft text-brand border border-brand/20' : 'bg-surface-card text-text-secondary border border-border'}`}>
            {m.content}
          </div>
        ))}

        {sending && (
          <div className="space-y-1.5">
            {answer && (
              <div className="max-w-[90%] text-[12px] leading-relaxed whitespace-pre-wrap break-words rounded-xl px-3 py-2 bg-surface-card text-text-secondary border border-border">
                {answer}
                <span className="inline-block w-1.5 h-3.5 bg-brand align-middle ml-0.5 animate-pulse" />
              </div>
            )}
            {(statusText || toolLogs.length > 0) && (
              <div className="space-y-1">
                {statusText && <p className="text-[11px] text-brand font-mono">{statusText}</p>}
                {toolLogs.map((t, i) => (
                  <p key={i} className="text-[10px] text-text-muted font-mono">{t}</p>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-border p-3 bg-surface-card/60">
        <div className="flex items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            disabled={sending}
            placeholder={sending ? 'AI 正在回答…' : '问点什么…'}
            className="flex-1 min-w-0 bg-surface-elevated border border-border rounded-lg px-3 py-2.5 text-[12px] font-mono text-text-primary placeholder:text-text-muted focus:border-brand outline-none disabled:opacity-50"
          />
          {sending ? (
            <button
              onClick={stop}
              className="h-9 px-2.5 rounded-lg border border-danger/40 text-danger text-[11px] font-mono hover:bg-danger/10 transition-colors cursor-pointer"
              title="停止生成"
            >
              停止
            </button>
          ) : (
            <button
              onClick={() => send()}
              disabled={!input.trim()}
              className="w-9 h-9 rounded-lg gradient-brand text-[#03120A] flex items-center justify-center disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
            >
              <Icon name="send" className="w-4 h-4" />
            </button>
          )}
        </div>
        <button
          onClick={() => {
            commitMessages([]);
            setInput('');
            try {
              sessionStorage.removeItem(STORAGE_KEY);
            } catch {
              // ignore
            }
          }}
          className="mt-2 text-[10px] text-text-muted hover:text-danger transition-colors font-mono cursor-pointer"
        >
          清空对话
        </button>
      </div>
    </div>
  );
}
