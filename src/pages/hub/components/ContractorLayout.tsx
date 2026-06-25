import { ReactNode, useState, useEffect, useRef } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useHubAuth } from '@/hooks/useHubAuth';
import { useDemo } from '@/contexts/DemoContext';
import { supabase } from '@/lib/supabase';
import ContractorSidebar from './ContractorSidebar';
import NotificationBell from './NotificationBell';
import DevToolbar from './DevToolbar';
import PushNotificationPrompt from './PushNotificationPrompt';
import { usePushNotifications } from '@/hooks/usePushNotifications';

const EMPLOYEE_BOTTOM_NAV = [
  { to: '/hub/employee/dashboard',    label: 'Dashboard',   icon: 'ri-layout-grid-line' },
  { to: '/hub/employee/attendance',   label: 'Attendance',  icon: 'ri-time-line' },
  { to: '/hub/employee/requests',     label: 'Requests',    icon: 'ri-inbox-line' },
  { to: '/hub/employee/timeoff',      label: 'Time Off',    icon: 'ri-calendar-event-line' },
  { to: '/hub/employee/overtime',     label: 'Overtime',    icon: 'ri-timer-flash-line' },
  { to: '/hub/employee/payouts',      label: 'Payouts',     icon: 'ri-money-dollar-circle-line' },
  { to: '/hub/employee/documents',    label: 'Documents',   icon: 'ri-file-list-3-line' },
  { to: '/hub/employee/credentials',  label: 'Credentials', icon: 'ri-lock-2-line' },
  { to: '/hub/employee/sop',          label: 'SOP',         icon: 'ri-book-open-line' },
  { to: '/hub/employee/announcements',label: 'Notices',     icon: 'ri-megaphone-line' },
  { to: '/hub/employee/profile',      label: 'Profile',     icon: 'ri-user-line' },
];

const QUICK_ACTIONS = [
  { label: 'Submit Payslip', icon: 'ri-send-plane-line', path: '/hub/employee/payouts', iconCls: 'bg-slate-50 text-[#1c2b3a]' },
  { label: 'Request Time Off', icon: 'ri-calendar-check-line', path: '/hub/employee/timeoff', iconCls: 'bg-emerald-50 text-emerald-600' },
  { label: 'Log Overtime', icon: 'ri-time-line', path: '/hub/employee/overtime', iconCls: 'bg-purple-50 text-purple-600' },
];

const HUB_PAGES = [
  { label: 'Dashboard', description: 'Overview & stats', icon: 'ri-home-5-line', path: '/hub/employee/dashboard', keywords: ['dashboard', 'home', 'overview', 'stats', 'summary'] },
  { label: 'My Payouts', description: 'Submit payslip & payment history', icon: 'ri-money-dollar-circle-line', path: '/hub/employee/payouts', keywords: ['payout', 'payslip', 'salary', 'payment', 'submit', 'payroll', 'earn', 'money', 'income'] },
  { label: 'Time Off', description: 'Leave, vacation & sick days', icon: 'ri-calendar-check-line', path: '/hub/employee/timeoff', keywords: ['time off', 'leave', 'vacation', 'sick', 'pto', 'absence', 'holiday', 'rest'] },
  { label: 'Overtime', description: 'Log & track overtime', icon: 'ri-time-line', path: '/hub/employee/overtime', keywords: ['overtime', 'ot', 'extra hours', 'extra', 'additional'] },
  { label: 'Documents', description: 'Contracts, files & signing', icon: 'ri-file-text-line', path: '/hub/employee/documents', keywords: ['documents', 'files', 'contract', 'sign', 'upload', 'pdf', 'forms'] },
  { label: 'Attendance', description: 'Daily hours & clock log', icon: 'ri-calendar-todo-line', path: '/hub/employee/dashboard', keywords: ['attendance', 'hours', 'clock', 'daily', 'log', 'slack', 'check in'] },
  { label: 'Profile', description: 'Your account & settings', icon: 'ri-user-line', path: '/hub/employee/dashboard', keywords: ['profile', 'account', 'settings', 'name', 'email', 'info'] },
];

interface Props {
  children: ReactNode;
  title?: string;
  titleContent?: ReactNode;
  actions?: ReactNode;
  hideGlobalSearch?: boolean;
}

export default function ContractorLayout({ children, title, titleContent, actions, hideGlobalSearch }: Props) {
  const { loading, session, signOut } = useAuth();
  const { hubUser } = useHubAuth();
  const { isDemo, demoRole, demoSignOut, setDemoRole } = useDemo();
  const push = usePushNotifications();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('contractor_sidebar_collapsed') === 'true');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [liveProjects, setLiveProjects] = useState<{ name: string; client: string; status: string; id: number }[]>([]);
  const [liveTasks, setLiveTasks] = useState<{ id: number; title: string; status: string; projectName: string; projectId: number }[]>([]);
  const [liveLoading, setLiveLoading] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const q = globalSearch.trim().toLowerCase();

  const pageResults = q
    ? HUB_PAGES.filter(p =>
        p.label.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.keywords.some(k => k.includes(q))
      )
    : [];

  // Cmd+K to open
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
        setTimeout(() => searchInputRef.current?.focus(), 50);
      }
      if (e.key === 'Escape') { setSearchOpen(false); setGlobalSearch(''); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  // Click outside to close
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false); setGlobalSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Live fetch tasks + projects on debounce
  useEffect(() => {
    if (!q || !hubUser) { setLiveProjects([]); setLiveTasks([]); return; }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLiveLoading(true);
      const [projectsRes, tasksRes] = await Promise.all([
        supabase
          .from('hub_project_contractors')
          .select('hub_projects(id, project_name, client_name, status)')
          .eq('contractor_id', hubUser.id),
        supabase
          .from('hub_project_tasks')
          .select('id, title, status, project_id, hub_projects(project_name)')
          .ilike('title', `%${globalSearch.trim()}%`)
          .limit(5),
      ]);
      if (cancelled) return;
      const projects = ((projectsRes.data ?? []) as any[])
        .map((r: any) => {
          const p = Array.isArray(r.hub_projects) ? r.hub_projects[0] : r.hub_projects;
          return p ? { name: p.project_name, client: p.client_name, status: p.status, id: p.id } : null;
        })
        .filter(Boolean)
        .filter((p: any) =>
          p.name.toLowerCase().includes(q) || p.client.toLowerCase().includes(q)
        ) as { name: string; client: string; status: string; id: number }[];
      const tasks = ((tasksRes.data ?? []) as any[]).map((t: any) => {
        const p = Array.isArray(t.hub_projects) ? t.hub_projects[0] : t.hub_projects;
        return { id: t.id, title: t.title, status: t.status, projectName: p?.project_name ?? '', projectId: t.project_id };
      });
      setLiveProjects(projects.slice(0, 4));
      setLiveTasks(tasks.slice(0, 4));
      setLiveLoading(false);
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [globalSearch, hubUser]);

  const toggleCollapsed = () => {
    setCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('contractor_sidebar_collapsed', String(next));
      return next;
    });
  };

  useEffect(() => {
    if (!isDemo && !loading && !session) {
      navigate('/hub/login', { replace: true });
    }
  }, [loading, session, isDemo]);

  useEffect(() => {
    if (!loading && hubUser && hubUser.role === 'contractor' && hubUser.onboarding_completed === false) {
      const path = window.location.pathname;
      if (path !== '/hub/employee/onboarding') {
        navigate('/hub/employee/onboarding', { replace: true });
      }
    }
    // developer viewing as contractor bypasses onboarding check
  }, [loading, hubUser]);

  if (!isDemo && (loading || !hubUser)) return (
    <div className="flex h-screen items-center justify-center bg-[#FAFAFA]">
      <i className="ri-loader-4-line animate-spin text-2xl text-gray-300"></i>
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
        <ContractorSidebar collapsed={collapsed} onToggle={toggleCollapsed} />
      </div>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="w-[220px] flex-shrink-0 h-full">
            <ContractorSidebar collapsed={false} onToggle={() => setMobileOpen(false)} />
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
              {titleContent ?? (title && <h1 className="text-gray-900 font-semibold text-lg sm:text-[28px] leading-tight truncate">{title}</h1>)}
            </div>
            <div className="flex items-center gap-3">
              {actions}

              {/* Global search — hidden in workspace mode */}
              {!hideGlobalSearch && <div className="relative" ref={searchRef}>
                <div className={`flex items-center gap-2 bg-white/70 backdrop-blur-sm border rounded-xl px-3 py-2 transition-all cursor-text ${searchOpen ? 'border-slate-400 ring-2 ring-slate-100 w-44 sm:w-52' : 'border-gray-200 w-9 sm:w-44 md:w-52'}`}
                  onClick={() => { setSearchOpen(true); setTimeout(() => searchInputRef.current?.focus(), 50); }}>
                  <i className="ri-search-line text-gray-400 text-sm flex-shrink-0"></i>
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={globalSearch}
                    onChange={e => { setGlobalSearch(e.target.value); setSearchOpen(true); }}
                    onFocus={() => setSearchOpen(true)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        if (pageResults[0]) { navigate(pageResults[0].path); setGlobalSearch(''); setSearchOpen(false); }
                      }
                      if (e.key === 'Escape') { setGlobalSearch(''); setSearchOpen(false); }
                    }}
                    placeholder="Search…"
                    className={`flex-1 text-sm bg-transparent outline-none placeholder-gray-400 text-gray-700 min-w-0 ${searchOpen ? 'block' : 'hidden sm:block'}`}
                  />
                  {globalSearch
                    ? <button onClick={e => { e.stopPropagation(); setGlobalSearch(''); setSearchOpen(false); }} className="text-gray-400 hover:text-gray-600 cursor-pointer flex-shrink-0"><i className="ri-close-line text-sm"></i></button>
                    : <kbd className="hidden sm:block text-[10px] text-gray-300 bg-gray-100 border border-gray-200 rounded px-1 py-0.5 flex-shrink-0">⌘K</kbd>
                  }
                </div>

                {/* Dropdown */}
                {searchOpen && (
                  <div className="fixed right-4 top-[82px] w-[min(320px,90vw)] max-h-[60vh] bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-y-auto z-[200]">

                    {/* No query: quick actions */}
                    {!q && (
                      <>
                        <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold px-4 pt-3 pb-1.5">Quick Actions</p>
                        {QUICK_ACTIONS.map(a => (
                          <button key={a.path + a.label}
                            onClick={() => { navigate(a.path); setSearchOpen(false); }}
                            className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors cursor-pointer">
                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${a.iconCls}`}>
                              <i className={`${a.icon} text-sm`}></i>
                            </div>
                            <span className="text-sm font-medium text-gray-700">{a.label}</span>
                            <i className="ri-arrow-right-s-line text-gray-300 ml-auto"></i>
                          </button>
                        ))}
                        <div className="px-4 py-2.5 border-t border-gray-50">
                          <p className="text-[10px] text-gray-400">Start typing to search pages, projects and tasks</p>
                        </div>
                      </>
                    )}

                    {/* With query: grouped results */}
                    {q && (
                      <>
                        {/* Pages */}
                        {pageResults.length > 0 && (
                          <>
                            <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold px-4 pt-3 pb-1">Pages</p>
                            {pageResults.slice(0, 4).map(p => (
                              <button key={p.path + p.label}
                                onClick={() => { navigate(p.path); setGlobalSearch(''); setSearchOpen(false); }}
                                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors cursor-pointer">
                                <div className="w-8 h-8 rounded-xl bg-slate-50 flex items-center justify-center flex-shrink-0">
                                  <i className={`${p.icon} text-[#1c2b3a]/70 text-sm`}></i>
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-medium text-gray-800">{p.label}</p>
                                  <p className="text-[11px] text-gray-400 truncate">{p.description}</p>
                                </div>
                                <i className="ri-arrow-right-s-line text-gray-300 flex-shrink-0"></i>
                              </button>
                            ))}
                          </>
                        )}

                        {/* Projects */}
                        {liveProjects.length > 0 && (
                          <>
                            <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold px-4 pt-3 pb-1 border-t border-gray-50">Projects</p>
                            {liveProjects.map(p => (
                              <button key={p.id}
                                onClick={() => { navigate('/hub/employee/projects'); setGlobalSearch(''); setSearchOpen(false); }}
                                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors cursor-pointer">
                                <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                                  <i className="ri-folder-line text-blue-500 text-sm"></i>
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-medium text-gray-800 truncate">{p.name}</p>
                                  <p className="text-[11px] text-gray-400">{p.client}</p>
                                </div>
                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${p.status === 'ongoing' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                                  {p.status === 'ongoing' ? 'Active' : p.status}
                                </span>
                              </button>
                            ))}
                          </>
                        )}

                        {/* Tasks */}
                        {liveTasks.length > 0 && (
                          <>
                            <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold px-4 pt-3 pb-1 border-t border-gray-50">Tasks</p>
                            {liveTasks.map(t => (
                              <button key={t.id}
                                onClick={() => { navigate('/hub/employee/projects'); setGlobalSearch(''); setSearchOpen(false); }}
                                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors cursor-pointer">
                                <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${t.status === 'done' ? 'bg-emerald-50' : t.status === 'in_progress' ? 'bg-sky-50' : 'bg-gray-100'}`}>
                                  <i className={`text-sm ${t.status === 'done' ? 'ri-checkbox-circle-fill text-emerald-500' : t.status === 'in_progress' ? 'ri-loader-2-line text-sky-500' : 'ri-checkbox-blank-circle-line text-gray-400'}`}></i>
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-medium text-gray-800 truncate">{t.title}</p>
                                  <p className="text-[11px] text-gray-400 truncate">{t.projectName}</p>
                                </div>
                              </button>
                            ))}
                          </>
                        )}

                        {/* Loading */}
                        {liveLoading && (
                          <div className="flex items-center gap-2 px-4 py-3 border-t border-gray-50">
                            <i className="ri-loader-4-line animate-spin text-gray-300 text-sm"></i>
                            <span className="text-xs text-gray-400">Searching…</span>
                          </div>
                        )}

                        {/* Empty */}
                        {!liveLoading && pageResults.length === 0 && liveProjects.length === 0 && liveTasks.length === 0 && (
                          <div className="px-4 py-6 text-center">
                            <i className="ri-search-line text-2xl text-gray-200 block mb-2"></i>
                            <p className="text-sm text-gray-400">No results for <span className="font-medium text-gray-600">"{globalSearch}"</span></p>
                          </div>
                        )}

                        <div className="px-4 py-2 border-t border-gray-50">
                          <p className="text-[10px] text-gray-300">↵ Enter to go to first result · Esc to close</p>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>}

              <NotificationBell />
              <button onClick={() => signOut()} className="lg:hidden w-9 h-9 flex items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-400 hover:text-red-500 cursor-pointer flex-shrink-0" title="Sign out">
                <i className="ri-logout-box-r-line text-base"></i>
              </button>
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
            {EMPLOYEE_BOTTOM_NAV.map(item => (
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
