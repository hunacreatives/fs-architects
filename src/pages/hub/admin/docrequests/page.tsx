import { useState, useEffect, useRef } from 'react';
import AdminLayout from '@/pages/hub/components/AdminLayout';
import { supabase } from '@/lib/supabase';
import { HubDocRequest } from '@/lib/types';
import { useDemo } from '@/contexts/DemoContext';

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  in_progress: 'bg-slate-100 text-[#1c2b3a]',
  completed: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-600',
};

const DOC_TYPES = [
  'Certificate of Employment',
  'Employment Contract Copy',
  'Certificate of Compensation',
  'Payroll Summary',
  'Work Clearance Certificate',
  'Project Assignment Letter',
  'Service Record',
  'NDA Copy',
  'Other',
];

interface ReviewModalProps {
  req: HubDocRequest;
  onClose: () => void;
  onSaved: () => void;
}

function ReviewModal({ req, onClose, onSaved }: ReviewModalProps) {
  const [status, setStatus] = useState(req.status);
  const [adminNotes, setAdminNotes] = useState(req.admin_notes || '');
  const [fileName, setFileName] = useState(req.file_name || '');
  const [fileUrl, setFileUrl] = useState(req.file_url || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await supabase.from('hub_doc_requests').update({
      status,
      admin_notes: adminNotes || null,
      file_name: fileName || null,
      file_url: fileUrl || null,
      updated_at: new Date().toISOString(),
    }).eq('id', req.id);
    setSaving(false);
    onSaved();
  };

  const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]';

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="bg-white rounded-xl w-full max-w-lg">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Review Document Request</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 cursor-pointer w-6 h-6 flex items-center justify-center">
            <i className="ri-close-line text-lg"></i>
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="bg-gray-50 rounded-lg p-4 space-y-2">
            <div className="flex items-center gap-2">
              <i className="ri-file-text-line text-[#1c2b3a]"></i>
              <span className="font-medium text-gray-800 text-sm">{req.doc_type}</span>
            </div>
            <p className="text-xs text-gray-500">Requested by: <span className="font-medium text-gray-700">{(req.hub_users as any)?.full_name}</span></p>
            {req.notes && <p className="text-sm text-gray-600 mt-1">{req.notes}</p>}
            <p className="text-xs text-gray-400">{new Date(req.created_at!).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
            <select className={inputCls} value={status} onChange={e => setStatus(e.target.value as HubDocRequest['status'])}>
              <option value="pending">Pending</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Admin Notes</label>
            <textarea
              className={`${inputCls} resize-none`}
              rows={3}
              value={adminNotes}
              onChange={e => setAdminNotes(e.target.value)}
              placeholder="Add notes for the employee..."
              maxLength={500}
            />
          </div>

          <div className="border-t border-gray-100 pt-3">
            <p className="text-xs font-medium text-gray-600 mb-2">Upload Document Link</p>
            <div className="space-y-2">
              <input type="text" className={inputCls} placeholder="File name (e.g. Carlos_COE.pdf)" value={fileName} onChange={e => setFileName(e.target.value)} />
              <input type="text" className={inputCls} placeholder="File URL or download link" value={fileUrl} onChange={e => setFileUrl(e.target.value)} />
            </div>
          </div>

          <div className="flex gap-3 pt-1">
            <button onClick={onClose} className="flex-1 border border-gray-200 text-gray-600 rounded-lg py-2 text-sm hover:bg-gray-50 transition-colors cursor-pointer whitespace-nowrap">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="flex-1 bg-[#1c2b3a] text-white rounded-lg py-2 text-sm font-medium hover:bg-[#e55a24] transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50">
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdminDocRequestsPage() {
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

  const [requests, setRequests] = useState<HubDocRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [search, setSearch] = useState('');
  const [reviewing, setReviewing] = useState<HubDocRequest | null>(null);
  const [toast, setToast] = useState('');
  const toastRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { fetchRequests(); }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    if (toastRef.current) clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(''), 3000);
  };

  const fetchRequests = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('hub_doc_requests')
      .select('*, hub_users!contractor_id(full_name, avatar_url, department)')
      .order('created_at', { ascending: false });
    setRequests((data as HubDocRequest[]) ?? []);
    setLoading(false);
  };

  const filtered = requests.filter(r => {
    const user = r.hub_users as any;
    const matchSearch = !search || user?.full_name?.toLowerCase().includes(search.toLowerCase()) || r.doc_type.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === 'all' || r.status === filterStatus;
    const matchType = filterType === 'all' || r.doc_type === filterType;
    return matchSearch && matchStatus && matchType;
  });

  const pendingCount = requests.filter(r => r.status === 'pending').length;
  const inProgressCount = requests.filter(r => r.status === 'in_progress').length;

  return (
    <AdminLayout>
      {toast && (
        <div className="fixed top-5 right-5 z-50 bg-gray-900 text-white text-sm px-4 py-2.5 rounded-lg shadow-lg">
          {toast}
        </div>
      )}

      <div className="space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Document Requests</h1>
            <p className="text-sm text-gray-500 mt-0.5">Review and fulfil contractor document requests</p>
          </div>
          <div className="flex items-center gap-2">
            {pendingCount > 0 && (
              <span className="bg-amber-100 text-amber-700 text-xs font-semibold px-3 py-1.5 rounded-full">
                {pendingCount} pending
              </span>
            )}
            {inProgressCount > 0 && (
              <span className="bg-slate-100 text-[#1c2b3a] text-xs font-semibold px-3 py-1.5 rounded-full">
                {inProgressCount} in progress
              </span>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <div className="relative">
            <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
            <input type="text" placeholder="Search..." className="pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 w-48" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none bg-white cursor-pointer" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="all">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="rejected">Rejected</option>
          </select>
          <select className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none bg-white cursor-pointer" value={filterType} onChange={e => setFilterType(e.target.value)}>
            <option value="all">All Types</option>
            {DOC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-gray-400 text-sm">Loading requests…</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center">
              <i className="ri-file-list-3-line text-3xl text-gray-300 mb-2 block"></i>
              <p className="text-gray-400 text-sm">No document requests found.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    {['Employee','Document Type','Notes','Status','File','Requested','Actions'].map(h => (
                      <th key={h} className="text-left text-xs text-gray-400 font-medium px-4 py-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => {
                    const user = r.hub_users as any;
                    return (
                      <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 flex items-center justify-center rounded-full bg-[#1c2b3a]/10 flex-shrink-0">
                              <span className="text-xs font-semibold text-[#1c2b3a]">{user?.full_name?.charAt(0)}</span>
                            </div>
                            <span className="font-medium text-gray-800 whitespace-nowrap">{user?.full_name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-gray-700 whitespace-nowrap">{r.doc_type}</span>
                        </td>
                        <td className="px-4 py-3 max-w-[200px]">
                          <span className="text-gray-500 text-xs line-clamp-2">{r.notes || '—'}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${STATUS_COLORS[r.status]}`}>
                            {r.status.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {r.file_url ? (
                            <a href={r.file_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-[#1c2b3a] hover:underline whitespace-nowrap cursor-pointer">
                              <i className="ri-download-2-line"></i>
                              {r.file_name || 'Download'}
                            </a>
                          ) : (
                            <span className="text-gray-400 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                          {new Date(r.created_at!).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => setReviewing(r)}
                            className="text-xs bg-gray-100 hover:bg-[#1c2b3a] hover:text-white text-gray-600 px-3 py-1 rounded-md transition-colors cursor-pointer whitespace-nowrap"
                          >
                            Review
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {reviewing && (
        <ReviewModal
          req={reviewing}
          onClose={() => setReviewing(null)}
          onSaved={() => { setReviewing(null); fetchRequests(); showToast('Request updated!'); }}
        />
      )}
    </AdminLayout>
  );
}