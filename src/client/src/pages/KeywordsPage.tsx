import { useState } from 'react';
import { useApi, apiFetch } from '../hooks/useApi.js';

interface KW { id: number; keyword: string; category: string; isActive: boolean; growthThreshold: number; }

export function KeywordsPage() {
  const { data: kws, refetch } = useApi<KW[]>('/api/v1/keywords');
  const [kw, setKw] = useState(''); const [cat, setCat] = useState(''); const [adding, setAdding] = useState(false);

  const add = async () => { if (!kw.trim()) return; setAdding(true); await apiFetch('/api/v1/keywords', { method: 'POST', body: JSON.stringify({ keyword: kw.trim(), category: cat || undefined }) }); setKw(''); setCat(''); refetch(); setAdding(false); };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-heading font-extrabold text-text-primary tracking-tight">关键词管理</h1>
        <p className="text-text-muted text-sm mt-1">添加要监控的关键词，AI 自动匹配语义相关内容</p>
      </div>

      <div className="card p-4">
        <div className="flex flex-wrap gap-2.5">
          <input value={kw} onChange={e => setKw(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} placeholder="输入关键词，如：AI大模型..." className="bg-surface-elevated border border-border rounded-lg px-3.5 py-2.5 text-[13px] font-mono flex-1 min-w-[200px] focus:border-brand outline-none text-text-primary placeholder:text-text-muted" />
          <input value={cat} onChange={e => setCat(e.target.value)} placeholder="分类" className="bg-surface-elevated border border-border rounded-lg px-3.5 py-2.5 text-[13px] font-mono w-28 focus:border-brand outline-none text-text-primary placeholder:text-text-muted" />
          <button onClick={add} disabled={adding} className="px-5 py-2.5 bg-brand text-white font-semibold text-[13px] rounded-lg hover:brightness-110 disabled:opacity-40 transition-all font-heading">添加</button>
        </div>
      </div>

      <div className="space-y-1">
        {(kws || []).map(k => (
          <div key={k.id} className={`card p-4 flex items-center justify-between group ${k.isActive ? '' : 'opacity-40'}`}>
            <div className="flex items-center gap-3">
              <span className={`w-2 h-2 rounded-full ${k.isActive ? 'bg-positive status-pulse' : 'bg-text-muted'}`} />
              <span className="text-[14px] font-mono font-medium text-text-primary">{k.keyword}</span>
              <span className="text-[10px] text-text-muted bg-surface-elevated px-2 py-0.5 rounded-md font-mono">{k.category}</span>
            </div>
            <div className="flex gap-1.5">
              <button onClick={async () => { await apiFetch(`/api/v1/keywords/${k.id}/pause`, { method: 'POST' }); refetch(); }} className="text-[11px] px-3 py-1.5 rounded-lg border border-border text-text-muted font-mono hover:border-brand hover:text-brand transition-colors">{k.isActive ? '暂停' : '激活'}</button>
              <button onClick={async () => { if (!confirm('确定删除？')) return; await apiFetch(`/api/v1/keywords/${k.id}`, { method: 'DELETE' }); refetch(); }} className="text-[11px] px-3 py-1.5 rounded-lg border border-border text-text-muted font-mono hover:border-danger hover:text-danger transition-colors">删除</button>
            </div>
          </div>
        ))}
        {(!kws || !kws.length) && (
          <div className="card p-10 text-center"><p className="text-text-muted text-sm">尚未添加关键词</p><p className="text-text-muted text-xs mt-1 opacity-60">在上方添加第一个监控目标</p></div>
        )}
      </div>
    </div>
  );
}
