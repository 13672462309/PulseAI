import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface HP { heatIndex: number; growthRate: number | null; recordedAt: string; }

export function TopicDetailChart({ history }: { history: HP[] }) {
  if (!history.length) return <div className="card p-8 text-center text-text-muted text-sm">暂无历史数据</div>;

  const data = history.map(h => ({ time: new Date(h.recordedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }), heat: h.heatIndex }));

  return (
    <div className="card p-5">
      <h3 className="text-sm font-heading font-semibold text-text-primary mb-4">热度趋势</h3>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={{ top: 4, right: 16, left: -4, bottom: 4 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.05)" strokeDasharray="3 3" />
          <XAxis dataKey="time" stroke="#64748B" fontSize={10} tickLine={false} axisLine={false} />
          <YAxis stroke="#64748B" fontSize={10} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', color: '#F1F5F9', fontSize: '12px', fontFamily: 'JetBrains Mono, monospace' }} />
          <Line type="monotone" dataKey="heat" stroke="#22C55E" strokeWidth={2.5} dot={false} activeDot={{ r: 5, fill: '#22C55E', stroke: '#111827', strokeWidth: 2 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
