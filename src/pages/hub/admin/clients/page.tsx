import { useEffect, useState } from 'react';
import AdminLayout from '@/pages/hub/components/AdminLayout';
import { supabase } from '@/lib/supabase';
import { HubClient, HubClientAssignment, HubUser } from '@/lib/types';
import { useHubAuth as useAuth } from '@/hooks/useHubAuth';
import { useDemo } from '@/contexts/DemoContext';
import { logAudit } from '@/lib/audit';
import { getSetting } from '@/lib/settings';
import { DEMO_CLIENTS, DEMO_CONTRACTORS } from '@/lib/demoData';

const statusColors: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700',
  paused: 'bg-amber-100 text-amber-700',
  ended: 'bg-gray-100 text-gray-500',
};

const fmtPHP = (n: number) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const emptyForm = { client_name: '', platform: '', status: 'active', notes: '', contract_value: '', contract_currency: 'PHP' };

type AssignmentUser = NonNullable<HubClientAssignment['hub_users']>;
type AssignmentRow = Omit<HubClientAssignment, 'hub_users'> & {
  hub_users?: AssignmentUser | AssignmentUser[];
};

function normalizeAssignment(row: AssignmentRow): HubClientAssignment {
  const nestedUser = Array.isArray(row.hub_users) ? row.hub_users[0] : row.hub_users;
  return {
    ...row,
    hub_users: nestedUser,
  };
}

function Avatar({ name, avatar_url, size = 7 }: { name: string; avatar_url?: string | null; size?: number }) {
  const s = `w-${size} h-${size}`;
  if (avatar_url) return <img src={avatar_url} alt={name} className={`${s} rounded-full object-cover object-top flex-shrink-0`} />;
  return (
    <div className={`${s} rounded-full bg-[#1c2b3a] flex items-center justify-center flex-shrink-0`}>
      <span className="text-white text-xs font-bold">{name.charAt(0).toUpperCase()}</span>
    </div>
  );
}

export default function ClientsPage() {
  const { hubUser } = useAuth();
  const { isDemo } = useDemo();
  const isOwner = isDemo ? true : hubUser?.role === 'owner';
  const [usdRate, setUsdRate] = useState(56);
  const [clients, setClients] = useState<HubClient[]>([]);
  const [contractors, setContractors] = useState<HubUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    getSetting('usd_rate', '56').then(v => setUsdRate(parseFloat(v)));
  }, []);

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<HubClient | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const [assignClient, setAssignClient] = useState<HubClient | null>(null);
  const [assignments, setAssignments] = useState<HubClientAssignment[]>([]);
  const [addContractorId, setAddContractorId] = useState('');
  const [addRole, setAddRole] = useState('');
  const [assignSaving, setAssignSaving] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    const [clientsRes, usersRes] = await Promise.all([
      supabase
        .from('hub_clients')
        .select('*, hub_client_assignments(id, contractor_id, role, hub_users(id, full_name, avatar_url, department))')
        .order('client_name'),
      supabase.from('hub_users').select('id, full_name, avatar_url, department, role').eq('status', 'active').neq('is_developer', true).order('full_name'),
    ]);

    if (clientsRes.error?.message?.includes('hub_client_assignments')) {
      const { data: fallback } = await supabase.from('hub_clients').select('*').order('client_name');
      setClients((fallback as HubClient[]) ?? []);
    } else {
      const normalizedClients = ((clientsRes.data ?? []) as (HubClient & { hub_client_assignments?: AssignmentRow[] })[]).map((client) => ({
        ...client,
        hub_client_assignments: (client.hub_client_assignments ?? []).map(normalizeAssignment),
      }));
      setClients(normalizedClients);
    }

    setContractors((usersRes.data as HubUser[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    if (isDemo) {
      setClients(DEMO_CLIENTS);
      setContractors(DEMO_CONTRACTORS as HubUser[]);
      setLoading(false);
      return;
    }
    fetchData();
  }, [isDemo]);

  const filtered = clients.filter(c =>
    !search || c.client_name.toLowerCase().includes(search.toLowerCase())
  );

  const openNew = () => { setEditing(null); setForm(emptyForm); setShowModal(true); };
  const openEdit = (c: HubClient) => {
    setEditing(c);
    setForm({ client_name: c.client_name, platform: c.platform || '', status: c.status, notes: c.notes || '', contract_value: c.contract_value != null ? String(c.contract_value) : '', contract_currency: c.contract_currency || 'PHP' });
    setShowModal(true);
  };

  const save = async () => {
    if (!form.client_name.trim()) return;
    setSaving(true);
    setSaveError('');
    const payload = {
      client_name: form.client_name.trim(),
      platform: form.platform.trim() || null,
      status: form.status,
      notes: form.notes.trim() || null,
      contract_value: form.contract_value ? parseFloat(form.contract_value) : null,
      contract_currency: form.contract_currency,
    };
    if (editing) {
      const { error } = await supabase.from('hub_clients').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', editing.id);
      if (error) { setSaveError(error.message); setSaving(false); return; }
      logAudit({ actor_id: hubUser?.id, actor_name: hubUser?.full_name, action: 'update', entity_type: 'client', entity_id: String(editing.id), description: `Updated client "${form.client_name}"` });
    } else {
      const { error } = await supabase.from('hub_clients').insert(payload);
      if (error) { setSaveError(error.message); setSaving(false); return; }
      logAudit({ actor_id: hubUser?.id, actor_name: hubUser?.full_name, action: 'create', entity_type: 'client', description: `Added client "${form.client_name}"` });
    }
    setSaving(false);
    setShowModal(false);
    fetchData();
  };

  const openManageTeam = (c: HubClient) => {
    setAssignClient(c);
    setAssignments((c.hub_client_assignments as HubClientAssignment[]) ?? []);
    setAddContractorId('');
    setAddRole('');
  };

  const addAssignment = async () => {
    if (!assignClient || !addContractorId) return;
    setAssignSaving(true);
    await supabase.from('hub_client_assignments').insert({
      client_id: assignClient.id,
      contractor_id: addContractorId,
      role: addRole.trim() || null,
    });
    logAudit({ actor_id: hubUser?.id, actor_name: hubUser?.full_name, action: 'create', entity_type: 'client_assignment', entity_id: String(assignClient.id), description: `Assigned ${contractors.find(c => c.id === addContractorId)?.full_name} to "${assignClient.client_name}"` });
    setAddContractorId('');
    setAddRole('');
    setAssignSaving(false);
    const { data } = await supabase
      .from('hub_client_assignments')
      .select('id, contractor_id, role, hub_users(id, full_name, avatar_url, department)')
      .eq('client_id', assignClient.id);
    setAssignments(((data ?? []) as AssignmentRow[]).map(normalizeAssignment));
    fetchData();
  };

  const removeAssignment = async (assignmentId: number, contractorName: string) => {
    if (!assignClient) return;
    await supabase.from('hub_client_assignments').delete().eq('id', assignmentId);
    logAudit({ actor_id: hubUser?.id, actor_name: hubUser?.full_name, action: 'delete', entity_type: 'client_assignment', entity_id: String(assignClient.id), description: `Removed ${contractorName} from "${assignClient.client_name}"` });
    setAssignments(prev => prev.filter(a => a.id !== assignmentId));
    fetchData();
  };

  const unassignedContractors = contractors.filter(c =>
    !assignments.some(a => a.contractor_id === c.id)
  );

  // Header KPIs
  const activeCount = clients.filter(c => c.status === 'active').length;
  const pausedCount = clients.filter(c => c.status === 'paused').length;
  const monthlyTotalPHP = isOwner ? clients.filter(c => c.status === 'active' && c.contract_value).reduce((s, c) => {
    const val = c.contract_value ?? 0;
    return s + (c.contract_currency === 'USD' ? val * usdRate : val);
  }, 0) : 0;

  return (
    <AdminLayout title="Client Assignments">
      <div className="space-y-4">

        {/* Branded header */}
        <div className="bg-[#111827] rounded-2xl p-5 text-white">
          <div className="flex items-start justify-between gap-4 mb-5">
            <div>
              <h2 className="text-base font-semibold text-white">Client Assignments</h2>
              <p className="text-xs text-white/40 mt-0.5">{clients.length} client{clients.length !== 1 ? 's' : ''} total</p>
            </div>
            <button onClick={openNew}
              className="flex items-center gap-1.5 px-3 py-2 bg-[#1c2b3a] text-white text-xs font-medium rounded-xl hover:bg-[#e55a28] transition-colors cursor-pointer whitespace-nowrap flex-shrink-0">
              <i className="ri-add-line text-sm"></i>
              Add Client
            </button>
          </div>

          <div className={`grid gap-3 ${isOwner ? 'grid-cols-3' : 'grid-cols-2'}`}>
            <div className="bg-white/5 rounded-xl p-3 border border-white/10">
              <p className="text-2xl font-bold text-white tabular-nums">{activeCount}</p>
              <p className="text-xs text-emerald-400 mt-0.5 font-medium">Active</p>
            </div>
            <div className="bg-white/5 rounded-xl p-3 border border-white/10">
              <p className="text-2xl font-bold text-white tabular-nums">{pausedCount}</p>
              <p className="text-xs text-amber-400 mt-0.5 font-medium">Paused</p>
            </div>
            {isOwner && (
              <div className="bg-white/5 rounded-xl p-3 border border-white/10">
                <p className="text-lg font-bold text-[#1c2b3a] tabular-nums leading-tight">{monthlyTotalPHP ? fmtPHP(monthlyTotalPHP) : '—'}</p>
                <p className="text-xs text-white/50 mt-0.5">Monthly retainer</p>
              </div>
            )}
          </div>

          {/* Search */}
          <div className="relative mt-4">
            <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-white/30 text-sm"></i>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search clients..."
              className="w-full pl-9 pr-3 py-2 text-sm bg-white/10 border border-white/10 text-white placeholder-white/30 rounded-xl focus:outline-none focus:border-[#1c2b3a]/60 focus:bg-white/15 transition-colors"
            />
          </div>
        </div>

        {/* Client list */}
        {loading ? (
          <div className="flex justify-center py-12"><i className="ri-loader-4-line animate-spin text-xl text-gray-400"></i></div>
        ) : filtered.length === 0 ? (
          <div className="bg-white border border-gray-100 rounded-xl p-10 text-center">
            <i className="ri-building-line text-3xl text-gray-200 mb-2 block"></i>
            <p className="text-sm text-gray-400">No clients found</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(c => {
              const team = (c.hub_client_assignments ?? []) as HubClientAssignment[];
              const visibleTeam = team.slice(0, 5);
              const extraTeam = team.length - 5;
              return (
                <div key={c.id} className="bg-white border border-gray-100 rounded-xl overflow-hidden hover:border-gray-200 transition-colors">
                  <div className="p-4">
                    {/* Top row */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <div className="w-10 h-10 bg-[#1c2b3a]/10 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5">
                          <i className="ri-building-line text-[#1c2b3a]"></i>
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-[#111827]">{c.client_name}</p>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize flex-shrink-0 ${statusColors[c.status]}`}>{c.status}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            {c.platform && (
                              <span className="text-xs text-gray-400 flex items-center gap-1">
                                <i className="ri-layout-grid-line text-gray-300 text-xs"></i>
                                {c.platform}
                              </span>
                            )}
                            {c.notes && (
                              <>
                                {c.platform && <span className="text-gray-200 text-xs">·</span>}
                                <span className="text-xs text-gray-400 italic truncate max-w-[200px]">{c.notes}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right: contract value + actions */}
                      <div className="flex flex-col items-end gap-2 flex-shrink-0">
                        {isOwner && c.contract_value != null && (
                          <div className="text-right">
                            <p className="text-sm font-bold text-emerald-700 tabular-nums">
                              {c.contract_currency === 'USD'
                                ? `$${c.contract_value.toLocaleString('en-US', { minimumFractionDigits: 0 })}`
                                : fmtPHP(c.contract_value)}<span className="text-xs font-normal text-emerald-600">/mo</span>
                            </p>
                            {c.contract_currency === 'USD' && (
                              <p className="text-[10px] text-gray-400">≈ {fmtPHP(c.contract_value * usdRate)}</p>
                            )}
                          </div>
                        )}
                        <div className="flex items-center gap-1">
                          <button onClick={() => openEdit(c)}
                            className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 cursor-pointer transition-colors">
                            <i className="ri-edit-line text-sm"></i>
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Team row */}
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-50">
                      <div className="flex items-center gap-2.5">
                        {team.length === 0 ? (
                          <p className="text-xs text-gray-400">No team members assigned</p>
                        ) : (
                          <>
                            {/* Facepile */}
                            <div className="flex -space-x-2">
                              {visibleTeam.map(a => {
                                const u = a.hub_users as any;
                                if (!u) return null;
                                return (
                                  <div key={a.id} className="w-7 h-7 rounded-full border-2 border-white flex-shrink-0 overflow-hidden" title={u.full_name}>
                                    {u.avatar_url
                                      ? <img src={u.avatar_url} alt={u.full_name} className="w-full h-full object-cover object-top" />
                                      : <div className="w-full h-full bg-[#1c2b3a] flex items-center justify-center"><span className="text-white text-[10px] font-bold">{u.full_name.charAt(0)}</span></div>
                                    }
                                  </div>
                                );
                              })}
                              {extraTeam > 0 && (
                                <div className="w-7 h-7 rounded-full border-2 border-white bg-gray-100 flex items-center justify-center flex-shrink-0">
                                  <span className="text-[10px] font-medium text-gray-500">+{extraTeam}</span>
                                </div>
                              )}
                            </div>
                            <span className="text-xs text-gray-500">{team.length} member{team.length !== 1 ? 's' : ''}</span>
                          </>
                        )}
                      </div>
                      <button onClick={() => openManageTeam(c)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-500 border border-gray-200 hover:border-[#1c2b3a]/40 hover:text-[#1c2b3a] cursor-pointer transition-colors">
                        <i className="ri-user-settings-line text-sm"></i>
                        Manage Team
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Client details modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="font-semibold text-[#111827]">{editing ? 'Edit Client' : 'Add Client'}</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 cursor-pointer w-7 h-7 flex items-center justify-center">
                <i className="ri-close-line text-lg"></i>
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-700">Client Name *</label>
                <input value={form.client_name} onChange={e => setForm({ ...form, client_name: e.target.value })}
                  placeholder="Client company name..."
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-700">Platform</label>
                  <input value={form.platform} onChange={e => setForm({ ...form, platform: e.target.value })}
                    placeholder="e.g. Meta Ads"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-700">Status</label>
                  <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none bg-white">
                    <option value="active">Active</option>
                    <option value="paused">Paused</option>
                    <option value="ended">Ended</option>
                  </select>
                </div>
              </div>
              {isOwner && (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-700">Monthly Contract Value</label>
                  <div className="flex gap-2">
                    <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs flex-shrink-0">
                      <button type="button" onClick={() => setForm({ ...form, contract_currency: 'PHP' })}
                        className={`px-3 py-2 cursor-pointer transition-colors ${form.contract_currency === 'PHP' ? 'bg-[#111827] text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
                        ₱ PHP
                      </button>
                      <button type="button" onClick={() => setForm({ ...form, contract_currency: 'USD' })}
                        className={`px-3 py-2 cursor-pointer transition-colors border-l border-gray-200 ${form.contract_currency === 'USD' ? 'bg-[#111827] text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
                        $ USD
                      </button>
                    </div>
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">{form.contract_currency === 'USD' ? '$' : '₱'}</span>
                      <input type="number" value={form.contract_value} onChange={e => setForm({ ...form, contract_value: e.target.value })}
                        placeholder="0.00"
                        className="w-full pl-7 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]" />
                    </div>
                  </div>
                  {form.contract_currency === 'USD' && form.contract_value && (
                    <p className="text-[11px] text-emerald-600">≈ {fmtPHP(parseFloat(form.contract_value) * usdRate)} at ₱{usdRate}/USD</p>
                  )}
                  <p className="text-[11px] text-gray-400">Only visible to owner.</p>
                </div>
              )}
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-700">Notes</label>
                <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2}
                  placeholder="Any notes..." maxLength={500}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none resize-none" />
              </div>
            </div>
            {saveError && (
              <div className="mx-5 mb-3 flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-lg">
                <i className="ri-error-warning-line text-red-500 text-sm flex-shrink-0"></i>
                <p className="text-xs text-red-600">{saveError}</p>
              </div>
            )}
            <div className="flex gap-2 p-5 pt-0">
              <button onClick={() => setShowModal(false)} className="flex-1 py-2.5 text-sm border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 cursor-pointer whitespace-nowrap">Cancel</button>
              <button onClick={save} disabled={saving || !form.client_name.trim()}
                className="flex-1 py-2.5 text-sm bg-[#111827] text-white rounded-lg hover:bg-gray-800 disabled:opacity-40 cursor-pointer whitespace-nowrap">
                {saving ? 'Saving...' : editing ? 'Save Changes' : 'Add Client'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manage team modal */}
      {assignClient && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-gray-100 flex-shrink-0">
              <div>
                <h2 className="font-semibold text-[#111827]">{assignClient.client_name}</h2>
                <p className="text-xs text-gray-400 mt-0.5">Manage team members</p>
              </div>
              <button onClick={() => setAssignClient(null)} className="text-gray-400 hover:text-gray-600 cursor-pointer w-7 h-7 flex items-center justify-center">
                <i className="ri-close-line text-lg"></i>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {assignments.length === 0 ? (
                <div className="text-center py-6">
                  <i className="ri-team-line text-3xl text-gray-200 mb-2 block"></i>
                  <p className="text-sm text-gray-400">No one assigned yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {assignments.map(a => {
                    const u = a.hub_users as any;
                    if (!u) return null;
                    return (
                      <div key={a.id} className="flex items-center gap-3 px-3 py-2.5 bg-gray-50 rounded-xl">
                        <Avatar name={u.full_name} avatar_url={u.avatar_url} size={8} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-[#111827]">{u.full_name}</p>
                          <p className="text-xs text-gray-400">{a.role || u.department || '—'}</p>
                        </div>
                        <button onClick={() => removeAssignment(a.id, u.full_name)}
                          className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-300 hover:text-rose-400 hover:bg-rose-50 cursor-pointer transition-colors">
                          <i className="ri-delete-bin-line text-sm"></i>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className={`space-y-3 ${assignments.length > 0 ? 'border-t border-gray-100 pt-4' : ''}`}>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Add Team Member</p>
                <select value={addContractorId} onChange={e => setAddContractorId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a] bg-white">
                  <option value="">Select contractor...</option>
                  {unassignedContractors.map(u => (
                    <option key={u.id} value={u.id}>{u.full_name}{u.department ? ` — ${u.department}` : ''}</option>
                  ))}
                </select>
                <input value={addRole} onChange={e => setAddRole(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addAssignment()}
                  placeholder="Role on this project (e.g. Lead Architect)"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]" />
                <button onClick={addAssignment} disabled={!addContractorId || assignSaving}
                  className="w-full py-2.5 text-sm bg-[#111827] text-white rounded-xl hover:bg-gray-800 disabled:opacity-40 cursor-pointer transition-colors font-medium">
                  {assignSaving ? 'Adding...' : 'Add to Team'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
