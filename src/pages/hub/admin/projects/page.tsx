import { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import AdminLayout from '@/pages/hub/components/AdminLayout';
import HubAvatar from '@/pages/hub/components/HubAvatar';
import { GanttTimeline } from '@/pages/hub/components/GanttTimeline';
import { supabase } from '@/lib/supabase';
import { createHubNotifications } from '@/lib/hubNotifications';
import { useHubAuth as useAuth } from '@/hooks/useHubAuth';
import { useDemo } from '@/contexts/DemoContext';
import { logAudit } from '@/lib/audit';
import { localToday, isTaskOverdue } from '@/lib/formatUtils';
import { DEMO_PROJECTS, DEMO_CONTRACTORS } from '@/lib/demoData';
import TaskDetailPanel, { type TaskDetailTask } from '@/pages/hub/components/TaskDetailPanel';
import { getTaskDescriptionPreview } from '@/pages/hub/utils/taskPreview';
import { getPrimaryTaskAssigneeId, getTaskAssigneeIds } from '@/lib/taskAssignments';

const servicePalette: Record<string, { from: string; to: string }> = {
  'Architecture':             { from: '#38bdf8', to: '#0284c7' },
  'Interior Design':          { from: '#fbbf24', to: '#d97706' },
  'Design & Drafting':        { from: '#22d3ee', to: '#0891b2' },
  'Project Management':       { from: '#34d399', to: '#059669' },
  'Construction Admin':       { from: '#fb7185', to: '#e11d48' },
  'Feasibility Study':        { from: '#f472b6', to: '#db2777' },
  'Design-Build':             { from: '#1c2b3a', to: '#0f172a' },
  'Renovation':               { from: '#2dd4bf', to: '#0d9488' },
  'Consultation':             { from: '#94a3b8', to: '#64748b' },
  'Other':                    { from: '#9ca3af', to: '#6b7280' },
};
const getServicePalette = (service: string | null | undefined) => servicePalette[service ?? ''] ?? servicePalette['Other'];
const fmtDate = (d: string | null | undefined, fallback = '—') => {
  if (!d) return fallback;
  const s = d.length === 10 ? d + 'T00:00:00' : d;
  const dt = new Date(s);
  return isNaN(dt.getTime()) ? fallback : dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const serviceCfg: Record<string, { border: string; dot: string; badge: string }> = {
  'Architecture':             { border: 'border-l-sky-400',     dot: 'bg-sky-400',     badge: 'bg-sky-50 text-sky-700' },
  'Interior Design':          { border: 'border-l-amber-400',   dot: 'bg-amber-400',   badge: 'bg-amber-50 text-amber-700' },
  'Design & Drafting':        { border: 'border-l-cyan-400',    dot: 'bg-cyan-400',    badge: 'bg-cyan-50 text-cyan-700' },
  'Project Management':       { border: 'border-l-emerald-400', dot: 'bg-emerald-400', badge: 'bg-emerald-50 text-emerald-700' },
  'Construction Admin':       { border: 'border-l-rose-400',    dot: 'bg-rose-400',    badge: 'bg-rose-50 text-rose-700' },
  'Feasibility Study':        { border: 'border-l-pink-400',    dot: 'bg-pink-400',    badge: 'bg-pink-50 text-pink-700' },
  'Design-Build':             { border: 'border-l-[#1c2b3a]/60', dot: 'bg-[#1c2b3a]/50', badge: 'bg-slate-100 text-[#1c2b3a]' },
  'Renovation':               { border: 'border-l-teal-400',    dot: 'bg-teal-400',    badge: 'bg-teal-50 text-teal-700' },
  'Consultation':             { border: 'border-l-slate-400',   dot: 'bg-slate-400',   badge: 'bg-slate-50 text-slate-700' },
  'Other':                    { border: 'border-l-gray-300',    dot: 'bg-gray-300',    badge: 'bg-gray-50 text-gray-500' },
};
const getServiceCfg = (service: string | null) => serviceCfg[service ?? ''] ?? serviceCfg['Other'];

const statusCfg: Record<string, { label: string; cls: string }> = {
  ongoing:   { label: 'Ongoing',   cls: 'bg-sky-100 text-sky-700' },
  completed: { label: 'Completed', cls: 'bg-emerald-100 text-emerald-700' },
  paused:    { label: 'Paused',    cls: 'bg-amber-100 text-amber-700' },
  cancelled: { label: 'Cancelled', cls: 'bg-gray-100 text-gray-500' },
};

const STAGES = [
  'Pre-Design', 'Schematic Design', 'Design Development', 'Construction Documents',
  'Permitting', 'Bidding/Procurement', 'Construction Administration', 'Post-Construction/Closeout',
];

const stageCfg: Record<string, { badge: string }> = Object.fromEntries(
  STAGES.map(s => [s, { badge: 'bg-violet-50 text-violet-700' }])
);
const getStageCfg = (stage: string | null | undefined) => stageCfg[stage ?? ''] ?? stageCfg['Pre-Design'];

const SIDEBAR_STATUS_OPTIONS = [
  { value: 'todo',        label: 'To Do',       dot: 'bg-gray-300' },
  { value: 'in_progress', label: 'In Progress', dot: 'bg-sky-400' },
  { value: 'in_review',   label: 'In Review',   dot: 'bg-violet-400' },
  { value: 'blocked',     label: 'Blocked',     dot: 'bg-rose-400' },
  { value: 'done',        label: 'Done',        dot: 'bg-emerald-400' },
];

function sidebarStatusIcon(status: string, completing: boolean) {
  if (completing) return <i className="ri-checkbox-circle-fill text-emerald-500 text-xl flex-shrink-0" />;
  if (status === 'done') return <i className="ri-checkbox-circle-fill text-emerald-400 text-xl flex-shrink-0" />;
  if (status === 'in_progress') return <i className="ri-loader-4-line animate-spin text-sky-400 text-xl flex-shrink-0" />;
  if (status === 'blocked') return <i className="ri-close-circle-line text-rose-400 text-xl flex-shrink-0" />;
  if (status === 'in_review') return <i className="ri-eye-line text-violet-400 text-xl flex-shrink-0" />;
  return <i className="ri-circle-line text-gray-300 text-xl flex-shrink-0" />;
}

interface Project {
  id: number; client_name: string; project_name: string; service: string | null;
  project_type: 'client' | 'internal';
  status: string; stage: string; start_date: string | null; deadline: string | null; notes: string | null; contact_email: string | null;
  hub_project_contractors: {
    id: number;
    project_role?: string | null;
    hub_users: { id: string; full_name: string; avatar_url: string | null; email: string | null };
  }[];
}

interface Contractor { id: string; full_name: string; avatar_url: string | null; department: string | null; }

interface ProjectTask {
  id: number;
  project_id: number;
  title: string;
  description: string | null;
  status: 'todo' | 'in_progress' | 'in_review' | 'blocked' | 'done';
  priority: 'low' | 'medium' | 'high';
  assigned_to: string | null;
  assignee_ids?: string[] | null;
  due_date: string | null;
  start_date: string | null;
  created_at: string;
  hub_users?: { id: string; full_name: string; avatar_url: string | null } | null;
  meta?: { custom_fields?: {id: string; label: string; value: string}[] } | null;
  archived?: boolean | null;
  archived_at?: string | null;
  deleted_at?: string | null;
  sort_order?: number | null;
}

interface ProjectActivity {
  id: number;
  project_id: number;
  actor_name?: string;
  user_id?: string;
  action?: string;
  entity_type?: string;
  entity_id?: number | null;
  entity_title?: string | null;
  description?: string;
  meta?: Record<string, unknown> | null;
  created_at: string;
  hub_users?: { id: string; full_name: string; avatar_url: string | null } | null;
}

function normalizeTaskActivityDescription(row: { actor_name: string; type: string; description: string; task_title?: string | null }) {
  const title = row.task_title ? `"${row.task_title}"` : 'this task';
  switch (row.type) {
    case 'created':
      return `${row.actor_name} created ${title}`;
    case 'status_change':
      return `${row.actor_name} ${row.description} on ${title}`;
    case 'assigned':
      return `${row.actor_name} ${row.description} on ${title}`;
    case 'comment_added':
      return `${row.actor_name} commented on ${title}`;
    case 'attachment_added':
      return `${row.actor_name} ${row.description} on ${title}`;
    default:
      return `${row.actor_name} ${row.description} on ${title}`;
  }
}

function getProjectActivityActorName(activity: ProjectActivity) {
  return activity.actor_name ?? activity.hub_users?.full_name ?? 'Someone';
}

function getProjectActivityDescription(activity: ProjectActivity) {
  if (activity.description) return activity.description;
  const actor = getProjectActivityActorName(activity);
  const title = activity.entity_title ? `"${activity.entity_title}"` : 'this item';
  switch (activity.action) {
    case 'task_created':
      return `${actor} created ${title}`;
    case 'task_status_changed':
      if (activity.meta?.to) {
        return `${actor} moved ${title} to ${String(activity.meta.to).replace(/_/g, ' ')}`;
      }
      return `${actor} updated ${title}`;
    case 'task_assigned':
      return `${actor} assigned ${title}`;
    case 'comment_added':
      return `${actor} commented on ${title}`;
    case 'attachment_added':
      return `${actor} added an attachment to ${title}`;
    case 'task_deleted':
      return `${actor} deleted ${title}`;
    case 'custom':
      return activity.meta?.message ? String(activity.meta.message) : `${actor} updated ${title}`;
    default:
      return activity.action ? `${actor} ${activity.action.replace(/_/g, ' ')} ${title}` : `${actor} updated ${title}`;
  }
}

function Avatar({ name, url }: { name: string; url?: string | null }) {
  return <HubAvatar fullName={name} avatarUrl={url} size="w-7 h-7" />;
}

export default function AdminProjectsPage() {
  const { hubUser } = useAuth();
  const { isDemo } = useDemo();
  const [searchParams, setSearchParams] = useSearchParams();
  const [projects, setProjects] = useState<Project[]>([]);
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [sidebarScope, setSidebarScope] = useState<'mine' | 'everyone'>('everyone');
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [sidebarTaskCompleting, setSidebarTaskCompleting] = useState<number | null>(null);
  const [sidebarStatusMenuFor, setSidebarStatusMenuFor] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'all' | 'ongoing' | 'paused' | 'completed' | 'cancelled'>('ongoing');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [pageView, setPageView] = useState<'projects' | 'tasks'>('projects');
  const [allTasks, setAllTasks] = useState<any[]>([]);
  const [allTasksLoading, setAllTasksLoading] = useState(false);
  const [taskStatusFilter, setTaskStatusFilter] = useState('active');
  const [taskGroupBy, setTaskGroupBy] = useState<'project' | 'assignee'>('project');
  const [pendingTaskDate, setPendingTaskDate] = useState<string | null>(null);
  const [taskSearch, setTaskSearch] = useState('');
  const [projectTypeFilter, setProjectTypeFilter] = useState<'all' | 'client' | 'internal'>('all');
  const [activeId, setActiveId] = useState<number | null>(() => {
    const w = searchParams.get('w');
    return w ? parseInt(w) : null;
  });
  // Project form
  const SERVICES = ['Architecture', 'Interior Design', 'Design & Drafting', 'Project Management', 'Construction Admin', 'Feasibility Study', 'Design-Build', 'Renovation', 'Consultation', 'Other'];
  const emptyForm = { project_type: 'client' as 'client' | 'internal', client_name: '', project_name: '', service: 'Architecture', status: 'ongoing', stage: 'Pre-Design', start_date: '', deadline: '', notes: '', contact_email: '', drive_url: '' };
  const [showForm, setShowForm] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // Contractor assignment
  const [addCtxId, setAddCtxId] = useState('');
  const [addCtxRole, setAddCtxRole] = useState('');
  const [ctxSaving, setCtxSaving] = useState(false);
  const [ctxAddError, setCtxAddError] = useState('');

  // Tasks
  const [tasks, setTasks] = useState<ProjectTask[]>([]);
  const [commentCounts, setCommentCounts] = useState<Record<number,number>>({});
  const [taskFilter, setTaskFilter] = useState<'all' | 'todo' | 'in_progress' | 'in_review' | 'blocked' | 'done' | 'overdue'>('all');
  const [showArchivedTasks, setShowArchivedTasks] = useState(false);
  const [taskView, setTaskView] = useState<'list' | 'board'>('list');
  const [draggedTaskId, setDraggedTaskId] = useState<number | null>(null);
  const [boardDragOver, setBoardDragOver] = useState<ProjectTask['status'] | null>(null);
  const [listDragOverTaskId, setListDragOverTaskId] = useState<number | null>(null);
  const [listDragOverPos, setListDragOverPos] = useState<'above' | 'below' | null>(null);
  const listDragFromHandle = useRef(false);

  // Task detail panel
  const [detailTask, setDetailTask] = useState<TaskDetailTask | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const openTaskDetail = (task: ProjectTask) => { setDetailTask(task as TaskDetailTask); setDetailOpen(true); };
  const openNewTask = () => { setDetailTask(null); setDetailOpen(true); };

  // Activity
  const [activity, setActivity] = useState<ProjectActivity[]>([]);

  // Workspace overlay
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const openWorkspaceOnLoad = useRef(false);
  const detailPanelRef = useRef<HTMLDivElement>(null);

  // Open a task's workspace, then its detail panel once the workspace has mounted.
  const openTaskInWorkspace = (t: {
    id: number; project_id: number; title: string; status: string; priority: string;
    due_date: string | null; start_date?: string | null; assigned_to?: string | null; assignee_ids?: string[] | null;
  }) => {
    const proj = projects.find(pr => pr.id === t.project_id);
    if (!proj) return;
    openWorkspaceOnLoad.current = true;
    setActiveId(proj.id);
    setWorkspaceOpen(true);
    setTimeout(() => openTaskDetail({
      id: t.id, project_id: t.project_id, title: t.title, description: null,
      status: t.status as ProjectTask['status'], priority: t.priority as ProjectTask['priority'],
      assigned_to: t.assigned_to ?? null, assignee_ids: t.assignee_ids ?? null,
      due_date: t.due_date, start_date: t.start_date ?? null,
      created_at: new Date().toISOString(), archived: false, archived_at: null,
    } as any), 400);
  };

  // Sidebar quick status change. Marking done animates, then the row drops out
  // of the open-tasks list on the next render (status filter takes over).
  const updateSidebarTaskStatus = async (taskId: number, newStatus: string) => {
    let metaPatch: Record<string, unknown> = {};
    if (newStatus === 'blocked') {
      const reason = window.prompt("What's blocking this task? (visible to the team)");
      if (reason === null) return;
      const { data: cur } = await supabase.from('hub_project_tasks').select('meta').eq('id', taskId).maybeSingle();
      metaPatch = { meta: { ...((cur?.meta as any) ?? {}), blocked_reason: reason.trim() } };
    }
    if (newStatus === 'done') {
      setSidebarTaskCompleting(taskId);
      await supabase.from('hub_project_tasks').update({ status: 'done' }).eq('id', taskId);
      setTimeout(() => {
        setAllTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: 'done' } : t));
        setSidebarTaskCompleting(null);
      }, 1800);
    } else {
      await supabase.from('hub_project_tasks').update({ status: newStatus, ...metaPatch }).eq('id', taskId);
      setAllTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t));
    }
  };
  // Collapsed task groups in workspace
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const fetchTasks = async (projectId: number) => {
    const [tRes, aRes] = await Promise.all([
      supabase.from('hub_project_tasks')
        .select('*')
        .eq('project_id', projectId)
        .is('deleted_at', null)
        .order('sort_order', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true }),
      supabase.from('hub_project_activity')
        .select('*, hub_users(full_name, avatar_url)')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(20),
    ]);
    if (tRes.error) {
      // Don't wipe out already-loaded tasks on a failed refetch (e.g. the
      // deleted_at column not existing yet on this environment's DB).
      console.error('Fetch tasks error:', tRes.error);
      return;
    }
    setTasks((tRes.data as ProjectTask[]) ?? []);
    const taskRows = (tRes.data as ProjectTask[]) ?? [];
    // Fetch comment counts for all tasks
    if (taskRows.length) {
      const ids = taskRows.map(t => t.id);
      supabase.from('hub_project_task_comments').select('task_id').in('task_id', ids)
        .then(({ data }) => {
          const counts: Record<number,number> = {};
          for (const r of data ?? []) counts[r.task_id] = (counts[r.task_id] ?? 0) + 1;
          setCommentCounts(counts);
        });
      const { data: taskActivityRows } = await supabase
        .from('hub_project_task_activity')
        .select('id, task_id, actor_name, type, description, created_at')
        .in('task_id', ids)
        .order('created_at', { ascending: false })
        .limit(20);
      const taskTitleMap = Object.fromEntries(taskRows.map((task) => [task.id, task.title]));
      const mergedActivity = [
        ...((aRes.data as ProjectActivity[]) ?? []),
        ...((taskActivityRows ?? []).map((row: any) => ({
          id: Number(`9${row.id}`),
          project_id: projectId,
          actor_name: row.actor_name,
          description: normalizeTaskActivityDescription({
            actor_name: row.actor_name,
            type: row.type,
            description: row.description,
            task_title: taskTitleMap[row.task_id] ?? null,
          }),
          created_at: row.created_at,
        })) as ProjectActivity[]),
      ]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 20);
      setActivity(mergedActivity);
      return;
    }
    setActivity((aRes.data as ProjectActivity[]) ?? []);
  };

  const refreshWorkspaceActivity = useCallback(async () => {
    if (!activeId) {
      setActivity([]);
      return;
    }

    const projectTaskIds = tasks
      .filter((task) => task.project_id === activeId)
      .map((task) => task.id);

    const { data: projectActivityRows } = await supabase
      .from('hub_project_activity')
      .select('*, hub_users(full_name, avatar_url)')
      .eq('project_id', activeId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (!projectTaskIds.length) {
      setActivity((projectActivityRows as ProjectActivity[]) ?? []);
      return;
    }

    const taskTitleMap = Object.fromEntries(
      tasks
        .filter((task) => task.project_id === activeId)
        .map((task) => [task.id, task.title])
    );

    const { data: taskActivityRows } = await supabase
      .from('hub_project_task_activity')
      .select('id, task_id, actor_name, type, description, created_at')
      .in('task_id', projectTaskIds)
      .order('created_at', { ascending: false })
      .limit(20);

    const mergedActivity = [
      ...((projectActivityRows as ProjectActivity[]) ?? []),
      ...((taskActivityRows ?? []).map((row: any) => ({
        id: Number(`9${row.id}`),
        project_id: activeId,
        actor_name: row.actor_name,
        description: normalizeTaskActivityDescription({
          actor_name: row.actor_name,
          type: row.type,
          description: row.description,
          task_title: taskTitleMap[row.task_id] ?? null,
        }),
        created_at: row.created_at,
      })) as ProjectActivity[]),
    ]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 20);

    setActivity(mergedActivity);
  }, [activeId, tasks]);

  const logActivity = async (projectId: number, description: string) => {
    if (isDemo) return;

    const newPayload = {
      project_id: projectId,
      user_id: hubUser?.id ?? null,
      action: 'custom',
      entity_type: 'project',
      entity_id: null,
      entity_title: null,
      meta: { message: description },
    };

    const { error } = await supabase.from('hub_project_activity').insert(newPayload);
    if (error) {
      await supabase.from('hub_project_activity').insert({
        project_id: projectId,
        actor_id: hubUser?.id ?? null,
        actor_name: hubUser?.full_name ?? 'Admin',
        description,
      });
    }
  };

  const updateTaskStatus = async (task: ProjectTask, newStatus: ProjectTask['status']) => {
    if (task.status === newStatus || isDemo) return;
    await supabase.from('hub_project_tasks').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', task.id);
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: newStatus } : t));
    const statusLabel = newStatus.replace('_', ' ');
    await logActivity(task.project_id, `${hubUser?.full_name ?? 'Admin'} moved "${task.title}" to ${statusLabel}`);
    if (newStatus === 'done') fetchTasks(task.project_id);
  };

  const toggleTask = async (task: ProjectTask) => {
    const next = task.status === 'done' ? 'todo' : task.status === 'todo' ? 'in_progress' : 'done';
    await updateTaskStatus(task, next);
  };

  const reorderTasks = async (orderedIds: number[]) => {
    const orderedSet = new Set(orderedIds);
    // Sort all current tasks by their existing sort_order / created_at
    const currentSorted = [...tasks].sort((a, b) => {
      if (a.sort_order != null && b.sort_order != null) return a.sort_order - b.sort_order;
      if (a.sort_order != null) return -1;
      if (b.sort_order != null) return 1;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
    // Non-group tasks keep their relative order; find where the group sits
    const nonGroup = currentSorted.filter(t => !orderedSet.has(t.id));
    const firstGroupOriginalIdx = currentSorted.findIndex(t => orderedSet.has(t.id));
    let insertAt = 0;
    for (const t of currentSorted.slice(0, firstGroupOriginalIdx)) {
      if (!orderedSet.has(t.id)) insertAt++;
    }
    const groupTasks = orderedIds.map(id => tasks.find(t => t.id === id)!).filter(Boolean);
    const fullOrder = [...nonGroup.slice(0, insertAt), ...groupTasks, ...nonGroup.slice(insertAt)];
    const newTasks = fullOrder.map((t, i) => ({ ...t, sort_order: i + 1 }));
    setTasks(newTasks);
    await Promise.all(newTasks.map(t =>
      supabase.from('hub_project_tasks').update({ sort_order: t.sort_order }).eq('id', t.id)
    ));
  };

  const fetchAllTasks = async () => {
    setAllTasksLoading(true);
    const [tasksRes, projectsRes] = await Promise.all([
      supabase.from('hub_project_tasks').select('id, project_id, title, status, priority, assigned_to, assignee_ids, due_date, start_date, color, archived').is('deleted_at', null).order('due_date', { ascending: true, nullsFirst: false }),
      supabase.from('hub_projects').select('id, project_name, client_name, project_type'),
    ]);
    if (tasksRes.error) {
      console.error('Fetch all tasks error:', tasksRes.error);
      setAllTasksLoading(false);
      return;
    }
    const projectMap: Record<number, any> = Object.fromEntries((projectsRes.data ?? []).map((p: any) => [p.id, p]));
    const userIds = [...new Set((tasksRes.data ?? []).flatMap((t: any) => getTaskAssigneeIds(t)).filter(Boolean))];
    const usersRes = userIds.length ? await supabase.from('hub_users').select('id, full_name, avatar_url').in('id', userIds) : { data: [] };
    const userMap: Record<string, any> = Object.fromEntries((usersRes.data ?? []).map((u: any) => [u.id, u]));
    setAllTasks((tasksRes.data ?? []).map((t: any) => ({
      ...t,
      project: projectMap[t.project_id] ?? null,
      assignee: getPrimaryTaskAssigneeId(t) ? userMap[getPrimaryTaskAssigneeId(t)!] ?? null : null,
      assignees: getTaskAssigneeIds(t).map((id) => userMap[id]).filter(Boolean),
    })));
    setAllTasksLoading(false);
  };

  const fetchAll = async () => {
    const [pRes, cRes] = await Promise.all([
      supabase.from('hub_projects')
        .select('*, hub_project_contractors(id, project_role, hub_users(id, full_name, avatar_url, email))')
        .order('created_at', { ascending: false }),
      supabase.from('hub_users').select('id, full_name, avatar_url, department')
        .eq('status', 'active').order('full_name'),
    ]);
    setProjects((pRes.data as Project[]) ?? []);
    setContractors((cRes.data as Contractor[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    if (isDemo) {
      setProjects(DEMO_PROJECTS as unknown as Project[]);
      setContractors(DEMO_CONTRACTORS.map(c => ({ id: c.id, full_name: c.full_name, avatar_url: null, department: c.department || null })));
      setLoading(false);
      return;
    }
    fetchAll();
    fetchAllTasks();
  }, [isDemo]);

  const activeProject = projects.find(p => p.id === activeId) ?? null;

  const openSidebarTasks = allTasks
    .filter((t: any) => t.status !== 'done' && !t.archived)
    .sort((a: any, b: any) => (a.due_date ?? '9999-99-99').localeCompare(b.due_date ?? '9999-99-99'));
  const sidebarTasks = sidebarScope === 'mine' && hubUser?.id
    ? openSidebarTasks.filter((t: any) => getTaskAssigneeIds(t).includes(hubUser.id))
    : openSidebarTasks;

  const isInternalProject = (project: Project | null | undefined) => project?.project_type === 'internal';

  const getProjectHealth = (
    project: Project,
    teamCount: number,
    tasksDone: number,
    tasksTotal: number,
    today: string,
  ): string => {
    if (project.status === 'cancelled' || project.status === 'archived') return 'Archived';
    if (project.status === 'completed') return 'Completed';
    if (teamCount === 0) return 'No team assigned';
    if (tasksTotal === 0) return 'No tasks yet';
    if (project.deadline && project.deadline < today && project.status !== 'completed') return 'Overdue';
    if (project.deadline) {
      const daysLeft = Math.ceil((new Date(project.deadline).getTime() - new Date(today).getTime()) / 86400000);
      if (daysLeft <= 7) return 'Due this week';
    }
    if (project.project_type === 'internal') {
      const hasInProgress = tasksTotal > tasksDone && tasksTotal > 0;
      if (hasInProgress) return 'Internal sprint';
    }
    return 'In progress';
  };

  const saveProject = async () => {
    const isInternal = form.project_type === 'internal';
    if (!form.project_name.trim()) { setFormError('Project name is required.'); return; }
    if (!isInternal && !form.client_name.trim()) { setFormError('Client name is required.'); return; }
    if (form.start_date && form.deadline && form.start_date > form.deadline) {
      setFormError('Start date must be before the deadline.');
      return;
    }
    setFormSaving(true); setFormError('');
    const payload = {
      project_type: form.project_type,
      client_name: isInternal ? (form.client_name.trim() || 'Internal') : form.client_name.trim(),
      project_name: form.project_name.trim(),
      service: form.service || null,
      status: form.status,
      stage: form.stage,
      start_date: form.start_date || null,
      deadline: form.deadline || null,
      notes: form.notes || null,
      contact_email: isInternal ? null : (form.contact_email.trim() || null),
      drive_url: form.drive_url?.trim() || null,
    };
    if (editingProject) {
      const { error } = await supabase.from('hub_projects').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', editingProject.id);
      if (error) { setFormError(error.message); setFormSaving(false); return; }
      logAudit({ actor_id: hubUser?.id, actor_name: hubUser?.full_name, action: 'update', entity_type: 'project', entity_id: String(editingProject.id), description: `Updated project "${form.project_name}"` });
    } else {
      const { data, error } = await supabase.from('hub_projects').insert(payload).select('id').single();
      if (error) { setFormError(error.message); setFormSaving(false); return; }
      logAudit({ actor_id: hubUser?.id, actor_name: hubUser?.full_name, action: 'create', entity_type: 'project', description: `Created ${isInternal ? 'internal' : 'client'} project "${form.project_name}"` });
      // Auto-assign the creator (owner/admin) to the new project
      if (data && hubUser?.id) {
        await supabase.from('hub_project_contractors').insert({
          project_id: data.id,
          contractor_id: hubUser.id,
          payout_type: 'percentage',
          percentage: 0,
        }).then(({ error: e }) => { if (e) console.error('Auto-assign owner failed:', e); });
      }
      // Auto-create a Drive folder when the admin didn't paste one in
      if (data && !payload.drive_url) {
        try {
          await supabase.functions.invoke('create-project-drive-folder', {
            body: { project_id: data.id, client_name: payload.client_name, project_name: payload.project_name },
          });
        } catch (e) {
          console.error('Auto-create Drive folder failed:', e);
        }
      }
      if (data) setActiveId(data.id);
    }
    setFormSaving(false); setShowForm(false); setEditingProject(null); setForm(emptyForm);
    fetchAll();
  };

  const openEditProject = (project: Project) => {
    setEditingProject(project);
    setForm({
      project_type: project.project_type,
      project_name: project.project_name,
      client_name: project.client_name,
      contact_email: project.contact_email ?? '',
      service: project.service ?? '',
      status: project.status,
      stage: project.stage ?? 'Pre-Design',
      start_date: project.start_date ?? '',
      deadline: project.deadline ?? '',
      notes: project.notes ?? '',
      drive_url: (project as any).drive_url ?? '',
    });
    setShowForm(true);
  };

  const deleteProject = async (project: Project) => {
    if (isDemo) return;
    const hasData = project.hub_project_contractors.length > 0;
    const dataWarning = hasData ? '\n\nThis project has data (team assignments) that will also be deleted.' : '';
    const confirmed = window.confirm(
      `Delete "${project.project_name}"?\n\nThis will permanently delete the project, all assignments, tasks, and activity. This cannot be undone.${dataWarning}`
    );
    if (!confirmed) return;
    const { error } = await supabase.from('hub_projects').delete().eq('id', project.id);
    if (error) {
      console.error('Delete project error:', error);
      window.alert(`Could not delete project: ${error.message}`);
      return;
    }
    logAudit({
      actor_id: hubUser?.id,
      actor_name: hubUser?.full_name,
      action: 'delete',
      entity_type: 'project',
      entity_id: String(project.id),
      description: `Deleted project "${project.project_name}"`,
    });
    if (activeId === project.id) {
      setActiveId(null);
      setWorkspaceOpen(false);
    }
    fetchAll();
  };

  const addContractor = async () => {
    if (!activeId || !addCtxId) return;
    const contractorId = addCtxId;
    const wasAlreadyAssigned = !!activeProject?.hub_project_contractors.some(pc => pc.hub_users?.id === contractorId);
    setCtxSaving(true); setCtxAddError('');
    const { error } = await supabase.from('hub_project_contractors').upsert({
      project_id: activeId,
      contractor_id: contractorId,
      project_role: addCtxRole.trim() || null,
      payout_type: 'percentage',
      percentage: 0,
    }, { onConflict: 'project_id,contractor_id' });
    setCtxSaving(false);
    if (error) { setCtxAddError(error.message); return; }
    setAddCtxId(''); setAddCtxRole('');
    if (!wasAlreadyAssigned) {
      supabase.functions.invoke('notify-project-assigned', {
        body: { project_id: activeId, contractor_id: contractorId },
      }).catch(console.error);
      const proj = projects.find(p => p.id === activeId);
      if (proj) {
        createHubNotifications([{
          user_id: contractorId, type: 'project_assigned',
          title: 'New project assigned',
          body: `You've been added to "${proj.project_name}"`,
          link: '/hub/employee/projects', read: false,
        }]).catch(console.error);
      }
    }
    fetchAll();
  };

  const removeContractor = async (id: number) => {
    await supabase.from('hub_project_contractors').delete().eq('id', id);
    fetchAll();
  };

  const projectTypes = Array.from(new Set(projects.map(p => p.service).filter(Boolean) as string[])).sort();

  const filtered = projects.filter(p => {
    const matchesStatus = statusFilter === 'all' || p.status === statusFilter;
    const matchesType = typeFilter === 'all' || p.service === typeFilter;
    const matchesProjectType = projectTypeFilter === 'all' || p.project_type === projectTypeFilter;
    return matchesStatus && matchesType && matchesProjectType;
  });

  const deadlineStatus = (deadline: string | null, status: string) => {
    if (!deadline || status === 'completed' || status === 'cancelled') return null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const due = new Date(deadline); due.setHours(0, 0, 0, 0);
    const diff = Math.ceil((due.getTime() - today.getTime()) / 86400000);
    if (diff < 0) return { label: `${Math.abs(diff)}d overdue`, cls: 'bg-red-100 text-red-600' };
    if (diff <= 7) return { label: `${diff}d left`, cls: 'bg-amber-100 text-amber-600' };
    return null;
  };

  const statusTabs = [
    { key: 'ongoing' as const, label: 'Active' },
    { key: 'paused' as const, label: 'Paused' },
    { key: 'completed' as const, label: 'Completed' },
    { key: 'cancelled' as const, label: 'Archived' },
  ];

  useEffect(() => {
    if (!filtered.length) {
      setActiveId(null);
      return;
    }
    if (activeId && !filtered.some(p => p.id === activeId)) {
      setActiveId(filtered[0].id);
    }
  }, [filtered, activeId]);

  useEffect(() => {
    // Clear the previous project's tasks/activity immediately so switching
    // workspaces never briefly renders stale data from the last one.
    setTasks([]); setActivity([]); setCommentCounts({});
    if (activeId && !isDemo) fetchTasks(activeId);
    if (openWorkspaceOnLoad.current) { setWorkspaceOpen(true); openWorkspaceOnLoad.current = false; }
    else { setWorkspaceOpen(false); }
    if (activeId) setTimeout(() => detailPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 100);
  }, [activeId, isDemo]);

  // Sync URL separately so changing workspaceOpen doesn't re-run the effect above and reset it
  useEffect(() => {
    if (activeId) setSearchParams(workspaceOpen ? { w: String(activeId), ws: '1' } : { w: String(activeId) }, { replace: true });
    else setSearchParams({}, { replace: true });
  }, [activeId, workspaceOpen]);

  useEffect(() => {
    if (!isDemo) refreshWorkspaceActivity();
  }, [isDemo, refreshWorkspaceActivity]);

  // Realtime: update comment counts when new comments arrive
  useEffect(() => {
    if (!activeId || isDemo) return;
    const channel = supabase.channel(`admin-task-comments-${activeId}`)
      .on('postgres_changes' as any, {
        event: 'INSERT', schema: 'public', table: 'hub_project_task_comments',
      }, (payload: any) => {
        const taskId = payload.new?.task_id;
        if (taskId) setCommentCounts(prev => ({ ...prev, [taskId]: (prev[taskId] ?? 0) + 1 }));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeId, isDemo]);

  // Select project on load; only open workspace when explicitly requested with ?ws=1
  const didInitWorkspace = useRef(false);
  const lastRouteKey = useRef<string | null>(null);
  useEffect(() => {
    if (projects.length === 0) return;
    const w = searchParams.get('w');
    const ws = searchParams.get('ws');
    const routeKey = `${w ?? ''}:${ws ?? ''}`;
    if (didInitWorkspace.current && routeKey === lastRouteKey.current) return;
    lastRouteKey.current = routeKey;
    if (w) {
      const id = parseInt(w);
      if (projects.some(p => p.id === id)) {
        didInitWorkspace.current = true;
        setActiveId(id);
        setWorkspaceOpen(ws === '1');
      }
    } else {
      didInitWorkspace.current = true;
    }
  }, [projects, searchParams]);

  // Deep link from elsewhere (e.g. the Dashboard's "Add Task" quick action)
  // straight into the new-task form (project is picked inside the form itself).
  const didOpenNewTaskFromLink = useRef(false);
  useEffect(() => {
    if (didOpenNewTaskFromLink.current) return;
    if (searchParams.get('newTask') !== '1') return;
    didOpenNewTaskFromLink.current = true;
    setPendingTaskDate(null);
    openNewTask();
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.delete('newTask');
      return next;
    }, { replace: true });
  }, [searchParams, setSearchParams]);

  const projectTags = (project: Project) => {
    const serviceTag = project.service ? [project.service] : ['General'];
    const roleTags = project.hub_project_contractors
      .map(pc => pc.project_role)
      .filter((role): role is string => !!role)
      .slice(0, 2);
    const deptTags = contractors
      .filter(c => project.hub_project_contractors.some(pc => pc.hub_users?.id === c.id))
      .map(c => c.department)
      .filter((dept): dept is string => !!dept)
      .slice(0, 2);
    return [...new Set([...serviceTag, ...roleTags, ...deptTags])].slice(0, 3);
  };

  const wsToday = localToday();
  const wsIsOverdue = (t: ProjectTask) => isTaskOverdue(t, wsToday);
  const wsArchivedTasks = tasks.filter(t => !!t.archived);
  const wsFilteredTasks = tasks.filter(t => !t.archived).filter(t => {
    if (taskFilter === 'all') return true;
    if (taskFilter === 'overdue') return !!wsIsOverdue(t);
    return t.status === taskFilter;
  });
  const wsActiveTasks = tasks.filter(t => !t.archived);
  const wsDoneCt = wsActiveTasks.filter(t => t.status === 'done').length;
  const wsPct = wsActiveTasks.length > 0 ? Math.round((wsDoneCt / wsActiveTasks.length) * 100) : 0;
  // Not scoped to the active project's own team — a task can be assigned to
  // anyone in the company, not just people already on that project.
  const wsTaskTeam = contractors;
  const getWorkspaceTaskAssignees = (task: ProjectTask) =>
    getTaskAssigneeIds(task)
      .map((assigneeId) => wsTaskTeam.find((member) => member?.id === assigneeId))
      .filter(Boolean);
  const wsStatusCycle: Record<string, { icon: string; cls: string }> = {
    todo:        { icon: 'ri-checkbox-blank-circle-line',  cls: 'text-gray-300 hover:text-gray-500' },
    in_progress: { icon: 'ri-loader-2-line',               cls: 'text-sky-400 hover:text-sky-600' },
    in_review:   { icon: 'ri-eye-line',                    cls: 'text-purple-400 hover:text-purple-600' },
    blocked:     { icon: 'ri-indeterminate-circle-line',   cls: 'text-rose-400 hover:text-rose-600' },
    done:        { icon: 'ri-checkbox-circle-fill',        cls: 'text-emerald-500' },
  };
  const BOARD_COLUMNS: { key: ProjectTask['status']; label: string; icon: string; chip: string; empty: string }[] = [
    { key: 'todo', label: 'To Do', icon: 'ri-checkbox-blank-circle-line', chip: 'bg-gray-100 text-gray-600', empty: 'Nothing queued' },
    { key: 'in_progress', label: 'In Progress', icon: 'ri-loader-2-line', chip: 'bg-sky-100 text-sky-700', empty: 'Nothing in motion' },
    { key: 'in_review', label: 'In Review', icon: 'ri-eye-line', chip: 'bg-purple-100 text-purple-700', empty: 'Nothing to review' },
    { key: 'blocked', label: 'Blocked', icon: 'ri-indeterminate-circle-line', chip: 'bg-rose-100 text-rose-700', empty: 'No blocked work' },
    { key: 'done', label: 'Done', icon: 'ri-checkbox-circle-fill', chip: 'bg-emerald-100 text-emerald-700', empty: 'Nothing completed yet' },
  ];

  const BoardCard = (task: ProjectTask) => {
    const overdue = !!wsIsOverdue(task);
    const assignees = getWorkspaceTaskAssignees(task);
    const commentCount = commentCounts[task.id] ?? 0;
    const priorityCfg = { high: { label: 'High', cls: 'bg-rose-100 text-rose-600' }, medium: { label: 'Med', cls: 'bg-amber-100 text-amber-600' }, low: { label: 'Low', cls: 'bg-gray-100 text-gray-500' } }[task.priority];
    const priorityBorder = { high: 'border-l-rose-400', medium: 'border-l-amber-400', low: 'border-l-gray-300' }[task.priority];
    return (
      <button
        key={task.id}
        type="button"
        draggable
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/task-id', String(task.id));
          setDraggedTaskId(task.id);
        }}
        onDragEnd={() => { setDraggedTaskId(null); setBoardDragOver(null); }}
        onClick={() => openTaskDetail(task)}
        className={`w-full text-left rounded-2xl border border-gray-100 border-l-4 bg-white p-3 shadow-sm transition-all hover:-translate-y-0.5 hover:border-gray-200 hover:shadow-md cursor-pointer ${(task as any).color ? '' : priorityBorder} ${draggedTaskId === task.id ? 'opacity-60' : ''}`}
        style={(task as any).color ? { borderLeftColor: (task as any).color } : undefined}
      >
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-2">
              <p className={`flex-1 text-sm font-semibold leading-snug ${task.status === 'done' ? 'line-through text-gray-400' : 'text-gray-900'}`}>{task.title}</p>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold flex-shrink-0 ${priorityCfg.cls}`}>{priorityCfg.label}</span>
            </div>
            {task.description && <p className="text-xs text-gray-400 mt-1 line-clamp-2">{getTaskDescriptionPreview(task.description)}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2 mt-3 pt-2.5 border-t border-gray-50">
          {task.due_date && (
            <span className={`text-[10px] font-medium ${overdue ? 'text-rose-600' : 'text-gray-500'}`}>
              {overdue ? 'Overdue' : new Date(task.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
          )}
          <div className="ml-auto flex items-center gap-1.5">
            {commentCount > 0 && (
              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-slate-50 border border-slate-100 text-[#1c2b3a] text-[10px] font-semibold">
                <i className="ri-chat-3-fill text-[11px]"></i>{commentCount}
              </span>
            )}
            {assignees.length > 0 && (
              <div className="flex items-center -space-x-1">
                {assignees.slice(0, 3).map((assignee: any) => (
                  assignee.avatar_url
                    ? <img key={assignee.id} src={assignee.avatar_url} alt={assignee.full_name} className="w-5 h-5 rounded-full border border-white object-cover object-top" />
                    : <div key={assignee.id} className="w-5 h-5 rounded-full border border-white bg-slate-100 flex items-center justify-center text-[9px] font-bold text-[#1c2b3a]/70">{assignee.full_name[0]}</div>
                ))}
                {assignees.length > 3 && <span className="ml-1 text-[10px] text-gray-400 font-medium">+{assignees.length - 3}</span>}
              </div>
            )}
          </div>
        </div>
      </button>
    );
  };

  // One card renderer shared by the workspace flat list and grouped sections.
  // `reorderIds` is the id list the drag-reorder operates within (the visible
  // flat list, or the tasks of the group the row belongs to).
  const renderWorkspaceTaskRow = (task: ProjectTask, reorderIds: number[]) => {
    const sc = wsStatusCycle[task.status];
    const overdue = wsIsOverdue(task);
    const priorityBorder = { high: 'border-l-rose-400', medium: 'border-l-amber-400', low: 'border-l-gray-300' }[task.priority];
    const priorityCfg = { high: { label: 'High', cls: 'bg-rose-100 text-rose-600' }, medium: { label: 'Med', cls: 'bg-amber-100 text-amber-600' }, low: { label: 'Low', cls: 'bg-gray-100 text-gray-500' } }[task.priority];
    const assignees = getWorkspaceTaskAssignees(task);
    const commentCount = commentCounts[task.id] ?? 0;
    const daysLeft = task.due_date
      ? Math.ceil((new Date(task.due_date + 'T00:00:00').getTime() - new Date(wsToday + 'T00:00:00').getTime()) / 86400000)
      : null;
    const isDragOver = listDragOverTaskId === task.id && draggedTaskId !== task.id;
    return (
      <div key={task.id} className="relative">
        {isDragOver && listDragOverPos === 'above' && <div className="absolute -top-1 left-0 right-0 h-0.5 bg-[#1c2b3a] rounded-full z-10 pointer-events-none" />}
        {isDragOver && listDragOverPos === 'below' && <div className="absolute -bottom-1 left-0 right-0 h-0.5 bg-[#1c2b3a] rounded-full z-10 pointer-events-none" />}
        <div
          draggable
          onDragStart={e => { if (!listDragFromHandle.current) { e.preventDefault(); return; } listDragFromHandle.current = false; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/task-id', String(task.id)); setDraggedTaskId(task.id); setListDragOverTaskId(null); setListDragOverPos(null); }}
          onDragOver={e => { e.preventDefault(); const r = e.currentTarget.getBoundingClientRect(); setListDragOverTaskId(task.id); setListDragOverPos(e.clientY < r.top + r.height / 2 ? 'above' : 'below'); }}
          onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) { setListDragOverTaskId(null); setListDragOverPos(null); } }}
          onDrop={e => {
            e.preventDefault();
            const fromId = Number(e.dataTransfer.getData('text/task-id') || draggedTaskId);
            const r = e.currentTarget.getBoundingClientRect();
            const pos = e.clientY < r.top + r.height / 2 ? 'above' : 'below';
            setListDragOverTaskId(null); setListDragOverPos(null); setDraggedTaskId(null);
            if (!fromId || fromId === task.id) return;
            if (reorderIds.indexOf(fromId) < 0 || reorderIds.indexOf(task.id) < 0) return;
            const reordered = reorderIds.filter(id => id !== fromId);
            const insertAt = reordered.indexOf(task.id) + (pos === 'below' ? 1 : 0);
            reordered.splice(insertAt, 0, fromId);
            reorderTasks(reordered);
          }}
          onDragEnd={() => { listDragFromHandle.current = false; setDraggedTaskId(null); setListDragOverTaskId(null); setListDragOverPos(null); }}
          onClick={() => openTaskDetail(task)}
          className={`select-none bg-white rounded-xl border border-gray-100 shadow-sm p-3.5 border-l-4 group cursor-pointer hover:shadow-md hover:border-gray-200 transition-all ${(task as any).color ? '' : priorityBorder} ${draggedTaskId === task.id ? 'opacity-40' : ''}`}
          style={(task as any).color ? { borderLeftColor: (task as any).color } : undefined}>
          <div className="flex items-start gap-2.5">
            <i className="ri-draggable text-gray-300 cursor-grab active:cursor-grabbing flex-shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity -ml-1 text-base" onPointerDown={() => { listDragFromHandle.current = true; }} />
            <button onClick={e => { e.stopPropagation(); toggleTask(task); }} className={`flex-shrink-0 cursor-pointer mt-0.5 ${sc.cls}`}>
              <i className={`${sc.icon} text-lg`}></i>
            </button>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-semibold leading-snug ${task.status === 'done' ? 'line-through text-gray-400' : 'text-gray-900'}`}>{task.title}</p>
              {task.description && <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{getTaskDescriptionPreview(task.description)}</p>}
            </div>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold flex-shrink-0 ${priorityCfg.cls}`}>{priorityCfg.label}</span>
          </div>
          <div className="flex items-center gap-2 mt-3 pt-2.5 border-t border-gray-50">
            {task.due_date && (
              <div className="flex items-center gap-1">
                <i className="ri-calendar-line text-[10px] text-gray-400"></i>
                {task.start_date && task.start_date !== task.due_date ? (
                  <span className="text-[10px] text-gray-500">
                    {new Date(task.start_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} → {new Date(task.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                ) : (
                  <span className={`text-[10px] font-medium ${overdue ? 'text-rose-600' : daysLeft === 0 ? 'text-amber-600' : 'text-gray-500'}`}>
                    {overdue ? `Overdue ${Math.abs(daysLeft!)}d` : daysLeft === 0 ? 'Due today' : daysLeft === 1 ? 'Tomorrow' : new Date(task.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                )}
              </div>
            )}
            <div className="flex items-center gap-1.5 ml-auto flex-shrink-0">
              {commentCount > 0 && (
                <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-slate-50 border border-slate-100 text-[#1c2b3a] text-[10px] font-semibold">
                  <i className="ri-chat-3-fill text-[11px]"></i>{commentCount}
                </span>
              )}
              {assignees.length > 0 && (
                <div className="flex items-center gap-1">
                  <div className="flex -space-x-1">
                    {assignees.slice(0, 3).map((assignee: any) => (
                      assignee.avatar_url
                        ? <img key={assignee.id} src={assignee.avatar_url} alt={assignee.full_name} className="w-5 h-5 rounded-full border border-white object-cover object-top" />
                        : <div key={assignee.id} className="w-5 h-5 rounded-full border border-white bg-slate-100 flex items-center justify-center text-[9px] font-bold text-[#1c2b3a]/70">{assignee.full_name[0]}</div>
                    ))}
                  </div>
                  <span className="text-[10px] text-gray-500 font-medium">
                    {assignees.length === 1 ? assignees[0].full_name.split(' ')[0] : `${assignees.length} assignees`}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderProjectRow = (p: Project) => {
    const cfg = statusCfg[p.status] ?? statusCfg.ongoing;
    const dl = deadlineStatus(p.deadline, p.status);
    const pal = getServicePalette(p.service);
    const team = p.hub_project_contractors.map((pc: any) => pc.hub_users).filter(Boolean);
    const rowLabel = p.project_type === 'internal' ? 'Internal' : p.client_name;
    const badge = dl ?? (p.status !== 'ongoing' ? cfg : null);
    const panelOpen = activeId === p.id && !workspaceOpen;
    const anyPanelOpen = activeId !== null && !workspaceOpen;
    const pTasks = allTasks.filter((t: any) => t.project_id === p.id);
    const pTasksDone = pTasks.filter((t: any) => t.status === 'done').length;
    return (
      <div key={p.id} role="button" tabIndex={0}
        onClick={() => { openWorkspaceOnLoad.current = true; setActiveId(p.id); setWorkspaceOpen(true); }}
        onKeyDown={e => { if (e.key === 'Enter') { openWorkspaceOnLoad.current = true; setActiveId(p.id); setWorkspaceOpen(true); } }}
        className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors cursor-pointer group ${
          panelOpen ? 'bg-slate-50' : 'hover:bg-gray-50/70'
        }`}>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-white font-bold text-sm"
          style={{ background: `linear-gradient(135deg, ${pal.from}, ${pal.to})` }}>
          {p.project_name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-[#111827] truncate leading-snug">{p.project_name}</h3>
          <p className="text-[11px] text-gray-400 truncate mt-0.5">{rowLabel}{p.service ? ` · ${p.service}` : ''}</p>
        </div>
        <div className="hidden sm:flex items-center gap-1.5 flex-shrink-0">
          <div className="flex -space-x-1.5">
            {team.slice(0, 3).map((u: any, i: number) => (
              u?.avatar_url
                ? <img key={i} src={u.avatar_url} alt={u.full_name} className="w-6 h-6 rounded-full object-cover object-top border-2 border-white" />
                : <div key={i} className="w-6 h-6 rounded-full bg-gray-200 border-2 border-white flex items-center justify-center text-[9px] font-bold text-gray-500">{u?.full_name?.[0]}</div>
            ))}
            {team.length === 0 && <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center"><i className="ri-user-line text-[9px] text-gray-400"></i></div>}
          </div>
        </div>
        {!anyPanelOpen && (
          <span className="hidden md:block text-[11px] text-gray-400 flex-shrink-0 w-20 text-right">
            {pTasks.length > 0 ? `${pTasksDone}/${pTasks.length} tasks` : 'No tasks'}
          </span>
        )}
        {badge ? (
          <span className={`text-[10px] px-2.5 py-1 rounded-full font-semibold flex-shrink-0 ${badge.cls}`}>{badge.label}</span>
        ) : (
          <span className="text-[11px] text-gray-400 flex-shrink-0">Active</span>
        )}
        <button
          onClick={e => { e.stopPropagation(); setActiveId(prev => prev === p.id ? null : p.id); }}
          title="Project details"
          className={`w-8 h-8 flex items-center justify-center rounded-lg flex-shrink-0 cursor-pointer transition-colors ${panelOpen ? 'text-[#1c2b3a] bg-[#1c2b3a]/10' : 'text-gray-300 hover:text-gray-600 hover:bg-gray-100'}`}>
          <i className="ri-information-line text-base"></i>
        </button>
        <i className="ri-arrow-right-s-line text-gray-300 group-hover:text-gray-500 transition-colors flex-shrink-0"></i>
      </div>
    );
  };

  return (
    <AdminLayout title="Projects" titleContent={workspaceOpen && activeProject ? (
      <button onClick={() => { setWorkspaceOpen(false); setActiveId(null); setCollapsedGroups({}); }}
        className="flex items-center gap-1.5 h-8 pl-1.5 pr-3 rounded-xl bg-white border border-gray-200 text-gray-500 hover:text-gray-800 hover:bg-gray-50 cursor-pointer transition-all shadow-sm flex-shrink-0 text-xs font-medium">
        <i className="ri-arrow-left-s-line text-base"></i>
        Back to Projects
      </button>
    ) : undefined}>
      {workspaceOpen && activeProject && (() => {
        const p = activeProject;
        const internalProject = isInternalProject(p);
        const statusColors: Record<string, string> = {
          ongoing: 'bg-emerald-100 text-emerald-700',
          completed: 'bg-blue-100 text-blue-700',
          paused: 'bg-amber-100 text-amber-700',
          cancelled: 'bg-gray-100 text-gray-500',
        };
        const statusLabels: Record<string, string> = { ongoing: 'Active', completed: 'Completed', paused: 'Paused', cancelled: 'Archived' };
        const wsTeam = p.hub_project_contractors.map(pc => pc.hub_users).filter(Boolean) as { id: string; full_name: string; avatar_url: string | null }[];
        const daysLeft = p.deadline ? Math.ceil((new Date(p.deadline + 'T00:00:00').getTime() - new Date(wsToday + 'T00:00:00').getTime()) / 86400000) : null;
        const isDeadlineOver = daysLeft !== null && daysLeft < 0 && p.status !== 'completed';
        // Map tasks for GanttTimeline (admin tasks have assignee_id, no start_date — compatible via any cast)
        const ganttTasks = tasks.map(t => ({
          id: t.id,
          project_id: t.project_id,
          title: t.title,
          description: t.description,
          status: t.status,
          priority: t.priority,
          due_date: t.due_date,
          start_date: t.start_date ?? null,
          assigned_to: getPrimaryTaskAssigneeId(t),
          assignee_ids: getTaskAssigneeIds(t),
          color: (t as any).color ?? null,
        }));

        return (
          <div className="flex flex-col -mx-4 -my-4 md:-mx-6 md:-py-6 min-h-full bg-gray-50/50">
            {/* ── Header strip ── */}
            <div className="px-5 md:px-6 pt-3 pb-2 flex-shrink-0">
              {/* Info card — matches contractor workspace layout */}
              <div className="bg-white/70 backdrop-blur-sm rounded-3xl border border-white/80 shadow-sm px-5 py-5">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:gap-8">

                  {/* Left: project identity */}
                  <div className="min-w-0 lg:max-w-[320px] lg:flex-shrink-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-semibold ${statusColors[p.status] ?? statusColors.ongoing}`}>
                        {statusLabels[p.status] ?? p.status}
                      </span>
                      {internalProject && <span className="text-[10px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">Internal</span>}
                      {p.service && <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${getServiceCfg(p.service).badge}`}>{p.service}</span>}
                      {p.stage && <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${getStageCfg(p.stage).badge}`}>{p.stage}</span>}
                    </div>
                    <h2 className="text-lg sm:text-xl font-bold text-gray-900 leading-tight">{p.project_name}</h2>
                    <p className="text-sm text-gray-400 mt-0.5">{internalProject ? 'Internal Project' : p.client_name}</p>

                    {wsTeam.length > 0 && (
                      <div className="flex items-center gap-2 mt-3">
                        <div className="flex -space-x-2">
                          {wsTeam.slice(0, 5).map(m => (
                            m.avatar_url
                              ? <img key={m.id} src={m.avatar_url} alt={m.full_name} title={m.full_name} className="w-6 h-6 rounded-full border-2 border-white object-cover object-top shadow-sm" />
                              : <div key={m.id} title={m.full_name} className="w-6 h-6 rounded-full border-2 border-white bg-[#1c2b3a]/70 flex items-center justify-center text-[9px] font-bold text-white shadow-sm">{m.full_name[0]}</div>
                          ))}
                        </div>
                        <span className="text-xs text-gray-400">{wsTeam.length} member{wsTeam.length !== 1 ? 's' : ''}</span>
                      </div>
                    )}

                    {daysLeft !== null && (
                      <div className="mt-3">
                        {isDeadlineOver ? (
                          <span className="inline-flex items-center gap-1.5 text-xs text-rose-600 bg-rose-50 border border-rose-200 px-2.5 py-1 rounded-full font-medium">
                            <i className="ri-alarm-warning-line text-xs"></i>{Math.abs(daysLeft)}d overdue
                          </span>
                        ) : daysLeft === 0 ? (
                          <span className="inline-flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full font-medium">
                            <i className="ri-time-line text-xs"></i>Due today
                          </span>
                        ) : (
                          <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border font-medium ${daysLeft <= 7 ? 'text-amber-700 bg-amber-50 border-amber-200' : 'text-gray-500 bg-gray-50 border-gray-200'}`}>
                            <i className="ri-calendar-line text-xs"></i>
                            {daysLeft}d left · {new Date(p.deadline! + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Right: Drive — fills remaining width */}
                  <div className="lg:flex-1 lg:min-w-0">
                    {(() => {
                      const driveUrl = (p as any).drive_url as string | null;
                      const folderIdMatch = driveUrl?.match(/folders\/([a-zA-Z0-9_-]+)/);
                      const folderId = folderIdMatch?.[1];
                      const embedUrl = folderId ? `https://drive.google.com/embeddedfolderview?id=${folderId}#grid` : null;
                      return embedUrl && driveUrl ? (
                        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-[#f1f3f7] shadow-sm">
                          <div className="flex items-center justify-end border-b border-gray-200/80 px-3 py-2">
                            <a href={driveUrl} target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center gap-2 rounded-full bg-white/90 px-2.5 py-1.5 text-[11px] font-medium text-gray-600 hover:text-blue-600 transition-colors">
                              <svg viewBox="0 0 87.3 78" className="h-3.5 w-3.5 flex-shrink-0" xmlns="http://www.w3.org/2000/svg">
                                <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
                                <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47"/>
                                <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335"/>
                                <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/>
                                <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc"/>
                                <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 27h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
                              </svg>
                              Open Drive <i className="ri-external-link-line text-[11px]"></i>
                            </a>
                          </div>
                          <div className="h-[150px] overflow-hidden">
                            <iframe src={embedUrl} className="bg-[#f1f3f7]"
                              style={{ width: '200%', height: 300, border: 'none', transform: 'scale(0.5)', transformOrigin: 'top left' }}
                              title="Project Files" />
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3 rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-4">
                          <div className="w-10 h-10 rounded-2xl bg-white border border-gray-200 flex items-center justify-center flex-shrink-0">
                            <i className="ri-folder-line text-gray-300 text-lg"></i>
                          </div>
                          <div>
                            <p className="text-xs font-medium text-gray-500">No Drive folder linked</p>
                            <p className="text-[10px] text-gray-400">Add a Google Drive URL when editing this project</p>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex-1 px-5 md:px-6 pb-6 space-y-4 overflow-y-auto">
              {/* ── Stats ── */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Total', value: tasks.length, icon: 'ri-task-line', iconBg: 'bg-gray-100', iconClr: 'text-gray-500', valClr: 'text-gray-800' },
                  { label: 'Done', value: wsDoneCt, icon: 'ri-checkbox-circle-fill', iconBg: 'bg-emerald-100', iconClr: 'text-emerald-600', valClr: 'text-emerald-700' },
                  { label: 'In Progress', value: tasks.filter(t => t.status === 'in_progress').length, icon: 'ri-loader-2-line', iconBg: 'bg-sky-100', iconClr: 'text-sky-600', valClr: 'text-sky-700' },
                  { label: 'Overdue', value: tasks.filter(t => wsIsOverdue(t)).length, icon: 'ri-alarm-warning-line', iconBg: 'bg-rose-100', iconClr: 'text-rose-500', valClr: 'text-rose-600' },
                ].map(s => (
                  <div key={s.label} className="bg-white rounded-2xl px-3.5 py-2.5 shadow-sm border border-gray-100/80 flex items-center gap-2.5">
                    <div className={`w-7 h-7 rounded-lg ${s.iconBg} flex items-center justify-center flex-shrink-0`}>
                      <i className={`${s.icon} ${s.iconClr} text-xs`}></i>
                    </div>
                    <div className="min-w-0">
                      <p className={`text-base font-bold ${s.valClr} leading-none`}>{s.value}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5 truncate">{s.label}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* ── Calendar / Timeline ── */}
              <div id="ws-timeline">
                <GanttTimeline
                  tasks={ganttTasks as any}
                  projectStart={p.start_date}
                  projectEnd={p.deadline}
                  today={wsToday}
                  onTaskUpdate={async (taskId, updates) => {
                    await supabase.from('hub_project_tasks').update({
                      ...(updates.due_date !== undefined && { due_date: updates.due_date }),
                      ...(updates.start_date !== undefined && { start_date: updates.start_date }),
                    }).eq('id', taskId);
                    fetchTasks(activeId!);
                  }}
                  onAddTask={(date) => { setPendingTaskDate(date); openNewTask(); }}
                  onTaskClick={(t: any) => { const found = tasks.find(x => x.id === t.id); if (found) openTaskDetail(found); }}
                />
              </div>

              {/* ── Two-column: tasks + sidebar ── */}
              <div className="flex gap-6">
                {/* Task list */}
                <div
                  id="ws-tasks"
                  className={`min-w-0 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden ${
                    taskView === 'board' ? 'flex-[1_1_100%]' : 'flex-1'
                  }`}
                >
                  <div className="px-5 py-4 border-b border-gray-50 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <h3 className="font-semibold text-gray-800">Tasks</h3>
                        {tasks.length > 0 && (
                          <div className="flex items-center gap-2">
                            <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div className="h-full bg-emerald-400 rounded-full" style={{ width: `${wsPct}%` }} />
                            </div>
                            <span className="text-xs text-gray-400">{wsDoneCt}/{tasks.length}</span>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="hidden lg:flex items-center rounded-xl border border-gray-200 bg-white p-0.5">
                          <button
                            type="button"
                            onClick={() => setTaskView('list')}
                            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                              taskView === 'list' ? 'bg-[#111827] text-white' : 'text-gray-500 hover:text-gray-700'
                            }`}
                          >
                            List
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setTaskView('board');
                              setTaskFilter('all');
                            }}
                            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                              taskView === 'board' ? 'bg-[#111827] text-white' : 'text-gray-500 hover:text-gray-700'
                            }`}
                          >
                            Board
                          </button>
                        </div>
                        <button
                          onClick={openNewTask}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#111827] text-white text-xs font-medium rounded-lg hover:bg-gray-800 transition-colors cursor-pointer whitespace-nowrap"
                        >
                          <i className="ri-add-line"></i>
                          Add Task
                        </button>
                      </div>
                    </div>
                    <div className={`flex gap-1 flex-wrap ${taskView === 'board' ? 'lg:hidden' : ''}`}>
                      {(['all', 'todo', 'in_progress', 'in_review', 'blocked', 'done', 'overdue'] as const).map(f => {
                        const labels: Record<string, string> = { all: 'All', todo: 'To Do', in_progress: 'Active', in_review: 'Review', blocked: 'Blocked', done: 'Done', overdue: 'Overdue' };
                        const counts: Record<string, number> = {
                          all: tasks.length,
                          todo: tasks.filter(t => t.status === 'todo').length,
                          in_progress: tasks.filter(t => t.status === 'in_progress').length,
                          in_review: tasks.filter(t => t.status === 'in_review').length,
                          blocked: tasks.filter(t => t.status === 'blocked').length,
                          done: tasks.filter(t => t.status === 'done').length,
                          overdue: tasks.filter(t => !!wsIsOverdue(t)).length,
                        };
                        if (f !== 'all' && counts[f] === 0) return null;
                        return (
                          <button key={f} onClick={() => setTaskFilter(f)}
                            className={`px-3 py-1 rounded-full text-xs font-medium cursor-pointer transition-colors ${taskFilter === f ? 'bg-[#111827] text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                            {labels[f]}{f !== 'all' && <span className="ml-1 opacity-60">{counts[f]}</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Task content */}
                  {tasks.length === 0 ? (
                    <div className="py-14 text-center">
                      <i className="ri-task-line text-3xl text-gray-200 block mb-2"></i>
                      <p className="text-sm text-gray-400 mb-3">No tasks yet</p>
                      <button onClick={openNewTask} className="text-sm text-[#1c2b3a] hover:underline cursor-pointer">Add the first task</button>
                    </div>
                  ) : wsFilteredTasks.length === 0 ? (
                    <div className="py-10 text-center">
                      <p className="text-sm text-gray-400">No tasks in this filter</p>
                    </div>
                  ) : taskView === 'board' ? (
                    <div className="hidden lg:flex p-4 overflow-x-auto overflow-y-hidden min-h-[calc(100vh-19rem)]">
                      <div className="grid grid-cols-5 gap-4 min-w-[1120px] w-full min-h-full">
                        {BOARD_COLUMNS.map((column) => {
                          const columnTasks = tasks.filter((task) => task.status === column.key);
                          return (
                            <div
                              key={column.key}
                              onDragOver={(e) => {
                                e.preventDefault();
                                setBoardDragOver(column.key);
                              }}
                              onDragLeave={() => setBoardDragOver((current) => (current === column.key ? null : current))}
                              onDrop={async (e) => {
                                e.preventDefault();
                                const taskId = Number(e.dataTransfer.getData('text/task-id') || draggedTaskId);
                                const droppedTask = tasks.find((task) => task.id === taskId);
                                setBoardDragOver(null);
                                setDraggedTaskId(null);
                                if (!droppedTask) return;
                                await updateTaskStatus(droppedTask, column.key);
                              }}
                              className={`rounded-3xl border p-3 transition-colors min-h-full flex flex-col ${
                                boardDragOver === column.key ? 'border-[#1c2b3a] bg-slate-50/40' : 'border-gray-100 bg-gray-50/60'
                              }`}
                            >
                              <div className="flex items-center gap-2 px-1 pb-3">
                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${column.chip}`}>
                                  <i className={`${column.icon} text-[11px]`}></i>
                                  {column.label}
                                </span>
                                <span className="text-[11px] text-gray-400 font-medium">{columnTasks.length}</span>
                              </div>
                              <div className="space-y-3 min-h-[240px] flex-1 overflow-y-auto pr-1">
                                {columnTasks.length === 0 ? (
                                  <div className="rounded-2xl border border-dashed border-gray-200 bg-white/70 px-4 py-6 text-center">
                                    <p className="text-xs text-gray-400">{column.empty}</p>
                                  </div>
                                ) : (
                                  <>
                                  {/* Top drop zone — allows inserting before the first card */}
                                  <div className="h-2 -mb-1 relative"
                                    onDragOver={e => { e.preventDefault(); e.stopPropagation(); setListDragOverTaskId(-column.key.length); setListDragOverPos('above'); setBoardDragOver(null); }}
                                    onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) { setListDragOverTaskId(null); setListDragOverPos(null); } }}
                                    onDrop={async e => {
                                      e.preventDefault(); e.stopPropagation();
                                      const fromId = Number(e.dataTransfer.getData('text/task-id') || draggedTaskId);
                                      setListDragOverTaskId(null); setListDragOverPos(null); setDraggedTaskId(null); setBoardDragOver(null);
                                      if (!fromId) return;
                                      const fromTask = tasks.find(t => t.id === fromId);
                                      if (!fromTask) return;
                                      if (fromTask.status !== column.key) {
                                        await updateTaskStatus(fromTask, column.key);
                                        return;
                                      }
                                      const colIds = tasks.filter(t => t.status === column.key && t.id !== fromId).map(t => t.id);
                                      reorderTasks([fromId, ...colIds]);
                                    }}
                                  >
                                    {listDragOverTaskId === -column.key.length && <div className="absolute top-0 left-0 right-0 h-0.5 bg-[#1c2b3a] rounded-full pointer-events-none" />}
                                  </div>
                                  {columnTasks.map((task) => {
                                    const isBoardOver = listDragOverTaskId === task.id && draggedTaskId !== task.id;
                                    return (
                                      <div key={task.id} className="relative"
                                        onDragOver={e => { e.preventDefault(); e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); setListDragOverTaskId(task.id); setListDragOverPos(e.clientY < r.top + r.height / 2 ? 'above' : 'below'); setBoardDragOver(null); }}
                                        onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) { setListDragOverTaskId(null); setListDragOverPos(null); } }}
                                        onDrop={async e => {
                                          e.preventDefault(); e.stopPropagation();
                                          const fromId = Number(e.dataTransfer.getData('text/task-id') || draggedTaskId);
                                          const r = e.currentTarget.getBoundingClientRect();
                                          const pos = e.clientY < r.top + r.height / 2 ? 'above' : 'below';
                                          setListDragOverTaskId(null); setListDragOverPos(null); setDraggedTaskId(null); setBoardDragOver(null);
                                          if (!fromId || fromId === task.id) return;
                                          const fromTask = tasks.find(t => t.id === fromId);
                                          if (!fromTask) return;
                                          if (fromTask.status !== column.key) {
                                            await updateTaskStatus(fromTask, column.key);
                                            return; // skip reorder — tasks state is stale after async status update
                                          }
                                          // Same-column reorder only
                                          const colIds = tasks.filter(t => t.status === column.key).map(t => t.id);
                                          const withoutFrom = colIds.filter(id => id !== fromId);
                                          const insertAt = withoutFrom.indexOf(task.id) + (pos === 'below' ? 1 : 0);
                                          withoutFrom.splice(insertAt < 0 ? withoutFrom.length : insertAt, 0, fromId);
                                          reorderTasks(withoutFrom);
                                        }}
                                      >
                                        {isBoardOver && listDragOverPos === 'above' && <div className="absolute -top-1.5 left-0 right-0 h-0.5 bg-[#1c2b3a] rounded-full z-10 pointer-events-none" />}
                                        {isBoardOver && listDragOverPos === 'below' && <div className="absolute -bottom-1.5 left-0 right-0 h-0.5 bg-[#1c2b3a] rounded-full z-10 pointer-events-none" />}
                                        {BoardCard(task)}
                                      </div>
                                    );
                                  })}
                                  </>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : taskFilter !== 'all' ? (
                    /* Flat list for specific filter */
                    <div className="p-3 space-y-2">
                      {(() => { const ids = wsFilteredTasks.map(t => t.id); return wsFilteredTasks.map(task => renderWorkspaceTaskRow(task, ids)); })()}
                    </div>
                  ) : (
                    /* Grouped sections (taskFilter === 'all') */
                    <div>
                      {(() => {
                        const overdueGroup  = wsFilteredTasks.filter(t => !!wsIsOverdue(t));
                        const inProgGroup   = wsFilteredTasks.filter(t => t.status === 'in_progress' && !wsIsOverdue(t));
                        const reviewGroup   = wsFilteredTasks.filter(t => t.status === 'in_review' && !wsIsOverdue(t));
                        const blockedGroup  = wsFilteredTasks.filter(t => t.status === 'blocked' && !wsIsOverdue(t));
                        const todoGroup     = wsFilteredTasks.filter(t => t.status === 'todo' && !wsIsOverdue(t));
                        const doneGroup     = wsFilteredTasks.filter(t => t.status === 'done');

                        type GroupKey = 'overdue' | 'in_progress' | 'in_review' | 'blocked' | 'todo' | 'done';
                        const groups = [
                          { key: 'overdue' as GroupKey,     label: 'Overdue',     icon: 'ri-alarm-warning-line',         headerCls: 'bg-rose-50/60',    iconCls: 'text-rose-500',    labelCls: 'text-rose-700',    badgeCls: 'bg-rose-100 text-rose-600',    chevronCls: 'text-rose-300',    items: overdueGroup },
                          { key: 'in_progress' as GroupKey, label: 'In Progress', icon: 'ri-loader-2-line',               headerCls: 'bg-sky-50/50',     iconCls: 'text-sky-500',     labelCls: 'text-sky-700',     badgeCls: 'bg-sky-100 text-sky-600',      chevronCls: 'text-sky-400',     items: inProgGroup },
                          { key: 'in_review' as GroupKey,   label: 'In Review',   icon: 'ri-eye-line',                    headerCls: 'bg-purple-50/50',  iconCls: 'text-purple-500',  labelCls: 'text-purple-700',  badgeCls: 'bg-purple-100 text-purple-600', chevronCls: 'text-purple-400', items: reviewGroup },
                          { key: 'blocked' as GroupKey,     label: 'Blocked',     icon: 'ri-indeterminate-circle-line',   headerCls: 'bg-rose-50/50',    iconCls: 'text-rose-500',    labelCls: 'text-rose-700',    badgeCls: 'bg-rose-100 text-rose-600',    chevronCls: 'text-rose-300',    items: blockedGroup },
                          { key: 'todo' as GroupKey,        label: 'To Do',       icon: 'ri-checkbox-blank-circle-line',  headerCls: 'bg-gray-50/60',   iconCls: 'text-gray-400',    labelCls: 'text-gray-600',    badgeCls: 'bg-gray-100 text-gray-500',    chevronCls: 'text-gray-300',    items: todoGroup },
                          { key: 'done' as GroupKey,        label: 'Done',        icon: 'ri-checkbox-circle-fill',        headerCls: 'bg-emerald-50/40', iconCls: 'text-emerald-500', labelCls: 'text-emerald-700', badgeCls: 'bg-emerald-100 text-emerald-600', chevronCls: 'text-emerald-300', items: doneGroup },
                        ];

                        return groups.filter(g => g.items.length > 0).map(g => {
                          const collapsed = !!collapsedGroups[g.key];
                          return (
                            <div key={g.key} className="border-b border-gray-50 last:border-0">
                              <div
                                className={`flex items-center gap-2 px-5 py-2.5 ${g.headerCls} cursor-pointer select-none`}
                                onClick={() => setCollapsedGroups(prev => ({ ...prev, [g.key]: !prev[g.key] }))}
                              >
                                <i className={`${g.icon} ${g.iconCls} text-sm`}></i>
                                <span className={`text-xs font-semibold ${g.labelCls}`}>{g.label}</span>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${g.badgeCls}`}>{g.items.length}</span>
                                <i className={`${collapsed ? 'ri-arrow-right-s-line' : 'ri-arrow-down-s-line'} ${g.chevronCls} ml-auto text-sm`}></i>
                              </div>
                              {!collapsed && (
                                <div className="p-3 space-y-2">
                                  {(() => { const ids = g.items.map(t => t.id); return g.items.map(task => renderWorkspaceTaskRow(task, ids)); })()}
                                </div>
                              )}
                            </div>
                          );
                        });
                      })()}
                    </div>
                  )}

                  {/* Archived tasks toggle */}
                  {wsArchivedTasks.length > 0 && (
                    <div className="border-t border-gray-100">
                      <button
                        onClick={() => setShowArchivedTasks(v => !v)}
                        className="w-full flex items-center gap-2 px-5 py-2.5 text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer"
                      >
                        <i className="ri-archive-line text-sm"></i>
                        <span>{showArchivedTasks ? 'Hide' : 'Show'} archived ({wsArchivedTasks.length})</span>
                        <i className={`${showArchivedTasks ? 'ri-arrow-up-s-line' : 'ri-arrow-down-s-line'} ml-auto`}></i>
                      </button>
                      {showArchivedTasks && (
                        <div className="p-3 space-y-2">
                          {wsArchivedTasks.map(task => (
                            <div key={task.id} onClick={() => openTaskDetail(task)}
                              className="opacity-50 bg-white rounded-xl border border-gray-100 shadow-sm p-3.5 cursor-pointer hover:opacity-70 transition-opacity">
                              <div className="flex items-center gap-2">
                                <i className="ri-archive-line text-gray-400 text-sm flex-shrink-0"></i>
                                <p className="text-sm text-gray-500 line-clamp-1">{task.title}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Right sidebar */}
                <div id="ws-sidebar" className={`${taskView === 'board' ? 'hidden' : 'hidden lg:flex'} flex-col gap-4 w-64 flex-shrink-0`}>
                  {/* Dates & Notes card */}
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
                    {p.stage && (
                      <div className={`flex items-center justify-between text-xs ${(p.start_date || p.deadline) ? 'pb-2.5 border-b border-gray-50' : ''}`}>
                        <span className="text-gray-400 flex items-center gap-1.5"><i className="ri-map-pin-line text-gray-300"></i>Phase</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${getStageCfg(p.stage).badge}`}>{p.stage}</span>
                      </div>
                    )}
                    {(p.start_date || p.deadline) && (
                      <div className="space-y-2.5">
                        {p.start_date && (
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-gray-400 flex items-center gap-1.5"><i className="ri-play-circle-line text-gray-300"></i>Start</span>
                            <span className="font-medium text-gray-700">{fmtDate(p.start_date)}</span>
                          </div>
                        )}
                        {p.deadline && (
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-gray-400 flex items-center gap-1.5"><i className="ri-flag-line text-gray-300"></i>Due</span>
                            <span className={`font-medium ${p.deadline < wsToday && p.status !== 'completed' ? 'text-rose-500' : 'text-gray-700'}`}>
                              {fmtDate(p.deadline)}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                    {p.notes && (
                      <div className={`${(p.start_date || p.deadline) ? 'border-t border-gray-50 pt-3' : ''}`}>
                        <p className="text-[10px] text-gray-400 uppercase tracking-wide font-medium mb-1.5">Notes</p>
                        <p className="text-xs text-gray-500 leading-relaxed">{p.notes}</p>
                      </div>
                    )}
                  </div>

                  {/* Team card */}
                  {wsTeam.length > 0 && (
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                      <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-3">Team</p>
                      <div className="space-y-2.5">
                        {wsTeam.map(m => (
                          <div key={m.id} className="flex items-center gap-2.5">
                            <HubAvatar fullName={m.full_name} avatarUrl={m.avatar_url} size="w-7 h-7" className="flex-shrink-0" />
                            <span className="text-sm text-gray-700 truncate">{m.full_name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Activity card */}
                  {activity.length > 0 && (
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                      <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-3">Activity</p>
                      <div className="space-y-3">
                        {activity.slice(0, 5).map(a => {
                          const diff = Math.floor((Date.now() - new Date(a.created_at).getTime()) / 1000);
                          const time = diff < 60 ? 'just now' : diff < 3600 ? `${Math.floor(diff / 60)}m ago` : diff < 86400 ? `${Math.floor(diff / 3600)}h ago` : new Date(a.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                          const actorName = getProjectActivityActorName(a);
                          return (
                            <div key={a.id} className="flex items-start gap-2.5">
                              <div className="w-6 h-6 rounded-full bg-slate-50 border border-gray-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                                <span className="text-[#1c2b3a]/70 font-bold text-[9px]">{(actorName[0] ?? '?').toUpperCase()}</span>
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs text-gray-600 leading-snug line-clamp-2" title={getProjectActivityDescription(a)}>{getProjectActivityDescription(a)}</p>
                                <p className="text-[10px] text-gray-400 mt-0.5">{time}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}
      {!workspaceOpen && (
      <div className="space-y-4">

        <div className="space-y-2.5">
          {/* Primary: which section am I in */}
          <div className="flex items-center gap-3">
            <div className="flex gap-1 bg-gray-100 p-1 rounded-xl flex-shrink-0">
              <button onClick={() => setPageView('projects')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-semibold transition-all cursor-pointer whitespace-nowrap ${pageView === 'projects' ? 'bg-white text-[#111827] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                <i className="ri-folder-line text-sm"></i>Projects
              </button>
              <button onClick={() => { setPageView('tasks'); fetchAllTasks(); }}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-semibold transition-all cursor-pointer whitespace-nowrap ${pageView === 'tasks' ? 'bg-white text-[#111827] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                <i className="ri-task-line text-sm"></i>Tasks
              </button>
            </div>
            <div className="flex-1" />
            {pageView === 'projects' ? (
              <button onClick={() => { setEditingProject(null); setForm(emptyForm); setShowForm(true); }}
                className="flex items-center justify-center gap-1.5 min-w-[132px] px-3 py-1.5 bg-[#111827] text-white text-xs font-medium rounded-xl border border-transparent hover:bg-gray-800 transition-colors cursor-pointer whitespace-nowrap flex-shrink-0">
                <i className="ri-add-line text-sm"></i>New Project
              </button>
            ) : (
              <button onClick={() => { setPendingTaskDate(null); openNewTask(); }}
                className="flex items-center justify-center gap-1.5 min-w-[132px] px-3 py-1.5 bg-[#111827] text-white text-xs font-medium rounded-xl border border-transparent hover:bg-gray-800 transition-colors cursor-pointer whitespace-nowrap flex-shrink-0">
                <i className="ri-add-line text-sm"></i>New Task
              </button>
            )}
          </div>

          {/* Secondary: narrow down the current section */}
          {pageView === 'projects' && (
            <div className="flex items-center gap-2">
              <div className="flex gap-1 bg-gray-50 border border-gray-100 p-0.5 rounded-xl flex-shrink-0 overflow-x-auto max-w-full">
                {statusTabs.map(tab => (
                  <button key={tab.key} onClick={() => setStatusFilter(tab.key)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${statusFilter === tab.key ? 'bg-white text-[#111827] shadow-sm border border-gray-200' : 'text-gray-500 hover:text-gray-700'}`}>
                    {tab.label}
                  </button>
                ))}
              </div>
              <div className="relative flex-shrink-0">
                <button onClick={() => setShowFilterMenu(v => !v)} title="Filter projects"
                  className={`flex items-center justify-center w-8 h-8 rounded-xl border transition-colors cursor-pointer ${showFilterMenu ? 'border-gray-300 bg-gray-50 text-gray-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                  <i className="ri-filter-3-line text-sm"></i>
                </button>
                {showFilterMenu && <div className="fixed inset-0 z-10" onClick={() => setShowFilterMenu(false)} />}
                <div className={`absolute right-0 top-9 z-20 bg-white border border-gray-100 rounded-xl shadow-lg py-1 min-w-[160px] ${showFilterMenu ? 'block' : 'hidden'}`}>
                  <div className="px-3 py-1.5 border-b border-gray-50">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Filter by</p>
                  </div>
                  <div className="px-3 py-2 space-y-1.5">
                    <select value={projectTypeFilter} onChange={e => setProjectTypeFilter(e.target.value as any)}
                      className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg bg-white text-gray-600 focus:outline-none cursor-pointer">
                      <option value="all">All Types</option>
                      <option value="client">One-time</option>
                      <option value="internal">Internal</option>
                    </select>
                    <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
                      className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg bg-white text-gray-600 focus:outline-none cursor-pointer">
                      <option value="all">All Services</option>
                      {projectTypes.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className={pageView === 'tasks' ? '' : 'flex items-stretch gap-5'}>
        <section className={pageView === 'tasks' ? 'flex flex-col space-y-3 w-full' : 'flex flex-col space-y-3 flex-1 min-w-0'}>

          {pageView === 'tasks' && (
            <div className="space-y-4 pt-1 pb-3">
              {/* ── Filters ── */}
              <div className="flex flex-wrap gap-2 items-center">
                <div className="relative flex-1 min-w-[160px]">
                  <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
                  <input value={taskSearch} onChange={e => setTaskSearch(e.target.value)} placeholder="Search tasks..."
                    className="w-full pl-7 pr-3 py-1.5 text-xs border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]" />
                </div>
                <select value={taskStatusFilter} onChange={e => setTaskStatusFilter(e.target.value)} className="px-3 py-1.5 text-xs border border-gray-200 rounded-xl bg-white focus:outline-none cursor-pointer">
                  <option value="active">Active</option><option value="all">All</option><option value="overdue">Overdue</option>
                  <option value="todo">To Do</option><option value="in_progress">In Progress</option><option value="in_review">In Review</option><option value="blocked">Blocked</option><option value="done">Done</option>
                </select>
                <select value={taskGroupBy} onChange={e => setTaskGroupBy(e.target.value as 'project' | 'assignee')} className="px-3 py-1.5 text-xs border border-gray-200 rounded-xl bg-white focus:outline-none cursor-pointer">
                  <option value="project">By Project</option><option value="assignee">By Assignee</option>
                </select>
              </div>
              {allTasksLoading ? (
                <div className="flex justify-center py-16"><i className="ri-loader-4-line animate-spin text-2xl text-gray-300"></i></div>
              ) : (
                <GanttTimeline
                  tasks={allTasks.map((t: any) => ({
                    id: t.id,
                    project_id: t.project_id,
                    title: `${t.title}${t.project?.project_name ? ` · ${t.project.project_name}` : ''}`,
                    description: null,
                    status: t.status,
                    priority: t.priority,
                    due_date: t.due_date,
                    start_date: t.start_date,
                    assigned_to: t.assigned_to,
                    color: t.color,
                  })) as any}
                  projectStart={null}
                  projectEnd={null}
                  today={localToday()}
                  mode="dots"
                  projects={projects.filter(p => p.status !== 'cancelled').map(p => ({ id: p.id, project_name: p.project_name }))}
                  teamMembers={contractors.map(c => ({ id: c.id, full_name: c.full_name }))}
                  onQuickTaskCreated={fetchAllTasks}
                  onAddTask={(date) => {
                    setPendingTaskDate(date);
                    openNewTask();
                  }}
                  onTaskClick={(t: any) => {
                    const orig = allTasks.find((x: any) => x.id === t.id);
                    if (orig) openTaskInWorkspace(orig);
                  }}
                />
              )}
              {allTasksLoading ? null : (() => {
                const tod = localToday();
                const isOver = (t: any) => isTaskOverdue(t, tod);
                const filt = allTasks.filter(t => {
                  if (taskSearch && !t.title.toLowerCase().includes(taskSearch.toLowerCase()) && !t.project?.project_name?.toLowerCase().includes(taskSearch.toLowerCase())) return false;
                  if (taskStatusFilter === 'active') return t.status !== 'done';
                  if (taskStatusFilter === 'overdue') return isOver(t);
                  if (taskStatusFilter !== 'all') return t.status === taskStatusFilter;
                  return true;
                });
                const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
                  todo: { label: 'To Do', cls: 'bg-gray-100 text-gray-600' },
                  in_progress: { label: 'In Progress', cls: 'bg-sky-100 text-sky-700' },
                  in_review: { label: 'In Review', cls: 'bg-violet-100 text-violet-700' },
                  blocked: { label: 'Blocked', cls: 'bg-rose-100 text-rose-700' },
                  done: { label: 'Done', cls: 'bg-emerald-100 text-emerald-700' },
                };
                const groups: Record<string, any[]> = {};
                for (const t of filt) {
                  const key = taskGroupBy === 'project' ? (t.project?.project_name ?? 'Unknown') : (t.assignee?.full_name ?? 'Unassigned');
                  (groups[key] ??= []).push(t);
                }
                return Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0])).map(([grp, gtasks]) => {
                  const done = gtasks.filter(t => t.status === 'done').length;
                  const pct = Math.round((done / gtasks.length) * 100);
                  const overdue = gtasks.filter(t => isOver(t)).length;
                  return (
                    <div key={grp} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                      <div className="px-5 py-3 border-b border-gray-50 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-2 h-2 rounded-full bg-[#1c2b3a] flex-shrink-0"></span>
                          <h3 className="font-semibold text-sm text-gray-800 truncate">{grp}</h3>
                          <span className="text-xs text-gray-400 flex-shrink-0">{gtasks.length}</span>
                          {overdue > 0 && <span className="text-[10px] text-rose-500 font-medium flex-shrink-0">{overdue} overdue</span>}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-emerald-400 rounded-full" style={{ width: `${pct}%` }} /></div>
                          <span className="text-xs text-gray-400">{done}/{gtasks.length}</span>
                        </div>
                      </div>
                      <div className="divide-y divide-gray-50">
                        {gtasks.map(t => {
                          const over = isOver(t);
                          const scfg = STATUS_LABEL[t.status] ?? STATUS_LABEL.todo;
                          return (
                            <div key={t.id} onClick={() => openTaskInWorkspace(t)}
                              className={`flex items-center gap-3 px-5 py-2.5 hover:bg-gray-50/60 cursor-pointer ${over ? 'bg-rose-50/30' : ''}`}>
                              <button onClick={async e => { e.stopPropagation(); const n = t.status === 'done' ? 'todo' : 'done'; await supabase.from('hub_project_tasks').update({ status: n }).eq('id', t.id); setAllTasks(prev => prev.map(x => x.id === t.id ? { ...x, status: n } : x)); }} className="flex-shrink-0 cursor-pointer">
                                <i className={`text-base ${t.status === 'done' ? 'ri-checkbox-circle-fill text-emerald-500' : 'ri-checkbox-blank-circle-line text-gray-300 hover:text-emerald-400'}`}></i>
                              </button>
                              <div className="flex-1 min-w-0">
                                <p className={`text-sm truncate ${t.status === 'done' ? 'line-through text-gray-400' : 'text-gray-800'}`}>{t.title}</p>
                                {taskGroupBy === 'assignee' && t.project && <p className="text-[11px] text-gray-400 truncate">{t.project.project_name}</p>}
                              </div>
                              <span className={`hidden sm:flex items-center justify-center w-16 text-[10px] px-2 py-0.5 rounded-full font-semibold flex-shrink-0 ${scfg.cls}`}>{scfg.label}</span>
                              <span className={`w-12 text-[11px] font-medium flex-shrink-0 text-right ${over ? 'text-rose-500' : 'text-gray-400'}`}>
                                {t.due_date ? new Date(t.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
                              </span>
                              <div className="w-6 h-6 flex-shrink-0">
                                {t.assignee && taskGroupBy === 'project' && (
                                  t.assignee.avatar_url
                                    ? <img src={t.assignee.avatar_url} alt={t.assignee.full_name} className="w-6 h-6 rounded-full object-cover" />
                                    : <div className="w-6 h-6 rounded-full bg-[#1c2b3a] flex items-center justify-center text-white text-[9px] font-bold">{t.assignee.full_name[0]}</div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          )}

          <div className="flex-1 flex flex-col pt-1 pb-3" style={{ display: pageView === 'tasks' ? 'none' : undefined }}>
            {loading ? (
              <div className="flex justify-center py-16"><i className="ri-loader-4-line animate-spin text-gray-300 text-2xl"></i></div>
            ) : filtered.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-200 px-5 py-14 text-center">
                <p className="text-sm text-gray-400">No projects match this view yet.</p>
              </div>
            ) : (
              <div className="flex-1 flex flex-col space-y-5">
                {(() => {
                  const internalGroup = filtered.filter(p => p.project_type === 'internal');
                  const clientGroups = STAGES
                    .map(stage => ({ stage, projects: filtered.filter(p => p.project_type !== 'internal' && (p.stage ?? 'Pre-Design') === stage) }))
                    .filter(g => g.projects.length > 0);
                  return (
                    <>
                      {clientGroups.map(({ stage, projects }) => (
                        <div key={stage}>
                          <div className="flex items-center gap-2 mb-2">
                            <i className="ri-folder-line text-[#1c2b3a] text-sm"></i>
                            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-widest">{stage} <span className="text-gray-400 font-normal">({projects.length})</span></p>
                          </div>
                          <div className="rounded-2xl bg-white border border-gray-100 divide-y divide-gray-50 overflow-hidden">
                            {projects.map(p => renderProjectRow(p))}
                          </div>
                        </div>
                      ))}
                      {internalGroup.length > 0 && (
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            <i className="ri-building-line text-[#1c2b3a] text-sm"></i>
                            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-widest">Internal <span className="text-gray-400 font-normal">({internalGroup.length})</span></p>
                          </div>
                          <div className="rounded-2xl bg-white border border-gray-100 divide-y divide-gray-50 overflow-hidden">
                            {internalGroup.map(p => renderProjectRow(p))}
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            )}
          </div>
        </section>

        <div ref={detailPanelRef} />
        {pageView !== 'tasks' && (activeProject ? (() => {
          const cfg = statusCfg[activeProject.status] ?? statusCfg.ongoing;
          const unassigned = contractors.filter(c => !activeProject.hub_project_contractors.some(pc => pc.hub_users?.id === c.id));
          const internalProject = isInternalProject(activeProject);

          return (
            <>
              {/* Mobile: bottom sheet overlay */}
              <div className="lg:hidden fixed inset-0 z-40 bg-black/40" onClick={() => setActiveId(null)} />
              <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl max-h-[85vh] overflow-y-auto">
                <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-gray-100 sticky top-0 bg-white">
                  <div>
                    <p className="font-semibold text-[#111827] text-sm">{activeProject.project_name}</p>
                    <p className="text-xs text-gray-400">{internalProject ? 'Internal Project' : activeProject.client_name}</p>
                  </div>
                  <button onClick={() => setActiveId(null)} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 cursor-pointer">
                    <i className="ri-close-line"></i>
                  </button>
                </div>
                <div className="p-5 space-y-4" style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom, 0px) + 5rem)' }}>
                  {/* Stats */}
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: 'Team', value: String(activeProject.hub_project_contractors.length), cls: 'text-gray-800' },
                      { label: 'Tasks', value: String(tasks.length), cls: 'text-[#1c2b3a]' },
                      { label: 'Done', value: String(tasks.filter(t => t.status === 'done').length), cls: 'text-emerald-600' },
                      { label: 'Status', value: cfg.label, cls: 'text-gray-500' },
                    ].map(s => (
                      <div key={s.label} className="bg-gray-50 rounded-xl p-3">
                        <p className="text-[10px] text-gray-400 uppercase tracking-wide">{s.label}</p>
                        <p className={`text-sm font-bold mt-0.5 ${s.cls}`}>{s.value}</p>
                      </div>
                    ))}
                  </div>
                  {/* Actions */}
                  <div className="flex gap-2">
                    <button onClick={() => openEditProject(activeProject)}
                      className="flex-1 px-4 flex items-center justify-center gap-1.5 py-2.5 border border-gray-200 text-gray-600 text-sm rounded-xl cursor-pointer">
                      <i className="ri-edit-line"></i> Edit
                    </button>
                    <button onClick={() => void deleteProject(activeProject)} className="px-4 flex items-center gap-1.5 py-2.5 border border-rose-200 text-rose-500 text-sm rounded-xl cursor-pointer">
                      <i className="ri-delete-bin-line"></i>
                    </button>
                  </div>
                  {/* Team */}
                  {activeProject.hub_project_contractors.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 mb-2">Team</p>
                      <div className="space-y-2">
                        {activeProject.hub_project_contractors.map((pc: any) => (
                          <div key={pc.hub_users?.id} className="flex items-center gap-2.5">
                            <HubAvatar fullName={pc.hub_users?.full_name ?? ''} avatarUrl={pc.hub_users?.avatar_url} size="w-7 h-7" />
                            <div>
                              <p className="text-sm text-[#111827]">{pc.hub_users?.full_name}</p>
                              <p className="text-xs text-gray-400">{pc.hub_users?.department}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Desktop: right-side panel */}
            <div className="hidden lg:block space-y-4 w-full lg:w-[380px] lg:flex-shrink-0">
              {/* Header */}
              <div className="bg-white border border-gray-100 rounded-2xl p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="font-bold text-[#111827] text-lg leading-tight">{activeProject.project_name}</h2>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${cfg.cls}`}>{cfg.label}</span>
                      {internalProject && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-600">Internal</span>
                      )}
                      {activeProject.service && (
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${getServiceCfg(activeProject.service).badge}`}>{activeProject.service}</span>
                      )}
                      {activeProject.stage && (
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${getStageCfg(activeProject.stage).badge}`}>{activeProject.stage}</span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 mt-1">{internalProject ? 'Internal Project' : activeProject.client_name}</p>
                    {(activeProject.start_date || activeProject.deadline) && (
                      <p className="text-xs text-gray-400 mt-1">
                        {activeProject.start_date && `Started ${fmtDate(activeProject.start_date)}`}
                        {activeProject.start_date && activeProject.deadline && ' · '}
                        {activeProject.deadline && `Due ${fmtDate(activeProject.deadline)}`}
                      </p>
                    )}
                  </div>
                  <button onClick={() => setActiveId(null)} className="w-7 h-7 flex items-center justify-center text-gray-300 hover:text-gray-600 cursor-pointer flex-shrink-0" title="Close">
                    <i className="ri-close-line text-lg"></i>
                  </button>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap mt-4">
                    {/* Secondary actions */}
                    <div className="flex items-center gap-0.5 bg-white/60 border border-gray-200 rounded-xl px-1 py-1">
                      <button onClick={() => openEditProject(activeProject)}
                        className="text-xs text-gray-500 hover:text-gray-800 cursor-pointer flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 hover:bg-white transition-colors">
                        <i className="ri-edit-line text-sm"></i> Edit
                      </button>
                    </div>

                    {/* Delete — quiet danger */}
                    <button onClick={() => void deleteProject(activeProject)}
                      className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl cursor-pointer transition-colors border border-transparent hover:border-rose-100"
                      title="Delete project">
                      <i className="ri-delete-bin-line text-sm"></i>
                    </button>

                    {/* Separator */}
                    <div className="w-px h-5 bg-gray-200" />

                    {/* Primary action */}
                    <button onClick={() => setWorkspaceOpen(true)}
                      className="text-xs px-3 py-2 bg-indigo-600 hover:bg-[#0f1c28] text-white rounded-xl cursor-pointer flex items-center gap-1.5 transition-colors font-medium">
                      <i className="ri-layout-grid-line text-sm"></i> Workspace
                    </button>
                  </div>

                {/* Ops stats strip */}
                <div className="mt-4 flex items-center gap-4 text-sm text-gray-600 bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 flex-wrap">
                  <span><span className="font-semibold text-gray-800">{activeProject.hub_project_contractors.length}</span> <span className="text-gray-400 text-xs">members</span></span>
                  <span className="text-gray-200">|</span>
                  <span><span className="font-semibold text-gray-800">{tasks.length}</span> <span className="text-gray-400 text-xs">tasks</span></span>
                  <span className="text-gray-200">|</span>
                  <span><span className="font-semibold text-emerald-600">{tasks.filter(t => t.status === 'done').length}</span> <span className="text-gray-400 text-xs">done</span></span>
                </div>
                {activeProject.notes && <p className="text-xs text-gray-400 italic mt-3">{activeProject.notes}</p>}
              </div>

              {/* Team */}
              <div className="bg-white border border-gray-100 rounded-xl p-4 space-y-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Team</p>
                {activeProject.hub_project_contractors.length === 0 ? (
                <p className="text-xs text-gray-400">No team members assigned to this project yet.</p>
                ) : (
                <div className="space-y-2">
                  {activeProject.hub_project_contractors.map(pc => {
                    const u = pc.hub_users;
                    if (!u) return null;
                    return (
                      <div key={pc.id} className="flex items-center gap-3 p-3 border border-gray-100 bg-white rounded-xl">
                        <Avatar name={u.full_name} url={u.avatar_url} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-medium text-gray-800">{u.full_name}</p>
                            {pc.project_role && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white border border-gray-200 text-gray-500 font-medium">
                                {pc.project_role}
                              </span>
                            )}
                          </div>
                        </div>
                        <button onClick={() => removeContractor(pc.id)} className="text-gray-300 hover:text-rose-400 cursor-pointer flex-shrink-0"><i className="ri-delete-bin-line text-xs"></i></button>
                      </div>
                    );
                  })}
                </div>
                )}
                {unassigned.length > 0 && (
                  <div className="border-t border-gray-100 pt-3 space-y-2">
                    <div className="flex gap-2">
                      <select value={addCtxId} onChange={e => setAddCtxId(e.target.value)}
                        className="flex-1 px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none bg-white">
                        <option value="">Add team member...</option>
                        {unassigned.map(c => <option key={c.id} value={c.id}>{c.full_name}{c.department ? ` — ${c.department}` : ''}</option>)}
                      </select>
                    </div>
                    <div className="flex gap-2">
                      <input value={addCtxRole} onChange={e => setAddCtxRole(e.target.value)} placeholder="Project role (optional)"
                        className="flex-1 px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]" />
                      <button onClick={addContractor} disabled={!addCtxId || ctxSaving}
                        className="px-3 py-1.5 bg-[#111827] text-white text-xs rounded-lg hover:bg-gray-800 cursor-pointer disabled:opacity-40 whitespace-nowrap">
                        {ctxSaving ? '...' : 'Add Team Member'}
                      </button>
                    </div>
                    {ctxAddError && <p className="text-xs text-red-500">{ctxAddError}</p>}
                    <p className="text-[11px] text-gray-400">Assign people and roles. Tasks and workspace access start immediately.</p>
                  </div>
                )}
              </div>
            </div>

            </> // end desktop + mobile sheets
          );
        })() : (
          <div className="hidden lg:flex lg:flex-col w-full lg:w-[380px] lg:flex-shrink-0 h-full pt-1">
            {/* Invisible spacer matching the stage-group label row on the left
                (icon + text + mb-2), so this card's top aligns with the
                project list card, not the label. */}
            <div className="flex items-center gap-2 mb-2 invisible flex-shrink-0" aria-hidden="true">
              <i className="ri-folder-line text-sm"></i>
              <p className="text-[11px] font-semibold uppercase tracking-widest">Spacer</p>
            </div>
            <div className="flex-1 flex flex-col bg-white border border-gray-100 rounded-2xl overflow-hidden">
              <div className="px-5 pt-5 pb-3 flex items-center gap-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Tasks</p>
                <span className="text-[10px] font-semibold bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-md">{sidebarTasks.length}</span>
                <div className="flex gap-0.5 bg-gray-100 p-0.5 rounded-lg ml-1">
                  {([['mine', 'Mine'], ['everyone', 'Everyone']] as const).map(([key, label]) => (
                    <button key={key} onClick={() => setSidebarScope(key)}
                      className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition-all cursor-pointer ${sidebarScope === key ? 'bg-white text-[#111827] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                      {label}
                    </button>
                  ))}
                </div>
                <button onClick={() => { setPendingTaskDate(null); openNewTask(); }}
                  title="Add task"
                  className="ml-auto w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer flex-shrink-0">
                  <i className="ri-add-line text-base"></i>
                </button>
              </div>
              {sidebarTasks.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center px-5 pb-6 text-center">
                  <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                    <i className="ri-folder-open-line text-2xl text-gray-300"></i>
                  </div>
                  <p className="text-sm text-gray-400">{sidebarScope === 'mine' ? 'No open tasks assigned to you.' : 'No open tasks across the team.'}</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-50 max-h-[70vh] overflow-y-auto">
                  {sidebarTasks.map((t: any) => {
                    const today = localToday();
                    const over = isTaskOverdue(t, today);
                    const completing = sidebarTaskCompleting === t.id;
                    return (
                      <div key={t.id}
                        className={`flex items-start gap-2.5 px-5 py-3 transition-colors ${completing ? 'bg-emerald-50' : 'hover:bg-gray-50/70'}`}>
                        <div className="relative flex-shrink-0 mt-0.5">
                          <button onClick={() => setSidebarStatusMenuFor(prev => prev === t.id ? null : t.id)}
                            className="cursor-pointer" title="Change status">
                            {sidebarStatusIcon(t.status, completing)}
                          </button>
                          {sidebarStatusMenuFor === t.id && !completing && (
                            <>
                              <div className="fixed inset-0 z-20" onClick={() => setSidebarStatusMenuFor(null)} />
                              <div className="absolute left-0 top-7 z-30 bg-white border border-gray-100 rounded-xl shadow-xl py-1 min-w-[140px]">
                                {SIDEBAR_STATUS_OPTIONS.map(opt => (
                                  <button key={opt.value}
                                    onClick={() => { setSidebarStatusMenuFor(null); updateSidebarTaskStatus(t.id, opt.value); }}
                                    className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-gray-50 cursor-pointer text-left transition-colors ${t.status === opt.value ? 'font-semibold text-gray-800' : 'text-gray-600'}`}>
                                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${opt.dot}`} />
                                    {opt.label}
                                  </button>
                                ))}
                              </div>
                            </>
                          )}
                        </div>
                        {completing ? (
                          <p className="flex-1 text-sm font-medium text-emerald-600 line-through pt-0.5">Task completed</p>
                        ) : (
                          <>
                            <button onClick={() => openTaskInWorkspace(t)} className="flex-1 min-w-0 text-left cursor-pointer">
                              <p className={`text-sm truncate ${over ? 'text-gray-800' : 'text-gray-800'}`}>{t.title}</p>
                              <p className="text-[11px] text-gray-400 truncate mt-0.5">{t.project?.project_name ?? 'Unknown'}</p>
                            </button>
                            <div className="flex flex-col items-end gap-1 flex-shrink-0">
                              {t.assignee ? (
                                t.assignee.avatar_url
                                  ? <img src={t.assignee.avatar_url} alt={t.assignee.full_name} title={t.assignee.full_name} className="w-6 h-6 rounded-full object-cover object-top" />
                                  : <div title={t.assignee.full_name} className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-[9px] font-bold text-gray-500">{t.assignee.full_name[0]}</div>
                              ) : (
                                <div title="Unassigned" className="w-6 h-6 rounded-full bg-gray-50 border border-dashed border-gray-200 flex items-center justify-center"><i className="ri-user-line text-[9px] text-gray-300"></i></div>
                              )}
                              {t.due_date ? (
                                <span className={`text-[10px] font-medium whitespace-nowrap ${over ? 'text-rose-500' : 'text-gray-400'}`}>
                                  Due {new Date(t.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                </span>
                              ) : (
                                <span className="text-[10px] text-gray-300 whitespace-nowrap">No due date</span>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ))}
        </div>
      </div>
      )}

      {/* Project form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="font-semibold text-[#111827]">{editingProject ? 'Edit Project' : 'New Project'}</h2>
              <button onClick={() => { setShowForm(false); setEditingProject(null); }} className="text-gray-400 hover:text-gray-600 cursor-pointer w-7 h-7 flex items-center justify-center"><i className="ri-close-line text-lg"></i></button>
            </div>
            <div className="p-5 space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-700">Project Type</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value: 'client',   label: 'One-time', sub: 'Client project' },
                    { value: 'internal', label: 'Internal', sub: 'Tasks & team only' },
                  ].map(option => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setForm({ ...form, project_type: option.value as 'client' | 'internal', client_name: option.value === 'internal' && !form.client_name ? 'Internal' : form.client_name, contact_email: option.value === 'internal' ? '' : form.contact_email })}
                      className={`rounded-xl border px-2 py-3 text-left transition-colors cursor-pointer ${form.project_type === option.value ? 'border-[#111827] bg-gray-50' : 'border-gray-200 hover:border-gray-300'}`}
                    >
                      <p className="text-sm font-medium text-gray-800">{option.label}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">{option.sub}</p>
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-700">{form.project_type === 'internal' ? 'Owner / Label' : 'Client Name'}{form.project_type !== 'internal' ? ' *' : ''}</label>
                  <input value={form.client_name} onChange={e => setForm({ ...form, client_name: e.target.value })} placeholder={form.project_type === 'internal' ? 'e.g. Internal, Marketing, Ops' : 'e.g. Dela Cruz Residence'}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-700">Project Name *</label>
                  <input value={form.project_name} onChange={e => setForm({ ...form, project_name: e.target.value })} placeholder="e.g. 2-Storey Residential Design"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]" />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-700">Service</label>
                <select value={SERVICES.includes(form.service) ? form.service : 'Other'}
                  onChange={e => setForm({ ...form, service: e.target.value === 'Other' ? '' : e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none bg-white">
                  {SERVICES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                {!SERVICES.slice(0, -1).includes(form.service) && (
                  <input value={form.service} onChange={e => setForm({ ...form, service: e.target.value })}
                    placeholder="Describe the service..."
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a] mt-1.5" />
                )}
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-700">Phase</label>
                <select value={form.stage} onChange={e => setForm({ ...form, stage: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none bg-white">
                  {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-700">Status</label>
                  <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none bg-white">
                    <option value="ongoing">Ongoing</option>
                    <option value="completed">Completed</option>
                    <option value="paused">Paused</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-700">Start Date</label>
                  <input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })}
                    className="w-full px-3 py-2 text-sm text-gray-700 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a] [color-scheme:light]" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-700">Deadline</label>
                  <input type="date" value={form.deadline} onChange={e => setForm({ ...form, deadline: e.target.value })}
                    className="w-full px-3 py-2 text-sm text-gray-700 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a] [color-scheme:light]" />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-700">Notes</label>
                <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} placeholder="Any notes..."
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none resize-none" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-700 flex items-center gap-1.5">
                  <svg viewBox="0 0 87.3 78" className="w-3.5 h-3.5" xmlns="http://www.w3.org/2000/svg"><path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/><path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47"/><path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335"/><path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/><path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc"/><path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 27h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/></svg>
                  Google Drive URL <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input type="url" value={form.drive_url ?? ''} onChange={e => setForm({ ...form, drive_url: e.target.value })} placeholder="https://drive.google.com/drive/u/0/folders/..."
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400" />
              </div>
              {form.project_type === 'client' && (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-700">Client Contact Email</label>
                  <input type="email" value={form.contact_email} onChange={e => setForm({ ...form, contact_email: e.target.value })} placeholder="client@email.com"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]" />
                </div>
              )}
              {formError && <p className="text-xs text-red-500">{formError}</p>}
            </div>
            <div className="flex gap-2 p-5 pt-0">
              <button onClick={() => { setShowForm(false); setEditingProject(null); }} className="flex-1 py-2.5 text-sm border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50 cursor-pointer">Cancel</button>
              <button onClick={saveProject} disabled={formSaving}
                className="flex-1 py-2.5 text-sm bg-[#1c2b3a] text-white rounded-xl hover:bg-[#0f1c28] disabled:opacity-40 cursor-pointer">
                {formSaving ? 'Saving...' : editingProject ? 'Save Changes' : 'Create Project'}
              </button>
            </div>
          </div>
        </div>
      )}

      <TaskDetailPanel
        task={detailTask}
        open={detailOpen}
        initialDueDate={pendingTaskDate}
        onClose={() => { setDetailOpen(false); setDetailTask(null); setPendingTaskDate(null); }}
        onSaved={(saved) => {
          setTasks(prev => prev.some(t => t.id === saved.id)
            ? prev.map(t => t.id === saved.id ? { ...t, ...saved } : t)
            : [...prev, saved as ProjectTask]);
          setDetailTask(saved);
          // Refresh comment count for this task
          if (saved.id) supabase.from('hub_project_task_comments').select('task_id').eq('task_id', saved.id)
            .then(({ data }) => setCommentCounts(prev => ({ ...prev, [saved.id]: data?.length ?? prev[saved.id] ?? 0 })));
          refreshWorkspaceActivity();
          fetchAllTasks();
          setPendingTaskDate(null);
        }}
        onDeleted={(id) => {
          setTasks(prev => prev.filter(t => t.id !== id));
          setAllTasks(prev => prev.filter(t => t.id !== id));
          setDetailOpen(false);
          setDetailTask(null);
          refreshWorkspaceActivity();
        }}
        onArchived={(id) => {
          setTasks(prev => prev.map(t => t.id === id ? { ...t, archived: true, archived_at: new Date().toISOString() } : t));
          setAllTasks(prev => prev.filter(t => t.id !== id));
          setDetailOpen(false);
          setDetailTask(null);
        }}
        onActivityChange={refreshWorkspaceActivity}
        projectId={activeId ?? 0}
        projectName={activeProject?.project_name ?? 'General'}
        projects={projects.filter(p => p.status !== 'cancelled').map(p => ({ id: p.id, project_name: p.project_name, client_name: p.client_name, project_type: p.project_type }))}
        teamMembers={contractors.map(c => ({ id: c.id, full_name: c.full_name, avatar_url: c.avatar_url }))}
        canEdit={true}
        currentUserId={hubUser?.id ?? ''}
        currentUserName={hubUser?.full_name ?? 'Admin'}
        currentUserAvatarUrl={hubUser?.avatar_url ?? null}
      />
    </AdminLayout>
  );
}

