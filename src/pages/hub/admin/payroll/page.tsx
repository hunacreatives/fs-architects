import { useState, useEffect, Fragment } from 'react';
import html2canvas from 'html2canvas';
import AdminLayout from '@/pages/hub/components/AdminLayout';
import HubAvatar from '@/pages/hub/components/HubAvatar';
import { supabase } from '@/lib/supabase';
import { useHubAuth as useAuth } from '@/hooks/useHubAuth';
import { useDemo } from '@/contexts/DemoContext';
import { FULL_MONTHS, getPeriods, fmtCurrency as fmt, getNextPayrollCutoff, localToday } from '@/lib/formatUtils';
import { logAudit } from '@/lib/audit';
import { getSetting, setSetting } from '@/lib/settings';
import { fetchUserFinanceMap, mergeFinance } from '@/lib/userFinance';
import { DEMO_PAYOUTS, DEMO_CONTRACTORS } from '@/lib/demoData';
import { computeFixedAccrual, computeSplitFixedAccrual, isAutoPayrollUser, mergeLiveAttendanceIntoDailyHours, computeOTPayFromDates, computeSplitOTPayFromDates, getOTMultiplier, computeLeaveHoursByDate } from '@/lib/payrollUtils';

interface Contractor {
  id: string;
  full_name: string;
  role?: string | null;
  avatar_url: string | null;
  department: string | null;
  currency: string;
  payment_type: 'hourly' | 'fixed' | 'fixed_flexible';
  hourly_rate: number | null;
  monthly_rate: number | null;
  start_date: string | null;
  work_days: string[] | null;
  payment_method?: string | null;
  bank_name?: string | null;
  bank_account_name?: string | null;
  bank_account_number?: string | null;
  bank_account_type?: string | null;
}

interface RateEntry {
  effective_date: string;
  payment_type: string;
  hourly_rate: number | null;
  monthly_rate: number | null;
}

interface DayHours {
  date: string;
  billed: number;          // hours_capped — what they're paid for
  raw: number;             // hours_raw — actual clocked time (basis for undertime flag)
  overtime: number;        // overtime_hours
  manual: boolean;         // is_manual — admin manually corrected this day
  leaveType?: string;      // set when this day is paid leave (pto, sick, …)
}

interface PayRow {
  contractor: Contractor;
  hours: number;
  cappedHours: number;
  overtimeHours: number;
  overtimePay: number;
  derivedHourlyRate: number;
  pay: number;
  payOriginalCurrency?: number;
  days: number;
  dailyBreakdown: DayHours[];
  prorated: boolean;
  proratedNote?: string;
  accruing?: boolean;
  accrualDays?: number;
  accrualTotal?: number;
}

// A scheduled day is "undertime" when fewer than 9 raw hours were clocked
// (handbook: 9h = 8h paid + 1h unpaid lunch). Matches the undertime-alert job.
const UNDERTIME_THRESHOLD_HOURS = 9;

function Avatar({ name, avatar_url }: { name: string; avatar_url: string | null }) {
  return <HubAvatar fullName={name} avatarUrl={avatar_url} size="w-8 h-8" />;
}

// "2026-06-18" → "Wed, Jun 18"
const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function formatDayLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  const [, m, day] = dateStr.split('-');
  return `${DAY_ABBR[d.getDay()]}, ${MONTH_ABBR[Number(m) - 1]} ${Number(day)}`;
}

// Short labels for paid-leave types shown as a badge in the daily breakdown.
const LEAVE_TYPE_LABELS: Record<string, string> = {
  pto: 'Vacation', vacation: 'Vacation', sick: 'Sick', birthday: 'Birthday',
  sil: 'SIL', emergency: 'Emergency', maternity: 'Maternity', paternity: 'Paternity',
  solo_parent: 'Solo Parent', women_special: 'Special (Women)', vawc: 'VAWC', other: 'Leave',
};

// Per-day hours breakdown shown when a payroll row is expanded. Days under the
// 9h raw-clocked threshold are flagged amber to match the undertime alert; paid
// leave days are shown in green and never flagged.
function DailyBreakdownPanel({ days }: { days: DayHours[] }) {
  if (days.length === 0) {
    return <p className="text-xs text-gray-400 py-2">No daily hours logged this period.</p>;
  }
  return (
    <div className="space-y-1">
      {days.map((d) => {
        const onLeave = !!d.leaveType;
        // Leave and manually-corrected days are treated as reviewed — not undertime.
        const undertime = d.raw < UNDERTIME_THRESHOLD_HOURS && !d.manual && !onLeave;
        const rowBg = onLeave ? 'bg-emerald-50' : undertime ? 'bg-amber-50' : 'bg-gray-50';
        const labelColor = onLeave ? 'text-emerald-700' : undertime ? 'text-amber-700' : 'text-gray-600';
        return (
          <div
            key={d.date}
            className={`flex items-center justify-between text-xs px-2.5 py-1.5 rounded-md ${rowBg}`}
          >
            <span className={`font-medium flex items-center gap-1 ${labelColor}`}>
              {formatDayLabel(d.date)}
              {undertime && <i className="ri-error-warning-line text-amber-500" title={`Under ${UNDERTIME_THRESHOLD_HOURS}h clocked`}></i>}
              {onLeave && <span className="text-[9px] px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded-full font-medium" title="Approved paid leave — credited as a paid day"><i className="ri-calendar-check-line text-[9px] mr-0.5"></i>{LEAVE_TYPE_LABELS[d.leaveType!] || 'Leave'}</span>}
              {d.manual && !onLeave && <span className="text-[9px] px-1.5 py-0.5 bg-sky-50 text-sky-600 rounded-full font-medium" title="Manually corrected by an admin"><i className="ri-pencil-line text-[9px] mr-0.5"></i>corrected</span>}
            </span>
            <span className="flex items-center gap-2 tabular-nums">
              <span className={onLeave ? 'text-emerald-700 font-semibold' : undertime ? 'text-amber-700 font-semibold' : 'text-gray-700'}>{d.billed.toFixed(1)}h{onLeave ? ' paid' : ''}</span>
              {d.overtime > 0 && <span className="text-amber-600 font-medium">+{d.overtime.toFixed(1)} OT</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function uint8ToBase64(bytes: Uint8Array) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

// Rest day = a weekday NOT in the contractor's work_days. Falls back to Sat/Sun
// when work_days isn't set. Used to default the is_rest_day flag for OT entries.
const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function isRestDayFor(dateStr: string, workDays: string[] | null | undefined): boolean {
  const day = DAY_ABBR[new Date(dateStr + 'T12:00:00').getDay()];
  if (workDays && workDays.length > 0) return !workDays.includes(day);
  return day === 'Sat' || day === 'Sun';
}

function dataUrlToUint8Array(dataUrl: string) {
  const base64 = dataUrl.split(',')[1] || '';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function concatUint8Arrays(parts: Uint8Array[]) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function buildPdfFromJpeg(jpegBytes: Uint8Array, imageWidth: number, imageHeight: number, landscape = false) {
  const encoder = new TextEncoder();
  // US Letter: 612×792 portrait, swapped for landscape.
  const pageWidth = landscape ? 792 : 612;
  const pageHeight = landscape ? 612 : 792;
  const margin = 36;
  const maxWidth = pageWidth - margin * 2;
  const maxHeight = pageHeight - margin * 2;
  const scale = Math.min(maxWidth / imageWidth, maxHeight / imageHeight);
  const drawWidth = imageWidth * scale;
  const drawHeight = imageHeight * scale;
  const x = (pageWidth - drawWidth) / 2;
  const y = pageHeight - margin - drawHeight;
  const content = `q\n${drawWidth.toFixed(2)} 0 0 ${drawHeight.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm\n/Im0 Do\nQ`;

  const objects: Uint8Array[] = [
    encoder.encode('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n'),
    encoder.encode('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n'),
    encoder.encode(`3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`),
    concatUint8Arrays([
      encoder.encode(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${Math.round(imageWidth)} /Height ${Math.round(imageHeight)} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`),
      jpegBytes,
      encoder.encode('\nendstream\nendobj\n'),
    ]),
    encoder.encode(`5 0 obj\n<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`),
  ];

  const header = encoder.encode('%PDF-1.4\n%FFFF\n');
  let offset = header.length;
  const offsets = [0];
  for (const object of objects) {
    offsets.push(offset);
    offset += object.length;
  }
  const xrefOffset = offset;
  const xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((entry) => `${String(entry).padStart(10, '0')} 00000 n `).join('\n')}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return concatUint8Arrays([header, ...objects, encoder.encode(xref)]);
}

export default function AdminPayrollPage() {
  const { hubUser } = useAuth();
  const { isDemo } = useDemo();
  const isOwner = isDemo ? true : (hubUser as any)?.role === 'owner';

  const periods = getPeriods();
  const lastPeriod = periods[periods.length - 1];

  const years = [...new Set(periods.map(p => p.start.slice(0, 4)))];
  const [selectedYear, setSelectedYear] = useState(lastPeriod.start.slice(0, 4));
  const [closedPeriods, setClosedPeriods] = useState<Set<string>>(new Set());

  const monthsInYear = [...new Set(
    periods.filter(p => p.start.startsWith(selectedYear))
      .map(p => p.start.slice(0, 7))
  )];
  const [selectedMonth, setSelectedMonth] = useState(lastPeriod.start.slice(0, 7));

  const periodsInMonth = periods.filter(p => p.start.startsWith(selectedMonth));
  const openPeriodsInMonth = periodsInMonth.filter(p => !closedPeriods.has(p.start));
  const archivedPeriodsInMonth = periodsInMonth.filter(p => closedPeriods.has(p.start));
  const [selectedPeriod, setSelectedPeriod] = useState(lastPeriod);

  const [rows, setRows] = useState<PayRow[]>([]);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const toggleRowExpanded = (id: string) =>
    setExpandedRows((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const [loading, setLoading] = useState(true);
  const [payrollError, setPayrollError] = useState<string | null>(null);
  const [usdRate, setUsdRate] = useState<number>(56);

  // Load closed periods once on mount
  useEffect(() => {
    supabase.from('hub_payroll_batches').select('period_start').eq('status', 'closed')
      .then(({ data }) => { if (data) setClosedPeriods(new Set(data.map((b: any) => b.period_start))); });
  }, []);

  useEffect(() => {
    getSetting('usd_rate', '56').then(v => setUsdRate(parseFloat(v)));
  }, []);

  // Payout workflow state
  const [payoutsMap, setPayoutsMap] = useState<Record<string, any>>({});
  const [batch, setBatch] = useState<any>(null);
  const [workflowLoading, setWorkflowLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);
  // Owner "approve transfer" modal with optional proof-of-transfer screenshot.
  const [approveProofOpen, setApproveProofOpen] = useState(false);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [approvingTransfer, setApprovingTransfer] = useState(false);

  // Hourly contractor fund transfer requests (separate from bi-monthly payroll)

  // Disputes map: payout_id → dispute
  const [disputesMap, setDisputesMap] = useState<Record<string, any>>({});
  // Notes input per dispute (dispute_id → note text)
  const [disputeNotesMap, setDisputeNotesMap] = useState<Record<string, string>>({});

  // Row edit overrides (before approval)
  const [bankInfoContractor, setBankInfoContractor] = useState<Contractor | null>(null);
  const [editRowId, setEditRowId] = useState<string | null>(null);
  const [editHours, setEditHours] = useState('');
  const [editPay, setEditPay] = useState('');
  const [editOTEntries, setEditOTEntries] = useState<{ id?: string; date: string; hours: number; is_rest_day: boolean; toDelete?: boolean }[]>([]);
  const [editOTNewDate, setEditOTNewDate] = useState('');
  const [editOTNewHours, setEditOTNewHours] = useState('');
  const [editOTNewRestDay, setEditOTNewRestDay] = useState(false);
  const [rowOverrides, setRowOverrides] = useState<Record<string, { hours?: number; pay?: number; days?: number; overtimeHours?: number; proratedNote?: string }>>({});
  const [editAdjItems, setEditAdjItems] = useState<{ label: string; amount: number; type: string }[]>([]);
  const [editAdjLabel, setEditAdjLabel] = useState('');
  const [editAdjAmount, setEditAdjAmount] = useState('');
  const [editAdjType, setEditAdjType] = useState('bonus');
  const [editAdjSign, setEditAdjSign] = useState<'+' | '-'>('+');
  const [editSaving, setEditSaving] = useState(false);

  const ADJ_TYPES = [
    { value: 'bonus', label: 'Bonus' },
    { value: 'referral', label: 'Referral Fee' },
    { value: 'reimbursement', label: 'Reimbursement' },
    { value: 'allowance', label: 'Allowance' },
    { value: 'deduction', label: 'Deduction' },
    { value: 'other', label: 'Other' },
  ];

  const isAutoPayrollContractor = (contractor: Contractor) => isAutoPayrollUser(contractor);

  const openEditRow = async (r: PayRow) => {
    const override = rowOverrides[r.contractor.id];
    const p = payoutsMap[r.contractor.id];
    setEditHours(String(override?.hours ?? r.cappedHours));
    setEditPay(String(override?.pay !== undefined ? override.pay : parseFloat(r.pay.toFixed(2))));
    setEditAdjItems((p?.adjustments || []).map((a: any) => ({ ...a, type: a.type || 'other' })));
    setEditAdjLabel('');
    setEditAdjAmount('');
    setEditAdjType('bonus');
    setEditAdjSign('+');
    setEditOTNewDate('');
    setEditOTNewHours('');
    setEditOTNewRestDay(false);
    setEditRowId(r.contractor.id);
    const [{ data: otReqs }, { data: dailyHrs }] = await Promise.all([
      supabase
        .from('hub_overtime_requests')
        .select('id, date, hours, is_rest_day')
        .eq('contractor_id', r.contractor.id)
        .eq('status', 'approved')
        .gte('date', selectedPeriod.start)
        .lte('date', selectedPeriod.end)
        .order('date', { ascending: true }),
      supabase
        .from('hub_daily_hours')
        .select('date, overtime_hours')
        .eq('user_id', r.contractor.id)
        .gt('overtime_hours', 0)
        .gte('date', selectedPeriod.start)
        .lte('date', selectedPeriod.end),
    ]);
    const entries = (otReqs || []).map((e: any) => ({
      id: e.id,
      date: e.date,
      hours: e.hours,
      is_rest_day: e.is_rest_day ?? isRestDayFor(e.date, r.contractor.work_days),
    }));
    // Surface legacy OT hours that live only in hub_daily_hours (pre-dating the
    // per-date request flow) as untracked entries so admins can review/clear them
    // instead of them silently inflating the displayed hours total.
    const trackedDates = new Set(entries.map(e => e.date));
    for (const dh of dailyHrs || []) {
      if (!trackedDates.has(dh.date) && dh.overtime_hours > 0) {
        entries.push({
          id: undefined,
          date: dh.date,
          hours: dh.overtime_hours,
          is_rest_day: isRestDayFor(dh.date, r.contractor.work_days),
        });
      }
    }
    entries.sort((a, b) => a.date.localeCompare(b.date));
    setEditOTEntries(entries);
  };

  const addEditAdjItem = () => {
    const amt = parseFloat(editAdjAmount);
    if (isNaN(amt)) return;
    const label = editAdjLabel.trim() || ADJ_TYPES.find(t => t.value === editAdjType)?.label || editAdjType;
    const signedAmt = editAdjSign === '-' ? -Math.abs(amt) : Math.abs(amt);
    setEditAdjItems(prev => [...prev, { label, amount: signedAmt, type: editAdjType }]);
    setEditAdjLabel('');
    setEditAdjAmount('');
    setEditAdjSign('+');
  };

  const saveEditRow = async (contractorId: string) => {
    setEditSaving(true);

    // Auto-flush any unsaved adj item in the input fields
    let finalAdjItems = [...editAdjItems];
    const pendingAmt = parseFloat(editAdjAmount);
    if (!isNaN(pendingAmt)) {
      const label = editAdjLabel.trim() || ADJ_TYPES.find(t => t.value === editAdjType)?.label || editAdjType;
      const signedAmt = editAdjSign === '-' ? -Math.abs(pendingAmt) : Math.abs(pendingAmt);
      finalAdjItems = [...finalAdjItems, { label, amount: signedAmt, type: editAdjType }];
    }

    const h = parseFloat(editHours);
    const p = parseFloat(editPay);
    setRowOverrides(prev => ({
      ...prev,
      [contractorId]: {
        hours: isNaN(h) ? undefined : h,
        pay: isNaN(p) ? undefined : p,
      },
    }));

    const row = rows.find(r => r.contractor.id === contractorId);
    const basePay = isNaN(p) ? (row?.pay ?? 0) : p;
    const adjTotal = finalAdjItems.reduce((s, i) => s + i.amount, 0);

    // Upsert / delete OT entries in hub_overtime_requests
    const activeEntries = editOTEntries.filter(e => !e.toDelete);
    const deletedEntries = editOTEntries.filter(e => e.toDelete);
    const toDeleteEntries = deletedEntries.filter(e => e.id);
    for (const entry of toDeleteEntries) {
      await supabase.from('hub_overtime_requests').delete().eq('id', entry.id!);
    }
    for (const entry of activeEntries) {
      if (entry.id) {
        await supabase.from('hub_overtime_requests')
          .update({ hours: entry.hours, is_rest_day: entry.is_rest_day })
          .eq('id', entry.id);
      } else {
        await supabase.from('hub_overtime_requests').insert({
          contractor_id: contractorId,
          date: entry.date,
          hours: entry.hours,
          is_rest_day: entry.is_rest_day,
          status: 'approved',
          admin_created: true,
        });
      }
    }
    // Sync hub_daily_hours.overtime_hours per date
    const dateToOTHours: Record<string, number> = {};
    for (const e of activeEntries) dateToOTHours[e.date] = (dateToOTHours[e.date] || 0) + e.hours;
    for (const e of deletedEntries) { if (!(e.date in dateToOTHours)) dateToOTHours[e.date] = 0; }
    for (const [date, hours] of Object.entries(dateToOTHours)) {
      await supabase.from('hub_daily_hours').upsert(
        { user_id: contractorId, date, overtime_hours: hours, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,date' }
      );
    }

    const otRate = row?.derivedHourlyRate ?? 0;
    if (activeEntries.length > 0 && otRate <= 0) {
      console.error('saveEditRow: overtime rate is 0 — refusing to save OT pay as ₱0', { contractorId });
      alert('Could not determine the overtime rate for this employee. Refresh the page and try again.');
      setEditSaving(false);
      return;
    }
    const computedOTPay = activeEntries.reduce(
      (sum, e) => sum + e.hours * otRate * getOTMultiplier(e.date, e.is_rest_day),
      0
    );
    const finalPay = basePay + computedOTPay + adjTotal;
    const existing = payoutsMap[contractorId];

    const { error } = await supabase.from('hub_payouts').upsert({
      ...(existing ? { id: existing.id } : {}),
      contractor_id: contractorId,
      cutoff_start: selectedPeriod.start,
      cutoff_end: selectedPeriod.end,
      base_pay: basePay,
      approved_hours: isNaN(h) ? (existing?.approved_hours ?? null) : h,
      final_payout: finalPay,
      overtime_pay: computedOTPay,
      status: existing?.status || 'pending',
      locked: existing?.locked ?? false,
      adjustments: finalAdjItems,
      manual_override: true,
    }, { onConflict: 'contractor_id,cutoff_start' });

    if (error) {
      console.error('Failed to save payout row', error);
      setEditSaving(false);
      return;
    }

    await Promise.all([fetchPayroll(), fetchWorkflow()]);
    setEditSaving(false);
    setEditRowId(null);
  };

  // Reset a row back to the live-computed figures: clear the persisted manual
  // override so the page stops restoring the edit, then refetch.
  const resetEditRow = async (contractorId: string) => {
    const existing = payoutsMap[contractorId];
    if (existing?.id) {
      await supabase.from('hub_payouts').update({ manual_override: false }).eq('id', existing.id);
    }
    setRowOverrides(prev => { const n = { ...prev }; delete n[contractorId]; return n; });
    setEditAdjItems([]);
    setEditOTEntries([]);
    setEditRowId(null);
    await Promise.all([fetchPayroll(), fetchWorkflow()]);
  };

  const handleYearChange = (year: string) => {
    setSelectedYear(year);
    const firstMonth = periods.find(p => p.start.startsWith(year))?.start.slice(0, 7) || '';
    setSelectedMonth(firstMonth);
    const latestPeriod = periods.filter(p => p.start.startsWith(firstMonth)).at(-1);
    if (latestPeriod) setSelectedPeriod(latestPeriod);
  };

  const handleMonthChange = (month: string) => {
    setSelectedMonth(month);
    const latestPeriod = periods.filter(p => p.start.startsWith(month)).at(-1);
    if (latestPeriod) setSelectedPeriod(latestPeriod);
  };

  const fetchWorkflow = async () => {
    const [payoutsRes, batchRes] = await Promise.all([
      supabase
        .from('hub_payouts')
        .select('id, contractor_id, status, final_payout, payment_date, batch_id, adjustments, payslip_sent_at, overtime_pay, base_pay, approved_hours, approved_days, overtime_hours, prorated_note, manual_override')
        .eq('cutoff_start', selectedPeriod.start),
      supabase
        .from('hub_payroll_batches')
        .select('*')
        .eq('period_start', selectedPeriod.start)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    const map: Record<string, any> = {};
    for (const p of payoutsRes.data || []) map[p.contractor_id] = p;
    setPayoutsMap(map);
    setBatch(batchRes.data ?? null);

    // Restore persisted row overrides for this period.
    // - Past closed periods: restore approved_hours for ALL payouts so the Hours
    //   column shows what was actually paid, not a live recompute (which may be 0).
    // - Current period: only restore rows where admin explicitly edited (manual_override).
    const isPastPeriod = localToday() > selectedPeriod.end;
    const restored: Record<string, { hours?: number; pay?: number; days?: number; overtimeHours?: number; proratedNote?: string }> = {};
    for (const p of payoutsRes.data || []) {
      if (isPastPeriod || p.manual_override) {
        restored[p.contractor_id] = {
          hours: p.approved_hours != null ? Number(p.approved_hours) : undefined,
          pay: p.base_pay != null ? Number(p.base_pay) : undefined,
          days: p.approved_days != null ? Number(p.approved_days) : undefined,
          overtimeHours: p.overtime_hours != null ? Number(p.overtime_hours) : undefined,
          proratedNote: p.prorated_note ?? undefined,
        };
      }
    }
    setRowOverrides(restored);

    // Fetch open disputes for this period's payouts
    const payoutIds = (payoutsRes.data || []).map((p: any) => p.id);
    if (payoutIds.length > 0) {
      const { data: disputes } = await supabase
        .from('hub_payslip_disputes')
        .select('id, payout_id, reason, status, admin_notes')
        .in('payout_id', payoutIds)
        .eq('status', 'open');
      const dm: Record<string, any> = {};
      for (const d of disputes || []) dm[d.payout_id] = d;
      setDisputesMap(dm);
    } else {
      setDisputesMap({});
    }
  };

  const refreshPayrollPage = async () => {
    setRefreshing(true);
    try {
      await Promise.all([fetchPayroll(), fetchWorkflow()]);
    } finally {
      setRefreshing(false);
    }
  };

  const approvePayout = async (contractorId: string, computedPay: number) => {
    setWorkflowLoading(true);
    const row = rows.find(r => r.contractor.id === contractorId);
    const override = rowOverrides[contractorId];
    const basePay = override?.pay !== undefined ? override.pay : computedPay;
    const otPay = row?.overtimePay ?? 0;
    const adjs: any[] = payoutsMap[contractorId]?.adjustments || [];
    const adjTotal = adjs.reduce((s: number, a: any) => s + (a.amount || 0), 0);
    const finalPay = basePay + otPay + adjTotal;
    const existing = payoutsMap[contractorId];
    const contractorName = rows.find(r => r.contractor.id === contractorId)?.contractor.full_name ?? contractorId;
    const { error: approveErr } = existing
      ? await supabase.from('hub_payouts').update({ status: 'hr_approved', approved_at: new Date().toISOString(), final_payout: finalPay, overtime_pay: otPay }).eq('id', existing.id)
      : await supabase.from('hub_payouts').insert({
          contractor_id: contractorId,
          cutoff_start: selectedPeriod.start,
          cutoff_end: selectedPeriod.end,
          final_payout: finalPay,
          overtime_pay: otPay,
          status: 'hr_approved',
          approved_at: new Date().toISOString(),
        });
    if (approveErr) {
      console.error('Approve payout failed:', approveErr);
      alert('Failed to approve payout: ' + approveErr.message);
      setWorkflowLoading(false);
      return;
    }
    // Optimistic update + unlock UI immediately — background sync confirms with DB
    setPayoutsMap(prev => ({
      ...prev,
      [contractorId]: { ...(prev[contractorId] || {}), contractor_id: contractorId, status: 'hr_approved', final_payout: finalPay, approved_at: new Date().toISOString() },
    }));
    setWorkflowLoading(false);
    // Background: audit, notifications, DB sync (fire-and-forget)
    logAudit({ actor_id: hubUser?.id, actor_name: hubUser?.full_name, action: 'approve', entity_type: 'payout', entity_id: contractorId, description: `Approved payout of ${fmt(finalPay)} for ${contractorName} — ${selectedPeriod.label}` });
    const approvedPayout = existing
      ? { id: existing.id }
      : (await supabase.from('hub_payouts').select('id').eq('contractor_id', contractorId).eq('cutoff_start', selectedPeriod.start).maybeSingle()).data;
    if (approvedPayout?.id) {
      supabase.functions.invoke('notify-contractor', { body: { payout_id: approvedPayout.id, type: 'hr_approved' } }).catch(console.error);
      supabase.from('hub_notifications').insert({
        user_id: contractorId, type: 'payroll_approved',
        title: 'Payout approved',
        body: `Your payout of ${fmt(finalPay)} for ${selectedPeriod.label} has been approved`,
        link: '/hub/employee/payouts', read: false,
      }).catch(console.error);
    }
    fetchWorkflow().catch(console.error);
  };

  const approveAll = async () => {
    const toApprove = rows.filter(r => {
      const p = payoutsMap[r.contractor.id];
      return !isAutoPayrollContractor(r.contractor) && !batch && (!p || p.status === 'pending' || p.status === 'submitted');
    });
    if (toApprove.length === 0) return;
    setWorkflowLoading(true);
    const now = new Date().toISOString();
    const approveResults = await Promise.all(toApprove.map(async r => {
      const override = rowOverrides[r.contractor.id];
      const basePay = override?.pay !== undefined ? override.pay : r.pay;
      const otPay = r.overtimePay;
      const adjs: any[] = payoutsMap[r.contractor.id]?.adjustments || [];
      const adjTotal = adjs.reduce((s: number, a: any) => s + (a.amount || 0), 0);
      const finalPay = basePay + otPay + adjTotal;
      const existing = payoutsMap[r.contractor.id];
      const { error } = existing
        ? await supabase.from('hub_payouts').update({ status: 'hr_approved', approved_at: now, final_payout: finalPay, overtime_pay: otPay }).eq('id', existing.id)
        : await supabase.from('hub_payouts').insert({
            contractor_id: r.contractor.id,
            cutoff_start: selectedPeriod.start,
            cutoff_end: selectedPeriod.end,
            final_payout: finalPay,
            overtime_pay: otPay,
            status: 'hr_approved',
            approved_at: now,
          });
      return error;
    }));
    const approveFailed = approveResults.filter(Boolean);
    if (approveFailed.length > 0) {
      console.error('Some payouts failed to approve:', approveFailed);
      alert(`${approveFailed.length} of ${toApprove.length} approvals failed to save. Refresh and retry.`);
    }
    // Notify each contractor (fire-and-forget — fetch IDs after batch update)
    const { data: newPayouts } = await supabase
      .from('hub_payouts')
      .select('id, contractor_id')
      .eq('cutoff_start', selectedPeriod.start)
      .eq('status', 'hr_approved');
    for (const np of newPayouts ?? []) {
      if (toApprove.some(r => r.contractor.id === np.contractor_id)) {
        supabase.functions.invoke('notify-contractor', { body: { payout_id: np.id, type: 'hr_approved' } }).catch(console.error);
        supabase.from('hub_notifications').insert({
          user_id: np.contractor_id, type: 'payroll_approved',
          title: 'Payout approved',
          body: `Your payout for ${selectedPeriod.label} has been approved`,
          link: '/hub/employee/payouts', read: false,
        }).catch(console.error);
      }
    }
    logAudit({ actor_id: hubUser?.id, actor_name: hubUser?.full_name, action: 'approve', entity_type: 'payout', entity_id: selectedPeriod.start, description: `Bulk approved ${toApprove.length} payouts for ${selectedPeriod.label}` });
    await fetchWorkflow().catch(console.error);
    setWorkflowLoading(false);
  };

  const requestFundTransfer = async () => {
    setWorkflowLoading(true);
    const approved = rows.filter(r => {
      const p = payoutsMap[r.contractor.id];
      return !isAutoPayrollContractor(r.contractor) && p?.status === 'hr_approved';
    });
    if (approved.length === 0) {
      setWorkflowLoading(false);
      return;
    }
    // Auto-included staff (admins/HR) are paid every cutoff without per-row
    // approval, but their pay must still be part of the transfer total + count.
    const autoIncluded = rows.filter(r => isAutoPayrollContractor(r.contractor));
    const rowAmount = (r: PayRow) => {
      const p = payoutsMap[r.contractor.id];
      const adjs: any[] = p?.adjustments || [];
      const adjTotal = adjs.reduce((a: number, x: any) => a + (x.amount || 0), 0);
      return r.pay + r.overtimePay + adjTotal;
    };
    const approvedTotal = approved.reduce((s, r) => s + (payoutsMap[r.contractor.id]?.final_payout ?? r.pay), 0);
    const autoTotal = autoIncluded.reduce((s, r) => s + rowAmount(r), 0);
    const total = approvedTotal + autoTotal;
    const { data: newBatch, error: batchError } = await supabase.from('hub_payroll_batches').insert({
      period_start: selectedPeriod.start,
      period_end: selectedPeriod.end,
      period_label: selectedPeriod.label,
      total_amount: total,
      contractor_count: approved.length + autoIncluded.length,
      status: 'pending_owner',
      requested_by: hubUser?.id,
    }).select('id').single();

    if (batchError) {
      console.error('Fund transfer request failed:', batchError);
      alert('Failed to request fund transfer: ' + batchError.message);
      setWorkflowLoading(false);
      return;
    }

    if (newBatch) {
      const approvedIds = approved.map(r => payoutsMap[r.contractor.id]?.id).filter(Boolean);
      const { error: linkError } = await supabase.from('hub_payouts').update({ batch_id: newBatch.id }).in('id', approvedIds);
      if (linkError) {
        console.error('Failed to link payouts to batch:', linkError);
        alert('Batch created but linking payouts failed: ' + linkError.message + '. Please retry.');
        await fetchWorkflow().catch(console.error);
        setWorkflowLoading(false);
        return;
      }
      supabase.functions.invoke('notify-owner', { body: { batch_id: newBatch.id } }).catch(console.error);
    }
    await fetchWorkflow().catch(console.error);
    setWorkflowLoading(false);
  };

  const approveBatch = async (proofUrl?: string) => {
    if (!batch) return;
    setWorkflowLoading(true);
    const now = new Date().toISOString();
    const today = now.slice(0, 10);
    const { error: batchApproveErr } = await supabase.from('hub_payroll_batches').update({
      status: 'owner_approved',
      approved_by: hubUser?.id,
      approved_at: now,
      ...(proofUrl ? { proof_url: proofUrl } : {}),
    }).eq('id', batch.id);
    if (batchApproveErr) {
      console.error('Approve batch failed:', batchApproveErr);
      alert('Failed to approve fund transfer: ' + batchApproveErr.message);
      setWorkflowLoading(false);
      return;
    }
    logAudit({ actor_id: hubUser?.id, actor_name: hubUser?.full_name, action: 'approve', entity_type: 'payroll_batch', entity_id: batch.id, description: `Approved fund transfer of ${fmt(batch.total_amount)} for ${batch.period_label} (${batch.contractor_count} employees)` });
    supabase.functions.invoke('notify-owner', { body: { batch_id: batch.id, type: 'fund_approved' } }).catch(console.error);

    // Auto-included employees (admins/HR) never go through the normal approve → markPaid
    // flow, so they never get a payout row or a payslip email. Create their payout rows
    // as 'paid' now (owner approval = payment confirmed) and fire send-payslip for each.
    const autoIncluded = rows.filter(r => isAutoPayrollContractor(r.contractor));
    for (const r of autoIncluded) {
      const existingPayout = payoutsMap[r.contractor.id];
      const finalPay = r.pay + r.overtimePay;
      let payoutId: string | null = existingPayout?.id ?? null;
      if (!payoutId) {
        const { data: inserted } = await supabase.from('hub_payouts').insert({
          contractor_id: r.contractor.id,
          cutoff_start: selectedPeriod.start,
          cutoff_end: selectedPeriod.end,
          final_payout: finalPay,
          overtime_pay: r.overtimePay,
          approved_hours: r.cappedHours,
          status: 'paid',
          approved_at: now,
          payment_date: today,
          paid_at: now,
          batch_id: batch.id,
        }).select('id').single();
        payoutId = inserted?.id ?? null;
      } else {
        await supabase.from('hub_payouts').update({
          status: 'paid',
          final_payout: finalPay,
          overtime_pay: r.overtimePay,
          payment_date: today,
          paid_at: now,
          batch_id: batch.id,
        }).eq('id', payoutId);
      }
      if (payoutId) {
        supabase.functions.invoke('send-payslip', { body: { payout_id: payoutId } }).catch(console.error);
      }
    }

    await fetchWorkflow().catch(console.error);
    setWorkflowLoading(false);
  };

  // Owner approves the transfer, optionally attaching a proof screenshot that's
  // uploaded to Google Drive (Payroll / Receipts) and linked on the batch.
  const confirmApproveTransfer = async () => {
    if (!batch) return;
    setApprovingTransfer(true);
    let proofUrl: string | undefined;
    if (proofFile) {
      try {
        const b64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
          reader.onerror = reject;
          reader.readAsDataURL(proofFile);
        });
        const ext = (proofFile.name.split('.').pop() || 'png').toLowerCase();
        const year = selectedPeriod.start.slice(0, 4);
        const { data, error } = await supabase.functions.invoke('upload-to-drive', {
          body: {
            type: 'payout_receipt',
            year,
            filename: `Fund-Transfer-Proof_${selectedPeriod.label.replace(/[^a-zA-Z0-9]+/g, '-')}.${ext}`,
            base64Content: b64,
            mimeType: proofFile.type || 'image/png',
            meta: { year },
          },
        });
        if (error || !data?.url) {
          console.error('Proof upload failed', error || data);
          alert('Could not upload the proof to Drive. You can approve without it and attach later, or try again.');
          setApprovingTransfer(false);
          return;
        }
        proofUrl = data.url as string;
      } catch (e) {
        console.error('Proof read/upload failed', e);
        alert('Could not process the screenshot. Try again or approve without it.');
        setApprovingTransfer(false);
        return;
      }
    }
    await approveBatch(proofUrl);
    setApprovingTransfer(false);
    setApproveProofOpen(false);
    setProofFile(null);
  };

  // Undo a fund transfer request: unlink its payouts and delete the batch so it can
  // be re-requested. Blocked once anyone in the batch has been paid.
  const cancelFundTransfer = async () => {
    if (!batch || batch.status === 'closed') return;
    const anyPaid = rows.some(r => {
      const p = payoutsMap[r.contractor.id];
      return p?.batch_id === batch.id && p?.status === 'paid';
    });
    if (anyPaid) {
      alert('Some payments in this transfer are already marked paid — undo individual payouts first.');
      return;
    }
    if (!confirm('Undo this fund transfer request? Approved payouts stay approved; only the transfer is withdrawn.')) return;
    setWorkflowLoading(true);
    const { error: unlinkErr } = await supabase.from('hub_payouts').update({ batch_id: null }).eq('batch_id', batch.id);
    if (unlinkErr) { console.error('Unlink payouts failed:', unlinkErr); alert('Failed to undo: ' + unlinkErr.message); setWorkflowLoading(false); return; }
    const { error: delErr } = await supabase.from('hub_payroll_batches').delete().eq('id', batch.id);
    if (delErr) { console.error('Delete batch failed:', delErr); alert('Failed to undo: ' + delErr.message); setWorkflowLoading(false); return; }
    logAudit({ actor_id: hubUser?.id, actor_name: hubUser?.full_name, action: 'delete', entity_type: 'payroll_batch', entity_id: batch.id, description: `Undid fund transfer request for ${batch.period_label}` });
    await fetchWorkflow().catch(console.error);
    setWorkflowLoading(false);
  };


  const cancelPayout = async (contractorId: string) => {
    const p = payoutsMap[contractorId];
    if (!p) return;
    setWorkflowLoading(true);
    const { error: cancelErr } = p.status === 'paid'
      ? await supabase.from('hub_payouts').update({
          status: 'hr_approved',
          payment_date: null,
          paid_at: null,
        }).eq('id', p.id)
      : await supabase.from('hub_payouts').delete().eq('id', p.id);
    if (cancelErr) {
      console.error('Cancel payout failed:', cancelErr);
      alert('Failed to cancel: ' + cancelErr.message);
      setWorkflowLoading(false);
      return;
    }
    // Clean up batch if no more active payouts remain in it
    if (batch) {
      const { count } = await supabase
        .from('hub_payouts')
        .select('id', { count: 'exact', head: true })
        .eq('batch_id', batch.id)
        .neq('id', p.id);
      if ((count ?? 0) === 0) {
        await supabase.from('hub_payroll_batches').delete().eq('id', batch.id);
      }
    }
    setConfirmCancelId(null);
    await fetchWorkflow().catch(console.error);
    setWorkflowLoading(false);
  };

  const markPaid = async (contractorId: string) => {
    const existing = payoutsMap[contractorId];
    if (!existing) return;
    setWorkflowLoading(true);
    const row = rows.find(r => r.contractor.id === contractorId);
    const { error: paidErr } = await supabase.from('hub_payouts').update({
      status: 'paid',
      payment_date: new Date().toISOString().slice(0, 10),
      paid_at: new Date().toISOString(),
      approved_hours: row?.cappedHours ?? existing.approved_hours ?? 0,
      approved_days: row?.days ?? null,
      overtime_hours: row?.overtimeHours ?? null,
      // Manual edits already persisted the exact OT pay — don't clobber them
      overtime_pay: existing.manual_override ? (existing.overtime_pay ?? 0) : (row?.overtimePay ?? existing.overtime_pay ?? 0),
      prorated_note: row?.proratedNote ?? null,
    }).eq('id', existing.id);
    if (paidErr) {
      console.error('Mark paid failed:', paidErr);
      alert('Failed to mark as paid: ' + paidErr.message);
      setWorkflowLoading(false);
      return;
    }
    // Fire payslip email (non-blocking — ignore failures)
    supabase.functions.invoke('send-payslip', { body: { payout_id: existing.id } }).catch(console.error);
    setPayoutsMap(prev => ({
      ...prev,
      [contractorId]: { ...existing, status: 'paid', payment_date: new Date().toISOString().slice(0, 10) },
    }));
    setWorkflowLoading(false);
    fetchWorkflow().catch(console.error);
  };

  const [savingToDrive, setSavingToDrive] = useState(false);
  const [savedPdfPeriods, setSavedPdfPeriods] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!closedPeriods.has(selectedPeriod.start) || isDemo) return;
    let cancelled = false;
    getSetting(`payroll_pdf_saved_${selectedPeriod.start}`, 'false').then((value) => {
      if (cancelled || value !== 'true') return;
      setSavedPdfPeriods((prev) => {
        if (prev.has(selectedPeriod.start)) return prev;
        const next = new Set(prev);
        next.add(selectedPeriod.start);
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [closedPeriods, isDemo, selectedPeriod.start]);

  const buildPayrollReportMarkup = (label: string, generatedLabel: string) => {
    const logoUrl = `${window.location.origin}/images/fs-architects-logo-horizontal.png`;
    const hourlyRows = rows.filter(r => r.contractor.payment_type === 'hourly').length;
    const fixedRows = rows.length - hourlyRows;
    const tableRows = rows.map(r => {
      const c = r.contractor;
      const isFixed = c.payment_type === 'fixed' || c.payment_type === 'fixed_flexible';
      const isUSD = c.currency === 'USD';
      const rate = isFixed
        ? isUSD ? `$${(c.monthly_rate || 0).toLocaleString()}/mo` : `PHP ${(c.monthly_rate || 0).toLocaleString('en-PH', { maximumFractionDigits: 0 })}/mo`
        : isUSD ? `$${c.hourly_rate}/hr` : `PHP ${(c.hourly_rate || 0).toLocaleString('en-PH', { maximumFractionDigits: 0 })}/hr`;
      const override = rowOverrides[c.id];
      const basePay = override?.pay !== undefined ? override.pay : r.pay;
      const displayOTHours = r.overtimeHours;
      const displayOTPay = r.overtimePay;
      const p = payoutsMap[c.id];
      const adjs: { amount: number }[] = p?.adjustments || [];
      const adjTotal = adjs.reduce((sum, item) => sum + item.amount, 0);
      const total = getRowDisplayTotal(r);
      return `
        <tr style="border-bottom:1px solid #f3f4f6;">
          <td style="padding:11px 14px;">${c.full_name}</td>
          <td style="padding:11px 14px;">${c.department || '—'}</td>
          <td style="padding:11px 14px;">${isFixed ? 'Fixed' : 'Hourly'}</td>
          <td style="padding:11px 14px;">${rate}</td>
          <td style="padding:11px 14px;">${r.days}</td>
          <td style="padding:11px 14px;">${r.cappedHours.toFixed(2)}h</td>
          <td style="padding:11px 14px;">${displayOTHours > 0 ? `${displayOTHours.toFixed(2)}h` : '—'}</td>
          <td style="padding:11px 14px;text-align:right;font-weight:700">₱${total.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        </tr>
      `;
    }).join('');

    return `
      <div style="width:1200px;background:#ffffff;color:#111827;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:40px 48px;">
        <div style="display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid #1c2b3a;padding-bottom:20px;margin-bottom:28px;">
          <div style="display:flex;align-items:center;gap:16px;">
            <img src="${logoUrl}" alt="FS Architects" style="height:48px;object-fit:contain;" />
            <div style="font-size:26px;font-weight:800;color:#111827;">Payroll Report</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:16px;font-weight:700;">${label}</div>
            <div style="font-size:12px;color:#6b7280;margin-top:4px;">${generatedLabel}</div>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-bottom:28px;">
          ${[
            { label: 'Total Payroll', value: fmt(displayTotalPay, 'PHP') },
            { label: 'Total Hours', value: `${totalHours.toFixed(2)}h` },
            { label: 'Employees', value: `${rows.length}` },
            { label: 'Hourly / Fixed', value: `${hourlyRows} / ${fixedRows}` },
          ].map((item) => `
            <div style="border:1px solid #e5e7eb;border-radius:16px;background:#f9fafb;padding:16px 18px;">
              <div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#9ca3af;font-weight:700;">${item.label}</div>
              <div style="font-size:22px;font-weight:800;color:${item.label === 'Total Payroll' ? '#1c2b3a' : '#111827'};margin-top:6px;">${item.value}</div>
            </div>
          `).join('')}
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead>
            <tr>
              <th style="background:#1c2b3a;color:#ffffff;padding:12px 14px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;">Employee</th>
              <th style="background:#1c2b3a;color:#ffffff;padding:12px 14px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;">Department</th>
              <th style="background:#1c2b3a;color:#ffffff;padding:12px 14px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;">Type</th>
              <th style="background:#1c2b3a;color:#ffffff;padding:12px 14px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;">Rate</th>
              <th style="background:#1c2b3a;color:#ffffff;padding:12px 14px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;">Days</th>
              <th style="background:#1c2b3a;color:#ffffff;padding:12px 14px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;">Billed Hours</th>
              <th style="background:#1c2b3a;color:#ffffff;padding:12px 14px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;">Overtime</th>
              <th style="background:#1c2b3a;color:#ffffff;padding:12px 14px;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;">Pay</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="7" style="padding:16px 14px 12px;border-top:2px solid #111827;font-weight:800;font-size:14px;">Total</td>
              <td style="padding:16px 14px 12px;border-top:2px solid #111827;text-align:right;font-weight:800;font-size:14px;">${fmt(displayTotalPay, 'PHP')}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    `;
  };

  // Render the formatted payroll report to landscape PDF bytes (shared by the
  // on-close Drive auto-save and the manual hub save).
  const generatePayrollPdfBytes = async (label: string, generatedLabel: string) => {
    const markup = buildPayrollReportMarkup(label, generatedLabel);
    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.left = '-10000px';
    container.style.top = '0';
    container.style.zIndex = '-1';
    container.innerHTML = markup;
    document.body.appendChild(container);
    try {
      const target = container.firstElementChild as HTMLElement | null;
      if (!target) throw new Error('Could not render payroll report for PDF export.');
      const canvas = await html2canvas(target, { backgroundColor: '#ffffff', scale: 2, useCORS: true });
      const jpegBytes = dataUrlToUint8Array(canvas.toDataURL('image/jpeg', 0.92));
      return buildPdfFromJpeg(jpegBytes, canvas.width, canvas.height, true);
    } finally {
      document.body.removeChild(container);
    }
  };

  // Auto-save the closed period's report to Google Drive. Idempotent: the
  // `payroll_pdf_saved_<period>` setting + stable filename guard against dupes.
  const savePayrollPdfToDrive = async (period: typeof selectedPeriod): Promise<boolean> => {
    if (isDemo) return false;
    const already = await getSetting(`payroll_pdf_saved_${period.start}`, 'false');
    if (already === 'true') return true;
    try {
      const year = period.start.slice(0, 4);
      const generatedLabel = `Closed ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`;
      const pdfBytes = await generatePayrollPdfBytes(period.label, generatedLabel);
      const b64 = uint8ToBase64(pdfBytes);
      const safeName = period.label.replace(/[^a-zA-Z0-9\s]/g, '_').replace(/\s+/g, '_');
      const month = period.start.slice(5, 7); // "06" for June
      const { data, error } = await supabase.functions.invoke('upload-to-drive', {
        body: { type: 'payroll', year, filename: `Payroll_${safeName}.pdf`, base64Content: b64, mimeType: 'application/pdf', meta: { year, month } },
      });
      if (error || (data as any)?.error) {
        console.error('Payroll Drive upload failed:', error?.message || (data as any)?.error);
        return false;
      }
      await setSetting(`payroll_pdf_saved_${period.start}`, 'true');
      setSavedPdfPeriods((prev) => new Set(prev).add(period.start));
      return true;
    } catch (e) {
      console.error('Payroll Drive upload failed:', e);
      return false;
    }
  };

  // Manual "Save PDF to Drive" button handler.
  const savePayrollToDrive = async () => {
    if (isDemo) return;
    setSavingToDrive(true);
    const ok = await savePayrollPdfToDrive(selectedPeriod);
    setSavingToDrive(false);
    alert(ok ? 'Saved PDF to Google Drive ✓' : 'Drive upload failed — check the console.');
  };

  const closePeriod = async () => {
    if (!batch || isDemo) return;
    const confirmed = window.confirm(
      `Close payroll period "${batch.period_label}"?\n\nThis will:\n• Lock the batch permanently\n• Make all payslips read-only\n• Archive this period from the active view\n\nThis cannot be undone.`
    );
    if (!confirmed) return;
    setWorkflowLoading(true);
    const { error } = await supabase.from('hub_payroll_batches').update({
      status: 'closed',
      closed_at: new Date().toISOString(),
      closed_by: hubUser?.id ?? null,
    }).eq('id', batch.id);
    if (error) {
      console.error('Close period failed:', error);
      alert('Failed to close period: ' + error.message);
    } else {
      logAudit({ actor_id: hubUser?.id, actor_name: hubUser?.full_name, action: 'close', entity_type: 'payroll_batch', entity_id: batch.id, description: `Closed payroll period ${batch.period_label}` });
      supabase.functions.invoke('notify-payroll-closed', {
        body: {
          batch_id: batch.id,
          closed_by_name: hubUser?.full_name ?? null,
        },
      }).catch((invokeError) => {
        console.error('Failed to queue payroll closed Slack notification:', invokeError);
      });
      // Auto-save the landscape PDF report to Google Drive (guarded — no dupes).
      const closedPeriod = selectedPeriod;
      const saved = await savePayrollPdfToDrive(closedPeriod);
      await fetchWorkflow();
      alert(saved
        ? 'Payroll period closed. PDF report saved to Google Drive ✓'
        : 'Payroll period closed. (Drive PDF save failed — you can retry with "Save PDF to Drive".)');
    }
    setWorkflowLoading(false);
  };

  const isPdfSavedToDrive = savedPdfPeriods.has(selectedPeriod.start);

  useEffect(() => {
    if (isDemo) {
      // Build PayRow[] from DEMO_PAYOUTS
      const demoRows: PayRow[] = DEMO_PAYOUTS.map(p => {
        const c = DEMO_CONTRACTORS.find(x => x.id === p.contractor_id)!;
        const isFixed = c.payment_type === 'fixed';
        return {
          contractor: {
            id: c.id,
            full_name: c.full_name,
            avatar_url: null,
            department: c.department || null,
            currency: c.currency || 'PHP',
            payment_type: (c.payment_type || 'hourly') as 'hourly' | 'fixed' | 'fixed_flexible',
            hourly_rate: c.hourly_rate || null,
            monthly_rate: c.monthly_rate || null,
            start_date: c.start_date || null,
            work_days: c.work_days || null,
          },
          hours: p.approved_hours,
          cappedHours: p.approved_hours,
          overtimeHours: p.overtime_pay > 0 ? p.overtime_pay / (c.hourly_rate || 1) : 0,
          overtimePay: p.overtime_pay,
          derivedHourlyRate: c.hourly_rate || (c.monthly_rate ? c.monthly_rate / 176 : 0),
          pay: p.base_pay,
          days: isFixed ? 10 : Math.round(p.approved_hours / 8),
          dailyBreakdown: [],
          prorated: false,
        };
      });
      // Build payouts map from DEMO_PAYOUTS
      const map: Record<string, any> = {};
      for (const p of DEMO_PAYOUTS) {
        map[p.contractor_id] = {
          id: p.id,
          contractor_id: p.contractor_id,
          status: p.status,
          final_payout: p.final_payout,
          payment_date: null,
          batch_id: null,
          adjustments: [],
          payslip_sent_at: null,
          overtime_pay: p.overtime_pay,
        };
      }
      setRows(demoRows);
      setPayoutsMap(map);
      setBatch(null);
      setLoading(false);
      setWorkflowLoading(false);
      return;
    }
    fetchPayroll();
    fetchWorkflow();

    if (!isDemo) {
      const channel = supabase
        .channel(`payouts-${selectedPeriod.start}`)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'hub_payouts',
          filter: `cutoff_start=eq.${selectedPeriod.start}`,
        }, () => { fetchWorkflow(); })
        .subscribe();

      const onVisibility = () => { if (document.visibilityState === 'visible') fetchWorkflow().catch(console.error); };
      document.addEventListener('visibilitychange', onVisibility);

      return () => {
        supabase.removeChannel(channel);
        document.removeEventListener('visibilitychange', onVisibility);
      };
    }
  }, [isDemo, selectedPeriod, usdRate]);

  const fetchPayroll = async () => {
    setLoading(true);
    setPayrollError(null);
    try {
    const today = localToday();
    const isCurrentPeriod = today >= selectedPeriod.start && today <= selectedPeriod.end;

    // Payroll reads from hub_daily_hours, so sync Slack punches first for the live cutoff.
    const isPastPeriod = today > selectedPeriod.end;
    const [slackRes, contractorsRes, hoursRes, paidPayoutsRes, otRequestsRes, leaveRes] = await Promise.all([
      isCurrentPeriod ? supabase.functions.invoke('slack-attendance') : Promise.resolve({ data: null } as any),
      supabase
        .from('hub_users')
        .select('id, full_name, role, auto_payroll, avatar_url, department, currency, payment_type, hourly_rate, monthly_rate, start_date, work_days, payment_method, bank_name, bank_account_name, bank_account_number, bank_account_type')
        // For past closed periods include inactive/deleted users so historical rows aren't lost
        .in('status', isPastPeriod ? ['active', 'inactive'] : ['active'])
        .in('role', ['contractor', 'admin'])
        .neq('is_developer', true),
      supabase
        .from('hub_daily_hours')
        .select('user_id, hours_capped, hours_raw, overtime_hours, date, is_manual')
        .gte('date', selectedPeriod.start)
        .lte('date', selectedPeriod.end),
      supabase
        .from('hub_payouts')
        .select('contractor_id, payment_date')
        .eq('cutoff_start', selectedPeriod.start)
        .eq('status', 'paid'),
      supabase
        .from('hub_overtime_requests')
        .select('contractor_id, date, is_rest_day')
        .eq('status', 'approved')
        .gte('date', selectedPeriod.start)
        .lte('date', selectedPeriod.end),
      supabase
        .from('hub_time_off')
        .select('contractor_id, type, start_date, end_date, half_day')
        .eq('status', 'approved')
        .lte('start_date', selectedPeriod.end)
        .gte('end_date', selectedPeriod.start),
    ]);

    // Approved paid leave per contractor, used to credit leave days as paid below.
    const leavesByUser: Record<string, any[]> = {};
    for (const lv of leaveRes.data || []) {
      if (!leavesByUser[lv.contractor_id]) leavesByUser[lv.contractor_id] = [];
      leavesByUser[lv.contractor_id].push(lv);
    }

    // Map contractor_id → payment_date for already-paid payouts this period.
    // Hours on or before payment_date are already settled — exclude them from the live count.
    const paidPaymentDateMap: Record<string, string> = {};
    for (const p of paidPayoutsRes.data || []) {
      if (p.payment_date) paidPaymentDateMap[p.contractor_id] = p.payment_date;
    }

    // Salary/bank columns are no longer directly selectable; merge them in from
    // the authorization-checked finance RPC before any pay computation.
    const payrollFinance = await fetchUserFinanceMap((contractorsRes.data || []).map((c: any) => c.id));
    const contractorsWithFinance = mergeFinance((contractorsRes.data || []) as any[], payrollFinance);

    const eligibleContractors = contractorsWithFinance.filter((c: any) =>
      c.payment_type !== 'project_based' &&
      (!c.start_date || c.start_date <= selectedPeriod.end)
    );

    const liveAttendance = (slackRes as any)?.data?.attendance || [];
    const mergedHoursRows = mergeLiveAttendanceIntoDailyHours(
      (hoursRes.data || []).map((h: any) => ({ ...h })),
      liveAttendance,
      eligibleContractors.map((c: any) => c.id),
      today,
    );

    // Per-user per-date hours map (for hourly proration)
    const hoursByDate: Record<string, Record<string, number>> = {};
    const rawHoursByDate: Record<string, Record<string, number>> = {};
    const overtimeByDate: Record<string, Record<string, number>> = {};
    const manualByDate: Record<string, Record<string, boolean>> = {};
    const hoursMap: Record<string, { capped: number; raw: number; overtime: number; days: number }> = {};
    for (const h of mergedHoursRows) {
      // Discard dates outside the selected period — live Slack data can bleed
      // across midnight (Slack is UTC, page is PHT) causing prior-period hours
      // to appear in the new period at 1–8 AM PHT when the periods roll over.
      if (h.date < selectedPeriod.start || h.date > selectedPeriod.end) continue;

      // Skip hours already covered by a paid payout (on or before payment_date)
      const paymentDate = paidPaymentDateMap[h.user_id];
      if (paymentDate && h.date <= paymentDate) continue;

      if (!hoursMap[h.user_id]) hoursMap[h.user_id] = { capped: 0, raw: 0, overtime: 0, days: 0 };
      hoursMap[h.user_id].capped += h.hours_capped || 0;
      hoursMap[h.user_id].raw += h.hours_raw || 0;
      hoursMap[h.user_id].overtime += h.overtime_hours || 0;
      hoursMap[h.user_id].days += 1;
      if (!hoursByDate[h.user_id]) hoursByDate[h.user_id] = {};
      hoursByDate[h.user_id][h.date] = (hoursByDate[h.user_id][h.date] || 0) + (h.hours_capped || 0);
      if (!rawHoursByDate[h.user_id]) rawHoursByDate[h.user_id] = {};
      rawHoursByDate[h.user_id][h.date] = (rawHoursByDate[h.user_id][h.date] || 0) + (h.hours_raw || 0);
      if (h.overtime_hours) {
        if (!overtimeByDate[h.user_id]) overtimeByDate[h.user_id] = {};
        overtimeByDate[h.user_id][h.date] = (overtimeByDate[h.user_id][h.date] || 0) + h.overtime_hours;
      }
      if (h.is_manual) {
        if (!manualByDate[h.user_id]) manualByDate[h.user_id] = {};
        manualByDate[h.user_id][h.date] = true;
      }
    }

    // Fold approved paid leave into the capped-hours maps so leave days are paid
    // for both hourly (hours × rate) and fixed (earned day units) employees. A
    // paid leave day acts as a floor of 8h (4h half-day): it tops a date up to a
    // full paid day without double-counting hours already clocked. leaveByDate /
    // leaveTypeByDate are kept purely for the daily-breakdown dropdown.
    const leaveByDate: Record<string, Record<string, number>> = {};
    const leaveTypeByDate: Record<string, Record<string, string>> = {};
    for (const c of eligibleContractors) {
      const leaves = leavesByUser[c.id];
      if (!leaves || leaves.length === 0) continue;
      const leaveHours = computeLeaveHoursByDate(leaves, selectedPeriod.start, selectedPeriod.end, c.work_days);
      if (Object.keys(leaveHours).length === 0) continue;
      // First leave row covering each date, for the dropdown label.
      const typeForDate = (date: string) =>
        (leaves.find((l: any) => l.start_date <= date && date <= l.end_date)?.type) || 'leave';
      const paymentDate = paidPaymentDateMap[c.id];
      for (const [date, hrs] of Object.entries(leaveHours)) {
        if (paymentDate && date <= paymentDate) continue; // already settled
        if (!leaveByDate[c.id]) leaveByDate[c.id] = {};
        if (!leaveTypeByDate[c.id]) leaveTypeByDate[c.id] = {};
        leaveByDate[c.id][date] = hrs;
        leaveTypeByDate[c.id][date] = typeForDate(date);

        if (!hoursMap[c.id]) hoursMap[c.id] = { capped: 0, raw: 0, overtime: 0, days: 0 };
        if (!hoursByDate[c.id]) hoursByDate[c.id] = {};
        const existing = hoursByDate[c.id][date] || 0;
        if (hrs > existing) {
          hoursMap[c.id].capped += hrs - existing;
          if (existing === 0) hoursMap[c.id].days += 1; // a leave day with no clock-in still counts as a day
          hoursByDate[c.id][date] = hrs;
        }
      }
    }

    // Explicit rest-day flags per user/date (from manual OT entries) — overrides date-based detection
    const isRestDayByUser: Record<string, Record<string, boolean>> = {};
    // Dates with an explicit approved hub_overtime_requests record — these always vest,
    // regardless of raw Slack hours, since a human already confirmed them.
    const trackedDatesByUser: Record<string, Set<string>> = {};
    for (const req of (otRequestsRes as any)?.data || []) {
      if (!trackedDatesByUser[req.contractor_id]) trackedDatesByUser[req.contractor_id] = new Set();
      trackedDatesByUser[req.contractor_id].add(req.date);
      if (req.is_rest_day == null) continue;
      if (!isRestDayByUser[req.contractor_id]) isRestDayByUser[req.contractor_id] = {};
      isRestDayByUser[req.contractor_id][req.date] = req.is_rest_day;
    }

    // Fetch all rate history for eligible contractors up to period end
    const ids = eligibleContractors.map((c: any) => c.id);
    const { data: rateHistoryAll } = ids.length > 0
      ? await supabase
          .from('hub_rate_history')
          .select('contractor_id, effective_date, payment_type, hourly_rate, monthly_rate')
          .in('contractor_id', ids)
          .lte('effective_date', selectedPeriod.end)
          .order('effective_date', { ascending: true })
      : { data: [] };

    // Group rate history by contractor
    const rateHistoryMap: Record<string, RateEntry[]> = {};
    for (const r of rateHistoryAll || []) {
      if (!rateHistoryMap[r.contractor_id]) rateHistoryMap[r.contractor_id] = [];
      rateHistoryMap[r.contractor_id].push(r);
    }

    const result: PayRow[] = eligibleContractors.map((c: any) => {
      const hrs = hoursMap[c.id] || { capped: 0, raw: 0, overtime: 0, days: 0 };
      const payType = c.payment_type || 'hourly';
      const history = rateHistoryMap[c.id] || [];

      // Rate change that occurred DURING this period (first one only)
      const changeInPeriod = history.find(r =>
        r.effective_date >= selectedPeriod.start && r.effective_date <= selectedPeriod.end
      );

      // Rate in effect at the START of the period = most recent entry before period start
      const rateAtStart = [...history]
        .filter(r => r.effective_date < selectedPeriod.start)
        .pop() || null;

      let pay = 0;
      let overtimePay = 0;
      let derivedHourlyRate = 0;
      let prorated = false;
      let proratedNote = '';
      let accrualTotalOriginalCurrency: number | undefined;

      if (changeInPeriod) {
        prorated = true;
        // Old rate = rateAtStart if it exists, else the contractor's current rate
        // (current rate in hub_users = new rate after the change was saved)
        // We need the rate BEFORE changeInPeriod — look at entry just before it
        const beforeChange = [...history]
          .filter(r => r.effective_date < changeInPeriod.effective_date)
          .pop();

        const oldMonthly = beforeChange ? (beforeChange.monthly_rate || 0) : (c.monthly_rate || 0);
        const oldHourly  = beforeChange ? (beforeChange.hourly_rate  || 0) : (c.hourly_rate  || 0);
        const newMonthly = changeInPeriod.monthly_rate || 0;
        const newHourly  = changeInPeriod.hourly_rate  || 0;

        if (payType === 'fixed' || payType === 'fixed_flexible') {
          const today = localToday();
          const isCurrentPeriod = today >= selectedPeriod.start && today <= selectedPeriod.end;
          const autoPayroll = isAutoPayrollContractor(c as Contractor);
          const datesMap = hoursByDate[c.id] || {};
          let hrsAtOld = 0;
          let hrsAtNew = 0;
          for (const [date, h] of Object.entries(datesMap)) {
            if (date < changeInPeriod.effective_date) hrsAtOld += h;
            else hrsAtNew += h;
          }
          const splitAccrual = computeSplitFixedAccrual({
            periodStart: selectedPeriod.start,
            periodEnd: selectedPeriod.end,
            changeDate: changeInPeriod.effective_date,
            workDays: c.work_days,
            oldMonthlyRate: oldMonthly,
            newMonthlyRate: newMonthly,
            oldCappedHours: autoPayroll ? Number.MAX_SAFE_INTEGER : hrsAtOld,
            newCappedHours: autoPayroll ? Number.MAX_SAFE_INTEGER : hrsAtNew,
          });
          const isStillAccruing = !autoPayroll && isCurrentPeriod
            && (splitAccrual.oldEarnedDayUnits + splitAccrual.newEarnedDayUnits) > 0
            && (splitAccrual.oldEarnedDayUnits + splitAccrual.newEarnedDayUnits) < splitAccrual.totalScheduledDays;

          // Split OT by date so pre-raise OT uses old OT rate, post-raise uses new
          const oldHourlyForOT = (beforeChange?.hourly_rate) || oldMonthly / 176;
          const newHourlyForOT = changeInPeriod.hourly_rate || newMonthly / 176;
          const otDates = overtimeByDate[c.id] || {};
          let otAtOld = 0;
          let otAtNew = 0;
          for (const [date, ot] of Object.entries(otDates)) {
            if (date < changeInPeriod.effective_date) otAtOld += ot;
            else otAtNew += ot;
          }
          derivedHourlyRate = newHourlyForOT;
          overtimePay = computeSplitOTPayFromDates(otDates, changeInPeriod.effective_date, oldHourlyForOT, newHourlyForOT, rawHoursByDate[c.id], isRestDayByUser[c.id], trackedDatesByUser[c.id]);
          pay = splitAccrual.accruedPay;
          accrualTotalOriginalCurrency = splitAccrual.oldPortion + splitAccrual.newPortion;
          proratedNote = `${splitAccrual.oldEarnedDayUnits.toFixed(2)}/${splitAccrual.oldScheduledDays} earned days @ ₱${oldMonthly.toLocaleString()}/mo · ${splitAccrual.newEarnedDayUnits.toFixed(2)}/${splitAccrual.newScheduledDays} earned days @ ₱${newMonthly.toLocaleString()}/mo${isStillAccruing ? ' · accruing' : ''}`;
        } else {
          // Hourly: split hours by date
          const datesMap = hoursByDate[c.id] || {};
          let hrsAtOld = 0;
          let hrsAtNew = 0;
          for (const [date, h] of Object.entries(datesMap)) {
            if (date < changeInPeriod.effective_date) hrsAtOld += h;
            else hrsAtNew += h;
          }
          derivedHourlyRate = newHourly;
          overtimePay = computeOTPayFromDates(overtimeByDate[c.id] || {}, newHourly, rawHoursByDate[c.id], isRestDayByUser[c.id], trackedDatesByUser[c.id]);
          pay = hrsAtOld * oldHourly + hrsAtNew * newHourly;
          proratedNote = `${hrsAtOld.toFixed(1)}h @ ₱${oldHourly}/hr · ${hrsAtNew.toFixed(1)}h @ ₱${newHourly}/hr`;
        }
      } else {
        // No change in period — use rate in effect at period start (or current hub_users rate)
        const effectiveRate = rateAtStart || null;
        const monthly = effectiveRate?.monthly_rate ?? c.monthly_rate ?? 0;
        const hourly  = effectiveRate?.hourly_rate  ?? c.hourly_rate  ?? 0;

        // Fixed: OT rate = explicit hourly_rate if set, else monthly/176.
        // Hourly: always fall back to c.hourly_rate if rate history gives 0
        // (rate history rows can have hourly_rate=0 when created as fixed type).
        derivedHourlyRate = payType === 'fixed'
          ? (hourly || monthly / 176)
          : (hourly || c.hourly_rate || 0);

        if (payType === 'hourly') {
          overtimePay = computeOTPayFromDates(overtimeByDate[c.id] || {}, derivedHourlyRate, rawHoursByDate[c.id], isRestDayByUser[c.id], trackedDatesByUser[c.id]);
          pay = hrs.capped * derivedHourlyRate;
        } else {
          overtimePay = computeOTPayFromDates(overtimeByDate[c.id] || {}, derivedHourlyRate, rawHoursByDate[c.id], isRestDayByUser[c.id], trackedDatesByUser[c.id]);
          const today = localToday();
          const isCurrentPeriod = today >= selectedPeriod.start && today <= selectedPeriod.end;
          const autoPayroll = isAutoPayrollContractor(c as Contractor);
          const fixedAccrual = computeFixedAccrual({
            periodStart: selectedPeriod.start,
            periodEnd: selectedPeriod.end,
            monthlyRate: monthly,
            workDays: c.work_days,
            cappedHours: autoPayroll ? Number.MAX_SAFE_INTEGER : hrs.capped,
          });
          const isStillAccruing = !autoPayroll && isCurrentPeriod
            && fixedAccrual.earnedDayUnits > 0
            && fixedAccrual.earnedDayUnits < fixedAccrual.totalScheduledDays;
          pay = fixedAccrual.accruedPay;
          prorated = true;
          accrualTotalOriginalCurrency = fixedAccrual.fullPeriodPay;
          proratedNote = autoPayroll
            ? `auto-included full cutoff`
            : `${fixedAccrual.earnedDayUnits.toFixed(2)}/${fixedAccrual.totalScheduledDays} earned days${isStillAccruing ? ' · accruing' : ''}`;
        }
      }

      const isUSD = c.currency === 'USD';
      const payInPHP = isUSD ? pay * usdRate : pay;

      const isAccruing = prorated && proratedNote?.includes('accruing');

      // Per-day breakdown for the expandable row — days with logged hours OR paid
      // leave, sorted chronologically. Billed + OT shown; raw kept for the
      // undertime flag. billedByDate already includes credited leave hours.
      const billedByDate = hoursByDate[c.id] || {};
      const rawByDate = rawHoursByDate[c.id] || {};
      const otByDate = overtimeByDate[c.id] || {};
      const manualDates = manualByDate[c.id] || {};
      const leaveTypes = leaveTypeByDate[c.id] || {};
      const dailyBreakdown: DayHours[] = Array.from(
        new Set([...Object.keys(billedByDate), ...Object.keys(rawByDate), ...Object.keys(leaveTypes)]),
      )
        .sort()
        .map((date) => ({
          date,
          billed: parseFloat((billedByDate[date] || 0).toFixed(2)),
          raw: parseFloat((rawByDate[date] || 0).toFixed(2)),
          overtime: parseFloat((otByDate[date] || 0).toFixed(2)),
          manual: !!manualDates[date],
          leaveType: leaveTypes[date],
        }));

      return {
        contractor: c as Contractor,
        hours: parseFloat(hrs.raw.toFixed(2)),
        cappedHours: parseFloat(hrs.capped.toFixed(2)),
        overtimeHours: parseFloat(hrs.overtime.toFixed(2)),
        overtimePay: parseFloat((isUSD ? overtimePay * usdRate : overtimePay).toFixed(2)),
        derivedHourlyRate: parseFloat(derivedHourlyRate.toFixed(2)),
        pay: payInPHP,
        payOriginalCurrency: isUSD ? parseFloat(pay.toFixed(2)) : undefined,
        days: hrs.days,
        dailyBreakdown,
        prorated,
        proratedNote,
        accruing: isAccruing,
        accrualTotal: isAccruing && accrualTotalOriginalCurrency !== undefined
          ? (isUSD ? accrualTotalOriginalCurrency * usdRate : accrualTotalOriginalCurrency)
          : undefined,
      };
    });

    result.sort((a, b) => b.pay - a.pay);
    setRows(result);
    } catch (e) {
      console.error('Payroll calculation failed:', e);
      setPayrollError('Could not calculate payroll — the figures below may be stale or incomplete. Refresh to retry.');
    } finally {
      setLoading(false);
    }
  };

  const totalPay = rows.reduce((s, r) => {
    const p = payoutsMap[r.contractor.id];
    const override = rowOverrides[r.contractor.id];
    const basePay = override?.pay !== undefined ? override.pay : r.pay;
    const otPay = r.overtimePay;
    const adjs: any[] = p?.adjustments || [];
    const adjTotal = adjs.reduce((as: number, a: any) => as + (a.amount || 0), 0);
    return s + basePay + otPay + adjTotal;
  }, 0);
  const isSelectedPeriodClosed = closedPeriods.has(selectedPeriod.start);
  const getRowDisplayTotal = (row: PayRow) => {
    const payout = payoutsMap[row.contractor.id];
    if (isSelectedPeriodClosed && payout?.final_payout != null) {
      return Number(payout.final_payout);
    }

    const override = rowOverrides[row.contractor.id];
    const basePay = override?.pay !== undefined ? override.pay : row.pay;
    const otPay = row.overtimePay;
    const adjs: any[] = payout?.adjustments || [];
    const adjTotal = adjs.reduce((s: number, a: any) => s + (a.amount || 0), 0);
    return basePay + otPay + adjTotal;
  };
  const displayTotalPay = isSelectedPeriodClosed && batch?.total_amount != null
    ? Number(batch.total_amount)
    : rows.reduce((s, r) => s + getRowDisplayTotal(r), 0);

  useEffect(() => {
    if (rows.length > 0) {
      supabase.from('hub_payroll_cache').upsert(
        { period_start: selectedPeriod.start, computed_total: displayTotalPay, updated_at: new Date().toISOString() },
        { onConflict: 'period_start' }
      );
    }
  }, [displayTotalPay, selectedPeriod.start]);
  const totalHours = rows.reduce((s, r) => s + r.cappedHours, 0);
  const hourlyCount = rows.filter(r => r.contractor.payment_type === 'hourly').length;
  const fixedCount = rows.filter(r => r.contractor.payment_type === 'fixed').length;

  const downloadPDF = () => {
    const logoUrl = `${window.location.origin}/images/fs-architects-logo-horizontal.png`;

    const tableRows = rows.map(r => {
      const c = r.contractor;
      const isFixed = c.payment_type === 'fixed';
      const rate = isFixed
        ? `${fmt(c.monthly_rate || 0, 'PHP')}/mo`
        : `${fmt(c.hourly_rate || 0, 'PHP')}/hr`;
      const otCell = r.overtimeHours > 0
        ? `+${r.overtimeHours}h (${fmt(r.overtimePay, 'PHP')})`
        : '—';
      const total = getRowDisplayTotal(r);
      return `
        <tr>
          <td>${c.full_name}</td>
          <td>${c.department || '—'}</td>
          <td>${isFixed ? 'Fixed' : 'Hourly'}</td>
          <td>${rate}</td>
          <td>${r.days}</td>
          <td>${r.hours.toFixed(2)}h</td>
          <td>${r.cappedHours.toFixed(2)}h</td>
          <td>${otCell}</td>
          <td><strong>${fmt(total, 'PHP')}</strong></td>
        </tr>`;
    }).join('');

    const printHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Payroll — ${selectedPeriod.label}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #111827; background: #fff; padding: 40px; }
    .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 3px solid #1c2b3a; padding-bottom: 20px; margin-bottom: 28px; }
    .header img { height: 48px; object-fit: contain; }
    .header-right { text-align: right; }
    .header-right h1 { font-size: 22px; font-weight: 700; color: #111827; }
    .header-right p { font-size: 13px; color: #6b7280; margin-top: 4px; }
    .summary { display: flex; gap: 24px; margin-bottom: 24px; }
    .summary-item { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px 18px; }
    .summary-item .label { font-size: 11px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.05em; }
    .summary-item .value { font-size: 18px; font-weight: 700; color: #111827; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { background: #1c2b3a; color: #fff; padding: 10px 12px; text-align: left; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }
    td { padding: 10px 12px; border-bottom: 1px solid #f3f4f6; }
    tr:nth-child(even) td { background: #fafafa; }
    tfoot td { background: #f3f4f6 !important; font-weight: 700; border-top: 2px solid #e5e7eb; }
    .accent { color: #1c2b3a; }
    .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #9ca3af; text-align: center; }
    @media print { body { padding: 20px; } }
  </style>
</head>
<body>
  <div class="header">
    <img src="${logoUrl}" alt="FS Architects" onerror="this.style.display='none'" />
    <div class="header-right">
      <h1>Payroll Report</h1>
      <p>Period: <strong>${selectedPeriod.label}</strong></p>
      <p>Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
    </div>
  </div>
  <div class="summary">
    <div class="summary-item">
      <div class="label">Total Payroll</div>
      <div class="value accent">${fmt(displayTotalPay, 'PHP')}</div>
    </div>
    <div class="summary-item">
      <div class="label">Total Hours</div>
      <div class="value">${totalHours.toFixed(1)}h</div>
    </div>
    <div class="summary-item">
      <div class="label">Employees</div>
      <div class="value">${rows.length}</div>
    </div>
    <div class="summary-item">
      <div class="label">Hourly / Fixed</div>
      <div class="value">${hourlyCount} / ${fixedCount}</div>
    </div>
  </div>
  <table>
    <thead>
      <tr>
        <th>Employee</th>
        <th>Department</th>
        <th>Type</th>
        <th>Rate</th>
        <th>Days</th>
        <th>Raw Hours</th>
        <th>Billed Hours</th>
        <th>Overtime</th>
        <th>Pay</th>
      </tr>
    </thead>
    <tbody>${tableRows}</tbody>
    <tfoot>
      <tr>
        <td colspan="6">Total</td>
        <td>${totalHours.toFixed(2)}h</td>
        <td></td>
        <td>${fmt(displayTotalPay, 'PHP')}</td>
      </tr>
    </tfoot>
  </table>
  <div class="footer">FS Architects · Payroll · ${selectedPeriod.label}</div>
</body>
</html>`;
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;width:0;height:0;border:0;left:-9999px;top:-9999px;';
    document.body.appendChild(iframe);
    const iframeDoc = iframe.contentDocument || (iframe.contentWindow as any)?.document;
    if (iframeDoc) {
      iframeDoc.open();
      iframeDoc.write(printHtml);
      iframeDoc.close();
      setTimeout(() => {
        (iframe.contentWindow as any)?.focus();
        (iframe.contentWindow as any)?.print();
        setTimeout(() => { if (iframe.parentNode) iframe.parentNode.removeChild(iframe); }, 2000);
      }, 400);
    }

    // (no text-summary upload — PDF only)
  };

  return (
    <AdminLayout title="Payroll">
      <div className="space-y-5">

        {/* Calculation error — figures may be stale/incomplete */}
        {payrollError && (
          <div className="flex items-center gap-3 rounded-xl px-4 py-3 border bg-red-50 border-red-200">
            <i className="ri-error-warning-line text-lg flex-shrink-0 text-red-500"></i>
            <p className="text-xs font-medium text-red-700 flex-1">{payrollError}</p>
            <button onClick={refreshPayrollPage} className="text-xs font-semibold text-red-600 hover:text-red-800 underline cursor-pointer whitespace-nowrap">Retry</button>
          </div>
        )}

        {/* Payroll cutoff banner — hidden for closed periods */}
        {!closedPeriods.has(selectedPeriod.start) && (() => {
          const cutoff = getNextPayrollCutoff();
          if (cutoff.daysAway > 3) return null;
          const urgent = cutoff.daysAway <= 3;
          const soon = cutoff.daysAway <= 7;
          return (
            <div className={`flex items-center gap-3 rounded-xl px-4 py-3 border ${urgent ? 'bg-red-50 border-red-200' : soon ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-200'}`}>
              <i className={`ri-calendar-check-line text-lg flex-shrink-0 ${urgent ? 'text-red-500' : soon ? 'text-amber-500' : 'text-gray-400'}`}></i>
              <div className="min-w-0">
                <p className={`text-xs font-semibold ${urgent ? 'text-red-700' : soon ? 'text-amber-700' : 'text-gray-600'}`}>
                  Payroll processing deadline — {cutoff.label}
                </p>
                <p className={`text-xs ${urgent ? 'text-red-500' : soon ? 'text-amber-500' : 'text-gray-400'}`}>
                  {cutoff.daysAway === 0 ? 'Due today — review and approve all pending payslips' : cutoff.daysAway === 1 ? 'Due tomorrow — ensure all submissions are reviewed' : `${cutoff.daysAway} days remaining to process this period`}
                </p>
              </div>
              {urgent && <span className="ml-auto text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-red-100 text-red-600 flex-shrink-0">Urgent</span>}
              {!urgent && soon && <span className="ml-auto text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-amber-100 text-amber-600 flex-shrink-0">Soon</span>}
            </div>
          );
        })()}

        {/* Header card */}
        <div className="bg-[#1c2b3a] rounded-2xl p-5 text-white">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            {/* Left: period selector + KPIs */}
            <div className="flex-1 min-w-0">
              {/* Period controls */}
              <div className="flex items-center gap-2 flex-wrap mb-5">
                <select
                  value={selectedYear}
                  onChange={e => handleYearChange(e.target.value)}
                  className="bg-white/10 border border-white/10 text-white text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-white/30 cursor-pointer appearance-none"
                >
                  {years.map(y => <option key={y} value={y} className="text-gray-900 bg-white">{y}</option>)}
                </select>
                <select
                  value={selectedMonth}
                  onChange={e => handleMonthChange(e.target.value)}
                  className="bg-white/10 border border-white/10 text-white text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-white/30 cursor-pointer appearance-none"
                >
                  {monthsInYear.map(m => (
                    <option key={m} value={m} className="text-gray-900 bg-white">{FULL_MONTHS[parseInt(m.slice(5, 7)) - 1]}</option>
                  ))}
                </select>
                <select
                  value={selectedPeriod.start}
                  onChange={e => {
                    const picked = periodsInMonth.find(p => p.start === e.target.value);
                    if (picked) setSelectedPeriod(picked);
                  }}
                  className="min-w-[220px] bg-white/10 border border-white/10 text-white text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-white/30 cursor-pointer appearance-none"
                >
                  {openPeriodsInMonth.map((p) => (
                    <option key={p.start} value={p.start} className="text-gray-900 bg-white">
                      {p.label}
                    </option>
                  ))}
                  {archivedPeriodsInMonth.length > 0 && (
                    <option disabled className="text-gray-500 bg-white">────────</option>
                  )}
                  {archivedPeriodsInMonth.map((p) => (
                    <option key={p.start} value={p.start} className="text-gray-900 bg-white">
                      {p.label} (Archived)
                    </option>
                  ))}
                </select>
                <button
                  onClick={refreshPayrollPage}
                  disabled={refreshing || loading || workflowLoading}
                  title="Refresh payroll data and submission statuses"
                  className="bg-white/10 border border-white/10 text-white/60 hover:text-white hover:bg-white/20 text-xs rounded-lg px-2.5 py-1.5 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <i className={`${refreshing ? 'ri-loader-4-line animate-spin' : 'ri-refresh-line'}`}></i>
                </button>
              </div>

              {/* KPIs inline */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { label: 'Total Payroll', value: fmt(displayTotalPay, 'PHP'), accent: true },
                  { label: 'Total Hours', value: `${totalHours.toFixed(1)}h` },
                  { label: 'Employees', value: `${rows.length}` },
                  { label: 'Approved', value: `${Object.values(payoutsMap).filter((p: any) => p?.status === 'hr_approved' || p?.status === 'owner_approved' || p?.status === 'paid').length}` },
                ].map((k) => (
                  <div key={k.label}>
                    <p className="text-white/40 text-[11px] uppercase tracking-wide mb-1">{k.label}</p>
                    <p className={`text-lg font-bold tabular-nums leading-tight ${k.accent ? 'text-emerald-400' : 'text-white'}`}>{k.value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: export + USD rate */}
            <div className="flex flex-col gap-3 sm:items-end flex-shrink-0">
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const headers = ['Employee', 'Department', 'Type', 'Rate', 'Days', 'Raw Hours', 'Billed Hours', 'Overtime Hours', 'Overtime Pay (PHP)', 'Pay (PHP)'];
                    const csvRows = rows.map(r => {
                      const c = r.contractor;
                      const p = payoutsMap[c.id];
                      const adjs: any[] = p?.adjustments || [];
                      const adjTotal = adjs.reduce((s: number, a: any) => s + (a.amount || 0), 0);
                      const override = rowOverrides[c.id];
                      const displayPay = override?.pay !== undefined ? override.pay : r.pay;
                      const displayOT = r.overtimePay;
                      const total = getRowDisplayTotal(r);
                      const rate = c.payment_type === 'fixed' ? `${c.monthly_rate}/mo` : `${c.hourly_rate}/hr`;
                      return [c.full_name, c.department || '', c.payment_type, rate, r.days, r.hours.toFixed(2), r.cappedHours.toFixed(2), r.overtimeHours.toFixed(2), r.overtimePay.toFixed(2), total.toFixed(2)];
                    });
                    const csv = [headers, ...csvRows].map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
                    const blob = new Blob([csv], { type: 'text/csv' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `payroll-${selectedPeriod.label.replace(/[^a-z0-9]/gi, '-')}.csv`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                    const year = String(new Date().getFullYear());
                    supabase.functions.invoke('upload-to-drive', {
                      body: {
                        filename: `Payroll-${selectedPeriod.label.replace(/[^a-z0-9]/gi, '-')}.csv`,
                        mimeType: 'text/csv',
                        base64Content: btoa(unescape(encodeURIComponent(csv))),
                        type: 'payroll',
                        meta: { year },
                      },
                    }).catch(console.error);
                  }}
                  disabled={loading || rows.length === 0}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white/10 text-white/70 hover:bg-white/20 hover:text-white transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <i className="ri-file-excel-line text-sm"></i>
                  CSV
                </button>
                <button
                  onClick={downloadPDF}
                  disabled={loading || rows.length === 0}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#1c2b3a] text-white hover:bg-[#0f1c28] transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <i className="ri-file-pdf-line text-sm"></i>
                  PDF
                </button>
                {closedPeriods.has(selectedPeriod.start) && (
                  <button
                    onClick={savePayrollToDrive}
                    disabled={loading || rows.length === 0 || savingToDrive}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${
                      isPdfSavedToDrive
                        ? 'bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/20 hover:text-white'
                        : 'bg-white/10 text-white/70 hover:bg-white/20 hover:text-white'
                    }`}
                    title={isPdfSavedToDrive ? 'This closed payroll PDF has already been saved to Google Drive' : 'Save the closed payroll report as a PDF in Google Drive'}
                  >
                    <i className={`${savingToDrive ? 'ri-loader-4-line animate-spin' : isPdfSavedToDrive ? 'ri-check-line' : 'ri-google-fill'} text-sm`}></i>
                    {savingToDrive ? 'Saving…' : isPdfSavedToDrive ? 'Already Saved to Drive' : 'Save PDF to Drive'}
                  </button>
                )}
              </div>

              {rows.some(r => r.contractor.currency === 'USD') && (
                <div className="flex items-center gap-2 bg-white/10 rounded-xl px-3 py-2">
                  <i className="ri-exchange-dollar-line text-white/40 text-sm"></i>
                  <span className="text-white/50 text-xs">1 USD =</span>
                  {isOwner ? (
                    <div className="flex items-center gap-0.5">
                      <span className="text-white/50 text-xs">₱</span>
                      <input
                        type="number"
                        value={usdRate}
                        onChange={e => setUsdRate(Number(e.target.value))}
                        onBlur={e => setSetting('usd_rate', e.target.value)}
                        step="0.01"
                        min="1"
                        className="w-16 text-xs font-bold text-white bg-white/10 border border-white/20 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-white/30"
                      />
                    </div>
                  ) : (
                    <span className="text-white text-xs font-bold">₱{usdRate}</span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Info strip */}
          <div className="mt-4 pt-4 border-t border-white/10 flex items-center gap-2">
            <i className="ri-information-line text-white/30 text-sm flex-shrink-0"></i>
            <p className="text-white/30 text-[11px]">
              Hours from Slack · 8h daily cap · Fixed-rate employees earn <strong className="text-white/40 font-medium">day equivalents from capped hours</strong>
            </p>
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <i className="ri-loader-4-line animate-spin text-2xl text-gray-300"></i>
          </div>
        ) : (
          <>
          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {rows.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-100 p-8 text-center text-sm text-gray-400">No employee data found</div>
            ) : rows.map((r) => {
              const c = r.contractor;
              const isFixed = c.payment_type === 'fixed' || c.payment_type === 'fixed_flexible';
              const isUSD = c.currency === 'USD';
              const rateLabel = isFixed
                ? isUSD ? `$${(c.monthly_rate || 0).toLocaleString()}/mo` : `₱${(c.monthly_rate || 0).toLocaleString('en-PH', { maximumFractionDigits: 0 })}/mo`
                : isUSD ? `$${c.hourly_rate}/hr` : `₱${(c.hourly_rate || 0).toLocaleString('en-PH', { maximumFractionDigits: 0 })}/hr`;
              const override = rowOverrides[c.id];
              const displayPay = override?.pay !== undefined ? override.pay : r.pay;
              const displayHours = override?.hours !== undefined ? override.hours : r.cappedHours;
              const displayDays = override?.days !== undefined ? override.days : r.days;
              const displayOTHours = override?.overtimeHours !== undefined ? override.overtimeHours : r.overtimeHours;
              const displayProratedNote = override?.proratedNote !== undefined ? override.proratedNote : r.proratedNote;
              const p = payoutsMap[c.id];
              // If already paid but new hours exist (post-payment), reset to pending so admin can approve the new hours
              const effectivePayout = (p?.status === 'paid' && r.cappedHours > 0) ? null : p;
              const adjs: { label: string; amount: number }[] = p?.adjustments || [];
              const adjTotal = adjs.reduce((s, i) => s + i.amount, 0);
              const displayOTPay = r.overtimePay;
              const total = getRowDisplayTotal(r);
              const dispute = p ? disputesMap[p.id] : null;
              const hoursExceeded = r.hours > r.cappedHours;

              return (
                <div key={c.id} className="bg-white rounded-xl border border-gray-100 p-4">
                  {/* Contractor row */}
                  <div className="flex items-center gap-3 mb-3">
                    <Avatar name={c.full_name} avatar_url={c.avatar_url} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="font-semibold text-gray-900 text-sm truncate">{c.full_name}</p>
                        {override && <span className="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-full font-medium flex-shrink-0">edited</span>}
                        {dispute && <span className="text-[10px] px-1.5 py-0.5 bg-rose-100 text-rose-600 rounded-full font-medium flex items-center gap-0.5 flex-shrink-0"><i className="ri-flag-fill text-[9px]"></i>flagged</span>}
                      </div>
                      <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${isFixed ? 'bg-purple-50 text-purple-600' : 'bg-sky-50 text-sky-600'}`}>
                          {c.payment_type === 'fixed' ? 'Fixed' : c.payment_type === 'fixed_flexible' ? 'Flex' : 'Hourly'}
                        </span>
                        <span className="text-xs text-gray-400">{rateLabel}</span>
                        <span className="text-gray-200">·</span>
                        <span className="text-xs text-gray-400">
                          {isUSD
                            ? `$${(r.derivedHourlyRate * 1.25).toFixed(2)}/$${(r.derivedHourlyRate * 1.30).toFixed(2)} OT`
                            : `₱${(r.derivedHourlyRate * 1.25).toFixed(2)}/₱${(r.derivedHourlyRate * 1.30).toFixed(2)} OT`}
                        </span>
                        {c.department && <><span className="text-gray-200">·</span><span className="text-xs text-gray-400">{c.department}</span></>}
                      </div>
                    </div>
                    <button onClick={() => setBankInfoContractor(c)} className="text-gray-300 hover:text-[#1c2b3a] cursor-pointer flex-shrink-0">
                      <i className="ri-bank-line text-sm"></i>
                    </button>
                    <button onClick={() => openEditRow(r)} className="text-gray-300 hover:text-[#1c2b3a] cursor-pointer flex-shrink-0">
                      <i className="ri-edit-line text-sm"></i>
                    </button>
                    <button onClick={() => toggleRowExpanded(c.id)} className="text-gray-300 hover:text-[#1c2b3a] cursor-pointer flex-shrink-0" title="Show daily hours" aria-expanded={expandedRows.has(c.id)}>
                      <i className={`ri-arrow-down-s-line text-base transition-transform ${expandedRows.has(c.id) ? 'rotate-180' : ''}`}></i>
                    </button>
                  </div>

                  {/* Daily hours breakdown */}
                  {expandedRows.has(c.id) && (
                    <div className="mb-3 pb-3 border-b border-gray-50">
                      <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-1.5">Daily hours · {selectedPeriod.label}</p>
                      <DailyBreakdownPanel days={r.dailyBreakdown} />
                    </div>
                  )}

                  {/* Stats row */}
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <div className="bg-gray-50 rounded-lg px-3 py-2">
                      <p className="text-[10px] text-gray-400 mb-0.5">Billed</p>
                      <p className="text-sm font-semibold text-gray-900">{displayHours.toFixed(1)}h</p>
                      <p className="text-[10px] text-gray-400">{displayDays}d{hoursExceeded ? <span className="text-amber-500 ml-0.5">⚠</span> : ''}</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg px-3 py-2">
                      <p className="text-[10px] text-gray-400 mb-0.5">Overtime</p>
                      {displayOTHours > 0 ? (
                        <>
                          <p className="text-sm font-semibold text-amber-600">+{displayOTHours}h</p>
                          <p className="text-[10px] text-amber-600">{fmt(displayOTPay, 'PHP')}</p>
                        </>
                      ) : (
                        <p className="text-sm text-gray-300">—</p>
                      )}
                    </div>
                    <div className="bg-gray-50 rounded-lg px-3 py-2">
                      <p className="text-[10px] text-gray-400 mb-0.5">Pay</p>
                      <p className="text-sm font-bold text-gray-900 tabular-nums">{fmt(total, 'PHP')}</p>
                      {(r.prorated || r.accruing) && (
                        <p className="text-[10px] text-sky-500">{r.accruing ? 'accruing' : 'prorated'}</p>
                      )}
                    </div>
                  </div>

                  {/* Action row */}
                  <div className="flex items-center justify-between pt-3 border-t border-gray-50">
                    {(() => {
                      if (isAutoPayrollContractor(c)) return <span className="text-xs text-emerald-600 font-medium">Auto Included</span>;
                      if (!effectivePayout || effectivePayout.status === 'pending') return <span className="text-xs text-gray-400">Pending</span>;
                      const cfg = {
                        submitted:   { label: 'Submitted',   cls: 'bg-amber-100 text-amber-700' },
                        hr_approved: { label: 'HR Approved', cls: 'bg-sky-100 text-sky-700' },
                        paid:        { label: 'Paid',        cls: 'bg-emerald-100 text-emerald-700' },
                      }[effectivePayout.status as string] || { label: effectivePayout.status, cls: 'bg-gray-100 text-gray-500' };
                      return (
                        <div className="flex items-center gap-1.5">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.cls}`}>{cfg.label}</span>
                          {effectivePayout.status === 'paid' && effectivePayout.payslip_sent_at && (
                            <span title={`Receipt sent ${new Date(effectivePayout.payslip_sent_at).toLocaleString()}`} className="text-emerald-400"><i className="ri-mail-check-line text-xs"></i></span>
                          )}
                          {effectivePayout.status === 'paid' && !effectivePayout.payslip_sent_at && (
                            <span title="Receipt email pending" className="text-amber-400"><i className="ri-mail-line text-xs"></i></span>
                          )}
                        </div>
                      );
                    })()}
                    <div className="flex items-center gap-2">
                      {confirmCancelId === c.id ? (
                        <>
                          <span className="text-xs text-gray-500">Undo?</span>
                          <button onClick={() => cancelPayout(c.id)} disabled={workflowLoading} className="text-xs px-2 py-1 bg-rose-500 text-white rounded-lg cursor-pointer disabled:opacity-40">Yes</button>
                          <button onClick={() => setConfirmCancelId(null)} className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded-lg cursor-pointer">No</button>
                        </>
                      ) : (
                        <>
                          {!isAutoPayrollContractor(c) && effectivePayout && effectivePayout.status !== 'pending' && (
                            <button onClick={() => setConfirmCancelId(c.id)} className="text-gray-300 hover:text-rose-400 cursor-pointer">
                              <i className="ri-arrow-go-back-line text-sm"></i>
                            </button>
                          )}
                          {(() => {
                            const batchApproved = batch?.status === 'owner_approved';
                            if (isAutoPayrollContractor(c)) return null;
                            if (effectivePayout?.status === 'paid') return <i className="ri-checkbox-circle-fill text-emerald-400 text-base"></i>;
                            if (batchApproved && effectivePayout?.status === 'hr_approved') return (
                              <button onClick={() => markPaid(c.id)} disabled={workflowLoading || batch?.status === 'closed'} className="text-xs px-3 py-1.5 bg-emerald-500 text-white rounded-lg cursor-pointer disabled:opacity-40 font-medium">Mark Paid</button>
                            );
                            if (!effectivePayout || effectivePayout.status === 'pending' || effectivePayout.status === 'submitted') return (
                              <button onClick={() => approvePayout(c.id, r.pay)} disabled={workflowLoading || !!batch || batch?.status === 'closed'} className="text-xs px-3 py-1.5 bg-[#111827] text-white rounded-lg cursor-pointer disabled:opacity-40 font-medium">Approve</button>
                            );
                            return null;
                          })()}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            {rows.length > 0 && (
              <div className="bg-gray-50 rounded-xl border border-gray-100 px-4 py-3 flex justify-between items-center">
                <span className="text-sm font-semibold text-gray-700">Total</span>
                <div className="flex items-center gap-3">
                  {!batch && rows.some(r => { const p = payoutsMap[r.contractor.id]; return !isAutoPayrollContractor(r.contractor) && (!p || p.status === 'pending' || p.status === 'submitted'); }) && (
                    <button onClick={approveAll} disabled={workflowLoading} className="text-xs px-3 py-1.5 bg-[#111827] text-white rounded-lg cursor-pointer disabled:opacity-40 font-medium whitespace-nowrap">
                      Approve All
                    </button>
                  )}
                  <div className="text-right">
                    <p className="text-sm font-bold text-gray-900">{fmt(displayTotalPay, 'PHP')}</p>
                    <p className="text-xs text-gray-400">{totalHours.toFixed(1)}h</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/80">
                    {[
                      { label: 'Employee', cls: 'w-64' },
                      { label: 'Hours', cls: 'w-36' },
                      { label: 'Overtime', cls: 'w-32' },
                      { label: 'Pay', cls: 'w-48' },
                      { label: '', cls: 'w-36' },
                    ].map(h => (
                      <th key={h.label} className={`text-left text-xs text-gray-400 font-medium px-5 py-3.5 ${h.cls}`}>{h.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center py-12 text-gray-400 text-sm">
                        No employee data found
                      </td>
                    </tr>
                  ) : rows.map((r) => {
                    const c = r.contractor;
                    const isFixed = c.payment_type === 'fixed' || c.payment_type === 'fixed_flexible';
                    const isUSD = c.currency === 'USD';
                    const rateLabel = isFixed
                      ? isUSD
                        ? `$${(c.monthly_rate || 0).toLocaleString()}/mo`
                        : `₱${(c.monthly_rate || 0).toLocaleString('en-PH', { maximumFractionDigits: 0 })}/mo`
                      : isUSD
                        ? `$${c.hourly_rate}/hr`
                        : `₱${(c.hourly_rate || 0).toLocaleString('en-PH', { maximumFractionDigits: 0 })}/hr`;
                    const otRateLabel = r.derivedHourlyRate > 0
                      ? isUSD
                        ? `$${(r.derivedHourlyRate * 1.25).toFixed(2)}/$${(r.derivedHourlyRate * 1.30).toFixed(2)} OT`
                        : `₱${(r.derivedHourlyRate * 1.25).toFixed(2)}/₱${(r.derivedHourlyRate * 1.30).toFixed(2)} OT`
                      : null;
                    const hoursExceeded = r.hours > r.cappedHours;
                    const override = rowOverrides[c.id];
                    const displayPay = override?.pay !== undefined ? override.pay : r.pay;
                    const displayHours = override?.hours !== undefined ? override.hours : r.cappedHours;
                    const displayDays = override?.days !== undefined ? override.days : r.days;
                    const displayOTHours = override?.overtimeHours !== undefined ? override.overtimeHours : r.overtimeHours;
                    const displayProratedNote = override?.proratedNote !== undefined ? override.proratedNote : r.proratedNote;
                    const p = payoutsMap[c.id];
                    const effectivePayout = (p?.status === 'paid' && r.cappedHours > 0) ? null : p;
                    const adjs: { label: string; amount: number }[] = p?.adjustments || [];
                    const adjTotal = adjs.reduce((s: number, i: { label: string; amount: number }) => s + i.amount, 0);
                    const displayOTPay = r.overtimePay;
                    const total = getRowDisplayTotal(r);
                    const dispute = p ? disputesMap[p.id] : null;

                    return (
                      <Fragment key={c.id}>
                      <tr className="hover:bg-gray-50/60 transition-colors group cursor-pointer" onClick={() => toggleRowExpanded(c.id)}>
                        {/* Contractor */}
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <i className={`ri-arrow-down-s-line text-gray-300 group-hover:text-gray-500 transition-transform flex-shrink-0 ${expandedRows.has(c.id) ? 'rotate-180' : ''}`}></i>
                            <Avatar name={c.full_name} avatar_url={c.avatar_url} />
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <p className="font-semibold text-gray-900 text-sm leading-tight truncate">{c.full_name}</p>
                                {override && <span className="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-full font-medium flex-shrink-0">edited</span>}
                                {dispute && <span className="text-[10px] px-1.5 py-0.5 bg-rose-100 text-rose-600 rounded-full font-medium flex items-center gap-0.5 flex-shrink-0"><i className="ri-flag-fill text-[9px]"></i>flagged</span>}
                              </div>
                              <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
                                {c.department && <span className="text-xs text-gray-400 truncate">{c.department}</span>}
                                <span className="text-gray-200 flex-shrink-0">·</span>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${isFixed ? 'bg-purple-50 text-purple-600' : 'bg-sky-50 text-sky-600'}`}>
                                  {c.payment_type === 'fixed' ? 'Fixed' : c.payment_type === 'fixed_flexible' ? 'Flex' : 'Hourly'}
                                </span>
                                <span className="text-xs text-gray-400 flex-shrink-0">{rateLabel}</span>
                                {otRateLabel && <><span className="text-gray-200 flex-shrink-0">·</span><span className="text-xs text-gray-400 flex-shrink-0">{otRateLabel}</span></>}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Hours */}
                        <td className="px-5 py-4">
                          <div>
                            <p className="text-sm font-semibold text-gray-900">{displayHours.toFixed(2)}h</p>
                            <p className="text-xs text-gray-400 mt-0.5">{displayDays} day{displayDays !== 1 ? 's' : ''}</p>
                            {hoursExceeded && (
                              <p className="text-[10px] text-amber-500 mt-0.5 flex items-center gap-0.5">
                                <i className="ri-error-warning-line"></i> Raw {r.hours.toFixed(2)}h capped
                              </p>
                            )}
                            {override?.hours !== undefined && (
                              <p className="text-[10px] text-gray-400 line-through">{r.cappedHours.toFixed(2)}h</p>
                            )}
                          </div>
                        </td>

                        {/* Overtime */}
                        <td className="px-5 py-4">
                          {displayOTHours > 0 ? (
                            <div>
                              <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
                                +{displayOTHours}h OT
                              </span>
                              <p className="text-xs text-amber-600 mt-1">
                                {isUSD
                                  ? `$${(displayOTHours * (c.hourly_rate || 0)).toFixed(2)} → ${fmt(displayOTPay, 'PHP')}`
                                  : fmt(displayOTPay, 'PHP')}
                              </p>
                            </div>
                          ) : (
                            <span className="text-gray-300 text-sm">—</span>
                          )}
                        </td>

                        {/* Pay */}
                        <td className="px-5 py-4">
                          <div>
                            <p className="text-sm font-semibold text-gray-900 tabular-nums">{fmt(total, 'PHP')}</p>
                            {/* Single metadata line */}
                            {(() => {
                              const parts: string[] = [];
                              if (r.accruing) parts.push('accruing');
                              else if (r.prorated && displayProratedNote) parts.push(displayProratedNote);
                              if (isUSD && r.payOriginalCurrency !== undefined) parts.push(`$${r.payOriginalCurrency.toFixed(2)} × ₱${usdRate.toFixed(2)}`);
                              if (r.accruing && r.accrualTotal !== undefined) parts.push(`full ${fmt(r.accrualTotal, 'PHP')}`);
                              if (isFixed && displayDays === 0 && !r.prorated) parts.push('no attendance');
                              if (parts.length === 0) return null;
                              return <p className="text-[11px] text-gray-400 mt-0.5 leading-snug">{parts.join(' · ')}</p>;
                            })()}
                            {/* Adjustments */}
                            {adjTotal !== 0 && (
                              <div className="mt-1.5 pt-1.5 border-t border-gray-100 space-y-0.5">
                                <p className="text-[10px] text-gray-400">Base {fmt(displayPay, 'PHP')}</p>
                                {adjs.map((a, i) => (
                                  <p key={i} className={`text-[10px] font-medium ${a.amount >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                                    {a.amount > 0 ? '+' : ''}{fmt(a.amount, 'PHP')} · {a.label}
                                  </p>
                                ))}
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Status + Action */}
                        <td className="px-5 py-4" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => setBankInfoContractor(c)}
                              title="View bank details"
                              className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-[#1c2b3a] hover:bg-slate-50 transition-colors cursor-pointer flex-shrink-0"
                            >
                              <i className="ri-bank-line text-sm"></i>
                            </button>
                            <button
                              onClick={() => openEditRow(r)}
                              title="Edit payroll"
                              className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-[#1c2b3a] hover:bg-slate-50 transition-colors cursor-pointer flex-shrink-0"
                            >
                              <i className="ri-edit-line text-sm"></i>
                            </button>
                            {confirmCancelId === c.id ? (
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs text-gray-500">Undo?</span>
                                <button onClick={() => cancelPayout(c.id)} disabled={workflowLoading}
                                  className="text-xs px-2 py-1 bg-rose-500 text-white rounded-lg hover:bg-rose-600 cursor-pointer disabled:opacity-40">Yes</button>
                                <button onClick={() => setConfirmCancelId(null)}
                                  className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 cursor-pointer">No</button>
                              </div>
                            ) : (
                              <>
                                {(() => {
                                  if (isAutoPayrollContractor(c)) return <span className="text-xs text-emerald-600 font-medium whitespace-nowrap">Auto Included</span>;
                                  if (!effectivePayout || effectivePayout.status === 'pending') return <span className="text-xs text-gray-400 font-medium">Pending</span>;
                                  const cfg = {
                                    submitted:   { label: 'Submitted',   cls: 'bg-amber-100 text-amber-700' },
                                    hr_approved: { label: 'HR Approved', cls: 'bg-sky-100 text-sky-700' },
                                    paid:        { label: 'Paid',        cls: 'bg-emerald-100 text-emerald-700' },
                                  }[effectivePayout.status as string] || { label: effectivePayout.status, cls: 'bg-gray-100 text-gray-500' };
                                  return (
                                    <div className="flex items-center gap-1">
                                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${cfg.cls}`}>{cfg.label}</span>
                                      {effectivePayout.status === 'paid' && effectivePayout.payslip_sent_at && (
                                        <span title={`Receipt sent ${new Date(effectivePayout.payslip_sent_at).toLocaleString()}`} className="text-emerald-400"><i className="ri-mail-check-line text-xs"></i></span>
                                      )}
                                      {effectivePayout.status === 'paid' && !effectivePayout.payslip_sent_at && (
                                        <span title="Receipt email pending" className="text-amber-400"><i className="ri-mail-line text-xs"></i></span>
                                      )}
                                    </div>
                                  );
                                })()}
                                {(() => {
                                  const batchApproved = batch?.status === 'owner_approved';
                                  if (isAutoPayrollContractor(c)) return null;
                                  if (effectivePayout?.status === 'paid') return <i className="ri-checkbox-circle-fill text-emerald-400 text-base"></i>;
                                  if (batchApproved && effectivePayout?.status === 'hr_approved') {
                                    return (
                                      <button onClick={() => markPaid(c.id)} disabled={workflowLoading || batch?.status === 'closed'}
                                        className="text-xs px-3 py-1.5 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 cursor-pointer disabled:opacity-40 whitespace-nowrap font-medium">
                                        Mark Paid
                                      </button>
                                    );
                                  }
                                  if (!effectivePayout || effectivePayout.status === 'pending' || effectivePayout.status === 'submitted') {
                                    return (
                                      <button onClick={() => approvePayout(c.id, r.pay)} disabled={workflowLoading || !!batch || batch?.status === 'closed'}
                                        className="text-xs px-3 py-1.5 bg-[#111827] text-white rounded-lg hover:bg-gray-700 cursor-pointer disabled:opacity-40 whitespace-nowrap font-medium">
                                        Approve
                                      </button>
                                    );
                                  }
                                  return null;
                                })()}
                                {!isAutoPayrollContractor(c) && effectivePayout && effectivePayout.status !== 'pending' && (
                                  <button onClick={() => setConfirmCancelId(c.id)} title="Undo"
                                    className="text-gray-200 hover:text-rose-400 cursor-pointer transition-colors opacity-0 group-hover:opacity-100">
                                    <i className="ri-arrow-go-back-line text-sm"></i>
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                      {expandedRows.has(c.id) && (
                        <tr className="bg-gray-50/40">
                          <td colSpan={5} className="px-5 pb-4 pt-0">
                            <div className="pl-11 max-w-xl">
                              <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-1.5">Daily hours · {selectedPeriod.label}</p>
                              <DailyBreakdownPanel days={r.dailyBreakdown} />
                            </div>
                          </td>
                        </tr>
                      )}
                      </Fragment>
                    );
                  })}
                </tbody>
                {rows.length > 0 && (
                  <tfoot>
                    <tr className="border-t border-gray-200 bg-gray-50/80">
                      <td className="px-5 py-3.5 text-sm font-semibold text-gray-700">Total</td>
                      <td className="px-5 py-3.5 font-semibold text-gray-800 text-sm">{totalHours.toFixed(2)}h</td>
                      <td className="px-5 py-3.5"></td>
                      <td className="px-5 py-3.5 font-bold text-gray-900">{fmt(displayTotalPay, 'PHP')}</td>
                      <td className="px-5 py-3.5 text-right">
                        {!batch && rows.some(r => { const p = payoutsMap[r.contractor.id]; return !isAutoPayrollContractor(r.contractor) && (!p || p.status === 'pending' || p.status === 'submitted'); }) && (
                          <button onClick={approveAll} disabled={workflowLoading} className="text-xs px-3 py-1.5 bg-[#111827] text-white rounded-lg cursor-pointer disabled:opacity-40 font-medium whitespace-nowrap">
                            Approve All
                          </button>
                        )}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
          </>
        )}

        {/* Fund Transfer Workflow */}
        {!loading && (() => {
          const approvedCount = rows.filter(r =>
            !isAutoPayrollContractor(r.contractor) && payoutsMap[r.contractor.id]?.status === 'hr_approved'
          ).length;
          // Auto-included staff (admins/HR) are always part of the transfer.
          const autoIncludedCount = rows.filter(r => isAutoPayrollContractor(r.contractor)).length;
          const transferCount = approvedCount + autoIncludedCount;
          // Auto-included staff need no payout row to be "paid" — count them as settled.
          const paidCount = rows.filter(r => isAutoPayrollContractor(r.contractor) || payoutsMap[r.contractor.id]?.status === 'paid').length;
          const isClosed = batch?.status === 'closed';

          return (
            <>
            <div className="bg-white border border-gray-100 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-[#111827]">Fund Transfer</h3>
                  <p className="text-xs text-gray-400 mt-0.5">{selectedPeriod.label}</p>
                </div>
                {!batch && approvedCount > 0 && (
                  <button
                    onClick={requestFundTransfer}
                    disabled={workflowLoading}
                    className="flex items-center gap-1.5 px-3 py-2 bg-[#1c2b3a] text-white text-xs font-medium rounded-lg hover:bg-[#0f1c28] cursor-pointer disabled:opacity-40 whitespace-nowrap"
                  >
                    <i className="ri-send-plane-line text-sm"></i>
                    Request Fund Transfer ({transferCount} employees)
                  </button>
                )}
              </div>

              {!batch && approvedCount === 0 && (
                <p className="text-xs text-gray-400">Approve at least one employee to request a fund transfer.</p>
              )}

              {batch && (() => {
                const isPending = batch.status === 'pending_owner';
                const isApproved = batch.status === 'owner_approved';
                const isBatchClosed = batch.status === 'closed';
                return (
                  <div className="space-y-3">
                    {/* Status card */}
                    <div className="flex items-center gap-4 rounded-2xl border px-5 py-4" style={{
                      background: isBatchClosed ? '#f9fafb' : isApproved ? 'linear-gradient(135deg,#f0fdf4,#f9fafb)' : 'linear-gradient(135deg,#fffbeb,#fefce8)',
                      borderColor: isBatchClosed ? '#e5e7eb' : isApproved ? '#bbf7d0' : '#fde68a',
                    }}>
                      {/* Icon */}
                      <div className={`w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 ${isBatchClosed ? 'bg-gray-100' : isApproved ? 'bg-emerald-100' : 'bg-amber-100'}`}>
                        <i className={`text-lg ${isBatchClosed ? 'ri-lock-fill text-gray-400' : isApproved ? 'ri-checkbox-circle-fill text-emerald-500' : 'ri-time-fill text-amber-500'}`}></i>
                      </div>
                      {/* Text */}
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-semibold ${isBatchClosed ? 'text-gray-500' : isApproved ? 'text-emerald-800' : 'text-amber-800'}`}>
                          {isBatchClosed ? 'Period archived' : isApproved ? 'Transfer approved — send payments' : 'Awaiting owner approval'}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <span className="text-xs text-gray-500">{batch.contractor_count} employee{batch.contractor_count !== 1 ? 's' : ''}</span>
                          <span className="text-gray-300">·</span>
                          <span className="text-xs font-semibold text-gray-700">{fmt(batch.total_amount, 'PHP')}</span>
                          {batch.approved_at && <><span className="text-gray-300">·</span><span className="text-xs text-gray-400">Approved {new Date(batch.approved_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span></>}
                          {isBatchClosed && batch.closed_at && <><span className="text-gray-300">·</span><span className="text-xs text-gray-400">Closed {new Date(batch.closed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span></>}
                          {batch.proof_url && <><span className="text-gray-300">·</span><a href={batch.proof_url} target="_blank" rel="noopener noreferrer" className="text-xs text-[#1c2b3a] font-medium hover:underline inline-flex items-center gap-0.5"><i className="ri-image-line text-[11px]"></i>Proof of transfer</a></>}
                        </div>
                      </div>
                      {/* CTA */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {isPending && (
                          <button onClick={cancelFundTransfer} disabled={workflowLoading}
                            className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 text-gray-500 hover:text-rose-600 hover:border-rose-200 text-xs font-medium rounded-xl cursor-pointer disabled:opacity-40 transition-colors whitespace-nowrap">
                            <i className="ri-arrow-go-back-line text-sm"></i> Undo
                          </button>
                        )}
                        {isOwner && isPending && (
                          <button onClick={() => { setProofFile(null); setApproveProofOpen(true); }} disabled={workflowLoading}
                            className="flex items-center gap-1.5 px-4 py-2 bg-[#111827] hover:bg-gray-800 text-white text-xs font-semibold rounded-xl cursor-pointer disabled:opacity-40 transition-colors whitespace-nowrap">
                            <i className="ri-check-line text-sm"></i> Approve Transfer
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Progress */}
                    {isApproved && paidCount < batch.contractor_count && (
                      <div className="flex items-center gap-3 px-1">
                        <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-400 rounded-full transition-all" style={{ width: `${(paidCount / batch.contractor_count) * 100}%` }} />
                        </div>
                        <span className="text-xs text-gray-500 flex-shrink-0">{paidCount} / {batch.contractor_count} paid</span>
                      </div>
                    )}

                    {/* All paid — close period */}
                    {paidCount > 0 && paidCount === batch.contractor_count && !isBatchClosed && (
                      <div className="flex items-center justify-between gap-3 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3">
                        <div className="flex items-center gap-2">
                          <i className="ri-check-double-line text-emerald-500 text-sm"></i>
                          <p className="text-xs font-medium text-emerald-700">All {paidCount} employees paid</p>
                        </div>
                        <button onClick={closePeriod} disabled={workflowLoading}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg cursor-pointer disabled:opacity-40 transition-colors flex-shrink-0">
                          <i className="ri-lock-line text-[11px]"></i> Close Period
                        </button>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
            </>
          );
        })()}
      </div>
      {/* Edit Row Modal — hours, pay override + additions/deductions */}
      {editRowId && (() => {
        const editRow = rows.find(r => r.contractor.id === editRowId);
        if (!editRow) return null;
        const c = editRow.contractor;
        const adjTotal = editAdjItems.reduce((s, i) => s + i.amount, 0);
        const basePay = parseFloat(editPay) || editRow.pay;
        const otRateVal = editRow.derivedHourlyRate;
        const activeOTEntries = editOTEntries.filter(e => !e.toDelete);
        const otHoursVal = activeOTEntries.reduce((s, e) => s + e.hours, 0);
        const otPay = activeOTEntries.reduce((s, e) => s + e.hours * otRateVal * getOTMultiplier(e.date, e.is_rest_day), 0);
        const grandTotal = basePay + otPay + adjTotal;
        return (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center sm:p-4" onClick={() => setEditRowId(null)}>
            <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
                <div>
                  <h3 className="text-sm font-semibold text-[#111827]">Edit Payroll</h3>
                  <p className="text-xs text-gray-400 mt-0.5">{c.full_name} · {selectedPeriod.label}</p>
                </div>
                <button onClick={() => setEditRowId(null)} className="text-gray-400 hover:text-gray-600 cursor-pointer"><i className="ri-close-line text-lg"></i></button>
              </div>

              <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">
                {/* Dispute banner */}
                {(() => {
                  const payout = payoutsMap[editRowId!];
                  const dispute = payout ? disputesMap[payout.id] : null;
                  if (!dispute) return null;
                  return (
                    <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl space-y-2">
                      <div className="flex items-start gap-3">
                        <i className="ri-flag-fill text-rose-500 text-sm mt-0.5 flex-shrink-0"></i>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-rose-700">Flagged by employee</p>
                          <p className="text-xs text-rose-600 mt-0.5">{dispute.reason}</p>
                          {dispute.admin_notes && (
                            <p className="text-xs text-gray-500 mt-1 italic">Note: {dispute.admin_notes}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2 items-center">
                        <input
                          type="text"
                          placeholder="Resolution note (optional)"
                          value={disputeNotesMap[dispute.id] ?? ''}
                          onChange={e => setDisputeNotesMap(prev => ({ ...prev, [dispute.id]: e.target.value }))}
                          className="flex-1 text-xs border border-rose-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-rose-300 placeholder-gray-300"
                        />
                        <button
                          onClick={async () => {
                            const note = disputeNotesMap[dispute.id]?.trim() || null;
                            await supabase.from('hub_payslip_disputes').update({ status: 'resolved', admin_notes: note }).eq('id', dispute.id);
                            if (payout?.id) {
                              supabase.functions.invoke('notify-contractor', { body: { payout_id: payout.id, type: 'dispute_resolved' } }).catch(console.error);
                            }
                            setDisputeNotesMap(prev => { const n = { ...prev }; delete n[dispute.id]; return n; });
                            await fetchWorkflow();
                          }}
                          className="text-xs px-2 py-1.5 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 cursor-pointer flex-shrink-0 whitespace-nowrap"
                        >
                          Resolve
                        </button>
                      </div>
                    </div>
                  );
                })()}
                {/* Hours + Base pay */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Base Pay</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-gray-600">Billed Hours</label>
                      <input type="number" value={editHours} onChange={e => {
                        const h = parseFloat(e.target.value) || 0;
                        setEditHours(e.target.value);
                        // Auto-compute pay when hours change
                        const c = editRow.contractor;
                        if (c.payment_type === 'hourly' && c.hourly_rate) {
                          const isUSD = c.currency === 'USD';
                          const rawPay = h * c.hourly_rate;
                          const phpPay = isUSD ? rawPay * usdRate : rawPay;
                          setEditPay(phpPay.toFixed(2));
                        }
                      }} step="0.5"
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]" />
                      <p className="text-[10px] text-gray-400">Slack: {editRow.cappedHours.toFixed(2)}h</p>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-gray-600">Base Pay (₱)</label>
                      <input type="number" value={editPay} onChange={e => setEditPay(e.target.value)} step="0.01"
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]" />
                      <p className="text-[10px] text-gray-400">Computed: {fmt(editRow.pay, 'PHP')}</p>
                    </div>
                  </div>
                </div>

                {/* Overtime */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Overtime</p>
                  {activeOTEntries.length > 0 ? (
                    <div className="space-y-1.5 mb-3">
                      {editOTEntries.map((entry, idx) => !entry.toDelete && (
                        <div key={entry.id ?? `new-${idx}`} className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg">
                          <span className="text-xs text-gray-700 flex-1">
                            {new Date(entry.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                          </span>
                          <span className="text-xs font-semibold text-gray-700">{entry.hours}h</span>
                          <button
                            type="button"
                            onClick={() => setEditOTEntries(prev => prev.map((e, i) => i === idx ? { ...e, is_rest_day: !e.is_rest_day } : e))}
                            className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium cursor-pointer whitespace-nowrap ${
                              entry.is_rest_day ? 'bg-violet-100 text-violet-700' : 'bg-sky-100 text-sky-700'
                            }`}
                          >
                            {entry.is_rest_day ? '30% rest day' : '25% weekday'}
                          </button>
                          <button onClick={() => setEditOTEntries(prev => prev.map((e, i) => i === idx ? { ...e, toDelete: true } : e))}
                            className="text-gray-300 hover:text-rose-400 cursor-pointer flex-shrink-0">
                            <i className="ri-delete-bin-line text-sm"></i>
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400 mb-3">No overtime entries for this period.</p>
                  )}
                  <div className="flex gap-2 items-end">
                    <div className="flex-1 space-y-1">
                      <label className="text-[10px] text-gray-500">Date</label>
                      <input type="date" value={editOTNewDate} min={selectedPeriod.start} max={selectedPeriod.end}
                        onChange={e => {
                          setEditOTNewDate(e.target.value);
                          if (e.target.value) {
                            const day = new Date(e.target.value + 'T12:00:00').getDay();
                            setEditOTNewRestDay(day === 0 || day === 6);
                          }
                        }}
                        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]" />
                    </div>
                    <div className="w-20 space-y-1">
                      <label className="text-[10px] text-gray-500">Hours</label>
                      <input type="number" value={editOTNewHours} onChange={e => setEditOTNewHours(e.target.value)} step="0.5" min="0" max="12" placeholder="hrs"
                        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]" />
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditOTNewRestDay(v => !v)}
                      className={`text-[10px] px-2 py-1.5 rounded-lg font-medium cursor-pointer flex-shrink-0 border whitespace-nowrap ${
                        editOTNewRestDay ? 'bg-violet-50 border-violet-200 text-violet-700' : 'bg-sky-50 border-sky-200 text-sky-700'
                      }`}
                    >
                      {editOTNewRestDay ? 'Rest day' : 'Weekday'}
                    </button>
                    <button
                      onClick={() => {
                        const h = parseFloat(editOTNewHours);
                        if (!editOTNewDate || isNaN(h) || h <= 0) return;
                        setEditOTEntries(prev => [...prev, { date: editOTNewDate, hours: h, is_rest_day: editOTNewRestDay }]);
                        setEditOTNewDate('');
                        setEditOTNewHours('');
                        setEditOTNewRestDay(false);
                      }}
                      className="px-3 py-1.5 bg-[#111827] text-white text-xs rounded-lg hover:bg-gray-700 cursor-pointer whitespace-nowrap"
                    >
                      Add
                    </button>
                  </div>
                  {otPay > 0 && (
                    <p className="text-[10px] text-gray-400 mt-2">OT pay: {fmt(otPay, 'PHP')} ({otHoursVal}h total @ {fmt(otRateVal, 'PHP')}/hr base)</p>
                  )}
                </div>

                {/* Additions & Deductions */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Additions & Deductions</p>
                  {editAdjItems.length > 0 && (
                    <div className="space-y-1.5 mb-3">
                      {editAdjItems.map((item, idx) => (
                        <div key={idx} className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                            item.type === 'deduction' ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-700'
                          }`}>{ADJ_TYPES.find(t => t.value === item.type)?.label ?? item.type}</span>
                          <span className="text-xs text-gray-700 flex-1">{item.label}</span>
                          <span className={`text-xs font-semibold ${item.amount >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                            {item.amount > 0 ? '+' : ''}{fmt(item.amount, 'PHP')}
                          </span>
                          <button onClick={() => setEditAdjItems(prev => prev.filter((_, i) => i !== idx))}
                            className="text-gray-300 hover:text-rose-400 cursor-pointer flex-shrink-0">
                            <i className="ri-delete-bin-line text-sm"></i>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Add line item */}
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <select value={editAdjType} onChange={e => {
                        setEditAdjType(e.target.value);
                        setEditAdjSign(e.target.value === 'deduction' ? '-' : '+');
                      }}
                        className="border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a] bg-white cursor-pointer">
                        {ADJ_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => setEditAdjSign(s => s === '+' ? '-' : '+')}
                          className={`w-9 flex-shrink-0 rounded-lg text-sm font-bold border transition-colors cursor-pointer ${
                            editAdjSign === '+'
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-600 hover:bg-emerald-100'
                              : 'bg-rose-50 border-rose-200 text-rose-500 hover:bg-rose-100'
                          }`}
                        >
                          {editAdjSign}
                        </button>
                        <input type="number" placeholder="Amount (₱)" value={editAdjAmount} onChange={e => setEditAdjAmount(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && addEditAdjItem()}
                          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]" />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <input type="text" placeholder="Description (e.g. May referral — John)" value={editAdjLabel}
                        onChange={e => setEditAdjLabel(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && addEditAdjItem()}
                        className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]" />
                      <button onClick={addEditAdjItem}
                        className="px-3 py-2 bg-[#111827] text-white text-xs rounded-lg hover:bg-gray-700 cursor-pointer whitespace-nowrap">
                        Add
                      </button>
                    </div>
                  </div>
                </div>

                {/* Total summary */}
                <div className="bg-gray-50 rounded-xl px-4 py-3 space-y-1.5">
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>Base pay</span><span>{fmt(basePay, 'PHP')}</span>
                  </div>
                  {otPay > 0 && (
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>Overtime ({otHoursVal}h @ {fmt(otRateVal, 'PHP')}/hr base, +25-30%)</span>
                      <span className="text-emerald-600">+{fmt(otPay, 'PHP')}</span>
                    </div>
                  )}
                  {adjTotal !== 0 && (
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>Adjustments</span>
                      <span className={adjTotal >= 0 ? 'text-emerald-600' : 'text-rose-500'}>
                        {adjTotal > 0 ? '+' : ''}{fmt(adjTotal, 'PHP')}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm font-bold text-[#111827] pt-1 border-t border-gray-200">
                    <span>Total</span><span>{fmt(grandTotal, 'PHP')}</span>
                  </div>
                </div>
              </div>

              <div className="px-5 pb-4 pt-3 border-t border-gray-100 flex justify-between gap-2 flex-shrink-0">
                <button
                  onClick={() => resetEditRow(editRowId!)}
                  className="px-3 py-2 text-xs text-rose-400 hover:text-rose-600 cursor-pointer"
                >
                  Reset all
                </button>
                <div className="flex gap-2">
                  <button onClick={() => setEditRowId(null)} className="px-4 py-2 text-xs text-gray-500 hover:text-gray-700 cursor-pointer">Cancel</button>
                  <button onClick={() => saveEditRow(editRowId!)} disabled={editSaving}
                    className="px-4 py-2 bg-[#1c2b3a] text-white text-xs font-medium rounded-lg hover:bg-[#0f1c28] cursor-pointer disabled:opacity-40">
                    {editSaving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Bank details modal */}
      {bankInfoContractor && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 sm:p-4" onClick={() => setBankInfoContractor(null)}>
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <Avatar name={bankInfoContractor.full_name} avatar_url={bankInfoContractor.avatar_url} />
                <div>
                  <h2 className="font-semibold text-[#111827] text-sm">{bankInfoContractor.full_name}</h2>
                  <p className="text-xs text-gray-400 mt-0.5">Payment details</p>
                </div>
              </div>
              <button onClick={() => setBankInfoContractor(null)} className="text-gray-400 hover:text-gray-600 cursor-pointer w-7 h-7 flex items-center justify-center">
                <i className="ri-close-line text-lg"></i>
              </button>
            </div>
            <div className="p-5 space-y-3">
              {bankInfoContractor.bank_name || bankInfoContractor.bank_account_number ? (
                [
                  { label: 'Payment method', value: bankInfoContractor.payment_method },
                  { label: 'Bank', value: bankInfoContractor.bank_name },
                  { label: 'Account name', value: bankInfoContractor.bank_account_name },
                  { label: 'Account number', value: bankInfoContractor.bank_account_number },
                  { label: 'Account type', value: bankInfoContractor.bank_account_type },
                ].filter(f => f.value).map(f => (
                  <div key={f.label} className="flex items-center justify-between gap-3">
                    <span className="text-xs text-gray-400 flex-shrink-0">{f.label}</span>
                    <span className="text-sm font-medium text-[#111827] text-right break-all">{f.value}</span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-gray-400 text-center py-4">No bank details on file for this employee.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Approve transfer + optional proof-of-transfer screenshot */}
      {approveProofOpen && batch && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div>
                <h2 className="font-semibold text-[#111827]">Approve Fund Transfer</h2>
                <p className="text-xs text-gray-400 mt-0.5">{batch.period_label} · {fmt(batch.total_amount, 'PHP')} · {batch.contractor_count} employee{batch.contractor_count !== 1 ? 's' : ''}</p>
              </div>
              <button onClick={() => { setApproveProofOpen(false); setProofFile(null); }} className="text-gray-400 hover:text-gray-600 cursor-pointer w-7 h-7 flex items-center justify-center">
                <i className="ri-close-line text-lg"></i>
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-700">Proof of transfer <span className="text-gray-400 font-normal">(optional)</span></label>
                <p className="text-[11px] text-gray-400">Attach a screenshot of the bank/transfer confirmation. It's saved to Google Drive (Payroll → Receipts) and linked here.</p>
                <input
                  type="file"
                  accept="image/*,.pdf"
                  onChange={(e) => setProofFile(e.target.files?.[0] ?? null)}
                  className="block w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200 cursor-pointer"
                />
                {proofFile && <p className="text-xs text-emerald-600 flex items-center gap-1"><i className="ri-check-line"></i>{proofFile.name}</p>}
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={() => { setApproveProofOpen(false); setProofFile(null); }} disabled={approvingTransfer}
                  className="flex-1 py-2.5 text-sm border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 cursor-pointer disabled:opacity-40">
                  Cancel
                </button>
                <button onClick={confirmApproveTransfer} disabled={approvingTransfer}
                  className="flex-1 py-2.5 text-sm bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 disabled:opacity-40 cursor-pointer flex items-center justify-center gap-1.5">
                  {approvingTransfer ? <><i className="ri-loader-4-line animate-spin"></i> {proofFile ? 'Uploading…' : 'Approving…'}</> : <><i className="ri-check-line"></i> Approve Transfer</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
