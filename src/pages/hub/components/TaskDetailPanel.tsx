import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import HubAvatar from '@/pages/hub/components/HubAvatar';
import { supabase, supabaseUrl_, supabaseAnonKey_ } from '@/lib/supabase';
import { uploadFileToDrive } from '@/lib/driveUpload';
import { createTaskAttachment } from '@/lib/taskAttachments';
import { getPrimaryTaskAssigneeId, getTaskAssigneeIds, normalizeChecklistItems, normalizeTaskAssigneePayload, sameAssigneeIds } from '@/lib/taskAssignments';

// ── Helpers ───────────────────────────────────────────────────────────────────

const LINK_STYLE = 'color:#1d4ed8;text-decoration:underline';
const LINK_ATTRS = `target="_blank" rel="noopener noreferrer" style="${LINK_STYLE}"`;

function autoLinkUrls(text: string): string {
  // Match https?:// URLs or bare www. addresses not already inside an <a> tag
  return text.replace(
    /(?<!href=["'])(?<!")(https?:\/\/[^\s<>"]+|(?<![/\w])www\.[a-zA-Z0-9][^\s<>"]*)/g,
    (match) => {
      const href = match.startsWith('http') ? match : `https://${match}`;
      return `<a href="${href}" ${LINK_ATTRS}>${match}</a>`;
    },
  );
}

function renderCommentBody(body: string): { html: string; isHtml: boolean } {
  const hasHtml = /<[a-z][\s\S]*?>/i.test(body);
  if (hasHtml) {
    const safe = body
      .replace(/\s+on\w+\s*=\s*(["'])[^"']*\1/gi, '')
      .replace(/href\s*=\s*(["'])javascript:[^"']*\1/gi, 'href="#"');
    return {
      html: autoLinkUrls(safe).replace(/(@[\w]+)/g, '<span style="color:#1c2b3a;font-weight:500">$1</span>'),
      isHtml: true,
    };
  }
  const html = body
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/(https?:\/\/[^\s<>"]+|(?<![/\w])www\.[a-zA-Z0-9][^\s<>"]*)/g, (match) => {
      const href = match.startsWith('http') ? match : `https://${match}`;
      return `<a href="${href}" ${LINK_ATTRS}>${match}</a>`;
    })
    .replace(/(@\w+)/g, '<span style="color:#1c2b3a;font-weight:500">$1</span>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/\[color:(#[0-9a-fA-F]{3,6}|\w+)\](.*?)\[\/color\]/g, '<span style="color:$1">$2</span>');
  return { html, isHtml: false };
}

function renderDescription(body: string): string {
  const hasHtml = /<[a-z][\s\S]*?>/i.test(body);
  if (hasHtml) {
    const safe = body
      .replace(/\s+on\w+\s*=\s*(["'])[^"']*\1/gi, '')
      .replace(/href\s*=\s*(["'])javascript:[^"']*\1/gi, 'href="#"')
      // Ensure existing <a> tags open in a new tab
      .replace(/<a\s/gi, '<a target="_blank" rel="noopener noreferrer" ');
    return autoLinkUrls(safe);
  }
  return body
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\n/g, '<br/>')
    .replace(/(https?:\/\/[^\s<>"]+|(?<![/\w])www\.[a-zA-Z0-9][^\s<>"]*)/g, (match) => {
      const href = match.startsWith('http') ? match : `https://${match}`;
      return `<a href="${href}" ${LINK_ATTRS}>${match}</a>`;
    });
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TaskDetailTask {
  id: number;
  project_id: number;
  title: string;
  description: string | null;
  status: 'todo' | 'in_progress' | 'in_review' | 'blocked' | 'done';
  priority: 'low' | 'medium' | 'high';
  assignee_id?: string | null;
  assigned_to?: string | null;
  assignee_ids?: string[] | null;
  due_date: string | null;
  start_date: string | null;
  checklist?: ChecklistItem[] | null;
  color?: string | null;
  hub_users?: { id: string; full_name: string; avatar_url: string | null } | null;
}

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
  detail?: string;
  assignee_id?: string | null;
}

interface Comment {
  id: number;
  user_id: string;
  body: string;
  created_at: string;
  author_name: string | null;
  author_avatar_url: string | null;
  hub_users: { full_name: string; avatar_url: string | null } | null;
  attachment_url: string | null;
  attachment_name: string | null;
  attachment_size: number | null;
  attachment_mime: string | null;
  reactions: Record<string, string[]>;
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
  onArchived?: (taskId: number) => void;
  onActivityChange?: () => void;
  projectId: number;
  projectName?: string;
  teamMembers: TeamMember[];
  canEdit: boolean;
  currentUserId: string;
  currentUserName: string;
  currentUserAvatarUrl?: string | null;
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

function getDriveFileId(url: string | null | undefined) {
  if (!url) return null;
  const fileMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileMatch) return fileMatch[1];
  const idMatch = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idMatch) return idMatch[1];
  return null;
}

function getAttachmentThumbnailUrl(att: Attachment) {
  const driveFileId = getDriveFileId(att.url);
  if (!driveFileId) return null;
  // Drive thumbnail API works cross-origin without auth issues
  return `https://drive.google.com/thumbnail?id=${driveFileId}&sz=w120`;
}

function getAttachmentDownloadUrl(att: Attachment) {
  const driveFileId = getDriveFileId(att.url);
  if (!driveFileId) return att.url;
  return `https://drive.google.com/uc?export=download&id=${driveFileId}`;
}

function getAttachmentExt(name: string | null | undefined) {
  if (!name) return '';
  const parts = name.toLowerCase().split('.');
  return parts.length > 1 ? parts.pop() ?? '' : '';
}

function isImageAttachment(att: Attachment) {
  if (att.mime_type?.startsWith('image/')) return true;
  return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'heic', 'heif'].includes(getAttachmentExt(att.name));
}

function isPdfAttachment(att: Attachment) {
  if (att.mime_type === 'application/pdf') return true;
  return getAttachmentExt(att.name) === 'pdf';
}

function canInlinePreview(att: Attachment) {
  return Boolean(getDriveFileId(att.url)) || isImageAttachment(att) || isPdfAttachment(att);
}

function getDriveEmbedUrl(att: Attachment) {
  const driveFileId = getDriveFileId(att.url);
  if (!driveFileId) return att.url;
  return `https://drive.google.com/file/d/${driveFileId}/preview`;
}

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

function renderAttachmentPreview(att: Attachment) {
  // Always use iframe/embed — Google Drive blocks cross-origin <img> loads
  return (
    <iframe
      src={getDriveEmbedUrl(att)}
      title={att.name}
      className="w-[min(92vw,960px)] h-[80vh] rounded-xl bg-white shadow-2xl"
      allow="autoplay"
    />
  );
}

function Avatar({ name, url, size = 7 }: { name: string; url?: string | null; size?: number }) {
  return <HubAvatar fullName={name} avatarUrl={url} size={`w-${size} h-${size}`} />;
}

function nanoid() {
  return Math.random().toString(36).slice(2, 10);
}

function normalizeRichText(value: string | null | undefined) {
  const trimmed = value?.trim() ?? '';
  if (!trimmed || trimmed === '<br>') return null;
  return trimmed;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function TaskDetailPanel({
  task,
  open,
  onClose,
  onSaved,
  onDeleted,
  onArchived,
  onActivityChange,
  projectId,
  projectName = 'General',
  teamMembers,
  canEdit,
  currentUserId,
  currentUserName,
  currentUserAvatarUrl,
}: Props) {
  const isNew = !task;

  // Form state
  const [title, setTitle]           = useState('');
  const [description, setDesc]      = useState('');
  const [status, setStatus]         = useState<TaskDetailTask['status']>('todo');
  const [priority, setPriority]     = useState<TaskDetailTask['priority']>('medium');
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [dueDate, setDueDate]       = useState('');
  const [startDate, setStartDate]   = useState('');
  const [checklist, setChecklist]   = useState<ChecklistItem[]>([]);
  const [newCheckItem, setNewCheckItem] = useState('');
  const [expandedCheckItems, setExpandedCheckItems] = useState<Set<string>>(new Set());
  const [taskColor, setTaskColor] = useState<string>('');
  const [showColorPicker, setShowColorPicker] = useState(false);

  // Remote data
  const [comments, setComments]     = useState<Comment[]>([]);
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [editingCommentBody, setEditingCommentBody] = useState('');
  const [customFields, setCustomFields] = useState<{id: string; label: string; value: string}[]>([]);
  const [newFieldLabel, setNewFieldLabel] = useState('');
  const [showAddField, setShowAddField] = useState(false);
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [activity, setActivity]     = useState<ActivityItem[]>([]);
  const [watchers, setWatchers]     = useState<string[]>([]);

  // Checklist drag state
  const [dragCheckId, setDragCheckId] = useState<string | null>(null);
  const [dragOverCheckId, setDragOverCheckId] = useState<string | null>(null);

  // UI state
  const [editing, setEditing]       = useState(false);
  const [saving, setSaving]         = useState(false);
  const [saveError, setSaveError]   = useState<string | null>(null);
  const [deleting, setDeleting]     = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [postingComment, setPosting] = useState(false);
  const [commentFile, setCommentFile] = useState<File | null>(null);
  const [commentFileError, setCommentFileError] = useState<string | null>(null);
  const commentFileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading]   = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const uploadProgressTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(null);
  const [commentPreview, setCommentPreview] = useState<{ url: string; name: string; mime: string | null } | null>(null);
  const [pendingAttachment, setPendingAttachment] = useState<File | null>(null);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionStart, setMentionStart] = useState(0);
  const commentRef = useRef<HTMLDivElement>(null);
  const descRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const taskDraft = useCallback(() => ({
    title: title.trim(),
    description: normalizeRichText(descRef.current?.innerHTML ?? description),
    status,
    priority,
    ...normalizeTaskAssigneePayload(assigneeIds),
    due_date: dueDate || null,
    start_date: startDate || null,
    checklist: normalizeChecklistItems(checklist),
    color: taskColor || null,
    meta: customFields.length ? { custom_fields: customFields } : null,
  }), [title, description, status, priority, assigneeIds, dueDate, startDate, checklist, taskColor, customFields]);

  const initialDraft = task
    ? {
        title: task.title.trim(),
        description: normalizeRichText(task.description),
        status: task.status,
        priority: task.priority,
        ...normalizeTaskAssigneePayload(getTaskAssigneeIds(task)),
        due_date: task.due_date ?? null,
        start_date: task.start_date ?? null,
        checklist: normalizeChecklistItems(task.checklist),
        color: task.color ?? null,
        meta: (task as any).meta?.custom_fields?.length ? { custom_fields: (task as any).meta.custom_fields } : null,
      }
    : {
        title: '',
        description: null,
        status: 'todo' as TaskDetailTask['status'],
        priority: 'medium' as TaskDetailTask['priority'],
        ...normalizeTaskAssigneePayload([]),
        due_date: null,
        start_date: null,
        checklist: [],
        color: null,
        meta: null,
      };

  const hasUnsavedChanges = JSON.stringify(taskDraft()) !== JSON.stringify(initialDraft);

  // Populate form when task changes
  useEffect(() => {
    if (!open) return;
    if (task) {
      setTitle(task.title);
      setDesc(task.description ?? '');
      // Sync contenteditable div on next tick
      setTimeout(() => { if (descRef.current) descRef.current.innerHTML = task.description ?? ''; }, 0);
      setStatus(task.status);
      setPriority(task.priority);
      setAssigneeIds(getTaskAssigneeIds(task));
      setDueDate(task.due_date ?? '');
      setStartDate(task.start_date ?? '');
      setChecklist(normalizeChecklistItems(task.checklist));
      setTaskColor(task.color ?? '');
      setCustomFields((task as any).meta?.custom_fields ?? []);
      setShowAddField(false);
      setPendingAttachment(null);
      setEditing(false);
      setConfirmDelete(false);
      setExpandedCheckItems(new Set());
      setShowColorPicker(false);
      fetchTaskData(task.id);
    } else {
      setTitle(''); setDesc(''); setStatus('todo'); setPriority('medium');
      setAssigneeIds([]); setDueDate(''); setStartDate(''); setChecklist([]);
      setComments([]); setAttachments([]); setActivity([]); setWatchers([]);
      setPendingAttachment(null);
      setEditing(true);
    }
  }, [task?.id, open]);

  // Realtime: push new comments from other users into the list live
  useEffect(() => {
    if (!open || !task?.id) return;
    const channel = supabase
      .channel(`task-comments-${task.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'hub_project_task_comments',
        filter: `task_id=eq.${task.id}`,
      }, (payload) => {
        const row = payload.new as any;
        // Skip comments posted by the current user — already added optimistically
        if (row.user_id === currentUserId) return;
        setComments(prev => {
          if (prev.some(c => c.id === row.id)) return prev;
          return [...prev, {
            ...row,
            reactions: row.reactions ?? {},
            hub_users: teamMembers.find(m => m.id === row.user_id)
              ? { full_name: teamMembers.find(m => m.id === row.user_id)!.full_name, avatar_url: teamMembers.find(m => m.id === row.user_id)!.avatar_url ?? null }
              : null,
          }];
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [open, task?.id, currentUserId]);

  useEffect(() => {
    if (!open || !editing || !descRef.current) return;
    descRef.current.innerHTML = description || '';
  }, [editing, open, task?.id]);

  const resetDescriptionEditor = useCallback(() => {
    const originalDescription = task?.description ?? '';
    setDesc(originalDescription);
    if (descRef.current) descRef.current.innerHTML = originalDescription;
  }, [task?.description]);

  const focusDescriptionEditor = useCallback(() => {
    descRef.current?.focus();
  }, []);

  const syncDescriptionEditor = useCallback(() => {
    setDesc(descRef.current?.innerHTML ?? '');
  }, []);

  const applyDescriptionCommand = useCallback((command: string, value?: string) => {
    focusDescriptionEditor();
    document.execCommand(command, false, value);
    syncDescriptionEditor();
  }, [focusDescriptionEditor, syncDescriptionEditor]);

  const applyDescriptionBlock = useCallback((block: 'p' | 'h2' | 'h3') => {
    focusDescriptionEditor();
    document.execCommand('formatBlock', false, block);
    syncDescriptionEditor();
  }, [focusDescriptionEditor, syncDescriptionEditor]);

  const fetchTaskData = useCallback(async (taskId: number) => {
    const [taskRes, commRes, attRes, actRes, watchRes] = await Promise.all([
      supabase.from('hub_project_tasks')
        .select('title, description, status, priority, assigned_to, assignee_ids, due_date, start_date, checklist, color, meta')
        .eq('id', taskId)
        .single(),
      supabase.from('hub_project_task_comments')
        .select('id, user_id, body, created_at, author_name, author_avatar_url, attachment_url, attachment_name, attachment_size, attachment_mime, reactions')
        .eq('task_id', taskId).order('created_at', { ascending: true }),
      supabase.from('hub_project_task_attachments')
        .select('*').eq('task_id', taskId).order('created_at', { ascending: false }),
      supabase.from('hub_project_task_activity')
        .select('id, actor_name, type, description, created_at')
        .eq('task_id', taskId).order('created_at', { ascending: false }).limit(30),
      supabase.from('hub_project_task_watchers')
        .select('user_id').eq('task_id', taskId),
    ]);
    if (taskRes.data) {
      setTitle(taskRes.data.title);
      setDesc(taskRes.data.description ?? '');
      if (descRef.current) descRef.current.innerHTML = taskRes.data.description ?? '';
      setStatus(taskRes.data.status);
      setPriority(taskRes.data.priority);
      setAssigneeIds(getTaskAssigneeIds(taskRes.data));
      setDueDate(taskRes.data.due_date ?? '');
      setStartDate(taskRes.data.start_date ?? '');
      setChecklist(normalizeChecklistItems(taskRes.data.checklist));
      setTaskColor(taskRes.data.color ?? '');
      setCustomFields((taskRes.data as any).meta?.custom_fields ?? []);
    }
    if (commRes.data) {
      // Build user map from teamMembers (already loaded, no RLS issues for contractors)
      const userMap: Record<string, { full_name: string; avatar_url: string | null }> = {};
      for (const m of teamMembers) userMap[m.id] = { full_name: m.full_name, avatar_url: m.avatar_url ?? null };
      setComments(commRes.data.map((c: any) => ({ ...c, reactions: c.reactions ?? {}, hub_users: userMap[c.user_id] ?? null })));
    }
    if (attRes.data)  setAttachments(attRes.data);
    if (actRes.data)  setActivity(actRes.data);
    if (watchRes.data) setWatchers(watchRes.data.map((w: any) => w.user_id));
  }, []);

  const logActivity = useCallback(async (taskId: number, type: string, description: string) => {
    await supabase.from('hub_project_task_activity').insert({
      task_id: taskId, actor_id: currentUserId, actor_name: currentUserName, type, description,
    });
    onActivityChange?.();
  }, [currentUserId, currentUserName, onActivityChange]);

  // ── Save ───────────────────────────────────────────────────────────────────

  const handleSave = async ({ closeAfterSave = false }: { closeAfterSave?: boolean } = {}) => {
    if (!title.trim()) return;
    setSaving(true);
    setSaveError(null);
    try {
      const payload = taskDraft();

      const nextAssigneeIds = getTaskAssigneeIds(payload);
      const assigneeMember = teamMembers.find(m => m.id === (nextAssigneeIds[0] ?? '')) ?? null;
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
        if (pendingAttachment) {
          const attachment = await createTaskAttachment({
            taskId: data.id,
            file: pendingAttachment,
            uploadedBy: currentUserId,
            projectName,
          });
          if (attachment) {
            await logActivity(data.id, 'attachment_added', `added attachment "${pendingAttachment.name}"`);
          }
        }
        await logActivity(data.id, 'created', `created this task`);
        setPendingAttachment(null);
        onSaved({ ...data, hub_users } as TaskDetailTask);
        if (nextAssigneeIds.length > 0) {
          supabase.functions.invoke('notify-task-assigned', {
            body: {
              task_id: data.id,
              task_title: title,
              project_id: data.project_id,
              project_name: projectName,
              assigned_to_ids: nextAssigneeIds,
              assigned_by_name: currentUserName,
            },
          }).catch(() => {});
        }
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
        const previousAssigneeIds = getTaskAssigneeIds(prev);
        if (!sameAssigneeIds(previousAssigneeIds, nextAssigneeIds)) {
          const assigneeNames = nextAssigneeIds
            .map(id => teamMembers.find(m => m.id === id)?.full_name)
            .filter(Boolean);
          await logActivity(prev.id, 'assigned', assigneeNames.length > 0 ? `assigned to ${assigneeNames.join(', ')}` : 'unassigned');
          const addedAssigneeIds = nextAssigneeIds.filter(id => !previousAssigneeIds.includes(id));
          if (addedAssigneeIds.length > 0) {
            supabase.functions.invoke('notify-task-assigned', {
              body: {
                task_id: prev.id,
                task_title: title,
                project_id: prev.project_id,
                project_name: projectName,
                assigned_to_ids: addedAssigneeIds,
                assigned_by_name: currentUserName,
              },
            }).catch(() => {});
          }
        }

        setChecklist(normalizeChecklistItems(data.checklist));
        onSaved({ ...data, hub_users } as TaskDetailTask);
        if (closeAfterSave) onClose();
        else setEditing(false);
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

  const handleArchive = async () => {
    if (!task) return;
    const archived_at = new Date().toISOString();
    await supabase.from('hub_project_tasks').update({ archived: true, archived_at }).eq('id', task.id);
    onArchived?.(task.id);
    onClose();
  };

  // ── Checklist ──────────────────────────────────────────────────────────────

  const addCheckItem = async () => {
    if (!newCheckItem.trim()) return;
    const previous = checklist;
    const updated = [...checklist, { id: nanoid(), text: newCheckItem.trim(), done: false, assignee_id: null }];
    setChecklist(updated);
    setNewCheckItem('');
    if (!task) return;
    try {
      await saveChecklist(updated);
    } catch {
      setChecklist(previous);
    }
  };

  const toggleCheckItem = (id: string) =>
    setChecklist(prev => prev.map(i => i.id === id ? { ...i, done: !i.done } : i));

  const removeCheckItem = async (id: string) => {
    const previous = checklist;
    const updated = checklist.filter(i => i.id !== id);
    setChecklist(updated);
    if (!task) return;
    try {
      await saveChecklist(updated);
    } catch {
      setChecklist(previous);
    }
  };

  const saveChecklist = async (updated: ChecklistItem[]) => {
    if (!task) return;
    const { data, error } = await supabase
      .from('hub_project_tasks')
      .update({ checklist: normalizeChecklistItems(updated) })
      .eq('id', task.id)
      .select('*')
      .single();
    if (error) {
      setSaveError(error.message);
      throw error;
    }
    onSaved({ ...task, ...data } as TaskDetailTask);
  };

  const handleToggleCheck = async (id: string) => {
    const updated = checklist.map(i => i.id === id ? { ...i, done: !i.done } : i);
    setChecklist(updated);
    if (!task) return;
    try {
      await saveChecklist(updated);
    } catch {
      setChecklist(checklist);
    }
  };

  const handleCheckDrop = async (targetId: string) => {
    if (!dragCheckId || dragCheckId === targetId) return;
    const from = checklist.findIndex(i => i.id === dragCheckId);
    const to   = checklist.findIndex(i => i.id === targetId);
    if (from < 0 || to < 0) return;
    const reordered = [...checklist];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    setChecklist(reordered);
    setDragCheckId(null);
    setDragOverCheckId(null);
    if (task) {
      try { await saveChecklist(reordered); } catch { setChecklist(checklist); }
    }
  };

  const requestClose = async () => {
    if (saving) return;
    if (isNew && !title.trim()) {
      onClose();
      return;
    }
    if (canEdit && hasUnsavedChanges) {
      await handleSave({ closeAfterSave: true });
      return;
    }
    onClose();
  };

  // ── Comments ───────────────────────────────────────────────────────────────

  const postComment = async () => {
    const body = commentRef.current?.innerHTML?.trim() || newComment.trim();
    if ((!body || body === '<br>') && !commentFile || !task) return;
    setPosting(true);
    setCommentFileError(null);

    let attachmentUrl: string | null = null;
    let attachmentName: string | null = null;
    let attachmentSize: number | null = null;
    let attachmentMime: string | null = null;

    if (commentFile) {
      try {
        setUploadProgress(5);
        uploadProgressTimer.current = setInterval(() => {
          setUploadProgress(p => (p !== null && p < 88) ? p + 2 : p);
        }, 250);
        attachmentUrl = await uploadFileToDrive(commentFile, 'task_attachment', { project_name: projectName });
        attachmentName = commentFile.name;
        attachmentSize = commentFile.size;
        attachmentMime = commentFile.type || null;
        if (uploadProgressTimer.current) clearInterval(uploadProgressTimer.current);
        setUploadProgress(100);
        await new Promise(r => setTimeout(r, 400));
        setUploadProgress(null);
      } catch (err: any) {
        if (uploadProgressTimer.current) clearInterval(uploadProgressTimer.current);
        setUploadProgress(null);
        setCommentFileError(err.message ?? 'File upload failed.');
        setPosting(false);
        return;
      }
    }

    const { data } = await supabase
      .from('hub_project_task_comments')
      .insert({
        task_id: task.id,
        user_id: currentUserId,
        body: (commentRef.current?.innerHTML?.trim() || newComment).replace(/&nbsp;/g, ' ').replace(/<br\s*\/?>/gi,'\n').trim(),
        author_name: currentUserName,
        author_avatar_url: currentUserAvatarUrl ?? null,
        attachment_url: attachmentUrl,
        attachment_name: attachmentName,
        attachment_size: attachmentSize,
        attachment_mime: attachmentMime,
      })
      .select('id, user_id, body, created_at, author_name, author_avatar_url, attachment_url, attachment_name, attachment_size, attachment_mime')
      .single();
    if (data) {
      const { data: commenter } = await supabase.from('hub_users').select('full_name, avatar_url').eq('id', currentUserId).single();
      const norm = { ...data, reactions: {}, hub_users: commenter ? { full_name: commenter.full_name, avatar_url: commenter.avatar_url ?? null } : { full_name: currentUserName, avatar_url: null } };
      setComments(prev => [...prev, norm]);
      await logActivity(task.id, 'comment_added', 'added a comment');
      if (newComment.includes('@')) {
        fetch(`${supabaseUrl_}/functions/v1/notify-task-mention`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${supabaseAnonKey_}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ comment_id: data.id, task_id: task.id, author_id: currentUserId, author_name: currentUserName, body: newComment.trim(), project_id: task.project_id }),
        }).catch(() => {});
      }
    }
    setNewComment('');
    setCommentFile(null);
    if (commentFileRef.current) commentFileRef.current.value = '';
    if (commentRef.current) commentRef.current.innerHTML = '';
    setPosting(false);
  };

  const driveFileIdFromUrl = (url: string): string | null => {
    const m = url.match(/\/file\/d\/([^/]+)/);
    return m ? m[1] : null;
  };

  const deleteComment = async (commentId: number) => {
    const comment = comments.find(c => c.id === commentId);
    await supabase.from('hub_project_task_comments').delete().eq('id', commentId);
    setComments(prev => prev.filter(c => c.id !== commentId));
    if (comment?.attachment_url) {
      const fileId = driveFileIdFromUrl(comment.attachment_url);
      if (fileId) supabase.functions.invoke('delete-from-drive', { body: { fileId } }).catch(() => {});
    }
  };

  const toggleReaction = async (commentId: number, emoji: string) => {
    if (!currentUserId) return;
    const comment = comments.find(c => c.id === commentId);
    if (!comment) return;
    const current = comment.reactions[emoji] ?? [];
    const hasReacted = current.includes(currentUserId);
    const updated = hasReacted
      ? current.filter(id => id !== currentUserId)
      : [...current, currentUserId];
    const newReactions = { ...comment.reactions, [emoji]: updated };
    if (updated.length === 0) delete newReactions[emoji];
    setComments(prev => prev.map(c => c.id === commentId ? { ...c, reactions: newReactions } : c));
    await supabase.from('hub_project_task_comments').update({ reactions: newReactions }).eq('id', commentId);
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
    const div = commentRef.current;
    if (!div) { setMentionOpen(false); return; }
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      // Go back to find the @ character and replace query with mention
      const node = range.startContainer;
      const offset = range.startOffset;
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent ?? '';
        const atIdx = text.lastIndexOf('@', offset - 1);
        if (atIdx >= 0) {
          const newRange = document.createRange();
          newRange.setStart(node, atIdx);
          newRange.setEnd(node, offset);
          newRange.deleteContents();
          const mention = document.createTextNode(`@${member.full_name.split(' ')[0]} `);
          newRange.insertNode(mention);
          const after = document.createRange();
          after.setStartAfter(mention);
          after.collapse(true);
          sel.removeAllRanges();
          sel.addRange(after);
        }
      }
    }
    setNewComment(div.innerText);
    setMentionOpen(false);
    div.focus();
  };

  const mentionMatches = teamMembers.filter(m =>
    m.full_name.toLowerCase().includes(mentionQuery) && m.id !== currentUserId
  );

  // ── Attachments ────────────────────────────────────────────────────────────

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (isNew) {
      setPendingAttachment(file);
      if (fileRef.current) fileRef.current.value = '';
      return;
    }
    if (!task) return;
    setUploading(true);
    setUploadError(null);
    try {
      const url = await uploadFileToDrive(file, 'task_attachment', { project_name: projectName });
      const { data, error: insertErr } = await supabase
        .from('hub_project_task_attachments')
        .insert({ task_id: task.id, uploaded_by: currentUserId, name: file.name, url, size: file.size, mime_type: file.type })
        .select('*').single();
      if (insertErr) throw new Error(insertErr.message);
      if (data) {
        setAttachments(prev => [data, ...prev]);
        await logActivity(task.id, 'attachment_added', `added attachment "${file.name}"`);
      }
    } catch (err: any) {
      setUploadError(err.message ?? 'Upload failed.');
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const clearPendingAttachment = () => {
    setPendingAttachment(null);
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

  const selectedAssignees = assigneeIds
    .map((id) => teamMembers.find((member) => member.id === id))
    .filter(Boolean) as TeamMember[];
  const sc = STATUS_CFG[status] ?? STATUS_CFG.todo;
  const pc = PRIORITY_CFG[priority] ?? PRIORITY_CFG.medium;

  if (!open) return null;

  return createPortal(
    <>
      {/* Backdrop */}
        <div
        className="fixed inset-0 bg-black/40 z-40 transition-opacity"
        onClick={() => { void requestClose(); }}
      />

      {/* Panel */}
      <div className="fixed right-0 top-0 h-full w-full max-w-[520px] bg-white z-50 flex flex-col shadow-2xl overflow-x-hidden">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="px-5 py-4 flex-shrink-0" style={{ background: taskColor || '#111827' }}>
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              {editing ? (
                <input
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="Task title"
                  className="w-full bg-white/10 text-white placeholder-white/40 rounded-lg px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/50"
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
              {/* Color picker */}
              {(canEdit || isNew) && (
                <div className="relative">
                  <button onClick={() => setShowColorPicker(p => !p)}
                    className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/60 hover:text-white transition-colors cursor-pointer"
                    title="Pick task color">
                    <i className="ri-palette-line text-sm"></i>
                  </button>
                  {showColorPicker && (
                    <div className="absolute right-0 top-10 z-50 bg-white rounded-2xl shadow-2xl border border-gray-100 p-3 w-[200px]">
                      <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mb-2">Task Color</p>
                      <div className="grid grid-cols-5 gap-2 mb-2">
                        {['#111827','#ef4444','#f97316','#eab308','#22c55e','#06b6d4','#3b82f6','#8b5cf6','#ec4899','#6b7280'].map(col => (
                          <button key={col} onClick={() => {
                            setTaskColor(col);
                            setShowColorPicker(false);
                            if (task?.id) {
                              onSaved({ ...task, color: col }); // immediate UI update
                              supabase.from('hub_project_tasks').update({ color: col }).eq('id', task.id)
                                .then(({ error }) => { if (error) setSaveError('Color save failed: ' + error.message); });
                            }
                          }}
                            className={`w-7 h-7 rounded-full border-2 cursor-pointer transition-transform hover:scale-110 ${taskColor === col ? 'border-gray-800 scale-110' : 'border-transparent'}`}
                            style={{ background: col }} />
                        ))}
                      </div>
                      <button onClick={() => {
                        setTaskColor('');
                        setShowColorPicker(false);
                        if (task?.id) {
                          onSaved({ ...task, color: null });
                          supabase.from('hub_project_tasks').update({ color: null }).eq('id', task.id)
                            .then(({ error }) => { if (error) setSaveError('Color save failed: ' + error.message); });
                        }
                      }}
                        className="text-[11px] text-gray-400 hover:text-gray-600 cursor-pointer w-full text-center">Reset to default</button>
                    </div>
                  )}
                </div>
              )}
              {canEdit && !isNew && (
                <button
                  onClick={() => {
                    if (editing) resetDescriptionEditor();
                    setEditing(e => !e);
                  }}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${editing ? 'bg-[#1c2b3a] text-white' : 'bg-white/10 text-white/60 hover:bg-white/20 hover:text-white'}`}>
                  <i className="ri-edit-line text-sm"></i>
                </button>
              )}
              <button onClick={() => { void requestClose(); }} className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/60 hover:text-white transition-colors cursor-pointer">
                <i className="ri-close-line text-base"></i>
              </button>
            </div>
          </div>
        </div>

        {/* ── Body ────────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden">

          {/* Properties */}
          <div className="p-5 space-y-4 border-b border-gray-100">
            <div className="grid grid-cols-2 gap-3">

              {/* Status */}
              <div>
                <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-1.5">Status</p>
                {editing ? (
                  <select value={status} onChange={e => setStatus(e.target.value as TaskDetailTask['status'])}
                    className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 bg-white">
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
                    className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 bg-white">
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
                <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-1.5">Assignees</p>
                {editing ? (
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => setAssigneeIds([])}
                      className={`px-2.5 py-1 text-xs rounded-full border transition-all cursor-pointer ${assigneeIds.length === 0 ? 'bg-gray-800 text-white border-gray-800' : 'border-gray-200 text-gray-400 hover:border-gray-400'}`}
                    >
                      Unassigned
                    </button>
                    {teamMembers.map((member) => {
                      const selected = assigneeIds.includes(member.id);
                      return (
                        <button
                          key={member.id}
                          type="button"
                          onClick={() => setAssigneeIds((prev) => selected ? prev.filter((id) => id !== member.id) : [...prev, member.id])}
                          className={`flex items-center gap-1.5 pl-1.5 pr-2.5 py-1 rounded-full border transition-all cursor-pointer ${selected ? 'border-[#1c2b3a]/50 bg-slate-50' : 'border-gray-200 hover:border-gray-300'}`}
                        >
                          <Avatar name={member.full_name} url={member.avatar_url} size={4} />
                          <span className={`text-xs font-medium ${selected ? 'text-[#1c2b3a]' : 'text-gray-600'}`}>{member.full_name.split(' ')[0]}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  selectedAssignees.length > 0 ? (
                    <div className="flex flex-wrap items-center gap-2">
                      {selectedAssignees.map((member) => (
                        <div key={member.id} className="flex items-center gap-1.5 rounded-full bg-gray-50 px-2 py-1">
                          <Avatar name={member.full_name} url={member.avatar_url} size={5} />
                          <span className="text-xs font-medium text-gray-700">{member.full_name.split(' ')[0]}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-gray-400">Unassigned</span>
                  )
                )}
              </div>

              {/* Due date */}
              <div>
                <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-1.5">Due Date</p>
                {editing ? (
                  <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                    className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 bg-white" />
                ) : (
                  <span className="text-xs text-gray-700">{dueDate ? new Date(dueDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : <span className="text-gray-400">—</span>}</span>
                )}
              </div>

              {/* Start date */}
              <div>
                <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-1.5">Start Date</p>
                {editing ? (
                  <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                    className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 bg-white" />
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
                          className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-medium transition-colors cursor-pointer ${watching ? 'bg-[#1c2b3a] text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
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
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-gray-200 bg-gray-50 px-2 py-2">
                  <button
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); applyDescriptionCommand('bold'); }}
                    className="px-2.5 py-1 text-xs font-semibold text-gray-600 rounded-lg bg-white border border-gray-200 hover:border-gray-300 cursor-pointer"
                  >
                    B
                  </button>
                  <button
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); applyDescriptionCommand('italic'); }}
                    className="px-2.5 py-1 text-xs italic text-gray-600 rounded-lg bg-white border border-gray-200 hover:border-gray-300 cursor-pointer"
                  >
                    I
                  </button>
                  <button
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); applyDescriptionCommand('underline'); }}
                    className="px-2.5 py-1 text-xs underline text-gray-600 rounded-lg bg-white border border-gray-200 hover:border-gray-300 cursor-pointer"
                  >
                    U
                  </button>
                  <button
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); applyDescriptionCommand('insertUnorderedList'); }}
                    className="px-2.5 py-1 text-xs text-gray-600 rounded-lg bg-white border border-gray-200 hover:border-gray-300 cursor-pointer"
                  >
                    List
                  </button>
                  <button
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); applyDescriptionCommand('fontName', 'Georgia'); }}
                    className="px-2.5 py-1 text-xs text-gray-600 rounded-lg bg-white border border-gray-200 hover:border-gray-300 cursor-pointer"
                  >
                    Serif
                  </button>
                  <button
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); applyDescriptionCommand('fontName', 'Arial'); }}
                    className="px-2.5 py-1 text-xs text-gray-600 rounded-lg bg-white border border-gray-200 hover:border-gray-300 cursor-pointer"
                  >
                    Sans
                  </button>
                  <button
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); applyDescriptionCommand('fontSize', '2'); }}
                    className="px-2 py-1 text-[11px] text-gray-600 rounded-lg bg-white border border-gray-200 hover:border-gray-300 cursor-pointer"
                  >
                    Small
                  </button>
                  <button
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); applyDescriptionBlock('p'); }}
                    className="px-2 py-1 text-xs text-gray-600 rounded-lg bg-white border border-gray-200 hover:border-gray-300 cursor-pointer"
                  >
                    Normal
                  </button>
                  <button
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); applyDescriptionCommand('fontSize', '5'); }}
                    className="px-2 py-1 text-xs text-gray-600 rounded-lg bg-white border border-gray-200 hover:border-gray-300 cursor-pointer"
                  >
                    Large
                  </button>
                  <button
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); applyDescriptionBlock('h2'); }}
                    className="px-2 py-1 text-xs text-gray-600 rounded-lg bg-white border border-gray-200 hover:border-gray-300 cursor-pointer"
                  >
                    Title
                  </button>
                  <button
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); applyDescriptionCommand('removeFormat'); }}
                    className="ml-auto px-2.5 py-1 text-xs text-gray-500 rounded-lg hover:text-gray-700 cursor-pointer"
                  >
                    Clear
                  </button>
                </div>
                <div
                  ref={descRef}
                  contentEditable
                  suppressContentEditableWarning
                  onInput={e => setDesc((e.target as HTMLDivElement).innerHTML)}
                  onPaste={async (e) => {
                    const items = Array.from(e.clipboardData?.items ?? []);
                    const imgItem = items.find(i => i.type.startsWith('image/'));
                    if (imgItem) {
                      e.preventDefault();
                      const file = imgItem.getAsFile();
                      if (!file) return;
                      // Insert loading placeholder image
                      const loadingImg = document.createElement('img');
                      loadingImg.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40"><rect width="80" height="40" fill="%23f3f4f6" rx="6"/><text x="50%" y="55%" text-anchor="middle" fill="%239ca3af" font-size="11" font-family="sans-serif">Uploading...</text></svg>';
                      loadingImg.style.borderRadius = '6px';
                      const sel = window.getSelection();
                      if (sel?.rangeCount) sel.getRangeAt(0).insertNode(loadingImg);
                      try {
                        const ext = file.type.split('/')[1] || 'png';
                        const path = `task-images/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
                        const { error } = await supabase.storage.from('task-attachments').upload(path, file, { contentType: file.type });
                        if (error) throw error;
                        const { data } = supabase.storage.from('task-attachments').getPublicUrl(path);
                        loadingImg.src = data.publicUrl;
                        loadingImg.style.maxWidth = '100%';
                        loadingImg.style.borderRadius = '8px';
                        loadingImg.style.border = '1px solid #f3f4f6';
                        loadingImg.style.cursor = 'pointer';
                        loadingImg.onclick = () => window.open(data.publicUrl, '_blank');
                      } catch {
                        loadingImg.remove();
                      }
                      setDesc(descRef.current?.innerHTML ?? '');
                      return;
                    }
                    // HTML img fallback (Monday.com etc.)
                    const htmlItem = items.find(i => i.type === 'text/html');
                    if (htmlItem) {
                      htmlItem.getAsString((html) => {
                        const srcMatch = html.match(/src=["']([^"']+)["']/);
                        if (srcMatch?.[1]?.startsWith('http')) {
                          e.preventDefault();
                          document.execCommand('insertHTML', false, `<img src="${srcMatch[1]}" style="max-width:100%;border-radius:8px;border:1px solid #f3f4f6;cursor:pointer;" onclick="window.open(this.src,'_blank')" />`);
                          setDesc(descRef.current?.innerHTML ?? '');
                        }
                      });
                    }
                  }}
                  data-placeholder="Add a description… (paste images directly)"
                  className="w-full text-sm text-gray-700 border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 bg-white min-h-[120px] empty:before:content-[attr(data-placeholder)] empty:before:text-gray-400"
                />
              </div>
            ) : (
              <div className="text-sm text-gray-600 leading-relaxed [&_img]:max-w-full [&_img]:rounded-lg [&_img]:border [&_img]:border-gray-100 [&_img]:my-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mt-2 [&_h2]:mb-1 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:mt-2 [&_h3]:mb-1">
                {description
                  ? <div dangerouslySetInnerHTML={{ __html: renderDescription(description) }} />
                  : <span className="text-gray-400 italic">No description</span>}
              </div>
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
                    <div
                      key={item.id}
                      className={`group rounded transition-colors ${dragOverCheckId === item.id && dragCheckId !== item.id ? 'bg-slate-50 ring-1 ring-[#1c2b3a]/30' : ''}`}
                      draggable={!!(editing || canEdit)}
                      onDragStart={() => { setDragCheckId(item.id); setDragOverCheckId(null); }}
                      onDragOver={e => { e.preventDefault(); setDragOverCheckId(item.id); }}
                      onDragLeave={() => setDragOverCheckId(null)}
                      onDrop={() => handleCheckDrop(item.id)}
                      onDragEnd={() => { setDragCheckId(null); setDragOverCheckId(null); }}
                    >
                      <div className="flex items-center gap-2.5">
                        {(editing || canEdit) && (
                          <i className="ri-draggable text-gray-300 cursor-grab active:cursor-grabbing flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity -ml-1" />
                        )}
                        <button onClick={() => handleToggleCheck(item.id)} className="flex-shrink-0 cursor-pointer mt-0.5">
                          <i className={`text-base ${item.done ? 'ri-checkbox-circle-fill text-emerald-500' : 'ri-checkbox-blank-circle-line text-gray-300 hover:text-gray-400'}`}></i>
                        </button>
                        <span className={`flex-1 text-sm ${item.done ? 'line-through text-gray-400' : 'text-gray-700'}`}>{item.text}</span>
                        {item.assignee_id && (
                          <div className="flex items-center gap-1 rounded-full bg-slate-50 px-1.5 py-1">
                            <Avatar
                              name={teamMembers.find((member) => member.id === item.assignee_id)?.full_name ?? '?'}
                              url={teamMembers.find((member) => member.id === item.assignee_id)?.avatar_url}
                              size={4}
                            />
                            <span className="text-[10px] font-medium text-[#1c2b3a]">
                              {(teamMembers.find((member) => member.id === item.assignee_id)?.full_name ?? '').split(' ')[0] || 'Assigned'}
                            </span>
                          </div>
                        )}
                        {(editing || canEdit) && (
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                            <button onClick={() => setExpandedCheckItems(prev => { const n = new Set(prev); n.has(item.id) ? n.delete(item.id) : n.add(item.id); return n; })}
                              className="text-gray-300 hover:text-sky-500 cursor-pointer" title="Add details">
                              <i className="ri-file-text-line text-xs"></i>
                            </button>
                            <button onClick={() => removeCheckItem(item.id)}
                              className="text-gray-300 hover:text-rose-500 cursor-pointer">
                              <i className="ri-delete-bin-line text-xs"></i>
                            </button>
                          </div>
                        )}
                      </div>
                      {expandedCheckItems.has(item.id) && (
                        <div className="ml-7 mt-1">
                          <select
                            value={item.assignee_id ?? ''}
                            onChange={async (e) => {
                              const updated = checklist.map((checkItem) => checkItem.id === item.id ? { ...checkItem, assignee_id: e.target.value || null } : checkItem);
                              setChecklist(updated);
                              try {
                                await saveChecklist(updated);
                              } catch {
                                setChecklist(checklist);
                              }
                            }}
                            className="mb-2 w-full text-xs text-gray-600 bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#1c2b3a]/30"
                          >
                            <option value="">No contractor assigned</option>
                            {teamMembers.map((member) => (
                              <option key={member.id} value={member.id}>{member.full_name}</option>
                            ))}
                          </select>
                          <textarea
                            value={item.detail ?? ''}
                            onChange={async e => {
                              const updated = checklist.map(i => i.id === item.id ? { ...i, detail: e.target.value } : i);
                              setChecklist(updated);
                              try {
                                await saveChecklist(updated);
                              } catch {
                                setChecklist(checklist);
                              }
                            }}
                            placeholder="Add details..."
                            rows={2}
                            className="w-full text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#1c2b3a]/30 resize-none"
                          />
                        </div>
                      )}
                      {!expandedCheckItems.has(item.id) && item.detail && (
                        <p className="ml-7 text-xs text-gray-400 italic mt-0.5 truncate cursor-pointer"
                           onClick={() => setExpandedCheckItems(prev => { const n = new Set(prev); n.add(item.id); return n; })}>
                          {item.detail}
                        </p>
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
                  className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 bg-white"
                />
                <button onClick={addCheckItem}
                  className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm text-gray-600 transition-colors cursor-pointer">
                  Add
                </button>
              </div>
            )}
          </div>

          {/* Attachments */}
          {/* Custom Fields */}
          {(canEdit || customFields.length > 0) && (
          <div className="p-5 border-b border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">Custom Fields</p>
              {canEdit && <button onClick={() => setShowAddField(v => !v)} className="text-[11px] text-[#1c2b3a] hover:underline cursor-pointer">+ Add field</button>}
            </div>
            <div className="space-y-2">
              {customFields.map(f => {
                const isUrl = /^https?:\/\//.test(f.value) || /^www\./i.test(f.value) || /\.com(\/|\s|\?|#|$)/i.test(f.value);
                const hrefVal = isUrl && !f.value.startsWith('http') ? 'https://' + f.value : f.value;
                const isEditing = editingFieldId === f.id;
                const saveField = () => {
                  setEditingFieldId(null);
                  if (task?.id) supabase.from('hub_project_tasks').update({ meta: { custom_fields: customFields } }).eq('id', task.id)
                    .select('*').single().then(({ data }) => { if (data) onSaved({ ...task, ...data } as TaskDetailTask); });
                };
                return (
                  <div key={f.id} className="flex items-center gap-2 group">
                    <span className="text-xs text-gray-500 font-medium w-28 flex-shrink-0 truncate">{f.label}</span>
                    {isEditing ? (
                      <div className="flex-1 flex gap-1">
                        <input autoFocus value={f.value} onChange={e => setCustomFields(customFields.map(x => x.id === f.id ? { ...x, value: e.target.value } : x))}
                          onKeyDown={e => { if (e.key === 'Enter') saveField(); if (e.key === 'Escape') setEditingFieldId(null); }}
                          className="flex-1 text-xs border border-[#1c2b3a]/50 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#1c2b3a]/30" />
                        <button onClick={saveField} className="px-2 py-1 bg-[#1c2b3a] text-white text-[10px] rounded-lg cursor-pointer">Save</button>
                      </div>
                    ) : (
                      <div className="flex-1 flex items-center gap-1.5 min-w-0">
                        {isUrl ? (
                          <a href={hrefVal} target="_blank" rel="noopener noreferrer"
                            className="text-xs text-sky-600 hover:underline truncate flex items-center gap-1">
                            <i className="ri-link text-[10px] flex-shrink-0"></i>{f.value}
                          </a>
                        ) : (
                          <span className="text-xs text-gray-700 truncate">{f.value || <span className="text-gray-300 italic">Empty</span>}</span>
                        )}
                        {canEdit && (
                          <button onClick={() => setEditingFieldId(f.id)} className="text-gray-300 hover:text-gray-600 cursor-pointer transition-all flex-shrink-0">
                            <i className="ri-pencil-line text-[10px]"></i>
                          </button>
                        )}
                      </div>
                    )}
                    {canEdit && !isEditing && (
                      <button onClick={() => {
                        const updated = customFields.filter(x => x.id !== f.id);
                        setCustomFields(updated);
                        if (task?.id) supabase.from('hub_project_tasks').update({ meta: { custom_fields: updated } }).eq('id', task.id)
                        .select('*').single().then(({ data }) => { if (data) onSaved({ ...task, ...data } as TaskDetailTask); });
                      }} className="text-gray-300 hover:text-rose-500 cursor-pointer transition-all flex-shrink-0">
                        <i className="ri-delete-bin-line text-[10px]"></i>
                      </button>
                    )}
                  </div>
                );
              })}
              {showAddField && canEdit && (
                <div className="flex gap-2 mt-2">
                  <input value={newFieldLabel} onChange={e => setNewFieldLabel(e.target.value)}
                    placeholder="Field name..." onKeyDown={e => { if (e.key === 'Enter' && newFieldLabel.trim()) {
                      const id = Math.random().toString(36).slice(2);
                      const updated = [...customFields, { id, label: newFieldLabel.trim(), value: '' }];
                      setCustomFields(updated);
                      setNewFieldLabel(''); setShowAddField(false);
                      setEditingFieldId(id); // immediately open for editing
                      if (task?.id) supabase.from('hub_project_tasks').update({ meta: { custom_fields: updated } }).eq('id', task.id)
                        .select('*').single().then(({ data }) => { if (data) onSaved({ ...task, ...data } as TaskDetailTask); });
                    }}}
                    className="flex-1 text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#1c2b3a]/30" autoFocus />
                  <button onClick={() => {
                    if (!newFieldLabel.trim()) return;
                    const id = Math.random().toString(36).slice(2);
                    const updated = [...customFields, { id, label: newFieldLabel.trim(), value: '' }];
                    setCustomFields(updated);
                    setNewFieldLabel(''); setShowAddField(false);
                    setEditingFieldId(id);
                    if (task?.id) supabase.from('hub_project_tasks').update({ meta: { custom_fields: updated } }).eq('id', task.id)
                        .select('*').single().then(({ data }) => { if (data) onSaved({ ...task, ...data } as TaskDetailTask); });
                  }} className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs cursor-pointer">Add</button>
                </div>
              )}
            </div>
          </div>
          )}

          <div className="p-5 border-b border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">Attachments</p>
              {(canEdit || isNew) && (
                <button onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="flex items-center gap-1 text-[11px] text-[#1c2b3a] hover:underline disabled:opacity-40 cursor-pointer">
                  <i className="ri-upload-2-line text-xs"></i>
                  {isNew ? (pendingAttachment ? 'Change file' : 'Add file') : (uploading ? 'Uploading…' : 'Upload')}
                </button>
              )}
              <input ref={fileRef} type="file" className="hidden" onChange={handleFileUpload} />
            </div>
            {uploadError && (
              <p className="text-xs text-red-500 mb-2">{uploadError}</p>
            )}
            {isNew ? (
              pendingAttachment ? (
                <div className="flex items-center gap-2.5 p-2.5 bg-gray-50 rounded-xl">
                  <div className="w-8 h-8 rounded-lg bg-gray-200 flex items-center justify-center flex-shrink-0 overflow-hidden">
                    <i className={`${pendingAttachment.type.startsWith('image/') ? 'ri-image-line' : 'ri-file-line'} text-gray-500 text-sm`}></i>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-700 truncate">{pendingAttachment.name}</p>
                    <p className="text-[10px] text-gray-400">{fmtBytes(pendingAttachment.size)} · Uploads when the task is created</p>
                  </div>
                  <button
                    type="button"
                    onClick={clearPendingAttachment}
                    className="text-gray-300 hover:text-rose-500 transition-colors cursor-pointer"
                  >
                    <i className="ri-delete-bin-line text-sm"></i>
                  </button>
                </div>
              ) : (
                <p className="text-xs text-gray-400 italic">Optional. Add a file now and it will upload when the task is created.</p>
              )
            ) : attachments.length === 0 ? (
              <p className="text-xs text-gray-400 italic">No attachments yet</p>
            ) : (
              <div className="space-y-2">
                {attachments.map(att => {
                  const isImg = isImageAttachment(att);
                  const canPreview = canInlinePreview(att);
                  return (
                    <div key={att.id} className="flex items-center gap-2.5 p-2.5 bg-gray-50 rounded-xl group">
                      <div className="w-8 h-8 rounded-lg bg-gray-200 flex items-center justify-center flex-shrink-0 overflow-hidden">
                        {isImg && getAttachmentThumbnailUrl(att)
                          ? <img src={getAttachmentThumbnailUrl(att)!} alt={att.name} className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display='none'; }} />
                          : <i className={`${isImg ? 'ri-image-line text-sky-500' : 'ri-file-line text-gray-500'} text-sm`}></i>}
                      </div>
                      <div className="flex-1 min-w-0">
                        {canPreview ? (
                          <button
                            type="button"
                            onClick={() => setPreviewAttachment(att)}
                            className="text-xs font-medium text-gray-700 hover:text-[#1c2b3a] truncate block cursor-pointer"
                          >
                            {att.name}
                          </button>
                        ) : (
                          <a href={att.url} target="_blank" rel="noopener noreferrer"
                            className="text-xs font-medium text-gray-700 hover:text-[#1c2b3a] truncate block">{att.name}</a>
                        )}
                        <p className="text-[10px] text-gray-400">
                          {att.size ? `${fmtBytes(att.size)} · ` : ''}
                          {new Date(att.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}{' '}
                          {new Date(att.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                        </p>
                      </div>
                      {canPreview && (
                        <button
                          type="button"
                          onClick={() => setPreviewAttachment(att)}
                          className="text-[10px] text-sky-600 hover:text-sky-700 cursor-pointer whitespace-nowrap"
                        >
                          Preview
                        </button>
                      )}
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

          {previewAttachment && (
            <div
              className="fixed inset-0 z-[70] bg-black/80 flex items-center justify-center p-4"
              onClick={() => setPreviewAttachment(null)}
            >
              <div className="relative max-w-5xl max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
                {renderAttachmentPreview(previewAttachment)}
                <button
                  type="button"
                  onClick={() => setPreviewAttachment(null)}
                  className="absolute top-2 right-2 w-8 h-8 bg-black/60 text-white rounded-full flex items-center justify-center hover:bg-black cursor-pointer"
                >
                  <i className="ri-close-line text-sm"></i>
                </button>
                <div className="absolute bottom-2 right-2 flex items-center gap-2">
                  <a
                    href={getAttachmentDownloadUrl(previewAttachment)}
                    download
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-black/60 text-white text-xs rounded-lg hover:bg-black"
                  >
                    <i className="ri-download-line text-xs"></i>
                    Download
                  </a>
                  <a
                    href={previewAttachment.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-black/60 text-white text-xs rounded-lg hover:bg-black"
                  >
                    <i className="ri-external-link-line text-xs"></i>
                    Open in Drive
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* Comment attachment preview modal */}
          {commentPreview && (() => {
            const fid = driveFileIdFromUrl(commentPreview.url);
            const isImage = commentPreview.mime?.startsWith('image/');
            const previewSrc = fid ? `https://drive.google.com/file/d/${fid}/preview` : commentPreview.url;
            const downloadUrl = fid ? `https://drive.google.com/uc?export=download&id=${fid}` : commentPreview.url;
            return (
              <div className="fixed inset-0 z-[80] bg-black/80 flex items-center justify-center p-4"
                onClick={() => setCommentPreview(null)}>
                <div className="relative w-full max-w-4xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                  <button type="button" onClick={() => setCommentPreview(null)}
                    className="absolute top-2 right-2 z-10 w-8 h-8 bg-black/60 text-white rounded-full flex items-center justify-center hover:bg-black cursor-pointer">
                    <i className="ri-close-line text-sm"></i>
                  </button>
                  {isImage && fid ? (
                    <img src={`https://drive.google.com/thumbnail?id=${fid}&sz=w1600`} alt={commentPreview.name}
                      className="w-full max-h-[80vh] object-contain rounded-lg" />
                  ) : (
                    <iframe src={previewSrc} title={commentPreview.name}
                      className="w-full rounded-lg bg-white" style={{ height: '80vh' }} />
                  )}
                  <div className="flex items-center justify-between mt-2 px-1">
                    <span className="text-white/70 text-xs truncate">{commentPreview.name}</span>
                    <div className="flex items-center gap-2">
                      <a href={downloadUrl} target="_blank" rel="noopener noreferrer" download
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-black/60 text-white text-xs rounded-lg hover:bg-black">
                        <i className="ri-download-line text-xs"></i> Download
                      </a>
                      <a href={commentPreview.url} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-black/60 text-white text-xs rounded-lg hover:bg-black">
                        <i className="ri-external-link-line text-xs"></i> Open in Drive
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

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
                    <Avatar name={c.hub_users?.full_name ?? c.author_name ?? '?'} url={c.hub_users?.avatar_url ?? c.author_avatar_url} size={7} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-semibold text-gray-800">{c.hub_users?.full_name ?? c.author_name ?? 'Unknown'}</span>
                        <span className="text-[10px] text-gray-400">{timeAgo(c.created_at)}</span>
                        {c.user_id === currentUserId && (
                          <div className="ml-auto flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-all">
                            <button onClick={() => { setEditingCommentId(c.id); setEditingCommentBody(c.body); }}
                              className="text-gray-300 hover:text-sky-500 text-xs cursor-pointer"><i className="ri-pencil-line"></i></button>
                            <button onClick={() => deleteComment(c.id)}
                              className="text-gray-300 hover:text-rose-500 text-xs cursor-pointer"><i className="ri-delete-bin-line"></i></button>
                          </div>
                        )}
                      </div>
                      {editingCommentId === c.id ? (
                        <div className="space-y-1.5">
                          <textarea value={editingCommentBody} onChange={e => setEditingCommentBody(e.target.value)} rows={2}
                            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#1c2b3a]/30 resize-none" />
                          <div className="flex gap-2">
                            <button onClick={async () => {
                              await supabase.from('hub_project_task_comments').update({ body: editingCommentBody }).eq('id', c.id);
                              setComments(prev => prev.map(x => x.id === c.id ? { ...x, body: editingCommentBody } : x));
                              setEditingCommentId(null);
                            }} className="px-3 py-1 text-xs bg-[#111827] text-white rounded-lg cursor-pointer">Save</button>
                            <button onClick={() => setEditingCommentId(null)} className="px-3 py-1 text-xs text-gray-400 hover:text-gray-600 cursor-pointer">Cancel</button>
                          </div>
                        </div>
                      ) : (
                      <>
                        {c.body && <div
                          className={`text-sm text-gray-700 leading-relaxed ${renderCommentBody(c.body).isHtml ? '[&_a]:text-blue-600 [&_a]:underline [&_ul]:list-disc [&_ul]:ml-5 [&_ol]:list-decimal [&_ol]:ml-5 [&_li]:my-0.5' : 'whitespace-pre-wrap'}`}
                          dangerouslySetInnerHTML={{ __html: renderCommentBody(c.body).html }}
                        />}
                        {c.attachment_url && (() => {
                          const fid = driveFileIdFromUrl(c.attachment_url);
                          const isImage = c.attachment_mime?.startsWith('image/');
                          const thumbUrl = fid ? `https://drive.google.com/thumbnail?id=${fid}&sz=w400` : null;
                          const downloadUrl = fid ? `https://drive.google.com/uc?export=download&id=${fid}` : c.attachment_url;
                          return (
                            <div className="mt-1.5 space-y-1">
                              {isImage && thumbUrl && (
                                <button onClick={() => setCommentPreview({ url: c.attachment_url!, name: c.attachment_name ?? 'Image', mime: c.attachment_mime ?? null })}
                                  className="block rounded-lg overflow-hidden border border-gray-200 hover:opacity-90 transition-opacity max-w-[220px]">
                                  <img src={thumbUrl} alt={c.attachment_name ?? ''} className="w-full object-cover" />
                                </button>
                              )}
                              <div className="inline-flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 max-w-xs">
                                <i className={`${isImage ? 'ri-image-line' : 'ri-file-line'} text-gray-400 text-sm flex-shrink-0`}></i>
                                <span className="text-xs text-gray-700 truncate flex-1">{c.attachment_name}</span>
                                {c.attachment_size && <span className="text-[10px] text-gray-400 flex-shrink-0">{(c.attachment_size / 1024).toFixed(0)} KB</span>}
                                <button onClick={() => setCommentPreview({ url: c.attachment_url!, name: c.attachment_name ?? 'File', mime: c.attachment_mime ?? null })}
                                  title="Preview" className="ml-1 text-gray-400 hover:text-sky-500 transition-colors cursor-pointer flex-shrink-0">
                                  <i className="ri-eye-line text-xs"></i>
                                </button>
                                <a href={downloadUrl} target="_blank" rel="noopener noreferrer" download
                                  title="Download" className="text-gray-400 hover:text-emerald-500 transition-colors flex-shrink-0">
                                  <i className="ri-download-line text-xs"></i>
                                </a>
                              </div>
                            </div>
                          );
                        })()}
                        {/* Reactions */}
                        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                          {(['❤️', '👍', '😂'] as const).map(emoji => {
                            const reactors = c.reactions[emoji] ?? [];
                            const hasReacted = reactors.includes(currentUserId ?? '');
                            if (reactors.length === 0 && !hasReacted) return null;
                            return (
                              <button
                                key={emoji}
                                onClick={() => toggleReaction(c.id, emoji)}
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-all cursor-pointer ${hasReacted ? 'bg-rose-50 border-rose-200 text-rose-600' : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-gray-300'}`}
                              >
                                <span>{emoji}</span>
                                <span className="font-medium">{reactors.length}</span>
                              </button>
                            );
                          })}
                          {/* Add reaction button */}
                          <div className="relative group/react">
                            <button className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] border border-dashed border-gray-200 text-gray-300 hover:border-gray-300 hover:text-gray-500 transition-all cursor-pointer">
                              <i className="ri-emotion-line text-xs"></i>
                            </button>
                            <div className="absolute bottom-full mb-1 left-0 hidden group-hover/react:flex bg-white border border-gray-200 rounded-xl shadow-lg z-10 p-1.5 gap-0.5">
                              {(['❤️', '👍', '😂'] as const).map(emoji => (
                                <button
                                  key={emoji}
                                  onClick={() => toggleReaction(c.id, emoji)}
                                  className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-base cursor-pointer transition-colors"
                                >
                                  {emoji}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {/* Comment input */}
              <div className="flex gap-2.5 relative">
                <Avatar name={currentUserName} url={currentUserAvatarUrl} size={7} />
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
                  <div
                    ref={commentRef}
                    contentEditable
                    suppressContentEditableWarning
                    onInput={e => {
                      const text = (e.target as HTMLDivElement).innerText;
                      setNewComment(text);
                      // @mention detection
                      const sel = window.getSelection();
                      if (sel && sel.rangeCount > 0) {
                        const range = sel.getRangeAt(0);
                        const textBefore = range.startContainer.textContent?.slice(0, range.startOffset) ?? '';
                        const atIdx = textBefore.lastIndexOf('@');
                        if (atIdx >= 0 && !textBefore.slice(atIdx + 1).includes(' ')) {
                          setMentionOpen(true);
                          setMentionQuery(textBefore.slice(atIdx + 1));
                          setMentionStart(atIdx);
                        } else {
                          setMentionOpen(false);
                        }
                      }
                    }}
                    onPaste={e => {
                      e.preventDefault();
                      const text = e.clipboardData.getData('text/plain');
                      document.execCommand('insertText', false, text);
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey && !mentionOpen) {
                        e.preventDefault();
                        postComment();
                      }
                      if (e.key === 'Escape') setMentionOpen(false);
                    }}
                    data-placeholder="Add a comment… (@mention)"
                    className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 bg-white min-h-[60px] break-all empty:before:content-[attr(data-placeholder)] empty:before:text-gray-400"
                  />
                  {/* Selected file preview */}
                  {commentFile && (
                    <div className="mt-1.5 bg-gray-50 border border-gray-200 rounded-lg overflow-hidden">
                      <div className="flex items-center gap-2 px-2.5 py-1.5">
                        <i className={`${commentFile.type.startsWith('image/') ? 'ri-image-line' : 'ri-file-line'} text-gray-400 text-sm flex-shrink-0`}></i>
                        <span className="text-xs text-gray-600 truncate flex-1">{commentFile.name}</span>
                        <span className="text-[10px] text-gray-400 flex-shrink-0">{(commentFile.size / 1024).toFixed(0)} KB</span>
                        {uploadProgress !== null
                          ? <span className="text-[10px] text-[#1c2b3a] flex-shrink-0 font-medium">{uploadProgress}%</span>
                          : <button type="button" onClick={() => { setCommentFile(null); setCommentFileError(null); if (commentFileRef.current) commentFileRef.current.value = ''; }}
                              className="text-gray-300 hover:text-red-400 flex-shrink-0 cursor-pointer">
                              <i className="ri-close-line text-sm"></i>
                            </button>
                        }
                      </div>
                      {uploadProgress !== null && (
                        <div className="h-0.5 bg-gray-200">
                          <div className="h-full bg-[#1c2b3a] transition-all duration-300 ease-out"
                            style={{ width: `${uploadProgress}%` }} />
                        </div>
                      )}
                    </div>
                  )}
                  {commentFileError && <p className="text-xs text-red-500 mt-1">{commentFileError}</p>}
                  {/* Color dots + attach + send button */}
                  <div className="flex items-center gap-1.5 mt-1.5">
                    {['#e53935','#1e88e5','#43a047','#fb8c00','#8e24aa','#111827'].map(col => (
                      <button key={col} type="button" title="Color selected text"
                        onMouseDown={e => {
                          e.preventDefault();
                          document.execCommand('foreColor', false, col);
                          commentRef.current?.focus();
                        }}
                        className="w-4 h-4 rounded-full cursor-pointer hover:scale-125 transition-transform flex-shrink-0 border border-gray-100"
                        style={{ background: col }} />
                    ))}
                    <button type="button" title="Attach file" onClick={() => commentFileRef.current?.click()}
                      className="ml-auto text-gray-400 hover:text-[#1c2b3a] cursor-pointer transition-colors">
                      <i className="ri-attachment-2 text-base"></i>
                    </button>
                    <input ref={commentFileRef} type="file" className="hidden" onChange={e => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      if (f.size > 100 * 1024 * 1024) {
                        setCommentFileError(`File too large (max 100 MB). This file is ${(f.size / 1024 / 1024).toFixed(1)} MB.`);
                        return;
                      }
                      setCommentFile(f);
                      setCommentFileError(null);
                    }} />
                    <button onClick={postComment} disabled={postingComment || (!newComment.trim() && !commentFile)}
                      className="w-7 h-7 bg-[#1c2b3a] disabled:opacity-30 rounded-lg flex items-center justify-center cursor-pointer flex-shrink-0">
                      <i className={`${postingComment ? 'ri-loader-4-line animate-spin' : 'ri-send-plane-fill'} text-white text-xs`}></i>
                    </button>
                  </div>
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
        {(editing || isNew || hasUnsavedChanges) && (
          <div className="border-t border-gray-100 px-5 py-4 flex items-center gap-3 bg-white flex-shrink-0">
            {!isNew && !confirmDelete && (
              <div className="flex items-center gap-3">
                <button onClick={handleArchive}
                  className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-amber-500 transition-colors cursor-pointer">
                  <i className="ri-archive-line text-sm"></i>
                  Archive
                </button>
                <button onClick={() => setConfirmDelete(true)}
                  className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-rose-500 transition-colors cursor-pointer">
                  <i className="ri-delete-bin-line text-sm"></i>
                  Delete
                </button>
              </div>
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
                    <button onClick={() => {
                      resetDescriptionEditor();
                      setEditing(false);
                    }}
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
