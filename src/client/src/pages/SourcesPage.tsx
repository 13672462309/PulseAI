import { useApi } from '../hooks/useApi.js';
import type { SourceSummary } from '@shared/types.js';

export function SourcesPage() {
  const { data } = useApi<SourceSummary[]>('/api/v1/sources');
  const sources = data || [];
  const online = sources.filter(s => s.status === 'ok').length;
  const rel = (d: string | null) => { if (!d) return '从未'; const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000); if (m < 1) return '刚刚'; if (m < 60) return `${m}min`; return `${Math.floor(m / 60)}h`; };
  const dot = (s: string) => s === 'ok' ? 'bg-positive' : s === 'degraded' ? 'bg-warning' : 'bg-danger';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-extrabold text-text-primary tracking-tight">数据源管理</h1>
          <p className="text-text-muted text-sm mt-1">{online}/{sources.length} 个数据源在线</p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {sources.map(s => (
          <div key={s.id} className="card p-4">
            <div className="flex items-center gap-2.5 mb-3">
              <span className={`w-2 h-2 rounded-full ${dot(s.status)} ${s.status === 'ok' ? 'status-pulse' : ''}`} />
              <span className="text-[14px] font-medium text-text-primary truncate">{s.name}</span>
            </div>
            <div className="text-[11px] text-text-muted space-y-1 font-mono">
              <div className="flex justify-between"><span>类型</span><span className="text-text-secondary">{s.accessType}</span></div>
              <div className="flex justify-between"><span>最后抓取</span><span className="text-text-secondary">{rel(s.lastFetchedAt)}</span></div>
              {s.topicsFound24h !== undefined && <div className="flex justify-between"><span>24h 发现</span><span className="text-positive font-semibold">{s.topicsFound24h}</span></div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
