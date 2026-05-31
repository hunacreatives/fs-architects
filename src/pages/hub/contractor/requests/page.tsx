import { useEffect, useState } from 'react';
import ContractorLayout from '@/pages/hub/components/ContractorLayout';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { HubRequest } from '@/lib/types';

const statusColors: Record<string, string> = {
  open: 'bg-amber-100 text-amber-700',
  in_review: 'bg-sky-100 text-sky-700',
  resolved: 'bg-emerald-100 text-emerald-700',
  closed: 'bg-gray-100 text-gray-500',
};
const typeLabels: Record<string, string> = {
  reimbursement: 'Reimbursement',
  account_access: 'Account Access',
  hr_concern: 'HR Concern',
  schedule: 'Schedule Adj.',
  equipment: 'Equipment/Software',
  client_reassignment: 'Client Reassignment',
};

const emptyForm = { title: '', description: '', type: 'reimbursement' };

export default function ContractorRequestsPage() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<HubRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<HubRequest | null>(null);
  const [toast, setToast] = useState('');

  const fetchRequests = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase.from('hub_requests').select('*').eq('contractor_id', user.id).order('created_at', { ascending: false });
    setRequests((data as HubRequest[]) ?? []);
    setLoading(false);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchRequests(); }, [user]);

  const submit = async () => {
    if (!form.title.trim() || !user) return;
    setSaving(true);
    await supabase.from('hub_requests').insert({ ...form, contractor_id: user.id, status: 'open' });
    setSaving(false);
    setShowModal(false);
    setForm(emptyForm);
    setToast('Request submitted successfully.');
    setTimeout(() => setToast(''), 3000);
    supabase.functions.invoke('notify-admin', {
      body: { type: 'request_submitted', data: { contractor_name: user.full_name, request_type: form.type, title: form.title } },
    }).catch(() => {});
    fetchRequests();
  };

  return (
    <ContractorLayout title="Requests">
      {toast && (
        <div className="fixed top-5 right-5 z-[60] bg-gray-900 text-white text-sm px-4 py-2.5 rounded-lg shadow-lg">{toast}</div>
      )}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">{requests.length} total request{requests.length !== 1 ? 's' : ''}</p>
          <button onClick={() => setShowModal(true)} className="flex items-center gap-1.5 px-4 py-2 bg-[#111827] text-white text-sm rounded-lg hover:bg-gray-800 transition-colors cursor-pointer whitespace-nowrap">
            <i className="ri-add-line"></i> New Request
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><i className="ri-loader-4-line animate-spin text-xl text-gray-400"></i></div>
        ) : requests.length === 0 ? (
          <div className="bg-white border border-gray-100 rounded-xl p-10 text-center">
            <i className="ri-inbox-line text-3xl text-gray-200 mb-2 block"></i>
            <p className="text-sm text-gray-400">No requests yet</p>
            <button onClick={() => setShowModal(true)} className="mt-3 text-sm text-[#FF6B35] hover:underline cursor-pointer">Create your first request</button>
          </div>
        ) : (
          <div className="space-y-2">
            {requests.map((r) => (
              <div key={r.id} className="bg-white border border-gray-100 rounded-xl p-4 cursor-pointer hover:border-gray-200 transition-colors" onClick={() => setSelected(r)}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[#111827]">{r.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{typeLabels[r.type] || r.type} · {new Date(r.created_at!).toLocaleDateString()}</p>
                    {r.description && <p className="text-sm text-gray-500 mt-1.5 line-clamp-1">{r.description}</p>}
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap capitalize flex-shrink-0 ${statusColors[r.status]}`}>{r.status.replace('_', ' ')}</span>
                </div>
                {r.admin_notes && (
                  <div className="mt-2 pt-2 border-t border-gray-50">
                    <p className="text-xs text-gray-500"><span className="font-medium text-gray-700">Admin: </span>{r.admin_notes}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="font-semibold text-[#111827]">New Request</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 cursor-pointer w-7 h-7 flex items-center justify-center">
                <i className="ri-close-line text-lg"></i>
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-700">Request Type</label>
                <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none bg-white">
                  {Object.entries(typeLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-700">Subject *</label>
                <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Brief subject of your request..."
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/30 focus:border-[#FF6B35]" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-700">Details</label>
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={4}
                  placeholder="Describe your request in detail..." maxLength={500}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/30 focus:border-[#FF6B35] resize-none" />
              </div>
            </div>
            <div className="flex gap-2 p-5 pt-0">
              <button onClick={() => setShowModal(false)} className="flex-1 py-2.5 text-sm border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 cursor-pointer whitespace-nowrap">Cancel</button>
              <button onClick={submit} disabled={saving || !form.title.trim()}
                className="flex-1 py-2.5 text-sm bg-[#111827] text-white rounded-lg hover:bg-gray-800 disabled:opacity-40 cursor-pointer transition-colors whitespace-nowrap">
                {saving ? 'Submitting...' : 'Submit Request'}
              </button>
            </div>
          </div>
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="font-semibold text-[#111827] truncate pr-4">{selected.title}</h2>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 cursor-pointer w-7 h-7 flex items-center justify-center flex-shrink-0">
                <i className="ri-close-line text-lg"></i>
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div className="flex gap-2 flex-wrap">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${statusColors[selected.status]}`}>{selected.status.replace('_', ' ')}</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{typeLabels[selected.type]}</span>
              </div>
              {selected.description && <p className="text-sm text-gray-600">{selected.description}</p>}
              {selected.admin_notes && (
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs font-medium text-gray-700 mb-1">Admin Response</p>
                  <p className="text-sm text-gray-600">{selected.admin_notes}</p>
                </div>
              )}
              <p className="text-xs text-gray-400">Submitted {new Date(selected.created_at!).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
            </div>
          </div>
        </div>
      )}
    </ContractorLayout>
  );
}
