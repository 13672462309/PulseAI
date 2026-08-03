import { useState } from 'react';
import { KpiRow } from '../components/KpiRow.js';
import { VelocityGrid } from '../components/VelocityGrid.js';
import { apiFetch } from '../hooks/useApi.js';

export function DashboardPage() {
  const [crawling, setCrawling] = useState(false);
  const [crawlResult, setCrawlResult] = useState<string | null>(null);

  const handleCrawl = async () => {
    setCrawling(true); setCrawlResult(null);
    try {
      const res = await apiFetch<{ success: boolean; topicsFound: number }>('/api/v1/crawl/trigger', { method: 'POST' });
      setCrawlResult(`采集 ${res.topicsFound} 条，AI 分析中...`);
      setTimeout(() => { setCrawlResult(null); window.location.reload(); }, 5000);
    } catch (e: any) {
      setCrawlResult(`错误: ${e.message}`);
    } finally { setCrawling(false); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-extrabold text-text-primary tracking-tight">指挥中心</h1>
          <p className="text-text-muted text-sm mt-1">关键词驱动 · AI 甄别 · 三级分类</p>
        </div>
        <button
          onClick={handleCrawl}
          disabled={crawling}
          className="flex items-center gap-2 px-5 py-2.5 bg-brand hover:brightness-110 text-white font-semibold text-sm rounded-lg transition-all disabled:opacity-50 font-heading"
        >
          {crawling ? (
            <><span className="animate-spin w-4 h-4 border-2 border-white/30 border-t-white rounded-full" /> 检查中...</>
          ) : '⚡ 立即检查'}
        </button>
      </div>
      {crawlResult && <div className="card bg-positive-soft border-positive/20 p-3 text-sm text-positive font-medium">{crawlResult}</div>}

      <KpiRow />

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-heading font-semibold text-text-primary">话题矩阵</h2>
          <span className="text-[11px] text-text-muted font-mono">🚀爆发 · 🔥热点 · 📈潜力</span>
        </div>
        <VelocityGrid />
      </section>
    </div>
  );
}
