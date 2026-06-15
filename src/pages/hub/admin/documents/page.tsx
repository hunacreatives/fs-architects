import { useState, useEffect, useRef } from 'react';
import AdminLayout from '@/pages/hub/components/AdminLayout';
import { supabase } from '@/lib/supabase';
import { HubSignDocument, HubSignAssignment, HubUser, HubDocRequest } from '@/lib/types';
import { useAuth } from '@/contexts/AuthContext';
import { useDemo } from '@/contexts/DemoContext';
import ContractGeneratorModal from './ContractGeneratorModal';
import COEGeneratorModal from './COEGeneratorModal';

const DR_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  in_progress: 'bg-slate-100 text-[#1c2b3a]',
  completed: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-600',
};

const DOC_TYPES = [
  'Certificate of Engagement', 'Agreement Copy', 'NDA Copy', 'Payment Summary',
  'Work Completion Certificate', 'Client Assignment Letter', 'Clearance Certificate', 'Other',
];

function ReviewModal({ req, onClose, onSaved }: { req: HubDocRequest; onClose: () => void; onSaved: () => void }) {
  const [status, setStatus] = useState(req.status);
  const [adminNotes, setAdminNotes] = useState(req.admin_notes || '');
  const [fileName, setFileName] = useState(req.file_name || '');
  const [fileUrl, setFileUrl] = useState(req.file_url || '');
  const [saving, setSaving] = useState(false);
  const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]';

  const handleSave = async () => {
    setSaving(true);
    await supabase.from('hub_doc_requests').update({ status, admin_notes: adminNotes || null, file_name: fileName || null, file_url: fileUrl || null, updated_at: new Date().toISOString() }).eq('id', req.id);
    setSaving(false);
    onSaved();
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="bg-white rounded-xl w-full max-w-lg">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Review Document Request</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 cursor-pointer w-6 h-6 flex items-center justify-center"><i className="ri-close-line text-lg"></i></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="bg-gray-50 rounded-lg p-4 space-y-2">
            <div className="flex items-center gap-2"><i className="ri-file-text-line text-[#1c2b3a]"></i><span className="font-medium text-gray-800 text-sm">{req.doc_type}</span></div>
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
            <textarea className={`${inputCls} resize-none`} rows={3} value={adminNotes} onChange={e => setAdminNotes(e.target.value)} placeholder="Add notes for the employee…" maxLength={500} />
          </div>
          <div className="border-t border-gray-100 pt-3">
            <p className="text-xs font-medium text-gray-600 mb-2">Upload Document Link</p>
            <div className="space-y-2">
              <input type="text" className={inputCls} placeholder="File name (e.g. Carlos_COE.pdf)" value={fileName} onChange={e => setFileName(e.target.value)} />
              <input type="text" className={inputCls} placeholder="File URL or download link" value={fileUrl} onChange={e => setFileUrl(e.target.value)} />
            </div>
          </div>
          <div className="flex gap-3 pt-1">
            <button onClick={onClose} className="flex-1 border border-gray-200 text-gray-600 rounded-lg py-2 text-sm hover:bg-gray-50 cursor-pointer">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="flex-1 bg-[#1c2b3a] text-white rounded-lg py-2 text-sm font-medium hover:bg-[#e55a24] cursor-pointer disabled:opacity-50">{saving ? 'Saving…' : 'Save Changes'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdminDocumentsPage() {
  const { hubUser } = useAuth();
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
  const [docs, setDocs] = useState<HubSignDocument[]>([]);
  const [contractors, setContractors] = useState<HubUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [showGenerator, setShowGenerator] = useState(false);
  const [showCOE, setShowCOE] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<HubSignDocument | null>(null);
  const [assignments, setAssignments] = useState<HubSignAssignment[]>([]);
  const [toast, setToast] = useState('');
  const toastRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [uploadingToDrive, setUploadingToDrive] = useState<string | null>(null);

  // Tab
  const [activeTab, setActiveTab] = useState<'contracts' | 'docrequests'>('contracts');

  // Doc Requests
  const [docRequests, setDocRequests] = useState<HubDocRequest[]>([]);
  const [drLoading, setDrLoading] = useState(false);
  const [drFilterStatus, setDrFilterStatus] = useState('all');
  const [drFilterType, setDrFilterType] = useState('all');
  const [drSearch, setDrSearch] = useState('');
  const [reviewing, setReviewing] = useState<HubDocRequest | null>(null);

  // Signing for admins who also have documents assigned to them
  const [myAssignments, setMyAssignments] = useState<any[]>([]);
  const [signModal, setSignModal] = useState<any | null>(null);
  const [signName, setSignName] = useState('');
  const [signing, setSigning] = useState(false);

  // Upload form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [selectedContractors, setSelectedContractors] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    if (toastRef.current) clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(''), 3500);
  };

  useEffect(() => {
    fetchDocs();
    fetchContractors();
    fetchDocRequests();
    if (hubUser?.id) fetchMyAssignments();
  }, [hubUser]);

  const fetchDocRequests = async () => {
    setDrLoading(true);
    const { data } = await supabase
      .from('hub_doc_requests')
      .select('*, hub_users(full_name, avatar_url, department)')
      .order('created_at', { ascending: false });
    setDocRequests((data as HubDocRequest[]) ?? []);
    setDrLoading(false);
  };

  const deleteDoc = async (docId: string) => {
    await supabase.from('hub_sign_assignments').delete().eq('document_id', docId);
    await supabase.from('hub_sign_documents').delete().eq('id', docId);
    setConfirmDeleteId(null);
    if (selectedDoc?.id === docId) setSelectedDoc(null);
    fetchDocs();
    showToast('Contract deleted.');
  };

  const fetchMyAssignments = async () => {
    const { data } = await supabase
      .from('hub_sign_assignments')
      .select('*, hub_sign_documents(id, title, description, content, file_url, is_generated, created_at)')
      .eq('contractor_id', hubUser!.id)
      .neq('status', 'signed')
      .order('created_at', { ascending: false });
    setMyAssignments(data ?? []);
  };

  const submitSign = async () => {
    if (!signModal || !signName.trim()) return;
    setSigning(true);
    const signedAt = new Date().toISOString();
    await supabase
      .from('hub_sign_assignments')
      .update({ status: 'signed', signed_name: signName.trim(), signed_at: signedAt })
      .eq('id', signModal.id);
    supabase.functions.invoke('send-signed-contract', { body: { assignment_id: signModal.id } }).catch(() => {});
    setSigning(false);
    setSignModal(null);
    setSignName('');
    fetchMyAssignments();
    fetchDocs();
    showToast('Document signed! A copy has been sent to your email.');
  };

  const fetchDocs = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('hub_sign_documents')
      .select('*, hub_sign_assignments(id, contractor_id, status, signed_at, signed_name, hub_users(full_name, avatar_url))')
      .order('created_at', { ascending: false });
    setDocs((data as HubSignDocument[]) ?? []);
    setLoading(false);
  };

  const fetchContractors = async () => {
    const { data } = await supabase
      .from('hub_users')
      .select('id, full_name, avatar_url, role, status')
      .in('role', ['contractor', 'admin'])
      .eq('status', 'active')
      .order('full_name');
    setContractors((data as HubUser[]) ?? []);
  };

  const handleUpload = async () => {
    if (!title.trim() || !file || selectedContractors.length === 0) {
      showToast('Fill in title, upload a file, and select at least one contractor.');
      return;
    }
    setUploading(true);

    const ext = file.name.split('.').pop();
    const path = `contracts/${Date.now()}_${file.name.replace(/\s+/g, '_')}`;
    const { error: upErr } = await supabase.storage.from('documents').upload(path, file, { upsert: false });
    if (upErr) {
      showToast('Upload failed: ' + upErr.message);
      setUploading(false);
      return;
    }

    const { data: { publicUrl } } = supabase.storage.from('documents').getPublicUrl(path);

    const { data: doc, error: docErr } = await supabase
      .from('hub_sign_documents')
      .insert({ title: title.trim(), description: description.trim() || null, file_url: publicUrl, file_name: file.name, uploaded_by: hubUser!.id })
      .select('id')
      .single();

    if (docErr || !doc) {
      showToast('Failed to save document.');
      setUploading(false);
      return;
    }

    const rows = selectedContractors.map(cid => ({ document_id: doc.id, contractor_id: cid }));
    await supabase.from('hub_sign_assignments').insert(rows);

    setUploading(false);
    setShowUpload(false);
    resetForm();
    fetchDocs();
    showToast('Document sent for signatures!');
  };

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setFile(null);
    setSelectedContractors([]);
  };

  const openDetail = async (doc: HubSignDocument) => {
    setSelectedDoc(doc);
    const { data } = await supabase
      .from('hub_sign_assignments')
      .select('*, hub_users(full_name, avatar_url), drive_file_id')
      .eq('document_id', doc.id)
      .order('created_at');
    setAssignments((data as HubSignAssignment[]) ?? []);
  };

  const toggleContractor = (id: string) => {
    setSelectedContractors(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const selectAll = () => setSelectedContractors(contractors.map(c => c.id));
  const clearAll = () => setSelectedContractors([]);

  const uploadAssignmentToDrive = async (assignmentId: string) => {
    setUploadingToDrive(assignmentId);
    const { data, error } = await supabase.functions.invoke('sync-contract-to-drive', {
      body: { assignment_id: assignmentId },
    });
    setUploadingToDrive(null);
    if (error || data?.error) {
      const msg = data?.error ?? error?.message ?? 'Unknown error';
      showToast(`Drive upload failed: ${msg}`);
      console.error('Drive upload error:', data?.error, error);
    } else {
      showToast('Uploaded to Google Drive.');
      setAssignments(prev => prev.map(a => a.id === assignmentId ? { ...a, drive_file_id: data?.fileId ?? 'uploaded' } : a));
    }
  };

  const signedCount = (doc: HubSignDocument) =>
    doc.hub_sign_assignments?.filter(a => a.status === 'signed').length ?? 0;
  const totalCount = (doc: HubSignDocument) =>
    doc.hub_sign_assignments?.length ?? 0;

  return (
    <AdminLayout title="Documents">
      {toast && (
        <div className="fixed top-5 right-5 z-50 bg-gray-900 text-white text-sm px-4 py-2.5 rounded-lg shadow-lg">
          {toast}
        </div>
      )}

      <div className="space-y-6">
        {/* Tab switcher */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
          {([
            { key: 'contracts', label: 'Contracts', icon: 'ri-pen-nib-line' },
            { key: 'docrequests', label: 'Doc Requests', icon: 'ri-file-list-3-line', badge: docRequests.filter(r => r.status === 'pending').length },
          ] as const).map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-all cursor-pointer whitespace-nowrap ${activeTab === tab.key ? 'bg-white text-[#111827] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              <i className={`${tab.icon} text-sm`}></i>
              {tab.label}
              {'badge' in tab && tab.badge > 0 && (
                <span className="ml-0.5 bg-amber-100 text-amber-700 text-xs font-semibold px-1.5 py-0.5 rounded-full leading-none">{tab.badge}</span>
              )}
            </button>
          ))}
        </div>

        {activeTab === 'contracts' && <>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <p className="text-sm text-gray-500">Send contracts and documents to contractors for signature.</p>
          <div className="flex gap-2">
            <button
              onClick={() => setShowUpload(true)}
              className="flex items-center gap-2 border border-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors cursor-pointer"
            >
              <i className="ri-upload-2-line"></i>
              Upload PDF
            </button>
            <button
              onClick={() => setShowCOE(true)}
              className="flex items-center gap-2 border border-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors cursor-pointer"
            >
              <i className="ri-award-line"></i>
              Generate COE
            </button>
            <button
              onClick={() => setShowGenerator(true)}
              className="flex items-center gap-2 bg-[#1c2b3a] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#0f1c28] transition-colors cursor-pointer"
            >
              <i className="ri-file-text-line"></i>
              Generate Contract
            </button>
          </div>
        </div>

        {/* Documents assigned to this admin for signing */}
        {myAssignments.length > 0 && (
          <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <i className="ri-pen-nib-line text-[#1c2b3a]/70"></i>
              <p className="text-sm font-semibold text-violet-800">You have {myAssignments.length} document{myAssignments.length > 1 ? 's' : ''} to sign</p>
            </div>
            {myAssignments.map((a: any) => {
              const doc = a.hub_sign_documents;
              return (
                <div key={a.id} className="bg-white rounded-lg border border-slate-100 p-4 flex items-center gap-4">
                  <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                    <i className="ri-file-text-line text-[#1c2b3a]/70 text-sm"></i>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{doc?.title}</p>
                    {doc?.description && <p className="text-xs text-gray-400">{doc.description}</p>}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {doc?.content && (
                      <button
                        onClick={() => { const b = new Blob([doc.content], { type: 'text/html' }); window.open(URL.createObjectURL(b), '_blank'); }}
                        className="text-xs text-gray-500 hover:text-gray-700 border border-gray-200 px-2.5 py-1.5 rounded-lg cursor-pointer"
                      >
                        <i className="ri-external-link-line mr-1"></i>Preview
                      </button>
                    )}
                    <button
                      onClick={() => { setSignModal(a); setSignName(hubUser?.full_name ?? ''); }}
                      className="text-xs font-medium bg-violet-600 text-white px-3 py-1.5 rounded-lg hover:bg-[#0f1c28] cursor-pointer"
                    >
                      <i className="ri-pen-nib-line mr-1"></i>Sign
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {loading ? (
          <div className="text-center py-12 text-gray-400 text-sm">Loading…</div>
        ) : docs.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 py-14 text-center">
            <i className="ri-file-text-line text-4xl text-gray-200 block mb-3"></i>
            <p className="text-gray-400 text-sm">No documents sent yet.</p>
            <p className="text-gray-300 text-xs mt-1">Upload a contract to get started.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    {['Document', 'Signatories', 'Progress', 'Date', ''].map(h => (
                      <th key={h} className="text-left text-xs text-gray-400 font-medium px-4 py-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {docs.map(doc => {
                    const signed = signedCount(doc);
                    const total = totalCount(doc);
                    const allSigned = total > 0 && signed === total;
                    return (
                      <>
                        <tr key={doc.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors cursor-pointer" onClick={() => openDetail(doc)}>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2.5">
                              <div className="w-7 h-7 bg-[#1c2b3a]/10 rounded-lg flex items-center justify-center flex-shrink-0">
                                <i className="ri-file-text-line text-[#1c2b3a] text-xs"></i>
                              </div>
                              <div className="min-w-0">
                                <p className="font-medium text-gray-900 truncate max-w-[220px]">{doc.title}</p>
                                {doc.description && <p className="text-xs text-gray-400 truncate max-w-[220px]">{doc.description}</p>}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-col gap-1.5">
                              {doc.hub_sign_assignments?.map(a => {
                                const u = (a as any).hub_users;
                                return (
                                  <div key={a.id} className="flex items-center gap-2">
                                    {u?.avatar_url
                                      ? <img src={u.avatar_url} alt={u.full_name} className="w-5 h-5 rounded-full object-cover object-top flex-shrink-0" />
                                      : <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold flex-shrink-0 ${a.status === 'signed' ? 'bg-emerald-500 text-white' : 'bg-gray-200 text-gray-500'}`}>{u?.full_name?.[0] ?? '?'}</div>
                                    }
                                    <span className={`text-xs truncate max-w-[140px] ${a.status === 'signed' ? 'text-emerald-600' : 'text-gray-500'}`}>{u?.full_name}</span>
                                    {a.status === 'signed'
                                      ? <i className="ri-checkbox-circle-fill text-emerald-500 text-xs flex-shrink-0"></i>
                                      : <i className="ri-time-line text-gray-300 text-xs flex-shrink-0"></i>
                                    }
                                  </div>
                                );
                              })}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-20 bg-gray-100 rounded-full h-1.5">
                                <div className={`h-1.5 rounded-full ${allSigned ? 'bg-emerald-500' : 'bg-[#1c2b3a]'}`}
                                  style={{ width: total > 0 ? `${(signed / total) * 100}%` : '0%' }} />
                              </div>
                              <span className={`text-xs font-medium ${allSigned ? 'text-emerald-600' : 'text-amber-600'}`}>
                                {signed}/{total}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                            {new Date(doc.created_at!).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </td>
                          <td className="px-4 py-3">
                            <button onClick={e => { e.stopPropagation(); setConfirmDeleteId(confirmDeleteId === doc.id ? null : doc.id); }}
                              className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors cursor-pointer"
                              title="Delete">
                              <i className="ri-delete-bin-line text-sm"></i>
                            </button>
                          </td>
                        </tr>
                        {confirmDeleteId === doc.id && (
                          <tr key={`${doc.id}-del`} className="bg-red-50">
                            <td colSpan={5} className="px-4 py-2.5" onClick={e => e.stopPropagation()}>
                              <div className="flex items-center gap-3">
                                <i className="ri-error-warning-line text-red-500 flex-shrink-0"></i>
                                <p className="text-xs text-red-700 flex-1">
                                  {doc.hub_sign_assignments?.some(a => a.status === 'signed') ? 'This contract has already been signed. ' : ''}Delete permanently?
                                </p>
                                <button onClick={() => deleteDoc(doc.id)} className="text-xs font-semibold text-red-600 hover:text-red-800 cursor-pointer px-2 py-1 rounded hover:bg-red-100">Yes, delete</button>
                                <button onClick={() => setConfirmDeleteId(null)} className="text-xs text-gray-500 cursor-pointer px-2 py-1 rounded hover:bg-gray-100">Cancel</button>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
        </>}

        {activeTab === 'docrequests' && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-3">
              <div className="relative">
                <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
                <input type="text" placeholder="Search…" className="pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 w-48" value={drSearch} onChange={e => setDrSearch(e.target.value)} />
              </div>
              <select className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none bg-white cursor-pointer" value={drFilterStatus} onChange={e => setDrFilterStatus(e.target.value)}>
                <option value="all">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
                <option value="rejected">Rejected</option>
              </select>
              <select className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none bg-white cursor-pointer" value={drFilterType} onChange={e => setDrFilterType(e.target.value)}>
                <option value="all">All Types</option>
                {DOC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            {(() => {
              const filtered = docRequests.filter(r => {
                const user = r.hub_users as any;
                const matchSearch = !drSearch || user?.full_name?.toLowerCase().includes(drSearch.toLowerCase()) || r.doc_type.toLowerCase().includes(drSearch.toLowerCase());
                return matchSearch && (drFilterStatus === 'all' || r.status === drFilterStatus) && (drFilterType === 'all' || r.doc_type === drFilterType);
              });
              return drLoading ? (
                <div className="p-8 text-center text-gray-400 text-sm">Loading requests…</div>
              ) : filtered.length === 0 ? (
                <div className="bg-white rounded-xl border border-gray-100 py-14 text-center">
                  <i className="ri-file-list-3-line text-3xl text-gray-200 block mb-3"></i>
                  <p className="text-gray-400 text-sm">No document requests found.</p>
                </div>
              ) : (
                <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b border-gray-100">
                        <tr>{['Employee','Type','Notes','Status','File','Requested',''].map(h => (
                          <th key={h} className="text-left text-xs text-gray-400 font-medium px-4 py-3">{h}</th>
                        ))}</tr>
                      </thead>
                      <tbody>
                        {filtered.map(r => {
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
                              <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{r.doc_type}</td>
                              <td className="px-4 py-3 max-w-[200px]"><span className="text-gray-500 text-xs line-clamp-2">{r.notes || '—'}</span></td>
                              <td className="px-4 py-3">
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${DR_STATUS_COLORS[r.status]}`}>{r.status.replace('_', ' ')}</span>
                              </td>
                              <td className="px-4 py-3">
                                {r.file_url ? (
                                  <a href={r.file_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-[#1c2b3a] hover:underline whitespace-nowrap cursor-pointer">
                                    <i className="ri-download-2-line"></i>{r.file_name || 'Download'}
                                  </a>
                                ) : <span className="text-gray-400 text-xs">—</span>}
                              </td>
                              <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{new Date(r.created_at!).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                              <td className="px-4 py-3">
                                <button onClick={() => setReviewing(r)} className="text-xs bg-gray-100 hover:bg-[#1c2b3a] hover:text-white text-gray-600 px-3 py-1 rounded-md transition-colors cursor-pointer whitespace-nowrap">Review</button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {reviewing && <ReviewModal req={reviewing} onClose={() => setReviewing(null)} onSaved={() => { setReviewing(null); void fetchDocRequests(); }} />}

      {/* Upload Modal */}
      {showUpload && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center sm:p-4">
          <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-gray-100 flex-shrink-0">
              <h2 className="text-base font-semibold text-gray-900">Upload Document</h2>
              <button onClick={() => { setShowUpload(false); resetForm(); }} className="text-gray-400 hover:text-gray-600 cursor-pointer">
                <i className="ri-close-line text-lg"></i>
              </button>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto flex-1">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Document Title *</label>
                <input
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="e.g. Independent Contractor Agreement 2025"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Description (optional)</label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  rows={2}
                  placeholder="Brief note about this document..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a] resize-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">File (PDF or image) *</label>
                <label className="flex items-center gap-3 border-2 border-dashed border-gray-200 rounded-lg p-4 cursor-pointer hover:border-[#1c2b3a]/40 transition-colors">
                  <i className="ri-upload-2-line text-gray-400 text-lg"></i>
                  <span className="text-sm text-gray-500">{file ? file.name : 'Click to select file…'}</span>
                  <input type="file" accept=".pdf,.png,.jpg,.jpeg" className="hidden" onChange={e => setFile(e.target.files?.[0] ?? null)} />
                </label>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-gray-600">Send to *</label>
                  <div className="flex gap-3">
                    <button onClick={selectAll} className="text-xs text-[#1c2b3a] cursor-pointer hover:underline">Select all</button>
                    <button onClick={clearAll} className="text-xs text-gray-400 cursor-pointer hover:underline">Clear</button>
                  </div>
                </div>
                <div className="border border-gray-200 rounded-lg divide-y divide-gray-50 max-h-52 overflow-y-auto">
                  {contractors.map(c => (
                    <label key={c.id} className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-gray-50">
                      <input
                        type="checkbox"
                        checked={selectedContractors.includes(c.id)}
                        onChange={() => toggleContractor(c.id)}
                        className="accent-[#1c2b3a]"
                      />
                      <img src={c.avatar_url || ''} alt="" className="w-6 h-6 rounded-full object-cover object-top bg-gray-100" />
                      <span className="text-sm text-gray-700">{c.full_name}</span>
                    </label>
                  ))}
                </div>
                {selectedContractors.length > 0 && (
                  <p className="text-xs text-gray-400 mt-1">{selectedContractors.length} selected</p>
                )}
              </div>
            </div>
            <div className="p-5 border-t border-gray-100 flex gap-3 flex-shrink-0">
              <button onClick={() => { setShowUpload(false); resetForm(); }} className="flex-1 border border-gray-200 text-gray-600 rounded-lg py-2 text-sm hover:bg-gray-50 cursor-pointer">
                Cancel
              </button>
              <button onClick={handleUpload} disabled={uploading} className="flex-1 bg-[#1c2b3a] text-white rounded-lg py-2 text-sm font-medium hover:bg-[#e55a24] cursor-pointer disabled:opacity-50">
                {uploading ? 'Uploading…' : 'Send for Signature'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {selectedDoc && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center sm:p-4">
          <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-gray-100 flex-shrink-0">
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-gray-900 truncate">{selectedDoc.title}</h2>
                {selectedDoc.description && <p className="text-xs text-gray-400 mt-0.5">{selectedDoc.description}</p>}
              </div>
              <button onClick={() => setSelectedDoc(null)} className="text-gray-400 hover:text-gray-600 cursor-pointer ml-4 flex-shrink-0">
                <i className="ri-close-line text-lg"></i>
              </button>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto flex-1">
              <a
                href={selectedDoc.is_generated && selectedDoc.content
                  ? URL.createObjectURL(new Blob([selectedDoc.content], { type: 'text/html' }))
                  : selectedDoc.file_url!}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
              >
                <div className="w-8 h-8 bg-[#1c2b3a]/10 rounded-lg flex items-center justify-center flex-shrink-0">
                  <i className="ri-file-text-line text-[#1c2b3a]"></i>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{selectedDoc.file_name || selectedDoc.title}</p>
                  <p className="text-xs text-gray-400">{selectedDoc.is_generated ? 'Generated contract — click to open' : 'Click to open'}</p>
                </div>
                <i className="ri-external-link-line text-gray-400"></i>
              </a>

              <div>
                <p className="text-xs font-medium text-gray-600 mb-2">Signature Status</p>
                <div className="space-y-2">
                  {assignments.map(a => (
                    <div key={a.id} className="flex items-center gap-3">
                      <img src={(a as any).hub_users?.avatar_url || ''} alt="" className="w-7 h-7 rounded-full object-cover object-top bg-gray-100 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-800">{(a as any).hub_users?.full_name}</p>
                        {a.status === 'signed' && a.signed_at && (
                          <p className="text-xs text-gray-400">
                            Signed as "{a.signed_name}" · {new Date(a.signed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {a.status === 'signed' && (
                          a.drive_file_id ? (
                            <span title="Saved in Google Drive" className="flex items-center gap-1 text-[10px] font-medium text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                              <i className="ri-google-fill text-xs"></i> In Drive
                            </span>
                          ) : (
                            <button
                              onClick={() => uploadAssignmentToDrive(a.id)}
                              disabled={uploadingToDrive === a.id}
                              title="Upload to Google Drive"
                              className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-300 hover:text-sky-600 hover:bg-sky-50 transition-colors cursor-pointer disabled:opacity-40"
                            >
                              {uploadingToDrive === a.id
                                ? <i className="ri-loader-4-line animate-spin text-sm"></i>
                                : <i className="ri-google-fill text-sm"></i>}
                            </button>
                          )
                        )}
                        <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${a.status === 'signed' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                          {a.status === 'signed' ? (
                            <><i className="ri-checkbox-circle-line mr-1"></i>Signed</>
                          ) : (
                            <><i className="ri-time-line mr-1"></i>Pending</>
                          )}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {showGenerator && (
        <ContractGeneratorModal
          contractors={contractors}
          onClose={() => setShowGenerator(false)}
          onDone={() => { setShowGenerator(false); fetchDocs(); showToast('Contract sent for signature!'); }}
        />
      )}
      {showCOE && (
        <COEGeneratorModal
          contractors={contractors}
          onClose={() => setShowCOE(false)}
          onDone={() => { setShowCOE(false); fetchDocs(); showToast('COE sent to employee!'); }}
        />
      )}

      {/* Sign modal for admins with pending assignments */}
      {signModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center sm:p-4">
          <div className="bg-white rounded-xl w-full max-w-md p-6 space-y-4">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Sign Document</h2>
              <p className="text-sm text-gray-500 mt-0.5">{(signModal as any).hub_sign_documents?.title}</p>
            </div>
            <div className="bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 text-xs text-amber-700">
              By typing your full name below, you are applying your electronic signature to this document.
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Full name (as signature)</label>
              <input
                type="text"
                value={signName}
                onChange={e => setSignName(e.target.value)}
                placeholder="Type your full name"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 focus:border-violet-400"
              />
            </div>
            <div className="flex gap-3 pt-1">
              <button onClick={() => setSignModal(null)} className="flex-1 border border-gray-200 text-gray-600 rounded-lg py-2 text-sm hover:bg-gray-50 cursor-pointer">
                Cancel
              </button>
              <button
                onClick={submitSign}
                disabled={signing || !signName.trim()}
                className="flex-1 bg-violet-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-[#0f1c28] cursor-pointer disabled:opacity-40"
              >
                {signing ? 'Signing…' : 'Confirm Signature'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
