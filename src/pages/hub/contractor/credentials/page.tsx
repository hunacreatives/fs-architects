import { useEffect, useState, useRef } from 'react';
import ContractorLayout from '@/pages/hub/components/ContractorLayout';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

interface CredentialCatalog {
  id: string;
  client_name: string;
  platform: string;
  login_type: string;
  status: string;
  account_email: string | null;
  otp_contact: string | null;
  notes: string | null;
}

interface FullData {
  password: string | null;
  additional_info: string | null;
}

interface MyRequest {
  id: string;
  credential_id: string;
  status: string;
  reason: string | null;
}

const LOGIN_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  email_password: { label: 'Email + Password', color: 'bg-blue-100 text-blue-700' },
  otp: { label: 'OTP', color: 'bg-amber-100 text-amber-700' },
  sso: { label: 'SSO', color: 'bg-purple-100 text-purple-700' },
  api_key: { label: 'API Key', color: 'bg-gray-100 text-gray-600' },
};

const STATUS_DOT: Record<string, string> = {
  active: 'bg-emerald-500',
  inactive: 'bg-red-500',
  unverified: 'bg-gray-400',
};

export default function ContractorCredentialsPage() {
  const { hubUser } = useAuth();
  const [credentials, setCredentials] = useState<CredentialCatalog[]>([]);
  const [fullData, setFullData] = useState<Record<string, FullData>>({});
  const [myRequests, setMyRequests] = useState<MyRequest[]>([]);
  const [assignedClients, setAssignedClients] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set());
  const [showPassIds, setShowPassIds] = useState<Set<string>>(new Set());
  const [requestModal, setRequestModal] = useState<CredentialCatalog | null>(null);
  const [requestReason, setRequestReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState('');
  const toastRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [search, setSearch] = useState('');

  const showToast = (msg: string) => {
    setToast(msg);
    if (toastRef.current) clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(''), 3000);
  };

  const fetchData = async () => {
    if (!hubUser?.id) return;
    setLoading(true);

    const [credsRes, reqsRes, clientsRes] = await Promise.all([
      supabase.from('hub_credentials')
        .select('id, client_name, platform, login_type, status, account_email, otp_contact, notes')
        .order('client_name').order('platform'),
      supabase.from('hub_credential_requests')
        .select('id, credential_id, status, reason')
        .eq('contractor_id', hubUser.id),
      supabase.from('hub_clients')
        .select('client_name')
        .eq('assigned_contractor_id', hubUser.id),
    ]);

    const credList = (credsRes.data as CredentialCatalog[]) ?? [];
    const reqList = (reqsRes.data as MyRequest[]) ?? [];
    const autoClientNames = new Set<string>((clientsRes.data ?? []).map((c: any) => c.client_name));

    setCredentials(credList);
    setMyRequests(reqList);
    setAssignedClients(autoClientNames);
    setExpandedClients(new Set(credList.map((c) => c.client_name)));

    // Fetch full data for: auto-access clients + approved requests
    const approvedIds = new Set(reqList.filter((r) => r.status === 'approved').map((r) => r.credential_id));
    const needFullIds = credList
      .filter((c) => autoClientNames.has(c.client_name) || approvedIds.has(c.id))
      .map((c) => c.id);

    if (needFullIds.length > 0) {
      const { data: full } = await supabase
        .from('hub_credentials')
        .select('id, password, additional_info')
        .in('id', needFullIds);
      const map: Record<string, FullData> = {};
      (full ?? []).forEach((c: any) => { map[c.id] = { password: c.password, additional_info: c.additional_info }; });
      setFullData(map);
    } else {
      setFullData({});
    }

    setLoading(false);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchData(); }, [hubUser]);

  const requestMap = Object.fromEntries(myRequests.map((r) => [r.credential_id, r]));

  const filtered = credentials.filter((c) =>
    !search ||
    c.client_name.toLowerCase().includes(search.toLowerCase()) ||
    c.platform.toLowerCase().includes(search.toLowerCase())
  );

  const groups = filtered.reduce<Record<string, CredentialCatalog[]>>((acc, c) => {
    if (!acc[c.client_name]) acc[c.client_name] = [];
    acc[c.client_name].push(c);
    return acc;
  }, {});

  const clientNames = Object.keys(groups).sort((a, b) => {
    // Assigned clients first
    const aAssigned = assignedClients.has(a);
    const bAssigned = assignedClients.has(b);
    if (aAssigned && !bAssigned) return -1;
    if (!aAssigned && bAssigned) return 1;
    return a.localeCompare(b);
  });

  const toggleClient = (name: string) => {
    setExpandedClients((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const togglePassVis = (id: string) => {
    setShowPassIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submitRequest = async () => {
    if (!requestModal || !hubUser?.id || !requestReason.trim()) return;
    setSubmitting(true);
    const { error } = await supabase.from('hub_credential_requests').insert({
      credential_id: requestModal.id,
      contractor_id: hubUser.id,
      reason: requestReason.trim(),
      status: 'pending',
    });
    setSubmitting(false);
    if (error) { showToast('Failed to submit request. Try again.'); return; }
    supabase.functions.invoke('notify-internal-request', {
      body: { type: 'credential_request', contractor_name: hubUser!.full_name, detail: `${requestModal.platform} — ${requestModal.client_name}`, notes: requestReason },
    });
    setRequestModal(null);
    showToast('Access request submitted!');
    fetchData();
  };

  const autoAccessCount = credentials.filter((c) => assignedClients.has(c.client_name)).length;
  const approvedCount = myRequests.filter((r) => r.status === 'approved').length;
  const myPending = myRequests.filter((r) => r.status === 'pending').length;

  return (
    <ContractorLayout title="Credentials">
      {toast && (
        <div className="fixed top-5 right-5 z-50 bg-gray-900 text-white text-sm px-4 py-2.5 rounded-lg shadow-lg">
          {toast}
        </div>
      )}

      <div className="p-6 space-y-5">

        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {[
            { label: 'Total Platforms', value: credentials.length, icon: 'ri-global-line', color: 'text-gray-600', bg: 'bg-gray-50' },
            { label: 'Auto Access', value: autoAccessCount + approvedCount, icon: 'ri-shield-check-line', color: 'text-emerald-600', bg: 'bg-emerald-50' },
            { label: 'Pending', value: myPending, icon: 'ri-time-line', color: 'text-amber-600', bg: 'bg-amber-50' },
          ].map((card) => (
            <div key={card.label} className="bg-white rounded-xl border border-gray-100 p-4 flex items-center gap-3">
              <div className={`w-9 h-9 flex items-center justify-center rounded-xl ${card.bg} flex-shrink-0`}>
                <i className={`${card.icon} text-lg ${card.color}`}></i>
              </div>
              <div>
                <p className="text-lg font-semibold text-gray-900">{card.value}</p>
                <p className="text-xs text-gray-500">{card.label}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="relative max-w-sm">
          <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by platform or client…"
            className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/30 focus:border-[#FF6B35]"
          />
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <i className="ri-loader-4-line animate-spin text-xl text-gray-400"></i>
          </div>
        ) : clientNames.length === 0 ? (
          <div className="bg-white border border-gray-100 rounded-xl p-12 text-center">
            <i className="ri-lock-2-line text-4xl text-gray-200 mb-3 block"></i>
            <p className="text-gray-400 text-sm">No credentials available yet.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {clientNames.map((clientName) => {
              const clientCreds = groups[clientName];
              const isExpanded = expandedClients.has(clientName);
              const isAssigned = assignedClients.has(clientName);
              return (
                <div key={clientName} className={`bg-white border rounded-xl overflow-hidden ${isAssigned ? 'border-emerald-200' : 'border-gray-100'}`}>
                  <button
                    onClick={() => toggleClient(clientName)}
                    className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${isAssigned ? 'bg-emerald-100' : 'bg-[#FF6B35]/10'}`}>
                        <i className={`text-sm ${isAssigned ? 'ri-shield-check-line text-emerald-600' : 'ri-building-2-line text-[#FF6B35]'}`}></i>
                      </div>
                      <span className="text-sm font-semibold text-[#111827]">{clientName}</span>
                      <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium">{clientCreds.length}</span>
                      {isAssigned && (
                        <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">Assigned</span>
                      )}
                    </div>
                    <i className={`text-gray-400 text-sm transition-transform ${isExpanded ? 'ri-arrow-up-s-line' : 'ri-arrow-down-s-line'}`}></i>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-gray-50 divide-y divide-gray-50">
                      {clientCreds.map((cred) => {
                        const typeInfo = LOGIN_TYPE_LABELS[cred.login_type] ?? { label: cred.login_type, color: 'bg-gray-100 text-gray-600' };
                        const myReq = requestMap[cred.id];
                        const isAutoAccess = isAssigned;
                        const isApproved = isAutoAccess || myReq?.status === 'approved';
                        const isPending = !isAutoAccess && myReq?.status === 'pending';
                        const credFullData = isApproved ? fullData[cred.id] : null;
                        const passVisible = showPassIds.has(cred.id);

                        return (
                          <div key={cred.id} className="px-5 py-4 hover:bg-gray-50/50 transition-colors">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0 space-y-1.5">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-sm font-semibold text-[#111827]">{cred.platform}</span>
                                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${typeInfo.color}`}>{typeInfo.label}</span>
                                  <div className="flex items-center gap-1">
                                    <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[cred.status] ?? 'bg-gray-400'}`}></span>
                                    <span className="text-xs text-gray-400 capitalize">{cred.status}</span>
                                  </div>
                                  {isAutoAccess && (
                                    <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium flex items-center gap-0.5">
                                      <i className="ri-shield-check-line text-xs"></i> Client Assigned
                                    </span>
                                  )}
                                  {!isAutoAccess && myReq?.status === 'approved' && (
                                    <span className="text-xs bg-sky-100 text-sky-700 px-2 py-0.5 rounded-full font-medium flex items-center gap-0.5">
                                      <i className="ri-shield-check-line text-xs"></i> Access Granted
                                    </span>
                                  )}
                                </div>

                                {cred.account_email && (
                                  <p className="text-xs text-gray-600 flex items-center gap-1">
                                    <i className="ri-mail-line text-gray-400"></i>
                                    {cred.account_email}
                                  </p>
                                )}

                                {(cred.login_type === 'email_password' || cred.login_type === 'api_key') && (
                                  <div className="flex items-center gap-2">
                                    <i className="ri-lock-line text-gray-400 text-xs"></i>
                                    {isApproved && credFullData ? (
                                      <>
                                        <span className="text-xs text-gray-700 font-mono">
                                          {passVisible ? (credFullData.password ?? '—') : '••••••••'}
                                        </span>
                                        <button onClick={() => togglePassVis(cred.id)} className="text-gray-400 hover:text-gray-600 cursor-pointer transition-colors">
                                          <i className={`text-xs ${passVisible ? 'ri-eye-off-line' : 'ri-eye-line'}`}></i>
                                        </button>
                                      </>
                                    ) : (
                                      <span className="text-xs text-gray-300 font-mono">••••••••</span>
                                    )}
                                  </div>
                                )}

                                {cred.login_type === 'otp' && cred.otp_contact && isApproved && (
                                  <p className="text-xs text-amber-600 flex items-center gap-1">
                                    <i className="ri-smartphone-line"></i> OTP → {cred.otp_contact}
                                  </p>
                                )}

                                {isApproved && credFullData?.additional_info && (
                                  <p className="text-xs text-gray-400">{credFullData.additional_info}</p>
                                )}

                                {cred.notes && (
                                  <p className="text-xs text-gray-400 italic">{cred.notes}</p>
                                )}
                              </div>

                              <div className="flex-shrink-0">
                                {isPending ? (
                                  <span className="text-xs bg-amber-100 text-amber-700 px-2.5 py-1.5 rounded-lg font-medium flex items-center gap-1">
                                    <i className="ri-time-line"></i> Pending
                                  </span>
                                ) : !isApproved ? (
                                  <button
                                    onClick={() => { setRequestModal(cred); setRequestReason(''); }}
                                    className="text-xs bg-gray-100 text-gray-700 hover:bg-[#FF6B35]/10 hover:text-[#FF6B35] px-2.5 py-1.5 rounded-lg font-medium transition-colors cursor-pointer flex items-center gap-1 whitespace-nowrap"
                                  >
                                    <i className="ri-key-line"></i> Request Access
                                  </button>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {requestModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div>
                <h2 className="font-semibold text-[#111827]">Request Access</h2>
                <p className="text-xs text-gray-500 mt-0.5">{requestModal.platform} — {requestModal.client_name}</p>
              </div>
              <button onClick={() => setRequestModal(null)} className="text-gray-400 hover:text-gray-600 cursor-pointer w-7 h-7 flex items-center justify-center">
                <i className="ri-close-line text-lg"></i>
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-amber-50 rounded-lg px-4 py-3 text-xs text-amber-700 flex items-start gap-2">
                <i className="ri-information-line mt-0.5"></i>
                <span>Your request will be reviewed by an admin. Please provide a clear reason for needing access.</span>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-700">Reason for Access *</label>
                <textarea
                  value={requestReason}
                  onChange={(e) => setRequestReason(e.target.value)}
                  rows={3}
                  placeholder="e.g. Need to post content for the May campaign..."
                  maxLength={500}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/30 focus:border-[#FF6B35] resize-none"
                />
              </div>
            </div>
            <div className="flex gap-2 p-5 pt-0">
              <button onClick={() => setRequestModal(null)} className="flex-1 py-2.5 text-sm border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors">Cancel</button>
              <button onClick={submitRequest} disabled={submitting || !requestReason.trim()} className="flex-1 py-2.5 text-sm bg-[#FF6B35] text-white rounded-lg hover:bg-[#e55a24] disabled:opacity-40 cursor-pointer transition-colors">
                {submitting ? 'Submitting...' : 'Submit Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ContractorLayout>
  );
}
