import { useEffect, useState } from 'react';
import AdminLayout from '@/pages/hub/components/AdminLayout';
import HubAvatar from '@/pages/hub/components/HubAvatar';
import { supabase } from '@/lib/supabase';
import { useDemo } from '@/contexts/DemoContext';

interface Team {
  key: string;
  label: string;
  color: string;
  lead_id: string | null;
  lead_name: string | null;
  lead_avatar: string | null;
}

interface Employee { id: string; full_name: string; avatar_url: string | null; department: string | null; team: string | null; }

const PRESET_COLORS = ['#808000', '#1e3a8a', '#a3c1e0', '#b91c1c', '#059669', '#7c3aed', '#c2410c', '#0891b2'];

function slugify(label: string): string {
  return label.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'team';
}

const emptyForm = { label: '', color: PRESET_COLORS[0], lead_id: '' };

export default function ManageTeamsPage() {
  const { isDemo } = useDemo();
  const [teams, setTeams] = useState<Team[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [addingTo, setAddingTo] = useState<string | null>(null);

  const fetchAll = async () => {
    setLoading(true);
    const [tRes, eRes] = await Promise.all([
      supabase.from('hub_teams').select('key, label, color, lead_id, hub_users!lead_id(full_name, avatar_url)').order('label'),
      supabase.from('hub_users').select('id, full_name, avatar_url, department, team').eq('status', 'active').neq('is_developer', true).order('full_name'),
    ]);
    setTeams(((tRes.data as any[]) ?? []).map(t => ({
      key: t.key, label: t.label, color: t.color, lead_id: t.lead_id,
      lead_name: t.hub_users?.full_name ?? null, lead_avatar: t.hub_users?.avatar_url ?? null,
    })));
    setEmployees((eRes.data as Employee[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  if (isDemo) return (
    <AdminLayout>
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-gray-400">
        <i className="ri-team-line text-3xl opacity-40"></i>
        <p className="text-sm font-medium">Not available in demo</p>
      </div>
    </AdminLayout>
  );

  const openNew = () => { setEditingKey(null); setForm(emptyForm); setError(''); setShowForm(true); };
  const openEdit = (t: Team) => { setEditingKey(t.key); setForm({ label: t.label, color: t.color, lead_id: t.lead_id ?? '' }); setError(''); setShowForm(true); };

  const save = async () => {
    if (!form.label.trim()) { setError('Team name is required.'); return; }
    setSaving(true);
    setError('');

    const key = editingKey ?? slugify(form.label);
    const previousLeadId = editingKey ? teams.find(t => t.key === editingKey)?.lead_id ?? null : null;

    const { error: saveErr } = editingKey
      ? await supabase.from('hub_teams').update({ label: form.label.trim(), color: form.color, lead_id: form.lead_id || null, updated_at: new Date().toISOString() }).eq('key', editingKey)
      : await supabase.from('hub_teams').insert({ key, label: form.label.trim(), color: form.color, lead_id: form.lead_id || null });

    if (saveErr) { setError(saveErr.message); setSaving(false); return; }

    // Keep hub_users.team_lead_of in sync — clear the outgoing lead (if the
    // lead actually changed), set the incoming one. A lead is also a member.
    if (previousLeadId && previousLeadId !== form.lead_id) {
      await supabase.from('hub_users').update({ team_lead_of: null }).eq('id', previousLeadId).eq('team_lead_of', key);
    }
    if (form.lead_id) {
      await supabase.from('hub_users').update({ team_lead_of: key, team: key }).eq('id', form.lead_id);
    }

    setSaving(false);
    setShowForm(false);
    fetchAll();
  };

  const deleteTeam = async (t: Team) => {
    if (!confirm(`Delete "${t.label}"? Anyone assigned to it (including ${t.lead_name ?? 'its lead'}) will just become unassigned — nothing else is deleted.`)) return;
    const { error: delErr } = await supabase.from('hub_teams').delete().eq('key', t.key);
    if (delErr) { alert(`Could not delete: ${delErr.message}`); return; }
    fetchAll();
  };

  const addMember = async (teamKey: string, employeeId: string) => {
    if (!employeeId) return;
    setAddingTo(null);
    setEmployees(prev => prev.map(e => e.id === employeeId ? { ...e, team: teamKey } : e));
    const { error: addErr } = await supabase.from('hub_users').update({ team: teamKey }).eq('id', employeeId);
    if (addErr) { alert(`Could not add member: ${addErr.message}`); fetchAll(); }
  };

  const removeMember = async (employee: Employee, team: Team) => {
    setEmployees(prev => prev.map(e => e.id === employee.id ? { ...e, team: null } : e));
    await supabase.from('hub_users').update({ team: null }).eq('id', employee.id);
    // If they were also the lead, clear that too.
    if (team.lead_id === employee.id) {
      await supabase.from('hub_users').update({ team_lead_of: null }).eq('id', employee.id);
      await supabase.from('hub_teams').update({ lead_id: null }).eq('key', team.key);
    }
    fetchAll();
  };

  return (
    <AdminLayout title="Teams">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-gray-400">{teams.length} team{teams.length !== 1 ? 's' : ''}</p>
          <button onClick={openNew}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#1c2b3a] text-white rounded-xl text-sm font-medium hover:bg-[#0f1c28] cursor-pointer transition-colors">
            <i className="ri-add-line"></i> New Team
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><i className="ri-loader-4-line animate-spin text-2xl text-gray-300"></i></div>
        ) : teams.length === 0 ? (
          <div className="bg-white border border-gray-100 rounded-xl p-12 text-center">
            <i className="ri-team-line text-4xl text-gray-200 mb-3 block"></i>
            <p className="text-sm font-medium text-gray-500">No teams yet</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {teams.map(t => {
              const members = employees.filter(e => e.team === t.key && e.id !== t.lead_id);
              const availableToAdd = employees.filter(e => e.team !== t.key);
              return (
                <div key={t.key} className="bg-white border border-gray-100 rounded-xl overflow-hidden flex flex-col">
                  <div className="p-4 flex items-center gap-3 border-b border-gray-50">
                    <span className="w-8 h-8 rounded-lg flex-shrink-0" style={{ background: t.color }}></span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-gray-900 truncate">{t.label}</p>
                      <p className="text-xs text-gray-400 truncate">{members.length + (t.lead_id ? 1 : 0)} member{members.length + (t.lead_id ? 1 : 0) !== 1 ? 's' : ''}</p>
                    </div>
                    <button onClick={() => openEdit(t)} title="Edit team"
                      className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-[#1c2b3a] hover:bg-gray-50 rounded-lg cursor-pointer flex-shrink-0">
                      <i className="ri-pencil-line text-sm"></i>
                    </button>
                    <button onClick={() => deleteTeam(t)} title="Delete team"
                      className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg cursor-pointer flex-shrink-0">
                      <i className="ri-delete-bin-line text-sm"></i>
                    </button>
                  </div>

                  {/* Hierarchy: lead on top, members below */}
                  <div className="p-4 space-y-1 flex-1">
                    {t.lead_id ? (
                      <div className="flex items-center gap-2.5 py-1.5">
                        <div className="relative flex-shrink-0">
                          <HubAvatar fullName={t.lead_name ?? '?'} avatarUrl={t.lead_avatar} size="w-8 h-8" />
                          <span className="absolute -bottom-1 -right-1 w-4 h-4 bg-amber-400 rounded-full flex items-center justify-center border-2 border-white">
                            <i className="ri-vip-crown-fill text-white text-[8px]"></i>
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-gray-900 truncate">{t.lead_name}</p>
                          <p className="text-[10px] text-amber-600 font-medium">Team Lead</p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-gray-300 italic py-1.5">No lead assigned</p>
                    )}

                    {members.length > 0 && (
                      <div className="pl-2 border-l-2 border-gray-100 ml-4 space-y-1">
                        {members.map(m => (
                          <div key={m.id} className="flex items-center gap-2.5 py-1 group">
                            <HubAvatar fullName={m.full_name} avatarUrl={m.avatar_url} size="w-7 h-7" />
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-medium text-gray-800 truncate">{m.full_name}</p>
                              {m.department && <p className="text-[10px] text-gray-400 truncate">{m.department}</p>}
                            </div>
                            <button onClick={() => removeMember(m, t)} title="Remove from team"
                              className="w-6 h-6 flex items-center justify-center text-gray-300 hover:text-rose-500 rounded-lg cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                              <i className="ri-close-line text-sm"></i>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Add member */}
                  <div className="px-4 pb-4">
                    {addingTo === t.key ? (
                      <select autoFocus defaultValue="" onChange={e => addMember(t.key, e.target.value)} onBlur={() => setAddingTo(null)}
                        className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none bg-white cursor-pointer">
                        <option value="" disabled>Select someone to add...</option>
                        {availableToAdd.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
                      </select>
                    ) : (
                      <button onClick={() => setAddingTo(t.key)}
                        className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium text-gray-500 border border-dashed border-gray-200 rounded-lg hover:border-gray-300 hover:text-gray-700 cursor-pointer">
                        <i className="ri-user-add-line"></i> Add Teammate
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="font-semibold text-[#111827]">{editingKey ? 'Edit Team' : 'New Team'}</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600 cursor-pointer">
                <i className="ri-close-line text-lg"></i>
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-700">Team Name *</label>
                <input value={form.label} onChange={e => setForm({ ...form, label: e.target.value })}
                  placeholder="e.g. Team CP"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-700">Lead</label>
                <select value={form.lead_id} onChange={e => setForm({ ...form, lead_id: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none bg-white">
                  <option value="">No lead</option>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
                </select>
                <p className="text-[11px] text-gray-400">The lead gets elevated access to manage this team's projects/tasks, and is added as a member automatically.</p>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-700">Color</label>
                <div className="flex flex-wrap gap-2">
                  {PRESET_COLORS.map(c => (
                    <button key={c} type="button" onClick={() => setForm({ ...form, color: c })}
                      className={`w-8 h-8 rounded-lg cursor-pointer transition-all ${form.color === c ? 'ring-2 ring-offset-2 ring-[#1c2b3a]' : ''}`}
                      style={{ background: c }} />
                  ))}
                  <input type="color" value={form.color} onChange={e => setForm({ ...form, color: e.target.value })}
                    className="w-8 h-8 rounded-lg cursor-pointer border border-gray-200" title="Custom color" />
                </div>
              </div>
              {error && <p className="text-xs text-rose-600">{error}</p>}
            </div>
            <div className="flex gap-2 p-5 pt-0">
              <button onClick={() => setShowForm(false)}
                className="flex-1 py-2.5 text-sm border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 cursor-pointer">
                Cancel
              </button>
              <button disabled={saving} onClick={save}
                className="flex-1 py-2.5 text-sm bg-[#1c2b3a] text-white rounded-lg hover:bg-[#0f1c28] disabled:opacity-60 cursor-pointer font-medium">
                {saving ? 'Saving…' : editingKey ? 'Save Changes' : 'Create Team'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
