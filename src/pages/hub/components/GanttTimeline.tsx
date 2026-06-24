import React from 'react';
import { useRef, useState } from 'react';

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

export function GanttTimeline({ tasks, projectStart, projectEnd, today, onTaskUpdate }: {
  tasks: ProjectTask[];
  projectStart: string | null;
  projectEnd: string | null;
  today: string;
  onTaskUpdate?: (taskId: number, updates: { due_date?: string | null; start_date?: string | null }) => void;
}) {
  void projectStart; void projectEnd;

  const anchor = new Date(today + 'T00:00:00');
  const [viewMonth, setViewMonth] = useState<Date>(new Date(anchor.getFullYear(), anchor.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState<string | null>(today);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const dragState = useRef<DragState | null>(null);
  const [localTasks, setLocalTasks] = useState<ProjectTask[]>([]);
  const [isDragging, setIsDragging] = useState(false);

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

  const chipStyle = (t: ProjectTask): React.CSSProperties | undefined => {
    if ((t as any).color && t.status !== 'done' && !(t.due_date && t.due_date < today)) {
      return { background: (t as any).color, color: '#fff' };
    }
    return undefined;
  };
  const chipCls = (t: ProjectTask) => {
    if (t.due_date && t.due_date < today && t.status !== 'done') return 'bg-rose-100 text-rose-600';
    if ((t as any).color) return '';
    return colorMap[t.id]?.chip ?? 'bg-slate-100 text-[#1c2b3a]';
  };
  const dotCls = (t: ProjectTask) => {
    if (t.due_date && t.due_date < today && t.status !== 'done') return 'bg-rose-400';
    if ((t as any).color) return 'bg-white/70';
    return colorMap[t.id]?.dot ?? 'bg-[#1c2b3a]/70';
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

      {/* Calendar grid */}
      <div className="grid grid-cols-7">
        {Array.from({ length: totalCells }).map((_, idx) => {
          const dayNum = idx - startPad + 1;
          const inMonth = dayNum >= 1 && dayNum <= daysInMonth;
          const cellDate = inMonth ? `${year}-${pad2(month + 1)}-${pad2(dayNum)}` : null;
          const isToday = cellDate === today;
          const isSelected = cellDate !== null && cellDate === selectedDate;
          const isDropTarget = cellDate !== null && cellDate === dragOver;
          const colIdx = idx % 7;
          const isWeekend = colIdx === 5 || colIdx === 6;
          const dayTasks = cellDate ? (tasksByDate[cellDate] ?? []) : [];
          const visible = dayTasks.slice(0, 2);
          const extra = dayTasks.length - visible.length;

          return (
            <div
              key={idx}
              onClick={() => !isDragging && inMonth && cellDate && setSelectedDate(isSelected ? null : cellDate)}
              onDragOver={e => handleDragOver(e, cellDate)}
              onDrop={e => handleDrop(e, cellDate)}
              onDragLeave={() => setDragOver(null)}
              className={[
                'min-h-[72px] p-1.5 border-b border-r border-gray-50 flex flex-col gap-0.5 transition-colors',
                !inMonth ? 'bg-gray-50/30' : '',
                isWeekend && inMonth ? 'bg-gray-50/50' : '',
                isSelected && !isDragging ? 'ring-2 ring-inset ring-slate-300' : '',
                isDropTarget ? 'bg-slate-50 ring-2 ring-inset ring-indigo-300' : '',
                inMonth && !isDragging ? 'cursor-pointer hover:bg-slate-50/30' : '',
                inMonth && isDragging ? 'cursor-copy' : '',
              ].filter(Boolean).join(' ')}
            >
              <div className="flex justify-end">
                <span className={[
                  'text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full',
                  isToday ? 'bg-slate-500 text-white font-bold' : '',
                  !inMonth ? 'text-gray-300' : isToday ? '' : 'text-gray-600',
                ].filter(Boolean).join(' ')}>
                  {inMonth ? dayNum : ''}
                </span>
              </div>
              <div className="flex flex-col gap-0.5 flex-1">
                {visible.map(t => {
                  const isStart = cellDate === (t.start_date ?? t.due_date);
                  const isEnd = cellDate === (t.due_date ?? t.start_date);
                  const hasRange = t.start_date && t.due_date && t.start_date !== t.due_date;
                  const draggable = !!onTaskUpdate;
                  return (
                    <div
                      key={t.id}
                      draggable={draggable && isStart}
                      onDragStart={draggable && isStart ? e => handleDragStart(e, t, 'move') : undefined}
                      onDragEnd={handleDragEnd}
                      style={chipStyle(t)}
                      className={[
                        'flex items-center text-[10px] font-medium truncate select-none group',
                        chipCls(t),
                        hasRange
                          ? `${isStart ? 'rounded-l-md rounded-r-none pl-0 pr-0' : isEnd ? 'rounded-r-md rounded-l-none pl-0 pr-0' : 'rounded-none px-0'} py-0.5`
                          : 'px-1 py-0.5 rounded',
                        draggable && isStart ? 'cursor-grab active:cursor-grabbing' : '',
                      ].filter(Boolean).join(' ')}
                    >
                      {/* Left resize handle (start cell of range) */}
                      {draggable && isStart && hasRange && (
                        <span
                          draggable
                          onDragStart={e => { e.stopPropagation(); handleDragStart(e, t, 'resize-start'); }}
                          onDragEnd={handleDragEnd}
                          className="w-3 h-full flex items-center justify-center cursor-ew-resize flex-shrink-0 opacity-40 group-hover:opacity-100"
                          title="Drag to extend start"
                        ><i className="ri-arrow-left-s-line text-[8px]"></i></span>
                      )}
                      {isStart && <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 mx-1 ${dotCls(t)}`}></span>}
                      {isStart && <span className="truncate flex-1">{t.title}</span>}
                      {/* Right resize handle — on end cell of range OR on single-day tasks */}
                      {draggable && isEnd && (
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
                {extra > 0 && (
                  <div className="text-[10px] text-gray-400 px-1.5">+{extra} more</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Selected day task list */}
      {selectedDate && !isDragging && (
        <div className="border-t border-gray-100 px-5 py-4">
          <p className="text-xs font-semibold text-gray-500 mb-2">
            {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
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

      {/* Drag hint */}
      {isDragging && (
        <div className="border-t border-slate-100 bg-slate-50 px-5 py-2 text-[11px] text-[#1c2b3a]/70 text-center">
          Drop on a date to move · Drag the ⋯ handle to resize
        </div>
      )}
    </div>
  );
}
