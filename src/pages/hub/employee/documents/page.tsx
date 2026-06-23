import { useState, useEffect, useRef, FormEvent } from 'react';
import ContractorLayout from '@/pages/hub/components/ContractorLayout';
import { supabase } from '@/lib/supabase';
import { HubDocRequest, HubSignAssignment } from '@/lib/types';
import { useAuth } from '@/contexts/AuthContext';

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

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  in_progress: 'bg-slate-100 text-[#1c2b3a]',
  completed: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-600',
};

const STATUS_ICONS: Record<string, string> = {
  pending: 'ri-time-line',
  in_progress: 'ri-loader-4-line',
  completed: 'ri-checkbox-circle-line',
  rejected: 'ri-close-circle-line',
};

export default function ContractorDocumentsPage() {
  const { hubUser } = useAuth();
  const [tab, setTab] = useState<'docs' | 'requests'>('docs');
  const [requests, setRequests] = useState<HubDocRequest[]>([]);
  const [assignments, setAssignments] = useState<HubSignAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [docType, setDocType] = useState(DOC_TYPES[0]);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const toastRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (hubUser?.id) {
      fetchRequests();
      fetchAssignments();
    }
  }, [hubUser]);

  useEffect(() => {
    return () => { if (toastRef.current) clearTimeout(toastRef.current); };
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    if (toastRef.current) clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(''), 3000);
  };

  const fetchRequests = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('hub_doc_requests')
      .select('*')
      .eq('contractor_id', hubUser!.id)
      .order('created_at', { ascending: false });
    setRequests((data as HubDocRequest[]) ?? []);
    setLoading(false);
  };

  const fetchAssignments = async () => {
    const { data } = await supabase
      .from('hub_sign_assignments')
      .select('*, hub_sign_documents(id, title, description, file_url, file_name, content, is_generated, created_at)')
      .eq('contractor_id', hubUser!.id)
      .order('created_at', { ascending: false });
    setAssignments((data as HubSignAssignment[]) ?? []);
  };

  const openDoc = (doc: any) => {
    if (doc?.is_generated && doc?.content) {
      const blob = new Blob([doc.content], { type: 'text/html' });
      window.open(URL.createObjectURL(blob), '_blank');
    } else if (doc?.file_url) {
      window.open(doc.file_url, '_blank');
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await supabase.from('hub_doc_requests').insert({
      contractor_id: hubUser!.id,
      doc_type: docType,
      notes: notes || null,
      status: 'pending',
    });
    setSubmitting(false);
    if (error) { showToast('Failed to submit. Try again.'); return; }
    supabase.functions.invoke('notify-internal-request', {
      body: { type: 'doc_request', contractor_name: hubUser!.full_name, detail: docType, notes: notes || null },
    }).catch(console.error);
    setShowForm(false);
    setNotes('');
    setDocType(DOC_TYPES[0]);
    fetchRequests();
    showToast('Document request submitted!');
  };

  const filtered = filterStatus === 'all' ? requests : requests.filter(r => r.status === filterStatus);
  const pendingCount = requests.filter(r => r.status === 'pending' || r.status === 'in_progress').length;
  const completedCount = requests.filter(r => r.status === 'completed').length;
  const pickupReadyCount = assignments.filter(a => (a as any).pickup_ready).length;

  return (
    <ContractorLayout title="Documents">
      {toast && (
        <div className="fixed top-5 right-5 z-50 bg-gray-900 text-white text-sm px-4 py-2.5 rounded-lg shadow-lg">
          {toast}
        </div>
      )}

      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          {tab === 'requests' && (
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 bg-[#1c2b3a] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#e55a24] transition-colors cursor-pointer whitespace-nowrap"
            >
              <i className="ri-add-line"></i>
              Request Document
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
          <button
            onClick={() => setTab('docs')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${tab === 'docs' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <i className="ri-file-text-line"></i>
            My Documents
            {pickupReadyCount > 0 && (
              <span className="w-4 h-4 bg-emerald-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">{pickupReadyCount}</span>
            )}
          </button>
          <button
            onClick={() => setTab('requests')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${tab === 'requests' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <i className="ri-file-list-3-line"></i>
            Doc Requests
          </button>
        </div>

        {/* --- MY DOCUMENTS TAB --- */}
        {tab === 'docs' && (() => {
          if (assignments.length === 0) return (
            <div className="bg-white rounded-xl border border-gray-100 py-14 text-center">
              <i className="ri-file-text-line text-4xl text-gray-200 block mb-3"></i>
              <p className="text-gray-400 text-sm">No documents yet.</p>
              <p className="text-gray-300 text-xs mt-1">HR will issue your contracts and documents here.</p>
            </div>
          );

          const readyForPickup = assignments.filter(a => (a as any).pickup_ready);
          const processing = assignments.filter(a => !(a as any).pickup_ready);

          return (
            <div className="space-y-6">
              {/* Ready for pickup */}
              {readyForPickup.length > 0 && (
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Ready for Pickup</p>
                  {readyForPickup.map(a => {
                    const doc = (a as any).hub_sign_documents;
                    return (
                      <div key={a.id} className="bg-white rounded-xl border border-emerald-200 p-5 shadow-sm">
                        <div className="flex items-start gap-4">
                          <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0">
                            <i className="ri-store-2-line text-emerald-600 text-lg"></i>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-semibold text-gray-900 text-sm">{doc?.title}</p>
                              <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">Ready for Pickup</span>
                            </div>
                            {doc?.description && <p className="text-xs text-gray-400 mt-0.5">{doc.description}</p>}
                            <div className="mt-3 bg-emerald-50 rounded-lg px-4 py-3 text-xs text-emerald-800">
                              <p className="font-semibold mb-0.5">Pick up your document at:</p>
                              <p>FS Architects Office — Unit 2115 Meridian by Avenir, Golam Drive, Mabolo, Cebu City</p>
                              <p className="mt-1 text-emerald-600">Bring a valid ID. Office hours: Mon–Fri, 9AM–6PM.</p>
                            </div>
                            <button onClick={() => openDoc(doc)} className="mt-3 flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 cursor-pointer">
                              <i className="ri-eye-line"></i> View Document
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Processing */}
              {processing.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Processing</p>
                  <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-50">
                    {processing.map(a => {
                      const doc = (a as any).hub_sign_documents;
                      return (
                        <div key={a.id} className="flex items-center gap-3 px-4 py-3.5">
                          <div className="w-8 h-8 rounded-lg bg-[#1c2b3a]/10 flex items-center justify-center flex-shrink-0">
                            <i className="ri-file-text-line text-[#1c2b3a] text-sm"></i>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-700 truncate">{doc?.title}</p>
                            <p className="text-xs text-gray-400">
                              Issued {doc?.created_at ? new Date(doc.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}
                            </p>
                          </div>
                          <div className="flex items-center gap-3 flex-shrink-0">
                            <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium whitespace-nowrap">Pending Pickup</span>
                            <button onClick={() => openDoc(doc)} className="text-xs text-gray-400 hover:text-gray-600 cursor-pointer flex items-center gap-1">
                              <i className="ri-eye-line"></i> View
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* --- DOC REQUESTS TAB --- */}
        {tab === 'requests' && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {[
                { label: 'Total Requests', value: requests.length, icon: 'ri-file-list-3-line', color: 'text-gray-600', bg: 'bg-gray-50' },
                { label: 'In Progress', value: pendingCount, icon: 'ri-loader-4-line', color: 'text-amber-600', bg: 'bg-amber-50' },
                { label: 'Completed', value: completedCount, icon: 'ri-checkbox-circle-line', color: 'text-emerald-600', bg: 'bg-emerald-50' },
              ].map(card => (
                <div key={card.label} className="bg-white rounded-xl border border-gray-100 p-4 flex items-center gap-3">
                  <div className={`w-10 h-10 flex items-center justify-center rounded-xl ${card.bg}`}>
                    <i className={`${card.icon} text-xl ${card.color}`}></i>
                  </div>
                  <div>
                    <p className="text-lg font-semibold text-gray-900">{card.value}</p>
                    <p className="text-xs text-gray-500">{card.label}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-3">Available Documents</h2>
              <div className="flex flex-wrap gap-2">
                {DOC_TYPES.map(t => (
                  <span key={t} className="text-xs bg-gray-50 border border-gray-200 text-gray-600 px-3 py-1.5 rounded-full">{t}</span>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-3">Documents are processed within 1–3 business days. You&apos;ll receive a notification once ready.</p>
            </div>

            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <div className="flex items-center justify-between p-4 border-b border-gray-100">
                <h2 className="text-sm font-semibold text-gray-900">Request History</h2>
                <select
                  className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none bg-white cursor-pointer"
                  value={filterStatus}
                  onChange={e => setFilterStatus(e.target.value)}
                >
                  <option value="all">All</option>
                  <option value="pending">Pending</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>

              {loading ? (
                <div className="p-8 text-center text-gray-400 text-sm">Loading…</div>
              ) : filtered.length === 0 ? (
                <div className="p-8 text-center">
                  <i className="ri-file-list-3-line text-3xl text-gray-200 mb-2 block"></i>
                  <p className="text-gray-400 text-sm">No requests yet. Click &quot;Request Document&quot; to get started.</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {filtered.map((r) => (
                    <div key={r.id} className="p-4 hover:bg-gray-50/50 transition-colors">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="flex items-start gap-3">
                          <div className="w-9 h-9 flex items-center justify-center rounded-lg bg-[#1c2b3a]/10 mt-0.5 flex-shrink-0">
                            <i className="ri-file-text-line text-[#1c2b3a]"></i>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-800">{r.doc_type}</p>
                            {r.notes && <p className="text-xs text-gray-500 mt-0.5">{r.notes}</p>}
                            {r.admin_notes && (
                              <div className="mt-1.5 bg-gray-50 rounded-lg px-3 py-2 border-l-2 border-[#1c2b3a]">
                                <p className="text-xs text-gray-500">Admin: <span className="text-gray-700">{r.admin_notes}</span></p>
                              </div>
                            )}
                            <p className="text-xs text-gray-400 mt-1.5">
                              Submitted {new Date(r.created_at!).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <span className={`text-xs px-2.5 py-1 rounded-full font-medium flex items-center gap-1 ${STATUS_COLORS[r.status]}`}>
                            <i className={`${STATUS_ICONS[r.status]} text-xs`}></i>
                            {r.status.replace('_', ' ')}
                          </span>
                          {r.file_url && r.status === 'completed' && (
                            <a
                              href={r.file_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-xs bg-emerald-50 text-emerald-700 hover:bg-emerald-100 px-3 py-1.5 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                            >
                              <i className="ri-download-2-line"></i>
                              Download {r.file_name || 'Document'}
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Request Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center sm:p-4">
          <div className="bg-white rounded-xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">Request a Document</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600 cursor-pointer w-6 h-6 flex items-center justify-center">
                <i className="ri-close-line text-lg"></i>
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Document Type *</label>
                <select
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a] bg-white cursor-pointer"
                  value={docType}
                  onChange={e => setDocType(e.target.value)}
                  required
                >
                  {DOC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Notes / Purpose</label>
                <textarea
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a] resize-none"
                  rows={3}
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="e.g. For visa application, bank requirement..."
                  maxLength={500}
                />
              </div>
              <div className="bg-amber-50 rounded-lg px-4 py-3 text-xs text-amber-700">
                <i className="ri-information-line mr-1"></i>
                Documents are usually processed within 1–3 business days. HR will notify you once ready for pickup.
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 border border-gray-200 text-gray-600 rounded-lg py-2 text-sm hover:bg-gray-50 transition-colors cursor-pointer whitespace-nowrap">
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="flex-1 bg-[#1c2b3a] text-white rounded-lg py-2 text-sm font-medium hover:bg-[#e55a24] transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50">
                  {submitting ? 'Submitting…' : 'Submit Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </ContractorLayout>
  );
}
