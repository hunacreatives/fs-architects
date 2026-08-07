import { useEffect, useState } from 'react';
import AdminLayout from '@/pages/hub/components/AdminLayout';
import { supabase } from '@/lib/supabase';
import { useDemo } from '@/contexts/DemoContext';

interface Team {
  key: string;
  label: string;
  color: string;
  lead_id: string | null;
  lead_name: string | null;
}

interface Employee { id: string; full_name: string; }

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

  const fetchAll = async () => {
    setLoading(true);
    const [tRes, eRes] = await Promise.all([
      supabase.from('hub_teams').select('key, label, color, lead_id, hub_users!lead_id(full_name)').order('label'),
      supabase.from('hub_users').select('id, full_name').eq('status', 'active').neq('is_developer', true).order('full_name'),
    ]);
    setTeams(((tRes.data as any[]) ?? []).map(t => ({ key: t.key, label: t.label, color: t.color, lead_id: t.lead_id, lead_name: t.hub_users?.full_name ?? null })));
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
    // lead actually changed), set the incoming one.
    if (previousLeadId && previousLeadId !== form.lead_id) {
      await supabase.from('hub_users').update({ team_lead_of: null }).eq('id', previousLeadId).eq('team_lead_of', key);
    }
    if (form.lead_id) {
      await supabase.from('hub_users').update({ team_lead_of: key }).eq('id', form.lead_id);
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

  return (
    <AdminLayout title="Manage Teams">
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
            {teams.map(t => (
              <div key={t.key} className="bg-white border border-gray-100 rounded-xl p-4 flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <span className="w-8 h-8 rounded-lg flex-shrink-0" style={{ background: t.color }}></span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-gray-900 truncate">{t.label}</p>
                    <p className="text-xs text-gray-400 truncate">{t.lead_name ? `Led by ${t.lead_name}` : 'No lead assigned'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <button onClick={() => openEdit(t)}
                    className="flex-1 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 cursor-pointer">
                    Edit
                  </button>
                  <button onClick={() => deleteTeam(t)}
                    className="flex-1 py-1.5 text-xs border border-rose-200 text-rose-600 rounded-lg hover:bg-rose-50 cursor-pointer">
                    Delete
                  </button>
                </div>
              </div>
            ))}
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
                <p className="text-[11px] text-gray-400">The lead gets elevated access to manage this team's projects/tasks.</p>
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
