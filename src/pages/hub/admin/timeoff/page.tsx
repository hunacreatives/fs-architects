import { useEffect, useState } from 'react';
import AdminLayout from '@/pages/hub/components/AdminLayout';
import HubAvatar from '@/pages/hub/components/HubAvatar';
import { useAuth } from '@/contexts/AuthContext';
import { useDemo } from '@/contexts/DemoContext';
import { supabase } from '@/lib/supabase';
import { HubTimeOff, HubUser } from '@/lib/types';
import { logAudit } from '@/lib/audit';
import { DEMO_TIME_OFF } from '@/lib/demoData';
import { fetchUserFinanceMap } from '@/lib/userFinance';
import { isPaidLeaveType } from '@/lib/payrollUtils';

const typeLabels: Record<string, string> = {
  pto: 'Vacation (VL)', vacation: 'Vacation (VL)', sick: 'Sick (SL)',
  birthday: 'Birthday', sil: 'SIL',
  emergency: 'Emergency', unpaid: 'Unpaid',
  maternity: 'Maternity', paternity: 'Paternity',
  solo_parent: 'Solo Parent', women_special: "Women's Special", vawc: 'VAWC',
  other: 'Other',
};
const typeColors: Record<string, string> = {
  pto: 'bg-sky-100 text-sky-700', vacation: 'bg-sky-100 text-sky-700',
  sick: 'bg-rose-100 text-rose-700',
  birthday: 'bg-pink-100 text-pink-700',
  sil: 'bg-teal-100 text-teal-700',
  emergency: 'bg-slate-100 text-[#1c2b3a]',
  unpaid: 'bg-gray-100 text-gray-600',
  maternity: 'bg-purple-100 text-purple-700',
  paternity: 'bg-indigo-100 text-indigo-700',
  solo_parent: 'bg-orange-100 text-orange-700',
  women_special: 'bg-fuchsia-100 text-fuchsia-700',
  vawc: 'bg-rose-100 text-rose-800',
  other: 'bg-purple-100 text-purple-700',
};
const statusColors: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  forwarded: 'bg-purple-100 text-purple-700',
  approved: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-rose-100 text-rose-700',
};
const statusLabels: Record<string, string> = {
  pending: 'Pending', forwarded: 'Forwarded', approved: 'Approved', rejected: 'Rejected',
};

const WEEKDAY_TOKENS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DEFAULT_WORK_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri'];

// Count scheduled work days in an inclusive range, skipping the employee's rest
// days (weekends or whatever their work_days exclude). DOLE leave entitlements are
// measured in working days, so a leave spanning a weekend must not over-deduct.
const workingDaysBetween = (start: string, end: string, workDays?: string[] | null) => {
  const set = new Set((workDays && workDays.length ? workDays : DEFAULT_WORK_DAYS).map((d) => d.toLowerCase()));
  const s = new Date(start + 'T12:00:00');
  const e = new Date(end + 'T12:00:00');
  if (isNaN(s.getTime()) || isNaN(e.getTime()) || e < s) return 0;
  let count = 0;
  for (const d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
    if (set.has(WEEKDAY_TOKENS[d.getDay()])) count++;
  }
  return count;
};

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// Semi-monthly pay periods (1–15, 16–end) a date range touches, as short labels.
const payPeriodsSpanned = (start: string, end: string): string[] => {
  const s = new Date(start + 'T12:00:00');
  const e = new Date(end + 'T12:00:00');
  if (isNaN(s.getTime()) || isNaN(e.getTime()) || e < s) return [];
  const labels: string[] = [];
  const cur = new Date(s.getFullYear(), s.getMonth(), 1);
  while (cur <= e) {
    const y = cur.getFullYear(), m = cur.getMonth();
    const lastDay = new Date(y, m + 1, 0).getDate();
    if (s <= new Date(y, m, 15, 12) && e >= new Date(y, m, 1, 12)) labels.push(`${MONTHS_SHORT[m]} 1–15`);
    if (s <= new Date(y, m, lastDay, 12) && e >= new Date(y, m, 16, 12)) labels.push(`${MONTHS_SHORT[m]} 16–${lastDay}`);
    cur.setMonth(cur.getMonth() + 1);
  }
  return labels;
};

const money = (n: number, currency: string) => `${currency === 'USD' ? '$' : '₱'}${Math.round(n).toLocaleString()}`;

export default function AdminTimeOffPage() {
  const { hubUser } = useAuth();
  const { isDemo } = useDemo();
  const isOwner = isDemo ? true : hubUser?.role === 'owner';

  const [tab, setTab] = useState<'requests' | 'blackouts' | 'balances'>('requests');
  const [balances, setBalances] = useState<any[]>([]);
  const [balancesLoading, setBalancesLoading] = useState(false);
  const [requests, setRequests] = useState<HubTimeOff[]>([]);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<HubTimeOff | null>(null);
  const [modalInfo, setModalInfo] = useState<null | {
    currency: string; dailyRate: number; paid: boolean; estPay: number;
    vlUsed: number; slUsed: number; vlLimit: number; slLimit: number;
    teamOverlap: { name: string; start: string; end: string }[];
    blackout: { reason: string | null; start_date: string; end_date: string } | null;
    periods: string[];
  }>(null);
  const [hrNotes, setHrNotes] = useState('');
  const [updating, setUpdating] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkUpdating, setBulkUpdating] = useState(false);

  // Blackout dates
  const [blackouts, setBlackouts] = useState<any[]>([]);
  const [bdForm, setBdForm] = useState({ start_date: '', end_date: '', reason: '' });
  const [bdSaving, setBdSaving] = useState(false);

  const fetchRequests = async () => {
    setLoading(true);
    let q = supabase
      .from('hub_time_off')
      .select('*, hub_users!contractor_id(full_name, avatar_url, department, start_date, work_days, annual_pto_days, annual_sick_days, currency, payment_type)')
      .order('created_at', { ascending: false });
    if (statusFilter !== 'all') q = q.eq('status', statusFilter);
    const { data } = await q;
    setRequests((data as HubTimeOff[]) ?? []);
    setLoading(false);
  };

  const fetchBlackouts = async () => {
    const { data } = await supabase.from('hub_blackout_dates').select('*').order('start_date');
    setBlackouts(data ?? []);
  };

  const fetchBalances = async () => {
    setBalancesLoading(true);
    const year = new Date().getFullYear();
    const yearStart = `${year}-01-01`;
    const yearEnd = `${year}-12-31`;

    const [usersRes, leavesRes] = await Promise.all([
      supabase.from('hub_users').select('id, full_name, avatar_url, department, start_date, annual_pto_days, annual_sick_days, work_days').eq('status', 'active').eq('role', 'contractor').neq('is_developer', true),
      supabase.from('hub_time_off').select('contractor_id, type, status, start_date, end_date, half_day').gte('start_date', yearStart).lte('start_date', yearEnd).eq('status', 'approved'),
    ]);

    const leavesByUser: Record<string, any[]> = {};
    for (const l of leavesRes.data || []) {
      if (!leavesByUser[l.contractor_id]) leavesByUser[l.contractor_id] = [];
      leavesByUser[l.contractor_id].push(l);
    }

    const result = (usersRes.data || []).map((u: any) => {
      const ptoLimit = u.annual_pto_days ?? 15;
      const sickLimit = u.annual_sick_days ?? 10;
      const leaves = leavesByUser[u.id] || [];
      const ptoUsed = leaves.filter((l: any) => l.type === 'pto' || l.type === 'vacation')
        .reduce((s: number, l: any) => s + (l.half_day ? 0.5 : workingDaysBetween(l.start_date, l.end_date, u.work_days)), 0);
      const sickUsed = leaves.filter((l: any) => l.type === 'sick')
        .reduce((s: number, l: any) => s + (l.half_day ? 0.5 : workingDaysBetween(l.start_date, l.end_date, u.work_days)), 0);
      const ptoEligible = u.start_date
        ? new Date() >= new Date(new Date(u.start_date).setMonth(new Date(u.start_date).getMonth() + 6))
        : false;
      return { ...u, ptoUsed, sickUsed, ptoLimit, sickLimit, ptoLeft: Math.max(0, ptoLimit - ptoUsed), sickLeft: Math.max(0, sickLimit - sickUsed), ptoEligible };
    });

    setBalances(result);
    setBalancesLoading(false);
  };

  useEffect(() => {
    if (isDemo) {
      const filtered = statusFilter === 'all' ? DEMO_TIME_OFF : DEMO_TIME_OFF.filter(r => r.status === statusFilter);
      setRequests(filtered);
      setLoading(false);
      return;
    }
    fetchRequests();
  }, [isDemo, statusFilter]);
  useEffect(() => { fetchBlackouts(); }, []);
  useEffect(() => { if (tab === 'balances') fetchBalances(); }, [tab]);

  const days = (r: HubTimeOff) =>
    r.half_day ? 0.5 : workingDaysBetween(r.start_date, r.end_date, (r.hub_users as any)?.work_days);

  // Load the review-modal context (pay impact, leave balance, blackout & team
  // overlaps) whenever a request is opened.
  useEffect(() => {
    if (!selected) { setModalInfo(null); return; }
    let cancelled = false;
    const u = selected.hub_users as any;
    const cid = selected.contractor_id as string;
    const wd = days(selected);
    const year = new Date(selected.start_date + 'T12:00:00').getFullYear();
    (async () => {
      const [finMap, ownLeaves, teamLeaves] = await Promise.all([
        fetchUserFinanceMap([cid]).catch(() => ({} as any)),
        supabase.from('hub_time_off').select('type, start_date, end_date, half_day')
          .eq('contractor_id', cid).eq('status', 'approved')
          .gte('start_date', `${year}-01-01`).lte('start_date', `${year}-12-31`),
        supabase.from('hub_time_off').select('start_date, end_date, hub_users!contractor_id(full_name)')
          .eq('status', 'approved').neq('contractor_id', cid)
          .lte('start_date', selected.end_date).gte('end_date', selected.start_date),
      ]);
      if (cancelled) return;
      const fin = (finMap as any)[cid] || {};
      const paymentType = fin.payment_type || u?.payment_type || 'hourly';
      const isFixed = paymentType === 'fixed' || paymentType === 'fixed_flexible';
      // Daily rate: fixed → monthly / 22 working days (code uses 176 monthly hrs);
      // hourly → hourly_rate × 8 paid hours.
      const dailyRate = isFixed ? (Number(fin.monthly_rate) || 0) / 22 : (Number(fin.hourly_rate) || 0) * 8;
      const currency = fin.currency || u?.currency || 'PHP';
      let vlUsed = 0, slUsed = 0;
      for (const l of ownLeaves.data || []) {
        const d = l.half_day ? 0.5 : workingDaysBetween(l.start_date, l.end_date, u?.work_days);
        if (l.type === 'pto' || l.type === 'vacation') vlUsed += d;
        else if (l.type === 'sick') slUsed += d;
      }
      const teamOverlap = (teamLeaves.data || []).map((t: any) => ({
        name: t.hub_users?.full_name || 'Someone', start: t.start_date, end: t.end_date,
      }));
      const blackout = (blackouts || []).find((b: any) =>
        selected.start_date <= b.end_date && selected.end_date >= b.start_date) || null;
      setModalInfo({
        currency, dailyRate, paid: isPaidLeaveType(selected.type), estPay: dailyRate * wd,
        vlUsed, slUsed,
        vlLimit: Number(u?.annual_pto_days ?? 15), slLimit: Number(u?.annual_sick_days ?? 10),
        teamOverlap, blackout, periods: payPeriodsSpanned(selected.start_date, selected.end_date),
      });
    })();
    return () => { cancelled = true; };
  }, [selected, blackouts]);

  const openReview = (r: HubTimeOff) => {
    setSelected(r);
    setHrNotes(r.hr_notes || r.admin_notes || '');
  };

  // HR forwards to owner
  const forwardToOwner = async () => {
    if (!selected) return;
    setUpdating(true);
    await supabase.from('hub_time_off').update({
      status: 'forwarded',
      hr_notes: hrNotes,
      admin_notes: hrNotes,
      forwarded_to_owner: true,
    }).eq('id', selected.id);
    logAudit({ actor_id: hubUser?.id, actor_name: hubUser?.full_name, action: 'update', entity_type: 'time_off', entity_id: String(selected.id), description: `Forwarded ${selected.type} request from ${(selected as any).hub_users?.full_name} to owner` });
    setUpdating(false);
    setSelected(null);
    fetchRequests();
  };

  // Owner approves/rejects
  const ownerDecide = async (status: 'approved' | 'rejected') => {
    if (!selected) return;
    setUpdating(true);
    await supabase.from('hub_time_off').update({
      status,
      admin_notes: hrNotes,
      hr_notes: hrNotes,
    }).eq('id', selected.id);
    logAudit({ actor_id: hubUser?.id, actor_name: hubUser?.full_name, action: status === 'approved' ? 'approve' : 'reject', entity_type: 'time_off', entity_id: String(selected.id), description: `${status === 'approved' ? 'Approved' : 'Rejected'} ${selected.type} request from ${(selected as any).hub_users?.full_name} (${selected.start_date} – ${selected.end_date})` });
    if (selected?.contractor_id) {
      supabase.functions.invoke('notify-timeoff-decision', {
        body: {
          contractor_id: selected.contractor_id,
          leave_type: selected.type,
          start_date: selected.start_date,
          end_date: selected.end_date,
          decision: status,
        },
      }).catch(console.error);
    }
    setUpdating(false);
    setSelected(null);
    fetchRequests();
  };

  const addBlackout = async () => {
    if (!bdForm.start_date || !bdForm.end_date) return;
    setBdSaving(true);
    await supabase.from('hub_blackout_dates').insert({
      ...bdForm,
      created_by: hubUser?.id,
    });
    setBdForm({ start_date: '', end_date: '', reason: '' });
    setBdSaving(false);
    fetchBlackouts();
  };

  const deleteBlackout = async (id: number) => {
    await supabase.from('hub_blackout_dates').delete().eq('id', id);
    fetchBlackouts();
  };

  // Non-owners can't finalize in bulk — they forward the selected requests to the
  // owner, mirroring the single-item HR→owner workflow.
  const bulkForward = async () => {
    if (selectedIds.size === 0) return;
    setBulkUpdating(true);
    await supabase.from('hub_time_off')
      .update({ status: 'forwarded', forwarded_to_owner: true })
      .in('id', Array.from(selectedIds));
    logAudit({ actor_id: hubUser?.id, actor_name: hubUser?.full_name, action: 'update', entity_type: 'time_off', description: `Bulk forwarded ${selectedIds.size} leave request(s) to owner` });
    setSelectedIds(new Set());
    setBulkUpdating(false);
    fetchRequests();
  };

  const bulkDecide = async (status: 'approved' | 'rejected') => {
    if (selectedIds.size === 0) return;
    if (!isOwner) return; // safety: only the owner finalizes
    setBulkUpdating(true);
    await supabase.from('hub_time_off').update({ status, admin_notes: null }).in('id', Array.from(selectedIds));
    logAudit({ actor_id: hubUser?.id, actor_name: hubUser?.full_name, action: status === 'approved' ? 'approve' : 'reject', entity_type: 'time_off', description: `Bulk ${status} ${selectedIds.size} leave request(s)` });
    const selectedRequests = requests.filter(r => r.id != null && selectedIds.has(r.id));
    for (const r of selectedRequests) {
      if (r.contractor_id) {
        supabase.functions.invoke('notify-timeoff-decision', {
          body: {
            contractor_id: r.contractor_id,
            leave_type: r.type,
            start_date: r.start_date,
            end_date: r.end_date,
            decision: status,
          },
        }).catch(console.error);
      }
    }
    setSelectedIds(new Set());
    setBulkUpdating(false);
    fetchRequests();
  };

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === requests.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(requests.map(r => r.id!)));
    }
  };

  const filterTabs = ['pending', 'forwarded', 'approved', 'rejected', 'all'];

  return (
    <AdminLayout title="Time Off">
      <div className="space-y-4">

        {/* Tab: Requests / Blackouts / Balances */}
        <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-max sm:w-fit">
          {[{ key: 'requests', label: 'Leave Requests' }, { key: 'blackouts', label: 'Blackout Dates' }, { key: 'balances', label: 'Leave Balances' }].map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key as any)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
                tab === t.key ? 'bg-white text-[#111827] shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        </div>

        {tab === 'requests' && (
          <>
            {/* Status filter */}
            <div className="flex items-center justify-between gap-3">
              <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 flex-1">
                <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-max sm:w-fit">
                  {filterTabs.map((s) => (
                    <button key={s} onClick={() => { setStatusFilter(s); setSelectedIds(new Set()); }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap capitalize ${
                        statusFilter === s ? 'bg-white text-[#111827] shadow-sm' : 'text-gray-500 hover:text-gray-700'
                      }`}>
                      {s === 'all' ? 'All' : statusLabels[s]}
                    </button>
                  ))}
                </div>
              </div>
              <span className="text-xs text-gray-400 flex-shrink-0">{requests.length} request{requests.length !== 1 ? 's' : ''}</span>
            </div>

            {/* Bulk action bar */}
            {selectedIds.size > 0 && (
              <div className="flex items-center gap-3 px-4 py-2.5 bg-[#111827] rounded-xl">
                <span className="text-xs text-white/60 flex-1">{selectedIds.size} selected</span>
                {isOwner ? (
                  <>
                    <button onClick={() => bulkDecide('approved')} disabled={bulkUpdating}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 disabled:opacity-50 cursor-pointer transition-colors">
                      <i className="ri-check-line"></i> Approve All
                    </button>
                    <button onClick={() => bulkDecide('rejected')} disabled={bulkUpdating}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-rose-500 text-white rounded-lg hover:bg-rose-600 disabled:opacity-50 cursor-pointer transition-colors">
                      <i className="ri-close-line"></i> Reject All
                    </button>
                  </>
                ) : (
                  <button onClick={bulkForward} disabled={bulkUpdating}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-purple-500 text-white rounded-lg hover:bg-purple-600 disabled:opacity-50 cursor-pointer transition-colors">
                    <i className="ri-send-plane-line"></i> Forward All to Owner
                  </button>
                )}
                <button onClick={() => setSelectedIds(new Set())} className="text-white/40 hover:text-white cursor-pointer transition-colors">
                  <i className="ri-close-line text-sm"></i>
                </button>
              </div>
            )}

            {/* Forwarded banner for owner */}
            {isOwner && statusFilter !== 'forwarded' && requests.filter((r) => r.status === 'forwarded').length > 0 && (
              <div
                className="flex items-center justify-between p-3 bg-purple-50 border border-purple-100 rounded-xl cursor-pointer"
                onClick={() => setStatusFilter('forwarded')}
              >
                <div className="flex items-center gap-2">
                  <i className="ri-send-plane-line text-purple-500 text-sm"></i>
                  <p className="text-xs font-medium text-purple-700">
                    {requests.filter((r) => r.status === 'forwarded').length} request{requests.filter((r) => r.status === 'forwarded').length !== 1 ? 's' : ''} forwarded to you for approval
                  </p>
                </div>
                <span className="text-xs text-purple-500 font-medium">Review →</span>
              </div>
            )}

            {loading ? (
              <div className="flex justify-center py-12"><i className="ri-loader-4-line animate-spin text-xl text-gray-400"></i></div>
            ) : requests.length === 0 ? (
              <div className="bg-white border border-gray-100 rounded-xl p-10 text-center">
                <i className="ri-calendar-check-line text-3xl text-gray-200 mb-2 block"></i>
                <p className="text-sm text-gray-400">No {statusFilter !== 'all' ? statusFilter : ''} requests</p>
              </div>
            ) : (
              <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="px-4 py-3 w-8">
                        <input type="checkbox" checked={requests.length > 0 && selectedIds.size === requests.length} onChange={toggleSelectAll} className="cursor-pointer" />
                      </th>
                      {['Employee', 'Type', 'Dates', 'Days', 'Status', 'Filed', ''].map((h) => (
                        <th key={h} className="text-left text-xs font-medium text-gray-400 px-4 py-3">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {requests.map((r) => {
                      const u = r.hub_users as HubUser;
                      return (
                        <tr key={r.id} className={`hover:bg-gray-50/50 transition-colors ${selectedIds.has(r.id!) ? 'bg-slate-50/50' : ''}`}>
                          <td className="px-4 py-3.5 w-8">
                            <input type="checkbox" checked={selectedIds.has(r.id!)} onChange={() => toggleSelect(r.id!)} className="cursor-pointer" />
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-2.5">
                              <HubAvatar fullName={u?.full_name || '?'} avatarUrl={u?.avatar_url ?? null} size="w-7 h-7" />
                              <div>
                                <p className="text-sm font-medium text-[#111827]">{u?.full_name}</p>
                                <p className="text-xs text-gray-400">{u?.department}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3.5">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${typeColors[r.type] || 'bg-gray-100 text-gray-600'}`}>
                              {typeLabels[r.type] || r.type}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 text-sm text-gray-600 whitespace-nowrap">
                            {new Date(r.start_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            {!r.half_day && r.start_date !== r.end_date && (
                              <> – {new Date(r.end_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</>
                            )}
                          </td>
                          <td className="px-4 py-3.5 text-sm text-gray-600">
                            {r.half_day ? '½' : `${days(r)}d`}
                          </td>
                          <td className="px-4 py-3.5">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[r.status]}`}>
                              {statusLabels[r.status] || r.status}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 text-xs text-gray-400 whitespace-nowrap">
                            {new Date(r.created_at!).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3.5">
                            <button onClick={() => openReview(r)}
                              className="text-xs text-gray-500 hover:text-[#1c2b3a] cursor-pointer transition-colors font-medium whitespace-nowrap">
                              {r.status === 'forwarded' && isOwner ? 'Decide' : 'Review'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                </div>
              </div>
            )}
          </>
        )}

        {tab === 'blackouts' && (
          <div className="space-y-4">
            {/* Add blackout */}
            <div className="bg-white border border-gray-100 rounded-xl p-5 space-y-4">
              <h3 className="text-sm font-semibold text-[#111827]">Add Blackout Period</h3>
              <p className="text-xs text-gray-400">Employees cannot file PTO or sick leave during blackout dates. Emergencies are exempt.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-700">Start Date</label>
                  <input type="date" value={bdForm.start_date} onChange={(e) => setBdForm({ ...bdForm, start_date: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-700">End Date</label>
                  <input type="date" value={bdForm.end_date} min={bdForm.start_date} onChange={(e) => setBdForm({ ...bdForm, end_date: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]" />
                </div>
                <div className="col-span-1 sm:col-span-2 space-y-1">
                  <label className="text-xs font-medium text-gray-700">Reason <span className="text-gray-400 font-normal">(shown to employees)</span></label>
                  <input value={bdForm.reason} onChange={(e) => setBdForm({ ...bdForm, reason: e.target.value })}
                    placeholder="e.g. Client launch period, Q4 crunch"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]" />
                </div>
              </div>
              <button onClick={addBlackout} disabled={bdSaving || !bdForm.start_date || !bdForm.end_date}
                className="px-4 py-2 text-sm bg-[#111827] text-white rounded-lg hover:bg-gray-800 disabled:opacity-40 cursor-pointer transition-colors whitespace-nowrap">
                {bdSaving ? 'Adding...' : 'Add Blackout Period'}
              </button>
            </div>

            {/* Blackout list */}
            {blackouts.length === 0 ? (
              <div className="bg-white border border-gray-100 rounded-xl p-8 text-center">
                <i className="ri-calendar-close-line text-3xl text-gray-200 mb-2 block"></i>
                <p className="text-sm text-gray-400">No blackout dates set</p>
              </div>
            ) : (
              <div className="space-y-2">
                {blackouts.map((b) => (
                  <div key={b.id} className="bg-white border border-gray-100 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-[#111827]">
                        {new Date(b.start_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – {new Date(b.end_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                      {b.reason && <p className="text-xs text-gray-400 mt-0.5">{b.reason}</p>}
                    </div>
                    <button onClick={() => deleteBlackout(b.id)}
                      className="text-gray-300 hover:text-rose-400 transition-colors cursor-pointer flex-shrink-0">
                      <i className="ri-delete-bin-line text-sm"></i>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'balances' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-400">Leave balances for {new Date().getFullYear()} · approved requests only</p>
              <button onClick={fetchBalances} className="text-xs text-gray-400 hover:text-gray-600 cursor-pointer flex items-center gap-1">
                <i className="ri-refresh-line text-xs"></i> Refresh
              </button>
            </div>
            {balancesLoading ? (
              <div className="flex justify-center py-10"><i className="ri-loader-4-line animate-spin text-xl text-gray-400"></i></div>
            ) : balances.length === 0 ? (
              <div className="bg-white border border-gray-100 rounded-xl p-10 text-center">
                <i className="ri-user-line text-3xl text-gray-200 mb-2 block"></i>
                <p className="text-sm text-gray-400">No active employees found</p>
              </div>
            ) : (
              <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      {['Employee', 'VL Used', 'VL Left', 'SL Used', 'SL Left', 'Eligibility'].map(h => (
                        <th key={h} className="text-left text-xs font-medium text-gray-400 px-4 py-3">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {balances.map((b) => (
                      <tr key={b.id} className="hover:bg-gray-50/50">
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <HubAvatar fullName={b.full_name || '?'} avatarUrl={b.avatar_url ?? null} size="w-7 h-7" />
                            <div>
                              <p className="text-sm font-medium text-[#111827]">{b.full_name}</p>
                              {b.department && <p className="text-xs text-gray-400">{b.department}</p>}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2">
                            <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div className="h-full bg-sky-400 rounded-full" style={{ width: `${Math.min(100, (b.ptoUsed / b.ptoLimit) * 100)}%` }} />
                            </div>
                            <span className="text-xs text-gray-600">{b.ptoUsed}<span className="text-gray-400">/{b.ptoLimit}</span></span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className={`text-sm font-semibold ${b.ptoLeft === 0 ? 'text-gray-300' : 'text-sky-600'}`}>{b.ptoLeft}d</span>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div className="h-full bg-rose-400 rounded-full" style={{ width: `${Math.min(100, (b.sickUsed / b.sickLimit) * 100)}%` }} />
                            </div>
                            <span className="text-xs text-gray-600">{b.sickUsed}<span className="text-gray-400">/{b.sickLimit}</span></span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className={`text-sm font-semibold ${b.sickLeft === 0 ? 'text-gray-300' : 'text-rose-600'}`}>{b.sickLeft}d</span>
                        </td>
                        <td className="px-4 py-3.5">
                          {b.ptoEligible ? (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">Eligible</span>
                          ) : (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">Not yet</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Review modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div>
                <h2 className="font-semibold text-[#111827]">{(selected.hub_users as HubUser)?.full_name}</h2>
                <p className="text-xs text-gray-400 mt-0.5">{typeLabels[selected.type] || selected.type} · {days(selected) === 0.5 ? 'Half day' : `${days(selected)} day${days(selected) !== 1 ? 's' : ''}`}</p>
              </div>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 cursor-pointer w-7 h-7 flex items-center justify-center">
                <i className="ri-close-line text-lg"></i>
              </button>
            </div>
            <div className="p-5 space-y-4">
              {/* Dates */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-400 mb-1">Start</p>
                  <p className="text-sm font-medium text-[#111827]">
                    {new Date(selected.start_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    {selected.half_day && <span className="block text-xs text-gray-400 font-normal capitalize">{selected.half_day_period}</span>}
                  </p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-400 mb-1">{selected.half_day ? 'Type' : 'End'}</p>
                  <p className="text-sm font-medium text-[#111827]">
                    {selected.half_day ? 'Half day' : new Date(selected.end_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
              </div>

              <div className="flex gap-2 flex-wrap">
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${typeColors[selected.type]}`}>{typeLabels[selected.type] || selected.type}</span>
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColors[selected.status]}`}>{statusLabels[selected.status]}</span>
              </div>

              {/* Decision context: payroll impact, balance, conflicts */}
              {modalInfo && (
                <div className="space-y-2">
                  {/* Payroll impact */}
                  <div className={`rounded-lg p-3 border ${modalInfo.paid ? 'bg-emerald-50 border-emerald-100' : 'bg-amber-50 border-amber-100'}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-gray-700">
                        <i className={`mr-1 ${modalInfo.paid ? 'ri-money-dollar-circle-line text-emerald-500' : 'ri-error-warning-line text-amber-500'}`}></i>
                        {modalInfo.paid ? 'Paid leave' : 'Unpaid leave'}
                      </span>
                      {modalInfo.dailyRate > 0 && (
                        <span className={`text-xs font-bold ${modalInfo.paid ? 'text-emerald-700' : 'text-amber-700'}`}>
                          ≈ {money(modalInfo.estPay, modalInfo.currency)} {modalInfo.paid ? 'paid' : 'deducted'}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-gray-500 mt-1">
                      {days(selected)} working day{days(selected) !== 1 ? 's' : ''}
                      {modalInfo.dailyRate > 0 ? ` (≈ ${money(modalInfo.dailyRate, modalInfo.currency)}/day)` : ''}
                      {modalInfo.paid ? ' — paid as normal, reflected automatically in payroll.' : ' — not paid; reduces pay for the period.'}
                      {modalInfo.periods.length > 0 && ` Pay period${modalInfo.periods.length > 1 ? 's' : ''}: ${modalInfo.periods.join(', ')}.`}
                    </p>
                  </div>

                  {/* VL / SL balance */}
                  {(selected.type === 'pto' || selected.type === 'vacation' || selected.type === 'sick') && (() => {
                    const isVL = selected.type !== 'sick';
                    const used = isVL ? modalInfo.vlUsed : modalInfo.slUsed;
                    const limit = isVL ? modalInfo.vlLimit : modalInfo.slLimit;
                    const after = limit - used - days(selected);
                    const over = after < 0;
                    return (
                      <div className={`rounded-lg p-3 border ${over ? 'bg-rose-50 border-rose-100' : 'bg-gray-50 border-gray-100'}`}>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-gray-600">{isVL ? 'Vacation (VL)' : 'Sick (SL)'} balance</span>
                          <span className={`font-semibold ${over ? 'text-rose-700' : 'text-gray-800'}`}>
                            {Math.max(0, limit - used)} of {limit} left → {after} after
                          </span>
                        </div>
                        {over && <p className="text-[11px] text-rose-600 mt-1">Exceeds their remaining balance by {Math.abs(after)} day{Math.abs(after) !== 1 ? 's' : ''}.</p>}
                      </div>
                    );
                  })()}

                  {/* Blackout overlap */}
                  {modalInfo.blackout && (
                    <div className="rounded-lg p-3 bg-rose-50 border border-rose-100">
                      <p className="text-xs text-rose-700"><i className="ri-calendar-close-line mr-1"></i>Overlaps a blackout period{modalInfo.blackout.reason ? `: "${modalInfo.blackout.reason}"` : ''}.</p>
                    </div>
                  )}

                  {/* Team overlap */}
                  {modalInfo.teamOverlap.length > 0 && (
                    <div className="rounded-lg p-3 bg-amber-50 border border-amber-100">
                      <p className="text-xs text-amber-700">
                        <i className="ri-team-line mr-1"></i>
                        {modalInfo.teamOverlap.length} other{modalInfo.teamOverlap.length > 1 ? 's' : ''} off on overlapping dates: {modalInfo.teamOverlap.slice(0, 4).map((t) => t.name).join(', ')}{modalInfo.teamOverlap.length > 4 ? '…' : ''}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {selected.reason && (
                <div>
                  <p className="text-xs font-medium text-gray-700 mb-1">Employee's Reason</p>
                  <p className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3">{selected.reason}</p>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-700">
                  {isOwner ? 'Notes (visible to employee)' : 'HR Notes (forwarded to owner)'}
                </label>
                <textarea value={hrNotes} onChange={(e) => setHrNotes(e.target.value)} rows={3}
                  placeholder={isOwner ? 'Add notes for the employee...' : 'Add notes before forwarding to owner...'}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a] resize-none" />
              </div>

              {/* Action buttons based on role + status */}
              {isOwner ? (
                // Owner can approve/reject forwarded requests
                <div className="flex gap-2">
                  <button onClick={() => ownerDecide('approved')} disabled={updating || selected.status === 'approved'}
                    className="flex-1 py-2.5 text-sm bg-emerald-500 text-white rounded-lg font-medium hover:bg-emerald-600 disabled:opacity-40 cursor-pointer transition-colors whitespace-nowrap">
                    Approve
                  </button>
                  <button onClick={() => ownerDecide('rejected')} disabled={updating || selected.status === 'rejected'}
                    className="flex-1 py-2.5 text-sm bg-rose-500 text-white rounded-lg font-medium hover:bg-rose-600 disabled:opacity-40 cursor-pointer transition-colors whitespace-nowrap">
                    Reject
                  </button>
                </div>
              ) : (
                // HR/Admin forwards to owner
                <div className="space-y-2">
                  {selected.status === 'forwarded' ? (
                    <div className="flex items-center gap-2 p-3 bg-purple-50 border border-purple-100 rounded-lg">
                      <i className="ri-check-line text-purple-500 text-sm"></i>
                      <p className="text-xs text-purple-700">Forwarded to owner for final approval.</p>
                    </div>
                  ) : (
                    <button onClick={forwardToOwner} disabled={updating}
                      className="w-full py-2.5 text-sm bg-[#111827] text-white rounded-lg font-medium hover:bg-gray-800 disabled:opacity-40 cursor-pointer transition-colors flex items-center justify-center gap-2 whitespace-nowrap">
                      <i className="ri-send-plane-line text-sm"></i>
                      Forward to Owner for Approval
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
