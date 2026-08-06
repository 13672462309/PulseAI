import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface HP { heatIndex: number; heatScore: number | null; growthRate: number | null; recordedAt: string; }

export function TopicDetailChart({ history }: { history: HP[] }) {
  if (!history.length) return <div className="card p-8 text-center text-text-muted text-sm">暂无历史数据</div>;

  // 热度趋势使用热度值（heatScore）；旧数据无 heatScore 时回退热力值
  const data = history.map(h => ({
    time: new Date(h.recordedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
    heat: h.heatScore ?? h.heatIndex,
  }));

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-heading font-semibold text-text-primary">热度趋势</h3>
        <span className="text-[10px] font-mono text-text-muted">热度值 heatScore</span>
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={data} margin={{ top: 4, right: 16, left: -4, bottom: 4 }}>
          <defs>
            <linearGradient id="heatGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#22C55E" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#22C55E" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(255,255,255,0.05)" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="time" stroke="#64748B" fontSize={10} tickLine={false} axisLine={false} />
          <YAxis stroke="#64748B" fontSize={10} tickLine={false} axisLine={false} />
          <Tooltip
            cursor={{ stroke: 'rgba(34,211,238,0.35)', strokeDasharray: '4 4' }}
            contentStyle={{
              backgroundColor: 'rgba(17,24,39,0.92)',
              border: '1px solid rgba(255,255,255,0.10)',
              borderRadius: '12px',
              color: '#F1F5F9',
              fontSize: '12px',
              fontFamily: 'JetBrains Mono, monospace',
              boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
            }}
            labelStyle={{ color: '#8494A8', marginBottom: 4 }}
            itemStyle={{ color: '#22C55E' }}
          />
          <Area type="monotone" dataKey="heat" stroke="#22C55E" strokeWidth={2.5} fill="url(#heatGradient)" dot={false} activeDot={{ r: 5, fill: '#22C55E', stroke: '#0B0F19', strokeWidth: 2 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
