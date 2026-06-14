import { useEffect, useState, useRef } from 'react';
import AdminLayout from '@/pages/hub/components/AdminLayout';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useDemo } from '@/contexts/DemoContext';

interface Credential {
  id: string;
  client_name: string;
  platform: string;
  account_email: string | null;
  password: string | null;
  login_type: string;
  otp_contact: string | null;
  additional_info: string | null;
  status: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface CredentialRequest {
  id: string;
  credential_id: string;
  contractor_id: string;
  reason: string | null;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  hub_users?: { full_name: string; avatar_url?: string };
  hub_credentials?: { platform: string; client_name: string };
}

const emptyForm = {
  client_name: '',
  platform: '',
  login_type: 'email_password',
  account_email: '',
  password: '',
  otp_contact: '',
  additional_info: '',
  status: 'active',
  notes: '',
};

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

export default function CredentialsVaultPage() {
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
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [requests, setRequests] = useState<CredentialRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [editingCred, setEditingCred] = useState<Credential | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set());
  const [showPassIds, setShowPassIds] = useState<Set<string>>(new Set());
  const [showFormPass, setShowFormPass] = useState(false);
  const [toast, setToast] = useState('');
  const toastRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    if (toastRef.current) clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(''), 3000);
  };

  const fetchData = async () => {
    setLoading(true);
    const [{ data: creds }, { data: reqs }] = await Promise.all([
      supabase.from('hub_credentials').select('*').order('client_name').order('platform'),
      supabase
        .from('hub_credential_requests')
        .select('*, hub_users!contractor_id(full_name, avatar_url), hub_credentials!credential_id(platform, client_name)')
        .order('created_at', { ascending: false }),
    ]);
    const credList = (creds as Credential[]) ?? [];
    setCredentials(credList);
    setRequests((reqs as CredentialRequest[]) ?? []);
    // Default all clients expanded
    const clients = new Set(credList.map((c) => c.client_name));
    setExpandedClients(clients);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  // Group credentials by client
  const filtered = credentials.filter((c) =>
    !search ||
    c.client_name.toLowerCase().includes(search.toLowerCase()) ||
    c.platform.toLowerCase().includes(search.toLowerCase()) ||
    (c.account_email ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const groups = filtered.reduce<Record<string, Credential[]>>((acc, c) => {
    if (!acc[c.client_name]) acc[c.client_name] = [];
    acc[c.client_name].push(c);
    return acc;
  }, {});

  const clientNames = Object.keys(groups).sort();

  const pendingRequests = requests.filter((r) => r.status === 'pending');
  const otherRequests = requests.filter((r) => r.status !== 'pending');

  const toggleClient = (name: string) => {
    setExpandedClients((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };

  const togglePassVis = (id: string) => {
    setShowPassIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const openNew = () => {
    setEditingCred(null);
    setForm(emptyForm);
    setShowFormPass(false);
    setShowAdd(true);
  };

  const openEdit = (c: Credential) => {
    setEditingCred(c);
    setForm({
      client_name: c.client_name,
      platform: c.platform,
      login_type: c.login_type,
      account_email: c.account_email ?? '',
      password: c.password ?? '',
      otp_contact: c.otp_contact ?? '',
      additional_info: c.additional_info ?? '',
      status: c.status,
      notes: c.notes ?? '',
    });
    setShowFormPass(false);
    setShowAdd(true);
  };

  const save = async () => {
    if (!form.client_name.trim() || !form.platform.trim()) return;
    setSaving(true);
    const payload = {
      client_name: form.client_name.trim(),
      platform: form.platform.trim(),
      login_type: form.login_type,
      account_email: form.account_email.trim() || null,
      password: form.password.trim() || null,
      otp_contact: form.otp_contact.trim() || null,
      additional_info: form.additional_info.trim() || null,
      status: form.status,
      notes: form.notes.trim() || null,
      updated_at: new Date().toISOString(),
    };
    if (editingCred) {
      await supabase.from('hub_credentials').update(payload).eq('id', editingCred.id);
    } else {
      await supabase.from('hub_credentials').insert({ ...payload, created_by: hubUser?.id });
    }
    setSaving(false);
    setShowAdd(false);
    showToast(editingCred ? 'Credential updated.' : 'Credential added.');
    fetchData();
  };

  const deleteCred = async (id: string) => {
    if (!confirm('Delete this credential? This cannot be undone.')) return;
    await supabase.from('hub_credentials').delete().eq('id', id);
    showToast('Credential deleted.');
    fetchData();
  };

  const reviewRequest = async (id: string, status: 'approved' | 'denied') => {
    await supabase.from('hub_credential_requests').update({
      status,
      reviewed_by: hubUser?.id,
      reviewed_at: new Date().toISOString(),
    }).eq('id', id);
    showToast(`Request ${status}.`);
    fetchData();
  };

  const inputCls = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]';

  return (
    <AdminLayout title="Credentials Vault">
      {toast && (
        <div className="fixed top-5 right-5 z-50 bg-gray-900 text-white text-sm px-4 py-2.5 rounded-lg shadow-lg">
          {toast}
        </div>
      )}

      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-1">
            <div className="relative flex-1 max-w-sm">
              <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search credentials..."
                className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]"
              />
            </div>
            {pendingRequests.length > 0 && (
              <a href="#access-requests" className="flex items-center gap-1.5 px-3 py-2 bg-amber-50 border border-amber-200 text-amber-700 text-xs font-medium rounded-lg hover:bg-amber-100 transition-colors cursor-pointer whitespace-nowrap">
                <i className="ri-key-line text-sm"></i>
                {pendingRequests.length} Pending Request{pendingRequests.length > 1 ? 's' : ''}
              </a>
            )}
          </div>
          <button
            onClick={openNew}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#111827] text-white text-sm rounded-lg hover:bg-gray-800 transition-colors cursor-pointer whitespace-nowrap"
          >
            <i className="ri-add-line"></i> Add Credential
          </button>
        </div>

        {/* Credentials grouped by client */}
        {loading ? (
          <div className="flex justify-center py-12">
            <i className="ri-loader-4-line animate-spin text-xl text-gray-400"></i>
          </div>
        ) : clientNames.length === 0 ? (
          <div className="bg-white border border-gray-100 rounded-xl p-12 text-center">
            <i className="ri-lock-2-line text-4xl text-gray-200 mb-3 block"></i>
            <p className="text-gray-400 text-sm">No credentials yet. Add the first one.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {clientNames.map((clientName) => {
              const clientCreds = groups[clientName];
              const isExpanded = expandedClients.has(clientName);
              return (
                <div key={clientName} className="bg-white border border-gray-100 rounded-xl overflow-hidden">
                  {/* Client group header */}
                  <button
                    onClick={() => toggleClient(clientName)}
                    className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 bg-[#1c2b3a]/10 rounded-lg flex items-center justify-center flex-shrink-0">
                        <i className="ri-building-2-line text-[#1c2b3a] text-sm"></i>
                      </div>
                      <span className="text-sm font-semibold text-[#111827]">{clientName}</span>
                      <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium">
                        {clientCreds.length}
                      </span>
                    </div>
                    <i className={`text-gray-400 text-sm transition-transform ${isExpanded ? 'ri-arrow-up-s-line' : 'ri-arrow-down-s-line'}`}></i>
                  </button>

                  {/* Credential cards */}
                  {isExpanded && (
                    <div className="border-t border-gray-50 divide-y divide-gray-50">
                      {clientCreds.map((cred) => {
                        const typeInfo = LOGIN_TYPE_LABELS[cred.login_type] ?? { label: cred.login_type, color: 'bg-gray-100 text-gray-600' };
                        const passVisible = showPassIds.has(cred.id);
                        return (
                          <div key={cred.id} className="px-5 py-4 hover:bg-gray-50/50 transition-colors">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0 space-y-1.5">
                                {/* Platform + badges */}
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-sm font-semibold text-[#111827]">{cred.platform}</span>
                                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${typeInfo.color}`}>
                                    {typeInfo.label}
                                  </span>
                                  <div className="flex items-center gap-1">
                                    <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[cred.status] ?? 'bg-gray-400'}`}></span>
                                    <span className="text-xs text-gray-400 capitalize">{cred.status}</span>
                                  </div>
                                </div>

                                {/* Account email */}
                                {cred.account_email && (
                                  <p className="text-xs text-gray-600 flex items-center gap-1">
                                    <i className="ri-mail-line text-gray-400"></i>
                                    {cred.account_email}
                                  </p>
                                )}

                                {/* Password row */}
                                {(cred.login_type === 'email_password' || cred.login_type === 'api_key') && (
                                  <div className="flex items-center gap-2">
                                    <i className="ri-lock-line text-gray-400 text-xs"></i>
                                    <span className="text-xs text-gray-700 font-mono">
                                      {passVisible ? (cred.password ?? '—') : '••••••••'}
                                    </span>
                                    <button
                                      onClick={() => togglePassVis(cred.id)}
                                      className="text-gray-400 hover:text-gray-600 cursor-pointer transition-colors"
                                    >
                                      <i className={`text-xs ${passVisible ? 'ri-eye-off-line' : 'ri-eye-line'}`}></i>
                                    </button>
                                  </div>
                                )}

                                {/* OTP contact */}
                                {cred.login_type === 'otp' && cred.otp_contact && (
                                  <p className="text-xs text-amber-600 flex items-center gap-1">
                                    <i className="ri-smartphone-line"></i>
                                    OTP → {cred.otp_contact}
                                  </p>
                                )}

                                {/* Additional info */}
                                {cred.additional_info && (
                                  <p className="text-xs text-gray-400">{cred.additional_info}</p>
                                )}

                                {/* Notes */}
                                {cred.notes && (
                                  <p className="text-xs text-gray-400 italic">{cred.notes}</p>
                                )}
                              </div>

                              {/* Actions */}
                              <div className="flex items-center gap-1 flex-shrink-0">
                                <button
                                  onClick={() => openEdit(cred)}
                                  className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-[#1c2b3a] hover:bg-[#1c2b3a]/10 rounded-lg transition-colors cursor-pointer"
                                  title="Edit"
                                >
                                  <i className="ri-pencil-line text-sm"></i>
                                </button>
                                <button
                                  onClick={() => deleteCred(cred.id)}
                                  className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                                  title="Delete"
                                >
                                  <i className="ri-delete-bin-line text-sm"></i>
                                </button>
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

        {/* Access Requests Section — always visible */}
        <div id="access-requests" className="bg-white border border-gray-100 rounded-xl overflow-hidden">
          <div className="flex items-center gap-2.5 px-5 py-4 border-b border-gray-100">
            <i className="ri-key-line text-[#1c2b3a]"></i>
            <h2 className="text-sm font-semibold text-[#111827]">Access Requests</h2>
            {pendingRequests.length > 0 && (
              <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                {pendingRequests.length} pending
              </span>
            )}
          </div>

          {loading ? (
            <div className="flex justify-center py-8"><i className="ri-loader-4-line animate-spin text-xl text-gray-400"></i></div>
          ) : requests.length === 0 ? (
            <div className="py-8 text-center">
              <i className="ri-key-line text-2xl text-gray-200 block mb-2"></i>
              <p className="text-sm text-gray-400">No access requests yet.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {pendingRequests.map((req) => {
                const user = req.hub_users;
                const cred = req.hub_credentials;
                return (
                  <div key={req.id} className="px-5 py-4 flex items-center gap-3 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="w-6 h-6 rounded-full bg-[#1c2b3a]/10 flex items-center justify-center flex-shrink-0">
                          <i className="ri-user-line text-[#1c2b3a] text-xs"></i>
                        </div>
                        <span className="text-sm font-medium text-gray-800">{user?.full_name ?? 'Unknown'}</span>
                        <span className="text-xs text-gray-400">wants access to</span>
                        <span className="text-sm font-medium text-gray-800">{cred?.platform ?? '—'}</span>
                        <span className="text-xs text-gray-400">({cred?.client_name ?? '—'})</span>
                      </div>
                      {req.reason && (
                        <p className="text-xs text-gray-500 mt-1 ml-8">{req.reason}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => reviewRequest(req.id, 'approved')}
                        className="flex items-center gap-1 px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-medium rounded-lg hover:bg-emerald-100 transition-colors cursor-pointer"
                      >
                        <i className="ri-check-line"></i> Approve
                      </button>
                      <button
                        onClick={() => reviewRequest(req.id, 'denied')}
                        className="flex items-center gap-1 px-3 py-1.5 bg-red-50 text-red-600 border border-red-200 text-xs font-medium rounded-lg hover:bg-red-100 transition-colors cursor-pointer"
                      >
                        <i className="ri-close-line"></i> Deny
                      </button>
                    </div>
                  </div>
                );
              })}

              {otherRequests.slice(0, 10).map((req) => {
                const user = req.hub_users;
                const cred = req.hub_credentials;
                const isApproved = req.status === 'approved';
                return (
                  <div key={req.id} className="px-5 py-3 flex items-center gap-3 opacity-50">
                    <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-gray-500">{user?.full_name ?? 'Unknown'}</span>
                      <span className="text-xs text-gray-400">—</span>
                      <span className="text-xs text-gray-500">{cred?.platform ?? '—'}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${isApproved ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
                        {req.status}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Add / Edit Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg my-4">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <i className="ri-lock-2-line text-[#1c2b3a]"></i>
                <h2 className="font-semibold text-[#111827]">
                  {editingCred ? 'Edit Credential' : 'Add Credential'}
                </h2>
              </div>
              <button onClick={() => setShowAdd(false)} className="text-gray-400 hover:text-gray-600 cursor-pointer w-7 h-7 flex items-center justify-center">
                <i className="ri-close-line text-lg"></i>
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-700">Client Name *</label>
                  <input
                    value={form.client_name}
                    onChange={(e) => setForm({ ...form, client_name: e.target.value })}
                    placeholder="e.g. BCN Dental"
                    className={inputCls}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-700">Platform *</label>
                  <input
                    value={form.platform}
                    onChange={(e) => setForm({ ...form, platform: e.target.value })}
                    placeholder="e.g. Facebook Business"
                    className={inputCls}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-700">Login Type</label>
                <select
                  value={form.login_type}
                  onChange={(e) => setForm({ ...form, login_type: e.target.value })}
                  className={`${inputCls} bg-white`}
                >
                  <option value="email_password">Email + Password</option>
                  <option value="otp">OTP</option>
                  <option value="sso">SSO</option>
                  <option value="api_key">API Key</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-700">Account Email / Username</label>
                <input
                  value={form.account_email}
                  onChange={(e) => setForm({ ...form, account_email: e.target.value })}
                  placeholder="email@example.com"
                  className={inputCls}
                />
              </div>

              {(form.login_type === 'email_password' || form.login_type === 'api_key') && (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-700">
                    {form.login_type === 'api_key' ? 'API Key' : 'Password'}
                  </label>
                  <div className="relative">
                    <input
                      type={showFormPass ? 'text' : 'password'}
                      value={form.password}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                      placeholder="Enter password..."
                      className={`${inputCls} pr-9`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowFormPass(!showFormPass)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
                    >
                      <i className={`text-sm ${showFormPass ? 'ri-eye-off-line' : 'ri-eye-line'}`}></i>
                    </button>
                  </div>
                </div>
              )}

              {form.login_type === 'otp' && (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-700">OTP Contact</label>
                  <input
                    value={form.otp_contact}
                    onChange={(e) => setForm({ ...form, otp_contact: e.target.value })}
                    placeholder="e.g. Sent to +63912345678"
                    className={inputCls}
                  />
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-700">Additional Info</label>
                <input
                  value={form.additional_info}
                  onChange={(e) => setForm({ ...form, additional_info: e.target.value })}
                  placeholder="e.g. backup codes, 2FA app..."
                  className={inputCls}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-700">Status</label>
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                  className={`${inputCls} bg-white`}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="unverified">Unverified</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-700">Notes</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={2}
                  placeholder="Any notes..."
                  maxLength={500}
                  className={`${inputCls} resize-none`}
                />
              </div>
            </div>

            <div className="flex gap-2 p-5 pt-0">
              <button
                onClick={() => setShowAdd(false)}
                className="flex-1 py-2.5 text-sm border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors whitespace-nowrap"
              >
                Cancel
              </button>
              <button
                onClick={save}
                disabled={saving || !form.client_name.trim() || !form.platform.trim()}
                className="flex-1 py-2.5 text-sm bg-[#111827] text-white rounded-lg hover:bg-gray-800 disabled:opacity-40 cursor-pointer transition-colors whitespace-nowrap"
              >
                {saving ? 'Saving...' : editingCred ? 'Save Changes' : 'Add Credential'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
