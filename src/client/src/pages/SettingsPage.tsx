import { useState, useEffect } from 'react';
import { useApi, apiFetch } from '../hooks/useApi.js';

export function SettingsPage() {
  const { data: settings } = useApi<Record<string, string>>('/api/v1/settings');
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  useEffect(() => { if (settings) setForm(settings); }, [settings]);

  const save = async (key: string) => { setSaving(s => ({ ...s, [key]: true })); await apiFetch(`/api/v1/settings/${key}`, { method: 'PUT', body: JSON.stringify({ value: form[key] }) }); setSaving(s => ({ ...s, [key]: false })); };

  const items = [
    { key: 'crawl_interval_ms', label: '爬取间隔 (ms)', desc: '默认 7200000 = 2 小时。修改后立即生效。' },
    { key: 'retention_days', label: '数据保留天数', desc: '历史数据最长保留天数，超期自动清理。' },
  ];

  return (
    <div className="space-y-4 max-w-xl">
      <div>
        <h1 className="text-2xl font-heading font-extrabold text-text-primary tracking-tight">系统设置</h1>
        <p className="text-text-muted text-sm mt-1">运行时配置，修改后即时生效</p>
      </div>

      {items.map(({ key, label, desc }) => (
        <div key={key} className="card p-5">
          <label className="text-[14px] font-semibold text-text-primary block">{label}</label>
          <p className="text-text-muted text-xs mt-1 mb-3">{desc}</p>
          <div className="flex gap-2.5">
            <input value={form[key] || ''} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} className="bg-surface-elevated border border-border rounded-lg px-3.5 py-2.5 text-[13px] font-mono flex-1 focus:border-brand outline-none text-text-primary" />
            <button onClick={() => save(key)} disabled={saving[key]} className="gradient-brand px-5 py-2.5 text-[#03120A] font-semibold text-[13px] rounded-lg disabled:opacity-40 disabled:pointer-events-none cursor-pointer font-heading">{saving[key] ? '保存中...' : '保存'}</button>
          </div>
        </div>
      ))}

      <div className="card p-5 border-warning/20">
        <h3 className="text-[14px] font-semibold text-warning">环境变量</h3>
        <p className="text-text-muted text-xs mt-1">API Key 等敏感配置请在 <code className="text-text-secondary font-mono">.env</code> 文件中修改，修改后需重启服务生效。</p>
      </div>
    </div>
  );
}
