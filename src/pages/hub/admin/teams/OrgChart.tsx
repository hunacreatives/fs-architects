import { useState } from 'react';
import HubAvatar from '@/pages/hub/components/HubAvatar';
import { supabase } from '@/lib/supabase';

export interface OrgPerson {
  id: string;
  full_name: string;
  avatar_url: string | null;
  department: string | null;
  team: string | null;
  manager_id: string | null;
  role_title: string | null;
  role: string;
}

interface Team { key: string; label: string; color: string; lead_id?: string | null; }

interface Props {
  people: OrgPerson[];
  teams: Team[];
  onChange: () => void;
  // Read-only, team-scoped view: pass just that team's people plus the
  // team's lead id as the root. Regular full-company mode (owner/admin only,
  // editable) omits these and defaults to the owner as root.
  rootId?: string;
  readOnly?: boolean;
}

// Everyone eventually traces back to the root — anyone in the given people
// list without an explicit manager_id inside that same list (other than the
// root itself) renders as a direct report of the root by default, so the
// chart always has exactly one root without needing to backfill manager_id
// for everyone up front. This also naturally scopes a team's read-only view:
// pass only that team's members and someone whose real manager is outside
// the team just falls back to appearing under the team's lead instead.
function getChildren(person: OrgPerson, all: OrgPerson[], rootId: string): OrgPerson[] {
  const direct = all.filter(p => p.manager_id === person.id);
  if (person.id === rootId) {
    direct.push(...all.filter(p => (!p.manager_id || !all.some(x => x.id === p.manager_id)) && p.id !== rootId));
  }
  return direct;
}

// Descendants of `personId` — used to keep the "Reports To" picker from
// offering someone whose promotion would create a reporting cycle.
function getDescendantIds(personId: string, all: OrgPerson[]): Set<string> {
  const out = new Set<string>();
  const walk = (id: string) => {
    all.filter(p => p.manager_id === id).forEach(child => {
      if (!out.has(child.id)) { out.add(child.id); walk(child.id); }
    });
  };
  walk(personId);
  return out;
}

function OrgNode({ person, all, rootId, teams, depth, readOnly, onAddReport, onEdit }: {
  person: OrgPerson; all: OrgPerson[]; rootId: string; teams: Team[]; depth: number;
  readOnly?: boolean;
  onAddReport?: (managerId: string) => void;
  onEdit?: (person: OrgPerson) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const children = getChildren(person, all, rootId);
  const teamMeta = teams.find(t => t.key === person.team);
  const isRoot = person.id === rootId;

  return (
    <div className={depth > 0 ? 'pl-6 border-l-2 border-gray-100 ml-3.5' : ''}>
      <div className="flex items-center gap-2.5 py-2 group">
        {children.length > 0 ? (
          <button onClick={() => setExpanded(v => !v)} className="w-5 h-5 flex items-center justify-center text-gray-300 hover:text-gray-600 cursor-pointer flex-shrink-0">
            <i className={`ri-arrow-${expanded ? 'down' : 'right'}-s-line`}></i>
          </button>
        ) : <span className="w-5 flex-shrink-0" />}

        <div className="relative flex-shrink-0">
          <HubAvatar fullName={person.full_name} avatarUrl={person.avatar_url} size={isRoot ? 'w-10 h-10' : 'w-8 h-8'} />
          {teamMeta && (
            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white" style={{ background: teamMeta.color }} title={teamMeta.label}></span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className={`font-semibold text-gray-900 truncate ${isRoot ? 'text-base' : 'text-sm'}`}>{person.full_name}</p>
          <p className="text-xs text-gray-400 truncate">{person.role_title || (person.role === 'owner' ? 'Owner' : person.department || '—')}</p>
        </div>

        {!readOnly && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <button onClick={() => onAddReport?.(person.id)} title="Add a direct report"
              className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-[#1c2b3a] hover:bg-gray-50 rounded-lg cursor-pointer">
              <i className="ri-user-add-line text-sm"></i>
            </button>
            {person.role !== 'owner' && (
              <button onClick={() => onEdit?.(person)} title="Edit role, team, or reports-to"
                className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-[#1c2b3a] hover:bg-gray-50 rounded-lg cursor-pointer">
                <i className="ri-pencil-line text-sm"></i>
              </button>
            )}
          </div>
        )}
      </div>

      {expanded && children.length > 0 && (
        <div>
          {children.map(child => (
            <OrgNode key={child.id} person={child} all={all} rootId={rootId} teams={teams} depth={depth + 1} readOnly={readOnly} onAddReport={onAddReport} onEdit={onEdit} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function OrgChart({ people, teams, onChange, rootId, readOnly }: Props) {
  const owner = people.find(p => p.role === 'owner');
  const effectiveRootId = rootId ?? owner?.id;
  const [addReportFor, setAddReportFor] = useState<string | null>(null);
  const [addEmployeeId, setAddEmployeeId] = useState('');
  const [addRoleTitle, setAddRoleTitle] = useState('');
  const [editing, setEditing] = useState<OrgPerson | null>(null);
  const [editRoleTitle, setEditRoleTitle] = useState('');
  const [editManagerId, setEditManagerId] = useState('');
  const [editTeam, setEditTeam] = useState('');
  const [saving, setSaving] = useState(false);

  const root = people.find(p => p.id === effectiveRootId);
  if (!root) {
    return <div className="bg-white border border-gray-100 rounded-xl p-12 text-center text-sm text-gray-400">Nothing to show yet.</div>;
  }

  const openAddReport = (managerId: string) => { setAddReportFor(managerId); setAddEmployeeId(''); setAddRoleTitle(''); };
  const openEdit = (person: OrgPerson) => {
    setEditing(person);
    setEditRoleTitle(person.role_title ?? '');
    setEditManagerId(person.manager_id ?? effectiveRootId ?? '');
    setEditTeam(person.team ?? '');
  };

  const submitAddReport = async () => {
    if (!addReportFor || !addEmployeeId) return;
    setSaving(true);
    const managerName = people.find(p => p.id === addReportFor)?.full_name ?? 'someone';
    await supabase.from('hub_users').update({ manager_id: addReportFor, role_title: addRoleTitle.trim() || null }).eq('id', addEmployeeId);
    await supabase.from('hub_notifications').insert({
      user_id: addEmployeeId,
      type: 'team',
      title: 'Reporting line updated',
      body: `You now report to ${managerName}${addRoleTitle.trim() ? ` as ${addRoleTitle.trim()}` : ''}.`,
      link: '/hub/employee/dashboard',
      read: false,
    });
    setSaving(false);
    setAddReportFor(null);
    onChange();
  };

  const submitEdit = async () => {
    if (!editing) return;
    setSaving(true);
    let newManagerId = editManagerId || root.id;
    const managerChanged = newManagerId !== (editing.manager_id ?? root.id);
    const titleChanged = (editRoleTitle.trim() || null) !== editing.role_title;
    const newTeam = editTeam || null;
    const teamChanged = newTeam !== (editing.team ?? null);
    // Keep the Teams page in sync: if the team changed and "Reports To"
    // wasn't also explicitly changed, nest them under that team's lead.
    if (teamChanged && !managerChanged) {
      const leadId = teams.find(t => t.key === newTeam)?.lead_id;
      if (leadId && leadId !== editing.id) newManagerId = leadId;
    }
    await supabase.from('hub_users').update({
      manager_id: newManagerId === root.id ? null : newManagerId,
      role_title: editRoleTitle.trim() || null,
      team: newTeam,
    }).eq('id', editing.id);
    if (managerChanged || titleChanged) {
      const managerName = people.find(p => p.id === newManagerId)?.full_name ?? root.full_name;
      await supabase.from('hub_notifications').insert({
        user_id: editing.id,
        type: 'team',
        title: 'Reporting line updated',
        body: `You now report to ${managerName}${editRoleTitle.trim() ? ` as ${editRoleTitle.trim()}` : ''}.`,
        link: '/hub/employee/dashboard',
        read: false,
      });
    }
    if (teamChanged) {
      const teamLabel = teams.find(t => t.key === newTeam)?.label ?? null;
      await supabase.from('hub_notifications').insert({
        user_id: editing.id,
        type: 'team',
        title: teamLabel ? 'Added to a team' : 'Removed from team',
        body: teamLabel ? `You've been assigned to ${teamLabel}.` : 'You are no longer assigned to a team.',
        link: '/hub/employee/dashboard',
        read: false,
      });
    }
    setSaving(false);
    setEditing(null);
    onChange();
  };

  const removeFromChart = async () => {
    if (!editing) return;
    setSaving(true);
    await supabase.from('hub_users').update({ manager_id: null }).eq('id', editing.id);
    setSaving(false);
    setEditing(null);
    onChange();
  };

  // Exclude self + descendants from the "Reports To" picker to prevent cycles.
  const invalidManagerIds = editing ? new Set([editing.id, ...getDescendantIds(editing.id, people)]) : new Set<string>();
  const addReportOptions = people.filter(p => p.id !== addReportFor);

  return (
    <div className="bg-white border border-gray-100 rounded-xl p-5 overflow-x-auto">
      <OrgNode person={root} all={people} rootId={root.id} teams={teams} depth={0} readOnly={readOnly} onAddReport={openAddReport} onEdit={openEdit} />

      {addReportFor && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="font-semibold text-[#111827]">Add Direct Report</h2>
              <button onClick={() => setAddReportFor(null)} className="text-gray-400 hover:text-gray-600 cursor-pointer">
                <i className="ri-close-line text-lg"></i>
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-700">Person</label>
                <select value={addEmployeeId} onChange={e => setAddEmployeeId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none bg-white">
                  <option value="">Select someone...</option>
                  {addReportOptions.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-700">Custom Role (optional)</label>
                <input value={addRoleTitle} onChange={e => setAddRoleTitle(e.target.value)}
                  placeholder="e.g. Design Lead"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]" />
              </div>
            </div>
            <div className="flex gap-2 p-5 pt-0">
              <button onClick={() => setAddReportFor(null)} className="flex-1 py-2.5 text-sm border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 cursor-pointer">Cancel</button>
              <button disabled={saving || !addEmployeeId} onClick={submitAddReport}
                className="flex-1 py-2.5 text-sm bg-[#1c2b3a] text-white rounded-lg hover:bg-[#0f1c28] disabled:opacity-60 cursor-pointer font-medium">
                {saving ? 'Saving…' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="font-semibold text-[#111827]">{editing.full_name}</h2>
              <button onClick={() => setEditing(null)} className="text-gray-400 hover:text-gray-600 cursor-pointer">
                <i className="ri-close-line text-lg"></i>
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-700">Custom Role</label>
                <input value={editRoleTitle} onChange={e => setEditRoleTitle(e.target.value)}
                  placeholder="e.g. Design Lead"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-700">Reports To</label>
                <select value={editManagerId} onChange={e => setEditManagerId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none bg-white">
                  {people.filter(p => !invalidManagerIds.has(p.id)).map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-700">Team</label>
                <select value={editTeam} onChange={e => setEditTeam(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none bg-white">
                  <option value="">Unassigned</option>
                  {teams.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-2 p-5 pt-0">
              <button onClick={removeFromChart} disabled={saving} title="Reset to reporting directly to the owner"
                className="py-2.5 px-3 text-sm border border-rose-200 text-rose-600 rounded-lg hover:bg-rose-50 cursor-pointer disabled:opacity-60">
                Reset
              </button>
              <button onClick={() => setEditing(null)} className="flex-1 py-2.5 text-sm border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 cursor-pointer">Cancel</button>
              <button disabled={saving} onClick={submitEdit}
                className="flex-1 py-2.5 text-sm bg-[#1c2b3a] text-white rounded-lg hover:bg-[#0f1c28] disabled:opacity-60 cursor-pointer font-medium">
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
