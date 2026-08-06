import { useState } from 'react';
import { KpiRow } from '../components/KpiRow.js';
import { VelocityGrid } from '../components/VelocityGrid.js';
import { Icon } from '../components/icons.js';
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
      <div className="spotlight rounded-2xl bg-surface-card/60 border border-brand/20 p-6 md:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">
            <span className="text-text-primary">实时热点</span>
            <span className="text-gradient"> 监控雷达</span>
          </h1>
          <p className="text-text-secondary text-sm mt-2 max-w-md leading-relaxed">
            AI 驱动的关键词热点追踪 · 多源交叉验证 · 增速监控 · 抢先一步发现趋势
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-4">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-mono px-2.5 py-1 rounded-full bg-brand-soft text-brand border border-brand/20">
              <span className="w-1.5 h-1.5 rounded-full bg-brand status-pulse" /> LIVE
            </span>
            <span className="inline-flex items-center gap-1.5 text-[10px] font-mono px-2.5 py-1 rounded-full bg-white/[0.04] text-text-muted border border-border">
              7 天活跃窗口
            </span>
            <span className="inline-flex items-center gap-1.5 text-[10px] font-mono px-2.5 py-1 rounded-full bg-white/[0.04] text-text-muted border border-border">
              8 数据源
            </span>
          </div>
        </div>
        <button
          onClick={crawl}
          disabled={crawling}
          className="gradient-brand shrink-0 inline-flex items-center gap-2 px-6 py-3 text-[#03120A] font-bold text-sm rounded-xl disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
        >
          {crawling ? (
            <><span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" /> 扫描中...</>
          ) : (
            <><Icon name="zap" className="w-4 h-4" /> 立即扫描</>
          )}
        </button>
      </div>
      {msg && <div className="card border-positive/20 bg-positive/5 px-4 py-3 text-sm text-positive font-medium">{msg}</div>}

      <KpiRow />
      <VelocityGrid />
    </div>
  );
}
