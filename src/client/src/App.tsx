import { Outlet, NavLink, useLocation } from 'react-router';
import { useState, useEffect } from 'react';
import { Icon } from './components/icons.js';
import { ScanStatusBar } from './components/ScanStatusBar.js';
import { ChatPanel } from './components/ChatPanel.js';

export function App() {
  return (
    <div className="flex h-screen bg-surface-root text-text-primary font-body overflow-hidden">
      {/* Animated grid background */}
      <div className="bg-grid" />
      <div className="ambient-glow" />

      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative z-10">
        <Header />
        <ScanStatusBar />
        <main className="flex-1 overflow-y-auto px-6 py-6 pb-24 md:pb-6">
          <Outlet />
        </main>
      </div>
      <MobileNav />
      <ChatPanel />
    </div>
  );
}

/* ── Sidebar ── */
function Sidebar() {
  const loc = useLocation();
  return (
    <aside className="hidden md:flex flex-col w-56 flex-shrink-0 border-r border-border bg-surface-card/40 backdrop-blur-xl z-20">
      <div className="px-5 py-5 border-b border-border flex items-center gap-3">
        <span className="w-9 h-9 rounded-xl gradient-brand flex items-center justify-center text-[#03120A] flex-shrink-0">
          <Icon name="radar" className="w-5 h-5" />
        </span>
        <div className="min-w-0">
          <span className="block text-lg font-heading font-bold tracking-tight leading-none">
            <span className="text-gradient">PulseAI</span>
          </span>
          <span className="block text-text-muted text-[9px] font-mono mt-1 uppercase tracking-[0.2em]">live radar</span>
        </div>
      </div>
      <nav className="flex-1 px-3 py-5 space-y-1">
        <SideNav to="/" current={loc.pathname} icon={<Icon name="grid" />} label="指挥中心" />
        <SideNav to="/topics" current={loc.pathname} icon={<Icon name="trend" />} label="话题浏览" />
        <SideNav to="/keywords" current={loc.pathname} icon={<Icon name="search" />} label="关键词" />
        <SideNav to="/sources" current={loc.pathname} icon={<Icon name="layers" />} label="数据源" />
      </nav>
      <div className="px-3 py-4 border-t border-border">
        <SideNav to="/settings" current={loc.pathname} icon={<Icon name="settings" />} label="设置" />
      </div>
    </aside>
  );
}

function SideNav({ to, current, icon, label }: { to: string; current: string; icon: React.ReactNode; label: string }) {
  const active = to === '/' ? current === '/' : current.startsWith(to);
  return (
    <NavLink
      to={to}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all duration-150 no-underline group ${
        active
          ? 'bg-brand-soft text-brand font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]'
          : 'text-text-secondary hover:text-text-primary hover:bg-white/[0.04]'
      }`}
    >
      <span className="w-4 h-4 flex-shrink-0 opacity-70 group-hover:opacity-100 transition-opacity">{icon}</span>
      {label}
    </NavLink>
  );
}

/* ── Header ── */
function Header() {
  const [t, setT] = useState(new Date());
  useEffect(() => { const i = setInterval(() => setT(new Date()), 1000); return () => clearInterval(i); }, []);
  return (
    <header className="glass px-6 py-3 flex items-center justify-between gap-3 flex-shrink-0 z-20">
      <div className="flex items-center gap-2.5">
        <span className="w-1.5 h-1.5 rounded-full bg-brand status-pulse" />
        <span className="text-text-muted text-[11px] font-mono tracking-[0.12em]">LIVE MONITOR</span>
      </div>
      <div className="flex items-center gap-2 text-text-muted text-[11px] font-mono tabular-nums">
        <Icon name="clock" className="w-3.5 h-3.5" />
        <span>{t.toLocaleTimeString('zh-CN', { hour12: false })}</span>
      </div>
    </header>
  );
}

/* ── Mobile Nav ── */
function MobileNav() {
  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-50 glass py-2.5">
      <div className="flex justify-around">
        {([['/', 'grid', '概览'], ['/topics', 'trend', '话题'], ['/keywords', 'search', '关键词'], ['/sources', 'layers', '数据源']] as const).map(([to, icon, label]) => (
          <NavLink key={to} to={to} className={({ isActive }) => `flex flex-col items-center gap-0.5 text-[10px] font-medium transition-colors ${isActive ? 'text-brand' : 'text-text-muted'}`}>
            <span className="w-4.5 h-4.5"><Icon name={icon} /></span>
            <span>{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
