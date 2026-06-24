import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from '@/pages/hub/components/AdminLayout';
import HubAvatar from '@/pages/hub/components/HubAvatar';
import { supabase } from '@/lib/supabase';
import { useHubAuth as useAuth } from '@/hooks/useHubAuth';
import { useDemo } from '@/contexts/DemoContext';
import { HubUser, HubAnnouncement, HubRequest, HubTimeOff } from '@/lib/types';
import { getSetting } from '@/lib/settings';
import { getPeriods } from '@/lib/formatUtils';
import { DEMO_ATTENDANCE, DEMO_ANNOUNCEMENTS, DEMO_REQUESTS, DEMO_TIME_OFF, DEMO_INVOICES, DEMO_DASHBOARD } from '@/lib/demoData';
import { mergeLiveAttendanceIntoDailyHours, fetchPayrollTotal } from '@/lib/payrollUtils';

function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

interface SlackRecord {
  hub_user_id: string | null;
  full_name: string;
  avatar_url: string | null;
  department: string | null;
  status: 'on' | 'off' | 'absent';
  work_location: string | null;
  last_punch: string | null;
  hours_today: number;
  overtime_today: number;
}

interface OutstandingInvoice {
  id: number;
  invoice_number: string;
  client_name: string;
  project_name: string;
  balance: number | null;
  sent_at: string;
  due_date: string | null;
}

interface BirthdayPerson {
  full_name: string;
  avatar_url: string | null;
  birthday: string;
  daysUntil: number;
  isToday: boolean;
}

function getBirthdayAlerts(contractors: { full_name: string; avatar_url?: string; birthday?: string }[]): BirthdayPerson[] {
  const today = new Date();
  const todayMonth = today.getMonth() + 1;
  const todayDay = today.getDate();
  const results: BirthdayPerson[] = [];

  for (const c of contractors) {
    if (!c.birthday) continue;
    const parsed = new Date(c.birthday);
    if (isNaN(parsed.getTime())) continue;
    const bMonth = parsed.getMonth() + 1;
    const bDay = parsed.getDate();

    // Days until birthday this year (or next if passed)
    let diff = new Date(today.getFullYear(), bMonth - 1, bDay).getTime() - new Date(today.getFullYear(), todayMonth - 1, todayDay).getTime();
    if (diff < 0) diff += 365 * 24 * 60 * 60 * 1000;
    const daysUntil = Math.round(diff / (24 * 60 * 60 * 1000));

    if (daysUntil <= 14) {
      results.push({
        full_name: c.full_name,
        avatar_url: c.avatar_url || null,
        birthday: c.birthday,
        daysUntil,
        isToday: daysUntil === 0,
      });
    }
  }
  return results.sort((a, b) => a.daysUntil - b.daysUntil);
}

function Avatar({ name, url, size = 9 }: { name: string; url: string | null; size?: number }) {
  return <HubAvatar fullName={name} avatarUrl={url} size={`w-${size} h-${size}`} />;
}

function formatTime(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

type WidgetKey = 'kpi' | 'teamStatus' | 'payroll' | 'requests' | 'timeOff' | 'announcements' | 'quickActions' | 'outstandingInvoices' | 'birthdays';

const ALL_WIDGETS: { key: WidgetKey; label: string; icon: string; ownerOnly?: boolean }[] = [
  { key: 'kpi',                label: 'KPI Stats',           icon: 'ri-bar-chart-2-line' },
  { key: 'teamStatus',         label: 'Team Status',         icon: 'ri-team-line' },
  { key: 'payroll',            label: 'Payroll Estimate',    icon: 'ri-money-dollar-circle-line' },
  { key: 'requests',           label: 'Pending Requests',    icon: 'ri-inbox-line' },
  { key: 'timeOff',            label: 'Time-Off Queue',      icon: 'ri-calendar-todo-line' },
  { key: 'announcements',      label: 'Announcements',       icon: 'ri-megaphone-line' },
  { key: 'quickActions',       label: 'Quick Actions',       icon: 'ri-flashlight-line' },
  { key: 'outstandingInvoices',label: 'Outstanding Invoices',icon: 'ri-file-list-3-line' },
  { key: 'birthdays',          label: 'Birthday Alerts',     icon: 'ri-cake-2-line' },
];

function loadWidgetPrefs(): Record<WidgetKey, boolean> {
  try {
    const raw = localStorage.getItem('hub_admin_widgets');
    if (raw) return JSON.parse(raw);
  } catch {}
  const defaults: Partial<Record<WidgetKey, boolean>> = {};
  ALL_WIDGETS.forEach(w => { defaults[w.key] = true; });
  return defaults as Record<WidgetKey, boolean>;
}

export default function AdminDashboardPage() {
  const navigate = useNavigate();
  const { hubUser, effectiveRole } = useAuth();
  const { isDemo } = useDemo();
  const [_cache] = useState<Record<string, any> | null>(() => {
    try { const r = sessionStorage.getItem('hub_dashboard_cache'); return r ? JSON.parse(r) : null; }
    catch { sessionStorage.removeItem('hub_dashboard_cache'); return null; }
  });
  const [attendance, setAttendance] = useState<SlackRecord[]>(_cache?.attendance ?? []);
  const [announcements, setAnnouncements] = useState<HubAnnouncement[]>(_cache?.announcements ?? []);
  const [pendingRequests, setPendingRequests] = useState<HubRequest[]>(_cache?.pendingRequests ?? []);
  const [pendingTimeOff, setPendingTimeOff] = useState<HubTimeOff[]>(_cache?.pendingTimeOff ?? []);
  const [totalPayroll, setTotalPayroll] = useState(0);
  const [totalHours, setTotalHours] = useState(_cache?.totalHours ?? 0);
  const [totalNetProfit, setTotalNetProfit] = useState(_cache?.totalNetProfit ?? 0);
  const [totalContractValue, setTotalContractValue] = useState(_cache?.totalContractValue ?? 0);
  const [totalCollected, setTotalCollected] = useState(_cache?.totalCollected ?? 0);
  const [activeProjectCount, setActiveProjectCount] = useState(_cache?.activeProjectCount ?? 0);
  const [onTrackCount, setOnTrackCount] = useState(_cache?.onTrackCount ?? 0);
  const [atRiskCount, setAtRiskCount] = useState(_cache?.atRiskCount ?? 0);
  const [internalProjectCount, setInternalProjectCount] = useState(_cache?.internalProjectCount ?? 0);
  const [monthlyRetainerTotal, setMonthlyRetainerTotal] = useState(_cache?.monthlyRetainerTotal ?? 0);
  const [birthdays, setBirthdays] = useState<BirthdayPerson[]>(_cache?.birthdays ?? []);
  const [outstandingInvoices, setOutstandingInvoices] = useState<OutstandingInvoice[]>(_cache?.outstandingInvoices ?? []);
  const [loading, setLoading] = useState(!_cache);
  const [widgetPrefs, setWidgetPrefs] = useState<Record<WidgetKey, boolean>>(loadWidgetPrefs);
  const [showCustomize, setShowCustomize] = useState(false);
  const isOwner = effectiveRole === 'owner';
  const isOwnerOrAdmin = isOwner || effectiveRole === 'admin' || effectiveRole === 'hr';

  const show = (key: WidgetKey) => widgetPrefs[key] !== false;

  const toggleWidget = (key: WidgetKey) => {
    setWidgetPrefs(prev => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem('hub_admin_widgets', JSON.stringify(next));
      return next;
    });
  };

  const today = new Date();
  const currentPeriod = getPeriods().at(-1) ?? {
    label: '',
    start: today.toISOString().slice(0, 10),
    end: today.toISOString().slice(0, 10),
  };
  const cutoffStart = currentPeriod.start;
  const cutoffEnd = currentPeriod.end;

  // Payroll period progress
  const periodStart = new Date(cutoffStart);
  const periodEnd = new Date(cutoffEnd);
  const totalDays = Math.round((periodEnd.getTime() - periodStart.getTime()) / 86400000) + 1;
  const daysElapsed = Math.min(Math.round((today.getTime() - periodStart.getTime()) / 86400000) + 1, totalDays);
  const daysLeft = Math.max(totalDays - daysElapsed, 0);
  const periodProgress = Math.round((daysElapsed / totalDays) * 100);
  const paydayLabel = currentPeriod.label;

  useEffect(() => {
    if (isDemo) {
      setAttendance(DEMO_ATTENDANCE);
      setAnnouncements(DEMO_ANNOUNCEMENTS);
      setPendingRequests(DEMO_REQUESTS);
      setPendingTimeOff(DEMO_TIME_OFF);
      setTotalPayroll(DEMO_DASHBOARD.totalPayroll);
      setTotalHours(DEMO_DASHBOARD.totalHours);
      setTotalNetProfit(DEMO_DASHBOARD.totalNetProfit);
      setTotalContractValue(DEMO_DASHBOARD.totalContractValue);
      setTotalCollected(DEMO_DASHBOARD.totalCollected);
      setActiveProjectCount(DEMO_DASHBOARD.activeProjectCount);
      setOnTrackCount(DEMO_DASHBOARD.activeProjectCount);
      setAtRiskCount(0);
      setInternalProjectCount(0);
      setMonthlyRetainerTotal(DEMO_DASHBOARD.monthlyRetainerTotal);
      setBirthdays([]);
      setOutstandingInvoices(DEMO_INVOICES);
      setLoading(false);
      return;
    }
    const fetchAll = async () => {
      try {
      const [slackResult, annResult, reqResult, toResult, contractorsResult, hoursResult, projectsResult, clientsResult, usdRateStr, invResult, linkResult] = await Promise.all([
        supabase.functions.invoke('slack-attendance'),
        supabase.from('hub_announcements').select('*, hub_users(full_name)').order('created_at', { ascending: false }).limit(4),
        supabase.from('hub_requests').select('*, hub_users(full_name, avatar_url)').in('status', ['open', 'in_review']).order('created_at', { ascending: false }),
        supabase.from('hub_time_off').select('*, hub_users(full_name, avatar_url)').eq('status', 'pending').order('created_at', { ascending: false }),
        supabase.from('hub_users').select('id, full_name, avatar_url, payment_type, currency, birthday, start_date, work_days').eq('status', 'active').in('role', ['contractor', 'admin']).neq('is_developer', true),
        supabase.from('hub_daily_hours').select('user_id, hours_capped, hours_raw, overtime_hours, date, is_manual').gte('date', cutoffStart).lte('date', cutoffEnd),
        supabase.from('hub_projects').select('contract_price, status, deadline, project_type, monthly_rate, monthly_rate_currency, hub_project_costs(amount), hub_project_payments(amount)'),
        supabase.from('hub_clients').select('contract_value, contract_currency, status'),
        getSetting('usd_rate', '56'),
        supabase.from('hub_invoice_log').select('id, invoice_number, client_name, project_name, project_id, balance, sent_at').gt('balance', 0).eq('settled', false).order('sent_at', { ascending: false }),
        supabase.from('hub_invoice_payment_links').select('invoice_number, project_id, due_date').order('created_at', { ascending: false }),
      ]);
      // Prefer the exact total the Payroll page computed and cached for this
      // cutoff, so the dashboard estimate always matches the Payroll page. Fall
      // back to the live calc only when no cache row exists yet (period never
      // opened on the payroll page).
      const { data: payrollCache } = await supabase
        .from('hub_payroll_cache')
        .select('computed_total')
        .eq('period_start', cutoffStart)
        .maybeSingle();
      const payrollTotal = payrollCache?.computed_total != null
        ? Number(payrollCache.computed_total)
        : await fetchPayrollTotal(cutoffStart, cutoffEnd, parseFloat(usdRateStr || '56')).catch(() => 0);

      if (!slackResult.error && slackResult.data?.attendance) {
        setAttendance(slackResult.data.attendance);
      }

      const eligibleContractors = ((contractorsResult.data as any[]) || []).filter((c: any) =>
        c.payment_type !== 'project_based' &&
        (!c.start_date || c.start_date <= cutoffEnd)
      );
      const mergedHoursRows = mergeLiveAttendanceIntoDailyHours(
        ((hoursResult.data as any[]) || []).map((h: any) => ({ ...h })),
        (slackResult.data as any)?.attendance || [],
        eligibleContractors.map((c: any) => c.id),
        today,
      );

      let hrs = 0;
      for (const h of mergedHoursRows) hrs += h.hours_capped || 0;

      setTotalPayroll(payrollTotal);
      setTotalHours(parseFloat(hrs.toFixed(1)));
      setBirthdays(getBirthdayAlerts(contractorsResult.data || []));

      // Net profit across all projects
      let netProfitTotal = 0;
      let contractValueTotal = 0;
      let collectedTotal = 0;
      let activeCount = 0;
      let onTrack = 0;
      let atRisk = 0;
      let internalCount = 0;
      const todayStr = today.toISOString().slice(0, 10);
      for (const p of (projectsResult.data as any[]) || []) {
        const costs = ((p.hub_project_costs as any[]) || []).reduce((s: number, c: any) => s + c.amount, 0);
        const collected = ((p.hub_project_payments as any[]) || []).reduce((s: number, x: any) => s + x.amount, 0);
        netProfitTotal += p.contract_price - costs;
        contractValueTotal += p.contract_price;
        collectedTotal += collected;
        if (p.status === 'ongoing') {
          activeCount++;
          if (p.deadline && p.deadline < todayStr) {
            atRisk++;
          } else {
            onTrack++;
          }
        }
        if (p.project_type === 'internal') internalCount++;
      }
      setTotalNetProfit(netProfitTotal);
      setTotalContractValue(contractValueTotal);
      setTotalCollected(collectedTotal);
      setActiveProjectCount(activeCount);
      setOnTrackCount(onTrack);
      setAtRiskCount(atRisk);
      setInternalProjectCount(internalCount);

      // Monthly retainer total — hub_projects retainers only (authoritative source)
      // USD rates are converted to PHP; PHP rates are added as-is
      const clientUsdRate = parseFloat(usdRateStr);
      const retainerTotal = ((projectsResult.data as any[]) || [])
        .filter((p: any) => p.project_type === 'retainer' && p.status === 'ongoing' && p.monthly_rate)
        .reduce((s: number, p: any) => {
          const rate = p.monthly_rate as number;
          const inPHP = p.monthly_rate_currency === 'USD' ? rate * clientUsdRate : rate;
          return s + inPHP;
        }, 0);
      setMonthlyRetainerTotal(retainerTotal);

      // Build due_date map from payment links (latest link per invoice+project)
      const dueDateMap: Record<string, string | null> = {};
      for (const lnk of (linkResult.data as any[]) ?? []) {
        const key = `${lnk.invoice_number}__${lnk.project_id}`;
        if (!(key in dueDateMap)) dueDateMap[key] = lnk.due_date ?? null;
      }
      const outstanding: OutstandingInvoice[] = ((invResult.data as any[]) ?? []).map((inv: any) => ({
        ...inv,
        due_date: dueDateMap[`${inv.invoice_number}__${inv.project_id}`] ?? null,
      }));
      setOutstandingInvoices(outstanding);

      const nextAnnouncements = (annResult.data as HubAnnouncement[]) ?? [];
      const nextRequests = (reqResult.data as HubRequest[]) ?? [];
      const nextTimeOff = (toResult.data as HubTimeOff[]) ?? [];
      setAnnouncements(nextAnnouncements);
      setPendingRequests(nextRequests);
      setPendingTimeOff(nextTimeOff);
      try {
        sessionStorage.setItem('hub_dashboard_cache', JSON.stringify({
          attendance: slackResult.data?.attendance ?? [],
          announcements: nextAnnouncements,
          pendingRequests: nextRequests,
          pendingTimeOff: nextTimeOff,
          birthdays: getBirthdayAlerts(contractorsResult.data || []),
          outstandingInvoices: outstanding,
          totalPayroll: 0, // never cache payroll — always fetch fresh to stay in sync with payroll page
          totalHours: parseFloat(hrs.toFixed(1)),
          totalNetProfit: netProfitTotal,
          totalContractValue: contractValueTotal,
          totalCollected: collectedTotal,
          activeProjectCount: activeCount,
          onTrackCount: onTrack,
          atRiskCount: atRisk,
          internalProjectCount: internalCount,
          monthlyRetainerTotal: retainerTotal,
        }));
      } catch {}
      setLoading(false);
      } catch (err) {
        console.error('Dashboard fetch failed:', err);
        setLoading(false);
      }
    };
    fetchAll();
  }, [isDemo]);

  const counts = {
    on: attendance.filter(r => r.status === 'on').length,
    off: attendance.filter(r => r.status === 'off').length,
    absent: attendance.filter(r => r.status === 'absent').length,
  };

  const annColors: Record<string, string> = {
    urgent: 'bg-red-100 text-red-700', payroll: 'bg-amber-100 text-amber-700',
    meeting: 'bg-sky-100 text-sky-700', holiday: 'bg-green-100 text-green-700',
    policy: 'bg-slate-100 text-[#1c2b3a]', general: 'bg-gray-100 text-gray-600',
  };

  const toColors: Record<string, string> = {
    vacation: 'bg-sky-100 text-sky-700', sick: 'bg-red-100 text-red-700',
    emergency: 'bg-slate-100 text-[#1c2b3a]', unpaid: 'bg-gray-100 text-gray-700',
    other: 'bg-purple-100 text-purple-700',
  };

  const now = useClock();
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const dateStr = today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const phTime = now.toLocaleTimeString('en-US', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit', hour12: true });
  const isNight = hour >= 20 || hour < 5;
  const isMorning = hour >= 5 && hour < 12;
  const isEvening = hour >= 17 && hour < 20;

  if (loading) {
    return (
      <AdminLayout title="Dashboard">
        <div className="flex items-center justify-center h-64">
          <i className="ri-loader-4-line animate-spin text-2xl text-gray-300"></i>
        </div>
      </AdminLayout>
    );
  }

  const onlineList = attendance.filter(r => r.status === 'on');
  const inOfficeList = onlineList.filter(r => !r.work_location || r.work_location === 'in_office');
  const wfhList = onlineList.filter(r => r.work_location === 'wfh');
  const onSiteList = onlineList.filter(r => r.work_location === 'on_site');
  const offList = attendance.filter(r => r.status === 'off');
  const absentList = attendance.filter(r => r.status === 'absent');

  return (
    <AdminLayout title="Dashboard">
      <div className="space-y-4">

        {/* Customize drawer */}
        {showCustomize && (
          <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setShowCustomize(false)}>
            <div className="absolute inset-0 bg-black/30" />
            <div className="relative bg-white w-full max-w-xs h-full shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
                <div>
                  <h3 className="text-sm font-semibold text-[#111827]">Customize Dashboard</h3>
                  <p className="text-xs text-gray-400 mt-0.5">Toggle widgets on or off</p>
                </div>
                <button onClick={() => setShowCustomize(false)} className="text-gray-400 hover:text-gray-600 cursor-pointer">
                  <i className="ri-close-line text-lg"></i>
                </button>
              </div>
              <div className="overflow-y-auto flex-1 px-5 py-4 space-y-2">
                {ALL_WIDGETS.filter(w => !w.ownerOnly || isOwner).map(w => (
                  <button
                    key={w.key}
                    onClick={() => toggleWidget(w.key)}
                    className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-gray-50 transition-colors cursor-pointer text-left"
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${widgetPrefs[w.key] !== false ? 'bg-[#1c2b3a]/10' : 'bg-gray-100'}`}>
                      <i className={`${w.icon} text-sm ${widgetPrefs[w.key] !== false ? 'text-[#1c2b3a]' : 'text-gray-400'}`}></i>
                    </div>
                    <span className={`text-sm flex-1 ${widgetPrefs[w.key] !== false ? 'text-[#111827] font-medium' : 'text-gray-400'}`}>{w.label}</span>
                    <div className={`w-10 h-5 rounded-full transition-colors flex-shrink-0 ${widgetPrefs[w.key] !== false ? 'bg-[#1c2b3a]' : 'bg-gray-200'}`}>
                      <div className={`w-4 h-4 rounded-full bg-white shadow-sm mt-0.5 transition-all ${widgetPrefs[w.key] !== false ? 'ml-5' : 'ml-0.5'}`} />
                    </div>
                  </button>
                ))}
              </div>
              <div className="px-5 pb-5 pt-3 border-t border-gray-100 flex-shrink-0">
                <button
                  onClick={() => {
                    const all: Partial<Record<WidgetKey, boolean>> = {};
                    ALL_WIDGETS.forEach(w => { all[w.key] = true; });
                    const next = all as Record<WidgetKey, boolean>;
                    setWidgetPrefs(next);
                    localStorage.setItem('hub_admin_widgets', JSON.stringify(next));
                  }}
                  className="w-full py-2 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors"
                >
                  Reset to defaults
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Header banner */}
        <div className="bg-[#111827] rounded-2xl p-5 text-white relative overflow-hidden">
          <style>{`
            @keyframes sun-pulse{0%,100%{box-shadow:0 0 24px 10px rgba(255,185,50,0.35)}50%{box-shadow:0 0 42px 20px rgba(255,185,50,0.6)}}
            @keyframes eve-pulse{0%,100%{box-shadow:0 0 24px 10px rgba(249,115,22,0.4)}50%{box-shadow:0 0 42px 20px rgba(249,115,22,0.65)}}
            @keyframes moon-pulse{0%,100%{box-shadow:0 0 18px 7px rgba(180,215,255,0.2)}50%{box-shadow:0 0 32px 14px rgba(180,215,255,0.42)}}
            @keyframes twinkle-a{0%,100%{opacity:.15}50%{opacity:.9}}
            @keyframes twinkle-b{0%,100%{opacity:.6}50%{opacity:.1}}
            @keyframes twinkle-c{0%,100%{opacity:.35}50%{opacity:.85}}
          `}</style>

          {/* Sky + celestial */}
          <div className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none">
            <div className="absolute inset-0" style={{
              background: isNight
                ? 'radial-gradient(ellipse at 78% 18%, rgba(25,35,75,0.9) 0%, transparent 65%)'
                : isEvening
                ? 'radial-gradient(ellipse at 82% 28%, rgba(239,68,68,0.28) 0%, transparent 60%)'
                : isMorning
                ? 'radial-gradient(ellipse at 85% 20%, rgba(255,165,30,0.22) 0%, transparent 58%)'
                : 'radial-gradient(ellipse at 85% 12%, rgba(255,210,50,0.18) 0%, transparent 56%)'
            }} />
            {isNight ? (
              <>
                <div style={{
                  position:'absolute', right:'5%', top:'12%',
                  width:30, height:30, borderRadius:'50%',
                  background:'radial-gradient(circle at 38% 38%, #EEF4FF 0%, #C0D4F0 55%, #90B0D8 100%)',
                  animation:'moon-pulse 4s ease-in-out infinite', overflow:'hidden'
                }}>
                  <div style={{ position:'absolute', right:-5, top:-5, width:28, height:28, borderRadius:'50%', background:'#111827' }} />
                </div>
                {([
                  [8,30,2,'twinkle-a',1.6,0],[14,48,1.5,'twinkle-b',2.3,0.3],[6,62,1,'twinkle-c',1.9,0.6],
                  [18,40,1.5,'twinkle-a',2.6,0.9],[11,22,1,'twinkle-b',1.3,1.2],[22,55,2,'twinkle-c',2.1,0.4],
                  [4,45,1,'twinkle-a',1.7,0.8],[16,28,1.5,'twinkle-b',2.4,1.5],[20,68,1,'twinkle-c',1.5,0.2],
                ] as [number,number,number,string,number,number][]).map(([t,r,s,anim,dur,delay],i) => (
                  <div key={i} style={{
                    position:'absolute', top:`${t}%`, right:`${r}%`,
                    width:s, height:s, borderRadius:'50%', background:'white',
                    animation:`${anim} ${dur}s ease-in-out infinite`,
                    animationDelay:`${delay}s`
                  }} />
                ))}
              </>
            ) : (
              <div style={{
                position:'absolute', right:'5%',
                top: isMorning ? '20%' : isEvening ? '35%' : '10%',
                width:38, height:38, borderRadius:'50%',
                background: isEvening
                  ? 'radial-gradient(circle, #fbbf24 0%, #f97316 50%, #ef4444 100%)'
                  : isMorning
                  ? 'radial-gradient(circle, #FFE566 0%, #FFBB30 55%, #FF9500 100%)'
                  : 'radial-gradient(circle, #FFF176 0%, #FFD740 55%, #FFA000 100%)',
                animation: isEvening ? 'eve-pulse 3s ease-in-out infinite' : 'sun-pulse 3s ease-in-out infinite',
                transition:'top 2s ease'
              }} />
            )}
          </div>

          <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex-1">
              <p className="text-white/50 text-xs mb-1 flex flex-wrap items-center gap-1.5">
                {dateStr}
                <span className="text-white/30">·</span>
                <i className="ri-time-line text-white/40 text-xs"></i>
                <span className="font-mono text-white/60">{phTime}</span>
                <span className="text-white/30 text-[10px]">PH</span>
              </p>
              <h2 className="text-xl font-bold">{greeting}, team.</h2>
              <p className="text-white/60 text-sm mt-1">
                {counts.on > 0 ? `${counts.on} teammate${counts.on > 1 ? 's' : ''} in the office right now.` : 'No one in the office yet today.'}
              </p>
            </div>
            {/* Payroll period card */}
            <div className="bg-white/10 rounded-xl px-4 py-3 w-full sm:w-auto sm:min-w-[200px]">
              <p className="text-white/50 text-xs mb-1">Current Pay Period</p>
              <p className="text-white font-semibold text-sm">
                {currentPeriod.label}
              </p>
              <div className="mt-2 h-1.5 rounded-full bg-white/20 overflow-hidden">
                <div className="h-full bg-[#1c2b3a] rounded-full transition-all" style={{ width: `${periodProgress}%` }} />
              </div>
              <p className="text-white/40 text-xs mt-1.5">
                {daysLeft === 0 ? `Payday: ${paydayLabel}` : `${daysLeft} day${daysLeft > 1 ? 's' : ''} until ${paydayLabel}`}
              </p>
            </div>
          </div>
        </div>

        {/* Birthday alerts — compact pill */}
        {show('birthdays') && birthdays.length > 0 && (
          <div className="flex items-center gap-3 bg-white/60 backdrop-blur-sm border border-white/80 rounded-2xl px-4 py-3 shadow-sm">
            <span className="text-base flex-shrink-0">{birthdays[0].isToday ? '🎂' : '🎁'}</span>
            <div className="flex-1 min-w-0 flex items-center gap-3 flex-wrap">
              {birthdays.map((b) => (
                <div key={b.full_name} className="flex items-center gap-2">
                  <Avatar name={b.full_name} url={b.avatar_url} size={6} />
                  <span className="text-sm font-medium text-gray-700">{b.full_name.split(' ')[0]}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${b.isToday ? 'bg-pink-100 text-pink-600' : 'bg-amber-50 text-amber-600'}`}>
                    {b.isToday ? 'Today 🎉' : b.daysUntil === 1 ? 'Tomorrow' : `In ${b.daysUntil}d`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Outstanding invoices */}
        {show('outstandingInvoices') && isOwnerOrAdmin && outstandingInvoices.length > 0 && (() => {
          const todayMs = new Date().setHours(0, 0, 0, 0);
          const pastDue = outstandingInvoices.filter(inv => {
            if (!inv.due_date) return false;
            const dueMs = new Date(inv.due_date + 'T00:00:00').getTime();
            return todayMs - dueMs >= 3 * 86400000;
          });
          const hasPastDue = pastDue.length > 0;
          return (
            <div className={`rounded-xl border p-4 ${hasPastDue ? 'bg-rose-50 border-rose-200' : 'bg-amber-50 border-amber-100'}`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <i className={`ri-file-list-3-line text-sm ${hasPastDue ? 'text-rose-500' : 'text-amber-600'}`}></i>
                  <p className={`text-sm font-semibold ${hasPastDue ? 'text-rose-700' : 'text-amber-700'}`}>
                    {hasPastDue
                      ? `${pastDue.length} invoice${pastDue.length > 1 ? 's' : ''} past due`
                      : `${outstandingInvoices.length} outstanding invoice${outstandingInvoices.length > 1 ? 's' : ''}`}
                  </p>
                  {hasPastDue && outstandingInvoices.length > pastDue.length && (
                    <span className="text-xs text-rose-400">· {outstandingInvoices.length - pastDue.length} more pending</span>
                  )}
                </div>
                <button onClick={() => navigate('/hub/admin/invoice-log')} className={`text-xs hover:underline cursor-pointer ${hasPastDue ? 'text-rose-600' : 'text-amber-600'}`}>
                  View all →
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {outstandingInvoices.slice(0, 6).map(inv => {
                  const dueMs = inv.due_date ? new Date(inv.due_date + 'T00:00:00').getTime() : null;
                  const daysOverdue = dueMs ? Math.floor((todayMs - dueMs) / 86400000) : null;
                  const isOverdue = daysOverdue != null && daysOverdue >= 3;
                  return (
                    <div key={inv.id} className={`flex items-center gap-2 bg-white rounded-lg px-3 py-2 border shadow-sm ${isOverdue ? 'border-rose-200' : 'border-white'}`}>
                      <div>
                        <p className="text-xs font-semibold text-gray-800">
                          #{inv.invoice_number.padStart(4, '0')} · {inv.project_name}
                        </p>
                        <p className="text-xs text-gray-400">{inv.client_name}{inv.balance ? ` · ₱${inv.balance.toLocaleString('en-PH', { minimumFractionDigits: 2 })}` : ''}</p>
                      </div>
                      {isOverdue && (
                        <span className="text-[10px] font-bold text-rose-600 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded-full whitespace-nowrap flex-shrink-0">
                          {daysOverdue}d overdue
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* KPI row */}
        {show('kpi') && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Working', value: counts.on, icon: 'ri-user-follow-line', color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100' },
              { label: 'Logged Off', value: counts.off, icon: 'ri-user-unfollow-line', color: 'text-gray-500', bg: 'bg-gray-50', border: 'border-gray-100' },
              { label: 'Not In Yet', value: counts.absent, icon: 'ri-time-line', color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100' },
              { label: 'Cutoff Hours', value: `${totalHours}h`, icon: 'ri-bar-chart-2-line', color: 'text-sky-600', bg: 'bg-sky-50', border: 'border-sky-100' },
            ].map((k) => (
              <div key={k.label} className={`bg-white rounded-xl border ${k.border} p-4`}>
                <div className={`w-8 h-8 ${k.bg} rounded-lg flex items-center justify-center mb-3`}>
                  <i className={`${k.icon} ${k.color} text-sm`}></i>
                </div>
                <p className="text-2xl font-bold text-[#111827]">{k.value}</p>
                <p className="text-xs text-gray-400 mt-0.5">{k.label}</p>
              </div>
            ))}
          </div>
        )}

        {(show('teamStatus') || show('payroll') || show('requests') || show('timeOff')) && (
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {/* Team status — 3 cols */}
            {show('teamStatus') && (
              <div className="md:col-span-3 bg-white border border-gray-100 rounded-xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-[#111827] text-sm">Team Status</h3>
                  <button onClick={() => navigate('/hub/admin/attendance')} className="text-xs text-[#1c2b3a] hover:underline cursor-pointer">Full view</button>
                </div>

                {onlineList.length > 0 && (
                  <div className="mb-4 space-y-4">
                    {([
                      { list: inOfficeList, label: 'In Office', dot: 'bg-emerald-500', bg: 'bg-emerald-50/50' },
                      { list: wfhList,      label: 'WFH',       dot: 'bg-sky-400',     bg: 'bg-sky-50/50'     },
                      { list: onSiteList,   label: 'On Site',   dot: 'bg-violet-400',  bg: 'bg-violet-50/50'  },
                    ] as const).filter(g => g.list.length > 0).map(g => (
                      <div key={g.label}>
                        <p className="text-xs text-gray-400 font-medium mb-2 flex items-center gap-1.5">
                          <span className={`w-1.5 h-1.5 rounded-full ${g.dot} inline-block animate-pulse`}></span>
                          {g.label}
                        </p>
                        <div className="space-y-2">
                          {g.list.map(r => (
                            <div key={r.hub_user_id || r.full_name} className={`flex items-center gap-2.5 p-2 rounded-lg ${g.bg}`}>
                              <Avatar name={r.full_name} url={r.avatar_url} size={8} />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-800 truncate">{r.full_name}</p>
                                {r.department && <p className="text-xs text-gray-400">{r.department}</p>}
                              </div>
                              <div className="text-right flex-shrink-0">
                                {r.hours_today > 0 && <p className="text-xs font-medium text-emerald-600">{r.hours_today.toFixed(1)}h today</p>}
                                <p className="text-xs text-gray-400">since {formatTime(r.last_punch)}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {offList.length > 0 && (
                  <div className="mb-4">
                    <p className="text-xs text-gray-400 font-medium mb-2 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-gray-400 inline-block"></span>
                      Logged Off
                    </p>
                    <div className="space-y-2">
                      {offList.map(r => (
                        <div key={r.hub_user_id || r.full_name} className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-gray-50">
                          <Avatar name={r.full_name} url={r.avatar_url} size={8} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-gray-700 truncate">{r.full_name}</p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            {r.hours_today > 0 && <p className="text-xs text-gray-500">{r.hours_today.toFixed(1)}h logged</p>}
                            <p className="text-xs text-gray-400">off at {formatTime(r.last_punch)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {absentList.length > 0 && (
                  <div>
                    <p className="text-xs text-gray-400 font-medium mb-2 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block"></span>
                      Not In Yet
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {absentList.map(r => (
                        <div key={r.hub_user_id || r.full_name} className="flex items-center gap-1.5 bg-amber-50 rounded-lg px-2.5 py-1.5">
                          <Avatar name={r.full_name} url={r.avatar_url} size={5} />
                          <span className="text-xs text-amber-700">{r.full_name.split(' ')[0]}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {attendance.length === 0 && (
                  <p className="text-sm text-gray-400 text-center py-6">No attendance data yet</p>
                )}
              </div>
            )}

            {/* Right col — 2 cols */}
            {(show('payroll') || show('requests') || show('timeOff')) && (
              <div className={`${show('teamStatus') ? 'md:col-span-2' : 'md:col-span-5'} space-y-4`}>
                {show('payroll') && (
                  <div
                    className="rounded-2xl p-4"
                    style={{
                      background: 'rgba(254,215,196,0.95)',
                      backdropFilter: 'blur(16px)',
                      WebkitBackdropFilter: 'blur(16px)',
                      border: '1px solid rgba(255,107,53,0.35)',
                      boxShadow: '0 4px 24px rgba(255,107,53,0.15)',
                    }}
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <i className="ri-money-dollar-circle-line text-[#1c2b3a]/60 text-sm"></i>
                      <p className="text-[#c4522a] text-xs font-medium tracking-wide uppercase">Estimated Payroll</p>
                    </div>
                    <p className="text-2xl font-bold text-[#7a2e10]">₱{totalPayroll.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    <p className="text-[#c4522a]/70 text-xs mt-1">
                      {currentPeriod.label} cutoff
                    </p>
                    <button
                      onClick={() => navigate('/hub/admin/payroll')}
                      className="mt-3 w-full rounded-lg py-1.5 text-xs font-medium transition-colors cursor-pointer text-[#c4522a] hover:bg-[#1c2b3a]/10"
                      style={{ background: 'rgba(255,107,53,0.10)' }}
                    >
                      View Payroll
                    </button>
                  </div>
                )}


                {show('requests') && (
                  <div className="bg-white border border-gray-100 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-semibold text-[#111827] text-sm">
                        Requests
                        {pendingRequests.length > 0 && (
                          <span className="ml-2 text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">{pendingRequests.length}</span>
                        )}
                      </h3>
                      <button onClick={() => navigate('/hub/admin/requests')} className="text-xs text-[#1c2b3a] hover:underline cursor-pointer">View all</button>
                    </div>
                    {pendingRequests.length === 0 ? (
                      <div className="flex items-center gap-2 py-2">
                        <i className="ri-checkbox-circle-line text-emerald-400"></i>
                        <p className="text-sm text-gray-400">All clear</p>
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {pendingRequests.slice(0, 3).map((req) => (
                          <div key={req.id} className="flex items-center gap-2">
                            <Avatar name={(req.hub_users as HubUser)?.full_name || '?'} url={(req.hub_users as HubUser)?.avatar_url || null} size={7} />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-gray-800 truncate">{req.title}</p>
                              <p className="text-xs text-gray-400 capitalize">{req.type.replace('_', ' ')}</p>
                            </div>
                            <span className={`text-xs px-1.5 py-0.5 rounded-full flex-shrink-0 ${req.status === 'open' ? 'bg-amber-100 text-amber-700' : 'bg-sky-100 text-sky-700'}`}>
                              {req.status === 'open' ? 'Open' : 'Review'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {show('timeOff') && (
                  <div className="bg-white border border-gray-100 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-semibold text-[#111827] text-sm">
                        Time-Off
                        {pendingTimeOff.length > 0 && (
                          <span className="ml-2 text-xs bg-sky-100 text-sky-700 px-1.5 py-0.5 rounded-full">{pendingTimeOff.length}</span>
                        )}
                      </h3>
                      <button onClick={() => navigate('/hub/admin/timeoff')} className="text-xs text-[#1c2b3a] hover:underline cursor-pointer">View all</button>
                    </div>
                    {pendingTimeOff.length === 0 ? (
                      <div className="flex items-center gap-2 py-2">
                        <i className="ri-checkbox-circle-line text-emerald-400"></i>
                        <p className="text-sm text-gray-400">No pending</p>
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {pendingTimeOff.slice(0, 3).map((to) => (
                          <div key={to.id} className="flex items-center gap-2">
                            <Avatar name={(to.hub_users as HubUser)?.full_name || '?'} url={(to.hub_users as HubUser)?.avatar_url || null} size={7} />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-gray-800 truncate">{(to.hub_users as HubUser)?.full_name}</p>
                              <p className="text-xs text-gray-400">{to.start_date}{to.start_date !== to.end_date ? ` → ${to.end_date}` : ''}</p>
                            </div>
                            <span className={`text-xs px-1.5 py-0.5 rounded-full flex-shrink-0 capitalize font-medium ${toColors[to.type]}`}>{to.type}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Portfolio Health strip */}
        {show('kpi') && isOwnerOrAdmin && (() => {
          const collectionRate = totalContractValue > 0
            ? Math.min(Math.round((totalCollected / totalContractValue) * 100), 100)
            : 0;
          return (
            <div className="flex items-center gap-4 bg-white/60 backdrop-blur-sm border border-white/80 rounded-2xl px-5 py-3.5 shadow-sm">
              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest flex-shrink-0">Portfolio</span>
              <div className="flex-1 flex items-center gap-6 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0"></span>
                  <span className="text-sm font-semibold text-gray-800">{onTrackCount}</span>
                  <span className="text-xs text-gray-400">on track</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0"></span>
                  <span className="text-sm font-semibold text-gray-800">{atRiskCount}</span>
                  <span className="text-xs text-gray-400">at risk</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-indigo-300 flex-shrink-0"></span>
                  <span className="text-sm font-semibold text-gray-800">{internalProjectCount}</span>
                  <span className="text-xs text-gray-400">internal</span>
                </div>
                <div className="flex items-center gap-2 ml-auto">
                  <span className="text-xs text-gray-400">Collection rate</span>
                  <span className="text-sm font-bold text-gray-800">{collectionRate}%</span>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Announcements + Quick Actions */}
        {(show('announcements') || show('quickActions')) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {show('announcements') && (
              <div className="bg-white border border-gray-100 rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-[#111827] text-sm">Announcements</h3>
                  <button onClick={() => navigate('/hub/admin/announcements')} className="text-xs text-[#1c2b3a] hover:underline cursor-pointer">Manage</button>
                </div>
                {announcements.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-4">No announcements yet</p>
                ) : (
                  <div className="divide-y divide-gray-50">
                    {announcements.map((ann) => (
                      <div key={ann.id} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
                        <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap font-medium flex-shrink-0 mt-0.5 capitalize ${annColors[ann.type]}`}>{ann.type}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{ann.title}</p>
                          <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{ann.body}</p>
                        </div>
                        <p className="text-xs text-gray-400 whitespace-nowrap flex-shrink-0">
                          {new Date(ann.created_at!).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {show('quickActions') && (
              <div className="bg-white border border-gray-100 rounded-xl p-5">
                <h3 className="font-semibold text-[#111827] text-sm mb-3">Quick Actions</h3>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Add Employee', icon: 'ri-user-add-line', path: '/hub/admin/employees', color: 'text-[#1c2b3a]', bg: 'bg-[#1c2b3a]/5 hover:bg-[#1c2b3a]/10' },
                    { label: 'View Attendance', icon: 'ri-time-line', path: '/hub/admin/attendance', color: 'text-sky-600', bg: 'bg-sky-50 hover:bg-sky-100' },
                    { label: 'Post Announcement', icon: 'ri-megaphone-line', path: '/hub/admin/announcements', color: 'text-[#1c2b3a]', bg: 'bg-slate-50 hover:bg-slate-100' },
                    { label: 'Run Payroll', icon: 'ri-money-dollar-circle-line', path: '/hub/admin/payroll', color: 'text-emerald-600', bg: 'bg-emerald-50 hover:bg-emerald-100' },
                  ].map((a) => (
                    <button
                      key={a.label}
                      onClick={() => navigate(a.path)}
                      className={`flex items-center gap-3 p-3 ${a.bg} rounded-xl transition-colors cursor-pointer text-left`}
                    >
                      <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center border border-gray-100 flex-shrink-0">
                        <i className={`${a.icon} ${a.color} text-sm`}></i>
                      </div>
                      <span className="text-sm text-gray-700 font-medium leading-tight">{a.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        {/* Customize dashboard */}
        <div className="flex justify-center pt-2 pb-1">
          <button
            onClick={() => setShowCustomize(true)}
            className="flex items-center gap-1.5 px-4 py-2 text-xs text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
          >
            <i className="ri-layout-grid-line text-sm"></i>
            Customize dashboard
          </button>
        </div>

      </div>
    </AdminLayout>
  );
}
