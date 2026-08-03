import React from 'react';
import { useRef, useState } from 'react';
import QuickAddTaskPopup from './QuickAddTaskPopup';

export interface ProjectTask {
  id: number;
  project_id: number;
  title: string;
  description: string | null;
  status: 'todo' | 'in_progress' | 'in_review' | 'blocked' | 'done';
  priority: 'low' | 'medium' | 'high';
  due_date: string | null;
  start_date: string | null;
  assigned_to?: string | null;
}

interface DragState {
  taskId: number;
  mode: 'move' | 'resize-end' | 'resize-start';
  originalStart: string | null;
  originalEnd: string | null;
}

const pad2 = (n: number) => String(n).padStart(2, '0');
const dateStr = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
const addDays = (s: string, n: number) => { const d = new Date(s+'T00:00:00'); d.setDate(d.getDate()+n); return dateStr(d); };
const diffDays = (a: string, b: string) => Math.round((new Date(b+'T00:00:00').getTime() - new Date(a+'T00:00:00').getTime()) / 86400000);

export function GanttTimeline({ tasks, projectStart, projectEnd, today, onTaskUpdate, mode = 'bars', onAddTask, onTaskClick, projects, teamMembers, onQuickTaskCreated }: {
  tasks: ProjectTask[];
  projectStart: string | null;
  projectEnd: string | null;
  today: string;
  onTaskUpdate?: (taskId: number, updates: { due_date?: string | null; start_date?: string | null }) => void;
  /** 'bars' spans tasks across day cells (single project). 'dots' shows a compact
   * per-day indicator instead — for consolidated calendars with many unrelated
   * tasks, where overlapping full-width bars stop being readable. */
  mode?: 'bars' | 'dots';
  /** Escape hatch to the full task editor ("More options" in the quick-add popup). */
  onAddTask?: (date: string) => void;
  onTaskClick?: (task: ProjectTask) => void;
  /** Only used in 'dots' mode, for the quick-add popup's project dropdown. */
  projects?: { id: number; project_name: string }[];
  /** Only used in 'dots' mode, for the quick-add popup's assignee dropdown. */
  teamMembers?: { id: string; full_name: string }[];
  /** Called after a task is created via the quick-add popup, so the caller can refetch. */
  onQuickTaskCreated?: () => void;
}) {
  void projectStart; void projectEnd;

  const anchor = new Date(today + 'T00:00:00');
  const [viewMonth, setViewMonth] = useState<Date>(new Date(anchor.getFullYear(), anchor.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState<string | null>(today);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const dragState = useRef<DragState | null>(null);
  const [localTasks, setLocalTasks] = useState<ProjectTask[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [quickAdd, setQuickAdd] = useState<{ date: string; rect: DOMRect } | null>(null);

  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const prevMonth = () => setViewMonth(new Date(year, month - 1, 1));
  const nextMonth = () => setViewMonth(new Date(year, month + 1, 1));
  const goToday = () => { setViewMonth(new Date(anchor.getFullYear(), anchor.getMonth(), 1)); setSelectedDate(today); };
  const monthLabel = viewMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const firstDay = new Date(year, month, 1);
  const startPad = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalCells = Math.ceil((startPad + daysInMonth) / 7) * 7;

  // Use localTasks for optimistic updates during drag
  const displayTasks = isDragging && localTasks.length ? localTasks : tasks;

  // tasksByDate only for the selected-day bottom panel
  const tasksByDate: Record<string, ProjectTask[]> = {};
  for (const t of displayTasks) {
    if (!t.due_date && !t.start_date) continue;
    const start = t.start_date ?? t.due_date!;
    const end = t.due_date ?? t.start_date!;
    const cur = new Date(start + 'T00:00:00');
    const endD = new Date(end + 'T00:00:00');
    while (cur <= endD) {
      const key = dateStr(cur);
      (tasksByDate[key] ??= []).push(t);
      cur.setDate(cur.getDate() + 1);
    }
  }

  // Tasks without an explicit color get one consistent neutral look — color
  // is only ever what the user deliberately picked, never auto-assigned.
  const chipStyle = (t: ProjectTask): React.CSSProperties | undefined => {
    if ((t as any).color && t.status !== 'done' && !(t.due_date && t.due_date < today)) {
      return { background: (t as any).color, color: '#fff' };
    }
    return undefined;
  };
  const chipCls = (t: ProjectTask) => {
    if (t.due_date && t.due_date < today && t.status !== 'done') return 'bg-rose-100 text-rose-600';
    if ((t as any).color) return '';
    return 'bg-slate-100 text-[#1c2b3a]';
  };

  // ── Drag handlers ──

  const handleDragStart = (e: React.DragEvent, task: ProjectTask, mode: 'move' | 'resize-end' | 'resize-start') => {
    e.stopPropagation();
    dragState.current = { taskId: task.id, mode, originalStart: task.start_date, originalEnd: task.due_date };
    setLocalTasks([...displayTasks]);
    setIsDragging(true);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(task.id));
  };

  const handleDragOver = (e: React.DragEvent, cellDate: string | null) => {
    if (!dragState.current || !cellDate) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOver(cellDate);

    const ds = dragState.current;
    const task = tasks.find(t => t.id === ds.taskId);
    if (!task) return;

    if (ds.mode === 'move') {
      const anchorDate = ds.originalEnd ?? ds.originalStart!;
      const delta = diffDays(anchorDate, cellDate);
      const newEnd = ds.originalEnd ? addDays(ds.originalEnd, delta) : null;
      const newStart = ds.originalStart ? addDays(ds.originalStart, delta) : null;
      setLocalTasks(prev => prev.map(t => t.id === ds.taskId
        ? { ...t, due_date: newEnd ?? cellDate, start_date: newStart }
        : t
      ));
    } else if (ds.mode === 'resize-end') {
      // resize-end: extend/shrink due_date, keep start_date
      const start = task.start_date ?? task.due_date!;
      if (cellDate >= start) {
        setLocalTasks(prev => prev.map(t => t.id === ds.taskId
          ? { ...t, due_date: cellDate }
          : t
        ));
      }
    } else {
      // resize-start: extend/shrink start_date, keep due_date
      const end = task.due_date ?? task.start_date!;
      if (cellDate <= end) {
        setLocalTasks(prev => prev.map(t => t.id === ds.taskId
          ? { ...t, start_date: cellDate }
          : t
        ));
      }
    }
  };

  const handleDrop = (e: React.DragEvent, cellDate: string | null) => {
    e.preventDefault();
    if (!dragState.current || !cellDate || !onTaskUpdate) { handleDragEnd(); return; }
    const ds = dragState.current;
    const updated = localTasks.find(t => t.id === ds.taskId);
    if (updated) {
      onTaskUpdate(ds.taskId, { due_date: updated.due_date, start_date: updated.start_date });
    }
    handleDragEnd();
  };

  const handleDragEnd = () => {
    dragState.current = null;
    setDragOver(null);
    setIsDragging(false);
    setLocalTasks([]);
  };

  const selectedTasks = selectedDate ? (tasksByDate[selectedDate] ?? []) : [];

  // ── Week-row lane assignment (bars span across days in a row) ──────────
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

    const weekTasks = displayTasks
      .filter(t => {
        if (!t.due_date && !t.start_date) return false;
        const ts = t.start_date ?? t.due_date!;
        const te = t.due_date ?? t.start_date!;
        return ts <= weekEnd && te >= weekStart;
      })
      .sort((a, b) => {
        const as_ = a.start_date ?? a.due_date ?? '';
        const bs_ = b.start_date ?? b.due_date ?? '';
        return as_.localeCompare(bs_) || a.id - b.id;
      });

    const laneEnd: string[] = [];
    const lanes: LaneEntry[] = [];
    const overflowByDate: Record<string, number> = {};

    for (const t of weekTasks) {
      const ts = t.start_date ?? t.due_date ?? '';
      const te = t.due_date ?? t.start_date ?? '';
      let lane = laneEnd.findIndex(e => e < ts);
      if (lane === -1) lane = laneEnd.length;
      laneEnd[lane] = te;

      if (lane < MAX_LANES) {
        lanes.push({ task: t, lane, spanStart: ts >= weekStart, spanEnd: te <= weekEnd });
      } else {
        const effStart = ts < weekStart ? weekStart : ts;
        const effEnd   = te > weekEnd   ? weekEnd   : te;
        const cur = new Date(effStart + 'T00:00:00');
        const endD = new Date(effEnd + 'T00:00:00');
        while (cur <= endD) {
          const k = dateStr(cur);
          overflowByDate[k] = (overflowByDate[k] ?? 0) + 1;
          cur.setDate(cur.getDate() + 1);
        }
      }
    }
    weekRows.push({ dates, lanes, overflowByDate });
  }

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

      {/* Calendar grid — rendered week by week so bars span across day cells */}
      <div>
        {weekRows.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7">
            {week.dates.map((cellDate, di) => {
              const inMonth = cellDate !== null;
              const dayNum = cellDate ? parseInt(cellDate.split('-')[2]) : 0;
              const isToday = cellDate === today;
              const isSelected = cellDate !== null && cellDate === selectedDate;
              const isDropTarget = cellDate !== null && cellDate === dragOver;
              const isWeekend = di === 5 || di === 6;
              const overflow = cellDate ? (week.overflowByDate[cellDate] ?? 0) : 0;
              const weekFirstDay = week.dates.find(Boolean) ?? '';

              // Fill 3 fixed lane slots — null renders as spacer to keep alignment
              const slots: (LaneEntry | null)[] = [null, null, null];
              for (const entry of week.lanes) {
                const ts = entry.task.start_date ?? entry.task.due_date ?? '';
                const te = entry.task.due_date ?? entry.task.start_date ?? '';
                if (cellDate && ts <= cellDate && te >= cellDate) {
                  slots[entry.lane] = entry;
                }
              }

              return (
                <div
                  key={di}
                  onClick={() => !isDragging && inMonth && cellDate && setSelectedDate(isSelected ? null : cellDate)}
                  onDragOver={e => handleDragOver(e, cellDate)}
                  onDrop={e => handleDrop(e, cellDate)}
                  onDragLeave={() => setDragOver(null)}
                  className={[
                    'relative group',
                    mode === 'dots' ? 'min-h-[112px]' : 'min-h-[96px]',
                    'border-b border-r border-gray-50 flex flex-col',
                    !inMonth ? 'bg-gray-50/30' : '',
                    isWeekend && inMonth ? 'bg-gray-50/50' : '',
                    isSelected && !isDragging ? 'ring-2 ring-inset ring-slate-300' : '',
                    isDropTarget ? 'bg-slate-50 ring-2 ring-inset ring-indigo-300' : '',
                    inMonth && !isDragging ? 'cursor-pointer hover:bg-slate-50/30 transition-colors' : '',
                    inMonth && isDragging ? 'cursor-copy' : '',
                  ].filter(Boolean).join(' ')}
                >
                  {/* Date number + hover "add task" affordance (dots mode only) */}
                  <div className="flex items-center justify-between p-1.5 pb-1">
                    {mode === 'dots' && inMonth && cellDate ? (
                      <button type="button" title="Add task"
                        onClick={e => { e.stopPropagation(); setQuickAdd({ date: cellDate, rect: e.currentTarget.getBoundingClientRect() }); }}
                        className="w-5 h-5 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-200/70 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                        <i className="ri-add-line text-xs"></i>
                      </button>
                    ) : <span />}
                    <span className={[
                      'text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full',
                      isToday ? 'bg-slate-500 text-white font-bold' : '',
                      !inMonth ? 'text-gray-300' : isToday ? '' : 'text-gray-600',
                    ].filter(Boolean).join(' ')}>
                      {inMonth ? dayNum : ''}
                    </span>
                  </div>

                  {mode === 'dots' ? (
                    /* Real event-style title chips, like Google Calendar's month
                       view — a max of 2 per day plus a "+N more" overflow, since
                       a consolidated calendar showing every unrelated project's
                       tasks needs a cap somewhere. */
                    <div className="flex flex-col gap-0.5 px-1 pb-1 flex-1 min-h-0">
                      {cellDate && (tasksByDate[cellDate] ?? []).slice(0, 3).map(t => (
                        <button key={t.id} type="button" title={t.title}
                          onClick={e => { e.stopPropagation(); onTaskClick?.(t); }}
                          style={chipStyle(t)}
                          className={`w-full text-left px-1.5 py-[3px] rounded text-[10px] leading-tight truncate cursor-pointer hover:opacity-80 transition-opacity ${chipCls(t)}`}>
                          {t.title}
                        </button>
                      ))}
                      {cellDate && (tasksByDate[cellDate]?.length ?? 0) > 3 && (
                        <button type="button"
                          onClick={e => { e.stopPropagation(); setSelectedDate(cellDate); }}
                          className="text-[9px] text-gray-400 hover:text-gray-600 leading-none px-1.5 text-left cursor-pointer">
                          +{(tasksByDate[cellDate]?.length ?? 0) - 3} more
                        </button>
                      )}
                    </div>
                  ) : (
                  <div className="flex flex-col gap-px pb-1">
                    {slots.map((slot, laneIdx) => {
                      if (!slot || !cellDate) {
                        return <div key={laneIdx} className="h-6" />;
                      }
                      const t = slot.task;
                      const ts = t.start_date ?? t.due_date ?? '';
                      const te = t.due_date ?? t.start_date ?? '';
                      const isActualStart = cellDate === ts;
                      const isActualEnd   = cellDate === te;
                      const hasRange = t.start_date && t.due_date && t.start_date !== t.due_date;
                      const draggable = !!onTaskUpdate;
                      const showLabel = isActualStart || (!slot.spanStart && cellDate === weekFirstDay);
                      const rl = (slot.spanStart && isActualStart) ? 'rounded-l-md ml-1' : '-ml-px';
                      const rr = (slot.spanEnd && isActualEnd)     ? 'rounded-r-md mr-1' : '-mr-px';

                      return (
                        <div key={laneIdx}
                          draggable={draggable && isActualStart}
                          onDragStart={draggable && isActualStart ? e => handleDragStart(e, t, 'move') : undefined}
                          onDragEnd={handleDragEnd}
                          style={chipStyle(t)}
                          className={[
                            `h-6 flex items-center text-[10px] font-medium overflow-hidden select-none group ${chipCls(t)} ${rl} ${rr}`,
                            draggable && isActualStart ? 'cursor-grab active:cursor-grabbing' : '',
                          ].filter(Boolean).join(' ')}
                        >
                          {draggable && isActualStart && hasRange && (
                            <span
                              draggable
                              onDragStart={e => { e.stopPropagation(); handleDragStart(e, t, 'resize-start'); }}
                              onDragEnd={handleDragEnd}
                              className="w-3 h-full flex items-center justify-center cursor-ew-resize flex-shrink-0 opacity-40 group-hover:opacity-100"
                              title="Drag to extend start"
                            ><i className="ri-arrow-left-s-line text-[8px]"></i></span>
                          )}
                          {showLabel && <span className="truncate flex-1 pl-2 leading-none">{t.title}</span>}
                          {draggable && isActualEnd && (
                            <span
                              draggable
                              onDragStart={e => { e.stopPropagation(); handleDragStart(e, t, 'resize-end'); }}
                              onDragEnd={handleDragEnd}
                              className="w-3 h-full flex items-center justify-center cursor-ew-resize flex-shrink-0 opacity-40 group-hover:opacity-100"
                              title="Drag to extend end"
                            ><i className="ri-arrow-right-s-line text-[8px]"></i></span>
                          )}
                        </div>
                      );
                    })}
                    {overflow > 0 && (
                      <div className="text-[10px] text-gray-400 px-1.5">+{overflow} more</div>
                    )}
                  </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Selected day task list */}
      {selectedDate && !isDragging && (
        <div className="border-t border-gray-100 px-5 py-4">
          <div className="flex items-center justify-between gap-3 mb-2">
            <p className="text-xs font-semibold text-gray-500">
              {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
            {(mode === 'dots' ? true : !!onAddTask) && (
              <button onClick={e => mode === 'dots'
                ? setQuickAdd({ date: selectedDate, rect: e.currentTarget.getBoundingClientRect() })
                : onAddTask?.(selectedDate)}
                className="flex items-center gap-1 text-[11px] font-medium text-[#1c2b3a] hover:underline cursor-pointer flex-shrink-0">
                <i className="ri-add-line text-sm"></i>Add task
              </button>
            )}
          </div>
          {selectedTasks.length === 0 ? (
            <p className="text-xs text-gray-300">No tasks on this day</p>
          ) : (
            <div className="space-y-1.5">
              {selectedTasks.map(t => {
                const isOverdue = t.due_date && t.due_date < today && t.status !== 'done';
                const statusIcon = t.status === 'done' ? 'ri-checkbox-circle-fill text-emerald-500'
                  : t.status === 'in_progress' ? 'ri-loader-2-line text-sky-400'
                  : t.status === 'blocked' ? 'ri-error-warning-fill text-rose-400'
                  : t.status === 'in_review' ? 'ri-eye-line text-amber-400'
                  : 'ri-checkbox-blank-circle-line text-gray-300';
                const Row = onTaskClick ? 'button' : 'div';
                return (
                  <Row key={t.id}
                    {...(onTaskClick ? { onClick: () => onTaskClick(t), type: 'button' } : {})}
                    className={`w-full flex items-center gap-2.5 text-left ${onTaskClick ? 'cursor-pointer hover:bg-gray-50 rounded-lg -mx-1 px-1 py-0.5' : ''}`}>
                    <i className={`${statusIcon} text-base flex-shrink-0`}></i>
                    <span className={`text-sm flex-1 truncate ${t.status === 'done' ? 'line-through text-gray-400' : 'text-gray-700'}`}>{t.title}</span>
                    {isOverdue && <span className="text-[11px] text-rose-500 font-medium flex-shrink-0">Overdue</span>}
                  </Row>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Drag hint */}
      {isDragging && (
        <div className="border-t border-slate-100 bg-slate-50 px-5 py-2 text-[11px] text-[#1c2b3a]/70 text-center">
          Drop on a date to move · Drag the ⋯ handle to resize
        </div>
      )}

      {quickAdd && (
        <QuickAddTaskPopup
          date={quickAdd.date}
          anchorRect={quickAdd.rect}
          projects={projects ?? []}
          teamMembers={teamMembers ?? []}
          onClose={() => setQuickAdd(null)}
          onCreated={() => onQuickTaskCreated?.()}
          onMoreOptions={() => { onAddTask?.(quickAdd.date); setQuickAdd(null); }}
        />
      )}
    </div>
  );
}
