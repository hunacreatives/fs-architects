import { useEffect, useState } from 'react';
import AdminLayout from '@/pages/hub/components/AdminLayout';
import { supabase } from '@/lib/supabase';
import { HubAuditLog, HubUser } from '@/lib/types';
import { useDemo } from '@/contexts/DemoContext';

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

  if (isDemo) return (
    <AdminLayout>
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-gray-400">
        <i className="ri-lock-2-line text-3xl opacity-40"></i>
        <p className="text-sm font-medium">Not available in demo</p>
        <p className="text-xs text-gray-300">This section requires a live account.</p>
      </div>
    </AdminLayout>
  );

  const [logs, setLogs] = useState<HubAuditLog[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const perPage = 30;

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
    const [{ data }, { count }] = await Promise.all([q, countQ]);
    setLogs((data as HubAuditLog[]) ?? []);
    setTotalCount(count ?? 0);
    setLoading(false);
  };

  useEffect(() => { fetchLogs(); }, [actionFilter, page]);

  const filtered = logs.filter((l) =>
    !search || l.description?.toLowerCase().includes(search.toLowerCase()) || l.entity_type?.toLowerCase().includes(search.toLowerCase())
  );

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

  return (
    <AdminLayout title="Audit Log">
      <div className="space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search logs..."
              className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]" />
          </div>
          <div className="flex gap-1 bg-gray-100 p-1 rounded-lg flex-wrap">
            {['all', 'create', 'update', 'delete', 'approve', 'upload'].map((a) => (
              <button key={a} onClick={() => { setActionFilter(a); setPage(0); }}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer whitespace-nowrap capitalize ${actionFilter === a ? 'bg-white text-[#111827] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                {a === 'all' ? 'All' : a}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
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
                            <img src={user.avatar_url || ''} alt="" className="w-5 h-5 rounded-full object-cover object-top" />
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

        <div className="flex items-center justify-between pt-1">
          <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 cursor-pointer transition-colors whitespace-nowrap">
            <i className="ri-arrow-left-line text-xs"></i> Previous
          </button>
          <span className="text-xs text-gray-400">Page {page + 1} of {Math.ceil(totalCount / perPage) || 1} · {totalCount} total</span>
          <button onClick={() => setPage(page + 1)} disabled={logs.length < perPage}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 cursor-pointer transition-colors whitespace-nowrap">
            Next <i className="ri-arrow-right-line text-xs"></i>
          </button>
        </div>
      </div>
    </AdminLayout>
  );
}