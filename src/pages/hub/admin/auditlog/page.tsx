import { useEffect, useState } from 'react';
import AdminLayout from '@/pages/hub/components/AdminLayout';
import { supabase } from '@/lib/supabase';
import { HubAuditLog, HubUser } from '@/lib/types';
import { useDemo } from '@/contexts/DemoContext';
import HubAvatar from '@/pages/hub/components/HubAvatar';
import { useHubAuth as useAuth } from '@/hooks/useHubAuth';

const actionColors: Record<string, string> = {
  create: 'bg-emerald-100 text-emerald-700',
  update: 'bg-sky-100 text-sky-700',
  delete: 'bg-rose-100 text-rose-700',
  approve: 'bg-purple-100 text-purple-700',
  reject: 'bg-slate-100 text-[#1c2b3a]',
  upload: 'bg-amber-100 text-amber-700',
  login: 'bg-gray-100 text-gray-600',
};
const actionIcons: Record<string, string> = {
  create: 'ri-add-circle-line',
  update: 'ri-edit-line',
  delete: 'ri-delete-bin-line',
  approve: 'ri-checkbox-circle-line',
  reject: 'ri-close-circle-line',
  upload: 'ri-upload-line',
  login: 'ri-login-box-line',
};

export default function AuditLogPage() {
  const { isDemo } = useDemo();
  const { hubUser } = useAuth();

  const [logs, setLogs] = useState<HubAuditLog[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const perPage = 30;

  // Notifications archive — a retained, monthly view of the CURRENT user's own
  // notifications only (not a shared feed of every admin/owner/HR recipient).
  const [view, setView] = useState<'activity' | 'notifications'>('activity');
  const [notifs, setNotifs] = useState<any[]>([]);
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifPage, setNotifPage] = useState(0);
  const [notifTotal, setNotifTotal] = useState(0);

  const fetchNotifications = async () => {
    if (!hubUser?.id) { setNotifs([]); setNotifTotal(0); return; }
    setNotifLoading(true);
    let q = supabase
      .from('hub_notifications')
      .select('*', { count: 'exact' })
      .eq('user_id', hubUser.id)
      .order('created_at', { ascending: false })
      .range(notifPage * perPage, (notifPage + 1) * perPage - 1);
    const term = search.trim();
    if (term) {
      const escaped = term.replace(/[%,]/g, ' ');
      q = q.or(`title.ilike.%${escaped}%,body.ilike.%${escaped}%,type.ilike.%${escaped}%`);
    }
    const { data, count } = await q;
    setNotifs(data ?? []);
    setNotifTotal(count ?? 0);
    setNotifLoading(false);
  };

  const fetchLogs = async () => {
    setLoading(true);
    let countQ = supabase.from('hub_audit_log').select('*', { count: 'exact', head: true });
    let q = supabase
      .from('hub_audit_log')
      .select('*, hub_users(full_name, avatar_url, role)')
      .order('created_at', { ascending: false })
      .range(page * perPage, (page + 1) * perPage - 1);
    if (actionFilter !== 'all') {
      q = q.eq('action', actionFilter);
      countQ = countQ.eq('action', actionFilter);
    }
    const term = search.trim();
    if (term) {
      // Search the whole log on the server, not just the current page.
      const escaped = term.replace(/[%,]/g, ' ');
      const filter = `description.ilike.%${escaped}%,entity_type.ilike.%${escaped}%`;
      q = q.or(filter);
      countQ = countQ.or(filter);
    }
    const [{ data }, { count }] = await Promise.all([q, countQ]);
    setLogs((data as HubAuditLog[]) ?? []);
    setTotalCount(count ?? 0);
    setLoading(false);
  };

  useEffect(() => { if (view === 'activity') fetchLogs(); }, [actionFilter, page, view]);
  useEffect(() => { if (view === 'notifications') fetchNotifications(); }, [notifPage, view, hubUser?.id]);

  // Debounce search and reset to the first page when the term changes.
  useEffect(() => {
    const t = setTimeout(() => {
      if (view === 'activity') {
        if (page !== 0) setPage(0); else fetchLogs();
      } else {
        if (notifPage !== 0) setNotifPage(0); else fetchNotifications();
      }
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const notifTypeColors: Record<string, string> = {
    undertime: 'bg-amber-100 text-amber-700',
    timeoff: 'bg-sky-100 text-sky-700',
    payroll_approved: 'bg-emerald-100 text-emerald-700',
    undertime_alert: 'bg-amber-100 text-amber-700',
    time_off: 'bg-sky-100 text-sky-700',
    overtime: 'bg-amber-100 text-amber-700',
    credential_request: 'bg-sky-100 text-sky-700',
    doc_request: 'bg-sky-100 text-sky-700',
    contract_signed: 'bg-slate-100 text-[#1c2b3a]',
    payment_verified: 'bg-emerald-100 text-emerald-700',
    request_submitted: 'bg-sky-100 text-sky-700',
  };
  const monthLabel = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const notifGroups: { month: string; items: any[] }[] = [];
  for (const n of notifs) {
    const m = monthLabel(n.created_at);
    let g = notifGroups.find((x) => x.month === m);
    if (!g) { g = { month: m, items: [] }; notifGroups.push(g); }
    g.items.push(n);
  }

  const filtered = logs;

  const timeAgo = (date: string) => {
    const diff = Date.now() - new Date(date).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  if (isDemo) return (
    <AdminLayout>
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-gray-400">
        <i className="ri-lock-2-line text-3xl opacity-40"></i>
        <p className="text-sm font-medium">Not available in demo</p>
        <p className="text-xs text-gray-300">This section requires a live account.</p>
      </div>
    </AdminLayout>
  );

  return (
    <AdminLayout title="Audit Log">
      <div className="space-y-4">
        {/* View toggle: activity log vs retained notifications archive */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
          {([['activity', 'Activity Log'], ['notifications', 'Notifications']] as const).map(([v, label]) => (
            <button key={v} onClick={() => setView(v)}
              className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${view === v ? 'bg-white text-[#111827] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={view === 'activity' ? 'Search logs...' : 'Search notifications...'}
              className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]" />
          </div>
          {view === 'activity' && (
            <div className="flex gap-1 bg-gray-100 p-1 rounded-lg flex-wrap">
              {['all', 'create', 'update', 'delete', 'approve', 'reject', 'upload', 'login'].map((a) => (
                <button key={a} onClick={() => { setActionFilter(a); setPage(0); }}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer whitespace-nowrap capitalize ${actionFilter === a ? 'bg-white text-[#111827] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                  {a === 'all' ? 'All' : a}
                </button>
              ))}
            </div>
          )}
        </div>

        {view === 'notifications' ? (
          notifLoading ? (
            <div className="flex justify-center py-12"><i className="ri-loader-4-line animate-spin text-xl text-gray-400"></i></div>
          ) : notifs.length === 0 ? (
            <div className="bg-white border border-gray-100 rounded-xl p-10 text-center">
              <i className="ri-notification-3-line text-3xl text-gray-200 mb-2 block"></i>
              <p className="text-sm text-gray-400">No notifications found</p>
            </div>
          ) : (
            <div className="space-y-4">
              {notifGroups.map((group) => (
                <div key={group.month}>
                  <div className="flex items-center gap-2 mb-2 px-1">
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{group.month}</h3>
                    <span className="text-[10px] text-gray-400">{group.items.length} notification{group.items.length !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
                    <div className="divide-y divide-gray-50">
                      {group.items.map((n) => (
                        <div key={n.id} className="flex items-start gap-3 px-5 py-3.5 hover:bg-gray-50/50 transition-colors">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              {n.type && <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${notifTypeColors[n.type] || 'bg-slate-100 text-slate-600'}`}>{String(n.type).replace(/_/g, ' ')}</span>}
                              {!n.read && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-sky-50 text-sky-600 font-medium">unread</span>}
                            </div>
                            <p className="text-sm text-gray-800 mt-0.5">{n.title}</p>
                            {n.body && <p className="text-xs text-gray-500 mt-0.5">{n.body}</p>}
                          </div>
                          <span className="text-xs text-gray-400 whitespace-nowrap flex-shrink-0">{new Date(n.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : loading ? (
          <div className="flex justify-center py-12"><i className="ri-loader-4-line animate-spin text-xl text-gray-400"></i></div>
        ) : filtered.length === 0 ? (
          <div className="bg-white border border-gray-100 rounded-xl p-10 text-center">
            <i className="ri-history-line text-3xl text-gray-200 mb-2 block"></i>
            <p className="text-sm text-gray-400">No audit logs found</p>
          </div>
        ) : (
          <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
            <div className="divide-y divide-gray-50">
              {filtered.map((log) => {
                const user = log.hub_users as HubUser;
                return (
                  <div key={log.id} className="flex items-start gap-4 px-5 py-4 hover:bg-gray-50/50 transition-colors">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${actionColors[log.action] || 'bg-gray-100 text-gray-500'}`}>
                      <i className={`${actionIcons[log.action] || 'ri-history-line'} text-sm`}></i>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {user && (
                          <div className="flex items-center gap-1.5">
                            <HubAvatar fullName={user.full_name ?? ''} avatarUrl={user.avatar_url} size="w-5 h-5" />
                            <span className="text-sm font-medium text-[#111827]">{user.full_name}</span>
                          </div>
                        )}
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium capitalize ${actionColors[log.action]}`}>{log.action}</span>
                        {log.entity_type && <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 capitalize">{log.entity_type.replace('_', ' ')}</span>}
                      </div>
                      {log.description && <p className="text-sm text-gray-600 mt-0.5">{log.description}</p>}
                    </div>
                    <span className="text-xs text-gray-400 whitespace-nowrap flex-shrink-0">{timeAgo(log.created_at!)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {(() => {
          const curPage = view === 'activity' ? page : notifPage;
          const setCur = view === 'activity' ? setPage : setNotifPage;
          const total = view === 'activity' ? totalCount : notifTotal;
          const pageCount = view === 'activity' ? logs.length : notifs.length;
          return (
            <div className="flex items-center justify-between pt-1">
              <button onClick={() => setCur(Math.max(0, curPage - 1))} disabled={curPage === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 cursor-pointer transition-colors whitespace-nowrap">
                <i className="ri-arrow-left-line text-xs"></i> Previous
              </button>
              <span className="text-xs text-gray-400">Page {curPage + 1} of {Math.ceil(total / perPage) || 1} · {total} total</span>
              <button onClick={() => setCur(curPage + 1)} disabled={pageCount < perPage}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 cursor-pointer transition-colors whitespace-nowrap">
                Next <i className="ri-arrow-right-line text-xs"></i>
              </button>
            </div>
          );
        })()}
      </div>
    </AdminLayout>
  );
}