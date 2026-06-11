import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useHubAuth } from '@/hooks/useHubAuth';

const baseNavItems = [
  { to: '/hub/contractor/dashboard', label: 'Dashboard', icon: 'ri-layout-grid-line' },
  { to: '/hub/contractor/attendance', label: 'My Attendance', icon: 'ri-time-line' },
  { to: '/hub/contractor/requests', label: 'Requests', icon: 'ri-inbox-line' },
  { to: '/hub/contractor/timeoff', label: 'Time-Off', icon: 'ri-calendar-event-line' },
  { to: '/hub/contractor/overtime', label: 'Overtime', icon: 'ri-timer-flash-line' },
  { divider: true, label: 'Finance & Docs' },
  { to: '/hub/contractor/payouts', label: 'My Payouts', icon: 'ri-money-dollar-circle-line' },
  { to: '/hub/contractor/documents', label: 'Documents', icon: 'ri-file-list-3-line' },
  { to: '/hub/contractor/credentials', label: 'Credentials', icon: 'ri-lock-2-line' },
  { divider: true, label: 'Resources' },
  { to: '/hub/contractor/sop', label: 'SOP Library', icon: 'ri-book-open-line' },
  { to: '/hub/contractor/announcements', label: 'Announcements', icon: 'ri-megaphone-line' },
  { to: '/hub/contractor/profile', label: 'My Profile', icon: 'ri-user-line' },
];

interface Props {
  collapsed: boolean;
  onToggle: () => void;
}

export default function ContractorSidebar({ collapsed, onToggle }: Props) {
  const { signOut } = useAuth();
  const { hubUser } = useHubAuth();
  const navigate = useNavigate();

  const isProjectBased = hubUser?.payment_type === 'project_based';
  const filteredBase = isProjectBased
    ? baseNavItems.filter(i => !['My Attendance', 'Time-Off', 'Overtime', 'Requests'].includes((i as any).label))
    : baseNavItems;
  const dividerIdx = filteredBase.findIndex(i => (i as any).divider);
  const navItems = [
    ...filteredBase.slice(0, dividerIdx),
    { to: '/hub/contractor/projects', label: 'My Work', icon: 'ri-folder-line' },
    ...filteredBase.slice(dividerIdx),
  ];

  const handleSignOut = async () => {
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
            className={`w-10 h-10 rounded-2xl bg-[#FF6B35] text-white flex items-center justify-center shadow-sm flex-shrink-0 ${collapsed ? 'cursor-pointer hover:bg-[#e55a27] transition-colors' : ''}`}
          >
            <img src="/s-logo.png" alt="S" className="w-6 h-6 object-contain" style={{ filter: 'invert(1)' }} />
          </div>
          {!collapsed && (
            <>
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold truncate">FS Architects</p>
                <p className="text-[16px] font-semibold text-gray-800 leading-none">Sentro</p>
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
          {navItems.map((item, idx) => {
            if ((item as any).divider) {
              return !collapsed ? (
                <div key={idx} className="pt-4 pb-2 px-3">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400/70">{item.label}</p>
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
                      ? 'bg-white/70 text-[#FF6B35] shadow-sm shadow-orange-100/60'
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
          {!collapsed && hubUser ? (
            <div className="flex items-center gap-2.5 px-2 py-1 min-w-0">
              {hubUser.avatar_url ? (
                <img src={hubUser.avatar_url} alt={hubUser.full_name} className="w-7 h-7 rounded-full object-cover object-top flex-shrink-0" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-[#FF6B35] flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-bold text-white">{hubUser.full_name.charAt(0)}</span>
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-800 truncate leading-tight">{hubUser.full_name}</p>
                <p className="text-[11px] text-gray-400 truncate">{hubUser.department ?? 'Contractor'}</p>
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
