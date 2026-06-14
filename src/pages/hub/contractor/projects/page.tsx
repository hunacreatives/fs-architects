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

const fmt = (n: number) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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

interface ContractorPayout { id: number; amount: number; paid_at: string; notes: string | null; receipt_url: string | null; }

interface TeamMember { id: string; full_name: string; avatar_url: string | null; }

interface ProjectRow {
  id: number;
  percentage: number;
  payout_type: string;
  fixed_amount: number | null;
  payout_status: string;
  paid_at: string | null;
  hub_project_contractor_payouts: ContractorPayout[];
  hub_projects: {
    id: number;
    project_type: 'client' | 'internal';
    client_name: string;
    project_name: string;
    service: string | null;
    contract_price: number;
    status: string;
    start_date: string | null;
    deadline: string | null;
    notes: string | null;
    drive_url: string | null;
    slug: string | null;
    hub_project_payments: { amount: number }[];
    hub_project_costs: { amount: number }[];
  };
}

interface ProjectRowRaw extends Omit<ProjectRow, 'hub_projects'> {
  hub_projects: ProjectRow['hub_projects'] | ProjectRow['hub_projects'][];
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

// ── Project detail drawer ──────────────────────────────────────────────────
function ProjectDetail({ row, tasks, team, onClose, onReceiptClick }: {
  row: ProjectRow;
  tasks: ProjectTask[];
  team: TeamMember[];
  onClose: () => void;
  onReceiptClick: (url: string) => void;
}) {
  const p = row.hub_projects;
  const today = localToday();
  const isInternal = p.project_type === 'internal';
  const isRetainer = p.project_type === 'retainer';
  const totalPaid = p.hub_project_payments.reduce((s, x) => s + x.amount, 0);
  const totalCosts = p.hub_project_costs.reduce((s, x) => s + x.amount, 0);
  const netProfit = p.contract_price - totalCosts;
  const isFixed = row.payout_type === 'fixed';
  const myCut = isFixed ? (row.fixed_amount ?? 0) : netProfit * (row.percentage / 100);
  const payouts = row.hub_project_contractor_payouts ?? [];
  const totalPaidOut = payouts.reduce((s, x) => s + x.amount, 0);
  const payoutPct = myCut > 0 ? Math.min((totalPaidOut / myCut) * 100, 100) : 0;
  const isFullyPaid = totalPaidOut >= myCut && myCut > 0;
  const tasksDone = tasks.filter(t => t.status === 'done').length;
  const tasksPct = tasks.length > 0 ? Math.round((tasksDone / tasks.length) * 100) : 0;
  const overdue = tasks.filter(t => t.due_date && t.due_date < today && t.status !== 'done');
  const [taskTab, setTaskTab] = useState<'all' | 'todo' | 'in_progress' | 'done'>('all');

  const statusColors: Record<string, string> = {
    ongoing: 'bg-blue-100 text-blue-700',
    completed: 'bg-emerald-100 text-emerald-700',
    paused: 'bg-amber-100 text-amber-700',
    cancelled: 'bg-gray-100 text-gray-500',
  };
  const statusLabels: Record<string, string> = { ongoing: 'Active', completed: 'Done', paused: 'Paused', cancelled: 'Archived' };

  const filteredTasks = tasks.filter(t => taskTab === 'all' || t.status === taskTab);

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-xl bg-white shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-start gap-3 px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-bold text-gray-900 text-base leading-snug">{p.project_name}</h2>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide flex-shrink-0 ${statusColors[p.status] ?? statusColors.ongoing}`}>
                {statusLabels[p.status] ?? p.status}
              </span>
              {p.service && (
                <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-500">{p.service}</span>
              )}
            </div>
            <p className="text-sm text-gray-400 mt-0.5">{isInternal ? 'Internal Project' : p.client_name}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-400 hover:text-gray-700 cursor-pointer flex-shrink-0">
            <i className="ri-close-line"></i>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="p-5 space-y-5">

            {/* Dates */}
            {(p.start_date || p.deadline) && (
              <div className="flex items-center gap-6 text-sm">
                {p.start_date && (
                  <div>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide font-medium mb-0.5">Start</p>
                    <p className="font-medium text-gray-700">{new Date(p.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                  </div>
                )}
                {p.start_date && p.deadline && <i className="ri-arrow-right-line text-gray-300"></i>}
                {p.deadline && (
                  <div>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide font-medium mb-0.5">Deadline</p>
                    <p className={`font-medium ${p.deadline < today && p.status !== 'completed' ? 'text-rose-500' : 'text-gray-700'}`}>
                      {new Date(p.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Progress + payout/ops stats */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-50 rounded-2xl p-4 flex flex-col gap-2">
                <p className="text-[10px] text-gray-400 uppercase tracking-wide font-medium">Task Progress</p>
                <div className="flex items-center gap-3">
                  <ProgressRing pct={tasksPct} size={52} />
                  <div>
                    <p className="text-sm font-bold text-gray-800">{tasksDone}/{tasks.length}</p>
                    <p className="text-[11px] text-gray-400">tasks done</p>
                    {overdue.length > 0 && <p className="text-[11px] text-rose-500 font-medium">{overdue.length} overdue</p>}
                  </div>
                </div>
              </div>
              {isInternal || isRetainer ? (
                <div className="bg-gray-50 rounded-2xl p-4 flex flex-col gap-2">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide font-medium">Project</p>
                  <p className="text-sm font-bold text-gray-900 leading-none">{isRetainer ? 'Retainer' : 'Internal'}</p>
                  <p className="text-[11px] text-gray-400">Ongoing engagement</p>
                </div>
              ) : (
                <div className="bg-gray-50 rounded-2xl p-4 flex flex-col gap-2">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide font-medium">Your Payout</p>
                  <p className="text-lg font-bold text-gray-900 leading-none">{fmt(myCut)}</p>
                  <p className="text-[11px] text-gray-400">{isFixed ? 'Fixed fee' : `${row.percentage}% of net`}</p>
                  <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${isFullyPaid ? 'bg-emerald-400' : 'bg-blue-400'}`} style={{ width: `${payoutPct}%` }} />
                  </div>
                  <p className={`text-[11px] font-medium ${isFullyPaid ? 'text-emerald-600' : 'text-gray-400'}`}>
                    {isFullyPaid ? 'Paid in full ✓' : `${fmt(totalPaidOut)} received`}
                  </p>
                </div>
              )}
            </div>

            {/* Project overall payment progress — client only, not retainer */}
            {!isInternal && !isRetainer && (
              <div className="bg-gray-50 rounded-2xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide font-medium">Project Collections</p>
                  <p className="text-xs font-semibold text-gray-600">{fmt(totalPaid)} / {fmt(p.contract_price)}</p>
                </div>
                <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-400 rounded-full" style={{ width: `${p.contract_price > 0 ? Math.min((totalPaid / p.contract_price) * 100, 100) : 0}%` }} />
                </div>
                <p className="text-[11px] text-gray-400">{p.contract_price > 0 ? ((totalPaid / p.contract_price) * 100).toFixed(0) : 0}% collected from client</p>
              </div>
            )}

            {/* Tasks */}
            {tasks.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold text-gray-800">Tasks</p>
                  <div className="flex gap-1 bg-gray-100 p-0.5 rounded-lg">
                    {(['all', 'todo', 'in_progress', 'done'] as const).map(f => {
                      const count = f === 'all' ? tasks.length : tasks.filter(t => t.status === f).length;
                      const labels: Record<string, string> = { all: 'All', todo: 'Todo', in_progress: 'Active', done: 'Done' };
                      return count > 0 || f === 'all' ? (
                        <button key={f} onClick={() => setTaskTab(f)}
                          className={`px-2.5 py-1 rounded-md text-[11px] font-medium cursor-pointer transition-colors ${taskTab === f ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}>
                          {labels[f]}{f !== 'all' && <span className="ml-1 opacity-70">{count}</span>}
                        </button>
                      ) : null;
                    })}
                  </div>
                </div>
                <div className="space-y-0.5 bg-gray-50/60 rounded-2xl py-1">
                  {filteredTasks.map(t => (
                    <TaskRow key={t.id} task={t} team={team} />
                  ))}
                  {filteredTasks.length === 0 && (
                    <p className="text-xs text-gray-300 text-center py-4">No tasks here</p>
                  )}
                </div>
              </div>
            )}

            {/* Team */}
            {team.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-gray-800 mb-3">Team</p>
                <div className="flex flex-wrap gap-2">
                  {team.map(m => (
                    <div key={m.id} className="flex items-center gap-2 bg-gray-50 rounded-full px-3 py-1.5">
                      {m.avatar_url
                        ? <img src={m.avatar_url} alt={m.full_name} className="w-5 h-5 rounded-full object-cover object-top flex-shrink-0" />
                        : <div className="w-5 h-5 rounded-full bg-gray-300 flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0">{m.full_name[0]}</div>
                      }
                      <span className="text-xs text-gray-700 font-medium">{m.full_name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Notes */}
            {p.notes && (
              <div>
                <p className="text-sm font-semibold text-gray-800 mb-2">Notes</p>
                <p className="text-sm text-gray-500 bg-gray-50 rounded-2xl p-4 leading-relaxed whitespace-pre-line">{p.notes}</p>
              </div>
            )}

            {/* Payout history — client only, not retainer */}
            {!isInternal && !isRetainer && payouts.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-gray-800 mb-3">Payout History</p>
                <div className="space-y-2">
                  {payouts.map(pp => (
                    <div key={pp.id} className="flex items-center gap-3 bg-gray-50 rounded-2xl px-4 py-3">
                      <i className="ri-check-line text-emerald-500 flex-shrink-0"></i>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800">{fmt(pp.amount)}</p>
                        {pp.notes && <p className="text-xs text-gray-400 truncate">{pp.notes}</p>}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-xs text-gray-400">{new Date(pp.paid_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                        {pp.receipt_url && (
                          <button onClick={() => onReceiptClick(pp.receipt_url!)} className="text-[11px] text-sky-500 hover:text-sky-700 cursor-pointer flex items-center gap-0.5 ml-auto">
                            <i className="ri-image-line text-[10px]"></i> Receipt
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ── Per-project color palette ──────────────────────────────────────────────
// Colors based on service type
const getCardPalette = (service: string | null) => {
  const s = (service ?? '').toLowerCase();
  if (s.includes('architecture'))        return { from: '#1c2b3a', to: '#2d4a6e' }; // navy
  if (s.includes('interior design'))     return { from: '#d97706', to: '#f59e0b' }; // amber
  if (s.includes('design & drafting') || s.includes('drafting')) return { from: '#0ea5e9', to: '#06b6d4' }; // sky-cyan
  if (s.includes('project management'))  return { from: '#10b981', to: '#0ea5e9' }; // emerald-sky
  if (s.includes('construction'))        return { from: '#ef4444', to: '#f97316' }; // red-orange
  if (s.includes('feasibility'))         return { from: '#ec4899', to: '#f43f5e' }; // pink-rose
  if (s.includes('design-build') || s.includes('design build')) return { from: '#1c2b3a', to: '#475569' }; // navy-slate
  if (s.includes('renovation'))          return { from: '#14b8a6', to: '#10b981' }; // teal-emerald
  if (s.includes('consultation'))        return { from: '#64748b', to: '#475569' }; // slate
  return                                        { from: '#94a3b8', to: '#64748b' }; // gray — other/internal
};

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
  const isFixed = row.payout_type === 'fixed';
  const totalCosts = p.hub_project_costs.reduce((s, x) => s + x.amount, 0);
  const netProfit = p.contract_price - totalCosts;
  const myCut = isFixed ? (row.fixed_amount ?? 0) : netProfit * (row.percentage / 100);
  const payouts = row.hub_project_contractor_payouts ?? [];
  const totalPaidOut = payouts.reduce((s, x) => s + x.amount, 0);
  const isFullyPaid = totalPaidOut >= myCut && myCut > 0;
  const isRetainerProject = p.project_type === 'retainer';
  const showPayout = !internalProject && !isRetainerProject && myCut > 0;

  const daysLeft = p.deadline
    ? Math.ceil((new Date(p.deadline + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime()) / 86400000)
    : null;
  const isOverdue = !!(p.deadline && p.deadline < today && p.status !== 'completed');
  const palette = getCardPalette(p.service);

  const statusLabel = { ongoing: 'Active', completed: 'Completed', paused: 'Paused', cancelled: 'Archived' }[p.status] ?? p.status;
  const healthLabel = (() => {
    if (p.status === 'cancelled') return 'Archived';
    if (p.status === 'completed') return 'Completed';
    if (overdueCount > 0) return 'Overdue';
    if (projectTasks.length === 0) return 'No tasks yet';
    if (daysLeft !== null && daysLeft <= 7) return 'Due this week';
    if (internalProject && inProgressCount > 0) return 'Internal sprint';
    if (showPayout && isFullyPaid) return 'Fully paid';
    return 'In progress';
  })();
  const healthCls =
    healthLabel === 'Archived' ? 'bg-gray-100 text-gray-500' :
    healthLabel === 'Completed' ? 'bg-emerald-100 text-emerald-700' :
    healthLabel === 'Overdue' ? 'bg-rose-100 text-rose-600' :
    healthLabel === 'Due this week' ? 'bg-amber-100 text-amber-700' :
    healthLabel === 'Internal sprint' ? 'bg-slate-100 text-[#1c2b3a]' :
    healthLabel === 'Fully paid' ? 'bg-emerald-100 text-emerald-700' :
    healthLabel === 'No tasks yet' ? 'bg-gray-100 text-gray-500' :
    'bg-sky-100 text-sky-600';

  return (
    <button onClick={onClick}
      className="w-full text-left rounded-3xl overflow-hidden hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200 cursor-pointer group"
      style={{ background: 'rgba(255,255,255,0.75)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.9)', boxShadow: '0 2px 20px rgba(0,0,0,0.06)' }}>

      <div className="p-3.5 space-y-2.5">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            {/* Service chip */}
            {p.service && (
              <span className="inline-block text-[10px] font-semibold tracking-widest uppercase mb-1" style={{ color: palette.from }}>
                {p.service}
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
  const [clientEntries, setClientEntries] = useState<{ id: string; rowId?: number; name: string; type: 'retainer' | 'assignment'; status: string; service?: string | null; monthly_rate?: number | null; months_paid?: number; platform?: string | null; role?: string | null; notes?: string | null; clientId?: number }[]>([]);
  const [tasks, setTasks] = useState<ProjectTask[]>([]);
  const [teamMap, setTeamMap] = useState<Record<number, TeamMember[]>>({});
  const [loading, setLoading] = useState(true);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [workspaceRow, setWorkspaceRow] = useState<ProjectRow | null>(null);
  const [clientWorkspace, setClientWorkspace] = useState<typeof clientEntries[0] | null>(null);
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
            }).catch(() => {});
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
        }).catch(() => {});
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
      try {
        // 1. contractor's assignments + project_ids in one query
        const { data: pcData, error: pcErr } = await supabase
          .from('hub_project_contractors')
          .select('id, project_id, percentage, payout_type, fixed_amount, payout_status, paid_at')
          .eq('contractor_id', hubUser.id);
        if (pcErr) throw pcErr;
        if (!pcData?.length) { setLoading(false); return; }

        const projectIds = [...new Set(pcData.map((r: any) => r.project_id as number))];
        const pcIds = pcData.map((r: any) => r.id as number);

        // 2. fetch everything in parallel — no nested joins
        const [
          { data: projectsData },
          { data: payoutsData },
          { data: paymentsData },
          { data: costsData },
        ] = await Promise.all([
          supabase.from('hub_projects').select('id, project_type, client_name, project_name, service, contract_price, status, start_date, deadline, notes, drive_url, slug').in('id', projectIds),
          supabase.from('hub_project_contractor_payouts').select('id, amount, paid_at, notes, receipt_url, project_contractor_id').in('project_contractor_id', pcIds),
          supabase.from('hub_project_payments').select('amount, project_id').in('project_id', projectIds),
          supabase.from('hub_project_costs').select('amount, project_id').in('project_id', projectIds),
        ]);

        const projectMap = Object.fromEntries((projectsData ?? []).map((p: any) => [p.id, p]));
        const payoutsByPc: Record<number, any[]> = {};
        for (const p of (payoutsData ?? [])) (payoutsByPc[p.project_contractor_id] ??= []).push(p);
        const paymentsByProject: Record<number, { amount: number }[]> = {};
        for (const p of (paymentsData ?? [])) (paymentsByProject[p.project_id] ??= []).push({ amount: p.amount });
        const costsByProject: Record<number, { amount: number }[]> = {};
        for (const c of (costsData ?? [])) (costsByProject[c.project_id] ??= []).push({ amount: c.amount });

        const normalized: ProjectRow[] = pcData.map((pc: any) => {
          const project = projectMap[pc.project_id];
          if (!project) return null;
          return {
            id: pc.id,
            percentage: pc.percentage,
            payout_type: pc.payout_type,
            fixed_amount: pc.fixed_amount,
            payout_status: pc.payout_status,
            paid_at: pc.paid_at,
            hub_project_contractor_payouts: payoutsByPc[pc.id] ?? [],
            hub_projects: {
              ...project,
              hub_project_payments: paymentsByProject[pc.project_id] ?? [],
              hub_project_costs: costsByProject[pc.project_id] ?? [],
            },
          };
        }).filter(Boolean) as ProjectRow[];

        setRows(normalized);

        // 3. tasks + team
        const [{ data: taskData }, { data: pcTeamData }] = await Promise.all([
          supabase.from('hub_project_tasks').select('id, project_id, title, description, status, priority, due_date, start_date, assigned_to, assignee_ids, checklist, color, meta, archived, archived_at').in('project_id', projectIds),
          supabase.from('hub_project_contractors').select('project_id, contractor_id').in('project_id', projectIds),
        ]);
        setTasks((taskData as ProjectTask[]) ?? []);

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

        // Fetch retainer clients + international assignments
        const [{ data: pcRetainers }, { data: assignData }] = await Promise.all([
          supabase.from('hub_project_contractors')
            .select('id, hub_project_contractor_payouts(amount), hub_projects(id, client_name, project_name, service, status, project_type, monthly_rate)')
            .eq('contractor_id', hubUser.id),
          supabase.from('hub_client_assignments')
            .select('id, role, hub_clients(id, client_name, platform, status, notes)')
            .eq('contractor_id', hubUser.id),
        ]);

        const retainerEntries = (pcRetainers ?? [])
          .filter((r: any) => { const p = Array.isArray(r.hub_projects) ? r.hub_projects[0] : r.hub_projects; return p?.project_type === 'retainer'; })
          .map((r: any) => {
            const p = Array.isArray(r.hub_projects) ? r.hub_projects[0] : r.hub_projects;
            const totalPaid = (r.hub_project_contractor_payouts ?? []).reduce((s: number, x: any) => s + x.amount, 0);
            const monthlyRate = p?.monthly_rate ?? 0;
            return { id: `retainer-${r.id}`, rowId: r.id as number, name: p?.project_name ?? p?.client_name ?? 'Retainer', type: 'retainer' as const, status: p?.status ?? 'ongoing', service: p?.service, monthly_rate: monthlyRate, months_paid: monthlyRate > 0 ? Math.round(totalPaid / monthlyRate) : 0 };
          });

        const seenClientIds = new Set<number>();
        const seenKeys = new Set<string>();
        const seenRetainerNames = new Set(retainerEntries.map(r => r.name.toLowerCase()));
        const assignmentEntries = (assignData ?? [])
          .map((a: any) => {
            const cl = Array.isArray(a.hub_clients) ? a.hub_clients[0] : a.hub_clients;
            return { id: `assign-${a.id}`, clientId: cl?.id as number | undefined, name: cl?.client_name ?? '', type: 'assignment' as const, status: cl?.status ?? 'active', platform: cl?.platform, role: a.role, notes: cl?.notes };
          })
          .filter(e => {
            if (!e.name) return false; // drop entries with no client data
            if (e.clientId) {
              if (seenClientIds.has(e.clientId)) return false;
              seenClientIds.add(e.clientId);
            } else {
              const key = `${e.name.toLowerCase()}|${(e.role ?? '').toLowerCase()}`;
              if (seenKeys.has(key)) return false;
              seenKeys.add(key);
            }
            if (seenRetainerNames.has(e.name.toLowerCase())) return false;
            return true;
          });
        setClientEntries([...retainerEntries, ...assignmentEntries]);
      } catch (err) {
        console.error('Projects load error:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [hubUser, projectRefreshKey]);

  // Realtime: re-fetch when admin assigns or removes this contractor from a project
  useEffect(() => {
    if (!hubUser?.id || isDemo) return;
    const channel = supabase
      .channel(`contractor-assignments-${hubUser.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'hub_project_contractors',
        filter: `contractor_id=eq.${hubUser.id}`,
      }, () => setProjectRefreshKey(k => k + 1))
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
  const greetingEmoji = hour < 6 ? '🌙' : hour < 12 ? '☀️' : hour < 17 ? '🌤️' : hour < 20 ? '🌇' : '🌙';
  const greetingGradient = hour < 6
    ? 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)'   // night — indigo-violet
    : hour < 10
    ? 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)'   // early morning — amber-rose
    : hour < 12
    ? 'linear-gradient(135deg, #f97316 0%, #eab308 100%)'   // morning — orange-yellow
    : hour < 15
    ? 'linear-gradient(135deg, #0ea5e9 0%, #6366f1 100%)'   // afternoon — sky-indigo
    : hour < 18
    ? 'linear-gradient(135deg, #10b981 0%, #0ea5e9 100%)'   // late afternoon — emerald-sky
    : hour < 20
    ? 'linear-gradient(135deg, #f97316 0%, #8b5cf6 100%)'   // evening — orange-violet
    : 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)';  // night — indigo-violet
  const today = localToday();
  const firstName = hubUser?.full_name?.split(' ')[0] ?? '';

  const myTasks = tasks.filter(t => getTaskAssigneeIds(t).includes(hubUser?.id ?? '') && !t.archived_at);
  const doneTasks = myTasks.filter(t => t.status === 'done');
  const inProgressTasks = myTasks.filter(t => ['in_progress', 'in_review', 'blocked'].includes(t.status));
  const todoTasks = myTasks.filter(t => t.status === 'todo');
  const overdueTasks = myTasks.filter(t => t.due_date && t.due_date < today && t.status !== 'done');
  const todayDueTasks = myTasks.filter(t => t.due_date === today && t.status !== 'done');
  const pct = myTasks.length > 0 ? Math.round((doneTasks.length / myTasks.length) * 100) : 0;

  const sortedMyTasks = [
    ...myTasks.filter(t => t.due_date && t.due_date < today && t.status !== 'done'),
    ...myTasks.filter(t => t.status === 'in_progress' && !(t.due_date && t.due_date < today)),
    ...myTasks.filter(t => t.status === 'in_review' && !(t.due_date && t.due_date < today)),
    ...myTasks.filter(t => t.status === 'blocked' && !(t.due_date && t.due_date < today)),
    ...myTasks.filter(t => t.status === 'todo' && !(t.due_date && t.due_date < today)),
    ...myTasks.filter(t => t.status === 'done'),
  ];

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

  const openTaskFromDashboard = (task: ProjectTask) => {
    const row = rows.find(r => r.hub_projects?.id === task.project_id);
    if (!row) return;
    setWorkspaceRow(row);
    setTaskFilter('all');
    setTaskSearch('');
    setWsSearch('');
    setWsSearchOpen(false);
    setWsFocusSection('ws-tasks');
    openViewTask(task);
  };

  const searchLower = search.toLowerCase();
  // My Work = one-time + internal only (retainers live in My Clients)
  const workRows = rows.filter(r => r.hub_projects?.project_type !== 'retainer');
  const filteredRows = search
    ? workRows.filter(r => {
        const p = r.hub_projects;
        return p?.project_name?.toLowerCase().includes(searchLower)
          || p?.client_name?.toLowerCase().includes(searchLower)
          || p?.service?.toLowerCase().includes(searchLower);
      })
    : workRows;
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
  ].concat(wsProject.project_type === 'internal' ? [] : [
    { label: 'Payout', description: `${wsProject.project_name} · Your earnings`, icon: 'ri-money-dollar-circle-line', id: 'ws-sidebar', iconCls: 'bg-slate-50 text-[#1c2b3a]', keywords: ['payout', 'payment', 'earnings', 'salary', 'money', 'fee', 'income', 'receive'] },
  ]) : [];

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
      title={workspaceRow ? undefined : 'My Work'}
      hideGlobalSearch={!!workspaceRow}
      actions={wsSearchActions}
      titleContent={workspaceRow && wsProject ? (
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => { setWorkspaceRow(null); setTaskFilter('all'); setTaskSearch(''); setWsSearch(''); setWsSearchOpen(false); setWsFocusSection(null); }}
            className="w-8 h-8 flex items-center justify-center rounded-xl bg-white border border-gray-200 text-gray-500 hover:text-gray-800 hover:bg-gray-50 cursor-pointer transition-all shadow-sm flex-shrink-0">
            <i className="ri-arrow-left-s-line text-base"></i>
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-gray-900 truncate leading-tight">{wsProject.project_name}</p>
            <p className="text-xs text-gray-400 truncate">{wsIsInternal ? 'Internal Project' : wsProject.client_name}{wsProject.service ? ` · ${wsProject.service}` : ''}</p>
          </div>
          <button
            onClick={() => {
              const slug = wsProject.slug || slugify(wsProject.client_name);
              const url = `https://hunacreatives.com/hub/contractor/project/${slug}`;
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
      ) : clientWorkspace ? (
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => setClientWorkspace(null)}
            className="w-8 h-8 flex items-center justify-center rounded-xl bg-white border border-gray-200 text-gray-500 hover:text-gray-800 hover:bg-gray-50 cursor-pointer transition-all shadow-sm flex-shrink-0">
            <i className="ri-arrow-left-s-line text-base"></i>
          </button>
          <div className="min-w-0">
            <p className="text-sm font-bold text-gray-900 truncate leading-tight">{clientWorkspace.name}</p>
            <p className="text-xs text-gray-400 truncate">{clientWorkspace.platform ?? clientWorkspace.role ?? 'International Client'}</p>
          </div>
        </div>
      ) : undefined}
    >
      {/* ── International Client Workspace ── */}
      {clientWorkspace && (
        <div className="space-y-4 max-w-2xl">
          <div className="bg-white/70 backdrop-blur-sm rounded-3xl border border-white/80 p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-2xl bg-slate-50 flex items-center justify-center flex-shrink-0">
                <i className="ri-building-line text-[#1c2b3a] text-lg"></i>
              </div>
              <div>
                <p className="font-bold text-gray-900">{clientWorkspace.name}</p>
                <p className="text-xs text-gray-400">{clientWorkspace.platform ?? clientWorkspace.role ?? 'International Client'}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {clientWorkspace.role && (
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide">Role</p>
                  <p className="text-sm font-semibold text-gray-800 mt-0.5">{clientWorkspace.role}</p>
                </div>
              )}
              {clientWorkspace.platform && (
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide">Platform</p>
                  <p className="text-sm font-semibold text-gray-800 mt-0.5">{clientWorkspace.platform}</p>
                </div>
              )}
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-[10px] text-gray-400 uppercase tracking-wide">Status</p>
                <p className="text-sm font-semibold text-gray-800 mt-0.5 capitalize">{clientWorkspace.status}</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-3">
                <p className="text-[10px] text-[#1c2b3a]/50 uppercase tracking-wide">Type</p>
                <p className="text-sm font-semibold text-[#1c2b3a] mt-0.5">International</p>
              </div>
            </div>
            {clientWorkspace.notes && (
              <p className="text-xs text-gray-500 italic mt-3 pt-3 border-t border-gray-100">{clientWorkspace.notes}</p>
            )}
          </div>
        </div>
      )}

      {/* ── Workspace ── */}
      {!clientWorkspace && workspaceRow && wsProject && (
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
              <div className="px-5 md:px-6 pt-4 pb-2 flex-shrink-0">
                <div className="bg-white/70 backdrop-blur-sm rounded-3xl border border-white/80 shadow-sm px-5 py-5">
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:gap-8">
                    <div className="min-w-0 lg:max-w-[320px] lg:flex-shrink-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1.5">
                        <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-semibold uppercase tracking-wide ${statusColors[wsProject.status] ?? statusColors.ongoing}`}>
                          {statusLabels[wsProject.status] ?? wsProject.status}
                        </span>
                        {wsIsInternal && <span className="text-[10px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">Internal</span>}
                        {wsProject.service && <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{wsProject.service}</span>}
                      </div>
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
                        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-[#f1f3f7] shadow-sm">
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
            <div id="ws-stats" className={`grid grid-cols-2 sm:grid-cols-4 gap-3 ${wsFocusSection && wsFocusSection !== 'ws-stats' ? 'hidden' : ''}`}>
              {[
                { label: 'Total', value: wsTasks.length, icon: 'ri-task-line', iconBg: 'bg-gray-100', iconClr: 'text-gray-500', valClr: 'text-gray-800' },
                { label: 'Done', value: wsDone, icon: 'ri-checkbox-circle-fill', iconBg: 'bg-emerald-100', iconClr: 'text-emerald-600', valClr: 'text-emerald-700' },
                { label: 'In Progress', value: wsTasks.filter(t => t.status === 'in_progress').length, icon: 'ri-loader-2-line', iconBg: 'bg-sky-100', iconClr: 'text-sky-600', valClr: 'text-sky-700' },
                { label: 'Overdue', value: wsTasks.filter(t => !!wsIsOverdue(t)).length, icon: 'ri-alarm-warning-line', iconBg: 'bg-rose-100', iconClr: 'text-rose-500', valClr: 'text-rose-600' },
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

                {/* Payout */}
                {!wsIsInternal && wsProject?.project_type !== 'retainer' && (() => {
                  const totalCosts = wsProject.hub_project_costs.reduce((s, x) => s + x.amount, 0);
                  const netProfit = wsProject.contract_price - totalCosts;
                  const isFixed = workspaceRow!.payout_type === 'fixed';
                  const myCut = isFixed ? (workspaceRow!.fixed_amount ?? 0) : netProfit * (workspaceRow!.percentage / 100);
                  const payouts = workspaceRow!.hub_project_contractor_payouts ?? [];
                  const totalPaidOut = payouts.reduce((s, x) => s + x.amount, 0);
                  const isFullyPaid = totalPaidOut >= myCut && myCut > 0;
                  const payoutPct = myCut > 0 ? Math.min((totalPaidOut / myCut) * 100, 100) : 0;
                  return (
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
                      <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">Your Payout</p>
                      <p className="text-xl font-bold text-gray-900">{fmt(myCut)}</p>
                      <p className="text-xs text-gray-400">{isFixed ? 'Fixed fee' : `${workspaceRow!.percentage}% of net profit`}</p>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${isFullyPaid ? 'bg-emerald-400' : 'bg-blue-400'}`} style={{ width: `${payoutPct}%` }} />
                      </div>
                      <p className={`text-xs font-medium ${isFullyPaid ? 'text-emerald-600' : 'text-gray-400'}`}>
                        {isFullyPaid ? 'Paid in full ✓' : `${fmt(totalPaidOut)} received`}
                      </p>
                      {payouts.length > 0 && (
                        <div className="space-y-1.5 border-t border-gray-50 pt-3">
                          {payouts.map(pp => (
                            <div key={pp.id} className="flex items-center gap-2 text-xs">
                              <i className="ri-check-line text-emerald-400 flex-shrink-0"></i>
                              <span className="font-medium text-gray-700">{fmt(pp.amount)}</span>
                              <span className="text-gray-400 ml-auto">{new Date(pp.paid_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Team */}
                {wsTeam.length > 0 && (
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                    <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-3">Team</p>
                    <div className="space-y-2.5">
                      {wsTeam.map(m => (
                        <div key={m.id} className="flex items-center gap-2.5">
                          {m.avatar_url
                            ? <img src={m.avatar_url} alt={m.full_name} className="w-7 h-7 rounded-full object-cover object-top flex-shrink-0" />
                            : <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-500 flex-shrink-0">{m.full_name[0]}</div>
                          }
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
      {!workspaceRow && !clientWorkspace && (loading ? (
        <div className="flex justify-center py-24">
          <i className="ri-loader-4-line animate-spin text-2xl text-gray-300"></i>
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <div className="w-14 h-14 bg-gray-100 rounded-3xl flex items-center justify-center">
            <i className="ri-folder-open-line text-gray-400 text-2xl"></i>
          </div>
          <p className="text-sm font-semibold text-gray-500">No projects assigned yet</p>
          <p className="text-xs text-gray-400">Your admin will assign you when a project starts.</p>
        </div>
      ) : (
        /* ── Main dashboard layout ── */
        <div className="flex gap-6 min-h-full">

          {/* ── LEFT: projects ── */}
          <div className="flex-1 min-w-0 space-y-4">

            {/* Greeting */}
            <div>
              <p className="text-xs text-gray-400 mb-1">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
              <h2 className="text-xl font-bold tracking-tight leading-tight">
                <span style={{ background: greetingGradient, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                  {greeting}, {firstName}.
                </span>
                {' '}<span className="not-italic" style={{ WebkitTextFillColor: 'initial' }}>{greetingEmoji}</span>
                <br />
                <span className="text-gray-400 font-normal text-base">
                  {todayDueTasks.length > 0
                    ? `You've got ${todayDueTasks.length} task${todayDueTasks.length > 1 ? 's' : ''} due today.`
                    : overdueTasks.length > 0
                    ? `${overdueTasks.length} task${overdueTasks.length > 1 ? 's' : ''} ${overdueTasks.length > 1 ? 'need' : 'needs'} attention.`
                    : myTasks.length > 0
                    ? `${myTasks.length - doneTasks.length} task${myTasks.length - doneTasks.length !== 1 ? 's' : ''} remaining.`
                    : 'All clear — nothing pending.'}
                </span>
              </h2>
            </div>

            {/* No search results */}
            {search && active.length === 0 && other.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <i className="ri-search-line text-3xl text-gray-200"></i>
                <p className="text-sm text-gray-400">No projects match <span className="font-medium text-gray-600">"{search}"</span></p>
                <button onClick={() => setSearch('')} className="text-xs text-[#1c2b3a]/70 hover:underline cursor-pointer">Clear search</button>
              </div>
            )}

            {/* Project cards grouped by status */}
            {(() => {
              const overdue  = sortedRows.filter(r => r.hub_projects?.deadline && r.hub_projects.deadline < today && r.hub_projects.status !== 'completed');
              const dueSoon  = sortedRows.filter(r => { const p = r.hub_projects; if (!p || overdue.includes(r)) return false; const d = p.deadline ? Math.ceil((new Date(p.deadline + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime()) / 86400000) : null; return p.status === 'ongoing' && d !== null && d <= 7; });
              const active2  = sortedRows.filter(r => r.hub_projects?.status === 'ongoing' && !overdue.includes(r) && !dueSoon.includes(r));
              const paused   = sortedRows.filter(r => r.hub_projects?.status === 'paused');
              const done     = sortedRows.filter(r => r.hub_projects?.status === 'completed');

              const Section = ({ label, rows: sRows, dot }: { label: string; rows: typeof sortedRows; dot: string }) => sRows.length === 0 ? null : (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dot}`}></span>
                    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">{label} <span className="text-gray-300 font-normal">({sRows.length})</span></p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {sRows.map((r) => (
                      <ProjectCard key={r.id} row={r}
                        projectTasks={tasks.filter(t => t.project_id === r.hub_projects?.id)}
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
                  <Section label="Active" rows={active2} dot="bg-[#1c2b3a]/70" />
                  <Section label="Paused" rows={paused} dot="bg-gray-300" />
                  <Section label="Completed" rows={done} dot="bg-emerald-400" />
                </>
              );
            })()}

            {/* ── My Clients section ── */}
            {clientEntries.length > 0 && (
              <div className="pt-6 mt-3 space-y-3 border-t border-gray-200/80">
                {/* Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <i className="ri-building-line text-[#1c2b3a] text-sm"></i>
                      <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-widest">My Clients <span className="text-gray-400 font-normal">({clientEntries.length})</span></p>
                    </div>
                    <p className="text-sm text-gray-400 mt-1">Ongoing retainer and direct client relationships separate from project-based delivery work above.</p>
                  </div>
                  <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-50 text-[#1c2b3a] text-[11px] font-semibold whitespace-nowrap">
                    <i className="ri-repeat-line text-[11px]"></i>
                    Ongoing Clients
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {clientEntries.map(c => (
                    <button key={c.id} onClick={() => {
                      if (c.type === 'retainer' && c.rowId) {
                        const row = rows.find(r => r.id === c.rowId);
                        if (row) { setWorkspaceRow(row); setTaskFilter('all'); setTaskSearch(''); setWsFocusSection(null); }
                      } else {
                        setClientWorkspace(c);
                      }
                    }}
                      className="w-full text-left rounded-3xl overflow-hidden hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200 cursor-pointer group"
                      style={(() => { const pal = getCardPalette(c.service ?? null); return { background: `linear-gradient(135deg, ${pal.from}, ${pal.to})`, border: '1px solid rgba(255,255,255,0.2)', boxShadow: '0 2px 20px rgba(0,0,0,0.12)' }; })()}>
                      {(() => {
                        const linkedRow = c.type === 'retainer' && c.rowId ? rows.find(r => r.id === c.rowId) : null;
                        const linkedProjectId = linkedRow?.hub_projects?.id ?? null;
                        const linkedTasks = linkedProjectId ? tasks.filter(t => t.project_id === linkedProjectId) : [];
                        const activeTaskCount = linkedTasks.filter(t => t.status === 'in_progress').length;
                        const reviewTaskCount = linkedTasks.filter(t => t.status === 'in_review').length;
                        const overdueTaskCount = linkedTasks.filter(t => t.due_date && t.due_date < today && t.status !== 'done').length;
                        const doneTaskCount = linkedTasks.filter(t => t.status === 'done').length;
                        const teamMembers = linkedProjectId ? (teamMap[linkedProjectId] ?? []) : [];
                        const infoLine = c.type === 'retainer'
                          ? linkedProjectId
                            ? `${linkedTasks.length} task${linkedTasks.length !== 1 ? 's' : ''} in workspace`
                            : 'Retainer workspace'
                          : c.role ?? c.platform ?? 'Client relationship';

                        return (
                          <div className="p-3.5 min-h-[152px] flex flex-col justify-between">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                {c.service && <span className="inline-block text-[10px] font-semibold tracking-widest uppercase mb-1 text-white/70">{c.service}</span>}
                                <p className="font-bold text-white text-sm leading-tight truncate">{c.name}</p>
                                <p className="text-xs text-white/70 mt-0.5 truncate">{infoLine}</p>
                              </div>
                              <span className="text-[10px] px-2.5 py-1 rounded-full font-semibold flex-shrink-0 bg-white/20 text-white">
                                {c.type === 'retainer' ? 'Retainer' : 'Client'}
                              </span>
                            </div>

                            <div className="space-y-2.5 pt-3 border-t border-white/20">
                              {linkedProjectId ? (
                                <>
                                  <div className="flex flex-wrap gap-1.5">
                                    <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-white/15 text-white/90">
                                      {activeTaskCount} active
                                    </span>
                                    {reviewTaskCount > 0 && (
                                      <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-white/15 text-white/90">
                                        {reviewTaskCount} in review
                                      </span>
                                    )}
                                    {overdueTaskCount > 0 ? (
                                      <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-rose-100/20 text-white">
                                        {overdueTaskCount} overdue
                                      </span>
                                    ) : (
                                      <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-white/15 text-white/90">
                                        {doneTaskCount} done
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-2 min-w-0">
                                      {teamMembers.length > 0 ? (
                                        <>
                                          <div className="flex -space-x-1.5">
                                            {teamMembers.slice(0, 3).map((member) => (
                                              member.avatar_url ? (
                                                <img key={member.id} src={member.avatar_url} alt={member.full_name} className="w-6 h-6 rounded-full border border-white/40 object-cover object-top" />
                                              ) : (
                                                <div key={member.id} className="w-6 h-6 rounded-full border border-white/40 bg-white/20 flex items-center justify-center text-[9px] font-bold text-white">
                                                  {member.full_name[0]}
                                                </div>
                                              )
                                            ))}
                                          </div>
                                          <span className="text-[10px] text-white/80 truncate">
                                            {teamMembers.length} teammate{teamMembers.length !== 1 ? 's' : ''}
                                          </span>
                                        </>
                                      ) : (
                                        <span className="text-[10px] text-white/75">No team assigned yet</span>
                                      )}
                                    </div>
                                    <span className="text-[10px] text-white/80 whitespace-nowrap">
                                      {linkedTasks.length > 0 ? `${linkedTasks.length} tasks` : 'Open workspace'}
                                    </span>
                                  </div>
                                </>
                              ) : (
                                <div className="flex items-center justify-between gap-3">
                                  <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-white/15 text-white/90">
                                    {(c.status === 'active' ? 'Active' : c.status).replace(/^./, (letter) => letter.toUpperCase())}
                                  </span>
                                  <span className="text-[10px] text-white/75 truncate text-right">
                                    {c.notes || c.platform || c.role || 'Open client workspace'}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })()}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── RIGHT: task panel ── */}
          <div className="hidden lg:flex flex-col gap-4 w-[300px] flex-shrink-0">

            {/* Overall progress ring */}
            {tasks.length > 0 && (
              <div className="bg-white/70 backdrop-blur-sm rounded-3xl border border-white/80 p-5">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-4">Overall Progress</p>
                <div className="flex items-center gap-4">
                  <ProgressRing pct={pct} size={80} />
                  <div className="space-y-2 flex-1">
                    {[
                      { label: 'Done', value: doneTasks.length, color: 'bg-emerald-400' },
                      { label: 'Active', value: inProgressTasks.length, color: 'bg-blue-400' },
                      { label: 'To Do', value: todoTasks.length, color: 'bg-gray-200' },
                    ].map(s => (
                      <div key={s.label} className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s.color}`}></span>
                        <span className="text-xs text-gray-500 flex-1">{s.label}</span>
                        <span className="text-xs font-semibold text-gray-700">{s.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* My tasks list */}
            <div className="bg-white/70 backdrop-blur-sm rounded-3xl border border-white/80 p-5 flex-1 overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">
                    {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
                  </p>
                  <p className="text-lg font-bold text-gray-900 leading-tight">My Tasks</p>
                </div>
                {overdueTasks.length > 0 && (
                  <span className="text-[11px] font-semibold text-rose-500 bg-rose-50 px-2.5 py-1 rounded-full">
                    {overdueTasks.length} overdue
                  </span>
                )}
              </div>

              {sortedMyTasks.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center">
                    <i className="ri-checkbox-circle-fill text-emerald-400 text-2xl"></i>
                  </div>
                  <p className="text-sm text-gray-400 font-medium text-center">No tasks assigned yet</p>
                </div>
              ) : (
                <div className="space-y-0.5">
                  {sortedMyTasks.map(t => {
                    const projectName = getProjectName(t.project_id);
                    const isOverdue = t.due_date && t.due_date < today && t.status !== 'done';
                    return (
                      <div key={t.id} className={`flex items-start gap-2 px-2 py-2 rounded-xl transition-colors ${t.status === 'done' ? 'opacity-40' : 'hover:bg-gray-50/80'}`}>
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
                        <button type="button" onClick={() => openTaskFromDashboard(t)} className="flex-1 min-w-0 text-left cursor-pointer">
                          <p className={`text-sm leading-snug ${t.status === 'done' ? 'line-through text-gray-400' : 'text-gray-800'}`}>{t.title}</p>
                          <p className="text-[11px] text-gray-400 mt-0.5 truncate">{projectName}</p>
                        </button>
                        {t.due_date && t.status !== 'done' && (
                          <span className={`text-[10px] font-semibold flex-shrink-0 mt-0.5 ${isOverdue ? 'text-rose-500' : t.due_date === today ? 'text-amber-600' : 'text-gray-400'}`}>
                            {t.due_date === today ? 'Today' : isOverdue ? 'Late' : new Date(t.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

        </div>
      ))}

      {/* Receipt lightbox */}
      {lightboxUrl && (
        <div className="fixed inset-0 z-[60] bg-black/80 flex items-end sm:items-center justify-center sm:p-4" onClick={() => setLightboxUrl(null)}>
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
                              {m.avatar_url
                                ? <img src={m.avatar_url} alt={m.full_name} className="w-4 h-4 rounded-full object-cover object-top" />
                                : <div className="w-4 h-4 rounded-full bg-indigo-200 flex items-center justify-center text-[8px] font-bold text-[#1c2b3a]">{m.full_name[0]}</div>
                              }
                              <span className={`text-xs font-medium ${taskForm.assigned_to === m.id ? 'text-[#1c2b3a]' : 'text-gray-600'}`}>{m.full_name.split(' ')[0]}</span>
                            </button>
                          ))}
                        </div>
                      ) : (
                        assignee ? (
                          <div className="flex items-center gap-2">
                            {assignee.avatar_url
                              ? <img src={assignee.avatar_url} alt={assignee.full_name} className="w-6 h-6 rounded-full object-cover object-top" />
                              : <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-[#1c2b3a]">{assignee.full_name[0]}</div>
                            }
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
                          {u?.avatar_url
                            ? <img src={u.avatar_url} alt={u.full_name} className="w-6 h-6 rounded-full object-cover object-top flex-shrink-0 mt-0.5" />
                            : <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-[9px] font-bold text-[#1c2b3a] flex-shrink-0 mt-0.5">{u?.full_name?.[0] ?? '?'}</div>
                          }
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
                    {hubUser?.avatar_url
                      ? <img src={hubUser.avatar_url} alt="" className="w-6 h-6 rounded-full object-cover object-top flex-shrink-0 mb-0.5" />
                      : <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-[9px] font-bold text-[#1c2b3a] flex-shrink-0 mb-0.5">{hubUser?.full_name?.[0] ?? '?'}</div>
                    }
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
                                {m.avatar_url
                                  ? <img src={m.avatar_url} alt={m.full_name} className="w-6 h-6 rounded-full object-cover object-top flex-shrink-0" />
                                  : <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-[#1c2b3a] flex-shrink-0">{m.full_name[0]}</div>
                                }
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
        projectId={wsProject?.id ?? 0}
        projectName={wsProject?.project_name ?? 'General'}
        teamMembers={wsTeam}
        canEdit={true}
        currentUserId={hubUser?.id ?? ''}
        currentUserName={hubUser?.full_name ?? 'Contractor'}
        currentUserAvatarUrl={hubUser?.avatar_url ?? null}
      />
    </ContractorLayout>
  );
}
