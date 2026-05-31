import { useEffect, useState, useCallback } from 'react';
import AdminLayout from '@/pages/hub/components/AdminLayout';
import { supabase } from '@/lib/supabase';
import { useDemo } from '@/contexts/DemoContext';
import { DEMO_ATTENDANCE, DEMO_ATTENDANCE_HISTORY } from '@/lib/demoData';
import EditHoursModal from './EditHoursModal';

// ----- Types -----

interface AttendanceRecord {
  id: string;
  hub_user_id: string | null;
  email: string | null;
  full_name: string;
  avatar_url: string | null;
  department: string | null;
  status: 'on' | 'off' | 'absent';
  last_punch: string | null;
  overtime_today: number;
  hours_raw: number | null;
  hours_capped: number | null;
  punches: { status: 'on' | 'off'; time: string }[];
}

interface HistoricalRow {
  id: string;
  full_name: string;
  avatar_url: string | null;
  department: string | null;
  hours_raw: number | null;
  hours_capped: number | null;
  overtime_hours: number | null;
  first_on: string | null;
  last_off: string | null;
  worked: boolean;
  isDayOff?: boolean;
}

interface ContractorSummary {
  id: string;
  full_name: string;
  department: string | null;
  start_date: string | null;
}

// ----- Helpers -----

function toDateStr(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatTime(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function Avatar({ name, avatar_url }: { name: string; avatar_url: string | null }) {
  if (avatar_url) {
    return <img src={avatar_url} alt={name} className="w-9 h-9 rounded-full object-cover object-top flex-shrink-0" />;
  }
  return (
    <div className="w-9 h-9 rounded-full bg-[#FF6B35] flex items-center justify-center flex-shrink-0">
      <span className="text-white text-sm font-bold">{name.charAt(0).toUpperCase()}</span>
    </div>
  );
}

// ----- PDF helpers -----

function getWeekRange(dateStr: string): [string, string] {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay(); // 0=Sun
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((day + 6) % 7));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return [toDateStr(monday), toDateStr(sunday)];
}

function getMonthRange(dateStr: string): [string, string] {
  const d = new Date(dateStr + 'T00:00:00');
  const y = d.getFullYear();
  const m = d.getMonth();
  const last = new Date(y, m + 1, 0);
  return [`${y}-${String(m + 1).padStart(2, '0')}-01`, toDateStr(last)];
}

function getYearRange(dateStr: string): [string, string] {
  const y = new Date(dateStr + 'T00:00:00').getFullYear();
  return [`${y}-01-01`, `${y}-12-31`];
}

function rangeLabelFmt(start: string, end: string) {
  const opts: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'long', day: 'numeric' };
  const s = new Date(start + 'T00:00:00').toLocaleDateString('en-US', opts);
  const e = new Date(end + 'T00:00:00').toLocaleDateString('en-US', opts);
  return `${s} – ${e}`;
}

async function generateAttendancePDF(start: string, end: string, label: string) {
  const logoUrl = `${window.location.origin}/images/547b59870e776a20eb28e4f20931787c.png`;

  // Fetch hours data for range
  const { data: hoursData } = await supabase
    .from('hub_daily_hours')
    .select('user_id, date, hours_raw, hours_capped, overtime_hours, first_on, last_off')
    .gte('date', start)
    .lte('date', end)
    .order('date', { ascending: true });

  // Fetch contractors
  const { data: contractors } = await supabase
    .from('hub_users')
    .select('id, full_name, department, start_date, payment_type')
    .eq('status', 'active')
    .in('role', ['contractor', 'admin'])
    .neq('payment_type', 'project_based');

  const userMap: Record<string, { full_name: string; department: string | null; start_date: string | null }> = {};
  for (const u of contractors || []) {
    userMap[u.id] = { full_name: u.full_name, department: u.department, start_date: u.start_date };
  }

  // Build rows: one per (date, contractor) — only show contractor if start_date <= date
  // Group hours by date+user
  type HoursEntry = { hours_raw: number; hours_capped: number; overtime_hours: number; first_on: string | null; last_off: string | null };
  const hoursIndex: Record<string, Record<string, HoursEntry>> = {}; // date -> userId -> entry
  for (const h of hoursData || []) {
    if (!hoursIndex[h.date]) hoursIndex[h.date] = {};
    hoursIndex[h.date][h.user_id] = {
      hours_raw: h.hours_raw,
      hours_capped: h.hours_capped,
      overtime_hours: h.overtime_hours || 0,
      first_on: h.first_on,
      last_off: h.last_off,
    };
  }

  // Enumerate dates in range
  const dates: string[] = [];
  const cur = new Date(start + 'T00:00:00');
  const endD = new Date(end + 'T00:00:00');
  while (cur <= endD) {
    dates.push(toDateStr(cur));
    cur.setDate(cur.getDate() + 1);
  }

  const sortedContractors = (contractors || []).slice().sort((a: ContractorSummary, b: ContractorSummary) =>
    a.full_name.localeCompare(b.full_name)
  );

  let tableRows = '';
  let totalWorked = 0;
  let totalAbsent = 0;
  let totalHours = 0;

  for (const date of dates) {
    const dateLabel = new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    const dayEntries = hoursIndex[date] || {};

    const eligibleOnDate = sortedContractors.filter((c: ContractorSummary) =>
      !c.start_date || c.start_date <= date
    );

    if (eligibleOnDate.length === 0) continue;

    for (const c of eligibleOnDate) {
      const entry = dayEntries[c.id];
      const worked = !!entry;
      const status = worked ? 'Worked' : 'Absent';
      if (worked) { totalWorked++; totalHours += entry.hours_capped || 0; }
      else totalAbsent++;

      tableRows += `
        <tr class="${worked ? '' : 'absent-row'}">
          <td>${dateLabel}</td>
          <td>${c.full_name}</td>
          <td>${c.department || '—'}</td>
          <td>${worked ? formatTime(entry.first_on) : '—'}</td>
          <td>${worked ? formatTime(entry.last_off) : '—'}</td>
          <td>${worked ? (entry.hours_capped || 0).toFixed(2) + 'h' : '—'}</td>
          <td>${worked && entry.overtime_hours > 0 ? '+' + entry.overtime_hours.toFixed(2) + 'h' : '—'}</td>
          <td><span class="status-badge ${worked ? 'status-worked' : 'status-absent'}">${status}</span></td>
        </tr>`;
    }
  }

  // Upload to Drive in background
  const htmlContent = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>Attendance Report — ${label}</title></head>
<body>${tableRows}</body>
</html>`;
  const base64 = btoa(unescape(encodeURIComponent(htmlContent)));
  const typeMap: Record<string, string> = { Week: 'attendance_weekly', Month: 'attendance_monthly', Year: 'attendance_yearly' };
  const filename = `Attendance-${label}-${start}${start !== end ? `-to-${end}` : ''}.html`;
  supabase.functions.invoke('upload-to-drive', {
    body: {
      filename,
      mimeType: 'text/html',
      base64Content: base64,
      type: typeMap[label] || 'attendance_monthly',
      meta: { year: String(new Date(start + 'T00:00:00').getFullYear()) },
    },
  }).catch(() => {});

  const win = window.open('', '_blank', 'width=1000,height=800');
  if (!win) return;

  win.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Attendance Report — ${label}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #111827; background: #fff; padding: 40px; font-size: 12px; }
    .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 3px solid #FF6B35; padding-bottom: 20px; margin-bottom: 28px; }
    .header img { height: 48px; object-fit: contain; }
    .header-right { text-align: right; }
    .header-right h1 { font-size: 20px; font-weight: 700; color: #111827; }
    .header-right p { font-size: 12px; color: #6b7280; margin-top: 4px; }
    .summary { display: flex; gap: 20px; margin-bottom: 24px; }
    .summary-item { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px 16px; }
    .summary-item .slabel { font-size: 10px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.05em; }
    .summary-item .svalue { font-size: 16px; font-weight: 700; color: #111827; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; }
    th { background: #111827; color: #fff; padding: 9px 10px; text-align: left; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }
    td { padding: 8px 10px; border-bottom: 1px solid #f3f4f6; }
    tr:nth-child(even) td { background: #fafafa; }
    .absent-row td { color: #9ca3af; }
    .status-badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 10px; font-weight: 600; }
    .status-worked { background: #d1fae5; color: #065f46; }
    .status-absent { background: #fef3c7; color: #92400e; }
    .footer { margin-top: 28px; padding-top: 14px; border-top: 1px solid #e5e7eb; font-size: 10px; color: #9ca3af; text-align: center; }
    @media print { body { padding: 16px; } }
  </style>
</head>
<body>
  <div class="header">
    <img src="${logoUrl}" alt="Huna Creatives" onerror="this.style.display='none'" />
    <div class="header-right">
      <h1>Attendance Report</h1>
      <p>${label}: <strong>${rangeLabelFmt(start, end)}</strong></p>
      <p>Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
    </div>
  </div>
  <div class="summary">
    <div class="summary-item">
      <div class="slabel">Days Worked (records)</div>
      <div class="svalue">${totalWorked}</div>
    </div>
    <div class="summary-item">
      <div class="slabel">Absent Records</div>
      <div class="svalue">${totalAbsent}</div>
    </div>
    <div class="summary-item">
      <div class="slabel">Total Hours</div>
      <div class="svalue" style="color:#FF6B35">${totalHours.toFixed(1)}h</div>
    </div>
  </div>
  <table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Contractor</th>
        <th>Dept</th>
        <th>Time In</th>
        <th>Time Out</th>
        <th>Hours</th>
        <th>OT</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>${tableRows || '<tr><td colspan="8" style="text-align:center;padding:20px;color:#9ca3af;">No data for this range</td></tr>'}</tbody>
  </table>
  <div class="footer">Huna Creatives · Attendance Report · ${label}</div>
  <script>window.onload = function() { setTimeout(function() { window.print(); }, 400); };</script>
</body>
</html>`);
  win.document.close();
}

// ----- Main Component -----

export default function AdminAttendancePage() {
  const { isDemo } = useDemo();
  const todayStr = toDateStr(new Date());

  const [selectedDate, setSelectedDate] = useState(todayStr);
  const isToday = selectedDate === todayStr;

  // Live (today) state
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Historical state
  const [histRows, setHistRows] = useState<HistoricalRow[]>([]);
  const [histLoading, setHistLoading] = useState(false);

  // Shared
  const [filter, setFilter] = useState<'all' | 'worked' | 'absent'>('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [editHours, setEditHours] = useState<{ userId: string; fullName: string; currentHours: number | null } | null>(null);

  // ----- Live fetch -----
  const fetchLive = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) setRefreshing(true);
    else setLoading(true);

    const { data, error } = await supabase.functions.invoke('slack-attendance');

    if (!error && data?.attendance) {
      setRecords(data.attendance);
      setLastRefresh(new Date());
    }

    setLoading(false);
    setRefreshing(false);
  }, []);

  // ----- Historical fetch -----
  const fetchHistorical = useCallback(async (date: string) => {
    setHistLoading(true);

    const dayOfWeek = ['sun','mon','tue','wed','thu','fri','sat'][new Date(date + 'T00:00:00').getDay()];

    const { data: hoursData } = await supabase
      .from('hub_daily_hours')
      .select('user_id, hours_raw, hours_capped, overtime_hours, first_on, last_off')
      .eq('date', date);

    const { data: contractors } = await supabase
      .from('hub_users')
      .select('id, full_name, avatar_url, department, start_date, shift_start, shift_end, work_days, payment_type')
      .eq('status', 'active')
      .in('role', ['contractor', 'admin'])
      .neq('payment_type', 'project_based');

    const hoursMap: Record<string, typeof hoursData extends (infer T)[] | null ? T : never> = {};
    for (const h of hoursData || []) {
      hoursMap[(h as any).user_id] = h;
    }

    const eligible = (contractors || []).filter((c: any) =>
      !c.start_date || c.start_date <= date
    );

    const rows: HistoricalRow[] = eligible.map((c: any) => {
      const h = hoursMap[c.id] as any;
      const hasSchedule = c.work_days && c.work_days.length > 0;
      const isDayOff = hasSchedule && !c.work_days.includes(dayOfWeek);
      return {
        id: c.id,
        full_name: c.full_name,
        avatar_url: c.avatar_url,
        department: c.department,
        hours_raw: h?.hours_raw ?? null,
        hours_capped: h?.hours_capped ?? null,
        overtime_hours: h?.overtime_hours ?? null,
        first_on: h?.first_on ?? null,
        last_off: h?.last_off ?? null,
        worked: !!h,
        isDayOff: !h && isDayOff,
      };
    });

    rows.sort((a, b) => {
      if (a.worked && !b.worked) return -1;
      if (!a.worked && b.worked) return 1;
      return a.full_name.localeCompare(b.full_name);
    });

    setHistRows(rows);
    setHistLoading(false);
  }, []);

  // ----- Effects -----
  useEffect(() => {
    if (isDemo) {
      if (isToday) {
        // Map demo attendance to AttendanceRecord shape
        const demoRecords: AttendanceRecord[] = DEMO_ATTENDANCE.map(a => ({
          id: a.hub_user_id || '',
          hub_user_id: a.hub_user_id,
          email: null,
          full_name: a.full_name,
          avatar_url: a.avatar_url,
          department: a.department,
          status: a.status,
          last_punch: a.last_punch,
          overtime_today: a.overtime_today,
          hours_raw: a.hours_today,
          hours_capped: a.hours_today,
          punches: [],
        }));
        setRecords(demoRecords);
        setLoading(false);
      } else {
        // Map demo attendance history to HistoricalRow shape
        const demoHist: HistoricalRow[] = DEMO_ATTENDANCE_HISTORY.map(h => ({
          id: h.user_id,
          full_name: h.full_name,
          avatar_url: h.avatar_url,
          department: h.department || null,
          hours_raw: h.hours_raw,
          hours_capped: h.hours_capped,
          overtime_hours: h.overtime_hours,
          first_on: h.first_on,
          last_off: h.last_off,
          worked: true,
          isDayOff: false,
        }));
        setHistRows(demoHist);
        setHistLoading(false);
      }
      return;
    }
    if (isToday) {
      fetchLive();
      const interval = setInterval(() => fetchLive(true), 60000);
      return () => clearInterval(interval);
    } else {
      fetchHistorical(selectedDate);
    }
  }, [isDemo, selectedDate, isToday, fetchLive, fetchHistorical]);

  // Reset filter when switching modes
  useEffect(() => {
    setFilter('all');
    setExpanded(null);
  }, [selectedDate]);

  // ----- Derived data -----
  const liveCounts = {
    on: records.filter(r => r.status === 'on').length,
    off: records.filter(r => r.status === 'off').length,
    absent: records.filter(r => r.status === 'absent').length,
  };

  const histCounts = {
    worked: histRows.filter(r => r.worked).length,
    absent: histRows.filter(r => !r.worked && !r.isDayOff && !(r.first_on && !r.last_off)).length,
    totalHours: histRows.reduce((s, r) => s + (r.hours_capped || 0), 0),
  };

  const filteredLive = filter === 'all'
    ? records
    : filter === 'worked'
    ? records.filter(r => r.status === 'on' || r.status === 'off')
    : records.filter(r => r.status === 'absent');

  const filteredHist = filter === 'all'
    ? histRows
    : filter === 'worked'
    ? histRows.filter(r => r.worked)
    : histRows.filter(r => !r.worked && !r.isDayOff);

  const displayDateLabel = isToday
    ? new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    : new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <>
    <AdminLayout title="Attendance">
      <div className="space-y-4">

        {/* Branded header card */}
        <div className="bg-[#111827] rounded-2xl p-5 text-white">
          {/* Top row: date info + mode badge */}
          <div className="flex items-start justify-between gap-3 mb-5">
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <h2 className="text-base font-semibold text-white">{displayDateLabel}</h2>
                {isToday ? (
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block"></span>
                    Live
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-white/10 text-white/60 border border-white/10">
                    Historical
                  </span>
                )}
              </div>
              {isToday && lastRefresh && (
                <p className="text-xs text-white/40">
                  Updated {lastRefresh.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true })}
                  <span className="mx-1.5 opacity-40">·</span>
                  <i className="ri-slack-line mr-0.5"></i>via Slack
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-end">
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  value={selectedDate}
                  max={todayStr}
                  onChange={e => setSelectedDate(e.target.value || todayStr)}
                  className="text-xs bg-white/10 border border-white/20 text-white rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#FF6B35] cursor-pointer [color-scheme:dark]"
                />
                {!isToday && (
                  <button
                    onClick={() => setSelectedDate(todayStr)}
                    className="text-xs text-[#FF6B35] hover:text-[#FF6B35]/80 cursor-pointer whitespace-nowrap transition-colors"
                  >
                    Today
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* KPI row */}
          <div className="grid grid-cols-3 gap-3 mb-5">
            {isToday ? (
              <>
                <div className="bg-white/5 rounded-xl p-3 border border-white/10">
                  <p className="text-2xl font-bold text-white tabular-nums">{liveCounts.on}</p>
                  <p className="text-xs text-emerald-400 mt-0.5 font-medium">Online</p>
                </div>
                <div className="bg-white/5 rounded-xl p-3 border border-white/10">
                  <p className="text-2xl font-bold text-white tabular-nums">{liveCounts.off}</p>
                  <p className="text-xs text-white/50 mt-0.5">Logged Off</p>
                </div>
                <div className="bg-white/5 rounded-xl p-3 border border-white/10">
                  <p className="text-2xl font-bold text-white tabular-nums">{liveCounts.absent}</p>
                  <p className="text-xs text-amber-400 mt-0.5 font-medium">Not In</p>
                </div>
              </>
            ) : (
              <>
                <div className="bg-white/5 rounded-xl p-3 border border-white/10">
                  <p className="text-2xl font-bold text-white tabular-nums">{histCounts.worked}</p>
                  <p className="text-xs text-emerald-400 mt-0.5 font-medium">Worked</p>
                </div>
                <div className="bg-white/5 rounded-xl p-3 border border-white/10">
                  <p className="text-2xl font-bold text-white tabular-nums">{histCounts.absent}</p>
                  <p className="text-xs text-amber-400 mt-0.5 font-medium">Absent</p>
                </div>
                <div className="bg-white/5 rounded-xl p-3 border border-white/10">
                  <p className="text-2xl font-bold text-[#FF6B35] tabular-nums">{histCounts.totalHours.toFixed(1)}h</p>
                  <p className="text-xs text-white/50 mt-0.5">Total Hours</p>
                </div>
              </>
            )}
          </div>

          {/* Bottom row: export + action buttons */}
          <div className="flex items-center justify-between gap-3 pt-4 border-t border-white/10">
            <div className="flex items-center gap-1.5 flex-wrap">
              {[
                { label: 'Week', range: () => getWeekRange(selectedDate), rangeLabel: 'Week' },
                { label: 'Month', range: () => getMonthRange(selectedDate), rangeLabel: 'Month' },
                { label: 'Year', range: () => getYearRange(selectedDate), rangeLabel: 'Year' },
              ].map(btn => (
                <button
                  key={btn.label}
                  onClick={() => { const [s, e] = btn.range(); generateAttendancePDF(s, e, btn.rangeLabel); }}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white/10 border border-white/10 text-white/70 hover:bg-white/15 hover:text-white transition-colors cursor-pointer"
                >
                  <i className="ri-file-pdf-line text-sm"></i>
                  {btn.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              {isToday ? (
                <button
                  onClick={() => fetchLive(true)}
                  disabled={refreshing}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white/10 border border-white/10 text-white/70 hover:bg-white/15 hover:text-white transition-colors cursor-pointer disabled:opacity-40"
                >
                  <i className={`ri-refresh-line text-sm ${refreshing ? 'animate-spin' : ''}`}></i>
                  Refresh
                </button>
              ) : (
                <button
                  onClick={async () => {
                    setSyncing(true);
                    await supabase.functions.invoke('slack-attendance', { body: { date: selectedDate } });
                    await fetchHistorical(selectedDate);
                    setSyncing(false);
                  }}
                  disabled={syncing}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white/10 border border-white/10 text-white/70 hover:bg-white/15 hover:text-white transition-colors cursor-pointer disabled:opacity-40"
                >
                  <i className={`ri-slack-line text-sm ${syncing ? 'animate-pulse' : ''}`}></i>
                  {syncing ? 'Syncing…' : 'Sync Slack'}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
            {(['all', 'worked', 'absent'] as const).map(f => {
              const label = f === 'all' ? 'All' : f === 'worked' ? (isToday ? 'Online / Off' : 'Worked') : (isToday ? 'Not In' : 'Absent');
              const count = isToday
                ? (f === 'all' ? records.length : f === 'worked' ? liveCounts.on + liveCounts.off : liveCounts.absent)
                : (f === 'all' ? histRows.length : f === 'worked' ? histCounts.worked : histCounts.absent);
              return (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
                    filter === f ? 'bg-white text-[#111827] shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {label}
                  <span className="ml-1.5 opacity-50">{count}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Records */}
        {(isToday ? loading : histLoading) ? (
          <div className="flex items-center justify-center py-16">
            <i className="ri-loader-4-line animate-spin text-2xl text-gray-300"></i>
          </div>
        ) : isToday ? (
          /* ---- LIVE VIEW ---- */
          filteredLive.length === 0 ? (
            <div className="bg-white border border-gray-100 rounded-xl p-10 text-center">
              <i className="ri-calendar-check-line text-3xl text-gray-200 mb-2 block"></i>
              <p className="text-sm text-gray-400">No records for this filter</p>
            </div>
          ) : (
            <div className="bg-white border border-gray-100 rounded-xl overflow-hidden divide-y divide-gray-50">
              {filteredLive.map((r) => {
                const key = r.hub_user_id || r.email || r.full_name;
                const isExpanded = expanded === key;
                const hasDetail = r.punches.length > 0 || r.overtime_today > 0;
                return (
                  <div key={key}>
                    <div
                      className={`flex items-center gap-3 px-4 py-3.5 ${hasDetail ? 'cursor-pointer hover:bg-gray-50/70' : ''} transition-colors`}
                      onClick={() => hasDetail && setExpanded(isExpanded ? null : key)}
                    >
                      <div className="relative flex-shrink-0">
                        <Avatar name={r.full_name} avatar_url={r.avatar_url} />
                        <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${
                          r.status === 'on' ? 'bg-emerald-500' : r.status === 'off' ? 'bg-gray-400' : 'bg-amber-400'
                        }`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[#111827] truncate">{r.full_name}</p>
                        {r.department && <p className="text-xs text-gray-400">{r.department}</p>}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <div className="flex flex-col items-end sm:w-40 flex-shrink-0">
                          <div className="flex items-center gap-1.5">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                              r.status === 'on' ? 'bg-emerald-100 text-emerald-700' : r.status === 'off' ? 'bg-gray-100 text-gray-600' : 'bg-amber-100 text-amber-700'
                            }`}>
                              {r.status === 'on' ? 'Online' : r.status === 'off' ? 'Logged Off' : 'Not In'}
                            </span>
                            {r.overtime_today > 0 && (
                              <span className="hidden sm:inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
                                +{r.overtime_today}h OT
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            {r.hours_raw != null && r.status !== 'absent' && (
                              <span className="text-xs font-semibold tabular-nums text-[#111827]">
                                {r.hours_raw.toFixed(2)}h
                              </span>
                            )}
                            <p className="text-xs text-gray-400">
                              {r.status === 'absent' ? 'No punch today' : `Last: ${formatTime(r.last_punch)}`}
                            </p>
                          </div>
                        </div>
                        {hasDetail && (
                          <i className={`ri-arrow-down-s-line text-gray-300 text-base transition-transform flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`}></i>
                        )}
                      </div>
                    </div>
                    {isExpanded && hasDetail && (
                      <div className="bg-gray-50/60 border-t border-gray-100 px-4 pb-4 pt-3 space-y-3">
                        {r.punches.length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-gray-400 mb-2">Today's punches</p>
                            <div className="space-y-1.5">
                              {r.punches.map((p, i) => (
                                <div key={i} className="flex items-center gap-2.5">
                                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${p.status === 'on' ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                                  <span className={`text-xs font-medium w-20 flex-shrink-0 ${p.status === 'on' ? 'text-emerald-700' : 'text-gray-600'}`}>
                                    {p.status === 'on' ? 'Logged On' : 'Logged Off'}
                                  </span>
                                  <span className="text-xs text-gray-400">{formatTime(p.time)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {r.overtime_today > 0 && (
                          <div className="flex items-center gap-2 bg-purple-50 rounded-lg px-3 py-2">
                            <i className="ri-time-fill text-purple-400 text-sm"></i>
                            <span className="text-xs font-medium text-purple-700">Overtime logged: +{r.overtime_today}h</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )
        ) : (
          /* ---- HISTORICAL VIEW ---- */
          filteredHist.length === 0 ? (
            <div className="bg-white border border-gray-100 rounded-xl p-10 text-center">
              <i className="ri-calendar-check-line text-3xl text-gray-200 mb-2 block"></i>
              <p className="text-sm text-gray-400">No records for this filter</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      {['Contractor', 'Time In', 'Time Out', 'Raw Hrs', 'Billable', 'Status'].map(h => (
                        <th key={h} className="text-left text-xs text-gray-400 font-medium px-4 py-3">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filteredHist.map(r => (
                      <tr key={r.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <Avatar name={r.full_name} avatar_url={r.avatar_url} />
                            <div>
                              <p className="text-sm font-medium text-[#111827]">{r.full_name}</p>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                {r.department && <p className="text-xs text-gray-400">{r.department}</p>}
                                {r.overtime_hours != null && r.overtime_hours > 0 && (
                                  <>
                                    {r.department && <span className="text-gray-200 text-xs">·</span>}
                                    <span className="text-xs text-purple-500 font-medium">+{r.overtime_hours.toFixed(1)}h OT</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-sm text-gray-600 whitespace-nowrap">{formatTime(r.first_on)}</td>
                        <td className="px-4 py-3.5 text-sm text-gray-600 whitespace-nowrap">{formatTime(r.last_off)}</td>
                        <td className="px-4 py-3.5">
                          <span className={`text-sm font-semibold tabular-nums ${r.hours_raw != null && r.hours_capped != null && r.hours_raw > r.hours_capped ? 'text-amber-600' : 'text-[#111827]'}`}>
                            {r.hours_raw != null ? `${r.hours_raw.toFixed(2)}h` : '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="text-sm text-gray-500 tabular-nums">
                            {r.hours_capped != null ? `${r.hours_capped.toFixed(2)}h` : '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              r.worked ? 'bg-emerald-100 text-emerald-700' :
                              r.first_on && !r.last_off ? 'bg-sky-100 text-sky-700' :
                              r.isDayOff ? 'bg-gray-100 text-gray-400' :
                              'bg-amber-100 text-amber-700'
                            }`}>
                              {r.worked ? 'Worked' : r.first_on && !r.last_off ? 'In Progress' : r.isDayOff ? 'Day Off' : 'Absent'}
                            </span>
                            <button
                              onClick={() => setEditHours({ userId: r.id, fullName: r.full_name, currentHours: r.hours_raw })}
                              className="w-6 h-6 flex items-center justify-center rounded text-gray-300 hover:text-[#FF6B35] hover:bg-orange-50 transition-colors cursor-pointer flex-shrink-0"
                              title="Edit hours"
                            >
                              <i className="ri-pencil-line text-xs"></i>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        )}
      </div>
    </AdminLayout>

    {editHours && (
      <EditHoursModal
        userId={editHours.userId}
        date={selectedDate}
        fullName={editHours.fullName}
        currentHours={editHours.currentHours}
        onClose={() => setEditHours(null)}
        onSuccess={() => { setEditHours(null); fetchHistorical(selectedDate); }}
      />
    )}
    </>
  );
}
