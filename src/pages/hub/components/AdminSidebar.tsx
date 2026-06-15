import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useDemo } from '@/contexts/DemoContext';

const navItems = [
  { to: '/hub/admin/dashboard', label: 'Dashboard', icon: 'ri-layout-grid-line' },
  { divider: true, label: 'People' },
  { to: '/hub/admin/employees', label: 'Employees', icon: 'ri-team-line' },
  { to: '/hub/admin/attendance', label: 'Attendance', icon: 'ri-time-line' },
  { to: '/hub/admin/performance', label: 'Performance', icon: 'ri-medal-line', devOnly: true },
  { divider: true, label: 'Inbound' },
  { to: '/hub/admin/applications', label: 'Applications', icon: 'ri-user-search-line' },
  { to: '/hub/admin/contact', label: 'Contact Inbox', icon: 'ri-mail-line' },
  { divider: true, label: 'Approvals' },
  { to: '/hub/admin/requests', label: 'Requests', icon: 'ri-inbox-line' },
  { to: '/hub/admin/timeoff', label: 'Time-Off', icon: 'ri-calendar-event-line' },
  { to: '/hub/admin/overtime', label: 'Overtime', icon: 'ri-timer-flash-line' },
  { divider: true, label: 'Finance' },
  { to: '/hub/admin/payroll', label: 'Payroll', icon: 'ri-bar-chart-2-line' },
  { to: '/hub/admin/documents', label: 'Documents', icon: 'ri-file-text-line' },
  { divider: true, label: 'Content' },
  { to: '/hub/admin/sop', label: 'SOP Library', icon: 'ri-book-open-line' },
  { to: '/hub/admin/announcements', label: 'Announcements', icon: 'ri-megaphone-line' },
  { to: '/hub/admin/assets', label: 'Asset Access', icon: 'ri-key-2-line' },
  { to: '/hub/admin/credentials', label: 'Credentials Vault', icon: 'ri-lock-2-line' },
  { divider: true, label: '' },
  { to: '/hub/admin/auditlog', label: 'Audit Log', icon: 'ri-shield-check-line' },
  { to: '/hub/admin/settings', label: 'Settings', icon: 'ri-settings-3-line' },
];

interface Props {
  collapsed: boolean;
  onToggle: () => void;
}

export default function AdminSidebar({ collapsed, onToggle }: Props) {
  const { hubUser, signOut } = useAuth();
  const { isDemo, demoUser, demoSignOut } = useDemo();
  const navigate = useNavigate();
  const activeUser = isDemo ? demoUser : hubUser;
  const visibleNavItems = navItems.filter((item) => !(item as { devOnly?: boolean }).devOnly || hubUser?.is_developer);

  const handleSignOut = async () => {
    if (isDemo) {
      demoSignOut();
      navigate('/hub/demo');
      return;
    }
    await signOut();
    navigate('/hub/login');
  };

  return (
    <aside
      className={`h-full lg:h-screen lg:px-4 lg:py-5 bg-transparent flex flex-col transition-all duration-300 ease-in-out flex-shrink-0 ${
        collapsed ? 'w-[92px]' : 'w-full lg:w-[260px]'
      }`}
    >
      <div
        className="flex flex-col flex-1 min-h-0 lg:rounded-[30px] overflow-hidden"
        style={{
          background: 'rgba(255,255,255,0.55)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          boxShadow: '0 8px 32px rgba(99,120,200,0.10), inset 0 1px 0 rgba(255,255,255,0.8)',
          border: '1px solid rgba(255,255,255,0.75)',
        }}
      >

        {/* Logo */}
        <div className={`flex items-center gap-2.5 px-4 h-[66px] border-b border-white/60 ${collapsed ? 'justify-center px-0' : ''}`}>
          <div
            onClick={collapsed ? onToggle : undefined}
            className={`w-10 h-10 rounded-2xl overflow-hidden flex-shrink-0 ${collapsed ? 'cursor-pointer' : ''}`}
          >
            <img src="/images/fs-architects-logo.jpg" alt="FS Architects" className="w-full h-full object-cover" />
          </div>
          {!collapsed && (
            <>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-gray-800 truncate leading-tight">FS Architects</p>
                <p className="text-[11px] text-gray-400 tracking-wide leading-tight">Sentro</p>
              </div>
              <button
                onClick={onToggle}
                className="ml-auto w-8 h-8 rounded-full border border-gray-200/60 text-gray-400 hover:text-gray-700 cursor-pointer transition-colors flex-shrink-0 bg-white/40"
              >
                <i className="ri-menu-fold-line text-sm"></i>
              </button>
            </>
          )}
        </div>

        {/* Nav */}
        <nav className={`flex-1 min-h-0 overflow-y-auto pt-4 pb-3 ${collapsed ? 'px-2' : 'px-3'}`}>
          {visibleNavItems.map((item, idx) => {
            if ((item as any).divider) {
              return !collapsed ? (
                <div key={idx} className={`px-3 ${item.label ? 'pt-4 pb-2' : 'pt-3'}`}>
                  {item.label
                    ? <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400/70">{item.label}</p>
                    : <div className="border-t border-gray-200/50" />}
                </div>
              ) : <div key={idx} className="mx-3 my-3 border-t border-gray-200/50"></div>;
            }
            return (
              <NavLink
                key={item.to}
                to={item.to!}
                className={({ isActive }) =>
                  `group flex items-center gap-3 px-3 py-2 rounded-2xl text-[13px] transition-all cursor-pointer ${
                    isActive
                      ? 'bg-white/70 text-[#1c2b3a] shadow-sm shadow-slate-200/60/60'
                      : 'text-gray-500 hover:bg-white/50 hover:text-gray-800'
                  } ${collapsed ? 'justify-center px-2' : ''}`
                }
                title={item.label}
              >
                <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                  <i className={`${item.icon} text-[16px]`}></i>
                </div>
                {!collapsed && (
                  <span className="truncate min-w-0 transition-transform duration-300 group-hover:translate-x-0.5">
                    {item.label}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* Bottom: user + sign out */}
        <div className={`border-t border-white/60 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] ${collapsed ? 'px-2' : ''}`}>
          {!collapsed && activeUser ? (
            <div className="flex items-center gap-2.5 px-2 py-1 min-w-0">
              {activeUser.avatar_url ? (
                <img src={activeUser.avatar_url} alt={activeUser.full_name} className="w-7 h-7 rounded-full object-cover object-top flex-shrink-0" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-[#1c2b3a] flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-bold text-white">{activeUser.full_name.charAt(0)}</span>
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-800 truncate leading-tight">{activeUser.full_name}</p>
                <p className="text-[11px] text-gray-400 capitalize truncate">{activeUser.role}</p>
              </div>
              <button onClick={handleSignOut} title="Sign out"
                className="w-8 h-8 flex items-center justify-center rounded-xl text-gray-400 hover:text-red-500 hover:bg-white/50 transition-colors cursor-pointer flex-shrink-0">
                <i className="ri-logout-box-r-line text-[18px]"></i>
              </button>
            </div>
          ) : collapsed ? (
            <button onClick={handleSignOut} title="Sign out"
              className="flex items-center justify-center text-gray-400 hover:text-red-500 transition-colors cursor-pointer w-full rounded-2xl px-0 py-2 hover:bg-white/50">
              <i className="ri-logout-box-r-line text-[18px]"></i>
            </button>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
