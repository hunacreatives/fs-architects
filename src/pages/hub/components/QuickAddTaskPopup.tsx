import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '@/lib/supabase';
import { normalizeTaskAssigneePayload } from '@/lib/taskAssignments';

interface Props {
  date: string;
  anchorRect: DOMRect;
  projects: { id: number; project_name: string }[];
  teamMembers: { id: string; full_name: string }[];
  defaultProjectId?: number;
  onClose: () => void;
  onCreated: () => void;
  onMoreOptions: () => void;
}

const PRIORITIES: { key: 'low' | 'medium' | 'high'; label: string; cls: string }[] = [
  { key: 'low', label: 'Low', cls: 'bg-gray-100 text-gray-500' },
  { key: 'medium', label: 'Medium', cls: 'bg-amber-100 text-amber-700' },
  { key: 'high', label: 'High', cls: 'bg-rose-100 text-rose-600' },
];

// A richer quick-add than Google Calendar's own popup — title, project,
// assignee, priority, and a short description all live right here, since
// those are the fields actually needed most of the time. "More options"
// is still there for the rest (checklist, attachments, comments, custom
// fields), but it's no longer where the basics have to happen.
export default function QuickAddTaskPopup({ date, anchorRect, projects, teamMembers, defaultProjectId, onClose, onCreated, onMoreOptions }: Props) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [projectId, setProjectId] = useState<number>(defaultProjectId ?? projects[0]?.id ?? 0);
  const [assigneeId, setAssigneeId] = useState<string>('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [saving, setSaving] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    const onClickAway = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', onClickAway);
    return () => document.removeEventListener('mousedown', onClickAway);
  }, [onClose]);

  const POPUP_WIDTH = 320;
  const POPUP_HEIGHT_EST = 400;
  const margin = 8;
  let top = anchorRect.bottom + margin;
  let left = anchorRect.left;
  if (left + POPUP_WIDTH > window.innerWidth - margin) left = window.innerWidth - POPUP_WIDTH - margin;
  if (left < margin) left = margin;
  if (top + POPUP_HEIGHT_EST > window.innerHeight - margin) top = Math.max(margin, anchorRect.top - POPUP_HEIGHT_EST - margin);

  const dateLabel = new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  const handleSave = async () => {
    if (!title.trim() || !projectId || saving) return;
    setSaving(true);
    const { error } = await supabase.from('hub_project_tasks').insert({
      title: title.trim(),
      description: description.trim() || null,
      project_id: projectId,
      due_date: date,
      status: 'todo',
      priority,
      ...normalizeTaskAssigneePayload(assigneeId ? [assigneeId] : []),
    });
    setSaving(false);
    if (!error) {
      onCreated();
      onClose();
    }
  };

  return createPortal(
    <div
      ref={popupRef}
      style={{ position: 'fixed', top, left, width: POPUP_WIDTH, zIndex: 80, maxHeight: `calc(100vh - ${top + margin}px)` }}
      className="bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden flex flex-col"
    >
      <div className="flex items-center justify-between px-4 pt-3 pb-1.5 flex-shrink-0">
        <p className="text-xs font-semibold text-gray-400">{dateLabel}</p>
        <button onClick={onClose} className="w-6 h-6 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 cursor-pointer">
          <i className="ri-close-line text-sm"></i>
        </button>
      </div>
      <div className="px-4 pb-3 space-y-3 overflow-y-auto">
        <input
          ref={inputRef}
          value={title}
          onChange={e => setTitle(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) handleSave(); }}
          placeholder="Add a title"
          className="w-full px-1 py-2 text-sm border-b border-gray-200 focus:outline-none focus:border-[#1c2b3a]"
        />

        {projects.length > 0 && (
          <div className="space-y-1">
            <label className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Project</label>
            <select
              value={projectId}
              onChange={e => setProjectId(Number(e.target.value))}
              className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 bg-white cursor-pointer"
            >
              {projects.map(p => <option key={p.id} value={p.id}>{p.project_name}</option>)}
            </select>
          </div>
        )}

        <div className="space-y-1">
          <label className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Assignee</label>
          <select
            value={assigneeId}
            onChange={e => setAssigneeId(e.target.value)}
            className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 bg-white cursor-pointer"
          >
            <option value="">Unassigned</option>
            {teamMembers.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Priority</label>
          <div className="flex gap-1.5">
            {PRIORITIES.map(p => (
              <button key={p.key} type="button" onClick={() => setPriority(p.key)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium cursor-pointer transition-colors ${priority === p.key ? p.cls : 'bg-gray-50 text-gray-400 hover:bg-gray-100'}`}>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Description</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={2}
            placeholder="Optional notes..."
            className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 resize-none"
          />
        </div>
      </div>
      <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 flex-shrink-0">
        <button onClick={onMoreOptions} className="text-xs font-medium text-[#1c2b3a] hover:underline cursor-pointer">
          More options
        </button>
        <button
          onClick={handleSave}
          disabled={saving || !title.trim()}
          className="px-4 py-1.5 text-xs font-semibold text-white bg-[#1c2b3a] rounded-lg hover:bg-[#111827] disabled:opacity-40 cursor-pointer"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>,
    document.body
  );
}
