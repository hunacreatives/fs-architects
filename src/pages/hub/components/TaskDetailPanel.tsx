import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '@/lib/supabase';
import { uploadFileToDrive } from '@/lib/driveUpload';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TaskDetailTask {
  id: number;
  project_id: number;
  title: string;
  description: string | null;
  status: 'todo' | 'in_progress' | 'in_review' | 'blocked' | 'done';
  priority: 'low' | 'medium' | 'high';
  assignee_id: string | null;
  due_date: string | null;
  start_date: string | null;
  checklist?: ChecklistItem[] | null;
  hub_users?: { id: string; full_name: string; avatar_url: string | null } | null;
}

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

interface Comment {
  id: number;
  user_id: string;
  body: string;
  created_at: string;
  hub_users: { full_name: string; avatar_url: string | null } | null;
}

interface Attachment {
  id: number;
  task_id: number;
  uploaded_by: string | null;
  name: string;
  url: string;
  size: number | null;
  mime_type: string | null;
  created_at: string;
}

interface ActivityItem {
  id: number;
  actor_name: string;
  type: string;
  description: string;
  created_at: string;
}

export interface TeamMember {
  id: string;
  full_name: string;
  avatar_url?: string | null;
}

interface Props {
  task: TaskDetailTask | null;
  open: boolean;
  onClose: () => void;
  onSaved: (task: TaskDetailTask) => void;
  onDeleted: (taskId: number) => void;
  projectId: number;
  projectName?: string;
  teamMembers: TeamMember[];
  canEdit: boolean;
  currentUserId: string;
  currentUserName: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_CFG = {
  todo:        { label: 'To Do',       icon: 'ri-checkbox-blank-circle-line', bg: 'bg-gray-100',    text: 'text-gray-600',    dot: 'bg-gray-400' },
  in_progress: { label: 'In Progress', icon: 'ri-loader-2-line',              bg: 'bg-sky-100',     text: 'text-sky-700',     dot: 'bg-sky-500' },
  in_review:   { label: 'In Review',   icon: 'ri-eye-line',                   bg: 'bg-purple-100',  text: 'text-purple-700',  dot: 'bg-purple-500' },
  blocked:     { label: 'Blocked',     icon: 'ri-indeterminate-circle-line',  bg: 'bg-rose-100',    text: 'text-rose-700',    dot: 'bg-rose-500' },
  done:        { label: 'Done',        icon: 'ri-checkbox-circle-fill',       bg: 'bg-emerald-100', text: 'text-emerald-700', dot: 'bg-emerald-500' },
} as const;

const PRIORITY_CFG = {
  high:   { label: 'High',   cls: 'bg-rose-50 text-rose-600 border-rose-200',   dot: 'bg-rose-500' },
  medium: { label: 'Medium', cls: 'bg-amber-50 text-amber-600 border-amber-200', dot: 'bg-amber-400' },
  low:    { label: 'Low',    cls: 'bg-gray-50 text-gray-500 border-gray-200',   dot: 'bg-gray-400' },
} as const;

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function fmtBytes(n: number | null) {
  if (!n) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}

function Avatar({ name, url, size = 7 }: { name: string; url?: string | null; size?: number }) {
  const sz = `w-${size} h-${size}`;
  if (url) return <img src={url} alt={name} className={`${sz} rounded-full object-cover object-top flex-shrink-0`} />;
  return (
    <div className={`${sz} rounded-full bg-[#FF6B35] flex items-center justify-center flex-shrink-0`}>
      <span className="text-white font-bold" style={{ fontSize: size * 1.8 }}>{name[0].toUpperCase()}</span>
    </div>
  );
}

function nanoid() {
  return Math.random().toString(36).slice(2, 10);
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function TaskDetailPanel({
  task,
  open,
  onClose,
  onSaved,
  onDeleted,
  projectId,
  projectName = 'General',
  teamMembers,
  canEdit,
  currentUserId,
  currentUserName,
}: Props) {
  const isNew = !task;

  // Form state
  const [title, setTitle]           = useState('');
  const [description, setDesc]      = useState('');
  const [status, setStatus]         = useState<TaskDetailTask['status']>('todo');
  const [priority, setPriority]     = useState<TaskDetailTask['priority']>('medium');
  const [assigneeId, setAssigneeId] = useState<string>('');
  const [dueDate, setDueDate]       = useState('');
  const [startDate, setStartDate]   = useState('');
  const [checklist, setChecklist]   = useState<ChecklistItem[]>([]);
  const [newCheckItem, setNewCheckItem] = useState('');

  // Remote data
  const [comments, setComments]     = useState<Comment[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [activity, setActivity]     = useState<ActivityItem[]>([]);
  const [watchers, setWatchers]     = useState<string[]>([]);

  // UI state
  const [editing, setEditing]       = useState(false);
  const [saving, setSaving]         = useState(false);
  const [saveError, setSaveError]   = useState<string | null>(null);
  const [deleting, setDeleting]     = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [postingComment, setPosting] = useState(false);
  const [uploading, setUploading]   = useState(false);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionStart, setMentionStart] = useState(0);
  const commentRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Populate form when task changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return;
    if (task) {
      setTitle(task.title);
      setDesc(task.description ?? '');
      setStatus(task.status);
      setPriority(task.priority);
      setAssigneeId(task.assignee_id ?? '');
      setDueDate(task.due_date ?? '');
      setStartDate(task.start_date ?? '');
      setChecklist(task.checklist ?? []);
      setEditing(false);
      setConfirmDelete(false);
      fetchTaskData(task.id);
    } else {
      setTitle(''); setDesc(''); setStatus('todo'); setPriority('medium');
      setAssigneeId(''); setDueDate(''); setStartDate(''); setChecklist([]);
      setComments([]); setAttachments([]); setActivity([]); setWatchers([]);
      setEditing(true);
    }
  }, [task?.id, open]);

  const fetchTaskData = useCallback(async (taskId: number) => {
    const [commRes, attRes, actRes, watchRes] = await Promise.all([
      supabase.from('hub_project_task_comments')
        .select('id, user_id, body, created_at, hub_users(full_name, avatar_url)')
        .eq('task_id', taskId).order('created_at', { ascending: true }),
      supabase.from('hub_project_task_attachments')
        .select('*').eq('task_id', taskId).order('created_at', { ascending: false }),
      supabase.from('hub_project_task_activity')
        .select('id, actor_name, type, description, created_at')
        .eq('task_id', taskId).order('created_at', { ascending: false }).limit(30),
      supabase.from('hub_project_task_watchers')
        .select('user_id').eq('task_id', taskId),
    ]);
    if (commRes.data) setComments(commRes.data.map((c: any) => ({ ...c, hub_users: Array.isArray(c.hub_users) ? c.hub_users[0] : c.hub_users })));
    if (attRes.data)  setAttachments(attRes.data);
    if (actRes.data)  setActivity(actRes.data);
    if (watchRes.data) setWatchers(watchRes.data.map((w: any) => w.user_id));
  }, []);

  const logActivity = useCallback(async (taskId: number, type: string, description: string) => {
    await supabase.from('hub_project_task_activity').insert({
      task_id: taskId, actor_id: currentUserId, actor_name: currentUserName, type, description,
    });
  }, [currentUserId, currentUserName]);

  // ── Save ───────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    setSaveError(null);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        status,
        priority,
        assigned_to: assigneeId || null,
        due_date: dueDate || null,
        start_date: startDate || null,
        checklist,
      };

      const assigneeMember = teamMembers.find(m => m.id === assigneeId) ?? null;
      const hub_users = assigneeMember
        ? { id: assigneeMember.id, full_name: assigneeMember.full_name, avatar_url: assigneeMember.avatar_url ?? null }
        : null;

      if (isNew) {
        const { data, error } = await supabase
          .from('hub_project_tasks')
          .insert({ ...payload, project_id: projectId })
          .select('*')
          .single();
        if (error) throw error;
        await logActivity(data.id, 'created', `created this task`);
        onSaved({ ...data, hub_users } as TaskDetailTask);
        onClose();
      } else {
        const prev = task!;
        const { data, error } = await supabase
          .from('hub_project_tasks')
          .update(payload)
          .eq('id', prev.id)
          .select('*')
          .single();
        if (error) throw error;

        // Log meaningful changes
        if (prev.status !== status)
          await logActivity(prev.id, 'status_change', `changed status from ${prev.status.replace('_', ' ')} to ${status.replace('_', ' ')}`);
        if (prev.assignee_id !== (assigneeId || null)) {
          const assignee = teamMembers.find(m => m.id === assigneeId);
          await logActivity(prev.id, 'assigned', assignee ? `assigned to ${assignee.full_name}` : 'unassigned');
        }

        setChecklist(data.checklist ?? []);
        setEditing(false);
        onSaved({ ...data, hub_users } as TaskDetailTask);
        fetchTaskData(prev.id);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : (err as { message?: string })?.message ?? 'Failed to save task';
      setSaveError(msg);
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ─────────────────────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!task) return;
    setDeleting(true);
    await supabase.from('hub_project_tasks').delete().eq('id', task.id);
    onDeleted(task.id);
    onClose();
    setDeleting(false);
  };

  // ── Checklist ──────────────────────────────────────────────────────────────

  const addCheckItem = () => {
    if (!newCheckItem.trim()) return;
    setChecklist(prev => [...prev, { id: nanoid(), text: newCheckItem.trim(), done: false }]);
    setNewCheckItem('');
  };

  const removeCheckItem = (id: string) =>
    setChecklist(prev => prev.filter(i => i.id !== id));

  const saveChecklist = async (updated: ChecklistItem[]) => {
    if (!task) return;
    await supabase.from('hub_project_tasks').update({ checklist: updated }).eq('id', task.id);
  };

  const handleToggleCheck = (id: string) => {
    const updated = checklist.map(i => i.id === id ? { ...i, done: !i.done } : i);
    setChecklist(updated);
    if (task) saveChecklist(updated);
  };

  // ── Comments ───────────────────────────────────────────────────────────────

  const postComment = async () => {
    if (!newComment.trim() || !task) return;
    setPosting(true);
    const { data } = await supabase
      .from('hub_project_task_comments')
      .insert({ task_id: task.id, user_id: currentUserId, body: newComment.trim() })
      .select('id, user_id, body, created_at, hub_users(full_name, avatar_url)')
      .single();
    if (data) {
      const norm = { ...data, hub_users: Array.isArray(data.hub_users) ? data.hub_users[0] : data.hub_users };
      setComments(prev => [...prev, norm]);
      await logActivity(task.id, 'comment_added', `added a comment`);
    }
    setNewComment('');
    setPosting(false);
  };

  const deleteComment = async (commentId: number) => {
    await supabase.from('hub_project_task_comments').delete().eq('id', commentId);
    setComments(prev => prev.filter(c => c.id !== commentId));
  };

  // @mention handling
  const handleCommentInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setNewComment(val);
    const cursor = e.target.selectionStart;
    const before = val.slice(0, cursor);
    const atIdx = before.lastIndexOf('@');
    if (atIdx >= 0 && !before.slice(atIdx).includes(' ')) {
      setMentionQuery(before.slice(atIdx + 1).toLowerCase());
      setMentionStart(atIdx);
      setMentionOpen(true);
    } else {
      setMentionOpen(false);
    }
  };

  const insertMention = (member: TeamMember) => {
    const before = newComment.slice(0, mentionStart);
    const after = newComment.slice(commentRef.current?.selectionStart ?? newComment.length);
    setNewComment(`${before}@${member.full_name.split(' ')[0]} ${after}`);
    setMentionOpen(false);
  };

  const mentionMatches = teamMembers.filter(m =>
    m.full_name.toLowerCase().includes(mentionQuery) && m.id !== currentUserId
  );

  // ── Attachments ────────────────────────────────────────────────────────────

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !task) return;
    setUploading(true);
    const url = await uploadFileToDrive(file, 'task_attachment', { project_name: projectName });
    if (url) {
      const { data } = await supabase
        .from('hub_project_task_attachments')
        .insert({ task_id: task.id, uploaded_by: currentUserId, name: file.name, url, size: file.size, mime_type: file.type })
        .select('*').single();
      if (data) {
        setAttachments(prev => [data, ...prev]);
        await logActivity(task.id, 'attachment_added', `added attachment "${file.name}"`);
      }
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const deleteAttachment = async (att: Attachment) => {
    await supabase.from('hub_project_task_attachments').delete().eq('id', att.id);
    setAttachments(prev => prev.filter(a => a.id !== att.id));
  };

  // ── Watchers ───────────────────────────────────────────────────────────────

  const toggleWatcher = async (userId: string) => {
    if (!task) return;
    if (watchers.includes(userId)) {
      await supabase.from('hub_project_task_watchers').delete().eq('task_id', task.id).eq('user_id', userId);
      setWatchers(prev => prev.filter(w => w !== userId));
    } else {
      await supabase.from('hub_project_task_watchers').insert({ task_id: task.id, user_id: userId });
      setWatchers(prev => [...prev, userId]);
    }
  };

  // ── Checklist progress ─────────────────────────────────────────────────────
  const checkDone = checklist.filter(i => i.done).length;
  const checkPct  = checklist.length > 0 ? Math.round((checkDone / checklist.length) * 100) : 0;

  const assignee = teamMembers.find(m => m.id === assigneeId);
  const sc = STATUS_CFG[status] ?? STATUS_CFG.todo;
  const pc = PRIORITY_CFG[priority] ?? PRIORITY_CFG.medium;

  if (!open) return null;

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40 transition-opacity"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed right-0 top-0 h-full w-full max-w-[520px] bg-white z-50 flex flex-col shadow-2xl">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="bg-[#111827] px-5 py-4 flex-shrink-0">
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              {editing ? (
                <input
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="Task title"
                  className="w-full bg-white/10 text-white placeholder-white/40 rounded-lg px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/50"
                  autoFocus={isNew}
                />
              ) : (
                <h2 className="text-white font-bold text-base leading-snug">{title}</h2>
              )}
              <div className="flex items-center gap-2 mt-2">
                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold ${sc.bg} ${sc.text}`}>
                  <i className={`${sc.icon} text-[11px]`}></i>
                  {sc.label}
                </span>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${pc.cls}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${pc.dot}`}></span>
                  {pc.label}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {canEdit && !isNew && (
                <button
                  onClick={() => setEditing(e => !e)}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${editing ? 'bg-[#FF6B35] text-white' : 'bg-white/10 text-white/60 hover:bg-white/20 hover:text-white'}`}>
                  <i className="ri-edit-line text-sm"></i>
                </button>
              )}
              <button onClick={onClose} className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/60 hover:text-white transition-colors cursor-pointer">
                <i className="ri-close-line text-base"></i>
              </button>
            </div>
          </div>
        </div>

        {/* ── Body ────────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">

          {/* Properties */}
          <div className="p-5 space-y-4 border-b border-gray-100">
            <div className="grid grid-cols-2 gap-3">

              {/* Status */}
              <div>
                <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-1.5">Status</p>
                {editing ? (
                  <select value={status} onChange={e => setStatus(e.target.value as TaskDetailTask['status'])}
                    className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/30 bg-white">
                    {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                ) : (
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold ${sc.bg} ${sc.text}`}>
                    <i className={`${sc.icon} text-xs`}></i>{sc.label}
                  </span>
                )}
              </div>

              {/* Priority */}
              <div>
                <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-1.5">Priority</p>
                {editing ? (
                  <select value={priority} onChange={e => setPriority(e.target.value as TaskDetailTask['priority'])}
                    className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/30 bg-white">
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                ) : (
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border ${pc.cls}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${pc.dot}`}></span>{pc.label}
                  </span>
                )}
              </div>

              {/* Assignee */}
              <div>
                <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-1.5">Assignee</p>
                {editing ? (
                  <select value={assigneeId} onChange={e => setAssigneeId(e.target.value)}
                    className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/30 bg-white">
                    <option value="">Unassigned</option>
                    {teamMembers.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                  </select>
                ) : (
                  <div className="flex items-center gap-2">
                    {assignee ? (
                      <>
                        <Avatar name={assignee.full_name} url={assignee.avatar_url} size={6} />
                        <span className="text-xs font-medium text-gray-700">{assignee.full_name.split(' ')[0]}</span>
                      </>
                    ) : (
                      <span className="text-xs text-gray-400">Unassigned</span>
                    )}
                  </div>
                )}
              </div>

              {/* Due date */}
              <div>
                <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-1.5">Due Date</p>
                {editing ? (
                  <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                    className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/30 bg-white" />
                ) : (
                  <span className="text-xs text-gray-700">{dueDate ? new Date(dueDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : <span className="text-gray-400">—</span>}</span>
                )}
              </div>

              {/* Start date */}
              <div>
                <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-1.5">Start Date</p>
                {editing ? (
                  <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                    className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/30 bg-white" />
                ) : (
                  <span className="text-xs text-gray-700">{startDate ? new Date(startDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : <span className="text-gray-400">—</span>}</span>
                )}
              </div>

              {/* Watchers */}
              {!isNew && (
                <div className="col-span-2">
                  <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-1.5">Watchers</p>
                  <div className="flex items-center flex-wrap gap-1.5">
                    {teamMembers.map(m => {
                      const watching = watchers.includes(m.id);
                      return (
                        <button key={m.id} onClick={() => toggleWatcher(m.id)}
                          title={m.full_name}
                          className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-medium transition-colors cursor-pointer ${watching ? 'bg-[#FF6B35] text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                          <Avatar name={m.full_name} url={m.avatar_url} size={4} />
                          {m.full_name.split(' ')[0]}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Description */}
          <div className="p-5 border-b border-gray-100">
            <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-2">Description</p>
            {editing ? (
              <textarea
                value={description}
                onChange={e => setDesc(e.target.value)}
                placeholder="Add a description…"
                rows={4}
                className="w-full text-sm text-gray-700 border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/30 resize-none bg-white"
              />
            ) : (
              <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">
                {description || <span className="text-gray-400 italic">No description</span>}
              </p>
            )}
          </div>

          {/* Checklist */}
          <div className="p-5 border-b border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">Checklist</p>
                {checklist.length > 0 && (
                  <span className="text-[10px] text-gray-400">{checkDone}/{checklist.length} · {checkPct}%</span>
                )}
              </div>
            </div>
            {checklist.length > 0 && (
              <div className="mb-3">
                <div className="h-1 bg-gray-100 rounded-full overflow-hidden mb-3">
                  <div className="h-full bg-emerald-400 rounded-full transition-all" style={{ width: `${checkPct}%` }} />
                </div>
                <div className="space-y-1.5">
                  {checklist.map(item => (
                    <div key={item.id} className="flex items-center gap-2.5 group">
                      <button onClick={() => handleToggleCheck(item.id)} className="flex-shrink-0 cursor-pointer">
                        <i className={`text-base ${item.done ? 'ri-checkbox-circle-fill text-emerald-500' : 'ri-checkbox-blank-circle-line text-gray-300 hover:text-gray-400'}`}></i>
                      </button>
                      <span className={`flex-1 text-sm ${item.done ? 'line-through text-gray-400' : 'text-gray-700'}`}>{item.text}</span>
                      {(editing || canEdit) && (
                        <button onClick={() => removeCheckItem(item.id)}
                          className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-rose-500 transition-all cursor-pointer">
                          <i className="ri-delete-bin-line text-xs"></i>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {(canEdit || isNew) && (
              <div className="flex gap-2">
                <input
                  value={newCheckItem}
                  onChange={e => setNewCheckItem(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCheckItem(); } }}
                  placeholder="Add item…"
                  className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/30 bg-white"
                />
                <button onClick={addCheckItem}
                  className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm text-gray-600 transition-colors cursor-pointer">
                  Add
                </button>
              </div>
            )}
          </div>

          {/* Attachments */}
          {!isNew && (
            <div className="p-5 border-b border-gray-100">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">Attachments</p>
                {canEdit && (
                  <button onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                    className="flex items-center gap-1 text-[11px] text-[#FF6B35] hover:underline disabled:opacity-40 cursor-pointer">
                    <i className="ri-upload-2-line text-xs"></i>
                    {uploading ? 'Uploading…' : 'Upload'}
                  </button>
                )}
                <input ref={fileRef} type="file" className="hidden" onChange={handleFileUpload} />
              </div>
              {attachments.length === 0 ? (
                <p className="text-xs text-gray-400 italic">No attachments yet</p>
              ) : (
                <div className="space-y-2">
                  {attachments.map(att => {
                    const isImg = att.mime_type?.startsWith('image/');
                    return (
                      <div key={att.id} className="flex items-center gap-2.5 p-2.5 bg-gray-50 rounded-xl group">
                        <div className="w-8 h-8 rounded-lg bg-gray-200 flex items-center justify-center flex-shrink-0 overflow-hidden">
                          {isImg
                            ? <img src={att.url} alt={att.name} className="w-full h-full object-cover" />
                            : <i className="ri-file-line text-gray-500 text-sm"></i>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <a href={att.url} target="_blank" rel="noopener noreferrer"
                            className="text-xs font-medium text-gray-700 hover:text-[#FF6B35] truncate block">{att.name}</a>
                          {att.size && <p className="text-[10px] text-gray-400">{fmtBytes(att.size)}</p>}
                        </div>
                        <button onClick={() => deleteAttachment(att)}
                          className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-rose-500 transition-all cursor-pointer">
                          <i className="ri-delete-bin-line text-sm"></i>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Comments */}
          {!isNew && (
            <div className="p-5 border-b border-gray-100">
              <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-3">
                Comments {comments.length > 0 && <span className="text-gray-300">· {comments.length}</span>}
              </p>
              <div className="space-y-4 mb-4">
                {comments.length === 0 && <p className="text-xs text-gray-400 italic">No comments yet</p>}
                {comments.map(c => (
                  <div key={c.id} className="flex gap-2.5 group">
                    <Avatar name={c.hub_users?.full_name ?? '?'} url={c.hub_users?.avatar_url} size={7} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-semibold text-gray-800">{c.hub_users?.full_name ?? 'Unknown'}</span>
                        <span className="text-[10px] text-gray-400">{timeAgo(c.created_at)}</span>
                        {c.user_id === currentUserId && (
                          <button onClick={() => deleteComment(c.id)}
                            className="ml-auto opacity-0 group-hover:opacity-100 text-gray-300 hover:text-rose-500 text-xs transition-all cursor-pointer">
                            <i className="ri-delete-bin-line"></i>
                          </button>
                        )}
                      </div>
                      <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                        {c.body.split(/(@\w+)/g).map((part, i) =>
                          part.startsWith('@')
                            ? <span key={i} className="text-[#FF6B35] font-medium">{part}</span>
                            : part
                        )}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              {/* Comment input */}
              <div className="flex gap-2.5 relative">
                <Avatar name={currentUserName} size={7} />
                <div className="flex-1 relative">
                  {mentionOpen && mentionMatches.length > 0 && (
                    <div className="absolute bottom-full mb-1 left-0 bg-white border border-gray-200 rounded-xl shadow-lg z-10 min-w-[160px] overflow-hidden">
                      {mentionMatches.map(m => (
                        <button key={m.id} onClick={() => insertMention(m)}
                          className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-gray-50 cursor-pointer">
                          <Avatar name={m.full_name} url={m.avatar_url} size={5} />
                          {m.full_name.split(' ')[0]}
                        </button>
                      ))}
                    </div>
                  )}
                  <textarea
                    ref={commentRef}
                    value={newComment}
                    onChange={handleCommentInput}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey && !mentionOpen) {
                        e.preventDefault();
                        postComment();
                      }
                      if (e.key === 'Escape') setMentionOpen(false);
                    }}
                    placeholder="Add a comment… (@mention)"
                    rows={2}
                    className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/30 resize-none bg-white"
                  />
                  <button onClick={postComment} disabled={postingComment || !newComment.trim()}
                    className="absolute right-2 bottom-2 w-7 h-7 bg-[#FF6B35] disabled:opacity-30 rounded-lg flex items-center justify-center cursor-pointer">
                    <i className="ri-send-plane-fill text-white text-xs"></i>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Activity */}
          {!isNew && activity.length > 0 && (
            <div className="p-5">
              <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-3">Activity</p>
              <div className="space-y-2.5">
                {activity.map(a => (
                  <div key={a.id} className="flex items-start gap-2.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-gray-300 mt-1.5 flex-shrink-0"></div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-600">
                        <span className="font-semibold text-gray-800">{a.actor_name.split(' ')[0]}</span>
                        {' '}{a.description}
                      </p>
                      <p className="text-[10px] text-gray-400 mt-0.5">{timeAgo(a.created_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        {(editing || isNew) && (
          <div className="border-t border-gray-100 px-5 py-4 flex items-center gap-3 bg-white flex-shrink-0">
            {!isNew && !confirmDelete && (
              <button onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-rose-500 transition-colors cursor-pointer">
                <i className="ri-delete-bin-line text-sm"></i>
                Delete
              </button>
            )}
            {confirmDelete && (
              <div className="flex items-center gap-2 flex-1">
                <span className="text-xs text-rose-600 font-medium">Delete this task?</span>
                <button onClick={handleDelete} disabled={deleting}
                  className="px-3 py-1.5 bg-rose-500 text-white text-xs rounded-lg hover:bg-rose-600 disabled:opacity-40 cursor-pointer">
                  {deleting ? 'Deleting…' : 'Yes, delete'}
                </button>
                <button onClick={() => setConfirmDelete(false)}
                  className="px-3 py-1.5 bg-gray-100 text-gray-600 text-xs rounded-lg hover:bg-gray-200 cursor-pointer">
                  Cancel
                </button>
              </div>
            )}
            {!confirmDelete && (
              <div className="flex flex-col gap-2 ml-auto items-end">
                {saveError && (
                  <p className="text-xs text-red-500">{saveError}</p>
                )}
                <div className="flex gap-2">
                  {!isNew && (
                    <button onClick={() => setEditing(false)}
                      className="px-4 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm hover:bg-gray-50 transition-colors cursor-pointer">
                      Cancel
                    </button>
                  )}
                  <button onClick={handleSave} disabled={saving || !title.trim()}
                    className="px-5 py-2.5 bg-[#111827] text-white rounded-xl text-sm font-semibold hover:bg-gray-800 disabled:opacity-40 transition-colors cursor-pointer">
                    {saving ? 'Saving…' : isNew ? 'Create Task' : 'Save Changes'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>,
    document.body
  );
}
