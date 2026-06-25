import { ReactNode, useState, useEffect, useRef, useCallback } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useDemo } from '@/contexts/DemoContext';
import { supabase } from '@/lib/supabase';
import AdminSidebar from './AdminSidebar';
import NotificationBell from './NotificationBell';
import DevToolbar from './DevToolbar';
import PushNotificationPrompt from './PushNotificationPrompt';
import { usePushNotifications } from '@/hooks/usePushNotifications';

const ADMIN_BOTTOM_NAV = [
  { to: '/hub/admin/dashboard',     label: 'Dashboard',   icon: 'ri-layout-grid-line' },
  { to: '/hub/admin/employees',     label: 'Employees',   icon: 'ri-team-line' },
  { to: '/hub/admin/attendance',    label: 'Attendance',  icon: 'ri-time-line' },
  { to: '/hub/admin/requests',      label: 'Requests',    icon: 'ri-inbox-line' },
  { to: '/hub/admin/timeoff',       label: 'Time Off',    icon: 'ri-calendar-event-line' },
  { to: '/hub/admin/overtime',      label: 'Overtime',    icon: 'ri-timer-flash-line' },
  { to: '/hub/admin/payroll',       label: 'Payroll',     icon: 'ri-bar-chart-2-line' },
  { to: '/hub/admin/documents',     label: 'Documents',   icon: 'ri-file-text-line' },
  { to: '/hub/admin/announcements', label: 'Notices',     icon: 'ri-megaphone-line' },
  { to: '/hub/admin/credentials',   label: 'Credentials', icon: 'ri-lock-2-line' },
  { to: '/hub/admin/sop',           label: 'SOP',         icon: 'ri-book-open-line' },
  { to: '/hub/admin/settings',      label: 'Settings',    icon: 'ri-settings-3-line' },
];

interface Props {
  children: ReactNode;
  title?: string;
  actions?: ReactNode;
}

interface SearchResult {
  type: 'contractor' | 'project' | 'invoice' | 'request';
  id: string | number;
  title: string;
  subtitle: string;
  path: string;
  icon: string;
}

function GlobalSearch() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const search = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setResults([]); return; }
    setLoading(true);
    const like = `%${q}%`;
    const [cRes, pRes, iRes, rRes] = await Promise.all([
      supabase.from('hub_users').select('id, full_name, department, role').ilike('full_name', like).eq('status', 'active').limit(4),
      supabase.from('hub_projects').select('id, project_name, client_name, status').or(`project_name.ilike.${like},client_name.ilike.${like}`).limit(4),
      supabase.from('hub_invoice_log').select('id, invoice_number, client_name, project_name').or(`invoice_number.ilike.${like},client_name.ilike.${like}`).limit(3),
      supabase.from('hub_requests').select('id, title, type, status').ilike('title', like).limit(3),
    ]);

    const out: SearchResult[] = [];
    for (const c of (cRes.data || [])) {
      out.push({ type: 'contractor', id: c.id, title: c.full_name, subtitle: c.department || c.role, path: `/hub/admin/employees/${c.id}`, icon: 'ri-user-line' });
    }
    for (const p of (pRes.data || [])) {
      out.push({ type: 'project', id: p.id, title: p.project_name, subtitle: p.client_name, path: '/hub/admin/projects', icon: 'ri-folder-line' });
    }
    for (const inv of (iRes.data || [])) {
      out.push({ type: 'invoice', id: inv.id, title: `Invoice #${inv.invoice_number}`, subtitle: inv.client_name, path: '/hub/admin/invoice-log', icon: 'ri-bill-line' });
    }
    for (const r of (rRes.data || [])) {
      out.push({ type: 'request', id: r.id, title: r.title, subtitle: r.type, path: '/hub/admin/requests', icon: 'ri-inbox-line' });
    }
    setResults(out);
    setActiveIdx(0);
    setLoading(false);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => search(query), 200);
    return () => clearTimeout(t);
  }, [query, search]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setOpen(true); setTimeout(() => inputRef.current?.focus(), 50); }
      if (e.key === 'Escape') { setOpen(false); setQuery(''); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) { setOpen(false); setQuery(''); }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const go = (result: SearchResult) => {
    navigate(result.path);
    setOpen(false);
    setQuery('');
    setResults([]);
  };

  const typeColors: Record<string, string> = {
    contractor: 'text-[#1c2b3a]', project: 'text-teal-600', invoice: 'text-sky-600', request: 'text-[#1c2b3a]',
  };
  const quickActions = [
    { label: 'Dashboard page', path: '/hub/admin/dashboard', icon: 'ri-home-5-line' },
    { label: 'Projects page', path: '/hub/admin/projects', icon: 'ri-folder-line' },
    { label: 'Payroll page', path: '/hub/admin/payroll', icon: 'ri-bank-card-line' },
    { label: 'Employees page', path: '/hub/admin/employees', icon: 'ri-team-line' },
    { label: 'Attendance page', path: '/hub/admin/attendance', icon: 'ri-time-line' },
    { label: 'Schedule invoice', path: '/hub/admin/invoice-log', icon: 'ri-calendar-schedule-line' },
  ];
  const activeFilter = query.length >= 2 ? 'Results' : 'All';

  return (
    <div className="relative" ref={containerRef}>
      <div
        className={`flex items-center gap-2 bg-white/80 border rounded-xl px-3 py-2 cursor-text transition-all ${open ? 'border-slate-400 ring-2 ring-slate-100 w-44 sm:w-52' : 'border-[#e5e7eb] w-9 sm:w-44 md:w-52 hover:border-gray-300'}`}
        onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 50); }}
      >
        <i className="ri-search-line text-[#9ca3af] text-sm flex-shrink-0"></i>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onKeyDown={e => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, results.length - 1)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
            if (e.key === 'Enter' && results[activeIdx]) go(results[activeIdx]);
            if (e.key === 'Escape') { setOpen(false); setQuery(''); }
          }}
          placeholder="Search…"
          className={`flex-1 text-sm bg-transparent outline-none placeholder-gray-400 text-gray-800 min-w-0 ${open ? 'block' : 'hidden sm:block'}`}
        />
        {query
          ? <button onClick={e => { e.stopPropagation(); setQuery(''); setResults([]); }} className="text-gray-400 hover:text-gray-600 cursor-pointer flex-shrink-0"><i className="ri-close-line text-sm"></i></button>
          : <kbd className="hidden sm:block text-[10px] text-gray-400 bg-gray-100 border border-gray-200 rounded px-1 py-0.5 flex-shrink-0">⌘K</kbd>
        }
      </div>

      {open && (
        <div className="fixed right-4 top-[82px] w-[min(320px,90vw)] max-h-[60vh] bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-y-auto z-[200]">
          {query.length >= 2 ? (
            loading ? (
              <div className="flex items-center justify-center py-8"><i className="ri-loader-4-line animate-spin text-xl text-gray-300"></i></div>
            ) : results.length === 0 ? (
              <div className="px-4 py-6 text-center"><p className="text-sm text-gray-400">No results for "{query}"</p></div>
            ) : (
              <>
                <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold px-4 pt-3 pb-1">Results</p>
                {results.map((r, i) => (
                  <button key={r.type + r.id} onClick={() => go(r)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors cursor-pointer ${i === activeIdx ? 'bg-slate-50' : ''}`}>
                    <div className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
                      <i className={`${r.icon} text-sm ${typeColors[r.type]}`}></i>
                    </div>
                    <div className="flex-1 min-w-0 text-left">
                      <p className="text-sm font-medium text-gray-800 truncate">{r.title}</p>
                      <p className="text-xs text-gray-400 truncate">{r.subtitle}</p>
                    </div>
                    <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full flex-shrink-0">{r.type}</span>
                  </button>
                ))}
              </>
            )
          ) : (
            <>
              <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold px-4 pt-3 pb-1">Go to</p>
              {[
                { name: 'Dashboard', icon: 'ri-home-5-line', path: '/hub/admin/dashboard' },
                { name: 'Payroll', icon: 'ri-bank-card-line', path: '/hub/admin/payroll' },
                { name: 'Team', icon: 'ri-team-line', path: '/hub/admin/employees' },
                { name: 'Attendance', icon: 'ri-time-line', path: '/hub/admin/attendance' },
                { name: 'Time Off', icon: 'ri-calendar-check-line', path: '/hub/admin/timeoff' },
                { name: 'Invoices', icon: 'ri-file-text-line', path: '/hub/admin/invoice-log' },
              ].map(p => (
                <button key={p.name} onClick={() => { navigate(p.path); setOpen(false); }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors cursor-pointer">
                  <div className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
                    <i className={`${p.icon} text-sm text-gray-500`}></i>
                  </div>
                  <span className="text-sm font-medium text-gray-700 flex-1 text-left">{p.name}</span>
                  <i className="ri-arrow-right-s-line text-gray-400"></i>
                </button>
              ))}
              <div className="px-4 py-2 border-t border-gray-50">
                <p className="text-[10px] text-gray-300">Start typing to search contractors, projects, invoices</p>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function AdminLayout({ children, title, actions }: Props) {
  const { hubUser, loading, session, signOut } = useAuth();
  const { isDemo, demoRole, demoSignOut, setDemoRole } = useDemo();
  const push = usePushNotifications();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sidebar-collapsed') === 'true');
  const [mobileOpen, setMobileOpen] = useState(false);
  const toggleCollapsed = () => setCollapsed(prev => {
    const next = !prev;
    localStorage.setItem('sidebar-collapsed', String(next));
    return next;
  });

  useEffect(() => {
    if (!isDemo && !loading && !session) {
      navigate('/hub/login', { replace: true });
    }
  }, [loading, session, isDemo]);

  if (!isDemo && (loading || !hubUser)) return (
    <div className="flex h-screen items-center justify-center bg-white">
      <i className="ri-loader-4-line animate-spin text-2xl text-[#cbd5e1]"></i>
    </div>
  );

  return (
    <div className={`relative flex ${isDemo ? 'h-screen pt-8' : 'h-screen'} overflow-hidden`} style={{ background: 'linear-gradient(135deg, #d6e0ee 0%, #e8edf8 45%, #f4f6fb 100%)' }}>
      {isDemo && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-[#111827] text-white text-xs flex items-center justify-between px-4 py-1.5 gap-4">
          <span className="text-white/40 hidden sm:block flex-shrink-0">Demo</span>
          <div className="flex items-center gap-1 flex-1 justify-center">
            {(['owner', 'admin', 'contractor'] as const).map(role => (
              <button
                key={role}
                onClick={() => {
                  setDemoRole(role);
                  navigate(role === 'contractor' ? '/hub/employee/dashboard' : '/hub/admin/dashboard');
                }}
                className={`px-3 py-1 rounded-full text-[11px] font-medium capitalize transition-colors cursor-pointer ${demoRole === role ? 'bg-white text-[#111827]' : 'text-white/50 hover:text-white'}`}
              >
                {role}
              </button>
            ))}
          </div>
          <button onClick={() => { demoSignOut(); navigate('/hub/demo'); }} className="text-white/40 hover:text-white transition-colors cursor-pointer flex-shrink-0 text-[11px]">Exit</button>
        </div>
      )}
      {/* Desktop sidebar */}
      <div className="hidden lg:block relative z-10">
        <AdminSidebar collapsed={collapsed} onToggle={() => toggleCollapsed()} />
      </div>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="w-[260px] flex-shrink-0 h-full">
            <AdminSidebar collapsed={false} onToggle={() => setMobileOpen(false)} />
          </div>
          <div className="flex-1 bg-black/20 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
        </div>
      )}

      {/* Main content */}
      <div className="relative z-10 flex-1 min-w-0 overflow-hidden lg:px-4 lg:pb-4 lg:pt-5 md:px-5 md:pb-5">
        <div className="flex h-full flex-col lg:rounded-[34px] overflow-hidden lg:shadow-xl lg:shadow-slate-200/50"
          style={{ background: 'rgba(255,255,255,0.60)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,0.75)' }}
        >
        {/* Top bar */}
        <header className="border-b border-white/60 px-4 md:px-6 h-[78px] flex items-center gap-4 flex-shrink-0 bg-transparent">
          <div className="flex-1 min-w-0">
            {title && (
              <h1 className="text-gray-900 font-semibold text-lg sm:text-[28px] leading-tight truncate">{title}</h1>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 overflow-visible">
            {actions}
            <GlobalSearch />
            <NotificationBell />
          </div>
        </header>


        {/* Page content */}
        <main className="flex-1 overflow-y-auto overscroll-none p-4 md:p-6 bg-transparent" style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom, 0px) + 5rem)' }}>
          <div className="max-w-7xl mx-auto">
            {!isDemo && (
              <PushNotificationPrompt
                supported={push.supported}
                canPrompt={push.canPrompt}
                needsSettings={push.needsSettings}
                subscribing={push.subscribing}
                error={push.error}
                onEnable={() => { void push.enableNotifications(); }}
              />
            )}
            {children}
          </div>
        </main>
        </div>
      </div>
      {/* Mobile bottom tab bar */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40"
        style={{
          background: 'rgba(255,255,255,0.85)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderTop: '1px solid rgba(0,0,0,0.06)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}>
        <div className="overflow-x-auto scrollbar-hide">
          <div className="flex px-2 py-2 gap-1" style={{ minWidth: 'max-content' }}>
            {ADMIN_BOTTOM_NAV.map(item => (
              <NavLink key={item.to} to={item.to}
                className={({ isActive }) =>
                  `flex flex-col items-center gap-1 px-4 py-2 rounded-2xl transition-all cursor-pointer min-w-[68px] ${
                    isActive
                      ? 'bg-[#1c2b3a]/10 text-[#1c2b3a]'
                      : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100/60'
                  }`
                }>
                <i className={`${item.icon} text-[26px] leading-none`}></i>
                <span className="text-[11px] font-medium leading-none whitespace-nowrap">{item.label}</span>
              </NavLink>
            ))}
          </div>
        </div>
      </nav>

      <DevToolbar />
    </div>
  );
}
