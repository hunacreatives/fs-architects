import { useState } from 'react';

export interface ProjectTask {
  id: number;
  project_id: number;
  title: string;
  description: string | null;
  status: 'todo' | 'in_progress' | 'done';
  priority: 'low' | 'medium' | 'high';
  due_date: string | null;
  start_date: string | null;
  assigned_to?: string | null;
}

export function GanttTimeline({ tasks, projectStart, projectEnd, today }: {
  tasks: ProjectTask[];
  projectStart: string | null;
  projectEnd: string | null;
  today: string;
}) {
  const anchor = new Date(today + 'T00:00:00');
  const [viewMonth, setViewMonth] = useState<Date>(new Date(anchor.getFullYear(), anchor.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState<string | null>(today);

  // Suppress unused-variable warnings for projectStart / projectEnd — kept for API compatibility
  void projectStart; void projectEnd;

  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();

  const prevMonth = () => setViewMonth(new Date(year, month - 1, 1));
  const nextMonth = () => setViewMonth(new Date(year, month + 1, 1));
  const goToday   = () => { setViewMonth(new Date(anchor.getFullYear(), anchor.getMonth(), 1)); setSelectedDate(today); };

  const monthLabel = viewMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  // Build calendar grid: pad to start on Monday
  const firstDay = new Date(year, month, 1);
  // getDay(): 0=Sun…6=Sat → convert to Mon-based (0=Mon…6=Sun)
  const startPad = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalCells = Math.ceil((startPad + daysInMonth) / 7) * 7;

  // Build a map: dateStr -> tasks that span that date (start_date → due_date range)
  // Tasks with only a due_date appear as a single dot on the due date
  const tasksByDate: Record<string, ProjectTask[]> = {};
  const pad2 = (n: number) => String(n).padStart(2, '0');
  for (const t of tasks) {
    if (!t.due_date && !t.start_date) continue;
    const start = t.start_date ?? t.due_date!;
    const end = t.due_date ?? t.start_date!;
    const cur = new Date(start + 'T00:00:00');
    const endD = new Date(end + 'T00:00:00');
    while (cur <= endD) {
      const key = `${cur.getFullYear()}-${pad2(cur.getMonth() + 1)}-${pad2(cur.getDate())}`;
      (tasksByDate[key] ??= []).push(t);
      cur.setDate(cur.getDate() + 1);
    }
  }

  const PALETTE = [
    { chip: 'bg-violet-100 text-violet-700', dot: 'bg-violet-400' },
    { chip: 'bg-sky-100 text-sky-700',       dot: 'bg-sky-400' },
    { chip: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-400' },
    { chip: 'bg-amber-100 text-amber-700',   dot: 'bg-amber-400' },
    { chip: 'bg-pink-100 text-pink-700',     dot: 'bg-pink-400' },
    { chip: 'bg-orange-100 text-orange-700', dot: 'bg-orange-400' },
    { chip: 'bg-teal-100 text-teal-700',     dot: 'bg-teal-400' },
    { chip: 'bg-indigo-100 text-indigo-700', dot: 'bg-indigo-400' },
    { chip: 'bg-lime-100 text-lime-700',     dot: 'bg-lime-400' },
    { chip: 'bg-rose-100 text-rose-700',     dot: 'bg-rose-400' },
  ];
  const colorMap = Object.fromEntries(tasks.map((t, i) => [t.id, PALETTE[i % PALETTE.length]]));

  const chipCls = (t: ProjectTask): string => {
    if (t.due_date && t.due_date < today && t.status !== 'done') return 'bg-rose-100 text-rose-600';
    return colorMap[t.id]?.chip ?? 'bg-indigo-100 text-indigo-700';
  };

  const dotCls = (t: ProjectTask): string => {
    if (t.due_date && t.due_date < today && t.status !== 'done') return 'bg-rose-400';
    return colorMap[t.id]?.dot ?? 'bg-indigo-400';
  };

  const selectedTasks = selectedDate ? (tasksByDate[selectedDate] ?? []) : [];

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <i className="ri-calendar-line text-indigo-400 text-base"></i>
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
          const p2 = (n: number) => String(n).padStart(2, '0');
          const cellDate = inMonth ? `${year}-${p2(month + 1)}-${p2(dayNum)}` : null;
          const isToday = cellDate === today;
          const isSelected = cellDate !== null && cellDate === selectedDate;
          const colIdx = idx % 7; // 5=Sat, 6=Sun
          const isWeekend = colIdx === 5 || colIdx === 6;
          const dayTasks = cellDate ? (tasksByDate[cellDate] ?? []) : [];
          const visible = dayTasks.slice(0, 2);
          const extra = dayTasks.length - visible.length;

          return (
            <div
              key={idx}
              onClick={() => inMonth && cellDate && setSelectedDate(isSelected ? null : cellDate)}
              className={[
                'min-h-[72px] p-1.5 border-b border-r border-gray-50 flex flex-col gap-0.5',
                !inMonth ? 'bg-gray-50/30' : '',
                isWeekend && inMonth ? 'bg-gray-50/50' : '',
                isSelected ? 'ring-2 ring-inset ring-orange-300' : '',
                inMonth ? 'cursor-pointer hover:bg-orange-50/30 transition-colors' : '',
              ].filter(Boolean).join(' ')}
            >
              {/* Date number */}
              <div className="flex justify-end">
                <span className={[
                  'text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full',
                  isToday ? 'bg-orange-500 text-white font-bold' : '',
                  !inMonth ? 'text-gray-300' : isToday ? '' : 'text-gray-600',
                ].filter(Boolean).join(' ')}>
                  {inMonth ? dayNum : ''}
                </span>
              </div>
              {/* Task chips */}
              <div className="flex flex-col gap-0.5 flex-1">
                {visible.map(t => {
                  const isStart = cellDate === (t.start_date ?? t.due_date);
                  const isEnd = cellDate === t.due_date;
                  const hasRange = t.start_date && t.start_date !== t.due_date;
                  return (
                    <div key={t.id} className={`flex items-center gap-1 py-0.5 text-[10px] font-medium truncate ${chipCls(t)} ${
                      hasRange
                        ? `px-1.5 ${isStart ? 'rounded-l-md rounded-r-none' : isEnd ? 'rounded-r-md rounded-l-none' : 'rounded-none'}`
                        : 'px-1.5 rounded'
                    }`}>
                      {(!hasRange || isStart) && <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotCls(t)}`}></span>}
                      {isStart && <span className="truncate">{t.title}</span>}
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
