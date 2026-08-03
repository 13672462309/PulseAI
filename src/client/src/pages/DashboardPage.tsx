import { useState } from 'react';
import { KpiRow } from '../components/KpiRow.js';
import { VelocityGrid } from '../components/VelocityGrid.js';
import { apiFetch } from '../hooks/useApi.js';

export function DashboardPage() {
  const [crawling, setCrawling] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const crawl = async () => {
    setCrawling(true); setMsg(null);
    try {
      const r = await apiFetch<{ topicsFound: number }>('/api/v1/crawl/trigger', { method: 'POST' });
      setMsg(`${r.topicsFound} 条数据已采集，AI 分析中`);
      setTimeout(() => { setMsg(null); window.location.reload(); }, 6000);
    } catch (e: any) { setMsg(`错误: ${e.message}`); }
    finally { setCrawling(false); }
  };

  return (
    <div className="space-y-6">
      {/* Spotlight Hero */}
      <div className="spotlight rounded-2xl bg-surface-card/50 border border-border p-6 md:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">
            <span className="text-text-primary">实时热点</span>
            <span className="text-brand"> 监控雷达</span>
          </h1>
          <p className="text-text-muted text-sm mt-2 max-w-md">
            AI 驱动的关键词热点追踪 · 多源交叉验证 · 增速监控 · 抢先一步发现趋势
          </p>
        </div>
        <button
          onClick={crawl}
          disabled={crawling}
          className="moving-border shrink-0 inline-flex items-center gap-2 px-6 py-3 bg-brand text-black font-bold text-sm rounded-xl hover:brightness-110 disabled:opacity-50 transition-all cursor-pointer"
        >
          {crawling ? (
            <><span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" /> 扫描中...</>
          ) : (
            <>⚡ 立即扫描</>
          )}
        </button>
      </div>
      {msg && <div className="card border-positive/20 bg-positive/5 px-4 py-3 text-sm text-positive font-medium">{msg}</div>}

      <KpiRow />
      <VelocityGrid />
    </div>
  );
}
