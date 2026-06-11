import { useEffect, useState, useCallback, useMemo } from 'react';
import ContractorLayout from '@/pages/hub/components/ContractorLayout';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { getPeriods, fmtTime, fmtDate } from '@/lib/formatUtils';

interface Punch { id: string; type: 'in' | 'out'; punched_at: string; }

interface DailyRecord {
  date: string;
  hours_raw: number;
  hours_capped: number;
  overtime_hours: number;
  first_on: string | null;
  last_off: string | null;
}

function localDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function formatTime(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function calcHours(punches: Punch[]): { raw: number; capped: number; overtime: number; first_on: string | null; last_off: string | null } {
  const sorted = [...punches].sort((a, b) => new Date(a.punched_at).getTime() - new Date(b.punched_at).getTime());
  let totalMs = 0;
  let lastIn: string | null = null;
  let first_on: string | null = null;
  let last_off: string | null = null;

  for (const p of sorted) {
    if (p.type === 'in') {
      lastIn = p.punched_at;
      if (!first_on) first_on = p.punched_at;
    } else if (p.type === 'out' && lastIn) {
      totalMs += new Date(p.punched_at).getTime() - new Date(lastIn).getTime();
      last_off = p.punched_at;
      lastIn = null;
    }
  }

  const raw = totalMs / 3600000;
  const capped = Math.min(raw, 8);
  const overtime = Math.max(0, raw - 8);
  return { raw, capped, overtime, first_on, last_off };
}

function getDatesInRange(start: string, end: string): string[] {
  const dates: string[] = [];
  const cur = new Date(start + 'T00:00:00');
  const endDate = new Date(end + 'T00:00:00');
  const today = new Date(); today.setHours(0,0,0,0);
  while (cur <= endDate && cur <= today) {
    dates.push(`${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,'0')}-${String(cur.getDate()).padStart(2,'0')}`);
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

export default function ContractorAttendancePage() {
  const { hubUser } = useAuth();
  const periods = useMemo(() => getPeriods().reverse(), []);
  const [selectedPeriodIdx, setSelectedPeriodIdx] = useState(0);
  const selectedPeriod = periods[selectedPeriodIdx];

  const [todayPunches, setTodayPunches] = useState<Punch[]>([]);
  const [dailyRecords, setDailyRecords] = useState<DailyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [punching, setPunching] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const today = localDate();

  const fetchToday = useCallback(async () => {
    if (!hubUser?.id) return;
    const { data } = await supabase
      .from('hub_attendance_punches')
      .select('id, type, punched_at')
      .eq('user_id', hubUser.id)
      .eq('date', today)
      .order('punched_at', { ascending: true });
    setTodayPunches((data as Punch[]) ?? []);
    setLastRefresh(new Date());
    setLoading(false);
  }, [hubUser?.id, today]);

  const fetchHistory = useCallback(async () => {
    if (!hubUser?.id || !selectedPeriod) return;
    setLoadingHistory(true);
    const { data } = await supabase
      .from('hub_daily_hours')
      .select('date, hours_raw, hours_capped, overtime_hours, first_on, last_off')
      .eq('user_id', hubUser.id)
      .gte('date', selectedPeriod.start)
      .lte('date', selectedPeriod.end)
      .order('date', { ascending: false });
    setDailyRecords((data as DailyRecord[]) ?? []);
    setLoadingHistory(false);
  }, [hubUser?.id, selectedPeriod?.start, selectedPeriod?.end]);

  useEffect(() => { fetchToday(); }, [fetchToday]);
  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  const lastPunch = todayPunches[todayPunches.length - 1] ?? null;
  const isClockedIn = lastPunch?.type === 'in';
  const status: 'in' | 'out' | 'absent' = todayPunches.length === 0 ? 'absent' : isClockedIn ? 'in' : 'out';

  const handlePunch = async (type: 'in' | 'out') => {
    if (!hubUser?.id || punching) return;
    setPunching(true);
    const { data: existing } = await supabase.from('hub_attendance_punches').select('type').eq('user_id', hubUser.id).eq('date', today).order('punched_at', { ascending: false }).limit(1);
    const lastType = existing?.[0]?.type ?? null;
    if (type === 'in' && lastType === 'in') { setPunching(false); return; }
    if (type === 'out' && lastType !== 'in') { setPunching(false); return; }
    const now = new Date().toISOString();

    await supabase.from('hub_attendance_punches').insert({
      user_id: hubUser.id,
      type,
      punched_at: now,
      date: today,
    });

    const { data: allPunches } = await supabase
      .from('hub_attendance_punches')
      .select('id, type, punched_at')
      .eq('user_id', hubUser.id)
      .eq('date', today)
      .order('punched_at', { ascending: true });

    const punches = (allPunches as Punch[]) ?? [];

    if (type === 'out' && punches.length > 0) {
      const { raw, capped, overtime, first_on, last_off } = calcHours(punches);
      await supabase.from('hub_daily_hours').upsert({
        user_id: hubUser.id,
        date: today,
        hours_raw: parseFloat(raw.toFixed(2)),
        hours_capped: parseFloat(capped.toFixed(2)),
        overtime_hours: parseFloat(overtime.toFixed(2)),
        first_on,
        last_off,
      }, { onConflict: 'user_id,date' });
      await fetchHistory();
    }

    setTodayPunches(punches);
    setLastRefresh(new Date());
    setPunching(false);
  };

  const recordMap: Record<string, DailyRecord> = {};
  for (const r of dailyRecords) recordMap[r.date] = r;

  const allDates = selectedPeriod ? getDatesInRange(selectedPeriod.start, selectedPeriod.end) : [];
  const totalHours = dailyRecords.reduce((s, r) => s + (r.hours_capped || 0), 0);
  const totalOvertime = dailyRecords.reduce((s, r) => s + (r.overtime_hours || 0), 0);
  const daysPresent = dailyRecords.filter(r => r.hours_raw > 0).length;

  const todayLabel = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  if (hubUser?.payment_type === 'project_based') return (
    <ContractorLayout title="My Attendance">
      <div className="max-w-xl">
        <div className="bg-white border border-gray-100 rounded-2xl p-10 text-center">
          <i className="ri-time-line text-gray-300 text-3xl mb-3 block"></i>
          <p className="text-sm font-medium text-gray-500">Not applicable</p>
          <p className="text-xs text-gray-400 mt-1">Project-based employees don't log hours.</p>
        </div>
      </div>
    </ContractorLayout>
  );

  return (
    <ContractorLayout title="My Attendance">
      <div className="space-y-5 max-w-xl">

        {/* Date + last refresh */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-700">{todayLabel}</p>
            {lastRefresh && <p className="text-xs text-gray-400">Updated {lastRefresh.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true })}</p>}
          </div>
        </div>

        {/* Clock in/out card */}
        {loading ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-10 flex justify-center">
            <i className="ri-loader-4-line animate-spin text-2xl text-gray-300"></i>
          </div>
        ) : (
          <div className={`rounded-2xl border p-6 ${
            status === 'in' ? 'bg-emerald-50 border-emerald-200'
            : status === 'out' ? 'bg-gray-50 border-gray-200'
            : 'bg-amber-50 border-amber-200'
          }`}>
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${
                status === 'in' ? 'bg-emerald-100' : status === 'out' ? 'bg-gray-100' : 'bg-amber-100'
              }`}>
                <i className={`text-xl ${
                  status === 'in' ? 'ri-user-follow-line text-emerald-600'
                  : status === 'out' ? 'ri-user-unfollow-line text-gray-500'
                  : 'ri-time-line text-amber-600'
                }`}></i>
              </div>
              <div className="flex-1">
                <p className={`font-bold text-base ${
                  status === 'in' ? 'text-emerald-700' : status === 'out' ? 'text-gray-700' : 'text-amber-700'
                }`}>
                  {status === 'in' ? "You're Clocked In" : status === 'out' ? 'Clocked Out' : 'Not Clocked In'}
                </p>
                <p className="text-sm text-gray-500">
                  {lastPunch ? `Last punch: ${formatTime(lastPunch.punched_at)}` : 'No punches today'}
                </p>
              </div>

              {/* Punch list */}
              {todayPunches.length > 0 && (
                <div className="text-right space-y-0.5">
                  {todayPunches.map(p => (
                    <p key={p.id} className="text-xs text-gray-500">
                      <span className={`font-semibold ${p.type === 'in' ? 'text-emerald-600' : 'text-gray-500'}`}>
                        {p.type === 'in' ? 'In' : 'Out'}
                      </span>{' '}{formatTime(p.punched_at)}
                    </p>
                  ))}
                </div>
              )}
            </div>

            {/* Action button */}
            <div className="mt-5">
              {status === 'in' ? (
                <button
                  onClick={() => handlePunch('out')}
                  disabled={punching}
                  className="w-full py-3 rounded-xl font-semibold text-sm bg-gray-800 text-white hover:bg-gray-700 disabled:opacity-40 transition-colors cursor-pointer"
                >
                  {punching ? 'Recording...' : 'Clock Out'}
                </button>
              ) : (
                <button
                  onClick={() => handlePunch('in')}
                  disabled={punching}
                  className="w-full py-3 rounded-xl font-semibold text-sm bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-40 transition-colors cursor-pointer"
                >
                  {punching ? 'Recording...' : 'Clock In'}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Attendance history */}
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">Attendance History</h2>
            <select
              value={selectedPeriodIdx}
              onChange={e => setSelectedPeriodIdx(Number(e.target.value))}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none bg-white cursor-pointer"
            >
              {periods.map((p, i) => <option key={p.start} value={i}>{p.label}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-3 divide-x divide-gray-100 border-b border-gray-100">
            {[
              { label: 'Days Present', value: daysPresent, icon: 'ri-calendar-check-line', color: 'text-emerald-600' },
              { label: 'Total Hours', value: `${totalHours.toFixed(1)}h`, icon: 'ri-time-line', color: 'text-blue-600' },
              { label: 'Overtime', value: `${totalOvertime.toFixed(1)}h`, icon: 'ri-time-fill', color: 'text-purple-600' },
            ].map(s => (
              <div key={s.label} className="p-4 text-center">
                <i className={`${s.icon} ${s.color} text-lg mb-1 block`}></i>
                <p className="text-base font-semibold text-gray-900">{s.value}</p>
                <p className="text-xs text-gray-400">{s.label}</p>
              </div>
            ))}
          </div>

          {loadingHistory ? (
            <div className="p-8 flex justify-center">
              <i className="ri-loader-4-line animate-spin text-xl text-gray-300"></i>
            </div>
          ) : allDates.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-400">No dates in this period yet.</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {allDates.map(date => {
                const rec = recordMap[date];
                const present = rec && rec.hours_raw > 0;
                return (
                  <div key={date} className="flex items-center gap-3 px-4 py-3">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${present ? 'bg-emerald-400' : 'bg-gray-200'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800">{fmtDate(date)}</p>
                      {present && <p className="text-xs text-gray-400">{fmtTime(rec.first_on)} – {fmtTime(rec.last_off)}</p>}
                    </div>
                    {present ? (
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-semibold text-gray-800">{rec.hours_capped.toFixed(1)}h</p>
                        {rec.overtime_hours > 0 && <p className="text-xs text-purple-500">+{rec.overtime_hours.toFixed(1)}h OT</p>}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-300 flex-shrink-0">Absent</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </ContractorLayout>
  );
}
