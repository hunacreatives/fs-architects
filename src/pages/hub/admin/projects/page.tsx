import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import AdminLayout from '@/pages/hub/components/AdminLayout';
import HubAvatar from '@/pages/hub/components/HubAvatar';
import { GanttTimeline } from '@/pages/hub/components/GanttTimeline';
import { supabase } from '@/lib/supabase';
import { fetchUserFinanceMap, mergeFinance } from '@/lib/userFinance';
import { createHubNotifications } from '@/lib/hubNotifications';
import { useHubAuth as useAuth } from '@/hooks/useHubAuth';
import { useDemo } from '@/contexts/DemoContext';
import { logAudit } from '@/lib/audit';
import { getSetting } from '@/lib/settings';
import { localToday, slugify } from '@/lib/formatUtils';
import { DEMO_PROJECTS, DEMO_CONTRACTORS } from '@/lib/demoData';
import TaskDetailPanel, { type TaskDetailTask } from '@/pages/hub/components/TaskDetailPanel';
import { uploadFileToDrive } from '@/lib/driveUpload';
import { createTaskAttachment } from '@/lib/taskAttachments';
import { getTaskDescriptionPreview } from '@/pages/hub/utils/taskPreview';
import { getPrimaryTaskAssigneeId, getTaskAssigneeIds, normalizeTaskAssigneePayload } from '@/lib/taskAssignments';

// ── SVG progress ring ──────────────────────────────────────────────────────
function ProgressRing({ pct, size = 120 }: { pct: number; size?: number }) {
  const r = (size / 2) - 10;
  const circ = 2 * Math.PI * r;
  const filled = Math.max(0, Math.min(pct, 100)) / 100 * circ;
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e5e7eb" strokeWidth={size < 60 ? 7 : 9} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke="#3b82f6" strokeWidth={size < 60 ? 7 : 9}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circ}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dasharray 1s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-bold text-gray-900" style={{ fontSize: size < 60 ? 13 : 22 }}>{pct}%</span>
        {size >= 100 && <span className="text-[10px] text-gray-400 mt-0.5">complete</span>}
      </div>
    </div>
  );
}

const fmt = (n: number) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtRate = (rate: number | null, currency?: string | null) =>
  rate == null ? '—' : currency === 'USD' ? `$${rate.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}/mo` : `${fmt(rate)}/mo`;

const getServicePalette = (service: string | null | undefined) => {
  const s = (service ?? '').toLowerCase();
  if (s.includes('website design'))      return { from: '#6366f1', to: '#8b5cf6' };
  if (s.includes('website maintenance')) return { from: '#0ea5e9', to: '#6366f1' };
  if (s.includes('branding'))            return { from: '#ec4899', to: '#f97316' };
  if (s.includes('graphic'))             return { from: '#f97316', to: '#f59e0b' };
  if (s.includes('social media'))        return { from: '#10b981', to: '#0ea5e9' };
  if (s.includes('content'))             return { from: '#14b8a6', to: '#6366f1' };
  if (s.includes('seo'))                 return { from: '#84cc16', to: '#10b981' };
  if (s.includes('digital ads') || s.includes('ads')) return { from: '#f59e0b', to: '#ef4444' };
  if (s.includes('email'))               return { from: '#8b5cf6', to: '#ec4899' };
  if (s.includes('marketing'))           return { from: '#f97316', to: '#f59e0b' };
  return                                        { from: '#94a3b8', to: '#64748b' };
};
const fmtPct = (n: number) => `${n.toFixed(1)}%`;
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

interface ContractorPayout { id: number; amount: number; paid_at: string; notes: string | null; receipt_url: string | null; }
interface PaymentReminder { id: number; send_date: string; amount_due: number | null; notes: string | null; status: string; sent_at: string | null; }
type InvoiceSendMode = 'now' | 'schedule';

interface Project {
  id: number; client_name: string; project_name: string; service: string | null;
  project_type: 'client' | 'internal' | 'retainer';
  contract_price: number; monthly_rate: number | null; status: string; start_date: string | null; deadline: string | null; notes: string | null; contact_email: string | null;
  hub_project_payments: { id: number; amount: number; paid_at: string; notes: string | null; receipt_url: string | null }[];
  hub_project_costs: { id: number; label: string; amount: number; date: string }[];
  hub_payment_reminders: PaymentReminder[];
  hub_project_contractors: {
    id: number; percentage: number; payout_type: string; fixed_amount: number | null;
    payout_status: string; paid_at: string | null; notes: string | null;
    project_role?: string | null;
    hub_users: { id: string; full_name: string; avatar_url: string | null; email: string | null };
    hub_project_contractor_payouts: ContractorPayout[];
  }[];
}

interface Contractor { id: string; full_name: string; avatar_url: string | null; project_percentage: number | null; department: string | null; }

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
  const navigate = useNavigate();
  const isOwner = hubUser?.role === 'owner' || isDemo;
  const [usdRate, setUsdRate] = useState(56);
  useEffect(() => { getSetting('usd_rate', '56').then(v => setUsdRate(parseFloat(v))); }, []);
  const [searchParams, setSearchParams] = useSearchParams();
  const [projects, setProjects] = useState<Project[]>([]);
  const [statsPeriod, setStatsPeriod] = useState<'month' | 'year' | 'all'>('all');
  const [statsDateFrom, setStatsDateFrom] = useState('');
  const [statsDateTo, setStatsDateTo] = useState('');
  const [intlClients, setIntlClients] = useState<{ id: number; client_name: string; platform: string | null; status: string; notes: string | null; contract_value: number | null; contract_currency: string | null; assignments: { id: number; contractor_id: string; role: string | null; hub_users: { id: string; full_name: string; avatar_url: string | null; department: string | null } | null }[] }[]>([]);
  const [activeClientId, setActiveClientId] = useState<number | null>(null);
  const [clientForm, setClientForm] = useState({ client_name: '', platform: '', status: 'active', notes: '', contract_value: '', contract_currency: 'PHP' });
  const [showClientModal, setShowClientModal] = useState(false);
  const [editingClient, setEditingClient] = useState<typeof intlClients[0] | null>(null);
  const [clientSaving, setClientSaving] = useState(false);
  const [clientError, setClientError] = useState('');
  const [assignAddId, setAssignAddId] = useState('');
  const [assignAddRole, setAssignAddRole] = useState('');
  const [assignSaving, setAssignSaving] = useState(false);
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'ongoing' | 'paused' | 'completed' | 'cancelled'>('ongoing');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [pageView, setPageView] = useState<'projects' | 'tasks'>('projects');
  const [allTasks, setAllTasks] = useState<any[]>([]);
  const [allTasksLoading, setAllTasksLoading] = useState(false);
  const [taskStatusFilter, setTaskStatusFilter] = useState('active');
  const [taskGroupBy, setTaskGroupBy] = useState<'project' | 'assignee'>('project');
  const [taskSearch, setTaskSearch] = useState('');
  const [projectTypeFilter, setProjectTypeFilter] = useState<'all' | 'client' | 'internal' | 'retainer'>('all');
  const [activeId, setActiveId] = useState<number | null>(() => {
    const w = searchParams.get('w');
    return w ? parseInt(w) : null;
  });
  const [linkCopied, setLinkCopied] = useState(false);

  // Project form
  const SERVICES = ['Architecture', 'Interior Design', 'Design & Drafting', 'Project Management', 'Construction Admin', 'Feasibility Study', 'Design-Build', 'Renovation', 'Consultation', 'Other'];
  const emptyForm = { project_type: 'client' as 'client' | 'internal' | 'retainer', client_name: '', project_name: '', service: 'Architecture', contract_price: '', monthly_rate: '', monthly_rate_currency: 'PHP' as 'PHP' | 'USD', status: 'ongoing', start_date: '', deadline: '', notes: '', contact_email: '', drive_url: '' };
  const [showForm, setShowForm] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [importing, setImporting] = useState(false);
  const [importedTasks, setImportedTasks] = useState<{ title: string; description: string | null; priority: 'low' | 'medium' | 'high'; start_date: string | null; due_date: string | null }[]>([]);

  // Payment log
  const [payAmount, setPayAmount] = useState('');
  const [payCurrency, setPayCurrency] = useState<'PHP' | 'USD'>('PHP');
  const [payDate, setPayDate] = useState(localToday());
  const [payNotes, setPayNotes] = useState('');
  const [payReceipt, setPayReceipt] = useState<File | null>(null);
  const [paySaving, setPaySaving] = useState(false);
  const [payError, setPayError] = useState('');

  // Payment edit
  const [editingPaymentId, setEditingPaymentId] = useState<number | null>(null);
  const [editPayForm, setEditPayForm] = useState({ amount: '', date: '', notes: '', receipt: null as File | null, existingReceiptUrl: null as string | null });
  const [editPaySaving, setEditPaySaving] = useState(false);
  const [editPayError, setEditPayError] = useState('');

  // Cost log
  const [costLabel, setCostLabel] = useState('');
  const [costAmount, setCostAmount] = useState('');
  const [costDate, setCostDate] = useState(localToday());
  const [costSaving, setCostSaving] = useState(false);
  const [costError, setCostError] = useState('');

  // Send receipt
  const [sendReceiptModal, setSendReceiptModal] = useState<{ payment: Project['hub_project_payments'][0]; project: Project } | null>(null);
  const [sendReceiptEmail, setSendReceiptEmail] = useState('');
  const [sendReceiptCc, setSendReceiptCc] = useState('');
  const [sendReceiptSending, setSendReceiptSending] = useState(false);
  const [sendReceiptMsg, setSendReceiptMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Contractor assignment
  const [addCtxId, setAddCtxId] = useState('');
  const [addCtxRole, setAddCtxRole] = useState('');
  const [ctxSaving, setCtxSaving] = useState(false);
  const [ctxAddError, setCtxAddError] = useState('');
  const [ctxConfigSaving, setCtxConfigSaving] = useState<Record<number, boolean>>({});
  const [ctxConfigError, setCtxConfigError] = useState<Record<number, string>>({});
  const [ctxConfigForm, setCtxConfigForm] = useState<Record<number, { payoutType: 'percentage' | 'fixed'; percentage: string; fixedAmount: string }>>({});

  // Staged contractor payouts: keyed by hub_project_contractors.id
  const [ctxPayForm, setCtxPayForm] = useState<Record<number, { amount: string; date: string; notes: string; receipt: File | null; notify: boolean }>>({});
  const [ctxPaySaving, setCtxPaySaving] = useState<Record<number, boolean>>({});
  const [ctxPayError, setCtxPayError] = useState<Record<number, string>>({});
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  // Invoice
  const [invoiceModal, setInvoiceModal] = useState<Project | null>(null);
  const emptyInvoiceForm = {
    email: '',
    cc: '',
    subject: '',
    due_date: '',
    invoice_number: '',
    bill_to_name: '',
    bill_to_address: '',
    reference: '',
    payment_terms: '',
    send_mode: 'now' as InvoiceSendMode,
    scheduled_for: '',
    message: '',
    amount_requested: '',
  };
  const [invoiceForm, setInvoiceForm] = useState(emptyInvoiceForm);
  const setIf = (patch: Partial<typeof emptyInvoiceForm>) => setInvoiceForm(f => ({ ...f, ...patch }));
  const [invoiceLineItems, setInvoiceLineItems] = useState<{ description: string; amount: string }[]>([]);
  const [invoiceShowPayments, setInvoiceShowPayments] = useState(true);
  const [invoiceSending, setInvoiceSending] = useState(false);
  const [invoiceMsg, setInvoiceMsg] = useState<{ ok: boolean; text: string } | null>(null);

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
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskAssigneeIds, setNewTaskAssigneeIds] = useState<string[]>([]);
  const [newTaskDue, setNewTaskDue] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [newTaskAttachment, setNewTaskAttachment] = useState<File | null>(null);
  const [taskSaving, setTaskSaving] = useState(false);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const newTaskAttachmentRef = useRef<HTMLInputElement>(null);

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
  // Collapsible detail sections (all closed by default)
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  // Collapsed task groups in workspace
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const toggleSection = (key: string) => setOpenSections(s => ({ ...s, [key]: !s[key] }));
  const teamPayoutsOpen = !!openSections['team'];

  // Payment reminders
  const [reminderDate, setReminderDate] = useState('');
  const [reminderAmount, setReminderAmount] = useState('');
  const [reminderNotes, setReminderNotes] = useState('');
  const [reminderSaving, setReminderSaving] = useState(false);
  const [reminderError, setReminderError] = useState('');
  const invoiceLocked = !!invoiceMsg?.ok;

  const fetchNextInvoiceNumber = async () => {
    const [sentRes, scheduledRes] = await Promise.all([
      supabase.from('hub_invoice_log').select('invoice_number').order('id', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('hub_scheduled_invoices').select('invoice_number').order('id', { ascending: false }).limit(1).maybeSingle(),
    ]);

    const latest = [sentRes.data?.invoice_number, scheduledRes.data?.invoice_number]
      .map((value) => parseInt(String(value ?? ''), 10))
      .filter((value) => !Number.isNaN(value));

    if (latest.length === 0) return '0001';
    return String(Math.max(...latest) + 1).padStart(4, '0');
  };

  const fetchTasks = async (projectId: number) => {
    const [tRes, aRes] = await Promise.all([
      supabase.from('hub_project_tasks')
        .select('*')
        .eq('project_id', projectId)
        .order('sort_order', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true }),
      supabase.from('hub_project_activity')
        .select('*, hub_users(full_name, avatar_url)')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(20),
    ]);
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

  const createTask = async () => {
    if (!activeId || !newTaskTitle.trim()) return;
    setTaskSaving(true);
    try {
      const taskAssigneePayload = normalizeTaskAssigneePayload(newTaskAssigneeIds);
      const { data, error } = await supabase.from('hub_project_tasks').insert({
        project_id: activeId,
        title: newTaskTitle.trim(),
        status: 'todo',
        priority: newTaskPriority,
        ...taskAssigneePayload,
        due_date: newTaskDue || null,
      }).select('*').single();
      if (error || !data) return;
      if (newTaskAttachment && hubUser?.id) {
        setUploadingAttachment(true);
        try {
          await createTaskAttachment({
            taskId: data.id,
            file: newTaskAttachment,
            uploadedBy: hubUser.id,
            projectName: activeProject?.project_name ?? 'General',
          });
        } finally {
          setUploadingAttachment(false);
        }
      }
      const assigneeUser = taskAssigneePayload.assigned_to
        ? activeProject?.hub_project_contractors.find(pc => pc.hub_users?.id === taskAssigneePayload.assigned_to)?.hub_users ?? null
        : null;
      setTasks(prev => [...prev, { ...data, hub_users: assigneeUser } as ProjectTask]);
      const assigneeNames = newTaskAssigneeIds
        .map((assigneeId) => activeProject?.hub_project_contractors.find((pc) => pc.hub_users?.id === assigneeId)?.hub_users?.full_name ?? '')
        .filter(Boolean);
      await logActivity(activeId, `${hubUser?.full_name ?? 'Admin'} created task "${newTaskTitle.trim()}"${assigneeNames.length ? ` — assigned to ${assigneeNames.join(', ')}` : ''}`);
      if (newTaskAssigneeIds.length > 0 && data) {
        supabase.functions.invoke('notify-task-assigned', {
          body: {
            task_id: data.id,
            task_title: newTaskTitle.trim(),
            project_id: activeId,
            project_name: activeProject?.project_name ?? '',
            assigned_to_ids: newTaskAssigneeIds,
            assigned_by_name: hubUser?.full_name ?? 'Admin',
          },
        }).catch(console.error);
      }
      setNewTaskTitle(''); setNewTaskAssigneeIds([]); setNewTaskDue(''); setNewTaskPriority('medium'); setNewTaskAttachment(null); setShowTaskForm(false);
      if (newTaskAttachmentRef.current) newTaskAttachmentRef.current.value = '';
      fetchTasks(activeId);
    } catch (err) {
      console.error('Task create error:', err);
    } finally {
      setTaskSaving(false);
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

  const deleteTask = async (task: ProjectTask) => {
    if (isDemo) return;
    await supabase.from('hub_project_tasks').delete().eq('id', task.id);
    setTasks(prev => prev.filter(t => t.id !== task.id));
  };

  const fetchAllTasks = async () => {
    setAllTasksLoading(true);
    const [tasksRes, projectsRes] = await Promise.all([
      supabase.from('hub_project_tasks').select('id, project_id, title, status, priority, assigned_to, assignee_ids, due_date').order('due_date', { ascending: true, nullsFirst: false }),
      supabase.from('hub_projects').select('id, project_name, client_name, project_type'),
    ]);
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
    const [pRes, cRes, clientRes] = await Promise.all([
      supabase.from('hub_projects')
        .select('*, hub_project_payments(id, amount, paid_at, notes, receipt_url), hub_project_costs(id, label, amount, date), hub_payment_reminders(id, send_date, amount_due, notes, status, sent_at), hub_project_contractors(id, percentage, payout_type, fixed_amount, payout_status, paid_at, notes, hub_users(id, full_name, avatar_url, email), hub_project_contractor_payouts(id, amount, paid_at, notes, receipt_url))')
        .order('created_at', { ascending: false }),
      supabase.from('hub_users').select('id, full_name, avatar_url, department')
        .eq('status', 'active').order('full_name'),
      supabase.from('hub_clients').select('id, client_name, platform, status, notes, contract_value, contract_currency, hub_client_assignments(id, contractor_id, role, hub_users(id, full_name, avatar_url, department))').order('client_name'),
    ]);
    setProjects((pRes.data as Project[]) ?? []);
    // project_percentage is served through the finance RPC (column read revoked).
    const cList = (cRes.data as any[]) ?? [];
    const cFinance = await fetchUserFinanceMap(cList.map((c) => c.id));
    setContractors(mergeFinance(cList, cFinance) as Contractor[]);
    setIntlClients((clientRes.data ?? []).map((c: any) => ({
      id: c.id, client_name: c.client_name, platform: c.platform, status: c.status,
      notes: c.notes, contract_value: c.contract_value, contract_currency: c.contract_currency,
      assignments: (Array.isArray(c.hub_client_assignments) ? c.hub_client_assignments : []).map((a: any) => ({
        id: a.id, contractor_id: a.contractor_id, role: a.role,
        hub_users: Array.isArray(a.hub_users) ? a.hub_users[0] : a.hub_users,
      })),
    })));
    setLoading(false);
  };

  useEffect(() => {
    if (isDemo) {
      setProjects(DEMO_PROJECTS as unknown as Project[]);
      setContractors(DEMO_CONTRACTORS.map(c => ({ id: c.id, full_name: c.full_name, avatar_url: null, project_percentage: null, department: c.department || null })));
      setLoading(false);
      return;
    }
    fetchAll();
  }, [isDemo]);

  const activeProject = projects.find(p => p.id === activeId) ?? null;

  const isRetainerProject = (project: Project | null | undefined) => project?.project_type === 'retainer';

  const derived = (p: Project) => {
    const totalPaid = p.hub_project_payments.reduce((s, x) => s + x.amount, 0);
    const totalCosts = p.hub_project_costs.reduce((s, x) => s + x.amount, 0);
    const netProfit = (p.project_type === 'retainer' ? totalPaid : p.contract_price) - totalCosts;
    const balance = p.project_type === 'retainer' ? 0 : p.contract_price - totalPaid;
    const paidPct = p.project_type === 'retainer' ? 100 : (p.contract_price > 0 ? (totalPaid / p.contract_price) * 100 : 0);
    const monthsActive = p.start_date ? Math.max(1, Math.ceil((Date.now() - new Date(p.start_date).getTime()) / (1000 * 60 * 60 * 24 * 30.5))) : null;
    const monthlyRatePHP = p.monthly_rate
      ? ((p as any).monthly_rate_currency === 'USD' ? p.monthly_rate * usdRate : p.monthly_rate)
      : 0;
    const monthsCollected = monthlyRatePHP > 0 ? Math.round(totalPaid / monthlyRatePHP) : null;
    return { totalPaid, totalCosts, netProfit, balance, paidPct, monthsActive, monthsCollected };
  };

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
    if (project.deadline && project.deadline < today && project.status !== 'completed') {
      if (project.project_type === 'client') {
        const d = derived(project);
        if (d.balance > 0) return 'Waiting on payment';
      }
      return 'Overdue';
    }
    if (project.deadline) {
      const daysLeft = Math.ceil((new Date(project.deadline).getTime() - new Date(today).getTime()) / 86400000);
      if (daysLeft <= 7) return 'Due this week';
    }
    if (project.project_type === 'client') {
      const d = derived(project);
      if (d.paidPct >= 100) return 'Fully paid';
    }
    if (project.project_type === 'retainer') return 'Active retainer';
    if (project.project_type === 'internal') {
      const hasInProgress = tasksTotal > tasksDone && tasksTotal > 0;
      if (hasInProgress) return 'Internal sprint';
    }
    return 'In progress';
  };

  const saveProject = async () => {
    const isInternal = form.project_type === 'internal';
    const isRetainer = form.project_type === 'retainer';
    if (!form.project_name.trim()) { setFormError('Project name is required.'); return; }
    if (!isInternal && !form.client_name.trim()) { setFormError('Client name is required.'); return; }
    if (!isRetainer && !isInternal && !form.contract_price) { setFormError('Contract price is required.'); return; }
    if (isRetainer && !form.monthly_rate) { setFormError('Monthly rate is required for retainer projects.'); return; }
    setFormSaving(true); setFormError('');
    const payload = {
      project_type: form.project_type,
      client_name: isInternal ? (form.client_name.trim() || 'Internal') : form.client_name.trim(),
      project_name: form.project_name.trim(),
      service: form.service || null,
      contract_price: isInternal || isRetainer ? 0 : parseFloat(form.contract_price),
      monthly_rate: isRetainer ? parseFloat((form as any).monthly_rate) : null,
      monthly_rate_currency: isRetainer ? (form as any).monthly_rate_currency : 'PHP',
      status: form.status,
      start_date: form.start_date || null,
      deadline: isRetainer ? null : (form.deadline || null),
      notes: form.notes || null,
      contact_email: isInternal ? null : (form.contact_email.trim() || null),
      drive_url: (form as any).drive_url?.trim() || null,
    };
    if (editingProject) {
      const { error } = await supabase.from('hub_projects').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', editingProject.id);
      if (error) { setFormError(error.message); setFormSaving(false); return; }
      logAudit({ actor_id: hubUser?.id, actor_name: hubUser?.full_name, action: 'update', entity_type: 'project', entity_id: String(editingProject.id), description: `Updated project "${form.project_name}"` });
    } else {
      const { data, error } = await supabase.from('hub_projects').insert(payload).select('id').single();
      if (error) { setFormError(error.message); setFormSaving(false); return; }
      logAudit({ actor_id: hubUser?.id, actor_name: hubUser?.full_name, action: 'create', entity_type: 'project', description: `Created ${isRetainer ? 'retainer' : isInternal ? 'internal' : 'client'} project "${form.project_name}"` });
      // Auto-assign the creator (owner/admin) to the new project
      if (data && hubUser?.id) {
        await supabase.from('hub_project_contractors').insert({
          project_id: data.id,
          contractor_id: hubUser.id,
          payout_type: 'percentage',
          percentage: 0,
          payout_status: 'pending',
        }).then(({ error: e }) => { if (e) console.error('Auto-assign owner failed:', e); });
      }
      if (data) {
        setActiveId(data.id);
        if (importedTasks.length > 0) {
          await supabase.from('hub_project_tasks').insert(
            importedTasks.map(t => ({
              project_id: data.id,
              title: t.title,
              description: t.description || null,
              status: 'todo' as const,
              priority: t.priority,
              start_date: t.start_date || null,
              due_date: t.due_date || null,
              assigned_to: null,
            }))
          );
        }
      }
    }
    setFormSaving(false); setShowForm(false); setEditingProject(null); setForm(emptyForm); setImportedTasks([]);
    fetchAll();
  };

  const deleteProject = async (project: Project) => {
    if (isDemo) return;
    const hasData = project.hub_project_payments.length > 0 || project.hub_project_contractors.length > 0;
    const dataWarning = hasData ? '\n\nThis project has data (payments, team assignments) that will also be deleted.' : '';
    const confirmed = window.confirm(
      `Delete "${project.project_name}"?\n\nThis will permanently delete the project, all assignments, tasks, activity, payments, costs, and reminders. This cannot be undone.${dataWarning}`
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

  const logPayment = async () => {
    if (!activeId || !payAmount) return;
    setPaySaving(true); setPayError('');

    let receipt_url: string | null = null;
    if (payReceipt) {
      receipt_url = await uploadFileToDrive(payReceipt, 'payout_receipt', { year: new Date().getFullYear().toString() });
    }

    const amountPHP = payCurrency === 'USD' ? parseFloat(payAmount) * usdRate : parseFloat(payAmount);
    const noteWithCurrency = payCurrency === 'USD' ? `$${payAmount} USD @ ₱${usdRate}${payNotes ? ' · ' + payNotes : ''}` : (payNotes || null);
    const { error } = await supabase.from('hub_project_payments').insert({
      project_id: activeId, amount: amountPHP, paid_at: payDate, notes: noteWithCurrency, receipt_url,
    });
    setPaySaving(false);
    if (error) { setPayError(error.message); return; }
    setPayAmount(''); setPayNotes(''); setPayReceipt(null); setPayCurrency('PHP');
    fetchAll();
  };

  const activeClient = intlClients.find(c => c.id === activeClientId) ?? null;

  const [openingWorkspace, setOpeningWorkspace] = useState(false);

  const openClientWorkspace = async (client: typeof intlClients[0]) => {
    setOpeningWorkspace(true);
    try {
      // Check if a retainer project already exists for this client
      const project = projects.find(p =>
        p.project_type === 'retainer' && (
          p.client_name.toLowerCase() === client.client_name.toLowerCase() ||
          p.project_name.toLowerCase() === client.client_name.toLowerCase()
        )
      );
      if (!project) {
        const { data, error } = await supabase.from('hub_projects').insert({
          project_type: 'retainer',
          client_name: client.client_name,
          project_name: client.client_name,
          service: client.platform ?? 'Marketing',
          contract_price: 0,
          monthly_rate: client.contract_value ?? 0,
          status: 'ongoing',
          notes: client.notes ?? null,
        }).select('id').single();
        if (error) { alert(`Could not create workspace: ${error.message}`); return; }
        if (client.assignments.length > 0) {
          await supabase.from('hub_project_contractors').insert(
            client.assignments.map(a => ({ project_id: data.id, contractor_id: a.contractor_id, payout_type: 'percentage', percentage: 0, payout_status: 'pending' }))
          ).catch(console.error);
        }
        await fetchAll();
        setActiveId(data.id);
      } else {
        setActiveId(project.id);
      }
      setActiveClientId(null);
    } finally {
      setOpeningWorkspace(false);
    }
  };

  const saveClient = async () => {
    if (!clientForm.client_name.trim()) return;
    setClientSaving(true); setClientError('');
    const payload = { client_name: clientForm.client_name.trim(), platform: clientForm.platform.trim() || null, status: clientForm.status, notes: clientForm.notes.trim() || null, contract_value: clientForm.contract_value ? parseFloat(clientForm.contract_value) : null, contract_currency: clientForm.contract_currency };
    if (editingClient) {
      const { error } = await supabase.from('hub_clients').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', editingClient.id);
      if (error) { setClientError(error.message); setClientSaving(false); return; }
    } else {
      const { error } = await supabase.from('hub_clients').insert(payload);
      if (error) { setClientError(error.message); setClientSaving(false); return; }
    }
    setClientSaving(false); setShowClientModal(false); setEditingClient(null);
    fetchAll();
  };

  const addClientAssignment = async () => {
    if (!activeClientId || !assignAddId) return;
    setAssignSaving(true);
    await supabase.from('hub_client_assignments').insert({ client_id: activeClientId, contractor_id: assignAddId, role: assignAddRole.trim() || null });
    setAssignAddId(''); setAssignAddRole('');
    setAssignSaving(false);
    fetchAll();
  };

  const removeClientAssignment = async (assignmentId: number) => {
    await supabase.from('hub_client_assignments').delete().eq('id', assignmentId);
    fetchAll();
  };

  const deleteClient = async (id: number) => {
    await supabase.from('hub_clients').delete().eq('id', id);
    if (activeClientId === id) setActiveClientId(null);
    fetchAll();
  };

  const sendReceipt = async () => {
    if (!sendReceiptModal || !sendReceiptEmail.trim()) return;
    setSendReceiptSending(true); setSendReceiptMsg(null);
    const { payment, project } = sendReceiptModal;
    const totalPaid = project.hub_project_payments.reduce((s, p) => s + p.amount, 0);
    const { data, error } = await supabase.functions.invoke('send-payment-receipt', {
      body: {
        to: sendReceiptEmail.trim(),
        cc: sendReceiptCc.trim() || undefined,
        client_name: project.client_name,
        project_name: project.project_name,
        amount: payment.amount,
        paid_at: payment.paid_at,
        notes: payment.notes,
        receipt_url: payment.receipt_url,
        total_paid: totalPaid,
        contract_price: project.contract_price,
        invoice_number: project.id,
        project_id: project.id,
      },
    });
    setSendReceiptSending(false);
    if (error || data?.error) {
      setSendReceiptMsg({ ok: false, text: data?.error ?? error?.message ?? 'Failed to send' });
    } else {
      setSendReceiptMsg({ ok: true, text: 'Receipt sent!' });
    }
  };

  const logCost = async () => {
    if (!activeId || !costLabel.trim() || !costAmount) return;
    setCostSaving(true); setCostError('');
    const { error } = await supabase.from('hub_project_costs').insert({
      project_id: activeId, label: costLabel.trim(), amount: parseFloat(costAmount), date: costDate,
    });
    setCostSaving(false);
    if (error) { setCostError(error.message); return; }
    setCostLabel(''); setCostAmount('');
    fetchAll();
  };

  const deletePayment = async (pid: number) => {
    await supabase.from('hub_project_payments').delete().eq('id', pid);
    fetchAll();
  };

  const updatePayment = async () => {
    if (!editPayForm.amount) return;
    setEditPaySaving(true); setEditPayError('');

    let receipt_url = editPayForm.existingReceiptUrl;
    if (editPayForm.receipt) {
      receipt_url = await uploadFileToDrive(editPayForm.receipt, 'payout_receipt', { year: new Date().getFullYear().toString() });
    }

    const { error } = await supabase.from('hub_project_payments').update({
      amount: parseFloat(editPayForm.amount),
      paid_at: editPayForm.date,
      notes: editPayForm.notes || null,
      receipt_url,
    }).eq('id', editingPaymentId!);

    setEditPaySaving(false);
    if (error) { setEditPayError(error.message); return; }
    setEditingPaymentId(null);
    fetchAll();
  };

  const deleteCost = async (cid: number) => {
    await supabase.from('hub_project_costs').delete().eq('id', cid);
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
      fixed_amount: null,
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

  const saveContractorPayoutConfig = async (pcId: number) => {
    const form = ctxConfigForm[pcId];
    if (!form) return;
    const isPercentage = form.payoutType === 'percentage';
    if (isPercentage && !form.percentage) {
      setCtxConfigError(prev => ({ ...prev, [pcId]: 'Percentage is required.' }));
      return;
    }
    if (!isPercentage && !form.fixedAmount) {
      setCtxConfigError(prev => ({ ...prev, [pcId]: 'Fixed fee amount is required.' }));
      return;
    }

    setCtxConfigSaving(prev => ({ ...prev, [pcId]: true }));
    setCtxConfigError(prev => ({ ...prev, [pcId]: '' }));

    const { error } = await supabase.from('hub_project_contractors').update({
      payout_type: form.payoutType,
      percentage: isPercentage ? parseFloat(form.percentage) : 0,
      fixed_amount: isPercentage ? null : parseFloat(form.fixedAmount),
    }).eq('id', pcId);

    setCtxConfigSaving(prev => ({ ...prev, [pcId]: false }));
    if (error) {
      setCtxConfigError(prev => ({ ...prev, [pcId]: error.message }));
      return;
    }

    fetchAll();
  };

  const removeContractor = async (id: number) => {
    await supabase.from('hub_project_contractors').delete().eq('id', id);
    fetchAll();
  };

  const logContractorPayout = async (pcId: number, cut: number, contractorName: string, contractorEmail: string | null, project: Project) => {
    const form = ctxPayForm[pcId];
    if (!form?.amount) return;
    setCtxPaySaving(p => ({ ...p, [pcId]: true }));
    setCtxPayError(p => ({ ...p, [pcId]: '' }));

    let receipt_url: string | null = null;
    if (form.receipt) {
      receipt_url = await uploadFileToDrive(form.receipt, 'payout_receipt', { year: new Date().getFullYear().toString() });
    }

    const amount = parseFloat(form.amount);
    const paid_at = form.date || localToday();
    const { error } = await supabase.from('hub_project_contractor_payouts').insert({
      project_contractor_id: pcId,
      amount,
      paid_at,
      notes: form.notes || null,
      receipt_url,
    });
    setCtxPaySaving(p => ({ ...p, [pcId]: false }));
    if (error) { setCtxPayError(p => ({ ...p, [pcId]: error.message })); return; }
    setCtxPayForm(p => ({ ...p, [pcId]: { amount: '', date: localToday(), notes: '', receipt: null, notify: true } }));
    logAudit({ actor_id: hubUser?.id, actor_name: hubUser?.full_name, action: 'approve', entity_type: 'project_payout', description: `Logged payout of ₱${form.amount} to ${contractorName}` });

    // auto-mark paid if fully paid
    const pc = projects.flatMap(p => p.hub_project_contractors).find(x => x.id === pcId);
    const prev = pc?.hub_project_contractor_payouts.reduce((s, x) => s + x.amount, 0) ?? 0;
    const newTotal = prev + amount;
    if (pc && newTotal >= cut) {
      await supabase.from('hub_project_contractors').update({ payout_status: 'paid', paid_at: new Date().toISOString() }).eq('id', pcId);
    }

    // Send email notification
    if (form.notify && contractorEmail) {
      supabase.functions.invoke('notify-contractor-payment', {
        body: {
          to: contractorEmail,
          contractor_name: contractorName,
          project_name: project.project_name,
          client_name: project.client_name,
          amount,
          paid_at,
          notes: form.notes || null,
          receipt_url,
          total_paid: newTotal,
          total_cut: cut,
          is_fully_paid: newTotal >= cut,
        },
      });
    }

    fetchAll();
  };

  const deleteContractorPayout = async (payoutId: number) => {
    await supabase.from('hub_project_contractor_payouts').delete().eq('id', payoutId);
    fetchAll();
  };

  const addReminder = async () => {
    if (!activeId || !reminderDate) return;
    setReminderSaving(true); setReminderError('');
    const { error } = await supabase.from('hub_payment_reminders').insert({
      project_id: activeId,
      send_date: reminderDate,
      amount_due: reminderAmount ? parseFloat(reminderAmount) : null,
      notes: reminderNotes || null,
      status: 'pending',
    });
    setReminderSaving(false);
    if (error) { setReminderError(error.message); return; }
    setReminderDate(''); setReminderAmount(''); setReminderNotes('');
    fetchAll();
  };

  const deleteReminder = async (rid: number) => {
    await supabase.from('hub_payment_reminders').delete().eq('id', rid);
    fetchAll();
  };

  const buildInvoicePayload = (project: Project) => {
    const invNum = invoiceForm.invoice_number.trim() || String(project.id).padStart(4, '0');
    return {
      to: invoiceForm.email.trim(),
      cc: invoiceForm.cc.trim() || undefined,
      subject: invoiceForm.subject.trim() || undefined,
      client_name: project.client_name,
      project_name: project.project_name,
      service: project.service,
      contract_price: project.contract_price,
      start_date: project.start_date,
      deadline: invoiceForm.due_date || project.deadline,
      payments: project.hub_project_payments,
      show_payments: invoiceShowPayments,
      line_items: invoiceLineItems.filter(i => i.description && i.amount),
      notes: project.notes,
      bill_to_name: invoiceForm.bill_to_name.trim() || undefined,
      bill_to_address: invoiceForm.bill_to_address.trim() || undefined,
      reference: invoiceForm.reference.trim() || undefined,
      payment_terms: invoiceForm.payment_terms.trim() || undefined,
      message: invoiceForm.message.trim() || undefined,
      invoice_number: invNum,
      project_id: project.id,
      app_base_url: 'https://hunacreatives.com',
      amount_requested: invoiceForm.amount_requested ? parseFloat(invoiceForm.amount_requested) : undefined,
    };
  };

  const parseEmailList = (value: string) =>
    value
      .split(/[,\n;]+/)
      .map((entry) => entry.trim())
      .filter(Boolean);

  const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

  const sendInvoice = async (project: Project) => {
    const toList = parseEmailList(invoiceForm.email);
    const ccList = parseEmailList(invoiceForm.cc);

    if (toList.length === 0 || toList.some((email) => !isValidEmail(email))) {
      setInvoiceMsg({ ok: false, text: 'Enter at least one valid recipient email.' });
      return;
    }
    if (ccList.some((email) => !isValidEmail(email))) {
      setInvoiceMsg({ ok: false, text: 'One or more CC emails are invalid.' });
      return;
    }

    setInvoiceSending(true);
    setInvoiceMsg(null);
    const payload = buildInvoicePayload(project);
    const invokePromise = supabase.functions.invoke('send-invoice', {
      body: {
        ...payload,
        to: toList,
        cc: ccList,
      },
    });
    const timeoutPromise = new Promise<never>((_, reject) => {
      window.setTimeout(() => reject(new Error('Invoice sending timed out. Please try again.')), 20000);
    });

    let data: any;
    let error: any;
    try {
      ({ data, error } = await Promise.race([invokePromise, timeoutPromise]) as any);
    } catch (err) {
      error = err;
    } finally {
      setInvoiceSending(false);
    }

    if (error || data?.error) {
      setInvoiceMsg({ ok: false, text: data?.error ?? error?.message ?? 'Failed to send' });
    } else {
      setInvoiceMsg({ ok: true, text: 'Invoice sent!' });
      if (invoiceForm.email.trim() !== project.contact_email) {
        await supabase.from('hub_projects').update({ contact_email: invoiceForm.email.trim() }).eq('id', project.id);
        fetchAll();
      }
      const year = String(new Date().getFullYear());
      const invoiceSummary = [
        `Invoice #${payload.invoice_number}`,
        `Client: ${payload.client_name}`,
        `Project: ${payload.project_name}`,
        `Amount: ₱${payload.amount_requested?.toLocaleString() ?? payload.contract_price?.toLocaleString()}`,
        `Sent to: ${payload.to}`,
        `Date: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`,
      ].join('\n');
      supabase.functions.invoke('upload-to-drive', {
        body: {
          filename: `Invoice-${payload.invoice_number}-${payload.client_name.replace(/\s+/g, '-')}-${year}.txt`,
          mimeType: 'text/plain',
          base64Content: btoa(invoiceSummary),
          type: 'invoice',
          meta: { year },
        },
      }).catch(console.error);
    }
  };

  const scheduleInvoice = async (project: Project) => {
    const toList = parseEmailList(invoiceForm.email);
    const ccList = parseEmailList(invoiceForm.cc);

    if (toList.length === 0 || toList.some((email) => !isValidEmail(email))) {
      setInvoiceMsg({ ok: false, text: 'Enter at least one valid recipient email.' });
      return;
    }
    if (ccList.some((email) => !isValidEmail(email))) {
      setInvoiceMsg({ ok: false, text: 'One or more CC emails are invalid.' });
      return;
    }

    if (!invoiceForm.scheduled_for) {
      setInvoiceMsg({ ok: false, text: 'Choose when the invoice should be sent.' });
      return;
    }

    const scheduledAt = new Date(invoiceForm.scheduled_for);
    if (Number.isNaN(scheduledAt.getTime()) || scheduledAt.getTime() <= Date.now()) {
      setInvoiceMsg({ ok: false, text: 'Scheduled send time must be in the future.' });
      return;
    }

    setInvoiceSending(true);
    setInvoiceMsg(null);
    const payload = buildInvoicePayload(project);
    const { error } = await supabase.from('hub_scheduled_invoices').insert({
      project_id: project.id,
      invoice_number: String(payload.invoice_number),
      to_email: toList.join(', '),
      cc_email: ccList.length > 0 ? ccList.join(', ') : null,
      subject: payload.subject ?? null,
      client_name: payload.client_name,
      project_name: payload.project_name,
      service: payload.service ?? null,
      contract_price: payload.contract_price,
      start_date: payload.start_date,
      due_date: payload.deadline,
      payments: payload.payments,
      show_payments: payload.show_payments,
      line_items: payload.line_items,
      notes: payload.notes ?? null,
      bill_to_name: payload.bill_to_name ?? null,
      bill_to_address: payload.bill_to_address ?? null,
      reference: payload.reference ?? null,
      payment_terms: payload.payment_terms ?? null,
      message: payload.message ?? null,
      amount_requested: payload.amount_requested ?? null,
      scheduled_for: scheduledAt.toISOString(),
    });
    setInvoiceSending(false);

    if (error) {
      setInvoiceMsg({ ok: false, text: error.message });
      return;
    }

    if (invoiceForm.email.trim() !== project.contact_email) {
      await supabase.from('hub_projects').update({ contact_email: invoiceForm.email.trim() }).eq('id', project.id);
    }
    setInvoiceMsg({ ok: true, text: `Invoice scheduled for ${scheduledAt.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}.` });
    fetchAll();
  };

  const printInvoice = async (project: Project, overrides?: { due_date?: string; invoice_number?: string; bill_to_name?: string; bill_to_address?: string; reference?: string; payment_terms?: string; message?: string; line_items?: { description: string; amount: string }[]; show_payments?: boolean; amount_requested?: number }) => {
    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Preparing invoice…</title><style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:32px;color:#111827} .muted{color:#6b7280;font-size:14px}</style></head><body><h2>Preparing invoice preview…</h2><p class="muted">Please wait while we generate the print view.</p></body></html>`);
    win.document.close();

    const { data: latestLink } = await supabase
      .from('hub_invoice_payment_links')
      .select('token')
      .eq('project_id', project.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const payUrl = latestLink?.token
      ? `https://hunacreatives.com/pay/${latestLink.token}`
      : null;
    const d = derived(project);
    const fmt2 = (n: number) => '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const logoUrl = 'https://www.hunacreatives.com/images/fc04818c74ad69bdfb22b93a6a0c6a72.png';
    const invNum = overrides?.invoice_number || String(project.id).padStart(4,'0');
    const billToName = overrides?.bill_to_name || project.client_name;
    const billToAddress = overrides?.bill_to_address?.trim() || '';
    const customMsg = overrides?.message || '';
    const lineItems = overrides?.line_items ?? [{ description: project.service ?? project.project_name, amount: String(project.contract_price) }];
    const showPayments = overrides?.show_payments ?? true;
    const lineItemsTotal = lineItems.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
    const totalPaid = d.totalPaid;
    // balance_due is what appears on the invoice — use explicit amount_requested if provided,
    // otherwise fall back to lineItemsTotal (the invoice amount itself, not auto-deducted)
    const balanceDue = overrides?.amount_requested != null ? overrides.amount_requested : lineItemsTotal - totalPaid;
    const paymentRows = project.hub_project_payments.map(p => `
      <tr>
        <td>${fmtDate(p.paid_at)}</td>
        <td>${p.notes ?? 'Payment received'}</td>
        <td class="amount paid">+ ${fmt2(p.amount)}</td>
      </tr>`).join('');
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>Invoice #${invNum} — ${project.project_name}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111827;background:#f9fafb;padding:24px}
  .invoice-card{max-width:1100px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:24px;overflow:hidden}
  .content{padding:28px 40px 36px}
  .header{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;background:#0f172a;padding:28px 40px}
  .header-brand img{height:64px;display:block}
  .header-right{text-align:right}
  .header-right h1{font-size:13px;color:#9ca3af;text-transform:uppercase;letter-spacing:.08em}
  .header-right .inv{font-size:36px;line-height:1;font-weight:800;color:#fff}
  .meta{display:grid;grid-template-columns:1fr 1fr;gap:22px;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid #f3f4f6}
  .meta-col .eyebrow{font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px}
  .meta-col .title{font-size:16px;font-weight:700}
  .meta-col .line{font-size:12px;color:#6b7280;line-height:1.7;white-space:pre-line}
  .meta-col.right{text-align:right}
  .project-box{background:#f9fafb;border-radius:10px;padding:14px 16px;margin-bottom:20px}
  .project-box .name{font-size:14px;font-weight:600}
  .project-box .sub{font-size:12px;color:#6b7280;margin-top:3px}
  table{width:100%;border-collapse:collapse;margin-bottom:20px}
  th{background:#111827;color:#fff;padding:10px 14px;font-size:11px;font-weight:600;text-align:left;text-transform:uppercase;letter-spacing:.04em}
  td{padding:10px 14px;border-bottom:1px solid #f3f4f6;font-size:13px}
  td.amount{text-align:right;font-weight:600}
  td.paid{color:#059669}
  .summary-wrap{display:flex;justify-content:flex-end;margin-top:10px}
  .summary-card{width:340px;background:#f8fafc;border:1px solid #e5e7eb;border-radius:14px;padding:14px 18px}
  .summary-title{font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:.06em;font-weight:700;margin-bottom:8px}
  .totals{width:100%;margin:0}
  .totals tr td{padding:7px 0;font-size:13px;color:#6b7280;border:none}
  .totals tr td:last-child{text-align:right}
  .totals .divider td{padding:5px 0 0}
  .totals .divider-line{border-top:2px solid #e5e7eb}
  .totals .balance td{font-size:16px;font-weight:800;color:#111827;padding-top:10px}
  .totals .balance td:last-child{color:${balanceDue <= 0 ? '#059669' : '#1c2b3a'}}
  .footer{margin-top:40px;padding-top:16px;border-top:1px solid #e5e7eb;text-align:center;font-size:11px;color:#9ca3af}
  .pay-via{margin-top:32px}
  .pay-via h3{font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:.06em;font-weight:600;margin-bottom:14px}
  .qr-grid{display:flex;gap:12px}
  .qr-item{flex:1;background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:14px 10px;text-align:center}
  .qr-item img{width:100px;height:100px;object-fit:contain;border-radius:6px;display:block;margin:0 auto}
  .qr-item p{margin:8px 0 0;font-size:12px;font-weight:700;color:#111827}
  @media print{body{padding:0;background:#fff}.invoice-card{max-width:none;border:none;border-radius:0}.content{padding:24px}}
</style></head><body>
<div class="invoice-card">
<div class="header">
  <div class="header-brand">
    <img src="${logoUrl}" onerror="this.parentElement.style.display='none'" />
  </div>
  <div class="header-right">
    <h1>Invoice</h1>
    <div class="inv">#${invNum}</div>
  </div>
</div>
<div class="content">
${customMsg ? `<div style="background:#fffbf5;border:1px solid #fed7aa;border-radius:10px;padding:14px 16px;margin-bottom:24px;font-size:13px;color:#92400e">${customMsg}</div>` : ''}
<div class="meta">
  <div class="meta-col">
    <div class="eyebrow">From</div>
    <div class="title">Huna Creatives</div>
    <div class="line">billing@hunacreatives.com
www.hunacreatives.com</div>
  </div>
  <div class="meta-col right">
    <div class="eyebrow">Bill To</div>
    <div class="title">${billToName}</div>
    <div class="line">${project.contact_email ? `${project.contact_email}${billToAddress ? '\n' : ''}` : ''}${billToAddress}</div>
  </div>
</div>
<div class="project-box">
  <div class="name">${project.project_name}</div>
  ${project.service ? `<div class="sub">${project.service}</div>` : ''}
  ${project.start_date ? `<div class="sub">Started ${new Date(project.start_date).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</div>` : ''}
</div>
<table>
  <thead><tr><th>Description</th><th style="text-align:right">Amount</th></tr></thead>
  <tbody>${lineItems.map(i => `<tr><td>${i.description}</td><td class="amount">${fmt2(parseFloat(i.amount) || 0)}</td></tr>`).join('')}</tbody>
</table>
${showPayments && project.hub_project_payments.length > 0 ? `
<table>
  <thead><tr><th>Date</th><th>Note</th><th style="text-align:right">Payment</th></tr></thead>
  <tbody>${paymentRows}</tbody>
</table>` : ''}
<div class="summary-wrap">
  <div class="summary-card">
    <div class="summary-title">Invoice Summary</div>
    <table class="totals">
      <tr><td>Subtotal</td><td>${fmt2(lineItemsTotal)}</td></tr>
      ${showPayments ? `<tr><td>Total paid</td><td style="color:#059669">− ${fmt2(d.totalPaid)}</td></tr>` : ''}
      <tr class="divider"><td colspan="2"><div class="divider-line"></div></td></tr>
      <tr class="balance"><td>Balance due</td><td>${balanceDue <= 0 ? 'Paid in full' : fmt2(balanceDue)}</td></tr>
    </table>
  </div>
</div>
${balanceDue > 0 && payUrl ? `
<div style="margin-top:14px;background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;padding:14px;text-align:center;">
  <div style="font-size:14px;font-weight:700;color:#111827;margin-bottom:6px;">Choose your payment channel online</div>
  <div style="font-size:12px;color:#6b7280;margin-bottom:14px;">Open your secure payment page to select GCash, BDO, or GoTyme, then upload proof of payment.</div>
  <a href="${payUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background:#111827;color:#ffffff;font-size:13px;font-weight:700;padding:10px 18px;border-radius:9px;text-decoration:none;">Pay Now →</a>
</div>` : ''}
${project.notes ? `<p style="font-size:12px;color:#6b7280;font-style:italic;margin-top:16px">${project.notes}</p>` : ''}
<div class="footer">This email is not being monitored. Please do not reply directly. If you have questions, contact contact@hunacreatives.com.</div>
</div>
</div>
<script>window.onload=function(){setTimeout(function(){window.print()},400)}</script>
</body></html>`;

    win.document.open();
    win.document.write(html);
    win.document.close();
  };

  const projectTypes = Array.from(new Set(projects.map(p => p.service).filter(Boolean) as string[])).sort();

  // Main grid: one-time + internal only (retainers shown in Clients section below)
  const filtered = projects.filter(p => {
    if (p.project_type === 'retainer') return false;
    const matchesSearch = !search || p.client_name.toLowerCase().includes(search.toLowerCase()) || p.project_name.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || p.status === statusFilter;
    const matchesType = typeFilter === 'all' || p.service === typeFilter;
    const matchesProjectType = projectTypeFilter === 'all' || p.project_type === projectTypeFilter;
    return matchesSearch && matchesStatus && matchesType && matchesProjectType;
  });

  // Retainer projects for the clients section
  const retainerProjects = projects.filter(p => p.project_type === 'retainer' &&
    (!search || p.client_name.toLowerCase().includes(search.toLowerCase()) || p.project_name.toLowerCase().includes(search.toLowerCase()))
  );

  const deadlineStatus = (deadline: string | null, status: string) => {
    if (!deadline || status === 'completed' || status === 'cancelled') return null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const due = new Date(deadline); due.setHours(0, 0, 0, 0);
    const diff = Math.ceil((due.getTime() - today.getTime()) / 86400000);
    if (diff < 0) return { label: `${Math.abs(diff)}d overdue`, cls: 'bg-red-100 text-red-600' };
    if (diff <= 7) return { label: `${diff}d left`, cls: 'bg-amber-100 text-amber-600' };
    return null;
  };

  const summaryTotals = (() => {
    const now = new Date();
    const filterPayment = (paid_at: string) => {
      if (statsPeriod === 'month') {
        const m = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        return paid_at.startsWith(m);
      }
      if (statsPeriod === 'year') return paid_at.startsWith(String(now.getFullYear()));
      if (statsPeriod === 'custom') {
        if (statsDateFrom && paid_at < statsDateFrom) return false;
        if (statsDateTo && paid_at > statsDateTo) return false;
      }
      return true;
    };
    let contractValue = 0, costs = 0, collected = 0, mrr = 0;
    for (const p of projects.filter(p => p.project_type !== 'internal')) {
      if (p.project_type === 'retainer') {
        const rate = p.monthly_rate ?? 0;
        mrr += (p as any).monthly_rate_currency === 'USD' ? rate * usdRate : rate;
      } else {
        contractValue += p.contract_price;
      }
      costs += p.hub_project_costs.reduce((s, x) => s + x.amount, 0);
      collected += p.hub_project_payments.filter(x => filterPayment(x.paid_at)).reduce((s, x) => s + x.amount, 0);
    }
    const netProfit = contractValue - costs;
    const collectionPct = contractValue > 0 ? Math.min((collected / contractValue) * 100, 100) : 0;
    return { contractValue, costs, netProfit, collected, collectionPct, mrr };
  })();

  const statusTabs = [
    { key: 'all' as const, label: 'All', icon: 'ri-apps-2-line', count: projects.length },
    { key: 'ongoing' as const, label: 'Active', icon: 'ri-flashlight-line', count: projects.filter(p => p.status === 'ongoing').length },
    { key: 'paused' as const, label: 'Paused', icon: 'ri-pause-circle-line', count: projects.filter(p => p.status === 'paused').length },
    { key: 'completed' as const, label: 'Completed', icon: 'ri-check-double-line', count: projects.filter(p => p.status === 'completed').length },
    { key: 'cancelled' as const, label: 'Archived', icon: 'ri-archive-line', count: projects.filter(p => p.status === 'cancelled').length },
  ];

  useEffect(() => {
    if (!filtered.length) {
      setActiveId(null);
      return;
    }
    // Only reset activeId if it's not a retainer (retainers are in the clients section)
    if (activeId && !filtered.some(p => p.id === activeId) && !projects.some(p => p.id === activeId && p.project_type === 'retainer')) {
      setActiveId(filtered[0].id);
    }
  }, [filtered, activeId]);

  useEffect(() => {
    if (activeId && !isDemo) fetchTasks(activeId);
    else if (!activeId) { setTasks([]); setActivity([]); setCommentCounts({}); }
    if (openWorkspaceOnLoad.current) { setWorkspaceOpen(true); openWorkspaceOnLoad.current = false; }
    else { setWorkspaceOpen(false); }
    setOpenSections({});
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
  const wsIsOverdue = (t: ProjectTask) => t.due_date && t.due_date < wsToday && t.status !== 'done';
  const wsArchivedTasks = tasks.filter(t => !!t.archived);
  const wsFilteredTasks = tasks.filter(t => !t.archived).filter(t => {
    if (taskFilter === 'all') return true;
    if (taskFilter === 'overdue') return !!wsIsOverdue(t);
    return t.status === taskFilter;
  });
  const wsActiveTasks = tasks.filter(t => !t.archived);
  const wsDoneCt = wsActiveTasks.filter(t => t.status === 'done').length;
  const wsPct = wsActiveTasks.length > 0 ? Math.round((wsDoneCt / wsActiveTasks.length) * 100) : 0;
  const wsTaskTeam = activeProject ? activeProject.hub_project_contractors.map(pc => pc.hub_users).filter(Boolean) : [];
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

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const firstName = hubUser?.full_name?.split(' ')[0] ?? 'there';

  const monthlyCollections = (() => {
    const now = new Date();
    const months: { key: string; label: string; total: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('en-US', { month: 'short' });
      months.push({ key, label, total: 0 });
    }
    for (const p of projects) {
      for (const pay of p.hub_project_payments) {
        const k = pay.paid_at.slice(0, 7);
        const mo = months.find(m => m.key === k);
        if (mo) mo.total += pay.amount;
      }
    }
    return months;
  })();

  const serviceBreakdown = (() => {
    const map: Record<string, number> = {};
    for (const p of projects.filter(p => p.project_type !== 'internal')) {
      const key = p.service || 'General';
      const value = p.project_type === 'retainer'
        ? ((p as any).monthly_rate_currency === 'USD' ? (p.monthly_rate ?? 0) * usdRate : (p.monthly_rate ?? 0))
        : p.contract_price;
      map[key] = (map[key] ?? 0) + value;
    }
    const total = Object.values(map).reduce((s, v) => s + v, 0) || 1;
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, value]) => ({ name, value, pct: Math.round((value / total) * 100) }));
  })();

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

  return (
    <AdminLayout title="Projects">
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
        const d = derived(p);
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
            <div className="px-5 md:px-6 pt-4 pb-2 flex-shrink-0">
              {/* Back button row */}
              <div className="flex items-center gap-2 mb-3">
                <button onClick={() => { setWorkspaceOpen(false); setCollapsedGroups({}); }}
                  className="w-8 h-8 flex items-center justify-center rounded-xl bg-white border border-gray-200 text-gray-500 hover:text-gray-800 hover:bg-gray-50 cursor-pointer transition-all shadow-sm flex-shrink-0">
                  <i className="ri-arrow-left-s-line text-base"></i>
                </button>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-gray-900 truncate leading-tight">{p.project_name}</p>
                  <p className="text-xs text-gray-400 truncate">{internalProject ? 'Internal Project' : p.client_name}{p.service ? ` · ${p.service}` : ''}</p>
                </div>
                <button
                  onClick={() => {
                    const slug = (p as any).slug || slugify(p.client_name);
                    const url = `https://hunacreatives.com/hub/admin/project/${slug}`;
                    try {
                      navigator.clipboard.writeText(url).then(() => {
                        setLinkCopied(true);
                        setTimeout(() => setLinkCopied(false), 2000);
                      }).catch(() => {
                        const el = document.createElement('textarea');
                        el.value = url;
                        document.body.appendChild(el);
                        el.select();
                        document.execCommand('copy');
                        document.body.removeChild(el);
                        setLinkCopied(true);
                        setTimeout(() => setLinkCopied(false), 2000);
                      });
                    } catch {
                      const el = document.createElement('textarea');
                      el.value = url;
                      document.body.appendChild(el);
                      el.select();
                      document.execCommand('copy');
                      document.body.removeChild(el);
                      setLinkCopied(true);
                      setTimeout(() => setLinkCopied(false), 2000);
                    }
                  }}
                  title={linkCopied ? 'Copied!' : 'Copy project link'}
                  className={`flex items-center gap-1.5 h-8 px-2.5 rounded-xl border cursor-pointer transition-all shadow-sm flex-shrink-0 text-xs font-medium ${linkCopied ? 'bg-emerald-50 border-emerald-200 text-emerald-600' : 'bg-white border-gray-200 text-gray-500 hover:text-[#1c2b3a] hover:border-indigo-200'}`}>
                  <i className={`text-base ${linkCopied ? 'ri-check-line' : 'ri-link'}`}></i>
                  {linkCopied ? 'Copied!' : 'Copy link'}
                </button>
              </div>

              {/* Info card — matches contractor workspace layout */}
              <div className="bg-white/70 backdrop-blur-sm rounded-3xl border border-white/80 shadow-sm px-5 py-5">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:gap-8">

                  {/* Left: project identity */}
                  <div className="min-w-0 lg:max-w-[320px] lg:flex-shrink-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-semibold uppercase tracking-wide ${statusColors[p.status] ?? statusColors.ongoing}`}>
                        {statusLabels[p.status] ?? p.status}
                      </span>
                      {internalProject && <span className="text-[10px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">Internal</span>}
                      {p.service && <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${getServiceCfg(p.service).badge}`}>{p.service}</span>}
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

            <div className="flex-1 px-5 md:px-6 pb-6 space-y-5 overflow-y-auto">
              {/* ── Stats row ── */}
              <div id="ws-stats" className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Total', value: tasks.length, icon: 'ri-task-line', iconBg: 'bg-gray-100', iconClr: 'text-gray-500', valClr: 'text-gray-800' },
                  { label: 'Done', value: tasks.filter(t => t.status === 'done').length, icon: 'ri-checkbox-circle-fill', iconBg: 'bg-emerald-100', iconClr: 'text-emerald-600', valClr: 'text-emerald-700' },
                  { label: 'In Progress', value: tasks.filter(t => t.status === 'in_progress').length, icon: 'ri-loader-2-line', iconBg: 'bg-sky-100', iconClr: 'text-sky-600', valClr: 'text-sky-700' },
                  { label: 'Overdue', value: tasks.filter(t => !!wsIsOverdue(t)).length, icon: 'ri-alarm-warning-line', iconBg: 'bg-rose-100', iconClr: 'text-rose-500', valClr: 'text-rose-600' },
                ].map(s => (
                  <div key={s.label} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100/80">
                    <div className={`w-8 h-8 rounded-xl ${s.iconBg} flex items-center justify-center mb-3`}>
                      <i className={`${s.icon} ${s.iconClr} text-sm`}></i>
                    </div>
                    <p className={`text-2xl font-bold ${s.valClr} leading-none`}>{s.value}</p>
                    <p className="text-[11px] text-gray-400 mt-1">{s.label}</p>
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

                  {/* Add task form */}
                  {showTaskForm && (
                    <div className="px-5 py-3 bg-slate-50/50 border-b border-slate-100/60 space-y-2">
                      <input value={newTaskTitle} onChange={e => setNewTaskTitle(e.target.value)} placeholder="Task title..."
                        autoFocus onKeyDown={e => e.key === 'Enter' && createTask()}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-[#1c2b3a]/50 bg-white" />
                      <div className="flex items-center gap-2">
                        {uploadingAttachment ? (
                          <div className="flex-1 space-y-1.5">
                            <div className="flex items-center gap-2">
                              <i className="ri-upload-cloud-2-line text-[#1c2b3a]/50 text-sm"></i>
                              <span className="text-xs text-[#1c2b3a] font-medium truncate">{newTaskAttachment?.name}</span>
                            </div>
                            <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div className="h-full bg-[#1c2b3a]/70 rounded-full animate-upload-progress" style={{ width: '40%' }} />
                            </div>
                            <p className="text-[10px] text-[#1c2b3a]/50">Uploading to Drive…</p>
                          </div>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => newTaskAttachmentRef.current?.click()}
                              className="px-3 py-1.5 text-xs border border-dashed border-indigo-200 text-[#1c2b3a] rounded-lg bg-white hover:bg-slate-50 cursor-pointer whitespace-nowrap"
                            >
                              <i className="ri-attachment-2 mr-1"></i>
                              {newTaskAttachment ? 'Change attachment' : 'Add attachment'}
                            </button>
                            {newTaskAttachment && (
                              <div className="min-w-0 flex items-center gap-2 text-xs text-gray-600">
                                <span className="truncate">{newTaskAttachment.name}</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setNewTaskAttachment(null);
                                    if (newTaskAttachmentRef.current) newTaskAttachmentRef.current.value = '';
                                  }}
                                  className="text-gray-400 hover:text-rose-500 cursor-pointer"
                                >
                                  <i className="ri-close-line"></i>
                                </button>
                              </div>
                            )}
                          </>
                        )}
                        <input
                          ref={newTaskAttachmentRef}
                          type="file"
                          className="hidden"
                          onChange={(e) => setNewTaskAttachment(e.target.files?.[0] ?? null)}
                        />
                      </div>
                      <div className="flex flex-col gap-2">
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            onClick={() => setNewTaskAssigneeIds([])}
                            className={`px-2.5 py-1 text-xs rounded-full border transition-all cursor-pointer ${newTaskAssigneeIds.length === 0 ? 'bg-gray-800 text-white border-gray-800' : 'border-gray-200 text-gray-400 hover:border-gray-400'}`}
                          >
                            Unassigned
                          </button>
                          {wsTaskTeam.map((member) => member && (
                            <button
                              key={member.id}
                              type="button"
                              onClick={() => setNewTaskAssigneeIds((prev) => prev.includes(member.id) ? prev.filter((id) => id !== member.id) : [...prev, member.id])}
                              className={`flex items-center gap-1.5 pl-1.5 pr-2.5 py-1 rounded-full border transition-all cursor-pointer ${newTaskAssigneeIds.includes(member.id) ? 'border-[#1c2b3a]/50 bg-slate-50' : 'border-gray-200 hover:border-gray-300'}`}
                            >
                              <HubAvatar fullName={member.full_name} avatarUrl={member.avatar_url} size="w-4 h-4" />
                              <span className={`text-xs font-medium ${newTaskAssigneeIds.includes(member.id) ? 'text-[#1c2b3a]' : 'text-gray-600'}`}>{member.full_name.split(' ')[0]}</span>
                            </button>
                          ))}
                        </div>
                        <div className="flex gap-2">
                        <input type="date" value={newTaskDue} onChange={e => setNewTaskDue(e.target.value)}
                          className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none" />
                        <select value={newTaskPriority} onChange={e => setNewTaskPriority(e.target.value as 'low' | 'medium' | 'high')}
                          className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none">
                          <option value="low">Low</option>
                          <option value="medium">Medium</option>
                          <option value="high">High</option>
                        </select>
                        <button onClick={createTask} disabled={!newTaskTitle.trim() || taskSaving}
                          className="px-4 py-1.5 bg-indigo-600 text-white text-xs rounded-lg hover:bg-[#0f1c28] cursor-pointer disabled:opacity-40 whitespace-nowrap">
                          {taskSaving ? '...' : 'Add'}
                        </button>
                        </div>
                      </div>
                    </div>
                  )}

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
                      {wsFilteredTasks.map(task => {
                        const sc = wsStatusCycle[task.status];
                        const overdue = wsIsOverdue(task);
                        const priorityBorder = { high: 'border-l-rose-400', medium: 'border-l-amber-400', low: 'border-l-gray-300' }[task.priority];
                        const priorityCfg = { high: { label: 'High', cls: 'bg-rose-100 text-rose-600' }, medium: { label: 'Med', cls: 'bg-amber-100 text-amber-600' }, low: { label: 'Low', cls: 'bg-gray-100 text-gray-500' } }[task.priority];
                        const assignees = getWorkspaceTaskAssignees(task);
                        const commentCount = commentCounts[task.id] ?? 0;
                        const daysLeft = task.due_date
                          ? Math.ceil((new Date(task.due_date + 'T00:00:00').getTime() - new Date(wsToday + 'T00:00:00').getTime()) / 86400000)
                          : null;
                        const isOver = listDragOverTaskId === task.id && draggedTaskId !== task.id;
                        return (
                          <div key={task.id} className="relative">
                            {isOver && listDragOverPos === 'above' && <div className="absolute -top-1 left-0 right-0 h-0.5 bg-[#1c2b3a] rounded-full z-10 pointer-events-none" />}
                            {isOver && listDragOverPos === 'below' && <div className="absolute -bottom-1 left-0 right-0 h-0.5 bg-[#1c2b3a] rounded-full z-10 pointer-events-none" />}
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
                                const ids = wsFilteredTasks.map(t => t.id);
                                if (ids.indexOf(fromId) < 0 || ids.indexOf(task.id) < 0) return;
                                const reordered = ids.filter(id => id !== fromId);
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
                      })}
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
                                  {g.items.map(task => {
                                    const sc = wsStatusCycle[task.status];
                                    const overdue = wsIsOverdue(task);
                                    const priorityBorder = { high: 'border-l-rose-400', medium: 'border-l-amber-400', low: 'border-l-gray-300' }[task.priority];
                                    const priorityCfg = { high: { label: 'High', cls: 'bg-rose-100 text-rose-600' }, medium: { label: 'Med', cls: 'bg-amber-100 text-amber-600' }, low: { label: 'Low', cls: 'bg-gray-100 text-gray-500' } }[task.priority];
                                    const assignees = getWorkspaceTaskAssignees(task);
                                    const commentCount = commentCounts[task.id] ?? 0;
                                    const tDaysLeft = task.due_date
                                      ? Math.ceil((new Date(task.due_date + 'T00:00:00').getTime() - new Date(wsToday + 'T00:00:00').getTime()) / 86400000)
                                      : null;
                                    const isOver2 = listDragOverTaskId === task.id && draggedTaskId !== task.id;
                                    return (
                                      <div key={task.id} className="relative">
                                        {isOver2 && listDragOverPos === 'above' && <div className="absolute -top-1 left-0 right-0 h-0.5 bg-[#1c2b3a] rounded-full z-10 pointer-events-none" />}
                                        {isOver2 && listDragOverPos === 'below' && <div className="absolute -bottom-1 left-0 right-0 h-0.5 bg-[#1c2b3a] rounded-full z-10 pointer-events-none" />}
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
                                          const ids = g.items.map(t => t.id);
                                          if (ids.indexOf(fromId) < 0) return;
                                          const reordered = ids.filter(id => id !== fromId);
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
                                                <span className={`text-[10px] font-medium ${overdue ? 'text-rose-600' : tDaysLeft === 0 ? 'text-amber-600' : 'text-gray-500'}`}>
                                                  {overdue ? `Overdue ${Math.abs(tDaysLeft!)}d` : tDaysLeft === 0 ? 'Due today' : tDaysLeft === 1 ? 'Tomorrow' : new Date(task.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
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
                                  })}
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
                                <p className="text-xs text-gray-600 leading-snug truncate">{getProjectActivityDescription(a)}</p>
                                <p className="text-[10px] text-gray-400 mt-0.5">{time}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Finance strip card — client + retainer projects */}
                  {!internalProject && (
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
                      <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">Financials</p>
                      <div className="space-y-2">
                        {isRetainerProject(p) ? (<>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-gray-400">Monthly Rate</span>
                            <span className="font-semibold text-[#1c2b3a]">{isOwner ? fmtRate(p.monthly_rate, (p as any).monthly_rate_currency) : 'Retainer'}</span>
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-gray-400">Total Collected</span>
                            <span className="font-semibold text-emerald-600">{fmt(d.totalPaid)}</span>
                          </div>
                          {d.monthsCollected !== null && (
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-gray-400">Months Paid</span>
                              <span className="font-semibold text-gray-700">{d.monthsCollected}</span>
                            </div>
                          )}
                        </>) : (<>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-gray-400">Contract</span>
                            <span className="font-semibold text-gray-700">{fmt(p.contract_price)}</span>
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-gray-400">Collected</span>
                            <span className="font-semibold text-emerald-600">{fmt(d.totalPaid)}</span>
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-gray-400">Balance</span>
                            <span className={`font-semibold ${d.balance > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>{fmt(d.balance)}</span>
                          </div>
                        </>)}
                      </div>
                      {!isRetainerProject(p) && <div className="space-y-1">
                        <div className="flex justify-between text-[10px] text-gray-400">
                          <span>Collection progress</span>
                          <span>{d.paidPct.toFixed(0)}%</span>
                        </div>
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-400 rounded-full" style={{ width: `${Math.min(d.paidPct, 100)}%` }} />
                        </div>
                      </div>}
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

        {/* Dashboard header */}
        {!loading && projects.length > 0 && (
          <div className="space-y-3 pb-2">
            <div>
              <h2 className="text-[22px] font-bold text-[#111827]">{greeting}, {firstName}!</h2>
              <p className="text-sm text-gray-400 mt-0.5">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</p>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              <div className="flex gap-1 bg-gray-100 p-0.5 rounded-xl">
                {(['month', 'year', 'all'] as const).map(p => (
                  <button key={p} onClick={() => setStatsPeriod(p)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${statsPeriod === p ? 'bg-white text-[#111827] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                    {p === 'month' ? 'This Month' : p === 'year' ? 'This Year' : 'All Time'}
                  </button>
                ))}
              </div>
              <button onClick={() => setStatsPeriod('custom' as any)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium border cursor-pointer transition-all ${statsPeriod === 'custom' ? 'bg-[#111827] text-white border-[#111827]' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                Custom
              </button>
              {(statsPeriod as string) === 'custom' && (
                <div className="flex items-center gap-1.5">
                  <input type="date" value={statsDateFrom} onChange={e => setStatsDateFrom(e.target.value)}
                    className="px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none" />
                  <span className="text-xs text-gray-400">to</span>
                  <input type="date" value={statsDateTo} onChange={e => setStatsDateTo(e.target.value)}
                    className="px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none" />
                </div>
              )}
              {(statsPeriod as string) !== 'all' && <p className="text-[11px] text-gray-400 ml-1">Filtering Collected by payment date</p>}
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="rounded-2xl p-5" style={{ background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)' }}>
                <p className="text-[11px] text-blue-200 uppercase tracking-widest font-semibold">Project Value</p>
                <p className="text-[22px] font-bold text-white mt-1.5 leading-none">{fmt(summaryTotals.contractValue)}</p>
                <p className="text-xs text-blue-200 mt-1.5">{projects.filter(p => p.project_type === 'client').length} one-time project{projects.filter(p => p.project_type === 'client').length !== 1 ? 's' : ''}</p>
              </div>
              {isOwner && (
                <div className="rounded-2xl p-5" style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)' }}>
                  <p className="text-[11px] text-violet-200 uppercase tracking-widest font-semibold">Monthly Retainer</p>
                  <p className="text-[22px] font-bold text-white mt-1.5 leading-none">{fmt(summaryTotals.mrr)}</p>
                  <p className="text-xs text-violet-200 mt-1.5">{projects.filter(p => p.project_type === 'retainer' && p.status === 'ongoing').length} active client{projects.filter(p => p.project_type === 'retainer' && p.status === 'ongoing').length !== 1 ? 's' : ''}</p>
                </div>
              )}
              <div className="rounded-2xl p-5 bg-white border border-gray-100">
                <p className="text-[11px] text-gray-400 uppercase tracking-widest font-semibold">Active</p>
                <p className="text-[22px] font-bold text-[#111827] mt-1.5 leading-none">{projects.filter(p => p.status === 'ongoing').length}</p>
                <p className="text-xs text-gray-400 mt-1.5">Projects + retainers</p>
              </div>
              <div className="rounded-2xl p-5 bg-white border border-gray-100">
                <p className="text-[11px] text-gray-400 uppercase tracking-widest font-semibold">Collected</p>
                <p className="text-[22px] font-bold text-emerald-600 mt-1.5 leading-none">{fmt(summaryTotals.collected)}</p>
                <p className="text-xs text-gray-400 mt-1.5">{summaryTotals.collectionPct.toFixed(0)}% of one-time contracts</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              <div className="lg:col-span-2 bg-white border border-gray-100 rounded-2xl p-5">
                <p className="text-sm font-semibold text-[#111827] mb-4">Monthly Collections</p>
                {(() => {
                  const maxVal = Math.max(...monthlyCollections.map(m => m.total), 1);
                  return (
                    <div className="flex items-end gap-2 h-28">
                      {monthlyCollections.map(m => (
                        <div key={m.key} className="flex-1 flex flex-col items-center gap-1.5 min-w-0">
                          <span className="text-[9px] text-gray-400 font-medium">{m.total > 0 ? `₱${(m.total / 1000).toFixed(0)}k` : ''}</span>
                          <div className="w-full rounded-t-lg transition-all" style={{ height: `${Math.max((m.total / maxVal) * 80, m.total > 0 ? 6 : 2)}px`, background: m.total > 0 ? '#2563eb' : '#e5e7eb' }} />
                          <span className="text-[10px] text-gray-400">{m.label}</span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
              <div className="bg-white border border-gray-100 rounded-2xl p-5">
                <p className="text-sm font-semibold text-[#111827] mb-4">By Service</p>
                {serviceBreakdown.length === 0 ? (
                  <p className="text-xs text-gray-300 italic">No services set</p>
                ) : (
                  <div className="space-y-3">
                    {serviceBreakdown.map((s, i) => {
                      const colors = ['#2563eb', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444'];
                      return (
                        <div key={s.name}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[11px] text-gray-600 font-medium truncate">{s.name}</span>
                            <span className="text-[11px] text-gray-400 ml-2 flex-shrink-0">{s.pct}%</span>
                          </div>
                          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all" style={{ width: `${s.pct}%`, background: colors[i % colors.length] }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <section className="space-y-3">

          <div className="flex items-center gap-2 flex-wrap">
            {/* Status tabs */}
            <div className="flex gap-1 bg-gray-100 p-1 rounded-xl overflow-x-auto">
              {statusTabs.filter(tab => tab.key !== 'all').map(tab => (
                <button key={tab.key} onClick={() => setStatusFilter(tab.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${statusFilter === tab.key ? 'bg-white text-[#111827] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                  {tab.label}
                </button>
              ))}
            </div>
            {/* Type dropdown */}
            <select value={projectTypeFilter} onChange={e => setProjectTypeFilter(e.target.value as any)}
              className="px-3 py-1.5 text-xs border border-gray-200 rounded-xl bg-white text-gray-600 focus:outline-none cursor-pointer">
              <option value="all">All Types</option>
              <option value="client">Fixed Contract</option>
              <option value="internal">Internal</option>
            </select>
            {/* Service dropdown */}
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
              className="px-3 py-1.5 text-xs border border-gray-200 rounded-xl bg-white text-gray-600 focus:outline-none cursor-pointer">
              <option value="all">All Services</option>
              {projectTypes.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <div className="flex-1" />
            <button onClick={() => { setEditingProject(null); setForm({ ...emptyForm, project_type: 'retainer' }); setShowForm(true); }}
              className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50 transition-colors cursor-pointer whitespace-nowrap">
              <i className="ri-add-line text-sm"></i>
              <span className="hidden sm:inline">Add Client</span>
            </button>
            <div className="flex rounded-lg border border-gray-200 overflow-hidden">
              <button onClick={() => setPageView('projects')} className={`px-3 py-2 text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${pageView === 'projects' ? 'bg-[#111827] text-white' : 'text-gray-500 hover:bg-gray-50'}`}><i className="ri-folder-line text-sm"></i><span className="hidden sm:inline">Projects</span></button>
              <button onClick={() => { setPageView('tasks'); fetchAllTasks(); }} className={`px-3 py-2 text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${pageView === 'tasks' ? 'bg-[#111827] text-white' : 'text-gray-500 hover:bg-gray-50'}`}><i className="ri-task-line text-sm"></i><span className="hidden sm:inline">All Tasks</span></button>
            </div>
            <button onClick={() => { setEditingProject(null); setForm(emptyForm); setShowForm(true); }}
              className="flex items-center gap-1.5 px-3 py-2 bg-[#111827] text-white text-sm rounded-lg hover:bg-gray-800 transition-colors cursor-pointer whitespace-nowrap">
              <i className="ri-add-line text-sm"></i>
              <span className="hidden sm:inline">New Project</span>
            </button>
          </div>

          {pageView === 'tasks' && (
            <div className="space-y-4 pt-1 pb-3">
              {/* ── Filters ── */}
              <div className="flex flex-wrap gap-2 items-center">
                <div className="relative flex-1 min-w-[160px]">
                  <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
                  <input value={taskSearch} onChange={e => setTaskSearch(e.target.value)} placeholder="Search tasks..."
                    className="w-full pl-7 pr-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]" />
                </div>
                <select value={taskStatusFilter} onChange={e => setTaskStatusFilter(e.target.value)} className="px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none cursor-pointer">
                  <option value="active">Active</option><option value="all">All</option><option value="overdue">Overdue</option>
                  <option value="todo">To Do</option><option value="in_progress">In Progress</option><option value="done">Done</option>
                </select>
                <select value={taskGroupBy} onChange={e => setTaskGroupBy(e.target.value as 'project' | 'assignee')} className="px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none cursor-pointer">
                  <option value="project">By Project</option><option value="assignee">By Assignee</option>
                </select>
              </div>
              {allTasksLoading ? (
                <div className="flex justify-center py-16"><i className="ri-loader-4-line animate-spin text-2xl text-gray-300"></i></div>
              ) : (() => {
                const tod = localToday();
                const isOver = (t: any) => t.due_date && t.due_date < tod && t.status !== 'done';
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
                            <div key={t.id} className={`flex items-center gap-3 px-5 py-2.5 hover:bg-gray-50/60 ${over ? 'bg-rose-50/30' : ''}`}>
                              <button onClick={async () => { const n = t.status === 'done' ? 'todo' : 'done'; await supabase.from('hub_project_tasks').update({ status: n }).eq('id', t.id); setAllTasks(prev => prev.map(x => x.id === t.id ? { ...x, status: n } : x)); }} className="flex-shrink-0 cursor-pointer">
                                <i className={`text-base ${t.status === 'done' ? 'ri-checkbox-circle-fill text-emerald-500' : 'ri-checkbox-blank-circle-line text-gray-300 hover:text-emerald-400'}`}></i>
                              </button>
                              <div className="flex-1 min-w-0">
                                <p className={`text-sm truncate ${t.status === 'done' ? 'line-through text-gray-400' : 'text-gray-800'}`}>{t.title}</p>
                                {taskGroupBy === 'assignee' && t.project && <p className="text-[11px] text-gray-400 truncate">{t.project.project_name}</p>}
                              </div>
                              <span className={`hidden sm:block text-[10px] px-2 py-0.5 rounded-full font-semibold flex-shrink-0 ${scfg.cls}`}>{scfg.label}</span>
                              {t.due_date && <span className={`text-[11px] font-medium flex-shrink-0 ${over ? 'text-rose-500' : 'text-gray-400'}`}>{new Date(t.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>}
                              {t.assignee && taskGroupBy === 'project' && (
                                t.assignee.avatar_url
                                  ? <img src={t.assignee.avatar_url} alt={t.assignee.full_name} className="w-6 h-6 rounded-full object-cover flex-shrink-0" />
                                  : <div className="w-6 h-6 rounded-full bg-[#1c2b3a] flex items-center justify-center flex-shrink-0 text-white text-[9px] font-bold">{t.assignee.full_name[0]}</div>
                              )}
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
          <div className="pt-1 pb-3" style={{ display: pageView === 'tasks' ? 'none' : undefined }}>
            {loading ? (
              <div className="flex justify-center py-16"><i className="ri-loader-4-line animate-spin text-gray-300 text-2xl"></i></div>
            ) : filtered.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-200 px-5 py-14 text-center">
                <p className="text-sm text-gray-400">No projects match this view yet.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {!activeId && (
                  <div className="flex items-center gap-2">
                    <i className="ri-folder-line text-[#1c2b3a] text-sm"></i>
                    <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-widest">Projects <span className="text-gray-400 font-normal">({filtered.length})</span></p>
                  </div>
                )}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {(activeId ? filtered.filter(p => p.id === activeId) : filtered).map(p => {
                  const d = derived(p);
                  const cfg = statusCfg[p.status] ?? statusCfg.ongoing;
                  const dl = deadlineStatus(p.deadline, p.status);
                  const todayStr = localToday();
                  const pTasks = tasks.filter(t => t.project_id === p.id);
                  const pTasksDone = pTasks.filter(t => t.status === 'done').length;
                  const healthLabel = getProjectHealth(p, p.hub_project_contractors.length, pTasksDone, pTasks.length, todayStr);
                  const healthCls: Record<string, string> = {
                    'Archived': 'bg-gray-100 text-gray-400',
                    'Completed': 'bg-emerald-100 text-emerald-600',
                    'No team assigned': 'bg-amber-100 text-amber-600',
                    'No tasks yet': 'bg-gray-100 text-gray-400',
                    'Overdue': 'bg-rose-100 text-rose-600',
                    'Due this week': 'bg-amber-100 text-amber-700',
                    'Waiting on payment': 'bg-slate-100 text-[#1c2b3a]',
                    'Fully paid': 'bg-emerald-100 text-emerald-600',
                    'Internal sprint': 'bg-slate-100 text-[#1c2b3a]',
                    'In progress': 'bg-sky-100 text-sky-600',
                  };
                  const pal = getServicePalette(p.service);
                  const team = p.hub_project_contractors.map((pc: any) => pc.hub_users).filter(Boolean);
                  return (
                    <button key={p.id}
                      onClick={() => { setActiveClientId(null); setActiveId(prev => prev === p.id ? null : p.id); }}
                      className={`rounded-xl bg-white text-left transition-all flex flex-col overflow-hidden hover:-translate-y-0.5 ${
                        activeId === p.id ? 'border-2 border-[#1c2b3a] shadow-[0_6px_18px_rgba(255,107,53,0.10)]' : 'border border-gray-100 hover:shadow-[0_4px_14px_rgba(15,23,42,0.06)]'
                      }`}>
                      {/* Service color stripe */}
                      <div className="h-1 w-full" style={{ background: `linear-gradient(90deg, ${pal.from}, ${pal.to})` }} />
                      <div className="p-3.5 space-y-2.5 flex-1 flex flex-col">
                        {/* Service + status badge */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            {p.service && <span className="block text-[10px] font-semibold tracking-widest uppercase mb-1" style={{ color: pal.from }}>{p.service}</span>}
                            <h3 className="text-sm font-bold text-[#111827] line-clamp-1 leading-snug">{p.project_name}</h3>
                            <p className="text-[11px] text-gray-400 mt-0.5 truncate">{p.project_type === 'internal' ? 'Internal' : p.client_name}</p>
                          </div>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold flex-shrink-0 ${dl ? dl.cls : cfg.cls}`}>
                            {dl ? dl.label : cfg.label}
                          </span>
                        </div>
                        {/* Team + task count */}
                        <div className="flex items-center justify-between pt-2 border-t border-gray-50 mt-auto">
                          <div className="flex items-center gap-1.5">
                            <div className="flex -space-x-1">
                              {team.slice(0, 3).map((u: any, i: number) => (
                                u?.avatar_url
                                  ? <img key={i} src={u.avatar_url} alt={u.full_name} className="w-5 h-5 rounded-full object-cover object-top border border-white" />
                                  : <div key={i} className="w-5 h-5 rounded-full bg-gray-200 border border-white flex items-center justify-center text-[8px] font-bold text-gray-500">{u?.full_name?.[0]}</div>
                              ))}
                              {team.length === 0 && <div className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center"><i className="ri-user-line text-[8px] text-gray-400"></i></div>}
                            </div>
                            {team.length > 0 && <span className="text-[10px] text-gray-400">{team[0]?.full_name?.split(' ')[0]}{team.length > 1 ? ` +${team.length - 1}` : ''}</span>}
                          </div>
                          {pTasks.length > 0 ? (
                            <span className="text-[10px] text-gray-400">{pTasksDone}/{pTasks.length} tasks</span>
                          ) : (
                            <span className="text-[10px] text-gray-300">No tasks</span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
              </div>
            )}
          {/* ── Retainer Clients section ── */}
          {!activeClientId && !(activeId && projects.find(p => p.id === activeId && p.project_type !== 'retainer')) && (() => {
            // Merge retainer projects + hub_clients, dedup by client_name
            const retainerNames = new Set([
              ...retainerProjects.map(p => p.client_name.toLowerCase()),
              ...retainerProjects.map(p => p.project_name.toLowerCase()),
            ]);
            const extraIntl = intlClients.filter(c => !retainerNames.has(c.client_name.toLowerCase()));
            const sortedRetainers = [...retainerProjects]
              .filter(p => statusFilter === 'all' || p.status === statusFilter)
              .sort((a, b) => a.project_name.localeCompare(b.project_name));
            const sortedIntl = [...extraIntl].sort((a, b) => a.client_name.localeCompare(b.client_name));
            const totalCount = sortedRetainers.length + sortedIntl.length;
            if (totalCount === 0) return null;
            return (
              <div className="-mx-4 md:-mx-6 px-4 md:px-6 pt-5 pb-6 mt-2 space-y-3"
                style={{ background: 'rgba(30,40,70,0.06)', borderTop: '1px solid rgba(30,40,70,0.10)' }}>
                <div className="flex items-center gap-2">
                  <i className="ri-building-line text-[#1c2b3a] text-sm"></i>
                  <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-widest">Retainer Clients <span className="text-gray-400 font-normal">({totalCount})</span></p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {/* Retainer projects — clickable */}
                  {(activeId ? sortedRetainers.filter(p => p.id === activeId) : sortedRetainers).map(p => {
                    const pal = getServicePalette(p.service);
                    const team = p.hub_project_contractors.map((pc: any) => pc.hub_users).filter(Boolean);
                    return (
                      <button key={p.id} onClick={() => { setActiveClientId(null); setActiveId(prev => prev === p.id ? null : p.id); }}
                        className="rounded-xl overflow-hidden border border-white/20 text-left hover:-translate-y-0.5 transition-all cursor-pointer"
                        style={{ background: `linear-gradient(135deg, ${pal.from}, ${pal.to})`, boxShadow: '0 2px 12px rgba(0,0,0,0.10)' }}>
                        <div className="p-3.5 space-y-2.5">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              {p.service && <span className="block text-[10px] font-semibold tracking-widest uppercase mb-1 text-white/70">{p.service}</span>}
                              <p className="font-bold text-white text-sm leading-tight truncate">{p.project_name}</p>
                              <p className="text-[11px] text-white/60 mt-0.5 truncate">{p.client_name}</p>
                            </div>
                            <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-white/20 text-white flex-shrink-0 whitespace-nowrap">
                              {isOwner && p.monthly_rate ? fmtRate(p.monthly_rate, (p as any).monthly_rate_currency) : 'Retainer'}
                            </span>
                          </div>
                          <div className="flex items-center justify-between pt-2 border-t border-white/20">
                            <div className="flex items-center gap-1.5">
                              <div className="flex -space-x-1">
                                {team.slice(0, 3).map((u: any, i: number) => (
                                  u?.avatar_url
                                    ? <img key={i} src={u.avatar_url} alt={u.full_name} className="w-5 h-5 rounded-full object-cover object-top border border-white/30" />
                                    : <div key={i} className="w-5 h-5 rounded-full bg-white/30 border border-white/30 flex items-center justify-center text-[8px] font-bold text-white">{u?.full_name?.[0]}</div>
                                ))}
                              </div>
                              {team.length > 0 && <span className="text-[10px] text-white/70">{team[0]?.full_name?.split(' ')[0]}{team.length > 1 ? ` +${team.length - 1}` : ''}</span>}
                            </div>
                            <i className="ri-arrow-right-s-line text-white/50 text-sm"></i>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                  {/* Extra hub_clients — clickable, navigate to client management */}
                  {sortedIntl.map(c => {
                    const pal = getServicePalette(c.platform);
                    return (
                      <button key={c.id} onClick={() => openClientWorkspace(c)} disabled={openingWorkspace}
                        className="rounded-xl overflow-hidden border border-white/20 text-left hover:-translate-y-0.5 transition-all cursor-pointer"
                        style={{ background: `linear-gradient(135deg, ${pal.from}, ${pal.to})`, boxShadow: '0 2px 12px rgba(0,0,0,0.10)' }}>
                        <div className="p-3.5 space-y-2.5">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              {c.platform && <span className="block text-[10px] font-semibold tracking-widest uppercase mb-1 text-white/70">{c.platform}</span>}
                              <p className="font-bold text-white text-sm leading-tight truncate">{c.client_name}</p>
                              <p className="text-[11px] text-white/60 mt-0.5 truncate">{c.notes ?? 'Client'}</p>
                            </div>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold flex-shrink-0 whitespace-nowrap ${c.status === 'active' ? 'bg-white/20 text-white' : 'bg-black/20 text-white/60'}`}>
                              {c.status}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 pt-2 border-t border-white/20">
                            <div className="flex -space-x-1">
                              {c.assignments.slice(0, 3).map((a, i) => (
                                a.hub_users?.avatar_url
                                  ? <img key={i} src={a.hub_users.avatar_url} alt={a.hub_users.full_name} className="w-5 h-5 rounded-full object-cover object-top border border-white/30" />
                                  : <div key={i} className="w-5 h-5 rounded-full bg-white/30 border border-white/30 flex items-center justify-center text-[8px] font-bold text-white">{a.hub_users?.full_name?.[0]}</div>
                              ))}
                            </div>
                            {c.assignments.length > 0 && <span className="text-[10px] text-white/70 truncate">{c.assignments[0]?.hub_users?.full_name?.split(' ')[0]}{c.assignments.length > 1 ? ` +${c.assignments.length - 1}` : ''}</span>}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })()}
          </div>
        </section>


        {/* ── Client detail panel (hidden — workspace used instead) ── */}
        {false && activeClient && (
          <section className="mt-4 bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `linear-gradient(135deg, ${getServicePalette(activeClient.platform).from}, ${getServicePalette(activeClient.platform).to})` }}>
                  <i className="ri-building-line text-white text-base"></i>
                </div>
                <div>
                  <p className="font-bold text-gray-900">{activeClient.client_name}</p>
                  <p className="text-xs text-gray-400">{activeClient.platform ?? 'Client'}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => openClientWorkspace(activeClient)} disabled={openingWorkspace}
                  className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-lg hover:bg-[#0f1c28] cursor-pointer flex items-center gap-1 disabled:opacity-50">
                  <i className="ri-layout-grid-line text-xs"></i> {openingWorkspace ? 'Opening…' : 'Workspace'}
                </button>
                <button onClick={() => { setEditingClient(activeClient); setClientForm({ client_name: activeClient.client_name, platform: activeClient.platform ?? '', status: activeClient.status, notes: activeClient.notes ?? '', contract_value: activeClient.contract_value != null ? String(activeClient.contract_value) : '', contract_currency: activeClient.contract_currency ?? 'PHP' }); setShowClientModal(true); }}
                  className="px-3 py-1.5 text-xs border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 cursor-pointer flex items-center gap-1">
                  <i className="ri-edit-line text-xs"></i> Edit
                </button>
                <button onClick={() => { if (confirm(`Delete ${activeClient.client_name}?`)) deleteClient(activeClient.id); }}
                  className="px-3 py-1.5 text-xs border border-rose-200 text-rose-500 rounded-lg hover:bg-rose-50 cursor-pointer flex items-center gap-1">
                  <i className="ri-delete-bin-line text-xs"></i>
                </button>
                <button onClick={() => setActiveClientId(null)} className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 cursor-pointer"><i className="ri-close-line"></i></button>
              </div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-5">
              {/* Client info */}
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-50 rounded-xl p-3">
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide">Status</p>
                    <p className="text-sm font-semibold text-gray-800 mt-0.5 capitalize">{activeClient.status}</p>
                  </div>
                  {activeClient.platform && (
                    <div className="bg-gray-50 rounded-xl p-3">
                      <p className="text-[10px] text-gray-400 uppercase tracking-wide">Platform</p>
                      <p className="text-sm font-semibold text-gray-800 mt-0.5">{activeClient.platform}</p>
                    </div>
                  )}
                  {activeClient.contract_value && (
                    <div className="bg-gray-50 rounded-xl p-3">
                      <p className="text-[10px] text-gray-400 uppercase tracking-wide">Contract Value</p>
                      <p className="text-sm font-semibold text-gray-800 mt-0.5">{activeClient.contract_currency ?? 'PHP'} {activeClient.contract_value.toLocaleString()}</p>
                    </div>
                  )}
                </div>
                {activeClient.notes && <p className="text-sm text-gray-500 italic">{activeClient.notes}</p>}
              </div>
              {/* Team assignments */}
              <div className="space-y-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Team</p>
                {activeClient.assignments.map(a => (
                  <div key={a.id} className="flex items-center gap-3 bg-gray-50 rounded-xl px-3 py-2.5">
                    <HubAvatar fullName={a.hub_users?.full_name ?? ''} avatarUrl={a.hub_users?.avatar_url} size="w-8 h-8" className="flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">{a.hub_users?.full_name}</p>
                      {a.role && <p className="text-xs text-gray-400 truncate">{a.role}</p>}
                    </div>
                    <button onClick={() => removeClientAssignment(a.id)} className="text-gray-300 hover:text-rose-500 cursor-pointer transition-colors"><i className="ri-close-line text-sm"></i></button>
                  </div>
                ))}
                {/* Add assignment */}
                <div className="flex gap-2">
                  <select value={assignAddId} onChange={e => setAssignAddId(e.target.value)}
                    className="flex-1 px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none bg-white">
                    <option value="">Add team member…</option>
                    {contractors.filter(c => !activeClient.assignments.some(a => a.contractor_id === c.id)).map(c => (
                      <option key={c.id} value={c.id}>{c.full_name}</option>
                    ))}
                  </select>
                  <input value={assignAddRole} onChange={e => setAssignAddRole(e.target.value)} placeholder="Role (optional)"
                    className="flex-1 px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none" />
                  <button onClick={addClientAssignment} disabled={!assignAddId || assignSaving}
                    className="px-3 py-1.5 bg-[#111827] text-white text-xs rounded-lg hover:bg-gray-800 cursor-pointer disabled:opacity-40 whitespace-nowrap">
                    {assignSaving ? '...' : 'Add'}
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ── Client modal (add/edit) ── */}
        {showClientModal && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 sm:p-4">
            <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md">
              <div className="flex items-center justify-between p-5 border-b border-gray-100">
                <h2 className="font-semibold text-[#111827]">{editingClient ? 'Edit Client' : 'New Client'}</h2>
                <button onClick={() => { setShowClientModal(false); setEditingClient(null); }} className="text-gray-400 hover:text-gray-600 cursor-pointer"><i className="ri-close-line text-lg"></i></button>
              </div>
              <div className="p-5 space-y-3">
                {[['Client Name', 'client_name', 'text', 'e.g. Blue Collar Nutrition'], ['Platform', 'platform', 'text', 'e.g. Meta, Google, TikTok'], ['Notes', 'notes', 'text', 'Optional notes']].map(([label, field, type, ph]) => (
                  <div key={field} className="space-y-1">
                    <label className="text-xs font-medium text-gray-700">{label}</label>
                    <input type={type} value={(clientForm as any)[field]} onChange={e => setClientForm(f => ({ ...f, [field]: e.target.value }))} placeholder={ph}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-200" />
                  </div>
                ))}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-700">Status</label>
                    <select value={clientForm.status} onChange={e => setClientForm(f => ({ ...f, status: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none bg-white">
                      <option value="active">Active</option>
                      <option value="paused">Paused</option>
                      <option value="ended">Ended</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-700">Contract Value</label>
                    <input type="number" value={clientForm.contract_value} onChange={e => setClientForm(f => ({ ...f, contract_value: e.target.value }))} placeholder="0"
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none" />
                  </div>
                </div>
                {clientError && <p className="text-xs text-red-500">{clientError}</p>}
              </div>
              <div className="flex gap-2 p-5 pt-0">
                <button onClick={() => { setShowClientModal(false); setEditingClient(null); }} className="flex-1 py-2.5 text-sm border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 cursor-pointer">Cancel</button>
                <button onClick={saveClient} disabled={clientSaving || !clientForm.client_name.trim()}
                  className="flex-1 py-2.5 text-sm bg-[#1c2b3a] text-white rounded-lg hover:bg-[#0f1c28] disabled:opacity-40 cursor-pointer">
                  {clientSaving ? 'Saving...' : editingClient ? 'Save Changes' : 'Add Client'}
                </button>
              </div>
            </div>
          </div>
        )}

        <div ref={detailPanelRef} />
        {activeProject ? (() => {
          const d = derived(activeProject);
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
                <div className="p-5 space-y-4">
                  {/* Stats */}
                  <div className="grid grid-cols-2 gap-2">
                    {(internalProject ? [
                      { label: 'Team', value: String(activeProject.hub_project_contractors.length), cls: 'text-gray-800' },
                      { label: 'Tasks', value: String(tasks.length), cls: 'text-[#1c2b3a]' },
                      { label: 'Done', value: String(tasks.filter(t => t.status === 'done').length), cls: 'text-emerald-600' },
                      { label: 'Status', value: cfg.label, cls: 'text-gray-500' },
                    ] : isRetainerProject(activeProject) ? [
                      ...(isOwner ? [
                        { label: 'Monthly', value: fmtRate(activeProject.monthly_rate, (activeProject as any).monthly_rate_currency), cls: 'text-[#1c2b3a]' },
                        { label: 'Collected', value: fmt(d.totalPaid), cls: 'text-emerald-600' },
                        { label: 'Months Paid', value: String(d.monthsCollected ?? '—'), cls: 'text-gray-700' },
                        { label: 'Costs', value: fmt(d.totalCosts), cls: 'text-[#1c2b3a]' },
                      ] : [
                        { label: 'Team', value: String(activeProject.hub_project_contractors.length), cls: 'text-gray-800' },
                        { label: 'Tasks', value: String(tasks.length), cls: 'text-[#1c2b3a]' },
                        { label: 'Done', value: String(tasks.filter(t => t.status === 'done').length), cls: 'text-emerald-600' },
                        { label: 'Status', value: cfg.label, cls: 'text-gray-500' },
                      ]),
                    ] : [
                      { label: 'Contract', value: fmt(activeProject.contract_price), cls: 'text-gray-800' },
                      { label: 'Paid', value: fmt(d.totalPaid), cls: 'text-emerald-600' },
                      { label: 'Balance', value: fmt(d.balance), cls: d.balance > 0 ? 'text-rose-600' : 'text-gray-400' },
                      { label: 'Costs', value: fmt(d.totalCosts), cls: 'text-[#1c2b3a]' },
                    ]).map(s => (
                      <div key={s.label} className="bg-gray-50 rounded-xl p-3">
                        <p className="text-[10px] text-gray-400 uppercase tracking-wide">{s.label}</p>
                        <p className={`text-sm font-bold mt-0.5 ${s.cls}`}>{s.value}</p>
                      </div>
                    ))}
                  </div>
                  {/* Actions */}
                  <div className="flex gap-2">
                    {!internalProject && <button onClick={() => navigate(`/hub/admin/invoices/${activeProject.id}`)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-[#111827] text-white text-sm rounded-xl cursor-pointer">
                      <i className="ri-mail-send-line"></i> Send Invoice
                    </button>}
                    <button onClick={() => { setEditingProject(activeProject); setForm({ project_type: activeProject.project_type, project_name: activeProject.project_name, client_name: activeProject.client_name, contact_email: activeProject.contact_email ?? '', service: activeProject.service ?? '', contract_price: activeProject.project_type === 'retainer' ? '' : String(activeProject.contract_price), monthly_rate: activeProject.monthly_rate != null ? String(activeProject.monthly_rate) : '', monthly_rate_currency: (activeProject as any).monthly_rate_currency ?? 'PHP', deadline: activeProject.deadline ?? '', start_date: activeProject.start_date ?? '', status: activeProject.status, notes: activeProject.notes ?? '', drive_url: (activeProject as any).drive_url ?? '' } as any); setShowForm(true); }}
                      className="px-4 flex items-center gap-1.5 py-2.5 border border-gray-200 text-gray-600 text-sm rounded-xl cursor-pointer">
                      <i className="ri-edit-line"></i>
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
                  {/* Payments */}
                  {!internalProject && activeProject.hub_project_payments.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 mb-2">Payments</p>
                      <div className="space-y-1.5">
                        {activeProject.hub_project_payments.map((pay: any) => (
                          <div key={pay.id} className="flex items-center justify-between text-sm">
                            <span className="text-gray-600">{fmtDate(pay.paid_at)}</span>
                            <span className="font-medium text-emerald-600">{fmt(pay.amount)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Desktop: inline panel */}
            <div className="hidden lg:block space-y-4 min-w-0">
              {/* Header */}
              <div className="bg-white border border-gray-100 rounded-2xl p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="font-bold text-[#111827] text-lg">{activeProject.project_name}</h2>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.cls}`}>{cfg.label}</span>
                      {internalProject && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-600">Internal</span>
                      )}
                      {activeProject.service && (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getServiceCfg(activeProject.service).badge}`}>{activeProject.service}</span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 mt-0.5">{internalProject ? 'Internal Project' : activeProject.client_name}</p>
                    {(activeProject.start_date || activeProject.deadline) && (
                      <p className="text-xs text-gray-400 mt-1">
                        {activeProject.start_date && `Started ${fmtDate(activeProject.start_date)}`}
                        {activeProject.start_date && activeProject.deadline && ' · '}
                        {activeProject.deadline && `Due ${fmtDate(activeProject.deadline)}`}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {/* Secondary actions */}
                    <div className="flex items-center gap-0.5 bg-white/60 border border-gray-200 rounded-xl px-1 py-1">
                      <button onClick={() => { setEditingProject(activeProject); setForm({ project_type: activeProject.project_type, client_name: activeProject.client_name, project_name: activeProject.project_name, service: activeProject.service || '', contract_price: activeProject.project_type === 'retainer' ? '' : String(activeProject.contract_price), monthly_rate: activeProject.monthly_rate != null ? String(activeProject.monthly_rate) : '', status: activeProject.status, start_date: activeProject.start_date || '', deadline: activeProject.deadline || '', notes: activeProject.notes || '', contact_email: activeProject.contact_email || '', drive_url: (activeProject as any).drive_url || '' } as any); setShowForm(true); }}
                        className="text-xs text-gray-500 hover:text-gray-800 cursor-pointer flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 hover:bg-white transition-colors">
                        <i className="ri-edit-line text-sm"></i> Edit
                      </button>
                      {!internalProject && <>
                        <div className="w-px h-4 bg-gray-200" />
                        <button onClick={() => void printInvoice(activeProject)}
                          className="text-xs text-gray-500 hover:text-gray-800 cursor-pointer flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 hover:bg-white transition-colors">
                          <i className="ri-printer-line text-sm"></i> Print
                        </button>
                      </>}
                    </div>

                    {/* Delete — quiet danger */}
                    <button onClick={() => void deleteProject(activeProject)}
                      className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl cursor-pointer transition-colors border border-transparent hover:border-rose-100"
                      title="Delete project">
                      <i className="ri-delete-bin-line text-sm"></i>
                    </button>

                    {/* Separator */}
                    <div className="w-px h-5 bg-gray-200" />

                    {/* Primary actions */}
                    {!internalProject && <button onClick={() => navigate(`/hub/admin/invoices/${activeProject.id}`)}
                      className="text-xs px-3 py-2 bg-[#111827] hover:bg-gray-800 text-white rounded-xl cursor-pointer flex items-center gap-1.5 transition-colors font-medium">
                      <i className="ri-mail-send-line text-sm"></i> Send Invoice
                    </button>}
                    <button onClick={() => setWorkspaceOpen(true)}
                      className="text-xs px-3 py-2 bg-indigo-600 hover:bg-[#0f1c28] text-white rounded-xl cursor-pointer flex items-center gap-1.5 transition-colors font-medium">
                      <i className="ri-layout-grid-line text-sm"></i> Workspace
                    </button>
                  </div>
                </div>

                {/* Ops stats strip — always shown, finance only for client */}
                {internalProject ? (
                  <div className="mt-4 flex items-center gap-4 text-sm text-gray-600 bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 flex-wrap">
                    <span><span className="font-semibold text-gray-800">{activeProject.hub_project_contractors.length}</span> <span className="text-gray-400 text-xs">members</span></span>
                    <span className="text-gray-200">|</span>
                    <span><span className="font-semibold text-gray-800">{tasks.length}</span> <span className="text-gray-400 text-xs">tasks</span></span>
                    <span className="text-gray-200">|</span>
                    <span><span className="font-semibold text-emerald-600">{tasks.filter(t => t.status === 'done').length}</span> <span className="text-gray-400 text-xs">done</span></span>
                    <span className="text-gray-200">|</span>
                    <span className={`text-xs font-medium ${cfg.cls} px-2 py-0.5 rounded-full`}>{cfg.label}</span>
                  </div>
                ) : isRetainerProject(activeProject) ? (
                  <>
                    {/* Retainer finance strip — owner only */}
                    {isOwner && <><div className="mt-4 flex items-center gap-3 text-xs text-gray-500 bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 flex-wrap">
                      <span>Monthly: <strong className="text-[#1c2b3a]">{fmtRate(activeProject.monthly_rate, (activeProject as any).monthly_rate_currency)}</strong></span>
                      <span className="text-gray-200">|</span>
                      <span>Collected: <strong className="text-emerald-600">{fmt(d.totalPaid)}</strong></span>
                      <span className="text-gray-200">|</span>
                      <span>Months paid: <strong className="text-gray-700">{d.monthsCollected ?? 0}</strong></span>
                      <span className="text-gray-200">|</span>
                      <span>Costs: <strong className="text-rose-500">{fmt(d.totalCosts)}</strong></span>
                    </div>
                    {/* Retainer payment history bar */}
                    <div className="mt-3">
                      <div className="flex justify-between text-xs text-gray-400 mb-1">
                        <span>Client payments</span>
                        <span>{d.monthsCollected ?? 0} month{(d.monthsCollected ?? 0) !== 1 ? 's' : ''} · {fmt(d.totalPaid)} collected</span>
                      </div>
                      <div className="h-2 bg-white/60 rounded-full overflow-hidden border border-white/55">
                        <div className="h-full bg-emerald-400 rounded-full transition-all" style={{ width: d.totalPaid > 0 ? '100%' : '0%' }} />
                      </div>
                    </div></>}
                  </>
                ) : (
                  <>
                    {/* Client finance strip */}
                    <div className="mt-4 flex items-center gap-3 text-xs text-gray-500 bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 flex-wrap">
                      <span>Contract: <strong className="text-gray-700">{fmt(activeProject.contract_price)}</strong></span>
                      <span className="text-gray-200">|</span>
                      <span>Collected: <strong className="text-emerald-600">{fmt(d.totalPaid)}</strong></span>
                      <span className="text-gray-200">|</span>
                      <span>Costs: <strong className="text-rose-500">{fmt(d.totalCosts)}</strong></span>
                      <span className="text-gray-200">|</span>
                      <span>Balance: <strong className={d.balance > 0 ? 'text-amber-600' : 'text-emerald-600'}>{fmt(d.balance)}</strong></span>
                    </div>
                    {/* Collection progress */}
                    <div className="mt-3">
                      <div className="flex justify-between text-xs text-gray-400 mb-1">
                        <span>Client payments</span>
                        <span>{fmt(d.totalPaid)} of {fmt(activeProject.contract_price)}</span>
                      </div>
                      <div className="h-2 bg-white/60 rounded-full overflow-hidden border border-white/55">
                        <div className="h-full bg-emerald-400 rounded-full transition-all" style={{ width: `${Math.min(d.paidPct, 100)}%` }} />
                      </div>
                    </div>
                  </>
                )}
                {activeProject.notes && <p className="text-xs text-gray-400 italic mt-3">{activeProject.notes}</p>}
                </div>
              </div>

              {!internalProject && <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Client Payments */}
                <div className="bg-white border border-gray-100 rounded-xl p-4 space-y-3">
                  <button onClick={() => toggleSection('payments')} className="w-full flex items-center justify-between cursor-pointer group">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Client Payments</p>
                    <div className="flex items-center gap-2">
                      {!openSections['payments'] && activeProject.hub_project_payments.length > 0 && (
                        <span className="text-xs text-emerald-600 font-medium">{activeProject.hub_project_payments.length} payment{activeProject.hub_project_payments.length !== 1 ? 's' : ''}</span>
                      )}
                      <i className={`ri-arrow-${openSections['payments'] ? 'up' : 'down'}-s-line text-gray-400 text-sm group-hover:text-gray-600`}></i>
                    </div>
                  </button>
                  {openSections['payments'] && (
                    <>
                      {activeProject.hub_project_payments.length === 0 ? (
                        <p className="text-xs text-gray-400">No payments logged yet.</p>
                      ) : (
                        <div className="space-y-2">
                          {[...activeProject.hub_project_payments].sort((a, b) => new Date(a.paid_at).getTime() - new Date(b.paid_at).getTime()).map((pp) => (
                            <div key={pp.id} className="bg-white/45 border border-white/65 rounded-xl overflow-hidden backdrop-blur-md">
                              {editingPaymentId === pp.id ? (
                                <div className="p-2.5 space-y-2">
                                  <div className="flex gap-2">
                                    <input type="number" value={editPayForm.amount} onChange={e => setEditPayForm(f => ({ ...f, amount: e.target.value }))} placeholder="Amount"
                                      className="flex-1 px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]" />
                                    <input type="date" value={editPayForm.date} onChange={e => setEditPayForm(f => ({ ...f, date: e.target.value }))}
                                      className="px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none" />
                                  </div>
                                  <input value={editPayForm.notes} onChange={e => setEditPayForm(f => ({ ...f, notes: e.target.value }))} placeholder="Notes (optional)"
                                    className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none" />
                                  <div className="flex items-center gap-2">
                                    <label className="flex items-center gap-1.5 px-2.5 py-1.5 border border-dashed border-gray-200 rounded-lg cursor-pointer hover:bg-white transition-colors flex-1">
                                      <i className="ri-image-add-line text-gray-400 text-sm"></i>
                                      <span className="text-xs text-gray-400 truncate">{editPayForm.receipt ? editPayForm.receipt.name : editPayForm.existingReceiptUrl ? 'Replace receipt' : 'Attach proof of payment'}</span>
                                      <input type="file" accept="image/*,application/pdf" className="hidden" onChange={e => setEditPayForm(f => ({ ...f, receipt: e.target.files?.[0] ?? null }))} />
                                    </label>
                                    {editPayForm.existingReceiptUrl && !editPayForm.receipt && (
                                      <button onClick={() => setLightboxUrl(editPayForm.existingReceiptUrl)} className="cursor-pointer flex-shrink-0">
                                        <img src={editPayForm.existingReceiptUrl} alt="receipt" className="h-8 w-12 object-cover rounded border border-gray-200 hover:opacity-80" />
                                      </button>
                                    )}
                                    {(editPayForm.receipt || editPayForm.existingReceiptUrl) && (
                                      <button onClick={() => setEditPayForm(f => ({ ...f, receipt: null, existingReceiptUrl: null }))} className="text-gray-300 hover:text-rose-400 cursor-pointer text-xs flex-shrink-0">
                                        <i className="ri-close-line"></i>
                                      </button>
                                    )}
                                  </div>
                                  {editPayError && <p className="text-xs text-red-500">{editPayError}</p>}
                                  <div className="flex gap-2">
                                    <button onClick={() => setEditingPaymentId(null)} className="flex-1 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-500 hover:bg-white cursor-pointer">Cancel</button>
                                    <button onClick={updatePayment} disabled={!editPayForm.amount || editPaySaving}
                                      className="flex-1 py-1.5 text-xs bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 cursor-pointer disabled:opacity-40">
                                      {editPaySaving ? '...' : 'Save'}
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex items-start justify-between gap-2 p-2.5">
                                  <div className="flex-1 min-w-0">
                                    <span className="text-sm font-semibold text-emerald-600">{fmt(pp.amount)}</span>
                                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                      <span className="text-[11px] text-gray-400">
                                        <i className="ri-calendar-line text-[10px] mr-0.5"></i>
                                        {fmtDate(pp.paid_at)}
                                      </span>
                                      {pp.notes && (
                                        <span className="text-[11px] text-gray-500">
                                          · <i className="ri-file-text-line text-[10px] mr-0.5"></i>{pp.notes}
                                        </span>
                                      )}
                                    </div>
                                    {pp.receipt_url && (
                                      <button onClick={() => setLightboxUrl(pp.receipt_url)} className="mt-1.5 cursor-pointer">
                                        <img src={pp.receipt_url} alt="receipt" className="h-8 w-14 object-cover rounded border border-gray-200 hover:opacity-80 transition-opacity" />
                                      </button>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1.5 flex-shrink-0">
                                    <button onClick={() => { setSendReceiptModal({ payment: pp, project: activeProject }); setSendReceiptEmail(activeProject.contact_email ?? ''); setSendReceiptCc(''); setSendReceiptMsg(null); }}
                                      className="text-gray-300 hover:text-sky-500 cursor-pointer mt-0.5" title="Send receipt to client">
                                      <i className="ri-mail-send-line text-xs"></i>
                                    </button>
                                    <button onClick={() => { setEditingPaymentId(pp.id); setEditPayForm({ amount: String(pp.amount), date: pp.paid_at, notes: pp.notes ?? '', receipt: null, existingReceiptUrl: pp.receipt_url }); setEditPayError(''); }}
                                      className="text-gray-300 hover:text-gray-600 cursor-pointer mt-0.5"><i className="ri-edit-line text-xs"></i></button>
                                    <button onClick={() => deletePayment(pp.id)} className="text-gray-300 hover:text-rose-400 cursor-pointer mt-0.5"><i className="ri-delete-bin-line text-xs"></i></button>
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="border-t border-gray-100 pt-3 space-y-2">
                        <div className="flex gap-2">
                          <div className="flex flex-1 gap-0">
                            <select value={payCurrency} onChange={e => setPayCurrency(e.target.value as 'PHP' | 'USD')}
                              className="px-2 py-1.5 text-xs border border-gray-200 rounded-l-lg focus:outline-none bg-gray-50 border-r-0">
                              <option value="PHP">₱</option>
                              <option value="USD">$</option>
                            </select>
                            <input type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)} placeholder="Amount"
                              className="flex-1 px-2.5 py-1.5 text-xs border border-gray-200 rounded-r-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]" />
                          </div>
                          <input type="date" value={payDate} onChange={e => setPayDate(e.target.value)}
                            className="px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none" />
                        </div>
                        {payCurrency === 'USD' && (
                          <p className="text-xs text-gray-400">≈ ₱{payAmount ? (parseFloat(payAmount) * usdRate).toLocaleString() : '0'} at ₱{usdRate}/USD</p>
                        )}
                        <div className="flex gap-2">
                          <input value={payNotes} onChange={e => setPayNotes(e.target.value)} placeholder="Notes (optional)"
                            className="flex-1 px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none" />
                          <button onClick={logPayment} disabled={!payAmount || paySaving}
                            className="px-3 py-1.5 bg-emerald-500 text-white text-xs rounded-lg hover:bg-emerald-600 cursor-pointer disabled:opacity-40 whitespace-nowrap">
                            {paySaving ? '...' : '+ Log'}
                          </button>
                        </div>
                        <div className="flex items-center gap-2">
                          <label className="flex items-center gap-1.5 px-2.5 py-1.5 border border-dashed border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                            <i className="ri-image-add-line text-gray-400 text-sm"></i>
                            <span className="text-xs text-gray-400">{payReceipt ? payReceipt.name : 'Attach receipt (optional)'}</span>
                            <input type="file" accept="image/*,application/pdf" className="hidden" onChange={e => setPayReceipt(e.target.files?.[0] ?? null)} />
                          </label>
                          {payReceipt && (
                            <button onClick={() => setPayReceipt(null)} className="text-gray-300 hover:text-rose-400 cursor-pointer text-xs">
                              <i className="ri-close-line"></i>
                            </button>
                          )}
                        </div>
                        {payError && <p className="text-xs text-red-500">{payError}</p>}
                      </div>
                    </>
                  )}
                </div>

                {/* Payment Schedule */}
                <div className="bg-white border border-gray-100 rounded-xl p-4 space-y-3">
                  <button onClick={() => toggleSection('schedule')} className="w-full flex items-center justify-between cursor-pointer group">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Payment Schedule</p>
                    <div className="flex items-center gap-2">
                      {!openSections['schedule'] && (activeProject.hub_payment_reminders ?? []).length > 0 && (
                        <span className="text-xs text-amber-600 font-medium">{(activeProject.hub_payment_reminders ?? []).length} reminder{(activeProject.hub_payment_reminders ?? []).length !== 1 ? 's' : ''}</span>
                      )}
                      <i className={`ri-arrow-${openSections['schedule'] ? 'up' : 'down'}-s-line text-gray-400 text-sm group-hover:text-gray-600`}></i>
                    </div>
                  </button>
                  {openSections['schedule'] && (
                    <>
                      <p className="text-[10px] text-gray-400">Reminders auto-send on due date</p>
                      {(activeProject.hub_payment_reminders ?? []).length === 0 ? (
                        <p className="text-xs text-gray-400">No reminders scheduled.</p>
                      ) : (
                        <div className="space-y-1.5">
                          {[...(activeProject.hub_payment_reminders ?? [])].sort((a, b) => a.send_date.localeCompare(b.send_date)).map(r => {
                            const isPast = r.send_date < localToday();
                            const statusCls = r.status === 'sent' ? 'text-emerald-600 bg-emerald-50' : r.status === 'cancelled' ? 'text-gray-400 bg-gray-100 line-through' : isPast ? 'text-rose-500 bg-rose-50' : 'text-amber-600 bg-amber-50';
                            const statusLabel = r.status === 'sent' ? 'Sent' : r.status === 'cancelled' ? 'Cancelled' : isPast ? 'Overdue' : 'Pending';
                            return (
                              <div key={r.id} className="flex items-center justify-between gap-2 bg-white/48 border border-white/65 rounded-xl px-3 py-2 backdrop-blur-md">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-xs font-medium text-gray-700">
                                      {new Date(r.send_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                    </span>
                                    {r.amount_due && <span className="text-xs font-semibold text-[#1c2b3a]">{fmt(r.amount_due)}</span>}
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${statusCls}`}>{statusLabel}</span>
                                  </div>
                                  {r.notes && <p className="text-[11px] text-gray-400 mt-0.5">{r.notes}</p>}
                                </div>
                                {r.status === 'pending' && (
                                  <button onClick={() => deleteReminder(r.id)} className="text-gray-300 hover:text-rose-400 cursor-pointer flex-shrink-0">
                                    <i className="ri-delete-bin-line text-xs"></i>
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                      <div className="border-t border-gray-100 pt-3 space-y-2">
                        <div className="flex gap-2">
                          <input type="date" value={reminderDate} onChange={e => setReminderDate(e.target.value)}
                            className="flex-1 px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]" />
                          <input type="number" value={reminderAmount} onChange={e => setReminderAmount(e.target.value)} placeholder="Amount (optional)"
                            className="w-32 px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none" />
                        </div>
                        <div className="flex gap-2">
                          <input value={reminderNotes} onChange={e => setReminderNotes(e.target.value)} placeholder="Note e.g. 2nd installment"
                            className="flex-1 px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none" />
                          <button onClick={addReminder} disabled={!reminderDate || reminderSaving}
                            className="px-3 py-1.5 bg-[#111827] text-white text-xs rounded-lg hover:bg-gray-700 cursor-pointer disabled:opacity-40 whitespace-nowrap">
                            {reminderSaving ? '...' : '+ Add'}
                          </button>
                        </div>
                        {reminderError && <p className="text-xs text-red-500">{reminderError}</p>}
                      </div>
                    </>
                  )}
                </div>

                {/* Operational Costs */}
                <div className="bg-white border border-gray-100 rounded-xl p-4 space-y-3">
                  <button onClick={() => toggleSection('costs')} className="w-full flex items-center justify-between cursor-pointer group">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Operational Costs</p>
                    <div className="flex items-center gap-2">
                      {!openSections['costs'] && activeProject.hub_project_costs.length > 0 && (
                        <span className="text-xs text-rose-500 font-medium">{fmt(activeProject.hub_project_costs.reduce((s, c) => s + c.amount, 0))}</span>
                      )}
                      <i className={`ri-arrow-${openSections['costs'] ? 'up' : 'down'}-s-line text-gray-400 text-sm group-hover:text-gray-600`}></i>
                    </div>
                  </button>
                  {openSections['costs'] && (
                    <>
                      {activeProject.hub_project_costs.length === 0 ? (
                        <p className="text-xs text-gray-400">No costs logged yet.</p>
                      ) : (
                        <div className="space-y-1.5">
                          {activeProject.hub_project_costs.map(cc => (
                            <div key={cc.id} className="flex items-center justify-between gap-2 text-sm">
                              <div>
                                <span className="text-gray-700 text-xs">{cc.label}</span>
                                <span className="font-medium text-rose-500 ml-2">{fmt(cc.amount)}</span>
                                <span className="text-xs text-gray-400 ml-1">· {new Date(cc.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                              </div>
                              <button onClick={() => deleteCost(cc.id)} className="text-gray-300 hover:text-rose-400 cursor-pointer"><i className="ri-delete-bin-line text-xs"></i></button>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="border-t border-gray-100 pt-3 space-y-2">
                        <div className="flex gap-2">
                          <input value={costLabel} onChange={e => setCostLabel(e.target.value)} placeholder="e.g. Hosting, Domain"
                            className="flex-1 px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]" />
                          <input type="number" value={costAmount} onChange={e => setCostAmount(e.target.value)} placeholder="Amount"
                            className="w-24 px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none" />
                        </div>
                        <div className="flex gap-2">
                          <input type="date" value={costDate} onChange={e => setCostDate(e.target.value)}
                            className="px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none" />
                          <button onClick={logCost} disabled={!costLabel.trim() || !costAmount || costSaving}
                            className="flex-1 px-3 py-1.5 bg-rose-500 text-white text-xs rounded-lg hover:bg-rose-600 cursor-pointer disabled:opacity-40">
                            {costSaving ? '...' : '+ Log Cost'}
                          </button>
                        </div>
                        {costError && <p className="text-xs text-red-500">{costError}</p>}
                      </div>
                    </>
                  )}
                </div>
              </div>}

              {/* Team */}
              <div className="bg-white border border-gray-100 rounded-xl p-4 space-y-3">
                <button onClick={() => toggleSection('team')} className="w-full flex items-center justify-between cursor-pointer group">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Team</p>
                  <i className={`ri-arrow-${teamPayoutsOpen ? 'up' : 'down'}-s-line text-gray-400 text-sm group-hover:text-gray-600`}></i>
                </button>
                {!teamPayoutsOpen && activeProject.hub_project_contractors.length > 0 && (
                  <div className="flex items-center gap-2">
                    {activeProject.hub_project_contractors.slice(0, 5).map(pc => pc.hub_users && (
                      <div key={pc.hub_users.id} title={pc.hub_users.full_name}>
                        <HubAvatar fullName={pc.hub_users.full_name} avatarUrl={pc.hub_users.avatar_url} size="w-7 h-7" className="border-2 border-white -ml-1 first:ml-0" />
                      </div>
                    ))}
                    <span className="text-xs text-gray-400 ml-1">{activeProject.hub_project_contractors.length} member{activeProject.hub_project_contractors.length !== 1 ? 's' : ''} · click to expand</span>
                  </div>
                )}
                {teamPayoutsOpen && (
                  <>
                  <p className="text-[11px] text-gray-400">
                    {internalProject ? 'Assign people and roles. Tasks and workspace access start immediately.' : 'Assign people first, then configure payout type and amount for each person.'}
                  </p>
                  {activeProject.hub_project_contractors.length === 0 ? (
                  <p className="text-xs text-gray-400">No contractors assigned to this project yet.</p>
                  ) : (
                  <div className="space-y-3">
                    {activeProject.hub_project_contractors.map(pc => {
                      const u = pc.hub_users;
                      if (!u) return null;
                      const configForm = ctxConfigForm[pc.id] ?? {
                        payoutType: (pc.payout_type === 'fixed' ? 'fixed' : 'percentage') as 'percentage' | 'fixed',
                        percentage: pc.percentage ? String(pc.percentage) : '',
                        fixedAmount: pc.fixed_amount != null ? String(pc.fixed_amount) : '',
                      };
                      const setConfigForm = (patch: Partial<typeof configForm>) => setCtxConfigForm(prev => ({
                        ...prev,
                        [pc.id]: { ...configForm, ...patch },
                      }));
                      const isFixed = pc.payout_type === 'fixed';
                      const hasConfiguredPayout = isFixed ? (pc.fixed_amount ?? 0) > 0 : pc.percentage > 0;
                      const cut = hasConfiguredPayout ? (isFixed ? (pc.fixed_amount ?? 0) : d.netProfit * (pc.percentage / 100)) : 0;
                      const totalPaidOut = pc.hub_project_contractor_payouts.reduce((s, x) => s + x.amount, 0);
                      const paidPct = cut > 0 ? Math.min((totalPaidOut / cut) * 100, 100) : 0;
                      const isFullyPaid = totalPaidOut >= cut && cut > 0;
                      const pf = ctxPayForm[pc.id] ?? { amount: '', date: localToday(), notes: '', receipt: null, notify: true };
                      const setPf = (patch: Partial<typeof pf>) => setCtxPayForm(prev => ({ ...prev, [pc.id]: { ...pf, ...patch } }));
                      return (
                        <div key={pc.id} className="border border-gray-100 bg-white rounded-xl overflow-hidden">
                          {/* Contractor header */}
                          <div className="flex items-center gap-3 p-3 bg-white/45 backdrop-blur-md">
                            <Avatar name={u.full_name} url={u.avatar_url} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-sm font-medium text-gray-800">{u.full_name}</p>
                                {pc.project_role && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white border border-gray-200 text-gray-500 font-medium">
                                    {pc.project_role}
                                  </span>
                                )}
                                {internalProject ? (
                                  <span className="text-xs text-gray-400">Internal assignment</span>
                                ) : !hasConfiguredPayout ? (
                                  <span className="text-xs text-amber-600">No payout set</span>
                                ) : isFixed ? (
                                  <span className="text-xs text-gray-400">Fixed fee → <strong className="text-[#111827]">{fmt(cut)}</strong></span>
                                ) : (
                                  <span className="text-xs text-gray-400">{pc.percentage}% → <strong className="text-[#111827]">{fmt(cut)}</strong></span>
                                )}
                                {!internalProject && hasConfiguredPayout && (isFullyPaid
                                  ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">Paid in full</span>
                                  : totalPaidOut > 0
                                    ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">{fmt(totalPaidOut)} paid</span>
                                    : <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">Unpaid</span>
                                )}
                              </div>
                              {!internalProject && hasConfiguredPayout && (
                                <div className="mt-1.5 h-1 bg-gray-200 rounded-full overflow-hidden w-full">
                                  <div className={`h-full rounded-full transition-all ${isFullyPaid ? 'bg-emerald-400' : 'bg-amber-400'}`} style={{ width: `${paidPct}%` }} />
                                </div>
                              )}
                            </div>
                            <button onClick={() => removeContractor(pc.id)} className="text-gray-300 hover:text-rose-400 cursor-pointer flex-shrink-0"><i className="ri-delete-bin-line text-xs"></i></button>
                          </div>

                          {!internalProject && <div className="px-3 py-2.5 border-t border-gray-100 bg-white space-y-2">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Payout Setup</p>
                              <span className="text-[11px] text-gray-400">Net profit basis: <strong className="text-emerald-600">{fmt(d.netProfit)}</strong></span>
                            </div>
                            <div className="flex gap-2 flex-wrap">
                              <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs flex-shrink-0">
                                <button onClick={() => setConfigForm({ payoutType: 'percentage' })}
                                  className={`px-2.5 py-1.5 cursor-pointer transition-colors ${configForm.payoutType === 'percentage' ? 'bg-[#111827] text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
                                  Percentage
                                </button>
                                <button onClick={() => setConfigForm({ payoutType: 'fixed' })}
                                  className={`px-2.5 py-1.5 cursor-pointer transition-colors border-l border-gray-200 ${configForm.payoutType === 'fixed' ? 'bg-[#111827] text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
                                  Fixed Fee
                                </button>
                              </div>
                              {configForm.payoutType === 'percentage' ? (
                                <div className="relative w-24">
                                  <input type="number" value={configForm.percentage} onChange={e => setConfigForm({ percentage: e.target.value })} placeholder="%" min="1" max="100"
                                    className="w-full px-2.5 py-1.5 pr-6 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]" />
                                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">%</span>
                                </div>
                              ) : (
                                <div className="relative w-40">
                                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">₱</span>
                                  <input type="number" value={configForm.fixedAmount} onChange={e => setConfigForm({ fixedAmount: e.target.value })} placeholder="Fixed fee amount"
                                    className="w-full pl-6 pr-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]" />
                                </div>
                              )}
                              <button onClick={() => saveContractorPayoutConfig(pc.id)} disabled={ctxConfigSaving[pc.id]}
                                className="px-3 py-1.5 bg-[#111827] text-white text-xs rounded-lg hover:bg-gray-800 cursor-pointer disabled:opacity-40 whitespace-nowrap">
                                {ctxConfigSaving[pc.id] ? 'Saving...' : hasConfiguredPayout ? 'Update Payout' : 'Set Payout'}
                              </button>
                            </div>
                            {ctxConfigError[pc.id] && <p className="text-xs text-red-500">{ctxConfigError[pc.id]}</p>}
                          </div>}

                          {/* Payout history */}
                          {!internalProject && hasConfiguredPayout && pc.hub_project_contractor_payouts.length > 0 && (
                            <div className="px-3 py-2 space-y-1.5 border-t border-gray-100">
                              {pc.hub_project_contractor_payouts.map(pp => (
                                <div key={pp.id} className="flex items-center justify-between gap-2 text-xs">
                                  <div className="flex items-center gap-2 text-gray-600 flex-wrap">
                                    <i className="ri-arrow-right-line text-gray-300 text-[10px]"></i>
                                    <span className="font-semibold text-emerald-600">{fmt(pp.amount)}</span>
                                    <span className="text-gray-400">{fmtDate(pp.paid_at)}</span>
                                    {pp.notes && <span className="text-gray-400">· {pp.notes}</span>}
                                    {pp.receipt_url && (
                                      <button onClick={() => setLightboxUrl(pp.receipt_url)} className="cursor-pointer flex-shrink-0">
                                        <img src={pp.receipt_url} alt="receipt" className="h-6 w-9 object-cover rounded border border-gray-200 hover:opacity-80 transition-opacity" />
                                      </button>
                                    )}
                                  </div>
                                  <button onClick={() => deleteContractorPayout(pp.id)} className="text-gray-300 hover:text-rose-400 cursor-pointer"><i className="ri-delete-bin-line text-[10px]"></i></button>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Log payout form */}
                          {!internalProject && hasConfiguredPayout && !isFullyPaid && (
                            <div className="px-3 py-2.5 border-t border-gray-100 bg-white space-y-2">
                              <div className="flex gap-2">
                                <div className="flex-1 flex gap-1">
                                  <input type="number" value={pf.amount} onChange={e => setPf({ amount: e.target.value })} placeholder={`Amount (of ${fmt(cut)})`}
                                    className="flex-1 px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]" />
                                  <button
                                    type="button"
                                    onClick={() => setPf({ amount: String((cut - totalPaidOut).toFixed(2)) })}
                                    className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 hover:text-gray-700 cursor-pointer whitespace-nowrap"
                                  >
                                    Remaining
                                  </button>
                                </div>
                                <input type="date" value={pf.date} onChange={e => setPf({ date: e.target.value })}
                                  className="px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none" />
                              </div>
                              <div className="flex gap-2">
                                <input value={pf.notes} onChange={e => setPf({ notes: e.target.value })} placeholder="Notes (optional)"
                                  className="flex-1 px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none" />
                                <button onClick={() => logContractorPayout(pc.id, cut, u.full_name, u.email, activeProject)} disabled={!pf.amount || ctxPaySaving[pc.id]}
                                  className="px-3 py-1.5 bg-[#111827] text-white text-xs rounded-lg hover:bg-gray-800 cursor-pointer disabled:opacity-40 whitespace-nowrap">
                                  {ctxPaySaving[pc.id] ? '...' : '+ Payout'}
                                </button>
                              </div>
                              <div className="flex items-center gap-2">
                                <label className="flex items-center gap-1.5 px-2.5 py-1.5 border border-dashed border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                                  <i className="ri-image-add-line text-gray-400 text-sm"></i>
                                  <span className="text-xs text-gray-400">{pf.receipt ? pf.receipt.name : 'Attach receipt (optional)'}</span>
                                  <input type="file" accept="image/*" className="hidden" onChange={e => setPf({ receipt: e.target.files?.[0] ?? null })} />
                                </label>
                                {pf.receipt && (
                                  <button onClick={() => setPf({ receipt: null })} className="text-gray-300 hover:text-rose-400 cursor-pointer text-xs">
                                    <i className="ri-close-line"></i>
                                  </button>
                                )}
                              </div>
                              <label className="flex items-center gap-2 cursor-pointer select-none w-fit">
                                <input type="checkbox" checked={pf.notify} onChange={e => setPf({ notify: e.target.checked })}
                                  className="w-3.5 h-3.5 accent-[#1c2b3a]" />
                                <span className="text-xs text-gray-400">
                                  Notify {u.email ? u.full_name.split(' ')[0] : 'contractor'} via email
                                  {!u.email && <span className="text-amber-500 ml-1">(no email on file)</span>}
                                </span>
                              </label>
                              {ctxPayError[pc.id] && <p className="text-xs text-red-500">{ctxPayError[pc.id]}</p>}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  )}
                  {unassigned.length > 0 && (
                    <div className="border-t border-gray-100 pt-3 space-y-2">
                      <div className="flex gap-2">
                        <select value={addCtxId} onChange={e => {
                          setAddCtxId(e.target.value);
                        }}
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
                      <p className="text-[11px] text-gray-400">{internalProject ? 'Assign people and roles. Tasks and workspace access start immediately.' : 'Payout can be configured after assignment.'}</p>
                    </div>
                  )}
                  </>
                )}
              </div>

            </> // end desktop + mobile sheets
          );
        })() : (
          <div className="flex items-center justify-center text-gray-400 py-8">
            <div className="text-center space-y-2">
              <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto">
                <i className="ri-folder-open-line text-2xl text-gray-300"></i>
              </div>
              <p className="text-sm">Select a project card to view details</p>
            </div>
          </div>
        )}
      </div>
      )}

      {/* Project form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="font-semibold text-[#111827]">{editingProject ? 'Edit Project' : 'New Project'}</h2>
              <div className="flex items-center gap-2">
                {!editingProject && (
                  <>
                    <label className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50 cursor-pointer transition-colors ${importing ? 'opacity-60 pointer-events-none' : ''}`}>
                      <i className={`${importing ? 'ri-loader-4-line animate-spin' : 'ri-sparkling-2-line'} text-sm text-[#1c2b3a]/70`}></i>
                      {importing ? 'Reading…' : 'Import from file'}
                      <input type="file" className="hidden" accept=".pdf,.csv,.txt,.png,.jpg,.jpeg"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          setImporting(true);
                          try {
                            const buffer = await file.arrayBuffer();
                            const bytes = new Uint8Array(buffer);
                            let binary = '';
                            bytes.forEach(b => binary += String.fromCharCode(b));
                            const file_base64 = btoa(binary);
                            const { data, error } = await supabase.functions.invoke('parse-project-doc', {
                              body: { file_base64, mime_type: file.type, file_name: file.name },
                            });
                            if (error || !data) throw new Error(error?.message ?? 'No data returned');
                            setForm(f => ({
                              ...f,
                              project_name: data.project_name ?? f.project_name,
                              client_name: data.client_name ?? f.client_name,
                              project_type: data.project_type ?? f.project_type,
                              service: data.service ?? f.service,
                              contract_price: data.contract_price != null ? String(data.contract_price) : f.contract_price,
                              monthly_rate: data.monthly_rate != null ? String(data.monthly_rate) : (f as any).monthly_rate,
                              start_date: data.start_date ?? f.start_date,
                              deadline: data.deadline ?? f.deadline,
                              notes: data.notes ?? f.notes,
                            } as any));
                            if (data.tasks?.length) setImportedTasks(data.tasks);
                          } catch (err) {
                            setFormError(`Import failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
                          } finally {
                            setImporting(false);
                            e.target.value = '';
                          }
                        }}
                      />
                    </label>
                  </>
                )}
                <button onClick={() => { setShowForm(false); setEditingProject(null); }} className="text-gray-400 hover:text-gray-600 cursor-pointer w-7 h-7 flex items-center justify-center"><i className="ri-close-line text-lg"></i></button>
              </div>
            </div>
            <div className="p-5 space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-700">Project Type</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { value: 'client',   label: 'One-time',   sub: 'Fixed contract billing' },
                    { value: 'retainer', label: 'Retainer', sub: 'Monthly recurring' },
                    { value: 'internal', label: 'Internal', sub: 'Tasks & team only' },
                  ].map(option => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setForm({ ...form, project_type: option.value as 'client' | 'internal' | 'retainer', client_name: option.value === 'internal' && !form.client_name ? 'Internal' : form.client_name, contract_price: option.value !== 'client' ? '' : form.contract_price, monthly_rate: option.value !== 'retainer' ? '' : (form as any).monthly_rate, contact_email: option.value === 'internal' ? '' : form.contact_email } as any)}
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
                  <input value={form.client_name} onChange={e => setForm({ ...form, client_name: e.target.value })} placeholder={form.project_type === 'internal' ? 'e.g. Internal, Marketing, Ops' : 'e.g. Blue Collar Nutrition'}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-700">Project Name *</label>
                  <input value={form.project_name} onChange={e => setForm({ ...form, project_name: e.target.value })} placeholder="e.g. bluecollarmealplan.com"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-700">Service</label>
                  <select value={SERVICES.includes(form.service) ? form.service : 'Other'}
                    onChange={e => setForm({ ...form, service: e.target.value === 'Other' ? '' : e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none bg-white">
                    {SERVICES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  {!SERVICES.slice(0, -1).includes(form.service) && (
                    <input value={form.service} onChange={e => setForm({ ...form, service: e.target.value })}
                      placeholder="Describe the service..."
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a] mt-1.5" />
                  )}
                </div>
                {form.project_type === 'client' && (
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-700">Contract Price (PHP) *</label>
                    <input type="number" value={form.contract_price} onChange={e => setForm({ ...form, contract_price: e.target.value })} placeholder="0.00"
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]" />
                  </div>
                )}
                {form.project_type === 'retainer' && (
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-700">Monthly Rate *</label>
                    <div className="flex gap-0">
                      <select value={(form as any).monthly_rate_currency} onChange={e => setForm({ ...form, monthly_rate_currency: e.target.value } as any)}
                        className="px-2.5 py-2 text-sm border border-gray-200 rounded-l-lg focus:outline-none bg-gray-50 border-r-0 text-gray-600">
                        <option value="PHP">₱ PHP</option>
                        <option value="USD">$ USD</option>
                      </select>
                      <input type="number" value={(form as any).monthly_rate} onChange={e => setForm({ ...form, monthly_rate: e.target.value } as any)} placeholder="0.00"
                        className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-r-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]" />
                    </div>
                    {(form as any).monthly_rate_currency === 'USD' && (form as any).monthly_rate && (
                      <p className="text-xs text-gray-400 mt-1">≈ ₱{((parseFloat((form as any).monthly_rate) || 0) * usdRate).toLocaleString()}/mo at current rate (₱{usdRate}/USD)</p>
                    )}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-700">Status</label>
                  <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none bg-white">
                    <option value="ongoing">Ongoing</option>
                    <option value="completed">Completed</option>
                    <option value="paused">Paused</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-700">Start Date</label>
                  <input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none" />
                </div>
                {form.project_type !== 'retainer' && (
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-700">Deadline</label>
                    <input type="date" value={form.deadline} onChange={e => setForm({ ...form, deadline: e.target.value })} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none" />
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-700">Notes</label>
                <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} placeholder="Any notes..."
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none resize-none" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-700 flex items-center gap-1.5">
                  <svg viewBox="0 0 87.3 78" className="w-3.5 h-3.5" xmlns="http://www.w3.org/2000/svg"><path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/><path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47"/><path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335"/><path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/><path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc"/><path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 27h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/></svg>
                  Google Drive URL <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input type="url" value={(form as any).drive_url ?? ''} onChange={e => setForm({ ...form, drive_url: e.target.value } as any)} placeholder="https://drive.google.com/drive/u/0/folders/..."
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400" />
              </div>
              {(form.project_type === 'client' || form.project_type === 'retainer') && (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-700">Client Contact Email <span className="text-gray-400 font-normal">(for invoices)</span></label>
                  <input type="email" value={form.contact_email} onChange={e => setForm({ ...form, contact_email: e.target.value })} placeholder="client@email.com"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]" />
                </div>
              )}
              {importedTasks.length > 0 && (
                <div className="mt-2 p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <p className="text-xs font-semibold text-[#1c2b3a] mb-1.5"><i className="ri-sparkling-2-line mr-1"></i>{importedTasks.length} task{importedTasks.length !== 1 ? 's' : ''} will be added</p>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {importedTasks.map((t, i) => (
                      <div key={i} className="flex items-center justify-between gap-2">
                        <span className="text-xs text-indigo-800 truncate">{t.title}</span>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${t.priority === 'high' ? 'bg-rose-100 text-rose-600' : t.priority === 'medium' ? 'bg-amber-100 text-amber-600' : 'bg-gray-100 text-gray-500'}`}>{t.priority}</span>
                          <button onClick={() => setImportedTasks(prev => prev.filter((_, j) => j !== i))} className="text-[#1c2b3a]/50 hover:text-[#1c2b3a] cursor-pointer"><i className="ri-close-line text-xs"></i></button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {formError && <p className="text-xs text-red-500">{formError}</p>}
            </div>
            <div className="flex gap-2 p-5 pt-0">
              <button onClick={() => { setShowForm(false); setEditingProject(null); setImportedTasks([]); }} className="flex-1 py-2.5 text-sm border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 cursor-pointer">Cancel</button>
              <button onClick={saveProject} disabled={formSaving}
                className="flex-1 py-2.5 text-sm bg-[#1c2b3a] text-white rounded-lg hover:bg-[#0f1c28] disabled:opacity-40 cursor-pointer">
                {formSaving ? 'Saving...' : editingProject ? 'Save Changes' : 'Create Project'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Send Invoice modal */}
      {invoiceModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center sm:p-4" onClick={() => setInvoiceModal(null)}>
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-[#111827]">Send Invoice</h3>
                <p className="text-xs text-gray-400 mt-0.5">{invoiceModal.project_name} · {invoiceModal.client_name}</p>
              </div>
              <button onClick={() => setInvoiceModal(null)} className="text-gray-400 hover:text-gray-600 cursor-pointer"><i className="ri-close-line text-lg"></i></button>
            </div>
            {invoiceLocked ? (
              <div className="px-5 py-10 min-h-[420px] flex items-center justify-center">
                <div className="max-w-sm text-center">
                  <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <i className="ri-check-line text-3xl text-emerald-600"></i>
                  </div>
                  <h4 className="text-xl font-bold text-[#111827]">
                    {invoiceForm.send_mode === 'schedule' ? 'Invoice Scheduled' : 'Invoice Sent'}
                  </h4>
                  <p className="text-sm text-gray-500 mt-2">{invoiceMsg?.text}</p>
                  <p className="text-xs text-gray-400 mt-4">Close this window to return. Reopen the invoice modal if you need to prepare another send.</p>
                </div>
              </div>
            ) : (
            <div className="p-5 space-y-3 max-h-[70vh] overflow-y-auto">
              {/* Recipient */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-600">Send to <span className="text-red-400">*</span></label>
                  <input type="email" value={invoiceForm.email} onChange={e => setIf({ email: e.target.value })} placeholder="client@email.com"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]" autoFocus />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-600">CC <span className="text-gray-400 font-normal">(optional)</span></label>
                  <input type="email" value={invoiceForm.cc} onChange={e => setIf({ cc: e.target.value })} placeholder="cc@email.com"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]" />
                </div>
              </div>
              {/* Subject */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600">Subject</label>
                <input type="text" value={invoiceForm.subject} onChange={e => setIf({ subject: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-600">Delivery</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setIf({ send_mode: 'now', scheduled_for: '' })}
                    className={`px-3 py-2 rounded-lg border text-sm cursor-pointer transition-colors ${invoiceForm.send_mode === 'now' ? 'border-[#1c2b3a] bg-slate-50 text-[#1c2b3a]' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                  >
                    Send now
                  </button>
                  <button
                    type="button"
                    onClick={() => setIf({ send_mode: 'schedule' })}
                    className={`px-3 py-2 rounded-lg border text-sm cursor-pointer transition-colors ${invoiceForm.send_mode === 'schedule' ? 'border-[#1c2b3a] bg-slate-50 text-[#1c2b3a]' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                  >
                    Schedule
                  </button>
                </div>
                {invoiceForm.send_mode === 'schedule' && (
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-600">Send on</label>
                    <input type="datetime-local" value={invoiceForm.scheduled_for} onChange={e => setIf({ scheduled_for: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]" />
                    <p className="text-[11px] text-gray-400">This invoice will be saved as a snapshot and sent automatically at the selected time.</p>
                  </div>
                )}
              </div>
              {/* Invoice # and Due date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-600">Invoice #</label>
                  <input type="text" value={invoiceForm.invoice_number} onChange={e => setIf({ invoice_number: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-600">Due date</label>
                  <input type="date" value={invoiceForm.due_date} onChange={e => setIf({ due_date: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-600">Bill to name</label>
                  <input type="text" value={invoiceForm.bill_to_name} onChange={e => setIf({ bill_to_name: e.target.value })}
                    placeholder="e.g. Blue Collar Nutrition"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-600">Reference / PO <span className="text-gray-400">(optional)</span></label>
                  <input type="text" value={invoiceForm.reference} onChange={e => setIf({ reference: e.target.value })}
                    placeholder="e.g. PO-1042"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]" />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600">Billing address <span className="text-gray-400">(optional)</span></label>
                <textarea value={invoiceForm.bill_to_address} onChange={e => setIf({ bill_to_address: e.target.value })} rows={2}
                  placeholder="Company address, attention line, or billing contact"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a] resize-none" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-600">Payment terms <span className="text-gray-400">(optional)</span></label>
                  <input type="text" value={invoiceForm.payment_terms} onChange={e => setIf({ payment_terms: e.target.value })}
                    placeholder="e.g. Net 15 or Due on receipt"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-600">Currency</label>
                  <input type="text" value="PHP (₱)" disabled
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 text-gray-500" />
                </div>
              </div>
              {/* Line items */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-gray-600">Invoice Line Items</label>
                  <button type="button" onClick={() => setInvoiceLineItems(p => [...p, { description: '', amount: '' }])}
                    className="text-xs text-[#1c2b3a] hover:text-[#0f1c28] cursor-pointer flex items-center gap-1">
                    <i className="ri-add-line"></i> Add line
                  </button>
                </div>
                <div className="space-y-1.5">
                  {invoiceLineItems.map((item, idx) => (
                    <div key={idx} className="flex gap-2 items-center">
                      <input value={item.description} onChange={e => setInvoiceLineItems(p => p.map((x, i) => i === idx ? { ...x, description: e.target.value } : x))}
                        placeholder="e.g. Website Design — Phase 1"
                        className="flex-1 px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]" />
                      <input type="number" value={item.amount} onChange={e => setInvoiceLineItems(p => p.map((x, i) => i === idx ? { ...x, amount: e.target.value } : x))}
                        placeholder="Amount"
                        className="w-28 px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none" />
                      {invoiceLineItems.length > 1 && (
                        <button type="button" onClick={() => setInvoiceLineItems(p => p.filter((_, i) => i !== idx))}
                          className="text-gray-300 hover:text-rose-400 cursor-pointer flex-shrink-0">
                          <i className="ri-close-line text-sm"></i>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Show payments toggle */}
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={invoiceShowPayments} onChange={e => setInvoiceShowPayments(e.target.checked)}
                  className="w-3.5 h-3.5 accent-[#1c2b3a]" />
                <span className="text-xs text-gray-600">Include payment history on invoice</span>
              </label>

              {/* Message */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600">Message <span className="text-gray-400 font-normal">(optional note to client)</span></label>
                <textarea value={invoiceForm.message} onChange={e => setIf({ message: e.target.value })} rows={3}
                  placeholder="e.g. Thank you for your continued trust in Huna Creatives. Please find your invoice below."
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a] resize-none" />
              </div>
              {/* Balance summary */}
              <div className="bg-gray-50 rounded-xl p-3 space-y-1 text-xs text-gray-500">
                <div className="flex justify-between"><span>Contract</span><span className="font-medium text-gray-700">{fmt(invoiceModal.contract_price)}</span></div>
                <div className="flex justify-between"><span>Paid</span><span className="font-medium text-emerald-600">{fmt(invoiceModal.hub_project_payments.reduce((s,p)=>s+p.amount,0))}</span></div>
                <div className="flex justify-between border-t border-gray-200 pt-1 mt-1">
                  <span className="font-semibold text-gray-700">Balance</span>
                  <span className="font-bold text-[#1c2b3a]">{fmt(invoiceModal.contract_price - invoiceModal.hub_project_payments.reduce((s,p)=>s+p.amount,0))}</span>
                </div>
              </div>

              {/* Amount to collect */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600">Amount to Request <span className="text-gray-400 font-normal">(what the client owes on this invoice)</span></label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">₱</span>
                  <input type="number" value={invoiceForm.amount_requested} onChange={e => setIf({ amount_requested: e.target.value })}
                    placeholder="e.g. 15000"
                    className="w-full pl-7 pr-3 py-2 text-sm border border-[#1c2b3a] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 font-semibold text-[#111827]" />
                </div>
                <p className="text-[10px] text-gray-400">This is the "Balance Due" shown on the invoice and on the payment page.</p>
              </div>
              {invoiceMsg && (
                <p className={`text-xs font-medium ${invoiceMsg.ok ? 'text-emerald-600' : 'text-red-500'}`}>
                  {invoiceMsg.ok ? <><i className="ri-check-line mr-1"></i>{invoiceMsg.text}</> : invoiceMsg.text}
                </p>
              )}
            </div>
            )}
            <div className="px-5 pb-5 space-y-2">
              {invoiceLocked ? (
                <button onClick={() => setInvoiceModal(null)} className="w-full py-2.5 text-sm bg-[#111827] text-white rounded-lg hover:bg-black cursor-pointer">
                  Close
                </button>
              ) : (
                <>
                  <button
                    onClick={() => void printInvoice(invoiceModal, { due_date: invoiceForm.due_date, invoice_number: invoiceForm.invoice_number, bill_to_name: invoiceForm.bill_to_name, bill_to_address: invoiceForm.bill_to_address, reference: invoiceForm.reference, payment_terms: invoiceForm.payment_terms, message: invoiceForm.message, line_items: invoiceLineItems.filter(i => i.description && i.amount), show_payments: invoiceShowPayments, amount_requested: invoiceForm.amount_requested ? parseFloat(invoiceForm.amount_requested) : undefined })}
                    className="w-full py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <i className="ri-printer-line"></i> Preview / Print
                  </button>
                  <div className="flex gap-2">
                    <button onClick={() => setInvoiceModal(null)} className="flex-1 py-2 text-sm text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">Cancel</button>
                    <button
                      onClick={() => invoiceForm.send_mode === 'schedule' ? scheduleInvoice(invoiceModal) : sendInvoice(invoiceModal)}
                      disabled={invoiceSending || !invoiceForm.email.trim() || (invoiceForm.send_mode === 'schedule' && !invoiceForm.scheduled_for)}
                      className="flex-1 py-2 text-sm bg-[#1c2b3a] text-white rounded-lg hover:bg-[#0f1c28] disabled:opacity-40 cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      {invoiceSending
                        ? <><i className="ri-loader-4-line animate-spin"></i> {invoiceForm.send_mode === 'schedule' ? 'Scheduling…' : 'Sending…'}</>
                        : <><i className={invoiceForm.send_mode === 'schedule' ? 'ri-calendar-schedule-line' : 'ri-mail-send-line'}></i> {invoiceForm.send_mode === 'schedule' ? 'Schedule Invoice' : 'Send Invoice'}</>}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Send receipt modal */}
      {sendReceiptModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center sm:p-4" onClick={() => setSendReceiptModal(null)}>
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-[#111827]">Send Payment Receipt</h3>
                <p className="text-xs text-gray-400 mt-0.5">{fmt(sendReceiptModal.payment.amount)} · {fmtDate(sendReceiptModal.payment.paid_at)}</p>
              </div>
              <button onClick={() => setSendReceiptModal(null)} className="text-gray-400 hover:text-gray-600 cursor-pointer"><i className="ri-close-line text-lg"></i></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600">Send to <span className="text-red-400">*</span></label>
                <input type="email" value={sendReceiptEmail} onChange={e => setSendReceiptEmail(e.target.value)}
                  placeholder="client@email.com" autoFocus
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600">CC <span className="text-gray-400">(optional)</span></label>
                <input type="email" value={sendReceiptCc} onChange={e => setSendReceiptCc(e.target.value)}
                  placeholder="e.g. team@hunacreatives.com"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]" />
              </div>

              {/* Payment summary */}
              <div className="bg-gray-50 rounded-xl p-3 space-y-1.5 text-xs text-gray-500">
                <div className="flex justify-between"><span>Payment</span><span className="font-semibold text-emerald-600">{fmt(sendReceiptModal.payment.amount)}</span></div>
                <div className="flex justify-between"><span>Date</span><span className="font-medium text-gray-700">{fmtDate(sendReceiptModal.payment.paid_at)}</span></div>
                {sendReceiptModal.payment.notes && <div className="flex justify-between"><span>Note</span><span className="text-gray-600">{sendReceiptModal.payment.notes}</span></div>}
                <div className="flex justify-between pt-1 border-t border-gray-200"><span>Remaining balance</span><span className={`font-bold ${sendReceiptModal.project.contract_price - sendReceiptModal.project.hub_project_payments.reduce((s,p)=>s+p.amount,0) <= 0 ? 'text-emerald-600' : 'text-[#1c2b3a]'}`}>{sendReceiptModal.project.contract_price - sendReceiptModal.project.hub_project_payments.reduce((s,p)=>s+p.amount,0) <= 0 ? 'Paid in full' : fmt(sendReceiptModal.project.contract_price - sendReceiptModal.project.hub_project_payments.reduce((s,p)=>s+p.amount,0))}</span></div>
              </div>

              {sendReceiptModal.payment.receipt_url && (
                <div className="flex items-center gap-2 p-2.5 bg-gray-50 rounded-lg">
                  <img src={sendReceiptModal.payment.receipt_url} alt="receipt" className="h-10 w-14 object-cover rounded border border-gray-200 flex-shrink-0" />
                  <p className="text-xs text-gray-500">Receipt image will be included in the email.</p>
                </div>
              )}

              {sendReceiptMsg && (
                <p className={`text-xs font-medium ${sendReceiptMsg.ok ? 'text-emerald-600' : 'text-red-500'}`}>
                  {sendReceiptMsg.ok ? <><i className="ri-check-line mr-1"></i>{sendReceiptMsg.text}</> : sendReceiptMsg.text}
                </p>
              )}
            </div>
            <div className="px-5 pb-5 flex gap-2">
              <button onClick={() => setSendReceiptModal(null)} className="flex-1 py-2.5 text-sm text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">Cancel</button>
              <button onClick={sendReceipt} disabled={sendReceiptSending || !sendReceiptEmail.trim()}
                className="flex-1 py-2.5 text-sm bg-[#1c2b3a] text-white rounded-lg hover:bg-[#0f1c28] disabled:opacity-40 cursor-pointer flex items-center justify-center gap-1.5">
                {sendReceiptSending ? <><i className="ri-loader-4-line animate-spin"></i> Sending…</> : <><i className="ri-mail-send-line"></i> Send Receipt</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Receipt lightbox */}
      {lightboxUrl && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setLightboxUrl(null)}>
          <div className="relative max-w-3xl max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <img src={lightboxUrl} alt="Receipt" className="max-w-full max-h-[85vh] rounded-xl object-contain shadow-2xl" />
            <button onClick={() => setLightboxUrl(null)} className="absolute top-2 right-2 w-8 h-8 bg-black/60 text-white rounded-full flex items-center justify-center hover:bg-black cursor-pointer">
              <i className="ri-close-line text-sm"></i>
            </button>
            <a href={lightboxUrl} target="_blank" rel="noopener noreferrer" className="absolute bottom-2 right-2 flex items-center gap-1.5 px-3 py-1.5 bg-black/60 text-white text-xs rounded-lg hover:bg-black">
              <i className="ri-external-link-line text-xs"></i> Open full size
            </a>
          </div>
        </div>
      )}

      <TaskDetailPanel
        task={detailTask}
        open={detailOpen}
        onClose={() => { setDetailOpen(false); setDetailTask(null); }}
        onSaved={(saved) => {
          setTasks(prev => prev.some(t => t.id === saved.id)
            ? prev.map(t => t.id === saved.id ? { ...t, ...saved } : t)
            : [...prev, saved as ProjectTask]);
          setDetailTask(saved);
          // Refresh comment count for this task
          if (saved.id) supabase.from('hub_project_task_comments').select('task_id').eq('task_id', saved.id)
            .then(({ data }) => setCommentCounts(prev => ({ ...prev, [saved.id]: data?.length ?? prev[saved.id] ?? 0 })));
          refreshWorkspaceActivity();
        }}
        onDeleted={(id) => {
          setTasks(prev => prev.filter(t => t.id !== id));
          setDetailOpen(false);
          setDetailTask(null);
          refreshWorkspaceActivity();
        }}
        onArchived={(id) => {
          setTasks(prev => prev.map(t => t.id === id ? { ...t, archived: true, archived_at: new Date().toISOString() } : t));
          setDetailOpen(false);
          setDetailTask(null);
        }}
        onActivityChange={refreshWorkspaceActivity}
        projectId={activeId ?? 0}
        projectName={activeProject?.project_name ?? 'General'}
        teamMembers={wsTaskTeam.map(u => ({ id: u!.id, full_name: u!.full_name, avatar_url: u!.avatar_url }))}
        canEdit={true}
        currentUserId={hubUser?.id ?? ''}
        currentUserName={hubUser?.full_name ?? 'Admin'}
        currentUserAvatarUrl={hubUser?.avatar_url ?? null}
      />
    </AdminLayout>
  );
}
