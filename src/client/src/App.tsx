import { Outlet, NavLink, useLocation } from 'react-router';
import { useState, useEffect } from 'react';

export function App() {
  return (
    <div className="flex h-screen bg-surface-root text-text-primary font-body overflow-hidden">
      {/* Desktop Sidebar */}
      <Sidebar />

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto px-6 py-6 pb-24 md:pb-6">
          <Outlet />
        </main>
      </div>

      {/* Mobile Bottom Nav */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-50 glass py-2">
        <div className="flex justify-around">
          <MobileNav to="/" icon={IconGrid} label="概览" />
          <MobileNav to="/topics" icon={IconTrend} label="话题" />
          <MobileNav to="/keywords" icon={IconSearch} label="关键词" />
          <MobileNav to="/sources" icon={IconLayers} label="数据源" />
        </div>
      </nav>
    </div>
  );
}

/* ── Sidebar ── */
function Sidebar() {
  const loc = useLocation();
  return (
    <aside className="hidden md:flex flex-col w-56 flex-shrink-0 border-r border-border bg-surface-card/40">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-border">
        <span className="font-display text-xl text-brand tracking-tight">HotMonitor</span>
        <span className="block text-text-muted text-[10px] font-mono mt-0.5 tracking-widest">COMMAND CENTER</span>
      </div>

      {/* Nav items */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        <SidebarNav to="/" current={loc.pathname} icon={IconGrid} label="指挥中心" />
        <SidebarNav to="/topics" current={loc.pathname} icon={IconTrend} label="话题浏览" />
        <SidebarNav to="/keywords" current={loc.pathname} icon={IconSearch} label="关键词管理" />
        <SidebarNav to="/sources" current={loc.pathname} icon={IconLayers} label="数据源" />
      </nav>

      {/* Bottom */}
      <div className="px-3 py-4 border-t border-border">
        <SidebarNav to="/settings" current={loc.pathname} icon={IconSettings} label="系统设置" />
      </div>
    </aside>
  );
}

function SidebarNav({ to, current, icon, label }: { to: string; current: string; icon: React.ReactNode; label: string }) {
  const active = to === '/' ? current === '/' : current.startsWith(to);
  return (
    <NavLink
      to={to}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all duration-150 ${
        active
          ? 'bg-brand-soft text-brand font-semibold'
          : 'text-text-secondary hover:text-text-primary hover:bg-white/[0.04]'
      }`}
    >
      <span className="w-4 h-4 flex-shrink-0 opacity-70">{icon}</span>
      {label}
    </NavLink>
  );
}

/* ── Header ── */
function Header() {
  const [time, setTime] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setTime(new Date()), 1000); return () => clearInterval(t); }, []);

  return (
    <header className="glass px-6 py-3 flex items-center justify-end gap-4 flex-shrink-0">
      <span className="text-text-muted text-[11px] font-mono tabular-nums">
        {time.toLocaleTimeString('zh-CN', { hour12: false })}
      </span>
      <span className="text-text-muted text-[11px] font-mono">
        {time.toLocaleDateString('zh-CN', { weekday: 'short', month: 'short', day: 'numeric' })}
      </span>
    </header>
  );
}

/* ── Mobile Nav ── */
function MobileNav({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex flex-col items-center gap-0.5 text-[10px] font-medium transition-colors ${
          isActive ? 'text-brand' : 'text-text-muted'
        }`
      }
    >
      <span className="w-4.5 h-4.5">{icon}</span>
      <span>{label}</span>
    </NavLink>
  );
}

/* ── SVG Icons (16px) ── */
const IconGrid = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>;
const IconTrend = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>;
const IconSearch = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>;
const IconLayers = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>;
const IconSettings = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>;
