import { useEffect, useState } from 'react';
import AdminLayout from '@/pages/hub/components/AdminLayout';
import HubAvatar from '@/pages/hub/components/HubAvatar';
import { supabase } from '@/lib/supabase';
import { useDemo } from '@/contexts/DemoContext';
import OrgChart from './OrgChart';
import { UAP_CATEGORIES, UAP_TOTAL_REQUIRED_HOURS, resolveUapCategory } from '@/lib/uapHours';

interface Team {
  key: string;
  label: string;
  color: string;
  lead_id: string | null;
  lead_name: string | null;
  lead_avatar: string | null;
}

interface Employee {
  id: string; full_name: string; avatar_url: string | null; department: string | null; team: string | null;
  manager_id: string | null; role_title: string | null; role: string;
}

const PRESET_COLORS = ['#808000', '#1e3a8a', '#a3c1e0', '#b91c1c', '#059669', '#7c3aed', '#c2410c', '#0891b2'];

function slugify(label: string): string {
  return label.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'team';
}

const emptyForm = { label: '', color: PRESET_COLORS[0], lead_id: '' };

// Walk manager_id up from personId, returning everyone they (transitively)
// report to. Used to keep team-lead auto-reparenting from creating a cycle.
function getAncestorIds(personId: string, all: Employee[]): Set<string> {
  const out = new Set<string>();
  let cur = all.find(e => e.id === personId)?.manager_id ?? null;
  while (cur && !out.has(cur)) {
    out.add(cur);
    cur = all.find(e => e.id === cur)?.manager_id ?? null;
  }
  return out;
}

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
  const [viewMode, setViewMode] = useState<'teams' | 'orgchart' | 'uapHours'>('teams');
  const [uapPeople, setUapPeople] = useState<{ id: string; full_name: string; avatar_url: string | null; department: string | null }[]>([]);
  interface UapTaskContribution { id: number; title: string; project_name: string; hours: number }
  const [uapTasksByPerson, setUapTasksByPerson] = useState<Record<string, Record<string, UapTaskContribution[]>>>({});
  const [uapLoading, setUapLoading] = useState(false);
  const [expandedUapId, setExpandedUapId] = useState<string | null>(null);
  const [expandedUapCategory, setExpandedUapCategory] = useState<string | null>(null);
  const [uapSearch, setUapSearch] = useState('');

  const fetchUapHours = async () => {
    setUapLoading(true);
    const { data: people } = await supabase
      .from('hub_users')
      .select('id, full_name, avatar_url, department')
      .eq('status', 'active').neq('is_developer', true).eq('track_uap_hours', true)
      .order('full_name');
    const peopleList = (people as any[]) ?? [];
    setUapPeople(peopleList);
    if (peopleList.length === 0) { setUapTasksByPerson({}); setUapLoading(false); return; }

    const ids = peopleList.map(p => p.id);
    const { data: taskRows } = await supabase
      .from('hub_project_tasks')
      .select('id, title, assigned_to, assignee_ids, hours_spent, uap_category, hub_projects(project_name, stage)')
      .not('hours_spent', 'is', null)
      .or(ids.map(id => `assigned_to.eq.${id},assignee_ids.cs.{${id}}`).join(','));

    const byPerson: Record<string, Record<string, UapTaskContribution[]>> = {};
    for (const row of (taskRows as any[]) ?? []) {
      const cat = resolveUapCategory(row.uap_category, row.hub_projects?.stage ?? null);
      if (!cat || !row.hours_spent) continue;
      const rowAssignees = new Set<string>([...(row.assignee_ids ?? []), ...(row.assigned_to ? [row.assigned_to] : [])]);
      for (const personId of ids) {
        if (!rowAssignees.has(personId)) continue;
        ((byPerson[personId] ??= {})[cat] ??= []).push({
          id: row.id, title: row.title, project_name: row.hub_projects?.project_name ?? 'Unknown', hours: row.hours_spent,
        });
      }
    }
    setUapTasksByPerson(byPerson);
    setUapLoading(false);
  };

  useEffect(() => { if (viewMode === 'uapHours') fetchUapHours(); }, [viewMode]);

  const uapHoursForCategory = (personId: string, category: string) =>
    (uapTasksByPerson[personId]?.[category] ?? []).reduce((sum, t) => sum + t.hours, 0);

  const filteredUapPeople = uapPeople.filter(p => p.full_name.toLowerCase().includes(uapSearch.trim().toLowerCase()));

  const downloadUapCsv = () => {
    const csvCell = (v: unknown) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = ['Employee', 'Department', ...UAP_CATEGORIES.map(c => c.key), 'Total', 'Required', '% Complete'];
    const rows = uapPeople.map(p => {
      const total = UAP_CATEGORIES.reduce((sum, c) => sum + uapHoursForCategory(p.id, c.key), 0);
      return [
        p.full_name, p.department ?? '',
        ...UAP_CATEGORIES.map(c => uapHoursForCategory(p.id, c.key)),
        total, UAP_TOTAL_REQUIRED_HOURS,
        `${Math.min(100, Math.round((total / UAP_TOTAL_REQUIRED_HOURS) * 100))}%`,
      ];
    });
    const csv = [header, ...rows].map(r => r.map(csvCell).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `uap-hours-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const fetchAll = async () => {
    setLoading(true);
    const [tRes, eRes] = await Promise.all([
      supabase.from('hub_teams').select('key, label, color, lead_id, hub_users!lead_id(full_name, avatar_url)').order('label'),
      supabase.from('hub_users').select('id, full_name, avatar_url, department, team, manager_id, role_title, role').eq('status', 'active').neq('is_developer', true).order('full_name'),
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
    if (form.lead_id && form.lead_id !== previousLeadId) {
      await supabase.from('hub_users').update({ team_lead_of: key, team: key }).eq('id', form.lead_id);
      await supabase.from('hub_notifications').insert({
        user_id: form.lead_id,
        type: 'team',
        title: 'Made a team lead',
        body: `You've been made lead of ${form.label.trim()}.`,
        link: '/hub/employee/dashboard',
        read: false,
      });
      // Keep the org chart in sync: re-parent current members onto the new
      // lead, but only those who weren't already explicitly reporting to
      // someone else (i.e. were on the old lead or had no manager set), and
      // never anyone the new lead already (directly or transitively)
      // reports to — that would create a reporting cycle.
      // The owner is always the chart's root and must never be given a
      // manager, even if they're a member of the team being re-led.
      const ancestorsOfNewLead = getAncestorIds(form.lead_id, employees);
      const memberIds = employees
        .filter(e => e.team === key && e.id !== form.lead_id && e.role !== 'owner' && (e.manager_id === previousLeadId || !e.manager_id) && !ancestorsOfNewLead.has(e.id))
        .map(e => e.id);
      if (memberIds.length) {
        await supabase.from('hub_users').update({ manager_id: form.lead_id }).in('id', memberIds);
      }
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
    // Nest them under the team's lead in the org chart too, so the two
    // views stay in sync — unless they're the lead themself, the owner
    // (always the chart's root, never given a manager), or the lead
    // already (transitively) reports to this person, which would cycle.
    const isOwnerMember = employees.find(e => e.id === employeeId)?.role === 'owner';
    const lead = teams.find(t => t.key === teamKey)?.lead_id ?? null;
    const wouldCycle = !!lead && getAncestorIds(lead, employees).has(employeeId);
    const managerUpdate = lead && lead !== employeeId && !isOwnerMember && !wouldCycle ? { manager_id: lead } : {};
    setEmployees(prev => prev.map(e => e.id === employeeId ? { ...e, team: teamKey, ...managerUpdate } : e));
    const { error: addErr } = await supabase.from('hub_users').update({ team: teamKey, ...managerUpdate }).eq('id', employeeId);
    if (addErr) { alert(`Could not add member: ${addErr.message}`); fetchAll(); return; }
    const teamLabel = teams.find(t => t.key === teamKey)?.label ?? 'a team';
    await supabase.from('hub_notifications').insert({
      user_id: employeeId,
      type: 'team',
      title: 'Added to a team',
      body: `You've been assigned to ${teamLabel}.`,
      link: '/hub/employee/dashboard',
      read: false,
    });
  };

  const removeMember = async (employee: Employee, team: Team) => {
    // Clear team, and drop the reporting line back to the root if it was
    // only there because of this team membership (leave explicit
    // reassignments to someone else alone).
    const clearManager = employee.manager_id === team.lead_id;
    setEmployees(prev => prev.map(e => e.id === employee.id ? { ...e, team: null, ...(clearManager ? { manager_id: null } : {}) } : e));
    await supabase.from('hub_users').update({ team: null, ...(clearManager ? { manager_id: null } : {}) }).eq('id', employee.id);
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
          <div className="inline-flex items-center bg-gray-50 rounded-xl p-1">
            {(['teams', 'orgchart', 'uapHours'] as const).map(mode => (
              <button key={mode} onClick={() => setViewMode(mode)}
                className={`px-3.5 py-1.5 rounded-lg text-sm font-medium cursor-pointer transition-colors whitespace-nowrap ${viewMode === mode ? 'bg-white text-[#1c2b3a] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                {mode === 'teams' ? 'Teams' : mode === 'orgchart' ? 'Org Chart' : 'UAP Hours'}
              </button>
            ))}
          </div>
          {viewMode === 'teams' && (
            <button onClick={openNew}
              className="flex items-center gap-1.5 px-4 py-2 bg-[#1c2b3a] text-white rounded-xl text-sm font-medium hover:bg-[#0f1c28] cursor-pointer transition-colors">
              <i className="ri-add-line"></i> New Team
            </button>
          )}
          {viewMode === 'uapHours' && uapPeople.length > 0 && (
            <button onClick={downloadUapCsv}
              className="flex items-center gap-1.5 px-4 py-2 border border-gray-200 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-50 cursor-pointer transition-colors">
              <i className="ri-download-2-line"></i> Download CSV
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><i className="ri-loader-4-line animate-spin text-2xl text-gray-300"></i></div>
        ) : viewMode === 'orgchart' ? (
          <OrgChart people={employees} teams={teams} onChange={fetchAll} />
        ) : viewMode === 'uapHours' ? (
          uapLoading ? (
            <div className="flex justify-center py-16"><i className="ri-loader-4-line animate-spin text-2xl text-gray-300"></i></div>
          ) : uapPeople.length === 0 ? (
            <div className="bg-white border border-gray-100 rounded-xl p-12 text-center">
              <i className="ri-graduation-cap-line text-4xl text-gray-200 mb-3 block"></i>
              <p className="text-sm font-medium text-gray-500">No one is being tracked yet</p>
              <p className="text-xs text-gray-400 mt-1">Turn on "Track UAP Hours" from an employee's profile to add them here.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="relative max-w-xs">
                <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
                <input value={uapSearch} onChange={e => setUapSearch(e.target.value)} placeholder="Search employees..."
                  className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]" />
              </div>
              {filteredUapPeople.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">No employees match "{uapSearch}".</p>
              ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredUapPeople.map(p => {
                const total = UAP_CATEGORIES.reduce((sum, c) => sum + uapHoursForCategory(p.id, c.key), 0);
                const pct = Math.min(100, Math.round((total / UAP_TOTAL_REQUIRED_HOURS) * 100));
                const expanded = expandedUapId === p.id;
                return (
                  <div key={p.id} className="bg-white border border-gray-100 rounded-2xl overflow-hidden self-start">
                    <button type="button" onClick={() => { setExpandedUapId(expanded ? null : p.id); setExpandedUapCategory(null); }}
                      className="w-full flex items-center gap-3 p-4 hover:bg-gray-50/60 cursor-pointer text-left">
                      <HubAvatar fullName={p.full_name} avatarUrl={p.avatar_url} size="w-11 h-11" className="flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-gray-900 truncate">{p.full_name}</p>
                        <p className="text-[11px] text-gray-400 truncate">{p.department || 'Team'}</p>
                        <div className="flex items-center gap-2 mt-1.5">
                          <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-400 rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-[11px] text-gray-500 flex-shrink-0">{total.toLocaleString()} / {UAP_TOTAL_REQUIRED_HOURS.toLocaleString()} hrs</span>
                        </div>
                      </div>
                      <i className={`ri-arrow-${expanded ? 'up' : 'down'}-s-line text-gray-300 flex-shrink-0`}></i>
                    </button>
                    {expanded && (
                      <div className="border-t border-gray-100 p-4 space-y-1">
                        {UAP_CATEGORIES.map(c => {
                          const logged = uapHoursForCategory(p.id, c.key);
                          const met = logged >= c.requiredHours;
                          const catPct = Math.min(100, Math.round((logged / c.requiredHours) * 100));
                          const catKey = `${p.id}:${c.key}`;
                          const catExpanded = expandedUapCategory === catKey;
                          const contributingTasks = uapTasksByPerson[p.id]?.[c.key] ?? [];
                          return (
                            <div key={c.key}>
                              <button type="button" onClick={() => setExpandedUapCategory(catExpanded ? null : catKey)}
                                disabled={contributingTasks.length === 0}
                                className="w-full text-left py-1.5 cursor-pointer disabled:cursor-default">
                                <div className="flex items-center justify-between gap-2 mb-0.5">
                                  <span className="text-[11px] text-gray-600 truncate flex items-center gap-1" title={c.label}>
                                    <span className="font-semibold">{c.key}</span> — {c.label}
                                    {contributingTasks.length > 0 && <i className={`ri-arrow-${catExpanded ? 'up' : 'down'}-s-line text-gray-300`}></i>}
                                  </span>
                                  <span className={`text-[11px] font-semibold flex-shrink-0 ${met ? 'text-emerald-600' : 'text-gray-500'}`}>{logged.toLocaleString()}/{c.requiredHours.toLocaleString()}</span>
                                </div>
                                <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                                  <div className={`h-full rounded-full ${met ? 'bg-emerald-400' : 'bg-sky-300'}`} style={{ width: `${catPct}%` }} />
                                </div>
                              </button>
                              {catExpanded && (
                                <div className="pl-2 pb-2 pt-1 space-y-1 border-l-2 border-gray-100 ml-1">
                                  {contributingTasks.map(t => (
                                    <div key={t.id} className="flex items-center justify-between gap-2">
                                      <div className="min-w-0">
                                        <p className="text-[11px] text-gray-700 truncate">{t.title}</p>
                                        <p className="text-[10px] text-gray-400 truncate">{t.project_name}</p>
                                      </div>
                                      <span className="text-[11px] text-gray-500 flex-shrink-0">{t.hours}h</span>
                                    </div>
                                  ))}
                                </div>
                              )}
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
          )
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
