import { useEffect, useState } from 'react';
import AdminLayout from '@/pages/hub/components/AdminLayout';
import { supabase } from '@/lib/supabase';
import { HubRequest, HubUser } from '@/lib/types';
import { useDemo } from '@/contexts/DemoContext';
import { DEMO_REQUESTS } from '@/lib/demoData';
import HubAvatar from '@/pages/hub/components/HubAvatar';

const typeLabels: Record<string, string> = {
  reimbursement: 'Reimbursement', account_access: 'Account Access',
  hr_concern: 'HR Concern', schedule: 'Schedule', equipment: 'Equipment', client_reassignment: 'Client Reassignment',
};
const statusColors: Record<string, string> = {
  open: 'bg-amber-100 text-amber-700', in_review: 'bg-sky-100 text-sky-700',
  resolved: 'bg-emerald-100 text-emerald-700', closed: 'bg-gray-100 text-gray-500',
};

export default function RequestsPage() {
  const { isDemo } = useDemo();
  const [requests, setRequests] = useState<HubRequest[]>([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<HubRequest | null>(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [updating, setUpdating] = useState(false);

  const fetch = async () => {
    let q = supabase.from('hub_requests').select('*, hub_users!contractor_id(full_name, avatar_url, department)').order('created_at', { ascending: false });
    if (statusFilter !== 'all') q = q.eq('status', statusFilter);
    const { data, error } = await q;
    if (error) console.error('hub_requests fetch error:', error);
    setRequests((data as HubRequest[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    if (isDemo) {
      const filtered = statusFilter === 'all' ? DEMO_REQUESTS : DEMO_REQUESTS.filter(r => r.status === statusFilter);
      setRequests(filtered);
      setLoading(false);
      return;
    }
    fetch();
  }, [isDemo, statusFilter]);

  const updateStatus = async (id: number, status: string) => {
    setUpdating(true);
    await supabase.from('hub_requests').update({ status, admin_notes: adminNotes, updated_at: new Date().toISOString() }).eq('id', id);
    setUpdating(false);
    setSelected(null);
    fetch();
  };

  return (
    <AdminLayout title="Request Center">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
            {['all', 'open', 'in_review', 'resolved', 'closed'].map((s) => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap capitalize ${statusFilter === s ? 'bg-white text-[#111827] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                {s === 'all' ? 'All' : s.replace('_', ' ')}
              </button>
            ))}
          </div>
          <span className="text-xs text-gray-400">{requests.length} request{requests.length !== 1 ? 's' : ''}</span>
        </div>

        <div className="space-y-3">
          {loading ? <div className="flex justify-center py-12"><i className="ri-loader-4-line animate-spin text-xl text-gray-400"></i></div>
            : requests.length === 0 ? <div className="bg-white border border-gray-100 rounded-xl p-10 text-center text-sm text-gray-400">No requests found</div>
            : requests.map((r) => (
              <div key={r.id} className="bg-white border border-gray-100 rounded-xl p-4 cursor-pointer hover:border-gray-200 transition-colors" onClick={() => { setSelected(r); setAdminNotes(r.admin_notes || ''); }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <HubAvatar fullName={(r.hub_users as HubUser)?.full_name ?? ''} avatarUrl={(r.hub_users as HubUser)?.avatar_url} size="w-8 h-8" className="flex-shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[#111827] truncate">{r.title}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{(r.hub_users as HubUser)?.full_name} · {typeLabels[r.type] || r.type} · {new Date(r.created_at!).toLocaleDateString()}</p>
                      {r.description && <p className="text-sm text-gray-500 mt-1.5 line-clamp-2">{r.description}</p>}
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap font-medium flex-shrink-0 capitalize ${statusColors[r.status]}`}>{r.status.replace('_', ' ')}</span>
                </div>
              </div>
            ))}
        </div>
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md space-y-4">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="font-semibold text-[#111827] truncate pr-4">{selected.title}</h2>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 cursor-pointer flex-shrink-0"><i className="ri-close-line text-lg"></i></button>
            </div>
            <div className="px-5 space-y-3">
              <div className="flex gap-2 flex-wrap">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${statusColors[selected.status]}`}>{selected.status.replace('_', ' ')}</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{typeLabels[selected.type] || selected.type}</span>
              </div>
              {selected.description && <p className="text-sm text-gray-600">{selected.description}</p>}
              {selected.attachment_url && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-gray-700">Receipt</p>
                  <div className="rounded-lg overflow-hidden border border-gray-100 bg-gray-50">
                    <iframe
                      src={selected.attachment_url.replace('/view', '/preview')}
                      className="w-full h-56"
                      allow="autoplay"
                      title="Receipt preview"
                    />
                  </div>
                  <a href={selected.attachment_url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-sky-600 hover:text-sky-700 font-medium w-fit">
                    <i className="ri-external-link-line"></i> Open in Drive
                  </a>
                </div>
              )}
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-700">Admin Notes</label>
                <textarea value={adminNotes} onChange={(e) => setAdminNotes(e.target.value)} rows={3} placeholder="Add notes..."
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a] resize-none" />
              </div>
            </div>
            <div className="flex gap-2 p-5 pt-0 flex-wrap">
              {['open', 'in_review', 'resolved', 'closed'].map((s) => (
                <button key={s} onClick={() => updateStatus(selected.id, s)} disabled={updating || selected.status === s}
                  className={`flex-1 py-2 text-xs rounded-lg transition-colors cursor-pointer whitespace-nowrap capitalize disabled:opacity-40 ${s === 'resolved' ? 'bg-emerald-500 text-white hover:bg-emerald-600' : s === selected.status ? 'border border-gray-200 text-gray-400' : 'border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                  {s.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}