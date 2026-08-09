import React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import ContractorLayout from '@/pages/hub/components/ContractorLayout';
import { useAuth } from '@/contexts/AuthContext';
import { useHubAuth } from '@/hooks/useHubAuth';
import { useDemo } from '@/contexts/DemoContext';
import { supabase } from '@/lib/supabase';
import { DEMO_CONTRACTOR_PROJECTS, DEMO_CONTRACTOR_TASKS, DEMO_CONTRACTOR_TEAM } from '@/lib/demoData';
import TaskDetailPanel from '@/pages/hub/components/TaskDetailPanel';
import { localToday, slugify } from '@/lib/formatUtils';
import { createTaskAttachment } from '@/lib/taskAttachments';
import { getTaskDescriptionPreview } from '@/pages/hub/utils/taskPreview';
import { getPrimaryTaskAssigneeId, getTaskAssigneeIds, normalizeTaskAssigneePayload } from '@/lib/taskAssignments';
import HubAvatar from '@/pages/hub/components/HubAvatar';
import { getProjectTypeLabel, getProjectTypePalette } from '@/lib/projectTypes';

const STAGES = [
  'Pre-Design', 'Schematic Design', 'Design Development', 'Construction Documents',
  'Permitting', 'Bidding/Procurement', 'Construction Administration', 'Post-Construction/Closeout',
];

function normalizeTaskActivityAction(type: string) {
  switch (type) {
    case 'created':
      return 'task_created';
    case 'status_change':
      return 'task_status_changed';
    case 'assigned':
      return 'task_assigned';
    case 'comment_added':
      return 'comment_added';
    case 'attachment_added':
      return 'attachment_added';
    default:
      return type;
  }
}

interface TeamMember { id: string; full_name: string; avatar_url: string | null; }

interface ProjectRow {
  id: number;
  hub_projects: {
    id: number;
    project_type: 'client' | 'internal';
    client_name: string;
    project_name: string;
    service: string | null;
    project_type_code: string | null;
    project_code: string | null;
    status: string;
    stage: string;
    start_date: string | null;
    deadline: string | null;
    notes: string | null;
    drive_url: string | null;
    slug: string | null;
  };
}

interface ProjectTask {
  id: number;
  project_id: number;
  title: string;
  description: string | null;
  status: 'todo' | 'in_progress' | 'in_review' | 'blocked' | 'done';
  priority: 'low' | 'medium' | 'high';
  due_date: string | null;
  start_date: string | null;
  assigned_to: string | null;
  assignee_ids?: string[] | null;
  checklist?: { id: string; text: string; done: boolean; detail?: string; assignee_id?: string | null }[] | null;
  archived?: boolean | null;
  archived_at?: string | null;
}

const emptyTaskForm = () => ({
  title: '',
  description: '',
  status: 'todo' as ProjectTask['status'],
  priority: 'medium' as ProjectTask['priority'],
  start_date: '',
  due_date: '',
  assigned_to: '',
});

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

// ── Calendar view (replaces Gantt) ────────────────────────────────────────
function GanttTimeline({ tasks, projectStart, projectEnd, today }: {
  tasks: ProjectTask[];
  projectStart: string | null;
  projectEnd: string | null;
  today: string;
}) {
  const anchor = new Date(today + 'T00:00:00');
  const [viewMonth, setViewMonth] = useState<Date>(new Date(anchor.getFullYear(), anchor.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState<string | null>(today);

  void projectStart; void projectEnd;

  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();

  const prevMonth = () => setViewMonth(new Date(year, month - 1, 1));
  const nextMonth = () => setViewMonth(new Date(year, month + 1, 1));
  const goToday   = () => { setViewMonth(new Date(anchor.getFullYear(), anchor.getMonth(), 1)); setSelectedDate(today); };

  const monthLabel = viewMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const firstDay = new Date(year, month, 1);
  const startPad = (firstDay.getDay() + 6) % 7; // Mon-based
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalCells = Math.ceil((startPad + daysInMonth) / 7) * 7;
  const pad2 = (n: number) => String(n).padStart(2, '0');

  const PALETTE = [
    { chip: 'bg-slate-100 text-[#1c2b3a]', dot: 'bg-[#1c2b3a]/60' },
    { chip: 'bg-sky-100 text-sky-700',       dot: 'bg-sky-400' },
    { chip: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-400' },
    { chip: 'bg-amber-100 text-amber-700',   dot: 'bg-amber-400' },
    { chip: 'bg-pink-100 text-pink-700',     dot: 'bg-pink-400' },
    { chip: 'bg-slate-100 text-[#1c2b3a]', dot: 'bg-[#1c2b3a]/50' },
    { chip: 'bg-teal-100 text-teal-700',     dot: 'bg-teal-400' },
    { chip: 'bg-slate-100 text-[#1c2b3a]', dot: 'bg-[#1c2b3a]/70' },
    { chip: 'bg-lime-100 text-lime-700',     dot: 'bg-lime-400' },
    { chip: 'bg-rose-100 text-rose-700',     dot: 'bg-rose-400' },
  ];
  const colorMap = Object.fromEntries(tasks.map((t, i) => [t.id, PALETTE[i % PALETTE.length]]));

  const getChipCls = (t: ProjectTask): string => {
    if (t.due_date && t.due_date < today && t.status !== 'done') return 'bg-rose-100 text-rose-600';
    if ((t as any).color) return '';
    return colorMap[t.id]?.chip ?? 'bg-slate-100 text-[#1c2b3a]';
  };
  const getChipStyle = (t: ProjectTask): React.CSSProperties | undefined => {
    if ((t as any).color && !(t.due_date && t.due_date < today && t.status !== 'done')) {
      return { background: (t as any).color, color: '#fff' };
    }
    return undefined;
  };
  const getDotCls = (t: ProjectTask): string => {
    if (t.due_date && t.due_date < today && t.status !== 'done') return 'bg-rose-400';
    if ((t as any).color) return 'bg-white/70';
    return colorMap[t.id]?.dot ?? 'bg-[#1c2b3a]/70';
  };

  // ── Week-row lane assignment ──────────────────────────────────────────────
  // Each task gets a fixed lane per week row so bars stay aligned.
  const MAX_LANES = 3;

  type LaneEntry = { task: ProjectTask; lane: number; spanStart: boolean; spanEnd: boolean };
  type WeekRow = { dates: (string | null)[]; lanes: LaneEntry[]; overflowByDate: Record<string, number> };

  const weekRows: WeekRow[] = [];
  for (let wi = 0; wi < totalCells; wi += 7) {
    const dates: (string | null)[] = [];
    for (let di = 0; di < 7; di++) {
      const dn = (wi + di) - startPad + 1;
      dates.push(dn >= 1 && dn <= daysInMonth ? `${year}-${pad2(month + 1)}-${pad2(dn)}` : null);
    }
    const weekDates = dates.filter(Boolean) as string[];
    const weekStart = weekDates[0] ?? '';
    const weekEnd   = weekDates[weekDates.length - 1] ?? '';

    const weekTasks = tasks
      .filter(t => {
        if (!t.due_date) return false;
        const ts = t.start_date ?? t.due_date;
        return ts <= weekEnd && t.due_date >= weekStart;
      })
      .sort((a, b) => {
        const as_ = a.start_date ?? a.due_date ?? '';
        const bs_ = b.start_date ?? b.due_date ?? '';
        return as_.localeCompare(bs_) || a.id - b.id;
      });

    const laneEnd: string[] = []; // laneEnd[i] = last date occupying lane i
    const lanes: LaneEntry[] = [];
    const overflowByDate: Record<string, number> = {};

    for (const t of weekTasks) {
      const ts = t.start_date ?? t.due_date ?? '';
      const te = t.due_date ?? '';
      let lane = laneEnd.findIndex(e => e < ts);
      if (lane === -1) lane = laneEnd.length;
      laneEnd[lane] = te;

      if (lane < MAX_LANES) {
        lanes.push({ task: t, lane, spanStart: ts >= weekStart, spanEnd: te <= weekEnd });
      } else {
        // count overflow per date for "+N more"
        const effStart = ts < weekStart ? weekStart : ts;
        const effEnd   = te > weekEnd   ? weekEnd   : te;
        const cur = new Date(effStart + 'T00:00:00');
        const endD = new Date(effEnd + 'T00:00:00');
        while (cur <= endD) {
          const k = `${cur.getFullYear()}-${pad2(cur.getMonth() + 1)}-${pad2(cur.getDate())}`;
          overflowByDate[k] = (overflowByDate[k] ?? 0) + 1;
          cur.setDate(cur.getDate() + 1);
        }
      }
    }

    weekRows.push({ dates, lanes, overflowByDate });
  }

  // tasksByDate for selected-day bottom panel only
  const tasksByDate: Record<string, ProjectTask[]> = {};
  for (const t of tasks) {
    if (!t.due_date) continue;
    const cur = new Date((t.start_date ?? t.due_date) + 'T00:00:00');
    const endD = new Date(t.due_date + 'T00:00:00');
    while (cur <= endD) {
      const k = `${cur.getFullYear()}-${pad2(cur.getMonth() + 1)}-${pad2(cur.getDate())}`;
      (tasksByDate[k] ??= []).push(t);
      cur.setDate(cur.getDate() + 1);
    }
  }
  const selectedTasks = selectedDate ? (tasksByDate[selectedDate] ?? []) : [];

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <i className="ri-calendar-line text-[#1c2b3a]/50 text-base"></i>
          <h3 className="font-semibold text-gray-800 text-sm">{monthLabel}</h3>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={prevMonth} className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer">
            <i className="ri-arrow-left-s-line text-base"></i>
          </button>
          <button onClick={goToday} className="px-2.5 py-1 rounded-lg text-[11px] font-medium text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors cursor-pointer">
            Today
          </button>
          <button onClick={nextMonth} className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer">
            <i className="ri-arrow-right-s-line text-base"></i>
          </button>
        </div>
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 border-b border-gray-100">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
          <div key={d} className={`py-2 text-center text-[10px] font-semibold uppercase tracking-wide ${d === 'Sat' || d === 'Sun' ? 'text-gray-300' : 'text-gray-400'}`}>{d}</div>
        ))}
      </div>

      {/* Calendar grid — rendered week by week for consistent lane alignment */}
      <div>
        {weekRows.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7">
            {week.dates.map((cellDate, di) => {
              const inMonth = cellDate !== null;
              const dayNum = cellDate ? parseInt(cellDate.split('-')[2]) : 0;
              const isToday = cellDate === today;
              const isSelected = cellDate !== null && cellDate === selectedDate;
              const isWeekend = di === 5 || di === 6;
              const overflow = cellDate ? (week.overflowByDate[cellDate] ?? 0) : 0;

              // Fill 3 fixed lane slots — null means empty (renders as spacer)
              const slots: (LaneEntry | null)[] = [null, null, null];
              for (const entry of week.lanes) {
                const ts = entry.task.start_date ?? entry.task.due_date ?? '';
                const te = entry.task.due_date ?? '';
                if (cellDate && ts <= cellDate && te >= cellDate) {
                  slots[entry.lane] = entry;
                }
              }

              return (
                <div
                  key={di}
                  onClick={() => inMonth && cellDate && setSelectedDate(isSelected ? null : cellDate)}
                  className={[
                    'min-h-[96px] border-b border-r border-gray-50 flex flex-col',
                    !inMonth ? 'bg-gray-50/30' : '',
                    isWeekend && inMonth ? 'bg-gray-50/50' : '',
                    isSelected ? 'ring-2 ring-inset ring-slate-300' : '',
                    inMonth ? 'cursor-pointer hover:bg-slate-50/30 transition-colors' : '',
                  ].filter(Boolean).join(' ')}
                >
                  {/* Date number */}
                  <div className="flex justify-end p-1.5 pb-1">
                    <span className={[
                      'text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full',
                      isToday ? 'bg-slate-500 text-white font-bold' : '',
                      !inMonth ? 'text-gray-300' : isToday ? '' : 'text-gray-600',
                    ].filter(Boolean).join(' ')}>
                      {inMonth ? dayNum : ''}
                    </span>
                  </div>

                  {/* Lane rows — fixed height per lane keeps bars horizontally aligned */}
                  <div className="flex flex-col gap-px pb-1">
                    {slots.map((slot, laneIdx) => {
                      if (!slot || !cellDate) {
                        // Empty spacer keeps other lanes in position
                        return <div key={laneIdx} className="h-5" />;
                      }
                      const t = slot.task;
                      const ts = t.start_date ?? t.due_date ?? '';
                      const te = t.due_date ?? '';
                      const isActualStart = cellDate === ts;
                      const isActualEnd   = cellDate === te;
                      // Show label on first visible day in this week row
                      const weekFirstDay = week.dates.find(Boolean) ?? '';
                      const showLabel = isActualStart || (!slot.spanStart && cellDate === weekFirstDay);
                      // Rounded corners only at true start/end
                      const rl = slot.spanStart ? (isActualStart  ? 'rounded-l-full ml-1' : 'rounded-l-none -ml-px') : 'rounded-l-none -ml-px';
                      const rr = slot.spanEnd   ? (isActualEnd    ? 'rounded-r-full mr-1' : 'rounded-r-none -mr-px') : 'rounded-r-none -mr-px';

                      return (
                        <div key={laneIdx}
                          style={getChipStyle(t)}
                          className={`h-5 flex items-center text-[10px] font-medium overflow-hidden ${getChipCls(t)} ${rl} ${rr}`}
                        >
                          {showLabel && (
                            <>
                              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ml-1.5 ${getDotCls(t)}`} />
                              <span className="truncate ml-1 pr-1">{t.title}</span>
                            </>
                          )}
                        </div>
                      );
                    })}
                    {overflow > 0 && (
                      <div className="text-[10px] text-gray-400 px-1.5">+{overflow} more</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Selected day task list */}
      {selectedDate && (
        <div className="border-t border-gray-100 px-5 py-4">
          <p className="text-xs font-semibold text-gray-500 mb-2">
            {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
          {selectedTasks.length === 0 ? (
            <p className="text-xs text-gray-300">No tasks due on this day</p>
          ) : (
            <div className="space-y-1.5">
              {selectedTasks.map(t => {
                const isOverdue = t.due_date && t.due_date < today && t.status !== 'done';
                const statusIcon = t.status === 'done' ? 'ri-checkbox-circle-fill text-emerald-500' : t.status === 'in_progress' ? 'ri-loader-2-line text-sky-400' : 'ri-checkbox-blank-circle-line text-gray-300';
                return (
                  <div key={t.id} className="flex items-center gap-2.5">
                    <i className={`${statusIcon} text-base flex-shrink-0`}></i>
                    <span className={`text-sm flex-1 truncate ${t.status === 'done' ? 'line-through text-gray-400' : 'text-gray-700'}`}>{t.title}</span>
                    {isOverdue && <span className="text-[11px] text-rose-500 font-medium flex-shrink-0">Overdue</span>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Task row (used in feed and detail) ────────────────────────────────────
function TaskRow({ task, projectName, team }: { task: ProjectTask; projectName?: string; team?: TeamMember[] }) {
  const today = localToday();
  const isOverdue = task.due_date && task.due_date < today && task.status !== 'done';
  const priorityCls = { high: 'bg-rose-400', medium: 'bg-amber-400', low: 'bg-gray-300' }[task.priority];
  const statusIcon =
    task.status === 'done' ? 'ri-checkbox-circle-fill text-emerald-500' :
    task.status === 'in_progress' ? 'ri-loader-2-line text-blue-400' :
    'ri-checkbox-blank-circle-line text-gray-300';
  const assignees = getTaskAssigneeIds(task)
    .map((assigneeId) => team?.find((member) => member.id === assigneeId))
    .filter(Boolean);

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-2xl hover:bg-white/60 transition-colors">
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${priorityCls}`}></span>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium truncate ${task.status === 'done' ? 'line-through text-gray-400' : 'text-gray-800'}`}>{task.title}</p>
        {(projectName || assignees.length > 0) && (
          <p className="text-[11px] text-gray-400 truncate">
            {projectName}{assignees.length > 0 ? (projectName ? ` · ${assignees.map((assignee: any) => assignee.full_name).join(', ')}` : assignees.map((assignee: any) => assignee.full_name).join(', ')) : ''}
          </p>
        )}
      </div>
      {task.due_date && (
        <span className={`text-[11px] flex-shrink-0 font-medium ${isOverdue ? 'text-rose-500' : 'text-gray-400'}`}>
          {isOverdue ? 'Overdue' : new Date(task.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </span>
      )}
      <i className={`${statusIcon} text-base flex-shrink-0`}></i>
    </div>
  );
}

// ── Project card (summary) ─────────────────────────────────────────────────
function ProjectCard({ row, projectTasks, onClick }: {
  row: ProjectRow;
  projectTasks: ProjectTask[];
  onClick: () => void;
}) {
  const p = row.hub_projects;
  if (!p) return null;
  const today = localToday();
  const tasksDone = projectTasks.filter(t => t.status === 'done').length;
  const tasksPct = projectTasks.length > 0 ? Math.round((tasksDone / projectTasks.length) * 100) : 0;
  const overdueCount = projectTasks.filter(t => t.due_date && t.due_date < today && t.status !== 'done').length;
  const inProgressCount = projectTasks.filter(t => t.status === 'in_progress').length;
  const todoCount = projectTasks.filter(t => t.status === 'todo').length;
  const internalProject = p.project_type === 'internal';

  const daysLeft = p.deadline
    ? Math.ceil((new Date(p.deadline + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime()) / 86400000)
    : null;
  const isOverdue = !!(p.deadline && p.deadline < today && p.status !== 'completed');
  const palette = getProjectTypePalette(p.project_type_code);
  const typeLabel = getProjectTypeLabel(p.project_type_code);

  const statusLabel = { ongoing: 'Active', completed: 'Completed', paused: 'Paused', cancelled: 'Archived' }[p.status] ?? p.status;
  const healthLabel = (() => {
    if (p.status === 'cancelled') return 'Archived';
    if (p.status === 'completed') return 'Completed';
    if (overdueCount > 0) return 'Overdue';
    if (projectTasks.length === 0) return 'No tasks yet';
    if (daysLeft !== null && daysLeft <= 7) return 'Due this week';
    if (internalProject && inProgressCount > 0) return 'Internal sprint';
    return 'In progress';
  })();
  const healthCls =
    healthLabel === 'Archived' ? 'bg-gray-100 text-gray-500' :
    healthLabel === 'Completed' ? 'bg-emerald-100 text-emerald-700' :
    healthLabel === 'Overdue' ? 'bg-rose-100 text-rose-600' :
    healthLabel === 'Due this week' ? 'bg-amber-100 text-amber-700' :
    healthLabel === 'Internal sprint' ? 'bg-slate-100 text-[#1c2b3a]' :
    healthLabel === 'No tasks yet' ? 'bg-gray-100 text-gray-500' :
    'bg-sky-100 text-sky-600';

  return (
    <button onClick={onClick}
      className="w-full text-left rounded-3xl overflow-hidden hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200 cursor-pointer group"
      style={{ background: 'rgba(255,255,255,0.75)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.9)', boxShadow: '0 2px 20px rgba(0,0,0,0.06)' }}>

      <div className="p-4 space-y-3">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            {/* Eyebrow: project code + type */}
            {(p.project_code || typeLabel) && (
              <span className="inline-block text-[10px] font-semibold tracking-widest uppercase mb-1 text-[#1c2b3a]">
                {[p.project_code, typeLabel].filter(Boolean).join(' · ')}
              </span>
            )}
            {p.stage && (
              <span className="inline-block text-[10px] px-2 py-0.5 rounded-full font-medium bg-violet-50 text-violet-700 ml-1.5 mb-1 align-middle">
                {p.stage}
              </span>
            )}
            <h3 className="font-bold text-gray-900 text-sm leading-tight line-clamp-1 group-hover:text-gray-700 transition-colors">
              {p.project_name}
            </h3>
            <p className="text-xs text-gray-400 mt-0.5 truncate">
              {internalProject ? (
                <span className="inline-flex items-center gap-1"><i className="ri-building-line text-[10px]"></i>Internal Project</span>
              ) : p.client_name}
            </p>
          </div>

          {/* Status */}
          <span className={`text-[10px] px-2.5 py-1 rounded-full font-semibold flex-shrink-0 ${
            p.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
            p.status === 'paused' ? 'bg-amber-100 text-amber-700' :
            p.status === 'cancelled' ? 'bg-gray-100 text-gray-500' :
            'text-white'
          }`} style={p.status === 'ongoing' ? { background: `linear-gradient(135deg, ${palette.from}, ${palette.to})` } : {}}>
            {statusLabel}
          </span>
        </div>

        {/* Task progress */}
        {projectTasks.length > 0 && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-500">{tasksDone}/{projectTasks.length} tasks</span>
              <span className="font-semibold text-[11px]" style={{ color: tasksPct === 100 ? '#10b981' : palette.from }}>{tasksPct}%</span>
            </div>
            <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-500"
                style={{ width: `${tasksPct}%`, background: tasksPct === 100 ? '#10b981' : `linear-gradient(90deg, ${palette.from}, ${palette.to})` }} />
            </div>
          </div>
        )}

        {/* Footer row */}
        <div className="flex items-center justify-between gap-2 pt-1 border-t border-gray-100/80">
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${healthCls}`}>{healthLabel}</span>
          {daysLeft !== null ? (
            isOverdue
              ? <span className="text-[10px] text-rose-500 font-semibold">{Math.abs(daysLeft)}d overdue</span>
              : daysLeft === 0 ? <span className="text-[10px] text-amber-600 font-semibold">Due today</span>
              : daysLeft <= 7 ? <span className="text-[10px] text-amber-500">{daysLeft}d left</span>
              : <span className="text-[10px] text-gray-400">{new Date(p.deadline! + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
          ) : (
            <span className="text-[10px] text-gray-300">No deadline</span>
          )}
        </div>
      </div>
    </button>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────
export default function ContractorProjectsPage() {
  const { hubUser: realHubUser } = useAuth();
  const { hubUser: demoHubUser } = useHubAuth();
  const hubUser = realHubUser ?? demoHubUser;
  const { isDemo } = useDemo();
  const [searchParams] = useSearchParams();
  const deepLinkDone = useRef<string | null>(null);
  const [rows, setRows] = useState<ProjectRow[]>([]);
  const [tasks, setTasks] = useState<ProjectTask[]>([]);
  const [teamMap, setTeamMap] = useState<Record<number, TeamMember[]>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [workspaceRow, setWorkspaceRow] = useState<ProjectRow | null>(null);
  const [dashboardTab, setDashboardTab] = useState<'tasks' | 'projects'>('tasks');
  const [showCompletedTasks, setShowCompletedTasks] = useState(false);
  const [taskWindow, setTaskWindow] = useState<'daily' | 'weekly' | 'monthly'>('weekly');
  const [taskFilter, setTaskFilter] = useState<'all' | 'todo' | 'in_progress' | 'in_review' | 'blocked' | 'done' | 'overdue'>('all');
  const [showArchivedTasks, setShowArchivedTasks] = useState(false);
  const [taskView, setTaskView] = useState<'list' | 'board'>('list');
  const [editingTask, setEditingTask] = useState<ProjectTask | null>(null);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [detailPanelOpen, setDetailPanelOpen] = useState(false);
  const [taskForm, setTaskForm] = useState(emptyTaskForm());
  const [taskAttachment, setTaskAttachment] = useState<File | null>(null);
  const [taskSaving, setTaskSaving] = useState(false);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const taskAttachmentRef = useRef<HTMLInputElement>(null);
  const [deletingTaskId, setDeletingTaskId] = useState<number | null>(null);
  const [showActivityModal, setShowActivityModal] = useState(false);
  const [search, setSearch] = useState('');
  const [taskSearch, setTaskSearch] = useState('');
  const [wsSearch, setWsSearch] = useState('');
  const [wsSearchOpen, setWsSearchOpen] = useState(false);
  const [wsFocusSection, setWsFocusSection] = useState<string | null>(null); // null = show all
  const [linkCopied, setLinkCopied] = useState(false);
  const wsSearchRef = useRef<HTMLDivElement>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [projectRefreshKey, setProjectRefreshKey] = useState(0);
  const [taskComments, setTaskComments] = useState<{ id: number; user_id: string; body: string; created_at: string; hub_users: { full_name: string; avatar_url: string | null } | null }[]>([]);
  const [newComment, setNewComment] = useState('');
  const [postingComment, setPostingComment] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionStart, setMentionStart] = useState(0);
  const [drawerMode, setDrawerMode] = useState<'view' | 'edit'>('edit');
  const [, setTick] = useState(0); // forces re-render for live timestamps
  const [taskCommentCounts, setTaskCommentCounts] = useState<Record<number, number>>({});
  type ActivityItem = {
    id: number; action: string; entity_title: string; entity_id: number | null;
    meta: Record<string, unknown> | null; created_at: string;
    hub_users: { full_name: string; avatar_url: string | null } | null;
  };
  const [activityLog, setActivityLog] = useState<ActivityItem[]>([]);
  const [draggedTaskId, setDraggedTaskId] = useState<number | null>(null);
  const [boardDragOver, setBoardDragOver] = useState<ProjectTask['status'] | null>(null);

  const normalizeActivityItem = (row: any): ActivityItem => ({
    id: row.id,
    action: row.action ?? '',
    entity_title: row.entity_title ?? row.description ?? '',
    entity_id: row.entity_id ?? null,
    meta: row.meta ?? null,
    created_at: row.created_at,
    hub_users: (() => {
      const u = row.hub_users;
      const resolved = u && (!Array.isArray(u) || u.length > 0)
        ? (Array.isArray(u) ? u[0] : u)
        : null;
      return resolved ?? (row.actor_name ? { full_name: row.actor_name, avatar_url: null } : null);
    })(),
  });

  const updateTaskStatus = async (task: ProjectTask, newStatus: ProjectTask['status']) => {
    if (task.status === newStatus) return;
    // In demo mode just update local state
    if (isDemo) {
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: newStatus } : t));
      return;
    }
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: newStatus } : t));
    await supabase.from('hub_project_tasks').update({ status: newStatus }).eq('id', task.id);
    await logActivity('task_status_changed', task.title, task.id, { from: task.status, to: newStatus });
  };

  const cycleTask = async (task: ProjectTask) => {
    const next: Record<string, ProjectTask['status']> = { todo: 'in_progress', in_progress: 'done', done: 'todo' };
    const newStatus = next[task.status];
    await updateTaskStatus(task, newStatus);
  };

  const openAddTask = () => {
    setEditingTask(null);
    setDetailPanelOpen(true);
  };

  const openViewTask = (task: ProjectTask) => {
    setEditingTask(task);
    setDetailPanelOpen(true);
  };

  const openEditTask = (task: ProjectTask) => {
    setEditingTask(task);
    setTaskAttachment(null);
    if (taskAttachmentRef.current) taskAttachmentRef.current.value = '';
    setTaskForm({
      title: task.title,
      description: task.description ?? '',
      status: task.status,
      priority: task.priority,
      start_date: task.start_date ?? '',
      due_date: task.due_date ?? '',
      assigned_to: task.assigned_to ?? '',
    });
    setDrawerMode('edit');
    setShowTaskModal(true);
  };

  const saveTask = async () => {
    if (!taskForm.title.trim() || !workspaceRow?.hub_projects?.id) return;
    setTaskSaving(true);
    try {
      const existingColor = editingTask ? (tasks.find(t => t.id === editingTask.id) as any)?.color ?? null : null;
      const taskAssigneePayload = normalizeTaskAssigneePayload(taskForm.assigned_to ? [taskForm.assigned_to] : []);
      const payload = {
        title: taskForm.title.trim(),
        description: taskForm.description.trim() || null,
        status: taskForm.status,
        priority: taskForm.priority,
        start_date: taskForm.start_date || null,
        due_date: taskForm.due_date || null,
        ...taskAssigneePayload,
        ...(existingColor ? { color: existingColor } : {}),
      };
      if (editingTask) {
        const { error: updateErr } = await supabase.from('hub_project_tasks').update(payload).eq('id', editingTask.id);
        if (updateErr) throw updateErr;
        setTasks(prev => prev.map(t => t.id === editingTask.id ? { ...t, ...payload } : t));
        await logActivity('task_updated', taskForm.title.trim(), editingTask.id);
      } else {
        const { data, error: insertErr } = await supabase
          .from('hub_project_tasks')
          .insert({ ...payload, project_id: workspaceRow.hub_projects.id })
          .select()
          .single();
        if (insertErr) throw insertErr;
        if (data) {
          if (taskAttachment && hubUser?.id) {
            setUploadingAttachment(true);
            try {
              await createTaskAttachment({
                taskId: (data as ProjectTask).id,
                file: taskAttachment,
                uploadedBy: hubUser.id,
                projectId: workspaceRow.hub_projects.id,
                projectName: workspaceRow?.hub_projects?.project_name ?? 'General',
              });
            } finally {
              setUploadingAttachment(false);
            }
          }
          setTasks(prev => [...prev, data as ProjectTask]);
          await logActivity('task_created', taskForm.title.trim(), (data as ProjectTask).id);
          if (taskForm.assigned_to && hubUser && taskForm.assigned_to !== hubUser.id) {
            supabase.functions.invoke('notify-task-assigned', {
              body: {
                task_id: (data as ProjectTask).id,
                task_title: taskForm.title.trim(),
                project_id: workspaceRow.hub_projects.id,
                project_name: workspaceRow?.hub_projects?.project_name ?? '',
                assigned_to_id: taskForm.assigned_to,
                assigned_by_name: hubUser.full_name ?? 'Team',
              },
            }).catch(console.error);
          }
        }
      }
      setTaskAttachment(null);
      if (taskAttachmentRef.current) taskAttachmentRef.current.value = '';
      setShowTaskModal(false);
      setMentionOpen(false); setMentionQuery('');
    } catch (err) {
      console.error('Task save error:', err);
    } finally {
      setTaskSaving(false);
    }
  };

  const deleteTask = async (taskId: number) => {
    setDeletingTaskId(taskId);
    const t = tasks.find(t => t.id === taskId);
    const { error } = await supabase.from('hub_project_tasks').delete().eq('id', taskId);
    if (error) {
      console.error('Failed to delete project task', error);
      setDeletingTaskId(null);
      return;
    }
    if (t) await logActivity('task_deleted', t.title, t.id);
    setTasks(prev => prev.filter(t => t.id !== taskId));
    setDeletingTaskId(null);
  };

  // Live timestamp ticker — updates every 30s
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 30000);
    return () => clearInterval(t);
  }, []);

  // Fetch comment counts for all workspace tasks
  useEffect(() => {
    const projectId = workspaceRow?.hub_projects?.id;
    if (!projectId) { setTaskCommentCounts({}); return; }
    const ids = tasks.filter(t => t.project_id === projectId).map(t => t.id);
    if (!ids.length) { setTaskCommentCounts({}); return; }
    supabase
      .from('hub_project_task_comments')
      .select('task_id')
      .in('task_id', ids)
      .then(({ data }) => {
        const counts: Record<number, number> = {};
        for (const row of data ?? []) counts[row.task_id] = (counts[row.task_id] ?? 0) + 1;
        setTaskCommentCounts(counts);
      });
  }, [tasks.length, workspaceRow?.hub_projects?.id]);

  // Realtime: update comment counts instantly
  useEffect(() => {
    const projectId = workspaceRow?.hub_projects?.id;
    if (!projectId || isDemo) return;
    const channel = supabase.channel(`contractor-comments-${projectId}`)
      .on('postgres_changes' as any, {
        event: 'INSERT', schema: 'public', table: 'hub_project_task_comments',
      }, (payload: any) => {
        const taskId = payload.new?.task_id;
        if (taskId) setTaskCommentCounts(prev => ({ ...prev, [taskId]: (prev[taskId] ?? 0) + 1 }));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [workspaceRow?.hub_projects?.id, isDemo]);

  const refreshWorkspaceActivity = useCallback(async () => {
    const projectId = workspaceRow?.hub_projects?.id;
    if (!projectId) { setActivityLog([]); return; }
    const projectTaskIds = tasks.filter((task) => task.project_id === projectId).map((task) => task.id);
    const { data: projectActivityRows } = await supabase
      .from('hub_project_activity')
      .select('*, hub_users(full_name, avatar_url)')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(20);

    const taskTitleMap = Object.fromEntries(
      tasks.filter((task) => task.project_id === projectId).map((task) => [task.id, task.title])
    );

    if (!projectTaskIds.length) {
      setActivityLog(((projectActivityRows ?? []) as any[]).map(normalizeActivityItem));
      return;
    }

    const { data: taskActivityRows } = await supabase
      .from('hub_project_task_activity')
      .select('id, task_id, actor_name, type, description, created_at')
      .in('task_id', projectTaskIds)
      .order('created_at', { ascending: false })
      .limit(20);

    const mergedRows = [
      ...((projectActivityRows ?? []) as any[]),
      ...((taskActivityRows ?? []).map((row: any) => ({
        id: Number(`9${row.id}`),
        action: normalizeTaskActivityAction(row.type),
        entity_title: taskTitleMap[row.task_id] ?? '',
        entity_id: row.task_id ?? null,
        meta: row.type === 'status_change' ? { to: row.description.split(' to ').pop()?.replace(/ /g, '_') } : null,
        created_at: row.created_at,
        hub_users: row.actor_name ? { full_name: row.actor_name, avatar_url: null } : null,
      })) as any[]),
    ]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 20);

    setActivityLog(mergedRows.map(normalizeActivityItem));
  }, [workspaceRow?.hub_projects?.id, tasks]);

  // Fetch activity log when workspace opens
  useEffect(() => {
    refreshWorkspaceActivity();
  }, [refreshWorkspaceActivity]);

  // Load comments when editing task changes
  useEffect(() => {
    if (!editingTask) { setTaskComments([]); setNewComment(''); return; }
    supabase
      .from('hub_project_task_comments')
      .select('id, user_id, body, created_at')
      .eq('task_id', editingTask.id)
      .order('created_at', { ascending: true })
      .then(async ({ data }) => {
        if (!data?.length) { setTaskComments([]); return; }
        const ids = [...new Set(data.map((c: any) => c.user_id).filter(Boolean))];
        const { data: users } = await supabase.from('hub_users').select('id, full_name, avatar_url').in('id', ids);
        const map: Record<string, any> = Object.fromEntries((users ?? []).map((u: any) => [u.id, u]));
        setTaskComments(data.map((c: any) => ({ ...c, hub_users: map[c.user_id] ?? null })));
      });
  }, [editingTask?.id]);

  const postComment = async () => {
    if (!newComment.trim() || !editingTask || !hubUser || postingComment) return;
    setPostingComment(true);
    const { data, error } = await supabase
      .from('hub_project_task_comments')
      .insert({ task_id: editingTask.id, user_id: hubUser.id, body: newComment.trim() })
      .select('id, user_id, body, created_at')
      .single();
    if (!error && data) {
      const commentWithUser = { ...data, hub_users: { full_name: hubUser.full_name ?? 'Me', avatar_url: hubUser.avatar_url ?? null } };
      setTaskComments(prev => [...prev, commentWithUser as any]);
      setTaskCommentCounts(prev => ({ ...prev, [editingTask.id]: (prev[editingTask.id] ?? 0) + 1 }));
      setNewComment('');
      await logActivity('comment_added', editingTask.title, editingTask.id, { comment: newComment.trim().slice(0, 100) });
      // Fire mention notifications if comment has @mentions
      if (newComment.includes('@') && workspaceRow?.hub_projects?.id) {
        supabase.functions.invoke('notify-task-mention', {
          body: {
            comment_id: (data as any).id,
            task_id: editingTask.id,
            author_id: hubUser.id,
            body: newComment.trim(),
            project_id: workspaceRow.hub_projects.id,
          },
        }).catch(console.error);
      }
    }
    setPostingComment(false);
  };

  const insertMention = (member: { id: string; full_name: string }) => {
    const firstName = member.full_name.split(' ')[0];
    const before = newComment.slice(0, mentionStart);
    const after = newComment.slice(mentionStart + mentionQuery.length + 1); // +1 for @
    setNewComment(`${before}@${firstName} ${after}`);
    setMentionOpen(false);
    setMentionQuery('');
  };

  const deleteComment = async (commentId: number) => {
    const taskId = editingTask?.id;
    const taskTitle = editingTask?.title;
    const { error } = await supabase.from('hub_project_task_comments').delete().eq('id', commentId);
    if (error) {
      console.error('Failed to delete task comment', error);
      return;
    }
    setTaskComments(prev => prev.filter(c => c.id !== commentId));
    if (taskId) {
      setTaskCommentCounts(prev => ({
        ...prev,
        [taskId]: Math.max((prev[taskId] ?? 0) - 1, 0),
      }));
    }
    if (taskId && taskTitle) {
      await logActivity('comment_deleted', taskTitle, taskId);
    }
  };

  const logActivity = async (
    action: string,
    entityTitle: string,
    entityId?: number,
    meta?: Record<string, unknown>
  ) => {
    if (!hubUser || !workspaceRow?.hub_projects?.id) return;
    const actionLabels: Record<string, string> = {
      task_created: `created task "${entityTitle}"`,
      task_updated: `updated task "${entityTitle}"`,
      task_status_changed: `moved "${entityTitle}" to ${(meta?.to as string)?.replace('_',' ') ?? ''}`,
      task_deleted: `deleted task "${entityTitle}"`,
      comment_added: `commented on "${entityTitle}"`,
      task_assigned: `assigned "${entityTitle}"`,
      attachment_added: `added attachment to "${entityTitle}"`,
    };
    const legacyDescription = actionLabels[action] ?? `${action} "${entityTitle}"`;
    const newPayload = {
      project_id: workspaceRow.hub_projects.id,
      user_id: hubUser.id,
      action,
      entity_type: 'task',
      entity_id: entityId ?? null,
      entity_title: entityTitle,
      meta: meta ? { ...meta, message: legacyDescription } : { message: legacyDescription },
    };

    let insertResult = await supabase
      .from('hub_project_activity')
      .insert(newPayload)
      .select('*, hub_users(full_name, avatar_url)')
      .single();

    if (insertResult.error) {
      const fallbackPayload = {
        project_id: workspaceRow.hub_projects.id,
        actor_id: hubUser.id,
        actor_name: hubUser.full_name ?? 'Team',
        description: legacyDescription,
      };
      insertResult = await supabase
        .from('hub_project_activity')
        .insert(fallbackPayload)
        .select('id, actor_name, description, created_at')
        .single();
    }

    if (insertResult.error) {
      console.error('Failed to log project activity', insertResult.error);
      return;
    }

    if (insertResult.data) {
      setActivityLog(prev => [normalizeActivityItem(insertResult.data), ...prev].slice(0, 20));
    }
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wsSearchRef.current && !wsSearchRef.current.contains(e.target as Node)) {
        setWsSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (!hubUser) return;

    // Demo mode — use static demo data
    if (isDemo) {
      setRows(DEMO_CONTRACTOR_PROJECTS as any);
      setTasks(DEMO_CONTRACTOR_TASKS as any);
      setTeamMap(DEMO_CONTRACTOR_TEAM as any);
      setLoading(false);
      return;
    }

    (async () => {
      setLoadError(null);
      try {
        // Every project and workspace is visible to the whole team — fs-architects
        // doesn't restrict visibility by assignment the way some client hubs do.
        const { data: projectsData, error: projErr } = await supabase
          .from('hub_projects')
          .select('id, project_type, client_name, project_name, service, project_type_code, project_code, status, stage, start_date, deadline, notes, drive_url, slug');
        if (projErr) throw projErr;
        if (!projectsData?.length) { setLoading(false); return; }

        const projectIds = projectsData.map((p: any) => p.id as number);

        const normalized: ProjectRow[] = projectsData.map((project: any) => ({
          id: project.id,
          hub_projects: project,
        }));

        setRows(normalized);

        // 3. tasks + team
        const [{ data: taskData, error: taskError }, { data: pcTeamData }] = await Promise.all([
          supabase.from('hub_project_tasks').select('id, project_id, title, description, status, priority, due_date, start_date, assigned_to, assignee_ids, team, checklist, color, meta, archived, archived_at').in('project_id', projectIds).is('deleted_at', null),
          supabase.from('hub_project_contractors').select('project_id, contractor_id').in('project_id', projectIds),
        ]);
        if (taskError) console.error('Fetch tasks error:', taskError);
        else setTasks((taskData as ProjectTask[]) ?? []);

        const allUserIds = [...new Set((pcTeamData ?? []).map((r: any) => r.contractor_id as string))];
        if (allUserIds.length > 0) {
          const { data: usersData } = await supabase.from('hub_users').select('id, full_name, avatar_url').in('id', allUserIds);
          const usersById = Object.fromEntries((usersData ?? []).map((u: any) => [u.id, u]));
          const map: Record<number, TeamMember[]> = {};
          for (const r of (pcTeamData ?? []) as any[]) {
            const u = usersById[r.contractor_id];
            if (u) (map[r.project_id] ??= []).push(u);
          }
          setTeamMap(map);
        }
      } catch (err) {
        console.error('Projects load error:', err);
        setLoadError((err instanceof Error ? err.message : (err as any)?.message) || 'Failed to load projects.');
      } finally {
        setLoading(false);
      }
    })();
  }, [hubUser, projectRefreshKey]);

  // Realtime: every project is visible to everyone, so re-fetch on any project
  // or team-assignment change, not just changes involving the current user.
  useEffect(() => {
    if (!hubUser?.id || isDemo) return;
    const channel = supabase
      .channel(`employee-projects-${hubUser.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hub_project_contractors' }, () => setProjectRefreshKey(k => k + 1))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hub_projects' }, () => setProjectRefreshKey(k => k + 1))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [hubUser?.id, isDemo]);

  // Deep link: ?workspace=PROJECT_ID&task=TASK_ID
  useEffect(() => {
    if (loading) return;
    const workspaceParam = searchParams.get('workspace');
    const taskParam = searchParams.get('task');
    const paramKey = `${workspaceParam}:${taskParam}`;
    if (!workspaceParam || deepLinkDone.current === paramKey) return;
    deepLinkDone.current = paramKey;
    const projectId = Number(workspaceParam);
    const row = rows.find(r => r.hub_projects?.id === projectId);
    if (!row) return;
    setWorkspaceRow(row);
    setTaskFilter('all');
    setTaskSearch('');
    setWsSearch('');
    setWsSearchOpen(false);
    setWsFocusSection('ws-tasks');
    if (taskParam) {
      const taskId = Number(taskParam);
      const task = tasks.find(t => t.id === taskId);
      if (task) openViewTask(task);
    }
  }, [loading, rows, tasks, searchParams]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const greetingGradient = 'linear-gradient(135deg, #1c2b3a 0%, #2d4a6e 100%)';
  const today = localToday();
  const firstName = hubUser?.full_name?.split(' ')[0] ?? '';

  const myTasks = tasks.filter(t => getTaskAssigneeIds(t).includes(hubUser?.id ?? '') && !t.archived_at);
  const doneTasks = myTasks.filter(t => t.status === 'done');
  const inProgressTasks = myTasks.filter(t => ['in_progress', 'in_review', 'blocked'].includes(t.status));
  const todoTasks = myTasks.filter(t => t.status === 'todo');
  const overdueTasks = myTasks.filter(t => t.due_date && t.due_date < today && t.status !== 'done');
  const todayDueTasks = myTasks.filter(t => t.due_date === today && t.status !== 'done');
  const pct = myTasks.length > 0 ? Math.round((doneTasks.length / myTasks.length) * 100) : 0;
  const daysUntil = (t: ProjectTask) => t.due_date ? Math.ceil((new Date(t.due_date + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime()) / 86400000) : null;
  const thisWeekTasks = myTasks.filter(t => t.status !== 'done' && t.due_date && t.due_date > today && (daysUntil(t) as number) <= 7);

  const featuredTasks = todayDueTasks.length > 0 ? todayDueTasks
    : overdueTasks.length > 0 ? overdueTasks
    : inProgressTasks.length > 0 ? inProgressTasks
    : todoTasks.slice(0, 6);

  const subline = todayDueTasks.length > 0
    ? `${todayDueTasks.length} task${todayDueTasks.length > 1 ? 's' : ''} due today`
    : overdueTasks.length > 0
    ? `${overdueTasks.length} overdue task${overdueTasks.length > 1 ? 's' : ''}`
    : doneTasks.length === myTasks.length && myTasks.length > 0
    ? "You're all caught up 🎉"
    : myTasks.length > 0
    ? `${myTasks.length} task${myTasks.length !== 1 ? 's' : ''} assigned to you`
    : `No tasks assigned to you yet`;

  const getProjectName = (projectId: number) =>
    rows.find(r => r.hub_projects?.id === projectId)?.hub_projects?.project_name ?? '';

  const searchLower = search.toLowerCase();
  const filteredRows = search
    ? rows.filter(r => {
        const p = r.hub_projects;
        return p?.project_name?.toLowerCase().includes(searchLower)
          || p?.client_name?.toLowerCase().includes(searchLower)
          || p?.project_code?.toLowerCase().includes(searchLower)
          || (getProjectTypeLabel(p?.project_type_code ?? null) ?? '').toLowerCase().includes(searchLower);
      })
    : rows;
  const sortedRows = [...filteredRows].sort((a, b) => {
    const p1 = a.hub_projects, p2 = b.hub_projects;
    const today2 = localToday();
    const urgency = (p: typeof p1) => {
      if (!p) return 5;
      const overdue = p.deadline && p.deadline < today2 && p.status !== 'completed';
      if (overdue) return 0;
      if (p.status === 'ongoing' && p.deadline) {
        const d = Math.ceil((new Date(p.deadline + 'T00:00:00').getTime() - Date.now()) / 86400000);
        if (d <= 7) return 1;
      }
      if (p.status === 'ongoing') return 2;
      if (p.status === 'paused') return 3;
      if (p.status === 'completed') return 4;
      return 5;
    };
    return urgency(p1) - urgency(p2);
  });
  const active = sortedRows.filter(r => r.hub_projects?.status === 'ongoing');
  const other = sortedRows.filter(r => r.hub_projects?.status !== 'ongoing');

  const wsRow = workspaceRow;
  const wsProject = wsRow?.hub_projects;
  const wsIsInternal = wsProject?.project_type === 'internal';
  const wsAllTasks = wsRow ? tasks.filter(t => t.project_id === wsProject?.id) : [];
  const wsTasks = wsAllTasks.filter(t => !t.archived);
  const wsArchivedTasks = wsAllTasks.filter(t => !!t.archived);
  const wsToday = localToday();
  const wsIsOverdue = (t: ProjectTask) => t.due_date && t.due_date < wsToday && t.status !== 'done';
  // wsTeam must be declared before wsFiltered — wsFiltered references wsTeam
  const [wsTeamDirect, setWsTeamDirect] = useState<TeamMember[]>([]);
  useEffect(() => {
    if (!wsProject?.id) { setWsTeamDirect([]); return; }
    // Use SECURITY DEFINER RPC to bypass RLS on hub_project_contractors
    supabase.rpc('get_project_team', { p_project_id: wsProject.id })
      .then(({ data }) => {
        if (data?.length) {
          setWsTeamDirect((data as any[]).map(u => ({ id: u.id, full_name: u.full_name, avatar_url: u.avatar_url ?? null })));
        }
      });
  }, [wsProject?.id]);
  const wsTeam = wsTeamDirect.length > 0 ? wsTeamDirect : (wsRow ? (teamMap[wsProject?.id ?? 0] ?? []) : []);
  // The detail panel can now open for a task without its project's workspace
  // being active (e.g. from the Tasks tab) — resolve panel props off the
  // task's own project rather than assuming wsProject/wsTeam are in sync.
  const detailProjectId = editingTask?.project_id ?? wsProject?.id ?? 0;
  const detailProjectName = editingTask ? (getProjectName(editingTask.project_id) || 'General') : (wsProject?.project_name ?? 'General');
  const detailTeam = editingTask ? (teamMap[editingTask.project_id] ?? []) : wsTeam;
  const getWorkspaceTaskAssignees = (task: ProjectTask) =>
    getTaskAssigneeIds(task)
      .map((assigneeId) => wsTeam.find((member) => member.id === assigneeId))
      .filter(Boolean);
  const wsFiltered = wsTasks.filter(t => {
    if (taskFilter !== 'all' && taskFilter !== 'overdue' && t.status !== taskFilter) return false;
    if (taskFilter === 'overdue' && !wsIsOverdue(t)) return false;
    if (taskSearch) {
      const q = taskSearch.toLowerCase();
      const assigneeNames = getWorkspaceTaskAssignees(t).map((member: any) => member.full_name).join(' ');
      return t.title.toLowerCase().includes(q)
        || (t.description ?? '').toLowerCase().includes(q)
        || assigneeNames.toLowerCase().includes(q);
    }
    return true;
  });
  const wsDone = wsTasks.filter(t => t.status === 'done').length;
  const wsPct = wsTasks.length > 0 ? Math.round((wsDone / wsTasks.length) * 100) : 0;
  const wsStatusIcon: Record<string, { icon: string; cls: string }> = {
    todo: { icon: 'ri-checkbox-blank-circle-line', cls: 'text-gray-300 hover:text-gray-500' },
    in_progress: { icon: 'ri-loader-2-line', cls: 'text-sky-400 hover:text-sky-600' },
    in_review: { icon: 'ri-eye-line', cls: 'text-purple-400 hover:text-purple-600' },
    blocked: { icon: 'ri-indeterminate-circle-line', cls: 'text-rose-400 hover:text-rose-600' },
    done: { icon: 'ri-checkbox-circle-fill', cls: 'text-emerald-500' },
  };
  const BOARD_COLUMNS: { key: ProjectTask['status']; label: string; icon: string; chip: string; empty: string }[] = [
    { key: 'todo', label: 'To Do', icon: 'ri-checkbox-blank-circle-line', chip: 'bg-gray-100 text-gray-600', empty: 'Nothing queued' },
    { key: 'in_progress', label: 'In Progress', icon: 'ri-loader-2-line', chip: 'bg-sky-100 text-sky-700', empty: 'Nothing in motion' },
    { key: 'in_review', label: 'In Review', icon: 'ri-eye-line', chip: 'bg-purple-100 text-purple-700', empty: 'Nothing to review' },
    { key: 'blocked', label: 'Blocked', icon: 'ri-indeterminate-circle-line', chip: 'bg-rose-100 text-rose-700', empty: 'No blocked work' },
    { key: 'done', label: 'Done', icon: 'ri-checkbox-circle-fill', chip: 'bg-emerald-100 text-emerald-700', empty: 'Nothing completed yet' },
  ];

  const WS_SECTIONS = wsProject ? [
    { label: 'Timeline', description: `${wsProject.project_name} · Gantt chart`, icon: 'ri-bar-chart-grouped-line', id: 'ws-timeline', iconCls: 'bg-slate-50 text-[#1c2b3a]/70', keywords: ['timeline', 'gantt', 'schedule', 'chart', 'dates', 'calendar', 'deadline'] },
    { label: 'Tasks', description: `${wsProject.project_name} · Task list`, icon: 'ri-task-line', id: 'ws-tasks', iconCls: 'bg-sky-50 text-sky-500', keywords: ['tasks', 'list', 'todo', 'work', 'items', 'progress', 'backlog'] },
    { label: 'Overview', description: `${wsProject.project_name} · Stats & progress`, icon: 'ri-bar-chart-2-line', id: 'ws-stats', iconCls: 'bg-emerald-50 text-emerald-500', keywords: ['stats', 'overview', 'total', 'count', 'numbers', 'summary', 'progress'] },
    { label: 'Team', description: `${wsProject.project_name} · Members`, icon: 'ri-team-line', id: 'ws-sidebar', iconCls: 'bg-purple-50 text-purple-500', keywords: ['team', 'members', 'people', 'colleagues', 'who', 'assigned'] },
    { label: 'Notes & Dates', description: `${wsProject.project_name} · Start & deadline`, icon: 'ri-sticky-note-line', id: 'ws-sidebar', iconCls: 'bg-amber-50 text-amber-500', keywords: ['notes', 'brief', 'description', 'info', 'details', 'start', 'due', 'date', 'deadline'] },
  ] : [];

  const WS_FILTERS = [
    { label: 'Overdue Tasks', filter: 'overdue' as const, icon: 'ri-alarm-warning-line', cls: 'bg-rose-50 text-rose-500', count: wsTasks.filter(t => !!wsIsOverdue(t)).length, keywords: ['overdue', 'late', 'past due', 'missed'] },
    { label: 'Active Tasks', filter: 'in_progress' as const, icon: 'ri-loader-2-line', cls: 'bg-sky-50 text-sky-500', count: wsTasks.filter(t => t.status === 'in_progress').length, keywords: ['active', 'in progress', 'working', 'ongoing'] },
    { label: 'In Review', filter: 'in_review' as const, icon: 'ri-eye-line', cls: 'bg-purple-50 text-purple-500', count: wsTasks.filter(t => t.status === 'in_review').length, keywords: ['review', 'approval', 'checking', 'qa'] },
    { label: 'Blocked Tasks', filter: 'blocked' as const, icon: 'ri-indeterminate-circle-line', cls: 'bg-rose-50 text-rose-500', count: wsTasks.filter(t => t.status === 'blocked').length, keywords: ['blocked', 'stuck', 'waiting', 'issue'] },
    { label: 'To Do', filter: 'todo' as const, icon: 'ri-checkbox-blank-circle-line', cls: 'bg-gray-100 text-gray-500', count: wsTasks.filter(t => t.status === 'todo').length, keywords: ['todo', 'not started', 'pending', 'backlog', 'queued'] },
    { label: 'Completed Tasks', filter: 'done' as const, icon: 'ri-checkbox-circle-fill', cls: 'bg-emerald-50 text-emerald-500', count: wsTasks.filter(t => t.status === 'done').length, keywords: ['done', 'completed', 'finished', 'complete', 'closed'] },
  ];

  const wsQ = wsSearch.trim().toLowerCase();
  const wsSectionResults = wsQ ? WS_SECTIONS.filter(s =>
    s.label.toLowerCase().includes(wsQ) || s.keywords.some(k => k.includes(wsQ))
  ) : [];
  const wsFilterResults = wsQ ? WS_FILTERS.filter(f =>
    f.label.toLowerCase().includes(wsQ) || f.keywords.some(k => k.includes(wsQ))
  ) : [];
  const wsTaskResults = wsQ ? wsTasks.filter(t =>
    t.title.toLowerCase().includes(wsQ) || (t.description ?? '').toLowerCase().includes(wsQ)
  ).slice(0, 5) : [];

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    const scroll = document.getElementById('ws-scroll');
    if (el && scroll) scroll.scrollTo({ top: el.offsetTop - scroll.offsetTop - 16, behavior: 'smooth' });
  };

  const wsSearchActions = workspaceRow && wsProject ? (
    <div className="relative" ref={wsSearchRef}>
      <div className={`flex items-center gap-2 bg-white/70 backdrop-blur-sm border rounded-xl px-3 py-2 w-9 sm:w-52 transition-all ${wsSearchOpen ? 'border-slate-400 ring-2 ring-slate-100 !w-44 sm:!w-52' : 'border-gray-200'}`}>
        <i className="ri-search-line text-gray-400 text-sm flex-shrink-0"></i>
        <input
          type="text"
          value={wsSearch}
          onChange={e => { setWsSearch(e.target.value); setWsSearchOpen(true); }}
          onFocus={() => setWsSearchOpen(true)}
          onKeyDown={e => {
            if (e.key === 'Escape') { setWsSearch(''); setWsSearchOpen(false); }
            if (e.key === 'Enter') {
              if (wsSectionResults[0]) { setWsFocusSection(wsSectionResults[0].id); setWsSearch(''); setWsSearchOpen(false); }
              else if (wsFilterResults[0]) { setTaskFilter(wsFilterResults[0].filter); setWsFocusSection('ws-tasks'); setWsSearch(''); setWsSearchOpen(false); }
            }
          }}
          placeholder="Search…"
          className="flex-1 text-sm bg-transparent outline-none placeholder-gray-400 text-gray-700 min-w-0 hidden sm:block"
        />
        {wsSearch
          ? <button onClick={() => { setWsSearch(''); setWsSearchOpen(false); }} className="text-gray-400 hover:text-gray-600 cursor-pointer flex-shrink-0"><i className="ri-close-line text-sm"></i></button>
          : null
        }
      </div>

      {wsSearchOpen && (
        <div className="fixed right-4 top-[82px] w-[min(320px,90vw)] max-h-[60vh] bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-y-auto z-[200]">
          {/* Empty: show all sections */}
          {!wsQ && (
            <>
              <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold px-4 pt-3 pb-1.5">Focus on a section</p>
              {WS_SECTIONS.map(s => (
                <button key={s.id + s.label}
                  onClick={() => { setWsFocusSection(s.id); setWsSearchOpen(false); }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors cursor-pointer">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${s.iconCls}`}>
                    <i className={`${s.icon} text-sm`}></i>
                  </div>
                  <div className="min-w-0 flex-1 text-left">
                    <p className="text-sm font-medium text-gray-800">{s.label}</p>
                    <p className="text-[11px] text-gray-400 truncate">{s.description}</p>
                  </div>
                  <i className="ri-fullscreen-line text-gray-300 text-xs flex-shrink-0"></i>
                </button>
              ))}
            </>
          )}

          {/* With query */}
          {wsQ && (
            <>
              {/* Sections */}
              {wsSectionResults.length > 0 && (
                <>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold px-4 pt-3 pb-1">Sections</p>
                  {wsSectionResults.map(s => (
                    <button key={s.id + s.label}
                      onClick={() => { setWsFocusSection(s.id); setWsSearch(''); setWsSearchOpen(false); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors cursor-pointer">
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${s.iconCls}`}>
                        <i className={`${s.icon} text-sm`}></i>
                      </div>
                      <div className="min-w-0 flex-1 text-left">
                        <p className="text-sm font-medium text-gray-800">{s.label}</p>
                        <p className="text-[11px] text-gray-400 truncate">{s.description}</p>
                      </div>
                      <i className="ri-corner-down-left-line text-gray-300 text-xs flex-shrink-0"></i>
                    </button>
                  ))}
                </>
              )}

              {/* Filters */}
              {wsFilterResults.length > 0 && (
                <>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold px-4 pt-3 pb-1 border-t border-gray-50">Filter Tasks</p>
                  {wsFilterResults.map(f => (
                    <button key={f.filter}
                      onClick={() => { setTaskFilter(f.filter); setWsFocusSection('ws-tasks'); setWsSearch(''); setWsSearchOpen(false); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors cursor-pointer">
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${f.cls}`}>
                        <i className={`${f.icon} text-sm`}></i>
                      </div>
                      <div className="min-w-0 flex-1 text-left">
                        <p className="text-sm font-medium text-gray-800">{f.label}</p>
                        <p className="text-[11px] text-gray-400">{f.count} task{f.count !== 1 ? 's' : ''}</p>
                      </div>
                      <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">Filter</span>
                    </button>
                  ))}
                </>
              )}

              {/* Tasks */}
              {wsTaskResults.length > 0 && (
                <>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold px-4 pt-3 pb-1 border-t border-gray-50">Tasks</p>
                  {wsTaskResults.map(t => {
                    const si = wsStatusIcon[t.status];
                    const isOverdue = !!wsIsOverdue(t);
                    return (
                      <button key={t.id}
                        onClick={() => { setTaskSearch(t.title); setTaskFilter('all'); setWsFocusSection('ws-tasks'); setWsSearch(''); setWsSearchOpen(false); }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors cursor-pointer">
                        <i className={`${si.icon} text-lg flex-shrink-0 ${t.status === 'done' ? 'text-emerald-500' : t.status === 'in_progress' ? 'text-sky-400' : 'text-gray-300'}`}></i>
                        <div className="min-w-0 flex-1 text-left">
                          <p className={`text-sm font-medium truncate ${t.status === 'done' ? 'line-through text-gray-400' : 'text-gray-800'}`}>{t.title}</p>
                          {t.due_date && <p className={`text-[11px] ${isOverdue ? 'text-rose-400' : 'text-gray-400'}`}>{isOverdue ? 'Overdue · ' : ''}{new Date(t.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>}
                        </div>
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${{ high: 'bg-rose-400', medium: 'bg-amber-400', low: 'bg-gray-300' }[t.priority]}`}></span>
                      </button>
                    );
                  })}
                </>
              )}

              {/* Empty */}
              {wsSectionResults.length === 0 && wsFilterResults.length === 0 && wsTaskResults.length === 0 && (
                <div className="px-4 py-6 text-center">
                  <i className="ri-search-line text-2xl text-gray-200 block mb-2"></i>
                  <p className="text-sm text-gray-400">Nothing found for <span className="font-medium text-gray-600">"{wsSearch}"</span></p>
                </div>
              )}

              <div className="px-4 py-2 border-t border-gray-50">
                <p className="text-[10px] text-gray-300">↵ jump to section · Esc to close</p>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  ) : undefined;

  // ── Per-task color palette (used in calendar + task cards) ──────────────
  const TASK_PALETTE = [
    { chip: 'bg-slate-100 text-[#1c2b3a]', dot: 'bg-[#1c2b3a]/60', border: 'border-l-violet-400', cardBg: 'bg-slate-50/30' },
    { chip: 'bg-sky-100 text-sky-700',       dot: 'bg-sky-400',    border: 'border-l-sky-400',    cardBg: 'bg-sky-50/30' },
    { chip: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-400', border: 'border-l-emerald-400', cardBg: 'bg-emerald-50/30' },
    { chip: 'bg-amber-100 text-amber-700',   dot: 'bg-amber-400',  border: 'border-l-amber-400',  cardBg: 'bg-amber-50/30' },
    { chip: 'bg-pink-100 text-pink-700',     dot: 'bg-pink-400',   border: 'border-l-pink-400',   cardBg: 'bg-pink-50/30' },
    { chip: 'bg-slate-100 text-[#1c2b3a]', dot: 'bg-[#1c2b3a]/50', border: 'border-l-[#1c2b3a]/40', cardBg: 'bg-slate-50/30' },
    { chip: 'bg-teal-100 text-teal-700',     dot: 'bg-teal-400',   border: 'border-l-teal-400',   cardBg: 'bg-teal-50/30' },
    { chip: 'bg-slate-100 text-[#1c2b3a]', dot: 'bg-[#1c2b3a]/70', border: 'border-l-[#1c2b3a]/50', cardBg: 'bg-slate-50/30' },
    { chip: 'bg-rose-100 text-rose-700',     dot: 'bg-rose-400',   border: 'border-l-rose-400',   cardBg: 'bg-rose-50/30' },
    { chip: 'bg-lime-100 text-lime-700',     dot: 'bg-lime-400',   border: 'border-l-lime-400',   cardBg: 'bg-lime-50/30' },
  ];
  const taskColorMap = Object.fromEntries(wsTasks.map((t, i) => [t.id, TASK_PALETTE[i % TASK_PALETTE.length]]));

  const TaskCard = (task: ProjectTask) => {
    const overdue = !!wsIsOverdue(task);
    const si = wsStatusIcon[task.status];
    const color = taskColorMap[task.id] ?? TASK_PALETTE[0];
    const assignees = getWorkspaceTaskAssignees(task);
    const commentCount = taskCommentCounts[task.id] ?? 0;
    const daysLeft = task.due_date
      ? Math.ceil((new Date(task.due_date + 'T00:00:00').getTime() - new Date(wsToday + 'T00:00:00').getTime()) / 86400000)
      : null;
    const priorityCfg = { high: { label: 'High', cls: 'bg-rose-100 text-rose-600' }, medium: { label: 'Med', cls: 'bg-amber-100 text-amber-600' }, low: { label: 'Low', cls: 'bg-gray-100 text-gray-500' } }[task.priority];
    return (
      <div key={task.id} onClick={() => openViewTask(task)}
        className={`bg-white rounded-xl border border-gray-100 shadow-sm p-3.5 cursor-pointer hover:shadow-md hover:border-gray-200 transition-all group border-l-4 ${(task as any).color ? '' : color.border}`}
        style={(task as any).color ? { borderLeftColor: (task as any).color } : undefined}>
        {/* Top row */}
        <div className="flex items-start gap-2.5">
          <button onClick={e => { e.stopPropagation(); cycleTask(task); }} className={`flex-shrink-0 cursor-pointer mt-0.5 ${si.cls}`}>
            <i className={`${si.icon} text-lg`}></i>
          </button>
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-semibold leading-snug ${task.status === 'done' ? 'line-through text-gray-400' : 'text-gray-900'}`}>{task.title}</p>
            {task.description && <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{getTaskDescriptionPreview(task.description)}</p>}
          </div>
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold flex-shrink-0 ${priorityCfg.cls}`}>{priorityCfg.label}</span>
        </div>
        {/* Bottom row */}
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
                <span className="text-[10px] text-gray-500 font-medium">{assignees.length === 1 ? assignees[0].full_name.split(' ')[0] : `${assignees.length} assignees`}</span>
              </div>
            )}

            <button onClick={e => { e.stopPropagation(); if (window.confirm('Delete?')) deleteTask(task.id); }}
              disabled={deletingTaskId === task.id}
              className="opacity-0 group-hover:opacity-100 w-6 h-6 flex items-center justify-center text-gray-300 hover:text-rose-500 cursor-pointer transition-all disabled:opacity-40">
              <i className="ri-delete-bin-line text-sm"></i>
            </button>
          </div>
        </div>
      </div>
    );
  };

  const boardTasks = wsTasks.filter((task) => {
    if (!taskSearch) return true;
    const q = taskSearch.toLowerCase();
    const assigneeNames = getWorkspaceTaskAssignees(task).map((member: any) => member.full_name).join(' ');
    return task.title.toLowerCase().includes(q)
      || (task.description ?? '').toLowerCase().includes(q)
      || assigneeNames.toLowerCase().includes(q);
  });

  const BoardCard = (task: ProjectTask) => {
    const overdue = !!wsIsOverdue(task);
    const color = taskColorMap[task.id] ?? TASK_PALETTE[0];
    const assignees = getWorkspaceTaskAssignees(task);
    const commentCount = taskCommentCounts[task.id] ?? 0;
    const priorityCfg = { high: { label: 'High', cls: 'bg-rose-100 text-rose-600' }, medium: { label: 'Med', cls: 'bg-amber-100 text-amber-600' }, low: { label: 'Low', cls: 'bg-gray-100 text-gray-500' } }[task.priority];
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
        onClick={() => openViewTask(task)}
        className={`w-full text-left rounded-2xl border border-gray-100 border-l-4 bg-white p-3 shadow-sm transition-all hover:-translate-y-0.5 hover:border-gray-200 hover:shadow-md cursor-pointer ${(task as any).color ? '' : color.border} ${draggedTaskId === task.id ? 'opacity-60' : ''}`}
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
    <ContractorLayout
      title={workspaceRow ? undefined : 'Projects'}
      hideGlobalSearch={!!workspaceRow}
      actions={wsSearchActions}
      titleContent={workspaceRow && wsProject ? (
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => { setWorkspaceRow(null); setTaskFilter('all'); setTaskSearch(''); setWsSearch(''); setWsSearchOpen(false); setWsFocusSection(null); }}
            className="flex items-center gap-1.5 h-8 pl-1.5 pr-3 rounded-xl bg-white border border-gray-200 text-gray-500 hover:text-gray-800 hover:bg-gray-50 cursor-pointer transition-all shadow-sm flex-shrink-0 text-xs font-medium">
            <i className="ri-arrow-left-s-line text-base"></i>
            Back to Projects
          </button>
          <button
            onClick={() => {
              const slug = wsProject.slug || slugify(wsProject.client_name);
              const url = `https://fsarchitects.ph/hub/employee/project/${slug}`;
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
            className={`ml-auto flex items-center gap-1.5 h-8 px-2.5 rounded-xl border cursor-pointer transition-all shadow-sm flex-shrink-0 text-xs font-medium ${linkCopied ? 'bg-emerald-50 border-emerald-200 text-emerald-600' : 'bg-white border-gray-200 text-gray-500 hover:text-[#1c2b3a] hover:border-indigo-200'}`}>
            <i className={`text-base ${linkCopied ? 'ri-check-line' : 'ri-link'}`}></i>
            {linkCopied ? 'Copied!' : 'Copy link'}
          </button>
        </div>
      ) : undefined}
    >
      {/* ── Workspace ── */}
      {workspaceRow && wsProject && (
        <div className="flex flex-col -mx-4 -my-4 md:-mx-6 md:-my-6 min-h-full">

          {/* ── Hero banner ── */}
          {(() => {
            const statusColors: Record<string, string> = { ongoing: 'bg-emerald-100 text-emerald-700', completed: 'bg-blue-100 text-blue-700', paused: 'bg-amber-100 text-amber-700', cancelled: 'bg-gray-100 text-gray-500' };
            const statusLabels: Record<string, string> = { ongoing: 'Active', completed: 'Completed', paused: 'Paused', cancelled: 'Archived' };
            const daysLeft = wsProject.deadline ? Math.ceil((new Date(wsProject.deadline + 'T00:00:00').getTime() - new Date(wsToday + 'T00:00:00').getTime()) / 86400000) : null;
            const isDeadlineOver = daysLeft !== null && daysLeft < 0 && wsProject.status !== 'completed';
            const folderIdMatch = wsProject.drive_url?.match(/folders\/([a-zA-Z0-9_-]+)/);
            const folderId = folderIdMatch?.[1];
            const embedUrl = folderId
              ? `https://drive.google.com/embeddedfolderview?id=${folderId}#grid`
              : null;
            return (
              <div className="px-4 sm:px-5 md:px-6 pt-3 sm:pt-4 pb-2 flex-shrink-0">
                <div className="bg-white/70 backdrop-blur-sm rounded-3xl border border-white/80 shadow-sm px-4 py-4 sm:px-5 sm:py-5">
                  <div className="flex flex-col gap-4 sm:gap-5 lg:flex-row lg:items-start lg:gap-8">
                    <div className="min-w-0 lg:max-w-[320px] lg:flex-shrink-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1.5">
                        <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-semibold ${statusColors[wsProject.status] ?? statusColors.ongoing}`}>
                          {statusLabels[wsProject.status] ?? wsProject.status}
                        </span>
                        {wsIsInternal && <span className="text-[10px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">Internal</span>}
                        {wsProject.project_type_code && <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{getProjectTypeLabel(wsProject.project_type_code)}</span>}
                        {wsProject.stage && <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-violet-50 text-violet-700">{wsProject.stage}</span>}
                      </div>
                      {wsProject.project_code && (
                        <span className="block text-[10px] font-semibold tracking-widest uppercase mb-0.5 text-[#1c2b3a]">
                          {wsProject.project_code}
                        </span>
                      )}
                      <h2 className="text-lg sm:text-xl font-bold text-gray-900 leading-tight">{wsProject.project_name}</h2>
                      <p className="text-sm text-gray-400 mt-0.5">{wsIsInternal ? 'Internal Project' : wsProject.client_name}</p>

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
                              {daysLeft}d left · {new Date(wsProject.deadline! + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="lg:flex-1 lg:min-w-0">
                      {embedUrl && wsProject.drive_url ? (
                        <>
                          {/* Desktop/tablet: embedded folder preview — plenty of width to show it usefully */}
                          <div className="hidden sm:block overflow-hidden rounded-2xl border border-gray-200 bg-[#f1f3f7] shadow-sm">
                            <div className="flex items-center justify-end border-b border-gray-200/80 px-3 py-2">
                              <a
                                href={wsProject.drive_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 rounded-full bg-white/90 px-2.5 py-1.5 text-[11px] font-medium text-gray-600 transition-colors hover:text-blue-600"
                                title="Open in Google Drive"
                              >
                                <svg viewBox="0 0 87.3 78" className="h-3.5 w-3.5 flex-shrink-0" xmlns="http://www.w3.org/2000/svg">
                                  <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
                                  <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47"/>
                                  <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335"/>
                                  <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/>
                                  <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc"/>
                                  <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 27h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
                                </svg>
                                <span>Open Drive</span>
                                <i className="ri-external-link-line text-[11px]"></i>
                              </a>
                            </div>
                            <div className="h-[150px] overflow-hidden">
                              <iframe
                                src={embedUrl}
                                className="bg-[#f1f3f7]"
                                style={{ width: '200%', height: 300, border: 'none', transform: 'scale(0.5)', transformOrigin: 'top left' }}
                                title="Project Files"
                              />
                            </div>
                          </div>

                          {/* Mobile: the scaled-down iframe renders too sparse to be useful in a
                              narrow card — a compact tap-through row is more legible and saves
                              the vertical space a near-empty embed would otherwise eat up. */}
                          <a
                            href={wsProject.drive_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="sm:hidden flex items-center gap-3 rounded-2xl border border-gray-200 bg-[#f1f3f7] px-4 py-3 active:bg-[#e8eaf0] transition-colors"
                          >
                            <svg viewBox="0 0 87.3 78" className="h-6 w-6 flex-shrink-0" xmlns="http://www.w3.org/2000/svg">
                              <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
                              <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47"/>
                              <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335"/>
                              <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/>
                              <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc"/>
                              <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 27h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
                            </svg>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-700">Project Files</p>
                              <p className="text-[11px] text-gray-400">Open in Google Drive</p>
                            </div>
                            <i className="ri-external-link-line text-gray-400 flex-shrink-0"></i>
                          </a>
                        </>
                      ) : (
                        <div className="flex items-center gap-3 rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-4">
                          <div className="w-10 h-10 rounded-2xl bg-white border border-gray-200 flex items-center justify-center flex-shrink-0">
                            <i className="ri-folder-line text-gray-300 text-lg"></i>
                          </div>
                          <div>
                            <p className="text-xs font-medium text-gray-500">No Drive folder linked</p>
                            <p className="text-[10px] text-gray-400">Ask your admin to add project folders</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          <div id="ws-scroll" className="flex-1 px-5 md:px-6 pb-6 space-y-5 overflow-y-auto">

            {/* Focus mode dismiss bar */}
            {wsFocusSection && (
              <div className="flex items-center gap-3 bg-slate-50 border border-slate-100 rounded-2xl px-4 py-2.5">
                <i className="ri-fullscreen-line text-[#1c2b3a]/70 text-sm"></i>
                <span className="text-xs text-[#1c2b3a] font-medium flex-1">Focused view — showing one section</span>
                <button onClick={() => setWsFocusSection(null)} className="text-[11px] text-[#1c2b3a]/70 hover:text-[#1c2b3a] font-medium cursor-pointer flex items-center gap-1">
                  <i className="ri-close-line text-xs"></i> Show all
                </button>
              </div>
            )}

            {/* Stats */}
            <div id="ws-stats" className={`grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 ${wsFocusSection && wsFocusSection !== 'ws-stats' ? 'hidden' : ''}`}>
              {[
                { label: 'Total', value: wsTasks.length, icon: 'ri-task-line', iconBg: 'bg-gray-100', iconClr: 'text-gray-500', valClr: 'text-gray-800' },
                { label: 'Done', value: wsDone, icon: 'ri-checkbox-circle-fill', iconBg: 'bg-emerald-100', iconClr: 'text-emerald-600', valClr: 'text-emerald-700' },
                { label: 'In Progress', value: wsTasks.filter(t => t.status === 'in_progress').length, icon: 'ri-loader-2-line', iconBg: 'bg-sky-100', iconClr: 'text-sky-600', valClr: 'text-sky-700' },
                { label: 'Overdue', value: wsTasks.filter(t => !!wsIsOverdue(t)).length, icon: 'ri-alarm-warning-line', iconBg: 'bg-rose-100', iconClr: 'text-rose-500', valClr: 'text-rose-600' },
              ].map(s => (
                <div key={s.label} className="bg-white rounded-xl sm:rounded-2xl px-2.5 py-2 sm:px-3.5 sm:py-2.5 shadow-sm border border-gray-100/80 flex items-center gap-2 sm:gap-2.5">
                  <div className={`w-6 h-6 sm:w-7 sm:h-7 rounded-lg ${s.iconBg} flex items-center justify-center flex-shrink-0`}>
                    <i className={`${s.icon} ${s.iconClr} text-[11px] sm:text-xs`}></i>
                  </div>
                  <div className="min-w-0">
                    <p className={`text-sm sm:text-base font-bold ${s.valClr} leading-none`}>{s.value}</p>
                    <p className="text-[9px] sm:text-[10px] text-gray-400 mt-0.5 truncate">{s.label}</p>
                  </div>
                </div>
              ))}
            </div>

            <div id="ws-timeline" className={wsFocusSection && wsFocusSection !== 'ws-timeline' ? 'hidden' : ''}>
              <GanttTimeline
                tasks={wsTasks}
                projectStart={wsProject.start_date}
                projectEnd={wsProject.deadline}
                today={wsToday}
              />
            </div>

            <div className="flex gap-6">
              {/* Task list */}
              <div id="ws-tasks" className={`min-w-0 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden ${taskView === 'board' ? 'flex-[1_1_100%]' : 'flex-1'} ${wsFocusSection && wsFocusSection !== 'ws-tasks' ? 'hidden' : ''}`}>
                <div className="px-5 py-4 border-b border-gray-50 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <h3 className="font-semibold text-gray-800">Tasks</h3>
                      {wsTasks.length > 0 && (
                        <div className="flex items-center gap-2">
                          <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-400 rounded-full" style={{ width: `${wsPct}%` }} />
                          </div>
                          <span className="text-xs text-gray-400">{wsDone}/{wsTasks.length}</span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="hidden lg:flex items-center rounded-xl border border-gray-200 bg-white p-0.5">
                        <button
                          type="button"
                          onClick={() => setTaskView('list')}
                          className={`px-2.5 py-1 text-[11px] font-medium rounded-lg transition-colors cursor-pointer ${taskView === 'list' ? 'bg-[#111827] text-white' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                          List
                        </button>
                        <button
                          type="button"
                          onClick={() => { setTaskView('board'); setTaskFilter('all'); }}
                          className={`px-2.5 py-1 text-[11px] font-medium rounded-lg transition-colors cursor-pointer ${taskView === 'board' ? 'bg-[#111827] text-white' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                          Board
                        </button>
                      </div>
                      <button onClick={openAddTask}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-[#111827] text-white text-xs font-medium rounded-lg hover:bg-gray-800 transition-colors cursor-pointer whitespace-nowrap">
                        <i className="ri-add-line"></i> Add Task
                      </button>
                    </div>
                  </div>
                  <div className={`flex gap-1 flex-wrap ${taskView === 'board' ? 'lg:hidden' : ''}`}>
                    {(['all', 'todo', 'in_progress', 'in_review', 'blocked', 'done', 'overdue'] as const).map(f => {
                      const labels: Record<string, string> = { all: 'All', todo: 'To Do', in_progress: 'Active', in_review: 'Review', blocked: 'Blocked', done: 'Done', overdue: 'Overdue' };
                      const counts: Record<string, number> = {
                        all: wsTasks.length,
                        todo: wsTasks.filter(t => t.status === 'todo').length,
                        in_progress: wsTasks.filter(t => t.status === 'in_progress').length,
                        in_review: wsTasks.filter(t => t.status === 'in_review').length,
                        blocked: wsTasks.filter(t => t.status === 'blocked').length,
                        done: wsTasks.filter(t => t.status === 'done').length,
                        overdue: wsTasks.filter(t => !!wsIsOverdue(t)).length,
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

                {wsTasks.length === 0 ? (
                  <div className="py-14 text-center">
                    <i className="ri-task-line text-3xl text-gray-200 block mb-2"></i>
                    <p className="text-sm text-gray-400 mb-3">No tasks yet</p>
                    <button onClick={openAddTask}
                      className="text-sm text-[#1c2b3a] hover:underline cursor-pointer">Add the first task</button>
                  </div>
                ) : wsFiltered.length === 0 ? (
                  <div className="py-10 text-center">
                    <p className="text-sm text-gray-400">No tasks in this filter</p>
                  </div>
                ) : taskView === 'board' ? (
                  <div className="hidden lg:flex p-4 overflow-x-auto overflow-y-hidden min-h-[calc(100vh-19rem)]">
                    <div className="grid grid-cols-5 gap-4 min-w-[1120px] w-full min-h-full">
                      {BOARD_COLUMNS.map((column) => {
                        const columnTasks = boardTasks.filter((task) => task.status === column.key);
                        return (
                          <div
                            key={column.key}
                            onDragOver={(e) => {
                              e.preventDefault();
                              setBoardDragOver(column.key);
                            }}
                            onDragLeave={() => setBoardDragOver((current) => current === column.key ? null : current)}
                            onDrop={async (e) => {
                              e.preventDefault();
                              const taskId = Number(e.dataTransfer.getData('text/task-id') || draggedTaskId);
                              const droppedTask = wsTasks.find((task) => task.id === taskId);
                              setBoardDragOver(null);
                              setDraggedTaskId(null);
                              if (!droppedTask) return;
                              await updateTaskStatus(droppedTask, column.key);
                            }}
                            className={`rounded-3xl border p-3 transition-colors min-h-full flex flex-col ${boardDragOver === column.key ? 'border-[#1c2b3a] bg-slate-50/40' : 'border-gray-100 bg-gray-50/60'}`}
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
                                columnTasks.map((task) => <div key={task.id}>{BoardCard(task)}</div>)
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : taskFilter !== 'all' ? (
                  <div className="p-3 space-y-2">
                    {wsFiltered.map(task => <div key={task.id}>{TaskCard(task)}</div>)}
                  </div>
                ) : (
                  /* ── Grouped sections (taskFilter === 'all') ── */
                  <div>
                    {(() => {
                      const renderTaskRow = (task: ProjectTask) => <div key={task.id}>{TaskCard(task)}</div>;

                      const overdueTasks  = wsFiltered.filter(t => !!wsIsOverdue(t));
                      const inProgTasks   = wsFiltered.filter(t => t.status === 'in_progress' && !wsIsOverdue(t));
                      const reviewTasks   = wsFiltered.filter(t => t.status === 'in_review' && !wsIsOverdue(t));
                      const blockedTasks  = wsFiltered.filter(t => t.status === 'blocked' && !wsIsOverdue(t));
                      const todoTasks     = wsFiltered.filter(t => t.status === 'todo' && !wsIsOverdue(t));
                      const doneTasks     = wsFiltered.filter(t => t.status === 'done');

                      type GroupKey = 'overdue' | 'in_progress' | 'in_review' | 'blocked' | 'todo' | 'done';
                      const groups = [
                        { key: 'overdue',     label: 'Overdue',     icon: 'ri-alarm-warning-line', headerCls: 'bg-rose-50/60',  iconCls: 'text-rose-500',    labelCls: 'text-rose-700',    badgeCls: 'bg-rose-100 text-rose-600',    chevronCls: 'text-rose-300',    tasks: overdueTasks },
                        { key: 'in_progress', label: 'In Progress', icon: 'ri-loader-2-line',       headerCls: 'bg-sky-50/50',   iconCls: 'text-sky-500',     labelCls: 'text-sky-700',     badgeCls: 'bg-sky-100 text-sky-600',      chevronCls: 'text-sky-400',     tasks: inProgTasks  },
                        { key: 'in_review',   label: 'In Review',   icon: 'ri-eye-line',            headerCls: 'bg-purple-50/50',iconCls: 'text-purple-500',  labelCls: 'text-purple-700',  badgeCls: 'bg-purple-100 text-purple-600', chevronCls: 'text-purple-300', tasks: reviewTasks },
                        { key: 'blocked',     label: 'Blocked',     icon: 'ri-indeterminate-circle-line', headerCls: 'bg-rose-50/40', iconCls: 'text-rose-500', labelCls: 'text-rose-700', badgeCls: 'bg-rose-100 text-rose-600', chevronCls: 'text-rose-300', tasks: blockedTasks },
                        { key: 'todo',        label: 'To Do',       icon: 'ri-checkbox-blank-circle-line', headerCls: 'bg-gray-50/60', iconCls: 'text-gray-400', labelCls: 'text-gray-600', badgeCls: 'bg-gray-100 text-gray-500',  chevronCls: 'text-gray-300',    tasks: todoTasks    },
                        { key: 'done',        label: 'Done',        icon: 'ri-checkbox-circle-fill', headerCls: 'bg-emerald-50/40', iconCls: 'text-emerald-500', labelCls: 'text-emerald-700', badgeCls: 'bg-emerald-100 text-emerald-600', chevronCls: 'text-emerald-300', tasks: doneTasks },
                      ] satisfies { key: GroupKey; label: string; icon: string; headerCls: string; iconCls: string; labelCls: string; badgeCls: string; chevronCls: string; tasks: ProjectTask[] }[];

                      const visibleGroups = groups.filter(g => g.tasks.length > 0);

                      return visibleGroups.map(g => {
                        const collapsed = !!collapsedGroups[g.key];
                        return (
                          <div key={g.key} className="border-b border-gray-50 last:border-0">
                            <div
                              className={`flex items-center gap-2 px-5 py-2.5 ${g.headerCls} cursor-pointer select-none`}
                              onClick={() => setCollapsedGroups(prev => ({ ...prev, [g.key]: !prev[g.key] }))}
                            >
                              <i className={`${g.icon} ${g.iconCls} text-sm`}></i>
                              <span className={`text-xs font-semibold ${g.labelCls}`}>{g.label}</span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${g.badgeCls}`}>{g.tasks.length}</span>
                              <i className={`${collapsed ? 'ri-arrow-right-s-line' : 'ri-arrow-down-s-line'} ${g.chevronCls} ml-auto text-sm`}></i>
                            </div>
                            {!collapsed && (
                              <div className="p-3 space-y-2">
                                {g.tasks.map(t => renderTaskRow(t))}
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
                          <div key={task.id} className="opacity-50">
                            {TaskCard(task)}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Right: project info */}
                <div id="ws-sidebar" className={`${taskView === 'board' ? 'hidden' : 'hidden lg:flex'} flex-col gap-4 w-64 flex-shrink-0 ${wsFocusSection && wsFocusSection !== 'ws-sidebar' ? 'hidden' : ''}`}>
                {/* Dates + notes card */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
                  {(wsProject.start_date || wsProject.deadline) && (
                    <div className="space-y-2.5">
                      {wsProject.start_date && (
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-gray-400 flex items-center gap-1.5"><i className="ri-play-circle-line text-gray-300"></i>Start</span>
                          <span className="font-medium text-gray-700">{new Date(wsProject.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                        </div>
                      )}
                      {wsProject.deadline && (
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-gray-400 flex items-center gap-1.5"><i className="ri-flag-line text-gray-300"></i>Due</span>
                          <span className={`font-medium ${wsProject.deadline < wsToday && wsProject.status !== 'completed' ? 'text-rose-500' : 'text-gray-700'}`}>
                            {new Date(wsProject.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                  {wsProject.notes && (
                    <div className={`${(wsProject.start_date || wsProject.deadline) ? 'border-t border-gray-50 pt-3' : ''}`}>
                      <p className="text-[10px] text-gray-400 uppercase tracking-wide font-medium mb-1.5">Notes</p>
                      <p className="text-xs text-gray-500 leading-relaxed">{wsProject.notes}</p>
                    </div>
                  )}
                </div>

                {/* Activity feed */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">Activity</p>
                    {activityLog.length > 0 && (
                      <button
                        onClick={() => setShowActivityModal(true)}
                        className="text-[11px] font-medium text-gray-500 hover:text-gray-800 transition-colors cursor-pointer"
                      >
                        View all
                      </button>
                    )}
                  </div>
                  {activityLog.length === 0 ? (
                    <p className="text-xs text-gray-300">No activity yet</p>
                  ) : (
                    <div className="space-y-3">
                      {activityLog.slice(0, 8).map(a => {
                        const u = a.hub_users;
                        const icons: Record<string, string> = {
                          task_created: 'ri-add-circle-line text-emerald-500',
                          task_updated: 'ri-edit-line text-[#1c2b3a]/70',
                          task_status_changed: 'ri-refresh-line text-sky-500',
                          task_deleted: 'ri-delete-bin-line text-rose-500',
                          comment_added: 'ri-chat-3-line text-amber-500',
                          comment_deleted: 'ri-chat-delete-line text-rose-500',
                          task_assigned: 'ri-user-add-line text-purple-500',
                          attachment_added: 'ri-attachment-2 text-[#1c2b3a]/70',
                        };
                        const labels: Record<string, (a: typeof activityLog[0]) => string> = {
                          task_created: (a) => `created "${a.entity_title}"`,
                          task_updated: (a) => `updated "${a.entity_title}"`,
                          task_status_changed: (a) => `moved "${a.entity_title}" to ${(a.meta as any)?.to?.replace('_', ' ') ?? ''}`,
                          task_deleted: (a) => `deleted "${a.entity_title}"`,
                          comment_added: (a) => `commented on "${a.entity_title}"`,
                          comment_deleted: (a) => `deleted a comment on "${a.entity_title}"`,
                          task_assigned: (a) => `assigned "${a.entity_title}"`,
                          attachment_added: (a) => `added an attachment to "${a.entity_title}"`,
                        };
                        const diff = Math.floor((Date.now() - new Date(a.created_at).getTime()) / 1000);
                        const time = diff < 60 ? 'just now' : diff < 3600 ? `${Math.floor(diff/60)}m ago` : diff < 86400 ? `${Math.floor(diff/3600)}h ago` : new Date(a.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                        return (
                          <div key={a.id} className="flex items-start gap-2.5">
                            <div className="w-6 h-6 rounded-full bg-gray-50 border border-gray-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                              <i className={`${icons[a.action] ?? 'ri-information-line text-gray-400'} text-[11px]`}></i>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs text-gray-600 leading-snug">
                                <span className="font-semibold text-gray-800">{u?.full_name?.split(' ')[0] ?? 'Someone'}</span>
                                {' '}{labels[a.action]?.(a) ?? a.action}
                              </p>
                              <p className="text-[10px] text-gray-400 mt-0.5">{time}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Team */}
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
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Project list ── */}
      {!workspaceRow && (loading ? (
        <div className="flex justify-center py-24">
          <i className="ri-loader-4-line animate-spin text-2xl text-gray-300"></i>
        </div>
      ) : loadError ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <div className="w-14 h-14 bg-rose-50 rounded-3xl flex items-center justify-center">
            <i className="ri-error-warning-line text-rose-400 text-2xl"></i>
          </div>
          <p className="text-sm font-semibold text-gray-500">Couldn't load projects</p>
          <p className="text-xs text-gray-400 max-w-sm text-center">{loadError}</p>
          <button onClick={() => setProjectRefreshKey(k => k + 1)}
            className="mt-1 px-4 py-2 rounded-xl text-sm font-medium bg-[#1c2b3a] text-white hover:bg-gray-800 cursor-pointer transition-colors">
            Retry
          </button>
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <div className="w-14 h-14 bg-gray-100 rounded-3xl flex items-center justify-center">
            <i className="ri-folder-open-line text-gray-400 text-2xl"></i>
          </div>
          <p className="text-sm font-semibold text-gray-500">No projects yet</p>
          <p className="text-xs text-gray-400">Projects will show up here once they're created.</p>
        </div>
      ) : (
        /* ── Main dashboard layout ── */
        <div className="space-y-6">

          {/* Hero — answers "what do I do right now": completion ring, quick
              counts, and the single most urgent task spotlighted with a
              one-tap complete. */}
          <div className="relative overflow-hidden rounded-[28px] p-6 sm:p-7 text-white shadow-[0_20px_50px_-20px_rgba(28,43,58,0.55)]" style={{ background: greetingGradient }}>
            <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(480px 300px at 88% -10%, rgba(255,255,255,0.16), transparent 60%)' }} />
            <div className="relative flex items-start justify-between gap-6 flex-wrap">
              <div>
                <p className="text-xs text-white/55 font-medium mb-1">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
                <h2 className="text-2xl font-extrabold tracking-tight leading-tight">{greeting}, {firstName}.</h2>
                <p className="text-sm text-white/70 mt-1">{subline}</p>
              </div>
              {tasks.length > 0 && (
                <div className="flex items-center gap-4 flex-shrink-0">
                  <div className="relative w-[72px] h-[72px] flex-shrink-0">
                    <svg width="72" height="72" className="-rotate-90">
                      <circle cx="36" cy="36" r="30" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="7" />
                      <circle cx="36" cy="36" r="30" fill="none" stroke="#fff" strokeWidth="7" strokeLinecap="round"
                        strokeDasharray={2 * Math.PI * 30} strokeDashoffset={2 * Math.PI * 30 * (1 - pct / 100)} style={{ transition: 'stroke-dashoffset 0.4s ease' }} />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center text-base font-bold">{pct}%</div>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 text-xs text-white/80"><span className="w-1.5 h-1.5 rounded-full bg-amber-300 flex-shrink-0"></span>Today <span className="font-bold text-white">{todayDueTasks.length}</span></div>
                    <div className="flex items-center gap-2 text-xs text-white/80"><span className="w-1.5 h-1.5 rounded-full bg-rose-300 flex-shrink-0"></span>Overdue <span className="font-bold text-white">{overdueTasks.length}</span></div>
                    <div className="flex items-center gap-2 text-xs text-white/80"><span className="w-1.5 h-1.5 rounded-full bg-emerald-300 flex-shrink-0"></span>Done <span className="font-bold text-white">{doneTasks.length}</span></div>
                  </div>
                </div>
              )}
            </div>

            {featuredTasks[0] && (
              <div className="relative mt-5 flex items-center gap-3.5 bg-white/10 hover:bg-white/[0.14] border border-white/15 rounded-2xl px-4 py-3.5 transition-colors">
                <button type="button" onClick={() => cycleTask(featuredTasks[0])}
                  className="w-6 h-6 rounded-full border-2 border-white/45 hover:border-white flex-shrink-0 transition-colors cursor-pointer"></button>
                <button type="button" onClick={() => openViewTask(featuredTasks[0])} className="flex-1 min-w-0 text-left cursor-pointer">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-white/55 mb-0.5">Next up</p>
                  <p className="text-sm font-bold truncate">{featuredTasks[0].title}</p>
                  <p className="text-xs text-white/65 mt-0.5 truncate">{getProjectName(featuredTasks[0].project_id)}</p>
                </button>
                {featuredTasks[0].due_date && (
                  <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full flex-shrink-0 ${
                    featuredTasks[0].due_date < today ? 'bg-rose-400 text-white' : featuredTasks[0].due_date === today ? 'bg-amber-300 text-amber-900' : 'bg-white/15 text-white'
                  }`}>
                    {featuredTasks[0].due_date === today ? 'Today' : featuredTasks[0].due_date < today ? 'Late' : new Date(featuredTasks[0].due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Tabs — tasks first since that's the employee's actual job;
              projects are just where those tasks live. Sliding pill indicator
              instead of two independently-styled buttons. */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="relative flex sm:inline-flex w-full sm:w-auto bg-white/60 backdrop-blur-sm border border-white/80 rounded-2xl p-1">
              <div className="absolute top-1 bottom-1 left-1 w-[calc(50%-4px)] bg-white rounded-xl shadow-sm transition-transform duration-300 ease-out"
                style={{ transform: dashboardTab === 'projects' ? 'translateX(100%)' : 'translateX(0)' }}></div>
              <button type="button" onClick={() => setDashboardTab('tasks')}
                className={`relative z-10 flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-5 py-2 rounded-xl text-sm font-bold transition-colors cursor-pointer ${dashboardTab === 'tasks' ? 'text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
                <i className="ri-checkbox-circle-line text-[15px]"></i>Tasks
              </button>
              <button type="button" onClick={() => setDashboardTab('projects')}
                className={`relative z-10 flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-5 py-2 rounded-xl text-sm font-bold transition-colors cursor-pointer ${dashboardTab === 'projects' ? 'text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
                <i className="ri-layout-grid-line text-[15px]"></i>Projects
              </button>
            </div>

            {/* Window toggle — controls how far out the "upcoming" task group
                reaches. Overdue/No Due Date/Completed are unaffected by it. */}
            {dashboardTab === 'tasks' && myTasks.length > 0 && (
              <div className="flex sm:inline-flex items-center gap-1 w-full sm:w-auto bg-white/50 backdrop-blur-sm border border-white/80 rounded-xl p-1">
                {([['daily', 'Daily'], ['weekly', 'Weekly'], ['monthly', 'Monthly']] as const).map(([key, label]) => (
                  <button key={key} type="button" onClick={() => setTaskWindow(key)}
                    className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${taskWindow === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {dashboardTab === 'tasks' ? (
            <div className="space-y-6">
              {/* Urgency tiles — tap to jump the window toggle or reveal completed.
                  Compact horizontal layout (icon beside the number, not stacked
                  above it) so 4 tiles don't eat two full screens on mobile. */}
              {myTasks.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                  <div className="bg-white/70 backdrop-blur-sm rounded-xl sm:rounded-2xl border border-white/80 px-2.5 py-2 sm:px-4 sm:py-4 flex items-center sm:block gap-2.5">
                    <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-[10px] bg-rose-50 text-rose-500 flex items-center justify-center text-xs sm:text-sm flex-shrink-0 sm:mb-2.5"><i className="ri-error-warning-line"></i></div>
                    <div className="min-w-0">
                      <p className="text-base sm:text-2xl font-extrabold tracking-tight text-[#1c2b3a] leading-none">{overdueTasks.length}</p>
                      <p className="text-[10px] sm:text-xs font-semibold text-gray-400 mt-0.5 sm:mt-1 truncate">Overdue</p>
                    </div>
                  </div>
                  <button type="button" onClick={() => setTaskWindow('daily')}
                    className={`text-left bg-white/70 backdrop-blur-sm rounded-xl sm:rounded-2xl border px-2.5 py-2 sm:px-4 sm:py-4 flex items-center sm:block gap-2.5 cursor-pointer transition-shadow hover:shadow-lg hover:-translate-y-0.5 duration-150 ${taskWindow === 'daily' ? 'border-[#1c2b3a] ring-1 ring-[#1c2b3a]' : 'border-white/80'}`}>
                    <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-[10px] bg-amber-50 text-amber-500 flex items-center justify-center text-xs sm:text-sm flex-shrink-0 sm:mb-2.5"><i className="ri-sun-line"></i></div>
                    <div className="min-w-0">
                      <p className="text-base sm:text-2xl font-extrabold tracking-tight text-[#1c2b3a] leading-none">{todayDueTasks.length}</p>
                      <p className="text-[10px] sm:text-xs font-semibold text-gray-400 mt-0.5 sm:mt-1 truncate">Due today</p>
                    </div>
                  </button>
                  <button type="button" onClick={() => setTaskWindow('weekly')}
                    className={`text-left bg-white/70 backdrop-blur-sm rounded-xl sm:rounded-2xl border px-2.5 py-2 sm:px-4 sm:py-4 flex items-center sm:block gap-2.5 cursor-pointer transition-shadow hover:shadow-lg hover:-translate-y-0.5 duration-150 ${taskWindow === 'weekly' ? 'border-[#1c2b3a] ring-1 ring-[#1c2b3a]' : 'border-white/80'}`}>
                    <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-[10px] bg-sky-50 text-sky-500 flex items-center justify-center text-xs sm:text-sm flex-shrink-0 sm:mb-2.5"><i className="ri-calendar-todo-line"></i></div>
                    <div className="min-w-0">
                      <p className="text-base sm:text-2xl font-extrabold tracking-tight text-[#1c2b3a] leading-none">{thisWeekTasks.length}</p>
                      <p className="text-[10px] sm:text-xs font-semibold text-gray-400 mt-0.5 sm:mt-1 truncate">This week</p>
                    </div>
                  </button>
                  <button type="button" onClick={() => setShowCompletedTasks(s => !s)}
                    className={`text-left bg-white/70 backdrop-blur-sm rounded-xl sm:rounded-2xl border px-2.5 py-2 sm:px-4 sm:py-4 flex items-center sm:block gap-2.5 cursor-pointer transition-shadow hover:shadow-lg hover:-translate-y-0.5 duration-150 ${showCompletedTasks ? 'border-[#1c2b3a] ring-1 ring-[#1c2b3a]' : 'border-white/80'}`}>
                    <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-[10px] bg-emerald-50 text-emerald-500 flex items-center justify-center text-xs sm:text-sm flex-shrink-0 sm:mb-2.5"><i className="ri-checkbox-circle-line"></i></div>
                    <div className="min-w-0">
                      <p className="text-base sm:text-2xl font-extrabold tracking-tight text-[#1c2b3a] leading-none">{doneTasks.length}</p>
                      <p className="text-[10px] sm:text-xs font-semibold text-gray-400 mt-0.5 sm:mt-1 truncate">Completed</p>
                    </div>
                  </button>
                </div>
              )}

              {/* Task groups: Overdue / Due (window) / Later / No due date,
                  with Completed collapsed behind a toggle so finished work doesn't
                  crowd out what's actually pending. */}
              {myTasks.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 gap-3">
                  <div className="w-14 h-14 rounded-3xl bg-emerald-50 flex items-center justify-center">
                    <i className="ri-checkbox-circle-fill text-emerald-400 text-2xl"></i>
                  </div>
                  <p className="text-sm font-semibold text-gray-500">No tasks assigned yet</p>
                </div>
              ) : (() => {
                const isPending = (t: ProjectTask) => t.status !== 'done';
                const daysOut = (t: ProjectTask) => Math.ceil((new Date(t.due_date! + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime()) / 86400000);
                const windowDays = taskWindow === 'daily' ? 0 : taskWindow === 'weekly' ? 7 : 30;
                // Overdue and no-due-date tasks always show regardless of the
                // window — only how far into the future counts as "in range"
                // depends on Daily/Weekly/Monthly.
                const pendingInWindow = myTasks.filter(t => isPending(t) && (!t.due_date || t.due_date < today || daysOut(t) <= windowDays));

                const getProjectDot = (projectId: number) =>
                  getProjectTypePalette(rows.find(r => r.hub_projects?.id === projectId)?.hub_projects?.project_type_code ?? null).from;

                const TaskRows = ({ list }: { list: ProjectTask[] }) => (
                  <div className="bg-white/70 backdrop-blur-sm rounded-3xl border border-white/80 divide-y divide-gray-100/80 overflow-hidden">
                    {list.map(t => {
                      const projectName = getProjectName(t.project_id);
                      const isOverdue = t.due_date && t.due_date < today && t.status !== 'done';
                      return (
                        <div key={t.id} className={`flex items-start gap-3 px-4 py-3 transition-colors ${t.status === 'done' ? 'opacity-40' : 'hover:bg-gray-50/80'}`}>
                          <button type="button" onClick={() => cycleTask(t)} className="mt-0.5 flex-shrink-0 cursor-pointer">
                            <i className={`text-base ${
                              t.status === 'done'        ? 'ri-checkbox-circle-fill text-emerald-500' :
                              t.status === 'in_progress' ? 'ri-loader-2-line text-sky-500' :
                              t.status === 'in_review'   ? 'ri-eye-line text-violet-400' :
                              t.status === 'blocked'     ? 'ri-forbid-line text-rose-400' :
                              isOverdue                  ? 'ri-error-warning-line text-rose-400' :
                              'ri-checkbox-blank-circle-line text-gray-300 hover:text-gray-400'
                            }`}></i>
                          </button>
                          <button type="button" onClick={() => openViewTask(t)} className="flex-1 min-w-0 text-left cursor-pointer">
                            <p className={`text-sm leading-snug ${t.status === 'done' ? 'line-through text-gray-400' : 'text-gray-800'}`}>{t.title}</p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: getProjectDot(t.project_id) }}></span>
                              <p className="text-[11px] text-gray-400 truncate">{projectName}</p>
                            </div>
                          </button>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {t.priority === 'high' && t.status !== 'done' && <span className="w-1.5 h-1.5 rounded-full bg-rose-400" title="High priority"></span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );

                // Grouped by literal due date (nearest first), same behavior
                // as the admin Tasks list — not by urgency bucket. No-due-
                // date tasks get their own group at the end.
                const dateGroups: Record<string, ProjectTask[]> = {};
                for (const t of pendingInWindow) {
                  const key = t.due_date ?? '__none';
                  (dateGroups[key] ??= []).push(t);
                }
                const dateKeys = Object.keys(dateGroups).filter(k => k !== '__none').sort();
                const orderedDateKeys = dateGroups.__none ? [...dateKeys, '__none'] : dateKeys;

                return (
                  <>
                    {orderedDateKeys.map(key => {
                      const list = dateGroups[key];
                      const isNoDate = key === '__none';
                      const isPast = !isNoDate && key < today;
                      const isToday = key === today;
                      const label = isNoDate
                        ? 'No Due Date'
                        : isToday ? 'Today'
                        : new Date(key + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
                      return (
                        <div key={key} className="space-y-2">
                          <div className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isPast ? 'bg-rose-400' : isNoDate ? 'bg-gray-200' : 'bg-amber-400'}`}></span>
                            <p className={`text-[11px] font-semibold uppercase tracking-widest ${isPast ? 'text-rose-500' : 'text-gray-400'}`}>
                              {label} <span className="text-gray-300 font-normal">({list.length})</span>
                            </p>
                          </div>
                          <TaskRows list={list} />
                        </div>
                      );
                    })}
                    {doneTasks.length > 0 && (
                      <div className="space-y-2">
                        <button type="button" onClick={() => setShowCompletedTasks(s => !s)} className="flex items-center gap-2 cursor-pointer">
                          <i className={`ri-arrow-${showCompletedTasks ? 'down' : 'right'}-s-line text-gray-400 text-sm`}></i>
                          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">Show Completed <span className="text-gray-300 font-normal">({doneTasks.length})</span></p>
                        </button>
                        {showCompletedTasks && <TaskRows list={doneTasks} />}
                      </div>
                    )}
                  </>
                );
              })()}

              {/* Projects glance strip — only projects the employee actually has
                  tasks in (not the whole company's project list, which lives
                  in the Projects tab instead). */}
              {(() => {
                const myProjectIds = new Set(myTasks.map(t => t.project_id));
                const myProjectRows = sortedRows.filter(r => r.hub_projects && myProjectIds.has(r.hub_projects.id));
                if (myProjectRows.length === 0) return null;
                return (
                <div className="pt-2">
                  <div className="flex items-center justify-between mb-3 px-0.5">
                    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">Your Projects <span className="text-gray-300 font-normal">({myProjectRows.length})</span></p>
                    <button type="button" onClick={() => setDashboardTab('projects')}
                      className="text-xs font-semibold text-[#2d4a6e] hover:underline cursor-pointer flex items-center gap-1">
                      View all <i className="ri-arrow-right-line text-sm"></i>
                    </button>
                  </div>
                  <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
                    {myProjectRows.map(r => {
                      const p = r.hub_projects;
                      if (!p) return null;
                      const pTasks = myTasks.filter(t => t.project_id === p.id);
                      const pDone = pTasks.filter(t => t.status === 'done').length;
                      const pPct = pTasks.length > 0 ? Math.round((pDone / pTasks.length) * 100) : 0;
                      const palette = getProjectTypePalette(p.project_type_code);
                      return (
                        <button key={r.id} type="button"
                          onClick={() => { setWorkspaceRow(r); setTaskFilter('all'); setTaskSearch(''); setWsFocusSection(null); }}
                          className="flex-shrink-0 w-[168px] text-left bg-white/70 backdrop-blur-sm border border-white/80 rounded-2xl p-3.5 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-150 cursor-pointer">
                          <div className="flex items-center gap-1.5 mb-2">
                            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: palette.from }}></span>
                            <p className="text-sm font-bold text-gray-900 truncate">{p.project_name}</p>
                          </div>
                          <div className="flex items-center justify-between gap-2 mb-3">
                            <p className="text-[11px] text-gray-400 truncate">{p.client_name || 'Internal Project'}</p>
                            <p className="text-[11px] font-semibold text-gray-500 flex-shrink-0">{pDone}/{pTasks.length}</p>
                          </div>
                          <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${pPct}%`, background: pPct === 100 ? '#10b981' : `linear-gradient(90deg, ${palette.from}, ${palette.to})` }}></div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
                );
              })()}
            </div>
          ) : (
            <div className="space-y-6">
              {/* No search results */}
              {search && active.length === 0 && other.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <i className="ri-search-line text-3xl text-gray-200"></i>
                  <p className="text-sm text-gray-400">No projects match <span className="font-medium text-gray-600">"{search}"</span></p>
                  <button onClick={() => setSearch('')} className="text-xs text-[#1c2b3a]/70 hover:underline cursor-pointer">Clear search</button>
                </div>
              )}

              {/* Project cards: urgency call-outs first, then grouped by stage
                  (not status — nearly every project just sits at "ongoing," so
                  status alone isn't useful for browsing; stage is).
                  Overdue/Due This Week are keyed off the employee's OWN tasks,
                  not the project's deadline — a project the employee has no
                  tasks in yet shouldn't show up as an urgent call-out for them,
                  even if the project itself is behind schedule company-wide. */}
              {(() => {
                const myOverdueProjectIds = new Set(overdueTasks.map(t => t.project_id));
                const myDueSoonProjectIds = new Set(
                  myTasks
                    .filter(t => t.status !== 'done' && t.due_date && t.due_date >= today)
                    .filter(t => Math.ceil((new Date(t.due_date! + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime()) / 86400000) <= 7)
                    .map(t => t.project_id)
                );
                const overdue  = sortedRows.filter(r => r.hub_projects && myOverdueProjectIds.has(r.hub_projects.id) && r.hub_projects.status !== 'completed');
                const dueSoon  = sortedRows.filter(r => r.hub_projects && !overdue.includes(r) && myDueSoonProjectIds.has(r.hub_projects.id) && r.hub_projects.status === 'ongoing');
                const ongoing  = sortedRows.filter(r => r.hub_projects?.status === 'ongoing' && !overdue.includes(r) && !dueSoon.includes(r));
                const paused   = sortedRows.filter(r => r.hub_projects?.status === 'paused');
                const done     = sortedRows.filter(r => r.hub_projects?.status === 'completed');
                const stageGroups = STAGES
                  .map(stage => ({ stage, rows: ongoing.filter(r => (r.hub_projects?.stage ?? 'Pre-Design') === stage) }))
                  .filter(g => g.rows.length > 0);

                const Section = ({ label, rows: sRows, dot }: { label: string; rows: typeof sortedRows; dot: string }) => sRows.length === 0 ? null : (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dot}`}></span>
                      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">{label} <span className="text-gray-300 font-normal">({sRows.length})</span></p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                      {sRows.map((r) => (
                        <ProjectCard key={r.id} row={r}
                          projectTasks={myTasks.filter(t => t.project_id === r.hub_projects?.id)}
                          onClick={() => { setWorkspaceRow(r); setTaskFilter('all'); setTaskSearch(''); setWsFocusSection(null); }}
                        />
                      ))}
                    </div>
                  </div>
                );

                return (
                  <>
                    <Section label="Overdue" rows={overdue} dot="bg-rose-400" />
                    <Section label="Due This Week" rows={dueSoon} dot="bg-amber-400" />
                    {stageGroups.map(({ stage, rows }) => (
                      <Section key={stage} label={stage} rows={rows} dot="bg-[#1c2b3a]/70" />
                    ))}
                    <Section label="Paused" rows={paused} dot="bg-gray-300" />
                    <Section label="Completed" rows={done} dot="bg-emerald-400" />
                  </>
                );
              })()}
            </div>
          )}

        </div>
      ))}


      {/* Task add/edit modal */}
      {/* ── Task drawer ── */}
      {showActivityModal && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px]"
            onClick={() => setShowActivityModal(false)}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="w-full max-w-2xl max-h-[80vh] overflow-hidden rounded-[28px] bg-white shadow-2xl border border-gray-100">
              <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-gray-100">
                <div>
                  <p className="text-sm font-semibold text-gray-900">Project Activity</p>
                  <p className="text-xs text-gray-400">{wsProject?.project_name ?? 'Workspace'}</p>
                </div>
                <button
                  onClick={() => setShowActivityModal(false)}
                  className="w-8 h-8 rounded-full border border-gray-200 text-gray-400 hover:text-gray-700 hover:border-gray-300 transition-colors cursor-pointer flex items-center justify-center"
                >
                  <i className="ri-close-line text-base"></i>
                </button>
              </div>

              <div className="max-h-[calc(80vh-73px)] overflow-y-auto px-5 py-4">
                {activityLog.length === 0 ? (
                  <div className="py-12 text-center">
                    <p className="text-sm text-gray-300">No activity yet</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {activityLog.map(a => {
                      const u = a.hub_users;
                      const icons: Record<string, string> = {
                        task_created: 'ri-add-circle-line text-emerald-500',
                        task_updated: 'ri-edit-line text-[#1c2b3a]/70',
                        task_status_changed: 'ri-refresh-line text-sky-500',
                        task_deleted: 'ri-delete-bin-line text-rose-500',
                        comment_added: 'ri-chat-3-line text-amber-500',
                        comment_deleted: 'ri-chat-delete-line text-rose-500',
                        task_assigned: 'ri-user-add-line text-purple-500',
                      };
                      const labels: Record<string, (a: typeof activityLog[0]) => string> = {
                        task_created: (a) => `created "${a.entity_title}"`,
                        task_updated: (a) => `updated "${a.entity_title}"`,
                        task_status_changed: (a) => `moved "${a.entity_title}" to ${(a.meta as any)?.to?.replace('_', ' ') ?? ''}`,
                        task_deleted: (a) => `deleted "${a.entity_title}"`,
                        comment_added: (a) => `commented on "${a.entity_title}"`,
                        comment_deleted: (a) => `deleted a comment on "${a.entity_title}"`,
                        task_assigned: (a) => `assigned "${a.entity_title}"`,
                      };
                      const diff = Math.floor((Date.now() - new Date(a.created_at).getTime()) / 1000);
                      const time = diff < 60 ? 'just now' : diff < 3600 ? `${Math.floor(diff / 60)}m ago` : diff < 86400 ? `${Math.floor(diff / 3600)}h ago` : new Date(a.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                      return (
                        <div key={a.id} className="flex items-start gap-3 rounded-2xl border border-gray-100 bg-gray-50/70 px-3.5 py-3">
                          <div className="w-8 h-8 rounded-full bg-white border border-gray-100 flex items-center justify-center flex-shrink-0">
                            <i className={`${icons[a.action] ?? 'ri-information-line text-gray-400'} text-sm`}></i>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-gray-700 leading-snug">
                              <span className="font-semibold text-gray-900">{u?.full_name?.split(' ')[0] ?? 'Someone'}</span>
                              {' '}{labels[a.action]?.(a) ?? a.action}
                            </p>
                            <p className="text-xs text-gray-400 mt-1">{time}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {showTaskModal && (() => {
        const dueD = taskForm.due_date ? new Date(taskForm.due_date + 'T00:00:00') : null;
        const startD = taskForm.start_date ? new Date(taskForm.start_date + 'T00:00:00') : null;
        const todayD = new Date(wsToday + 'T00:00:00');
        const daysLeft = dueD ? Math.ceil((dueD.getTime() - todayD.getTime()) / 86400000) : null;
        const duration = (startD && dueD) ? Math.ceil((dueD.getTime() - startD.getTime()) / 86400000) : null;
        const statusCfg = {
          todo:        { label: 'To Do',       icon: 'ri-checkbox-blank-circle-line', bg: 'bg-gray-100',   text: 'text-gray-600' },
          in_progress: { label: 'In Progress', icon: 'ri-loader-2-line',              bg: 'bg-sky-100',    text: 'text-sky-700'  },
          done:        { label: 'Done',         icon: 'ri-checkbox-circle-fill',       bg: 'bg-emerald-100',text: 'text-emerald-700' },
        };
        const assignee = wsTeam.find(m => m.id === taskForm.assigned_to);
        return (
          <>
            <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px]" onClick={() => { setShowTaskModal(false); setMentionOpen(false); setMentionQuery(''); }} />
            <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-[460px] bg-white shadow-2xl flex flex-col" style={{ borderLeft: '1px solid #f3f4f6' }}>

              {/* Dark header — shared between view and edit */}
              <div className="bg-[#111827] px-5 pt-5 pb-4 flex-shrink-0">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2 text-white/40 text-xs">
                    <i className="ri-folder-line text-xs"></i>
                    <span>{wsProject?.project_name}</span>
                    <i className="ri-arrow-right-s-line text-xs"></i>
                    <span>{editingTask ? (drawerMode === 'view' ? 'Task detail' : 'Edit task') : 'New task'}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {drawerMode === 'view' && editingTask && (
                      <button onClick={() => setDrawerMode('edit')} className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-white/60 hover:text-white hover:bg-white/10 cursor-pointer transition-colors text-xs font-medium">
                        <i className="ri-pencil-line text-[11px]"></i> Edit
                      </button>
                    )}
                    {drawerMode === 'edit' && editingTask && (
                      <button onClick={() => setDrawerMode('view')} className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/10 cursor-pointer transition-colors text-xs">
                        <i className="ri-eye-line text-[11px]"></i> View
                      </button>
                    )}
                    <button onClick={() => { setShowTaskModal(false); setMentionOpen(false); setMentionQuery(''); }} className="w-6 h-6 flex items-center justify-center rounded-md text-white/40 hover:text-white hover:bg-white/10 cursor-pointer transition-colors ml-1">
                      <i className="ri-close-line text-sm"></i>
                    </button>
                  </div>
                </div>

                {/* Title — editable in edit, read-only in view */}
                {drawerMode === 'edit' ? (
                  <input
                    type="text"
                    value={taskForm.title}
                    onChange={e => setTaskForm(f => ({ ...f, title: e.target.value }))}
                    placeholder="Task title"
                    autoFocus
                    className="w-full text-lg font-semibold text-white placeholder-white/25 bg-transparent outline-none border-none leading-snug mb-3"
                  />
                ) : (
                  <h2 className="text-lg font-semibold text-white leading-snug mb-3">{editingTask?.title}</h2>
                )}

                {/* Status + Priority row */}
                <div className="flex items-center gap-2 flex-wrap">
                  {drawerMode === 'edit' ? (
                    <>
                      {(['todo', 'in_progress', 'done'] as const).map(s => {
                        const c = statusCfg[s];
                        const active = taskForm.status === s;
                        return (
                          <button key={s} onClick={() => setTaskForm(f => ({ ...f, status: s }))}
                            className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold cursor-pointer transition-all ${active ? `${c.bg} ${c.text}` : 'bg-white/10 text-white/40 hover:bg-white/20'}`}>
                            <i className={`${c.icon} text-[10px]`}></i>{c.label}
                          </button>
                        );
                      })}
                      <div className="w-px h-3 bg-white/20 mx-0.5"></div>
                      {(['low', 'medium', 'high'] as const).map(p => {
                        const cfg = { low: { label: 'Low', active: 'bg-gray-200 text-gray-700' }, medium: { label: 'Med', active: 'bg-amber-400 text-white' }, high: { label: 'High', active: 'bg-rose-500 text-white' } }[p];
                        return (
                          <button key={p} onClick={() => setTaskForm(f => ({ ...f, priority: p }))}
                            className={`px-2.5 py-1 rounded-full text-[11px] font-semibold cursor-pointer transition-all ${taskForm.priority === p ? cfg.active : 'bg-white/10 text-white/40 hover:bg-white/20'}`}>
                            {cfg.label}
                          </button>
                        );
                      })}
                    </>
                  ) : (
                    <>
                      {(() => { const c = statusCfg[editingTask?.status ?? 'todo']; return (
                        <span className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold ${c.bg} ${c.text}`}>
                          <i className={`${c.icon} text-[10px]`}></i>{c.label}
                        </span>
                      ); })()}
                      <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${{ low: 'bg-gray-200 text-gray-700', medium: 'bg-amber-400 text-white', high: 'bg-rose-500 text-white' }[editingTask?.priority ?? 'medium']}`}>
                        {{ low: 'Low', medium: 'Medium', high: 'High' }[editingTask?.priority ?? 'medium']}
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto">
                {/* Description */}
                <div className="px-5 py-4 border-b border-gray-50">
                  <textarea
                    value={taskForm.description}
                    onChange={e => setTaskForm(f => ({ ...f, description: e.target.value }))}
                    rows={3}
                    placeholder="Add context, notes, or details about this task…"
                    maxLength={1000}
                    className="w-full text-sm text-gray-600 placeholder-gray-300 bg-transparent outline-none border-none resize-none leading-relaxed"
                  />
                </div>

                {/* Properties */}
                <div className="px-5 py-4 space-y-0 divide-y divide-gray-50">

                  {/* Dates row */}
                  <div className="py-3 flex items-center gap-3">
                    <i className="ri-calendar-line text-gray-400 text-sm w-4 flex-shrink-0"></i>
                    {drawerMode === 'edit' ? (
                      <div className="flex items-center gap-1.5 flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 focus-within:ring-1 focus-within:ring-slate-200 focus-within:border-[#1c2b3a]/30 transition-all">
                        <input type="date" value={taskForm.start_date} onChange={e => setTaskForm(f => ({ ...f, start_date: e.target.value }))}
                          placeholder="Start"
                          className="text-xs text-gray-700 bg-transparent outline-none cursor-pointer border-0 flex-1" />
                        <span className="text-gray-300 text-xs font-medium flex-shrink-0">→</span>
                        <input type="date" value={taskForm.due_date} onChange={e => setTaskForm(f => ({ ...f, due_date: e.target.value }))}
                          placeholder="Due"
                          className="text-xs text-gray-700 bg-transparent outline-none cursor-pointer border-0 flex-1" />
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 flex-wrap text-sm">
                        {editingTask?.start_date && <span className="text-gray-700">{new Date(editingTask.start_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>}
                        {editingTask?.start_date && editingTask?.due_date && <i className="ri-arrow-right-line text-gray-300 text-xs"></i>}
                        {editingTask?.due_date && <span className={daysLeft !== null && daysLeft < 0 ? 'text-rose-500 font-medium' : 'text-gray-700'}>{new Date(editingTask.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>}
                        {!editingTask?.start_date && !editingTask?.due_date && <span className="text-gray-400 text-xs">No dates set</span>}
                      </div>
                    )}
                  </div>

                  {/* Duration + countdown */}
                  {(duration !== null || daysLeft !== null) && (
                    <div className="py-3 flex items-center gap-3">
                      <i className="ri-time-line text-gray-400 text-sm w-4 flex-shrink-0"></i>
                      <div className="flex items-center gap-2 flex-wrap">
                        {duration !== null && (
                          <span className="text-xs bg-slate-50 text-[#1c2b3a] px-2 py-0.5 rounded-full font-medium">{duration}d duration</span>
                        )}
                        {daysLeft !== null && (
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${daysLeft < 0 ? 'bg-rose-50 text-rose-600' : daysLeft === 0 ? 'bg-amber-50 text-amber-700' : daysLeft <= 7 ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>
                            {daysLeft < 0 ? `${Math.abs(daysLeft)}d overdue` : daysLeft === 0 ? 'Due today' : `${daysLeft}d left`}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Assignee */}
                  {wsTeam.length > 0 && (
                    <div className="py-3 flex items-start gap-3">
                      <i className="ri-user-line text-gray-400 text-sm w-4 flex-shrink-0 mt-0.5"></i>
                      {drawerMode === 'edit' ? (
                        <div className="flex flex-wrap gap-1.5 flex-1">
                          <button onClick={() => setTaskForm(f => ({ ...f, assigned_to: '' }))}
                            className={`px-2.5 py-1 text-xs rounded-full border cursor-pointer transition-all ${!taskForm.assigned_to ? 'bg-gray-800 text-white border-gray-800' : 'border-gray-200 text-gray-400 hover:border-gray-400'}`}>
                            Unassigned
                          </button>
                          {wsTeam.map(m => (
                            <button key={m.id} onClick={() => setTaskForm(f => ({ ...f, assigned_to: m.id }))}
                              className={`flex items-center gap-1.5 pl-1.5 pr-2.5 py-1 rounded-full border cursor-pointer transition-all ${taskForm.assigned_to === m.id ? 'border-[#1c2b3a]/50 bg-slate-50' : 'border-gray-200 hover:border-gray-300'}`}>
                              <HubAvatar fullName={m.full_name} avatarUrl={m.avatar_url} size="w-4 h-4" />
                              <span className={`text-xs font-medium ${taskForm.assigned_to === m.id ? 'text-[#1c2b3a]' : 'text-gray-600'}`}>{m.full_name.split(' ')[0]}</span>
                            </button>
                          ))}
                        </div>
                      ) : (
                        assignee ? (
                          <div className="flex items-center gap-2">
                            <HubAvatar fullName={assignee.full_name} avatarUrl={assignee.avatar_url} size="w-6 h-6" />
                            <span className="text-sm font-medium text-gray-800">{assignee.full_name}</span>
                          </div>
                        ) : <span className="text-xs text-gray-400">Unassigned</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Summary bar — only shows when there's enough info */}
                {(taskForm.title && (assignee || daysLeft !== null)) && (
                  <div className="mx-5 mb-4 bg-gray-50 rounded-2xl p-3.5 space-y-1.5">
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold">Summary</p>
                    <p className="text-xs text-gray-600 leading-relaxed">
                      {assignee ? <><span className="font-medium text-gray-800">{assignee.full_name.split(' ')[0]}</span> is working on </> : 'Task '}
                      <span className="font-medium text-gray-800">"{taskForm.title}"</span>
                      {taskForm.priority !== 'medium' && <> — <span className={taskForm.priority === 'high' ? 'text-rose-600 font-medium' : 'text-gray-500'}>{taskForm.priority} priority</span></>}
                      {daysLeft !== null && <> · {daysLeft < 0 ? <span className="text-rose-500 font-medium">{Math.abs(daysLeft)}d overdue</span> : daysLeft === 0 ? <span className="text-amber-600 font-medium">due today</span> : <span>due in {daysLeft}d</span>}</>}
                    </p>
                  </div>
                )}

                {!editingTask && (
                  <div className="px-5 pb-4">
                    <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-3">
                      {uploadingAttachment ? (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <i className="ri-upload-cloud-2-line text-[#1c2b3a]/50 text-sm"></i>
                            <p className="text-xs text-[#1c2b3a] font-medium truncate">{taskAttachment?.name}</p>
                          </div>
                          <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-[#1c2b3a]/70 rounded-full animate-upload-progress" style={{ width: '40%' }} />
                          </div>
                          <p className="text-[10px] text-[#1c2b3a]/50">Uploading to Drive…</p>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold">Attachment</p>
                            <p className="text-xs text-gray-600 truncate mt-1">
                              {taskAttachment ? taskAttachment.name : 'Optional. Upload an image or file together with the new task.'}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <button
                              type="button"
                              onClick={() => taskAttachmentRef.current?.click()}
                              className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-100 cursor-pointer whitespace-nowrap"
                            >
                              <i className="ri-attachment-2 mr-1"></i>
                              {taskAttachment ? 'Change' : 'Add file'}
                            </button>
                            {taskAttachment && (
                              <button
                                type="button"
                                onClick={() => {
                                  setTaskAttachment(null);
                                  if (taskAttachmentRef.current) taskAttachmentRef.current.value = '';
                                }}
                                className="w-7 h-7 rounded-lg text-gray-400 hover:text-rose-500 hover:bg-white cursor-pointer"
                              >
                                <i className="ri-close-line"></i>
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                      <input
                        ref={taskAttachmentRef}
                        type="file"
                        className="hidden"
                        onChange={(e) => setTaskAttachment(e.target.files?.[0] ?? null)}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Comments — only when editing an existing task */}
              {editingTask && (
                <div className="border-t border-gray-100">
                  <div className="px-5 pt-4 pb-2 flex items-center gap-2">
                    <i className="ri-chat-3-line text-gray-400 text-sm"></i>
                    <span className="text-xs font-semibold text-gray-600">Comments</span>
                    {taskComments.length > 0 && <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">{taskComments.length}</span>}
                  </div>

                  {/* Comment list */}
                  <div className="px-5 space-y-3 max-h-52 overflow-y-auto pb-2">
                    {taskComments.length === 0 && (
                      <p className="text-xs text-gray-400 py-2">No comments yet. Be the first.</p>
                    )}
                    {taskComments.map(c => {
                      const u = Array.isArray(c.hub_users) ? c.hub_users[0] : c.hub_users;
                      const isOwn = c.user_id === hubUser?.id;
                      const timeAgo = (() => {
                        const diff = Math.floor((Date.now() - new Date(c.created_at).getTime()) / 1000);
                        if (diff < 30) return 'just now';
                        if (diff < 60) return `${diff}s ago`;
                        if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
                        if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
                        return new Date(c.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
                          ' at ' + new Date(c.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
                      })();
                      return (
                        <div key={c.id} className="flex gap-2.5 group">
                          <HubAvatar fullName={u?.full_name ?? ''} avatarUrl={u?.avatar_url} size="w-6 h-6" className="flex-shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline gap-2 mb-0.5">
                              <span className="text-xs font-semibold text-gray-800">{u?.full_name?.split(' ')[0] ?? 'Unknown'}</span>
                              <span className="text-[10px] text-gray-400">{timeAgo}</span>
                              {isOwn && (
                                <button onClick={() => deleteComment(c.id)} className="opacity-0 group-hover:opacity-100 text-[10px] text-gray-300 hover:text-rose-400 cursor-pointer transition-all ml-auto flex-shrink-0">
                                  <i className="ri-delete-bin-line"></i>
                                </button>
                              )}
                            </div>
                            <p className="text-xs text-gray-600 leading-relaxed break-words">{c.body.split(/(@\w+)/g).map((part, i) =>
                              part.startsWith('@') ? (
                                <span key={i} className="text-[#1c2b3a] font-semibold">{part}</span>
                              ) : part
                            )}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Comment input */}
                  <div className="px-5 pt-2 pb-4 flex gap-2 items-end">
                    <HubAvatar fullName={hubUser?.full_name ?? ''} avatarUrl={hubUser?.avatar_url} size="w-6 h-6" className="flex-shrink-0 mb-0.5" />
                    <div className="relative flex-1">
                      {(() => {
                        const mentionSuggestions = wsTeam.filter(m =>
                          m.full_name.toLowerCase().includes(mentionQuery) ||
                          m.full_name.split(' ')[0].toLowerCase().startsWith(mentionQuery)
                        ).slice(0, 5);
                        return mentionOpen && mentionSuggestions.length > 0 ? (
                          <div className="absolute bottom-full left-0 right-0 mb-1 bg-white rounded-xl border border-gray-200 shadow-lg overflow-hidden z-10">
                            {mentionSuggestions.map(m => (
                              <button key={m.id} onMouseDown={e => { e.preventDefault(); insertMention(m); }}
                                className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 transition-colors text-left cursor-pointer">
                                <HubAvatar fullName={m.full_name} avatarUrl={m.avatar_url} size="w-6 h-6" className="flex-shrink-0" />
                                <div>
                                  <p className="text-sm font-medium text-gray-800">{m.full_name}</p>
                                  <p className="text-[10px] text-gray-400">@{m.full_name.split(' ')[0].toLowerCase()}</p>
                                </div>
                              </button>
                            ))}
                          </div>
                        ) : null;
                      })()}
                    <div className="flex items-end gap-2 bg-gray-50 border border-gray-200 rounded-2xl px-3 py-2 focus-within:ring-1 focus-within:ring-slate-200 focus-within:border-[#1c2b3a]/30 transition-all">
                      <textarea
                        value={newComment}
                        onChange={e => {
                          const val = e.target.value;
                          setNewComment(val);
                          const pos = e.target.selectionStart ?? val.length;
                          const before = val.slice(0, pos);
                          const match = before.match(/@(\w*)$/);
                          if (match) {
                            setMentionQuery(match[1].toLowerCase());
                            setMentionStart(pos - match[0].length);
                            setMentionOpen(true);
                          } else {
                            setMentionOpen(false);
                          }
                        }}
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); postComment(); } }}
                        placeholder="Add a comment…"
                        rows={1}
                        className="flex-1 text-xs text-gray-700 placeholder-gray-400 bg-transparent outline-none resize-none leading-relaxed"
                        style={{ minHeight: 20, maxHeight: 80 }}
                      />
                      <button onClick={postComment} disabled={!newComment.trim() || postingComment}
                        className="w-6 h-6 flex items-center justify-center bg-[#111827] text-white rounded-lg disabled:opacity-30 cursor-pointer flex-shrink-0 transition-opacity hover:bg-gray-700">
                        <i className="ri-send-plane-fill text-[11px]"></i>
                      </button>
                    </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Footer */}
              <div className="flex items-center gap-2 px-5 py-4 border-t border-gray-100 flex-shrink-0">
                {editingTask && (
                  <button onClick={() => { if (window.confirm('Delete this task?')) { deleteTask(editingTask.id); setShowTaskModal(false); setMentionOpen(false); setMentionQuery(''); } }}
                    className="w-9 h-9 flex items-center justify-center text-gray-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl cursor-pointer transition-colors">
                    <i className="ri-delete-bin-line text-sm"></i>
                  </button>
                )}
                <button onClick={saveTask} disabled={taskSaving || !taskForm.title.trim()}
                  className="flex-1 py-2.5 text-sm bg-[#111827] text-white rounded-xl hover:bg-gray-800 disabled:opacity-40 cursor-pointer transition-colors font-medium">
                  {taskSaving ? 'Saving…' : editingTask ? 'Save changes' : 'Add Task'}
                </button>
              </div>
            </div>
          </>
        );
      })()}
      <TaskDetailPanel
        task={editingTask ? {
          id: editingTask.id,
          project_id: editingTask.project_id,
          title: editingTask.title,
          description: editingTask.description,
          status: editingTask.status,
          priority: editingTask.priority,
          assignee_id: getPrimaryTaskAssigneeId(editingTask),
          assignee_ids: getTaskAssigneeIds(editingTask),
          due_date: editingTask.due_date,
          start_date: editingTask.start_date,
          checklist: editingTask.checklist,
          color: (editingTask as any).color ?? null,
          meta: (editingTask as any).meta ?? null,
          hub_users: wsTeam.find(m => m.id === getPrimaryTaskAssigneeId(editingTask))
            ? { id: wsTeam.find(m => m.id === getPrimaryTaskAssigneeId(editingTask))!.id, full_name: wsTeam.find(m => m.id === getPrimaryTaskAssigneeId(editingTask))!.full_name, avatar_url: wsTeam.find(m => m.id === getPrimaryTaskAssigneeId(editingTask))!.avatar_url ?? null }
            : null,
        } : null}
        open={detailPanelOpen}
        onClose={() => { setDetailPanelOpen(false); setEditingTask(null); }}
        onSaved={(saved) => {
          const mapped: ProjectTask = {
            ...saved,
            assigned_to: getPrimaryTaskAssigneeId(saved),
            assignee_ids: getTaskAssigneeIds(saved),
            start_date: saved.start_date ?? null,
            checklist: saved.checklist,
            ...(saved.color !== undefined ? { color: saved.color } as any : {}),
          };
          setTasks(prev => prev.some(t => t.id === saved.id)
            ? prev.map(t => t.id === saved.id ? mapped : t)
            : [...prev, mapped]);
          setEditingTask(mapped);
          refreshWorkspaceActivity();
        }}
        onDeleted={(id) => {
          setTasks(prev => prev.filter(t => t.id !== id));
          setDetailPanelOpen(false);
          setEditingTask(null);
          refreshWorkspaceActivity();
        }}
        onArchived={(id) => {
          setTasks(prev => prev.map(t => t.id === id ? { ...t, archived: true, archived_at: new Date().toISOString() } : t));
          setDetailPanelOpen(false);
          setEditingTask(null);
        }}
        onActivityChange={refreshWorkspaceActivity}
        projectId={detailProjectId}
        projectName={detailProjectName}
        teamMembers={detailTeam}
        canEdit={true}
        currentUserId={hubUser?.id ?? ''}
        currentUserName={hubUser?.full_name ?? 'Contractor'}
        currentUserAvatarUrl={hubUser?.avatar_url ?? null}
      />
    </ContractorLayout>
  );
}
