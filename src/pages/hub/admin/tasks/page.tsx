import { useEffect, useState, useMemo } from 'react';
import AdminLayout from '@/pages/hub/components/AdminLayout';
import HubAvatar from '@/pages/hub/components/HubAvatar';
import { supabase } from '@/lib/supabase';
import { localToday } from '@/lib/formatUtils';

interface Task {
  id: number;
  project_id: number;
  title: string;
  status: 'todo' | 'in_progress' | 'in_review' | 'blocked' | 'done';
  priority: 'low' | 'medium' | 'high';
  assigned_to: string | null;
  due_date: string | null;
  start_date: string | null;
  hub_users: { id: string; full_name: string; avatar_url: string | null } | null;
  hub_projects: { id: number; project_name: string; client_name: string; project_type: string; service: string | null } | null;
}

const STATUS_CFG = {
  todo:        { label: 'To Do',       cls: 'bg-gray-100 text-gray-600',     dot: 'bg-gray-400' },
  in_progress: { label: 'In Progress', cls: 'bg-sky-100 text-sky-700',       dot: 'bg-sky-500' },
  in_review:   { label: 'In Review',   cls: 'bg-violet-100 text-violet-700', dot: 'bg-violet-500' },
  blocked:     { label: 'Blocked',     cls: 'bg-rose-100 text-rose-700',     dot: 'bg-rose-500' },
  done:        { label: 'Done',        cls: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
};

const PRIORITY_CFG = {
  high:   { label: 'High',   cls: 'text-rose-500',   icon: 'ri-arrow-up-line' },
  medium: { label: 'Med',    cls: 'text-amber-500',  icon: 'ri-equal-line' },
  low:    { label: 'Low',    cls: 'text-gray-400',   icon: 'ri-arrow-down-line' },
};

function Avatar({ name, url }: { name: string; url: string | null }) {
  return <HubAvatar fullName={name} avatarUrl={url} size="w-6 h-6" />;
}

export default function AdminTasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('active');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [groupBy, setGroupBy] = useState<'project' | 'status' | 'assignee'>('project');
  const [view, setView] = useState<'list' | 'board'>('list');
  const today = localToday();

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('hub_project_tasks')
        .select('id, project_id, title, status, priority, assigned_to, due_date, start_date, hub_users(id, full_name, avatar_url), hub_projects(id, project_name, client_name, project_type, service)')
        .order('due_date', { ascending: true, nullsFirst: false });
      setTasks((data as Task[]) ?? []);
      setLoading(false);
    })();
  }, []);

  const isOverdue = (t: Task) => t.due_date && t.due_date < today && t.status !== 'done';

  const filtered = useMemo(() => {
    return tasks.filter(t => {
      if (search && !t.title.toLowerCase().includes(search.toLowerCase()) &&
          !t.hub_projects?.project_name.toLowerCase().includes(search.toLowerCase()) &&
          !t.hub_projects?.client_name.toLowerCase().includes(search.toLowerCase())) return false;
      if (statusFilter === 'active') return t.status !== 'done';
      if (statusFilter === 'overdue') return !!isOverdue(t);
      if (statusFilter !== 'all') return t.status === statusFilter;
      if (priorityFilter !== 'all') return t.priority === priorityFilter;
      return true;
    }).filter(t => priorityFilter === 'all' || t.priority === priorityFilter);
  }, [tasks, search, statusFilter, priorityFilter, today]);

  // Project stats
  const projectStats = useMemo(() => {
    const map: Record<number, { name: string; client: string; type: string; total: number; done: number; overdue: number }> = {};
    for (const t of tasks) {
      const pid = t.project_id;
      if (!map[pid]) map[pid] = { name: t.hub_projects?.project_name ?? 'Unknown', client: t.hub_projects?.client_name ?? '', type: t.hub_projects?.project_type ?? 'client', total: 0, done: 0, overdue: 0 };
      map[pid].total++;
      if (t.status === 'done') map[pid].done++;
      if (isOverdue(t)) map[pid].overdue++;
    }
    return map;
  }, [tasks, today]);

  // Group tasks
  const grouped = useMemo(() => {
    if (groupBy === 'project') {
      const map: Record<string, { label: string; sub: string; type: string; tasks: Task[] }> = {};
      for (const t of filtered) {
        const key = String(t.project_id);
        if (!map[key]) map[key] = { label: t.hub_projects?.project_name ?? 'Unknown', sub: t.hub_projects?.client_name ?? '', type: t.hub_projects?.project_type ?? 'client', tasks: [] };
        map[key].tasks.push(t);
      }
      return Object.entries(map).sort((a, b) => a[1].label.localeCompare(b[1].label));
    }
    if (groupBy === 'status') {
      const order = ['blocked', 'in_progress', 'in_review', 'todo', 'done'];
      const map: Record<string, { label: string; sub: string; type: string; tasks: Task[] }> = {};
      for (const t of filtered) {
        const k = t.status;
        if (!map[k]) map[k] = { label: STATUS_CFG[k]?.label ?? k, sub: '', type: k, tasks: [] };
        map[k].tasks.push(t);
      }
      return order.filter(k => map[k]).map(k => [k, map[k]] as [string, typeof map[string]]);
    }
    // assignee
    const map: Record<string, { label: string; sub: string; type: string; tasks: Task[] }> = {};
    for (const t of filtered) {
      const key = t.assigned_to ?? 'unassigned';
      const name = t.hub_users?.full_name ?? 'Unassigned';
      if (!map[key]) map[key] = { label: name, sub: '', type: 'assignee', tasks: [] };
      map[key].tasks.push(t);
    }
    return Object.entries(map).sort((a, b) => a[1].label.localeCompare(b[1].label));
  }, [filtered, groupBy]);

  const totalActive = tasks.filter(t => t.status !== 'done').length;
  const totalDone = tasks.filter(t => t.status === 'done').length;
  const totalOverdue = tasks.filter(t => isOverdue(t)).length;
  const totalBlocked = tasks.filter(t => t.status === 'blocked').length;

  const toggleStatus = async (task: Task) => {
    const next = task.status === 'done' ? 'todo' : 'done';
    await supabase.from('hub_project_tasks').update({ status: next }).eq('id', task.id);
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: next } : t));
  };

  return (
    <AdminLayout title="All Tasks">
      <div className="space-y-5">

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Active', value: totalActive, icon: 'ri-task-line', color: 'text-sky-600', bg: 'bg-sky-50', border: 'border-sky-100' },
            { label: 'Overdue', value: totalOverdue, icon: 'ri-alarm-line', color: 'text-rose-500', bg: 'bg-rose-50', border: 'border-rose-100' },
            { label: 'Blocked', value: totalBlocked, icon: 'ri-forbid-line', color: 'text-[#1c2b3a]/70', bg: 'bg-slate-50', border: 'border-slate-100' },
            { label: 'Completed', value: totalDone, icon: 'ri-checkbox-circle-line', color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100' },
          ].map(s => (
            <div key={s.label} className={`bg-white rounded-xl border ${s.border} p-4`}>
              <div className={`w-8 h-8 ${s.bg} rounded-lg flex items-center justify-center mb-2`}>
                <i className={`${s.icon} ${s.color} text-sm`}></i>
              </div>
              <p className="text-2xl font-bold text-[#111827]">{s.value}</p>
              <p className="text-xs text-gray-400 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Filters + controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative flex-1 min-w-[180px]">
            <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tasks or projects..."
              className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]" />
          </div>

          {/* Status filter */}
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none cursor-pointer">
            <option value="active">Active</option>
            <option value="all">All</option>
            <option value="overdue">Overdue</option>
            <option value="todo">To Do</option>
            <option value="in_progress">In Progress</option>
            <option value="in_review">In Review</option>
            <option value="blocked">Blocked</option>
            <option value="done">Done</option>
          </select>

          {/* Priority filter */}
          <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none cursor-pointer">
            <option value="all">All Priority</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>

          {/* Group by */}
          <select value={groupBy} onChange={e => setGroupBy(e.target.value as typeof groupBy)}
            className="px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none cursor-pointer">
            <option value="project">By Project</option>
            <option value="status">By Status</option>
            <option value="assignee">By Assignee</option>
          </select>

          <span className="text-xs text-gray-400 ml-auto">{filtered.length} task{filtered.length !== 1 ? 's' : ''}</span>
        </div>

        {/* Task list */}
        {loading ? (
          <div className="flex justify-center py-16"><i className="ri-loader-4-line animate-spin text-2xl text-gray-300"></i></div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 py-16 text-center">
            <i className="ri-task-line text-3xl text-gray-200 block mb-2"></i>
            <p className="text-sm text-gray-400">No tasks match this filter</p>
          </div>
        ) : (
          <div className="space-y-4">
            {grouped.map(([key, group]) => {
              const stats = groupBy === 'project' ? projectStats[Number(key)] : null;
              const doneCt = group.tasks.filter(t => t.status === 'done').length;
              const pct = group.tasks.length > 0 ? Math.round((doneCt / group.tasks.length) * 100) : 0;

              return (
                <div key={key} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  {/* Group header */}
                  <div className="px-5 py-3.5 border-b border-gray-50 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                        group.type === 'retainer' ? 'bg-[#1c2b3a]/60' :
                        group.type === 'internal' ? 'bg-gray-400' :
                        group.type === 'blocked' ? 'bg-rose-400' :
                        group.type === 'done' ? 'bg-emerald-400' :
                        group.type === 'in_progress' ? 'bg-sky-400' :
                        'bg-[#1c2b3a]'
                      }`} />
                      <h3 className="font-semibold text-sm text-gray-800 truncate">{group.label}</h3>
                      {group.sub && <span className="text-xs text-gray-400 truncate hidden sm:block">· {group.sub}</span>}
                      <span className="text-xs text-gray-400 flex-shrink-0">{group.tasks.length}</span>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      {stats && (
                        <div className="flex items-center gap-2">
                          <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs text-gray-400">{doneCt}/{group.tasks.length}</span>
                          {stats.overdue > 0 && (
                            <span className="text-[10px] text-rose-500 font-medium">{stats.overdue} overdue</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Task rows */}
                  <div className="divide-y divide-gray-50">
                    {group.tasks.map(t => {
                      const over = isOverdue(t);
                      const sCfg = STATUS_CFG[t.status] ?? STATUS_CFG.todo;
                      const pCfg = PRIORITY_CFG[t.priority] ?? PRIORITY_CFG.medium;
                      return (
                        <div key={t.id} className={`flex items-center gap-3 px-5 py-3 hover:bg-gray-50/60 transition-colors ${over ? 'bg-rose-50/30' : ''}`}>
                          {/* Done toggle */}
                          <button onClick={() => toggleStatus(t)} className="flex-shrink-0 cursor-pointer">
                            <i className={`text-base ${t.status === 'done' ? 'ri-checkbox-circle-fill text-emerald-500' : 'ri-checkbox-blank-circle-line text-gray-300 hover:text-emerald-400'}`}></i>
                          </button>

                          {/* Title + project badge */}
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm truncate ${t.status === 'done' ? 'line-through text-gray-400' : 'text-gray-800'}`}>{t.title}</p>
                            {groupBy !== 'project' && t.hub_projects && (
                              <p className="text-[11px] text-gray-400 truncate mt-0.5">
                                {t.hub_projects.project_name} · {t.hub_projects.client_name}
                              </p>
                            )}
                          </div>

                          {/* Priority */}
                          <div className={`flex-shrink-0 flex items-center gap-0.5 text-[11px] font-medium ${pCfg.cls}`}>
                            <i className={`${pCfg.icon} text-xs`}></i>
                            <span className="hidden sm:block">{pCfg.label}</span>
                          </div>

                          {/* Status badge */}
                          <span className={`hidden sm:block flex-shrink-0 text-[10px] px-2 py-0.5 rounded-full font-semibold ${sCfg.cls}`}>
                            {sCfg.label}
                          </span>

                          {/* Due date */}
                          {t.due_date && (
                            <span className={`flex-shrink-0 text-[11px] font-medium ${over ? 'text-rose-500' : 'text-gray-400'}`}>
                              {over ? '⚠ ' : ''}{new Date(t.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </span>
                          )}

                          {/* Assignee */}
                          {t.hub_users && (
                            <Avatar name={t.hub_users.full_name} url={t.hub_users.avatar_url} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
