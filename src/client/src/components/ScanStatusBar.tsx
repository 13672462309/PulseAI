import { useEffect, useRef, useState } from 'react';
import type { CrawlStatus } from '@shared/types.js';
import { useSocket } from '../hooks/useSocket.js';
import { Icon } from './icons.js';

export function ScanStatusBar() {
  const { onCrawlStatus } = useSocket();
  const [status, setStatus] = useState<CrawlStatus | null>(null);
  const [finished, setFinished] = useState(false);
  const prevRunning = useRef(false);

  // Real-time progress pushed by the backend.
  useEffect(() => onCrawlStatus(setStatus), [onCrawlStatus]);

  // Polling fallback (covers page load before the socket connects).
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch('/api/v1/crawl/status');
        if (!res.ok) return;
        const s = await res.json();
        if (!cancelled) setStatus(s);
      } catch {
        // offline / server starting — keep last known state
      }
    };
    load();
    const timer = setInterval(load, 5000);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);

  // Briefly show a completion banner right after a scan finishes.
  useEffect(() => {
    if (!status) return;
    if (status.running) {
      prevRunning.current = true;
      setFinished(false);
      return;
    }
    if (prevRunning.current && status.progress >= 100) {
      prevRunning.current = false;
      setFinished(true);
      const t = setTimeout(() => setFinished(false), 8000);
      return () => clearTimeout(t);
    }
  }, [status]);

  if (!status) return null;

  const running = status.running;
  const justFinished =
    !running &&
    status.progress >= 100 &&
    status.updatedAt != null &&
    Date.now() - new Date(status.updatedAt).getTime() < 30_000;
  if (!running && !finished && !justFinished) return null;

  const pct = Math.max(0, Math.min(100, Math.round(status.progress)));

  return (
    <div className="glass px-6 py-2.5 flex items-center gap-3 flex-shrink-0 z-20 border-b border-border">
      {running ? (
        <>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-mono text-brand whitespace-nowrap">
            <span className="w-1.5 h-1.5 rounded-full bg-brand status-pulse" /> 扫描进行中
          </span>
          <div className="flex-1 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-brand to-brand-cyan transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-[11px] font-mono text-text-muted tabular-nums w-11 text-right">{pct}%</span>
          <span className="hidden sm:inline text-[11px] font-mono text-text-muted">
            {status.phase === 'ai' ? 'AI 分析中' : status.currentSource ? `正在采集：${status.currentSource}` : '准备中'}
          </span>
          <span className="hidden md:inline text-[11px] font-mono text-text-muted">
            已发现 {status.topicsFound} 条
          </span>
        </>
      ) : (
        <>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-mono text-positive whitespace-nowrap">
            <Icon name="check-circle" className="w-3.5 h-3.5" /> 扫描完成
          </span>
          <span className="text-[11px] font-mono text-text-muted">本轮采集 {status.topicsFound} 条</span>
        </>
      )}
    </div>
  );
}
