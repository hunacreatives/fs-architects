import { useEffect, useState, useCallback, useMemo } from 'react';
import ContractorLayout from '@/pages/hub/components/ContractorLayout';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { getPeriods, fmtTime, fmtDate } from '@/lib/formatUtils';

interface PunchRecord {
  status: 'on' | 'off';
  time: string;
}

interface MyAttendance {
  status: 'on' | 'off' | 'absent';
  work_location: string | null;
  last_punch: string | null;
  punches: PunchRecord[];
}

interface DailyRecord {
  date: string;
  hours_raw: number;
  hours_capped: number;
  overtime_hours: number;
  first_on: string | null;
  last_off: string | null;
}

function formatTime(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function getDatesInRange(start: string, end: string): string[] {
  const dates: string[] = [];
  const cur = new Date(start + 'T00:00:00');
  const endDate = new Date(end + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  while (cur <= endDate && cur <= today) {
    dates.push(cur.toLocaleDateString('en-CA'));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

export default function ContractorAttendancePage() {
  const { hubUser } = useAuth();

  const periods = useMemo(() => getPeriods().reverse(), []);
  const [selectedPeriodIdx, setSelectedPeriodIdx] = useState(0);
  const selectedPeriod = periods[selectedPeriodIdx];

  const [myRecord, setMyRecord] = useState<MyAttendance | null>(null);
  const [dailyRecords, setDailyRecords] = useState<DailyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchToday = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) setRefreshing(true);
    const { data, error } = await supabase.functions.invoke('slack-attendance');
    if (!error && data?.attendance && hubUser?.email) {
      const mine = data.attendance.find(
        (r: any) => r.email === hubUser.email || r.hub_user_id === hubUser.id
      );
      setMyRecord(mine || { status: 'absent', last_punch: null, punches: [] });
      setLastRefresh(new Date());
    }
    setLoading(false);
    setRefreshing(false);
  }, [hubUser]);

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

  useEffect(() => {
    fetchToday();
    const interval = setInterval(() => fetchToday(true), 60000);
    return () => clearInterval(interval);
  }, [fetchToday]);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  const recordMap: Record<string, DailyRecord> = {};
  for (const r of dailyRecords) recordMap[r.date] = r;

  const allDates = selectedPeriod ? getDatesInRange(selectedPeriod.start, selectedPeriod.end) : [];
  const totalHours = dailyRecords.reduce((s, r) => s + (r.hours_capped || 0), 0);
  const totalOvertime = dailyRecords.reduce((s, r) => s + (r.overtime_hours || 0), 0);
  const daysPresent = dailyRecords.filter(r => r.hours_raw > 0).length;

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  if (hubUser?.payment_type === 'project_based') return (
    <ContractorLayout title="My Attendance">
      <div className="max-w-xl">
        <div className="bg-white border border-gray-100 rounded-2xl p-10 text-center">
          <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center mx-auto mb-3">
            <i className="ri-time-line text-gray-400 text-xl"></i>
          </div>
          <p className="text-sm font-medium text-gray-500">Attendance tracking not applicable</p>
          <p className="text-xs text-gray-400 mt-1">Project-based contractors don't log hours.</p>
        </div>
      </div>
    </ContractorLayout>
  );

  return (
    <ContractorLayout title="My Attendance">
      <div className="space-y-5">

        {/* Today header */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-700">{today}</p>
            {lastRefresh && (
              <p className="text-xs text-gray-400">
                Updated {lastRefresh.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true })}
              </p>
            )}
          </div>
          <button
            onClick={() => fetchToday(true)}
            disabled={refreshing}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors cursor-pointer"
          >
            <i className={`ri-refresh-line text-sm ${refreshing ? 'animate-spin' : ''}`}></i>
            Refresh
          </button>
        </div>

        {/* Today status card */}
        {loading ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-10 flex items-center justify-center">
            <i className="ri-loader-4-line animate-spin text-2xl text-gray-300"></i>
          </div>
        ) : (
          <div className={`rounded-2xl border p-6 ${
            myRecord?.status === 'on' ? 'bg-emerald-50 border-emerald-200'
            : myRecord?.status === 'off' ? 'bg-gray-50 border-gray-200'
            : 'bg-amber-50 border-amber-200'
          }`}>
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${
                myRecord?.status === 'on' ? 'bg-emerald-100'
                : myRecord?.status === 'off' ? 'bg-gray-100'
                : 'bg-amber-100'
              }`}>
                <i className={`text-xl ${
                  myRecord?.status === 'on' ? 'ri-user-follow-line text-emerald-600'
                  : myRecord?.status === 'off' ? 'ri-user-unfollow-line text-gray-500'
                  : 'ri-time-line text-amber-600'
                }`}></i>
              </div>
              <div className="flex-1">
                <p className={`font-bold text-base ${
                  myRecord?.status === 'on' ? 'text-emerald-700'
                  : myRecord?.status === 'off' ? 'text-gray-700'
                  : 'text-amber-700'
                }`}>
                  {myRecord?.status === 'on'
                    ? (myRecord.work_location === 'on_site' ? "You're On Site" : myRecord.work_location === 'wfh' ? 'Working From Home' : "You're In Office")
                    : myRecord?.status === 'off' ? 'Logged Off' : 'Not Clocked In'}
                </p>
                <p className="text-sm text-gray-500">
                  {myRecord?.status === 'absent'
                    ? "Type On, On/Site, or On/WFH in Slack to clock in"
                    : `Last punch: ${formatTime(myRecord?.last_punch ?? null)}`}
                </p>
              </div>
              {myRecord && myRecord.punches.length > 0 && (
                <div className="text-right">
                  {myRecord.punches.map((p, i) => (
                    <p key={i} className="text-xs text-gray-500">
                      <span className={`font-medium ${p.status === 'on' ? 'text-emerald-600' : 'text-gray-500'}`}>
                        {p.status === 'on' ? 'In' : 'Out'}
                      </span> {formatTime(p.time)}
                    </p>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Period attendance */}
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">Attendance History</h2>
            <select
              value={selectedPeriodIdx}
              onChange={e => setSelectedPeriodIdx(Number(e.target.value))}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none bg-white cursor-pointer"
            >
              {periods.map((p, i) => (
                <option key={p.start} value={i}>{p.label}</option>
              ))}
            </select>
          </div>

          {/* Period stats */}
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

          {/* Daily rows */}
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
                      {present && (
                        <p className="text-xs text-gray-400">
                          {fmtTime(rec.first_on)} – {fmtTime(rec.last_off)}
                        </p>
                      )}
                    </div>
                    {present ? (
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-semibold text-gray-800">{rec.hours_capped.toFixed(1)}h</p>
                        {rec.overtime_hours > 0 && (
                          <p className="text-xs text-purple-500">+{rec.overtime_hours}h OT</p>
                        )}
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

        {/* How it works */}
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-xs font-medium text-gray-500 mb-3">How to log attendance</p>
          <div className="space-y-2.5">
            {[
              { icon: 'ri-building-line', bg: 'bg-emerald-100', color: 'text-emerald-600', title: 'In office', desc: <>Type <span className="font-mono bg-gray-50 border border-gray-200 px-1 rounded">On</span> in the Slack attendance channel</> },
              { icon: 'ri-map-pin-2-line', bg: 'bg-sky-100', color: 'text-sky-600', title: 'On site', desc: <>Type <span className="font-mono bg-gray-50 border border-gray-200 px-1 rounded">On/Site</span> in the Slack attendance channel</> },
              { icon: 'ri-home-office-line', bg: 'bg-violet-100', color: 'text-violet-600', title: 'Work from home', desc: <>Type <span className="font-mono bg-gray-50 border border-gray-200 px-1 rounded">On/WFH</span> in the Slack attendance channel</> },
              { icon: 'ri-logout-box-line', bg: 'bg-gray-100', color: 'text-gray-500', title: 'Ending work', desc: <>Type <span className="font-mono bg-gray-50 border border-gray-200 px-1 rounded">Off</span> in the Slack attendance channel</> },
            ].map(item => (
              <div key={item.title} className="flex items-start gap-3">
                <div className={`w-7 h-7 rounded-lg ${item.bg} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                  <i className={`${item.icon} ${item.color} text-xs`}></i>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-800">{item.title}</p>
                  <p className="text-xs text-gray-500">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="text-xs text-center text-gray-400">
          <i className="ri-slack-line mr-1"></i>
          Attendance is synced from Slack every minute
        </p>
      </div>
    </ContractorLayout>
  );
}
