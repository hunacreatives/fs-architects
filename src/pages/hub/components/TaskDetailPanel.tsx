import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '@/lib/supabase';
import { uploadFileToDrive } from '@/lib/driveUpload';
import { createTaskAttachment } from '@/lib/taskAttachments';
import { getTaskAssigneeIds, normalizeChecklistItems, normalizeTaskAssigneePayload, sameAssigneeIds } from '@/lib/taskAssignments';
import { useDemo } from '@/contexts/DemoContext';
import HubAvatar from '@/pages/hub/components/HubAvatar';
import CommentEditor, { type CommentEditorHandle } from '@/pages/hub/components/CommentEditor';
import { loadTeams, teamMeta, type TeamMeta } from '@/lib/teams';

function fmtLogDate(d: string | null): string {
  if (!d) return 'none';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function Avatar({ name, url, size = 7 }: { name: string; url?: string | null; size?: number }) {
  return <HubAvatar fullName={name} avatarUrl={url} size={`w-${size} h-${size}`} />;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const QUICK_REACTIONS = ['👍', '❤️', '😂', '🎉', '😮', '🔥', '👀', '✅', '🙏', '👏', '💯', '😢'];

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

function commentEditableToBody(html: string): string {
  return html
    .replace(/&nbsp;/g, ' ')
    .replace(/<\/(div|p)>/gi, '\n')
    .replace(/<(div|p)[^>]*>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Stored bodies are newline-delimited text (possibly with inline tags); Tiptap
// needs paragraph-wrapped HTML to seed the edit-in-place editor.
function bodyToEditorHTML(body: string): string {
  const normalized = /<\/?(div|p)[^>]*>/i.test(body) ? commentEditableToBody(body) : body;
  return `<p>${normalized.replace(/\n/g, '<br>')}</p>`;
}

function sanitizeHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<\/?(iframe|object|embed|base|meta|link|form|input|textarea|select)[^>]*>/gi, '')
    .replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>'"]+)/gi, '')
    .replace(/(href|src|action)\s*=\s*(?:"(?:javascript|data):[^"]*"|'(?:javascript|data):[^']*'|(?:javascript|data):\S*)/gi, '$1="#"');
}

function renderCommentBody(rawBody: string): { html: string; isHtml: boolean } {
  // Older comments may have stray <div>/<p> wrappers left over from a contentEditable
  // save-path bug; normalize those to real newlines before deciding how to render.
  const body = /<\/?(div|p)[^>]*>/i.test(rawBody) ? commentEditableToBody(rawBody) : rawBody;
  const hasHtml = /<[a-z][\s\S]*?>/i.test(body);
  if (hasHtml) {
    const safe = sanitizeHtml(body).replace(/\n/g, '<br/>');
    return {
      html: autoLinkUrls(safe).replace(/(@[\w]+)/g, '<span style="color:#1c2b3a;font-weight:500">$1</span>'),
      isHtml: true,
    };
  }
  const html = body
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\n/g, '<br/>')
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
  // The description always comes from a contentEditable div's innerHTML, so
  // even a plain one-liner with no formatting tags is still real HTML (e.g.
  // "FF&E" is serialized as "FF&amp;E"). Checking for tags alone missed that
  // case and re-escaped the already-encoded "&", producing a visible "&amp;".
  // Also match a bare HTML entity so untagged-but-encoded text isn't escaped
  // twice.
  const hasHtml = /<[a-z][\s\S]*?>|&[a-zA-Z#][a-zA-Z0-9]*;/i.test(body);
  if (hasHtml) {
    const safe = sanitizeHtml(body).replace(/<a\s/gi, '<a target="_blank" rel="noopener noreferrer" ');
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
  team?: string | null;
  hours_spent?: number | null;
  due_date: string | null;
  start_date: string | null;
  checklist?: ChecklistItem[] | null;
  color?: string | null;
  meta?: { custom_fields?: { id: string; label: string; value: string }[]; blocked_reason?: string | null } | null;
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
  attachments: CommentAttachment[] | null;
  reactions: Record<string, string[]>;
  seen_by: string[];
}

interface CommentAttachment {
  url: string;
  name: string;
  size: number | null;
  mime: string | null;
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
  onOpenProject?: (projectId: number) => void;
  projectId: number;
  projectName?: string;
  projects?: { id: number; project_name: string; client_name: string; project_type: 'client' | 'internal' }[];
  initialDueDate?: string | null;
  initialAssigneeIds?: string[] | null;
  initialTitle?: string;
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

// RAW camera formats — browsers can't render these as <img>/thumbnails even
// though their mime type often starts with "image/", so they must be treated
// as a generic downloadable file instead of an inline preview.
const RAW_IMAGE_EXTENSIONS = ['dng', 'cr2', 'cr3', 'nef', 'arw', 'raf', 'orf', 'rw2', 'srw', 'pef'];

function isRawImageFile(name: string | null | undefined) {
  return RAW_IMAGE_EXTENSIONS.includes(getAttachmentExt(name));
}

function isImageAttachment(att: Attachment) {
  if (isRawImageFile(att.name)) return false;
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


function nanoid() {
  return Math.random().toString(36).slice(2, 10);
}

function normalizeRichText(value: string | null | undefined) {
  const trimmed = value?.trim() ?? '';
  if (!trimmed || trimmed === '<br>') return null;
  return trimmed.replace(/&nbsp;/g, ' ');
}

type TaskDraftSource = Pick<TaskDetailTask, 'title' | 'description' | 'status' | 'priority' | 'due_date' | 'start_date'> & {
  assigned_to?: string | null;
  assignee_id?: string | null;
  assignee_ids?: string[] | null;
  team?: string | null;
  hours_spent?: number | null;
  checklist?: ChecklistItem[] | null;
  color?: string | null;
  meta?: { custom_fields?: { id: string; label: string; value: string }[]; blocked_reason?: string | null } | null;
};

function buildTaskMetaPayload(
  customFields: { id: string; label: string; value: string }[],
  status: TaskDetailTask['status'],
  blockedReason: string,
) {
  const meta: { custom_fields?: typeof customFields; blocked_reason?: string } = {};
  if (customFields.length) meta.custom_fields = customFields;
  if (status === 'blocked' && blockedReason.trim()) meta.blocked_reason = blockedReason.trim();
  return Object.keys(meta).length ? meta : null;
}

function buildTaskDraftSnapshot(task: TaskDraftSource) {
  return {
    title: task.title.trim(),
    description: normalizeRichText(task.description),
    status: task.status,
    priority: task.priority,
    ...normalizeTaskAssigneePayload(getTaskAssigneeIds(task)),
    team: task.team ?? null,
    hours_spent: task.hours_spent ?? null,
    due_date: task.due_date ?? null,
    start_date: task.start_date ?? null,
    checklist: normalizeChecklistItems(task.checklist),
    color: task.color ?? null,
    meta: buildTaskMetaPayload(task.meta?.custom_fields ?? [], task.status, task.meta?.blocked_reason ?? ''),
  };
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
  onOpenProject,
  projectId,
  projectName = 'General',
  projects,
  initialDueDate = null,
  initialAssigneeIds = null,
  initialTitle = '',
  teamMembers,
  canEdit,
  currentUserId,
  currentUserName,
  currentUserAvatarUrl,
}: Props) {
  const isNew = !task;
  const { isDemo } = useDemo();

  // Form state
  const [title, setTitle]           = useState('');
  const [description, setDesc]      = useState('');
  const [status, setStatus]         = useState<TaskDetailTask['status']>('todo');
  const [priority, setPriority]     = useState<TaskDetailTask['priority']>('medium');
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [taskTeam, setTaskTeam] = useState<string>('');
  const [teamsList, setTeamsList] = useState<TeamMeta[]>([]);
  useEffect(() => { loadTeams().then(setTeamsList); }, []);
  const [taskHours, setTaskHours] = useState<string>('');
  const [dueDate, setDueDate]       = useState('');
  const [startDate, setStartDate]   = useState('');
  const [checklist, setChecklist]   = useState<ChecklistItem[]>([]);
  const [newCheckItem, setNewCheckItem] = useState('');
  const [expandedCheckItems, setExpandedCheckItems] = useState<Set<string>>(new Set());
  const [taskColor, setTaskColor] = useState<string>('');
  const [blockedReason, setBlockedReason] = useState('');
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);

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
  const [commentFiles, setCommentFiles] = useState<File[]>([]);
  const [commentFileError, setCommentFileError] = useState<string | null>(null);
  const commentFileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading]   = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const uploadProgressTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(null);
  const [commentPreview, setCommentPreview] = useState<{ url: string; name: string; mime: string | null } | null>(null);
  const [pendingAttachment, setPendingAttachment] = useState<File | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<number>(projectId);
  const commentEditorRef = useRef<CommentEditorHandle>(null);
  const editEditorRef = useRef<CommentEditorHandle>(null);
  const [reactionPickerFor, setReactionPickerFor] = useState<number | null>(null);
  const [showActivity, setShowActivity] = useState(false);
  const descRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // Task currently shown in the panel — a fetch response for any other task
  // must be discarded, or it overwrites the form the user is looking at.
  const activeTaskIdRef = useRef<number | null>(null);
  // Snapshot of the data last loaded from the DB for the open task. This is
  // the baseline for "did the user change anything" — comparing against the
  // task prop instead can flag stale list data as user edits and silently
  // save them on close, attributed to a user who touched nothing.
  const baselineDraftRef = useRef<{ taskId: number; json: string } | null>(null);
  const lastFetchedTaskRef = useRef<({ id: number } & Partial<TaskDetailTask>) | null>(null);

  const taskDraft = useCallback(() => ({
    title: title.trim(),
    description: normalizeRichText(descRef.current?.innerHTML ?? description),
    status,
    priority,
    ...normalizeTaskAssigneePayload(assigneeIds),
    team: taskTeam || null,
    hours_spent: taskHours.trim() ? parseFloat(taskHours) : null,
    due_date: dueDate || null,
    start_date: startDate || null,
    checklist: normalizeChecklistItems(checklist),
    color: taskColor || null,
    meta: buildTaskMetaPayload(customFields, status, blockedReason),
  }), [title, description, status, priority, assigneeIds, taskTeam, taskHours, dueDate, startDate, checklist, taskColor, customFields, blockedReason]);

  const initialDraft = task
    ? buildTaskDraftSnapshot(task)
    : {
        title: '',
        description: null,
        status: 'todo' as TaskDetailTask['status'],
        priority: 'medium' as TaskDetailTask['priority'],
        ...normalizeTaskAssigneePayload([]),
        team: null,
        hours_spent: null,
        due_date: null,
        start_date: null,
        checklist: [],
        color: null,
        meta: null,
      };

  const baselineJson = task && baselineDraftRef.current?.taskId === task.id
    ? baselineDraftRef.current.json
    : JSON.stringify(initialDraft);
  const hasUnsavedChanges = JSON.stringify(taskDraft()) !== baselineJson;

  // Populate form when task changes
  useEffect(() => {
    activeTaskIdRef.current = open && task ? task.id : null;
    if (!open) return;
    if (task) {
      baselineDraftRef.current = { taskId: task.id, json: JSON.stringify(buildTaskDraftSnapshot(task)) };
      lastFetchedTaskRef.current = null;
      setTitle(task.title);
      setDesc(task.description ?? '');
      // Sync contenteditable div on next tick
      setTimeout(() => { if (descRef.current) descRef.current.innerHTML = task.description ?? ''; }, 0);
      setStatus(task.status);
      setPriority(task.priority);
      setAssigneeIds(getTaskAssigneeIds(task));
      setTaskTeam(task.team ?? '');
      setTaskHours(task.hours_spent != null ? String(task.hours_spent) : '');
      setDueDate(task.due_date ?? '');
      setStartDate(task.start_date ?? '');
      setChecklist(normalizeChecklistItems(task.checklist));
      setTaskColor(task.color ?? '');
      setCustomFields((task as any).meta?.custom_fields ?? []);
      setBlockedReason((task as any).meta?.blocked_reason ?? '');
      setShowAddField(false);
      setPendingAttachment(null);
      setEditing(false);
      setConfirmDelete(false);
      setExpandedCheckItems(new Set());
      setShowColorPicker(false);
      fetchTaskData(task.id);
    } else {
      baselineDraftRef.current = null;
      lastFetchedTaskRef.current = null;
      setTitle(initialTitle); setDesc(''); setStatus('todo'); setPriority('medium');
      setAssigneeIds(initialAssigneeIds ?? []); setTaskTeam(''); setTaskHours(''); setDueDate(initialDueDate ?? ''); setStartDate(''); setChecklist([]);
      setComments([]); setAttachments([]); setActivity([]);
      // Clear the contenteditable DOM too — taskDraft() reads from it, so a
      // stale innerHTML would copy the previous task's description into the new one.
      setTimeout(() => { if (descRef.current) descRef.current.innerHTML = ''; }, 0);
      setTaskColor('');
      setCustomFields([]);
      setBlockedReason('');
      setShowAddField(false);
      setShowColorPicker(false);
      setExpandedCheckItems(new Set());
      setConfirmDelete(false);
      setPendingAttachment(null);
      setEditing(true);
      setSelectedProjectId(projects?.some(p => p.id === projectId) ? projectId : (projects?.[0]?.id ?? projectId));
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
            seen_by: row.seen_by ?? [],
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

  // Read receipts: viewing the panel marks others' comments as seen by you.
  const markingSeenRef = useRef(false);
  useEffect(() => {
    if (!open || isDemo || !currentUserId) return;
    const unseen = comments.filter(c => c.user_id !== currentUserId && !(c.seen_by ?? []).includes(currentUserId));
    if (unseen.length === 0 || markingSeenRef.current) return;
    markingSeenRef.current = true;
    (async () => {
      try {
        await Promise.all(unseen.map(c =>
          supabase.from('hub_project_task_comments')
            .update({ seen_by: [...(c.seen_by ?? []), currentUserId] })
            .eq('id', c.id)
        ));
        setComments(prev => prev.map(c =>
          c.user_id !== currentUserId && !(c.seen_by ?? []).includes(currentUserId)
            ? { ...c, seen_by: [...(c.seen_by ?? []), currentUserId] }
            : c
        ));
      } finally {
        markingSeenRef.current = false;
      }
    })();
  }, [open, comments, currentUserId, isDemo]);

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

  // execCommand fontSize only accepts 1–7, so apply the magic value 7 and then
  // rewrite the resulting <font> tags to an exact pixel size.
  const applyDescriptionFontSize = useCallback((px: number) => {
    focusDescriptionEditor();
    document.execCommand('fontSize', false, '7');
    descRef.current?.querySelectorAll('font[size="7"]').forEach(f => {
      f.removeAttribute('size');
      (f as HTMLElement).style.fontSize = `${px}px`;
    });
    syncDescriptionEditor();
  }, [focusDescriptionEditor, syncDescriptionEditor]);

  const fetchTaskData = useCallback(async (taskId: number) => {
    if (isDemo) return;
    const [taskRes, commRes, attRes, actRes] = await Promise.all([
      supabase.from('hub_project_tasks')
        .select('title, description, status, priority, assigned_to, assignee_ids, team, hours_spent, due_date, start_date, checklist, color, meta, updated_at')
        .eq('id', taskId)
        .single(),
      supabase.from('hub_project_task_comments')
        .select('id, user_id, body, created_at, author_name, author_avatar_url, attachment_url, attachment_name, attachment_size, attachment_mime, attachments, reactions, seen_by')
        .eq('task_id', taskId).order('created_at', { ascending: true }),
      supabase.from('hub_project_task_attachments')
        .select('*').eq('task_id', taskId).order('created_at', { ascending: false }),
      supabase.from('hub_project_task_activity')
        .select('id, actor_name, type, description, created_at')
        .eq('task_id', taskId).order('created_at', { ascending: false }).limit(30),
    ]);
    // A slow response for a task the user has since navigated away from must
    // not touch the form — the close-time auto-save would write this task's
    // content into whichever task is open now.
    if (activeTaskIdRef.current !== taskId) return;
    if (taskRes.data) {
      lastFetchedTaskRef.current = { id: taskId, ...taskRes.data };
      baselineDraftRef.current = { taskId, json: JSON.stringify(buildTaskDraftSnapshot(taskRes.data)) };
      setTitle(taskRes.data.title);
      setDesc(taskRes.data.description ?? '');
      if (descRef.current) descRef.current.innerHTML = taskRes.data.description ?? '';
      setStatus(taskRes.data.status);
      setPriority(taskRes.data.priority);
      setAssigneeIds(getTaskAssigneeIds(taskRes.data));
      setTaskTeam((taskRes.data as any).team ?? '');
      setTaskHours((taskRes.data as any).hours_spent != null ? String((taskRes.data as any).hours_spent) : '');
      setDueDate(taskRes.data.due_date ?? '');
      setStartDate(taskRes.data.start_date ?? '');
      setChecklist(normalizeChecklistItems(taskRes.data.checklist));
      setTaskColor(taskRes.data.color ?? '');
      setCustomFields((taskRes.data as any).meta?.custom_fields ?? []);
      setBlockedReason((taskRes.data as any).meta?.blocked_reason ?? '');
    }
    if (commRes.data) {
      // Build user map from teamMembers (already loaded, no RLS issues for contractors)
      const userMap: Record<string, { full_name: string; avatar_url: string | null }> = {};
      for (const m of teamMembers) userMap[m.id] = { full_name: m.full_name, avatar_url: m.avatar_url ?? null };
      setComments(commRes.data.map((c: any) => ({ ...c, reactions: c.reactions ?? {}, seen_by: c.seen_by ?? [], hub_users: userMap[c.user_id] ?? null })));
    }
    if (attRes.data)  setAttachments(attRes.data);
    if (actRes.data)  setActivity(actRes.data);
  }, []);

  const logActivity = useCallback(async (taskId: number, type: string, description: string) => {
    if (isDemo) return;
    await supabase.from('hub_project_task_activity').insert({
      task_id: taskId, actor_id: currentUserId, actor_name: currentUserName, type, description,
    });
    onActivityChange?.();
  }, [currentUserId, currentUserName, onActivityChange]);

  // A task with a Team set but no one assigned yet would otherwise sit
  // invisible until someone happens to check Team Deadlines — nudge the
  // team's lead so it doesn't get missed.
  const notifyTeamLeadIfUnassigned = useCallback(async (taskId: number, teamKey: string, taskTitle: string) => {
    if (isDemo) return;
    const lead = teamMeta(teamKey);
    if (!lead?.leadId) return;
    await supabase.from('hub_notifications').insert({
      user_id: lead.leadId,
      type: 'team',
      title: 'Task assigned to your team',
      body: `"${taskTitle}" was assigned to ${lead.label} with no one on it yet.`,
      link: '/hub/admin/projects',
      read: false,
    });
  }, [isDemo]);

  // Quick status change from the header pill — writes straight to the DB
  // instead of requiring "Edit" first, so it behaves like a one-click
  // status toggle (Kanban-style) rather than a full form save. Re-fetches
  // afterward so the form's baseline stays in sync — if the user happens to
  // also be mid-edit of other fields, the main Save button won't see a
  // false "status changed" diff against a now-stale snapshot.
  const quickChangeStatus = async (newStatus: TaskDetailTask['status']) => {
    setShowStatusDropdown(false);
    if (!task || isNew) { setStatus(newStatus); return; }
    const prevStatus = status;
    if (newStatus === prevStatus) return;
    if (isDemo) { setStatus(newStatus); onSaved({ ...task, status: newStatus } as TaskDetailTask); return; }
    setStatus(newStatus);
    const { data, error } = await supabase
      .from('hub_project_tasks')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', task.id)
      .select('*')
      .single();
    if (error) { setStatus(prevStatus); return; }
    await logActivity(task.id, 'status_change', `changed status from ${prevStatus.replace('_', ' ')} to ${newStatus.replace('_', ' ')}`);
    supabase.functions.invoke('notify-task-updated', {
      body: {
        task_id: task.id,
        project_id: data.project_id,
        task_title: data.title,
        project_name: projectName,
        updated_by_id: currentUserId,
        updated_by_name: currentUserName,
        change_description: `${currentUserName} marked "${data.title}" as ${newStatus.replace('_', ' ')}`,
      },
    }).catch(console.error);
    await fetchTaskData(task.id);
    const assigneeMember = teamMembers.find(m => m.id === (getTaskAssigneeIds(data)[0] ?? '')) ?? null;
    const hub_users = assigneeMember ? { id: assigneeMember.id, full_name: assigneeMember.full_name, avatar_url: assigneeMember.avatar_url ?? null } : null;
    onSaved({ ...data, hub_users } as TaskDetailTask);
  };

  // ── Save ───────────────────────────────────────────────────────────────────

  const handleSave = async ({ closeAfterSave = false }: { closeAfterSave?: boolean } = {}) => {
    if (!title.trim()) return;
    setSaving(true);
    setSaveError(null);
    try {
      const payload = taskDraft();
      const effectiveProjectId = isNew ? selectedProjectId : projectId;
      const effectiveProjectName = isNew
        ? (projects?.find(p => p.id === selectedProjectId)?.project_name ?? projectName)
        : projectName;

      if (isDemo) {
        // Demo mode: apply the change locally so the flow feels real,
        // but never touch the database.
        const demoAssignee = teamMembers.find(m => m.id === (getTaskAssigneeIds(payload)[0] ?? '')) ?? null;
        const demoHubUsers = demoAssignee ? { id: demoAssignee.id, full_name: demoAssignee.full_name, avatar_url: demoAssignee.avatar_url ?? null } : null;
        if (isNew) {
          onSaved({ id: Date.now(), project_id: effectiveProjectId, ...payload, hub_users: demoHubUsers } as TaskDetailTask);
          onClose();
        } else {
          onSaved({ ...task!, ...payload, hub_users: demoHubUsers } as TaskDetailTask);
          if (closeAfterSave) onClose(); else setEditing(false);
        }
        return;
      }

      const nextAssigneeIds = getTaskAssigneeIds(payload);
      const assigneeMember = teamMembers.find(m => m.id === (nextAssigneeIds[0] ?? '')) ?? null;
      const hub_users = assigneeMember
        ? { id: assigneeMember.id, full_name: assigneeMember.full_name, avatar_url: assigneeMember.avatar_url ?? null }
        : null;

      if (isNew) {
        const { data, error } = await supabase
          .from('hub_project_tasks')
          .insert({ ...payload, project_id: effectiveProjectId })
          .select('*')
          .single();
        if (error) throw error;
        if (pendingAttachment) {
          const attachment = await createTaskAttachment({
            taskId: data.id,
            file: pendingAttachment,
            uploadedBy: currentUserId,
            projectId: effectiveProjectId,
            projectName: effectiveProjectName,
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
              project_name: effectiveProjectName,
              assigned_to_ids: nextAssigneeIds,
              assigned_by_name: currentUserName,
            },
          }).catch(console.error);
        } else if (payload.team) {
          await notifyTeamLeadIfUnassigned(data.id, payload.team, title);
        }
        onClose();
      } else {
        // Diff against the freshly fetched row when available — the list prop
        // can be stale, which would log changes this user never made.
        const fetched = lastFetchedTaskRef.current;
        const prev = fetched && fetched.id === task!.id ? { ...task!, ...fetched } : task!;
        // Optimistic-concurrency guard: only overwrite the row if it still
        // matches the version we loaded — otherwise someone changed it while
        // this panel was open and a blind write would destroy their edit.
        const fetchedUpdatedAt = fetched && fetched.id === task!.id ? (fetched as any).updated_at ?? null : null;
        // done_at is maintained by a DB trigger when status flips to/from done
        let updateQuery = supabase
          .from('hub_project_tasks')
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq('id', prev.id);
        if (fetchedUpdatedAt) updateQuery = updateQuery.eq('updated_at', fetchedUpdatedAt);
        const { data: updatedRows, error } = await updateQuery.select('*');
        if (error) throw error;
        const data = updatedRows?.[0];
        if (!data) {
          // Row changed since we loaded it. Keep the user's edits in the form,
          // refresh our version marker, and let them decide to save again.
          const { data: freshRow } = await supabase
            .from('hub_project_tasks')
            .select('title, description, status, priority, assigned_to, assignee_ids, team, hours_spent, due_date, start_date, checklist, color, meta, updated_at')
            .eq('id', prev.id)
            .maybeSingle();
          if (freshRow) lastFetchedTaskRef.current = { id: prev.id, ...freshRow };
          throw new Error('Someone updated this task while you had it open. Your edits are kept here — press Save again to apply them over the latest version, or close without saving to discard.');
        }

        // Log meaningful changes
        const statusChanged = prev.status !== status;
        if (statusChanged)
          await logActivity(prev.id, 'status_change', `changed status from ${prev.status.replace('_', ' ')} to ${status.replace('_', ' ')}`);

        const trimmedTitle = title.trim();
        if (prev.title !== trimmedTitle)
          await logActivity(prev.id, 'edited', `changed title from "${prev.title}" to "${trimmedTitle}"`);

        const nextDescription = normalizeRichText(descRef.current?.innerHTML ?? description);
        if ((prev.description ?? '') !== (nextDescription ?? ''))
          await logActivity(prev.id, 'edited', 'updated the description');

        if (prev.priority !== priority)
          await logActivity(prev.id, 'edited', `changed priority from ${prev.priority} to ${priority}`);

        const prevDue = prev.due_date ?? null;
        const nextDue = dueDate || null;
        if (prevDue !== nextDue)
          await logActivity(prev.id, 'edited', `changed due date from ${fmtLogDate(prevDue)} to ${fmtLogDate(nextDue)}`);

        const prevStart = prev.start_date ?? null;
        const nextStart = startDate || null;
        if (prevStart !== nextStart)
          await logActivity(prev.id, 'edited', `changed start date from ${fmtLogDate(prevStart)} to ${fmtLogDate(nextStart)}`);

        const prevTeamKey = prev.team ?? null;
        const nextTeamKey = taskTeam || null;
        if (prevTeamKey !== nextTeamKey)
          await logActivity(prev.id, 'edited', `changed team from ${teamMeta(prevTeamKey)?.label ?? 'Unassigned'} to ${teamMeta(nextTeamKey)?.label ?? 'Unassigned'}`);

        const prevHours = prev.hours_spent ?? null;
        const nextHours = taskHours.trim() ? parseFloat(taskHours) : null;
        if (prevHours !== nextHours)
          await logActivity(prev.id, 'edited', `changed hours spent from ${prevHours ?? '—'} to ${nextHours ?? '—'}`);

        const prevChecklistJson = JSON.stringify(normalizeChecklistItems(prev.checklist));
        const nextChecklistJson = JSON.stringify(normalizeChecklistItems(checklist));
        if (prevChecklistJson !== nextChecklistJson)
          await logActivity(prev.id, 'edited', 'updated the checklist');

        const prevColor = prev.color ?? null;
        const nextColor = taskColor || null;
        if (prevColor !== nextColor)
          await logActivity(prev.id, 'edited', 'changed the task color');

        const previousAssigneeIds = getTaskAssigneeIds(prev);
        const assigneesChanged = !sameAssigneeIds(previousAssigneeIds, nextAssigneeIds);
        if (assigneesChanged) {
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
            }).catch(console.error);
          }
        }

        // Team-only, no one assigned yet — nudge the lead so it doesn't sit
        // invisible. Only fires on the save that actually created this state
        // (team or assignees just changed), not on every unrelated edit.
        if (nextTeamKey && nextAssigneeIds.length === 0 && (nextTeamKey !== prevTeamKey || assigneesChanged)) {
          await notifyTeamLeadIfUnassigned(prev.id, nextTeamKey, title);
        }

        // Notify assignees + admins when task is meaningfully changed
        if (statusChanged || assigneesChanged) {
          const notifBody = statusChanged
            ? `${currentUserName} marked "${title}" as ${status.replace('_', ' ')}`
            : `${currentUserName} updated assignments on "${title}"`;
          supabase.functions.invoke('notify-task-updated', {
            body: {
              task_id: prev.id,
              project_id: prev.project_id,
              task_title: title,
              project_name: projectName,
              updated_by_id: currentUserId,
              updated_by_name: currentUserName,
              change_description: notifBody,
            },
          }).catch(console.error);
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
    if (isDemo) {
      onDeleted(task.id);
      onClose();
      setDeleting(false);
      return;
    }
    // Soft delete — lands in the workspace trash, restorable for 30 days
    await supabase.from('hub_project_tasks').update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', task.id);
    onDeleted(task.id);
    onClose();
    setDeleting(false);
  };

  const handleArchive = async () => {
    if (!task) return;
    const archived_at = new Date().toISOString();
    if (isDemo) {
      onArchived?.(task.id);
      onClose();
      return;
    }
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
    if (isDemo) { onSaved({ ...task, checklist: normalizeChecklistItems(updated) }); return; }
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
    const editor = commentEditorRef.current;
    const body = editor && !editor.isEmpty() ? commentEditableToBody(editor.getHTML()) : '';
    if ((!body && commentFiles.length === 0) || !task) return;
    setPosting(true);
    setCommentFileError(null);

    if (isDemo) {
      setComments(prev => [...prev, {
        id: Date.now(), user_id: currentUserId, body, created_at: new Date().toISOString(),
        author_name: currentUserName, author_avatar_url: currentUserAvatarUrl ?? null,
        attachment_url: null, attachment_name: null, attachment_size: null, attachment_mime: null, attachments: null,
        reactions: {}, seen_by: [], hub_users: { full_name: currentUserName, avatar_url: currentUserAvatarUrl ?? null },
      } as Comment]);
      setNewComment('');
      editor?.clear();
      setPosting(false);
      return;
    }

    const uploaded: CommentAttachment[] = [];

    if (commentFiles.length > 0) {
      try {
        setUploadProgress(5);
        uploadProgressTimer.current = setInterval(() => {
          setUploadProgress(p => (p !== null && p < 88) ? p + 2 : p);
        }, 250);
        for (const f of commentFiles) {
          const url = await uploadFileToDrive(f, 'task_attachment', { project_id: String(task.project_id), project_name: projectName });
          uploaded.push({ url, name: f.name, size: f.size, mime: f.type || null });
        }
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

    // Legacy single-attachment columns mirror the first file so older readers keep working.
    const first = uploaded[0] ?? null;
    const { data, error: postError } = await supabase
      .from('hub_project_task_comments')
      .insert({
        task_id: task.id,
        user_id: currentUserId,
        body,
        author_name: currentUserName,
        author_avatar_url: currentUserAvatarUrl ?? null,
        attachment_url: first?.url ?? null,
        attachment_name: first?.name ?? null,
        attachment_size: first?.size ?? null,
        attachment_mime: first?.mime ?? null,
        attachments: uploaded.length > 0 ? uploaded : null,
      })
      .select('id, user_id, body, created_at, author_name, author_avatar_url, attachment_url, attachment_name, attachment_size, attachment_mime, attachments, seen_by')
      .single();
    if (postError) {
      console.error('Post comment error:', postError);
      setCommentFileError(postError.message ?? 'Failed to post comment.');
      setPosting(false);
      return;
    }
    if (data) {
      const { data: commenter } = await supabase.from('hub_users').select('full_name, avatar_url').eq('id', currentUserId).single();
      const norm = { ...data, reactions: {}, seen_by: (data as any).seen_by ?? [], hub_users: commenter ? { full_name: commenter.full_name, avatar_url: commenter.avatar_url ?? null } : { full_name: currentUserName, avatar_url: null } };
      setComments(prev => [...prev, norm]);
      await logActivity(task.id, 'comment_added', 'added a comment');
      // Notify all assignees + admins about the comment
      supabase.functions.invoke('notify-task-updated', {
        body: {
          task_id: task.id,
          project_id: task.project_id,
          task_title: task.title,
          project_name: projectName,
          updated_by_id: currentUserId,
          updated_by_name: currentUserName,
          change_description: `${currentUserName} commented on "${task.title}"`,
          notification_type: 'task_comment',
        },
      }).catch(console.error);
      if (newComment.includes('@')) {
        supabase.functions.invoke('notify-task-mention', {
          body: { comment_id: data.id, task_id: task.id, author_id: currentUserId, author_name: currentUserName, body: newComment.trim(), project_id: task.project_id },
        }).catch(console.error);
      }
    }
    setNewComment('');
    setCommentFiles([]);
    if (commentFileRef.current) commentFileRef.current.value = '';
    editor?.clear();
    setPosting(false);
  };

  const driveFileIdFromUrl = (url: string): string | null => {
    const m = url.match(/\/file\/d\/([^/]+)/);
    return m ? m[1] : null;
  };

  const saveEditedComment = async (commentId: number) => {
    const editor = editEditorRef.current;
    if (!editor || editor.isEmpty()) return;
    const body = commentEditableToBody(editor.getHTML());
    setComments(prev => prev.map(x => x.id === commentId ? { ...x, body } : x));
    setEditingCommentId(null);
    if (isDemo) return;
    await supabase.from('hub_project_task_comments').update({ body }).eq('id', commentId);
  };

  const deleteComment = async (commentId: number) => {
    if (isDemo) { setComments(prev => prev.filter(c => c.id !== commentId)); return; }
    const comment = comments.find(c => c.id === commentId);
    await supabase.from('hub_project_task_comments').delete().eq('id', commentId);
    setComments(prev => prev.filter(c => c.id !== commentId));
    const urls = comment?.attachments?.length ? comment.attachments.map(a => a.url) : (comment?.attachment_url ? [comment.attachment_url] : []);
    for (const url of urls) {
      const fileId = driveFileIdFromUrl(url);
      if (fileId) supabase.functions.invoke('delete-from-drive', { body: { fileId } }).catch(console.error);
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
    if (isDemo) return;
    await supabase.from('hub_project_task_comments').update({ reactions: newReactions }).eq('id', commentId);
  };

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
      const url = await uploadFileToDrive(file, 'task_attachment', { project_id: String(task.project_id), project_name: projectName });
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
    const fileId = driveFileIdFromUrl(att.url);
    if (fileId) supabase.functions.invoke('delete-from-drive', { body: { fileId } }).catch(console.error);
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
      <div className="fixed right-0 top-0 h-full w-full max-w-[680px] bg-white z-50 flex flex-col shadow-2xl overflow-x-hidden">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        {taskColor && <div className="h-1 flex-shrink-0" style={{ background: taskColor }} />}
        <div className="px-8 pt-4 pb-2 flex-shrink-0 bg-white">
          {/* Toolbar row — quiet ghost buttons, right-aligned */}
          <div className="flex items-center justify-end gap-1 mb-1 -mr-2">
              {/* Color picker */}
              {(canEdit || isNew) && (
                <div className="relative">
                  <button onClick={() => setShowColorPicker(p => !p)}
                    className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
                    title="Pick task color">
                    <i className="ri-palette-line text-base"></i>
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
                  title={editing ? 'Done editing' : 'Edit task'}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${editing ? 'bg-[#1c2b3a] text-white' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'}`}>
                  <i className="ri-edit-line text-base"></i>
                </button>
              )}
              <button onClick={() => { void requestClose(); }} className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors cursor-pointer">
                <i className="ri-close-line text-lg"></i>
              </button>
          </div>

          {/* Title + meta */}
          {editing ? (
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Task title"
              className="w-full text-xl font-semibold text-gray-900 placeholder-gray-300 focus:outline-none leading-snug"
              autoFocus={isNew}
            />
          ) : (
            <h2 className="text-xl font-semibold text-gray-900 leading-snug">{title}</h2>
          )}
          <div className="flex items-center gap-2 mt-2.5 flex-wrap pb-2">
            {!isNew && projectName && (
              onOpenProject ? (
                <button type="button" onClick={() => onOpenProject(projectId)} title="Open project workspace"
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium bg-[#1c2b3a]/5 text-[#1c2b3a] border border-[#1c2b3a]/10 hover:bg-[#1c2b3a]/10 cursor-pointer transition-colors">
                  <i className="ri-folder-3-line text-[11px]"></i>{projectName}
                </button>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium bg-[#1c2b3a]/5 text-[#1c2b3a] border border-[#1c2b3a]/10">
                  <i className="ri-folder-3-line text-[11px]"></i>{projectName}
                </span>
              )
            )}
            {canEdit ? (
              <div className="relative">
                <button type="button" onClick={() => setShowStatusDropdown(v => !v)}
                  className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium cursor-pointer hover:opacity-80 transition-opacity ${sc.bg} ${sc.text}`}>
                  <i className={`${sc.icon} text-[11px]`}></i>{sc.label}
                  <i className="ri-arrow-down-s-line text-[11px] opacity-60"></i>
                </button>
                {showStatusDropdown && (
                  <div className="absolute top-full mt-1 left-0 bg-white border border-gray-200 rounded-xl shadow-xl z-20 py-1.5 min-w-[160px]">
                    {Object.entries(STATUS_CFG).map(([k, v]) => (
                      <button key={k} type="button"
                        onClick={() => quickChangeStatus(k as TaskDetailTask['status'])}
                        className={`flex items-center gap-2.5 w-full px-3 py-2 text-xs hover:bg-gray-50 transition-colors cursor-pointer ${status === k ? 'font-semibold text-gray-800' : 'text-gray-600'}`}>
                        <span className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 ${v.bg}`}>
                          <i className={`${v.icon} ${v.text} text-xs`}></i>
                        </span>
                        {v.label}
                        {status === k && <i className="ri-check-line ml-auto text-[#1c2b3a]"></i>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium ${sc.bg} ${sc.text}`}>
                <i className={`${sc.icon} text-[11px]`}></i>{sc.label}
              </span>
            )}
            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium border ${pc.cls}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${pc.dot}`}></span>{pc.label}
            </span>
            {!isNew && (() => {
              const creator = activity.find(a => a.type === 'created');
              return creator ? (
                <span className="text-gray-400 text-xs">by {creator.actor_name.split(' ')[0]}</span>
              ) : null;
            })()}
          </div>
        </div>

        {/* ── Body ────────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden">

          {/* Properties */}
          <div className="px-8 py-4 space-y-1.5 border-b border-gray-100/80">

            {/* Project — new-task mode only, when the caller supplied a project list */}
            {isNew && projects && projects.length > 0 && (
              <div className="flex items-center h-8 gap-3">
                <span className="text-xs text-gray-400 w-24 flex-shrink-0">Project</span>
                <select
                  value={selectedProjectId}
                  onChange={e => setSelectedProjectId(Number(e.target.value))}
                  className="flex-1 px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a] bg-white cursor-pointer"
                >
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.project_name}{p.project_type !== 'internal' && p.client_name ? ` — ${p.client_name}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {editing && status === 'blocked' && (
              <div className="flex items-center h-8 gap-3">
                <span className="text-xs text-gray-400 w-24 flex-shrink-0">Blocked by</span>
                <input
                  value={blockedReason}
                  onChange={e => setBlockedReason(e.target.value)}
                  placeholder="What's blocking this? e.g. waiting on client assets"
                  className="flex-1 px-2.5 py-1.5 text-xs border border-rose-200 bg-rose-50/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-200 focus:border-rose-300"
                />
              </div>
            )}
            {!editing && status === 'blocked' && blockedReason.trim() && (
              <div className="flex items-start gap-2 px-3 py-2 my-1 bg-rose-50 border border-rose-100 rounded-xl">
                <i className="ri-indeterminate-circle-line text-rose-500 text-sm flex-shrink-0 mt-px"></i>
                <p className="text-xs text-rose-700 leading-snug"><span className="font-semibold">Blocked:</span> {blockedReason}</p>
              </div>
            )}

            {/* Priority — only show in body when editing */}
            {editing && (
              <div className="flex items-center h-8 gap-3">
                <span className="text-xs text-gray-400 w-24 flex-shrink-0">Priority</span>
                <div className="flex gap-1.5">
                  {([['high','High','bg-rose-100 text-rose-600','bg-rose-400'],['medium','Medium','bg-amber-100 text-amber-700','bg-amber-400'],['low','Low','bg-gray-100 text-gray-500','bg-gray-300']] as const).map(([k, label, cls, dot]) => {
                    const active = priority === k;
                    return (
                      <button key={k} type="button"
                        onClick={() => setPriority(k as TaskDetailTask['priority'])}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${active ? cls : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${active ? dot : 'bg-gray-300'}`}></span>{label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Assignees */}
            <div className="flex items-start gap-3 py-1">
              <span className="text-xs text-gray-400 w-24 flex-shrink-0 pt-1">Assignees</span>
              {editing ? (
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" onClick={() => setAssigneeIds([])}
                    className={`px-2.5 py-1 text-[11px] font-medium rounded-lg border transition-all cursor-pointer ${assigneeIds.length === 0 ? 'bg-gray-800 text-white border-gray-800' : 'border-gray-200 text-gray-400 hover:border-gray-400'}`}>
                    None
                  </button>
                  {teamMembers.map((member) => {
                    const selected = assigneeIds.includes(member.id);
                    return (
                      <button key={member.id} type="button"
                        onClick={() => setAssigneeIds((prev) => selected ? prev.filter((id) => id !== member.id) : [...prev, member.id])}
                        className={`flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-lg border transition-all cursor-pointer ${selected ? 'border-indigo-300 bg-indigo-50' : 'border-gray-200 hover:border-gray-300'}`}>
                        <Avatar name={member.full_name} url={member.avatar_url} size={4} />
                        <span className={`text-[11px] font-medium ${selected ? 'text-indigo-700' : 'text-gray-600'}`}>{member.full_name}</span>
                      </button>
                    );
                  })}
                </div>
              ) : selectedAssignees.length > 0 ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  {selectedAssignees.map((member) => (
                    <div key={member.id} className="flex items-center gap-1.5 rounded-md hover:bg-gray-100 pl-0.5 pr-2 py-0.5 transition-colors">
                      <Avatar name={member.full_name} url={member.avatar_url} size={5} />
                      <span className="text-[13px] text-gray-700">{member.full_name}</span>
                    </div>
                  ))}
                </div>
              ) : <span className="text-[13px] text-gray-300 pt-1">Empty</span>}
            </div>

            {/* Team — independent of assignee, so a task can be handed to a
                team before a specific person is picked */}
            <div className="flex items-center h-8 gap-3">
              <span className="text-xs text-gray-400 w-24 flex-shrink-0">Team</span>
              {editing ? (
                <div className="flex gap-1.5">
                  <button type="button" onClick={() => setTaskTeam('')}
                    className={`px-2.5 py-1 text-[11px] font-medium rounded-lg border transition-all cursor-pointer ${taskTeam === '' ? 'bg-gray-800 text-white border-gray-800' : 'border-gray-200 text-gray-400 hover:border-gray-400'}`}>
                    None
                  </button>
                  {teamsList.map((t) => (
                    <button key={t.key} type="button" onClick={() => setTaskTeam(t.key)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-all cursor-pointer ${taskTeam === t.key ? 'border-transparent' : 'border-gray-200 text-gray-400 hover:border-gray-400'}`}
                      style={taskTeam === t.key ? { background: `${t.color}1a`, color: t.color } : undefined}>
                      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: t.color }}></span>{t.label}
                    </button>
                  ))}
                </div>
              ) : taskTeam ? (
                <span className="inline-flex items-center gap-1.5 text-[13px] text-gray-700">
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: teamMeta(taskTeam)?.color }}></span>
                  {teamMeta(taskTeam)?.label}
                </span>
              ) : <span className="text-[13px] text-gray-300">Empty</span>}
            </div>

            {/* Hours spent — optional, self-reported. Feeds the per-employee
                Google Sheet timesheet sync when the task is marked done. */}
            <div className="flex items-center h-8 gap-3">
              <span className="text-xs text-gray-400 w-24 flex-shrink-0">Hours Spent</span>
              {editing ? (
                <input type="number" min="0" step="0.25" value={taskHours} onChange={(e) => setTaskHours(e.target.value)}
                  placeholder="e.g. 2.5"
                  className="w-24 text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 bg-white" />
              ) : taskHours ? (
                <span className="text-[13px] text-gray-700">{taskHours}h</span>
              ) : <span className="text-[13px] text-gray-300">Empty</span>}
            </div>

            {/* Dates */}
            <div className="flex items-center h-8 gap-3">
              <span className="text-xs text-gray-400 w-24 flex-shrink-0">Dates</span>
              {editing ? (
                <div className="flex items-center gap-2 flex-1">
                  <input type="date" value={startDate} max={dueDate || undefined}
                    onChange={e => {
                      const v = e.target.value;
                      setStartDate(v);
                      // Keep the due date from ever landing before the new start date.
                      if (dueDate && v && v > dueDate) setDueDate(v);
                    }}
                    className="flex-1 text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 bg-white" />
                  <i className="ri-arrow-right-line text-gray-300 text-xs flex-shrink-0"></i>
                  <input type="date" value={dueDate} min={startDate || undefined}
                    onChange={e => {
                      const v = e.target.value;
                      setDueDate(startDate && v && v < startDate ? startDate : v);
                    }}
                    className="flex-1 text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 bg-white" />
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-[13px]">
                  {startDate
                    ? <span className="text-gray-700 hover:bg-gray-100 rounded-md px-1.5 py-0.5 -mx-0.5 transition-colors">{new Date(startDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                    : <span className="text-gray-300">Empty</span>}
                  <i className="ri-arrow-right-line text-gray-300 text-[11px]"></i>
                  {dueDate
                    ? <span className={`rounded-md px-1.5 py-0.5 font-medium transition-colors ${dueDate < new Date().toISOString().split('T')[0] ? 'bg-rose-50 text-rose-600' : 'text-gray-700 hover:bg-gray-100'}`}>
                        {new Date(dueDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    : <span className="text-gray-300">Empty</span>}
                </div>
              )}
            </div>

          </div>

          {/* Description */}
          <div className="px-8 py-5">
            <p className="text-xs font-medium text-gray-400 mb-2">Description</p>
            {editing ? (
              <div className="rounded-xl border border-gray-200 overflow-hidden">
                {/* Toolbar */}
                <div className="flex items-center gap-0.5 px-2 py-1.5 bg-gray-50 border-b border-gray-200">
                  {/* Format group */}
                  <div className="flex items-center">
                    <button type="button" onMouseDown={(e) => { e.preventDefault(); applyDescriptionCommand('bold'); }}
                      className="w-7 h-7 flex items-center justify-center rounded-md text-gray-500 hover:bg-gray-200 hover:text-gray-800 cursor-pointer transition-colors font-bold text-xs">B</button>
                    <button type="button" onMouseDown={(e) => { e.preventDefault(); applyDescriptionCommand('italic'); }}
                      className="w-7 h-7 flex items-center justify-center rounded-md text-gray-500 hover:bg-gray-200 hover:text-gray-800 cursor-pointer transition-colors italic text-xs">I</button>
                    <button type="button" onMouseDown={(e) => { e.preventDefault(); applyDescriptionCommand('underline'); }}
                      className="w-7 h-7 flex items-center justify-center rounded-md text-gray-500 hover:bg-gray-200 hover:text-gray-800 cursor-pointer transition-colors underline text-xs">U</button>
                  </div>

                  <div className="w-px h-4 bg-gray-200 mx-1" />

                  {/* Block group */}
                  <div className="flex items-center gap-0.5">
                    <button type="button" onMouseDown={(e) => { e.preventDefault(); applyDescriptionBlock('h2'); }}
                      className="h-7 px-2 flex items-center justify-center rounded-md text-gray-500 hover:bg-gray-200 hover:text-gray-800 cursor-pointer transition-colors text-[11px] font-semibold">H</button>
                    <button type="button" onMouseDown={(e) => { e.preventDefault(); applyDescriptionBlock('p'); }}
                      className="h-7 px-2 flex items-center justify-center rounded-md text-gray-500 hover:bg-gray-200 hover:text-gray-800 cursor-pointer transition-colors text-[11px]">¶</button>
                    <button type="button" onMouseDown={(e) => { e.preventDefault(); applyDescriptionCommand('insertUnorderedList'); }}
                      className="w-7 h-7 flex items-center justify-center rounded-md text-gray-500 hover:bg-gray-200 hover:text-gray-800 cursor-pointer transition-colors">
                      <i className="ri-list-unordered text-sm"></i>
                    </button>
                  </div>

                  <div className="w-px h-4 bg-gray-200 mx-1" />

                  {/* Size group — numeric px sizes */}
                  <select
                    defaultValue=""
                    onMouseDown={e => e.stopPropagation()}
                    onChange={e => {
                      const px = Number(e.target.value);
                      if (px) applyDescriptionFontSize(px);
                      e.target.value = '';
                    }}
                    title="Font size"
                    className="h-7 px-1 rounded-md text-[11px] text-gray-500 bg-transparent hover:bg-gray-200 cursor-pointer focus:outline-none transition-colors">
                    <option value="" disabled>Size</option>
                    {[12, 13, 14, 16, 18, 20, 24, 28, 32].map(px => (
                      <option key={px} value={px}>{px}px</option>
                    ))}
                  </select>

                  <div className="w-px h-4 bg-gray-200 mx-1" />

                  {/* Font group */}
                  <div className="flex items-center gap-0.5">
                    <button type="button" onMouseDown={(e) => { e.preventDefault(); applyDescriptionCommand('fontName', 'Georgia'); }}
                      className="h-7 px-2 flex items-center justify-center rounded-md text-gray-500 hover:bg-gray-200 hover:text-gray-800 cursor-pointer transition-colors text-[11px]" style={{ fontFamily: 'Georgia' }}>Serif</button>
                    <button type="button" onMouseDown={(e) => { e.preventDefault(); applyDescriptionCommand('fontName', 'Arial'); }}
                      className="h-7 px-2 flex items-center justify-center rounded-md text-gray-500 hover:bg-gray-200 hover:text-gray-800 cursor-pointer transition-colors text-[11px]">Sans</button>
                  </div>

                  {/* Clear — pushed right */}
                  <button type="button" onMouseDown={(e) => { e.preventDefault(); applyDescriptionCommand('removeFormat'); }}
                    className="ml-auto h-7 px-2 flex items-center justify-center rounded-md text-gray-400 hover:text-rose-500 hover:bg-rose-50 cursor-pointer transition-colors text-[11px]">
                    <i className="ri-eraser-line text-sm"></i>
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
                  data-placeholder="Describe the scope, specs, or notes for this task — paste images directly"
                  className="w-full text-sm text-gray-700 px-3 py-3 focus:outline-none bg-white min-h-[120px] empty:before:content-[attr(data-placeholder)] empty:before:text-gray-400 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mt-2 [&_h2]:mb-1 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:mt-2 [&_h3]:mb-1"
                />
              </div>
            ) : (
              <div
                onClick={() => { if (canEdit && !isNew) setEditing(true); }}
                title={canEdit && !isNew ? 'Click to edit' : undefined}
                className={`text-sm text-gray-600 leading-relaxed rounded-lg -mx-2 px-2 py-1 transition-colors ${canEdit && !isNew ? 'cursor-text hover:bg-gray-50' : ''} [&_img]:max-w-full [&_img]:rounded-lg [&_img]:border [&_img]:border-gray-100 [&_img]:my-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mt-2 [&_h2]:mb-1 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:mt-2 [&_h3]:mb-1`}>
                {description
                  ? <div dangerouslySetInnerHTML={{ __html: renderDescription(description) }} />
                  : <span className="text-gray-300">Describe the scope, specs, or notes for this task…</span>}
              </div>
            )}
          </div>

          {/* Checklist */}
          <div className="px-8 py-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <p className="text-xs font-medium text-gray-400">Checklist</p>
                {checklist.length > 0 && (
                  <span className="text-[10px] bg-gray-100 text-gray-500 font-medium px-1.5 py-0.5 rounded-full">{checkDone}/{checklist.length}</span>
                )}
              </div>
            </div>
            {checklist.length > 0 && (
              <div className="mb-3">
                <div className="h-1 bg-gray-100 rounded-full overflow-hidden mb-3">
                  <div className={`h-full rounded-full transition-all ${checkPct === 100 ? 'bg-emerald-400' : 'bg-[#1c2b3a]'}`} style={{ width: `${checkPct}%` }} />
                </div>
                <div className="space-y-1.5">
                  {checklist.map(item => (
                    <div
                      key={item.id}
                      className={`group rounded transition-colors ${dragOverCheckId === item.id && dragCheckId !== item.id ? 'bg-orange-50 ring-1 ring-[#1c2b3a]/30' : ''}`}
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
                          <div className="flex items-center gap-1 rounded-full bg-indigo-50 px-1.5 py-1">
                            <Avatar
                              name={teamMembers.find((member) => member.id === item.assignee_id)?.full_name ?? '?'}
                              url={teamMembers.find((member) => member.id === item.assignee_id)?.avatar_url}
                              size={4}
                            />
                            <span className="text-[10px] font-medium text-indigo-700">
                              {teamMembers.find((member) => member.id === item.assignee_id)?.full_name ?? 'Assigned'}
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
                            <option value="">No employee assigned</option>
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
              <div className="flex items-center gap-2 rounded-lg px-1.5 py-1.5 hover:bg-gray-50 focus-within:bg-gray-50 transition-colors">
                <i className="ri-add-line text-gray-300 text-base flex-shrink-0"></i>
                <input
                  value={newCheckItem}
                  onChange={e => setNewCheckItem(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCheckItem(); } }}
                  placeholder="Add an item…"
                  className="flex-1 text-sm bg-transparent focus:outline-none text-gray-700 placeholder-gray-400"
                />
                {newCheckItem.trim() && (
                  <button onClick={addCheckItem}
                    className="flex-shrink-0 w-6 h-6 bg-[#1c2b3a] rounded-full flex items-center justify-center cursor-pointer hover:bg-[#e55a25] transition-colors">
                    <i className="ri-arrow-right-line text-white text-xs"></i>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Custom Fields */}
          {(canEdit || customFields.length > 0) && (
          <div className="px-8 py-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-medium text-gray-400">Custom Fields</p>
              {canEdit && (
                <button onClick={() => setShowAddField(v => !v)}
                  className="flex items-center gap-1 text-[11px] text-[#1c2b3a] hover:text-[#e55a25] cursor-pointer font-medium transition-colors">
                  <i className="ri-add-line text-xs"></i>Add field
                </button>
              )}
            </div>
            <div className="space-y-2">
              {customFields.map(f => {
                const isUrl = /^https?:\/\//.test(f.value) || /^www\./i.test(f.value) || /\.com(\/|\s|\?|#|$)/i.test(f.value);
                const hrefVal = isUrl && !f.value.startsWith('http') ? 'https://' + f.value : f.value;
                const isEditing = editingFieldId === f.id;
                const saveField = () => {
                  setEditingFieldId(null);
                  if (task?.id) supabase.from('hub_project_tasks').update({ meta: buildTaskMetaPayload(customFields, status, blockedReason) }).eq('id', task.id)
                    .select('*').single().then(({ data }) => { if (data) onSaved({ ...task, ...data } as TaskDetailTask); });
                };
                return (
                  <div key={f.id} className="flex items-center gap-2 group">
                    <span className="text-xs text-gray-500 font-medium w-28 flex-shrink-0 truncate">{f.label}</span>
                    {isEditing ? (
                      <div className="flex-1 flex gap-1">
                        <input autoFocus value={f.value} onChange={e => setCustomFields(customFields.map(x => x.id === f.id ? { ...x, value: e.target.value } : x))}
                          onKeyDown={e => { if (e.key === 'Enter') saveField(); if (e.key === 'Escape') setEditingFieldId(null); }}
                          placeholder="Add link here…"
                          className="flex-1 text-xs border border-[#1c2b3a]/50 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#1c2b3a]/30 placeholder-gray-400" />
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
                        if (task?.id) supabase.from('hub_project_tasks').update({ meta: buildTaskMetaPayload(updated, status, blockedReason) }).eq('id', task.id)
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
                      if (task?.id) supabase.from('hub_project_tasks').update({ meta: buildTaskMetaPayload(updated, status, blockedReason) }).eq('id', task.id)
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
                    if (task?.id) supabase.from('hub_project_tasks').update({ meta: buildTaskMetaPayload(updated, status, blockedReason) }).eq('id', task.id)
                        .select('*').single().then(({ data }) => { if (data) onSaved({ ...task, ...data } as TaskDetailTask); });
                  }} className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs cursor-pointer">Add</button>
                </div>
              )}
            </div>
          </div>
          )}

          <div className="px-8 py-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <p className="text-xs font-medium text-gray-400">Attachments</p>
                {attachments.length > 0 && (
                  <span className="text-[10px] bg-gray-100 text-gray-500 font-medium px-1.5 py-0.5 rounded-full">{attachments.length}</span>
                )}
              </div>
              {(canEdit || isNew) && (
                <button onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="flex items-center gap-1 text-[11px] text-[#1c2b3a] hover:text-[#e55a25] disabled:opacity-40 cursor-pointer font-medium transition-colors">
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
                    <p className="text-[10px] text-gray-400">{fmtBytes(pendingAttachment.size)} · Uploads when task is created</p>
                  </div>
                  <button type="button" onClick={clearPendingAttachment}
                    className="text-gray-300 hover:text-rose-500 transition-colors cursor-pointer">
                    <i className="ri-delete-bin-line text-sm"></i>
                  </button>
                </div>
              ) : (
                <button onClick={() => fileRef.current?.click()}
                  className="flex items-center gap-2 text-xs text-gray-400 hover:text-[#1c2b3a] transition-colors cursor-pointer">
                  <i className="ri-upload-cloud-2-line text-sm"></i>
                  Attach a file
                </button>
              )
            ) : attachments.length === 0 ? (
              <button onClick={() => (canEdit || isNew) && fileRef.current?.click()}
                className="w-full flex flex-col items-center gap-1.5 py-6 border border-dashed border-gray-200 rounded-xl text-gray-400 hover:border-[#1c2b3a]/40 hover:text-[#1c2b3a] hover:bg-orange-50/30 transition-all cursor-pointer">
                <i className="ri-upload-cloud-2-line text-xl"></i>
                <span className="text-xs">Click to upload a file</span>
              </button>
            ) : (
              <div className="space-y-2">
                {attachments.map(att => {
                  const isImg = isImageAttachment(att);
                  const canPreview = canInlinePreview(att);
                  const openAtt = () => canPreview ? setPreviewAttachment(att) : window.open(att.url, '_blank');
                  return (
                    <div key={att.id}
                      onClick={openAtt}
                      className="flex items-center gap-3 p-2.5 bg-gray-50 rounded-xl group cursor-pointer hover:bg-gray-100 transition-colors">
                      <div className="w-12 h-12 rounded-lg bg-gray-200 flex items-center justify-center flex-shrink-0 overflow-hidden">
                        {isImg && getAttachmentThumbnailUrl(att)
                          ? <img src={getAttachmentThumbnailUrl(att)!} alt={att.name} className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display='none'; }} />
                          : <i className={`${isImg ? 'ri-image-line text-sky-500' : 'ri-file-3-line text-gray-500'} text-lg`}></i>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{att.name}</p>
                        <p className="text-xs text-gray-400">
                          {att.size ? `${fmtBytes(att.size)} · ` : ''}
                          {new Date(att.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}{' '}
                          {new Date(att.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                        </p>
                      </div>
                      {canPreview && (
                        <span className="text-xs text-sky-600 group-hover:text-sky-700 whitespace-nowrap">Preview</span>
                      )}
                      <button onClick={e => { e.stopPropagation(); deleteAttachment(att); }}
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
            const isImage = !isRawImageFile(commentPreview.name) && commentPreview.mime?.startsWith('image/');
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
            <div className="px-8 py-5 border-t border-gray-100/80">
              <div className="flex items-center gap-2 mb-4">
                <p className="text-xs font-medium text-gray-400">Comments</p>
                {comments.length > 0 && <span className="text-[10px] bg-gray-100 text-gray-500 font-medium px-1.5 py-0.5 rounded-full">{comments.length}</span>}
              </div>
              <div className="space-y-4 mb-4">
                {comments.length === 0 && (
                  <p className="text-xs text-gray-400 text-center py-3">No comments yet — be the first</p>
                )}
                {comments.map(c => (
                  <div key={c.id} className="flex gap-2.5 group">
                    <Avatar name={c.hub_users?.full_name ?? c.author_name ?? '?'} url={c.hub_users?.avatar_url ?? c.author_avatar_url} size={7} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-semibold text-gray-800">{c.hub_users?.full_name ?? c.author_name ?? 'Unknown'}</span>
                        <span className="text-[10px] text-gray-400">{timeAgo(c.created_at)}</span>
                        {(c.seen_by ?? []).length > 0 && (
                          <span
                            className="inline-flex items-center gap-0.5 text-[10px] text-gray-300"
                            title={`Seen by ${(c.seen_by ?? []).map(id => teamMembers.find(m => m.id === id)?.full_name ?? 'someone').join(', ')}`}>
                            <i className="ri-eye-line"></i>{(c.seen_by ?? []).length}
                          </span>
                        )}
                        {c.user_id === currentUserId && (
                          <div className="ml-auto flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-all">
                            <button onClick={() => { setEditingCommentId(c.id); setEditingCommentBody(bodyToEditorHTML(c.body)); }}
                              className="text-gray-300 hover:text-sky-500 text-xs cursor-pointer"><i className="ri-pencil-line"></i></button>
                            <button onClick={() => deleteComment(c.id)}
                              className="text-gray-300 hover:text-rose-500 text-xs cursor-pointer"><i className="ri-delete-bin-line"></i></button>
                          </div>
                        )}
                      </div>
                      {editingCommentId === c.id ? (
                        <div className="space-y-1.5">
                          <CommentEditor
                            ref={editEditorRef}
                            users={teamMembers.filter(m => m.id !== currentUserId)}
                            initialHTML={editingCommentBody}
                            autoFocus
                            minHeight={40}
                            onSubmit={() => saveEditedComment(c.id)}
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 bg-white focus-within:ring-1 focus-within:ring-[#1c2b3a]/30 transition-shadow"
                          />
                          <div className="flex gap-2">
                            <button onClick={() => saveEditedComment(c.id)}
                              className="px-3 py-1 text-xs bg-[#111827] text-white rounded-lg cursor-pointer">Save</button>
                            <button onClick={() => setEditingCommentId(null)} className="px-3 py-1 text-xs text-gray-400 hover:text-gray-600 cursor-pointer">Cancel</button>
                          </div>
                        </div>
                      ) : (
                      <>
                        {c.body && <div
                          className={`text-sm text-gray-700 leading-relaxed ${renderCommentBody(c.body).isHtml ? '[&_a]:text-blue-600 [&_a]:underline [&_ul]:list-disc [&_ul]:ml-5 [&_ol]:list-decimal [&_ol]:ml-5 [&_li]:my-0.5' : 'whitespace-pre-wrap'}`}
                          dangerouslySetInnerHTML={{ __html: renderCommentBody(c.body).html }}
                        />}
                        {(() => {
                          const atts: CommentAttachment[] = c.attachments?.length
                            ? c.attachments
                            : c.attachment_url
                              ? [{ url: c.attachment_url, name: c.attachment_name ?? 'File', size: c.attachment_size, mime: c.attachment_mime }]
                              : [];
                          if (atts.length === 0) return null;
                          const images = atts.filter(a => !isRawImageFile(a.name) && a.mime?.startsWith('image/'));
                          const files = atts.filter(a => isRawImageFile(a.name) || !a.mime?.startsWith('image/'));
                          return (
                            <div className="mt-1.5 space-y-1.5">
                              {images.length > 0 && (
                                <div className="flex flex-wrap gap-1.5">
                                  {images.map((a, i) => {
                                    const fid = driveFileIdFromUrl(a.url);
                                    const thumbUrl = fid ? `https://drive.google.com/thumbnail?id=${fid}&sz=w400` : a.url;
                                    const downloadUrl = fid ? `https://drive.google.com/uc?export=download&id=${fid}` : a.url;
                                    return (
                                      <div key={i} className="relative group/att">
                                        <button onClick={() => setCommentPreview({ url: a.url, name: a.name, mime: a.mime })}
                                          className={`block rounded-lg overflow-hidden border border-gray-200 hover:opacity-90 transition-opacity cursor-pointer ${images.length === 1 ? 'max-w-[220px]' : 'w-[106px] h-[106px]'}`}>
                                          <img src={thumbUrl} alt={a.name} className={`w-full object-cover ${images.length === 1 ? '' : 'h-full'}`} />
                                        </button>
                                        <a href={downloadUrl} target="_blank" rel="noopener noreferrer" download title="Download"
                                          onClick={e => e.stopPropagation()}
                                          className="absolute top-1 right-1 w-6 h-6 rounded-md bg-black/50 text-white flex items-center justify-center opacity-0 group-hover/att:opacity-100 transition-opacity">
                                          <i className="ri-download-line text-xs"></i>
                                        </a>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                              {files.map((a, i) => {
                                const fid = driveFileIdFromUrl(a.url);
                                const downloadUrl = fid ? `https://drive.google.com/uc?export=download&id=${fid}` : a.url;
                                return (
                                  <div key={i} role="button" tabIndex={0}
                                    onClick={() => setCommentPreview({ url: a.url, name: a.name, mime: a.mime })}
                                    onKeyDown={e => { if (e.key === 'Enter') setCommentPreview({ url: a.url, name: a.name, mime: a.mime }); }}
                                    title="Preview"
                                    className="inline-flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 max-w-xs mr-1.5 cursor-pointer hover:bg-gray-100 transition-colors">
                                    <i className="ri-file-line text-gray-400 text-sm flex-shrink-0"></i>
                                    <span className="text-xs text-gray-700 truncate flex-1">{a.name}</span>
                                    {a.size != null && <span className="text-[10px] text-gray-400 flex-shrink-0">{(a.size / 1024).toFixed(0)} KB</span>}
                                    <i className="ri-eye-line text-xs text-gray-400 ml-1 flex-shrink-0"></i>
                                    <a href={downloadUrl} target="_blank" rel="noopener noreferrer" download
                                      onClick={e => e.stopPropagation()}
                                      title="Download" className="text-gray-400 hover:text-emerald-500 transition-colors flex-shrink-0">
                                      <i className="ri-download-line text-xs"></i>
                                    </a>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })()}
                        {/* Reactions */}
                        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                          {Object.entries(c.reactions).map(([emoji, reactors]) => {
                            if (!reactors || reactors.length === 0) return null;
                            const hasReacted = reactors.includes(currentUserId ?? '');
                            return (
                              <button
                                key={emoji}
                                onClick={() => toggleReaction(c.id, emoji)}
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-all cursor-pointer ${hasReacted ? 'bg-orange-50 border-orange-200 text-orange-600' : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-gray-300'}`}
                              >
                                <span>{emoji}</span>
                                <span className="font-medium">{reactors.length}</span>
                              </button>
                            );
                          })}
                          {/* Add reaction button — click to open, stays open until you pick or dismiss */}
                          <div className="relative">
                            <button
                              onClick={() => setReactionPickerFor(p => p === c.id ? null : c.id)}
                              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] border transition-all cursor-pointer ${reactionPickerFor === c.id ? 'border-gray-300 text-gray-500 bg-gray-50' : 'border-dashed border-gray-200 text-gray-300 hover:border-gray-300 hover:text-gray-500 opacity-0 group-hover:opacity-100'} ${Object.values(c.reactions).some(r => r && r.length > 0) ? '!opacity-100' : ''}`}>
                              <i className="ri-emotion-line text-xs"></i>
                            </button>
                            {reactionPickerFor === c.id && (
                              <>
                                <div className="fixed inset-0 z-10" onClick={() => setReactionPickerFor(null)} />
                                <div className="absolute bottom-full mb-1.5 left-0 z-20 w-max bg-white border border-gray-200 rounded-xl shadow-xl p-1.5 grid grid-cols-6 gap-0.5">
                                  {QUICK_REACTIONS.map(emoji => (
                                    <button
                                      key={emoji}
                                      onClick={() => { toggleReaction(c.id, emoji); setReactionPickerFor(null); }}
                                      className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-base cursor-pointer transition-colors hover:scale-110"
                                    >
                                      {emoji}
                                    </button>
                                  ))}
                                </div>
                              </>
                            )}
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
                  <CommentEditor
                    ref={commentEditorRef}
                    users={teamMembers.filter(m => m.id !== currentUserId)}
                    placeholder="Add a comment — type @ to mention someone"
                    onSubmit={postComment}
                    onTextChange={setNewComment}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 bg-white focus-within:ring-2 focus-within:ring-[#1c2b3a]/30 transition-shadow"
                  />
                  {/* Selected files preview */}
                  {commentFiles.length > 0 && (
                    <div className="mt-1.5 bg-gray-50 border border-gray-200 rounded-lg overflow-hidden">
                      {commentFiles.map((f, i) => (
                        <div key={i} className="flex items-center gap-2 px-2.5 py-1.5 border-b border-gray-100 last:border-b-0">
                          <i className={`${f.type.startsWith('image/') ? 'ri-image-line' : 'ri-file-line'} text-gray-400 text-sm flex-shrink-0`}></i>
                          <span className="text-xs text-gray-600 truncate flex-1">{f.name}</span>
                          <span className="text-[10px] text-gray-400 flex-shrink-0">{(f.size / 1024).toFixed(0)} KB</span>
                          {uploadProgress === null && (
                            <button type="button" onClick={() => { setCommentFiles(prev => prev.filter((_, j) => j !== i)); setCommentFileError(null); if (commentFileRef.current) commentFileRef.current.value = ''; }}
                              className="text-gray-300 hover:text-red-400 flex-shrink-0 cursor-pointer">
                              <i className="ri-close-line text-sm"></i>
                            </button>
                          )}
                        </div>
                      ))}
                      {uploadProgress !== null && (
                        <>
                          <div className="px-2.5 py-1 text-right">
                            <span className="text-[10px] text-[#1c2b3a] font-medium">{uploadProgress}%</span>
                          </div>
                          <div className="h-0.5 bg-gray-200">
                            <div className="h-full bg-[#1c2b3a] transition-all duration-300 ease-out"
                              style={{ width: `${uploadProgress}%` }} />
                          </div>
                        </>
                      )}
                    </div>
                  )}
                  {commentFileError && <p className="text-xs text-red-500 mt-1">{commentFileError}</p>}
                  {/* Toolbar row */}
                  <div className="flex items-center gap-1 mt-1.5">
                    <button type="button" title="Attach file" onClick={() => commentFileRef.current?.click()}
                      className="w-7 h-7 flex items-center justify-center rounded-md text-gray-300 hover:text-gray-500 hover:bg-gray-100 cursor-pointer transition-colors">
                      <i className="ri-attachment-2 text-sm"></i>
                    </button>
                    <input ref={commentFileRef} type="file" multiple className="hidden" onChange={e => {
                      const picked = Array.from(e.target.files ?? []);
                      if (picked.length === 0) return;
                      const tooBig = picked.find(f => f.size > 100 * 1024 * 1024);
                      if (tooBig) {
                        setCommentFileError(`File too large (max 100 MB). "${tooBig.name}" is ${(tooBig.size / 1024 / 1024).toFixed(1)} MB.`);
                        return;
                      }
                      setCommentFiles(prev => [...prev, ...picked]);
                      setCommentFileError(null);
                      e.target.value = '';
                    }} />
                    <div className="ml-auto flex items-center gap-1.5">
                      <span className="text-[10px] text-gray-300">Enter to send</span>
                      <button onClick={postComment} disabled={postingComment || (!newComment.trim() && commentFiles.length === 0)}
                        className="w-7 h-7 bg-[#1c2b3a] disabled:opacity-25 rounded-lg flex items-center justify-center cursor-pointer flex-shrink-0 transition-opacity">
                        <i className={`${postingComment ? 'ri-loader-4-line animate-spin' : 'ri-send-plane-fill'} text-white text-xs`}></i>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Activity — collapsed by default to keep the panel calm */}
          {!isNew && activity.length > 0 && (
            <div className="px-8 py-4 border-t border-gray-100/80">
              <button onClick={() => setShowActivity(v => !v)}
                className="flex items-center gap-1.5 text-xs font-medium text-gray-400 hover:text-gray-600 cursor-pointer transition-colors">
                <i className={`ri-arrow-right-s-line text-sm transition-transform ${showActivity ? 'rotate-90' : ''}`}></i>
                Activity
                <span className="text-[10px] bg-gray-100 text-gray-500 font-medium px-1.5 py-0.5 rounded-full">{activity.length}</span>
              </button>
              {showActivity && (
              <div className="space-y-2.5 mt-3">
                {activity.map(a => (
                  <div key={a.id} className="flex items-start gap-2.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-gray-300 mt-1.5 flex-shrink-0"></div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-600">
                        <span className="font-semibold text-gray-800">{a.actor_name.split(' ')[0]}</span>
                        {' '}{a.description}
                      </p>
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        {(() => {
                          const d = new Date(a.created_at);
                          const diff = (Date.now() - d.getTime()) / 1000;
                          if (diff < 60) return 'just now';
                          if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
                          if (diff < 86400 * 3) return `${Math.floor(diff / 3600)}h ago`;
                          return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} · ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
                        })()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              )}
            </div>
          )}
        </div>

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        {(editing || isNew || hasUnsavedChanges) && (
          <div className="border-t border-gray-100 px-8 py-4 flex items-center gap-3 bg-white flex-shrink-0">
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
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-red-500">{saveError}</p>
                    <button onClick={() => handleSave()} className="text-xs text-red-500 underline cursor-pointer hover:text-red-700">Retry</button>
                  </div>
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
                  <button onClick={() => handleSave()} disabled={saving || !title.trim()}
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
