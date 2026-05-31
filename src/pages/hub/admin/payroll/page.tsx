import { useState, useEffect } from 'react';
import html2canvas from 'html2canvas';
import AdminLayout from '@/pages/hub/components/AdminLayout';
import { supabase } from '@/lib/supabase';
import { useHubAuth as useAuth } from '@/hooks/useHubAuth';
import { useDemo } from '@/contexts/DemoContext';
import { FULL_MONTHS, getPeriods, fmtCurrency as fmt, getNextPayrollCutoff } from '@/lib/formatUtils';
import { logAudit } from '@/lib/audit';
import { getSetting, setSetting } from '@/lib/settings';
import { DEMO_PAYOUTS, DEMO_CONTRACTORS } from '@/lib/demoData';

interface Contractor {
  id: string;
  full_name: string;
  avatar_url: string | null;
  department: string | null;
  currency: string;
  payment_type: 'hourly' | 'fixed' | 'fixed_flexible';
  hourly_rate: number | null;
  monthly_rate: number | null;
  start_date: string | null;
  work_days: string[] | null;
}

interface RateEntry {
  effective_date: string;
  payment_type: string;
  hourly_rate: number | null;
  monthly_rate: number | null;
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
  prorated: boolean;
  proratedNote?: string;
  accruing?: boolean;
  accrualDays?: number;
  accrualTotal?: number;
}

const DAY_MAP: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function countWorkingDays(startDate: string, endDate: string, workDays: string[]): number {
  const scheduled = workDays.length > 0
    ? new Set(workDays.map(d => DAY_MAP[d]))
    : new Set([1, 2, 3, 4, 5]);
  let count = 0;
  const end = new Date(endDate + 'T00:00:00');
  const cur = new Date(startDate + 'T00:00:00');
  while (cur <= end) {
    if (scheduled.has(cur.getDay())) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

function countScheduledHours(startDate: string, endDate: string, workDays: string[] | null | undefined): number {
  if (!startDate || !endDate || endDate < startDate) return 0;
  return countWorkingDays(startDate, endDate, workDays || []) * 8;
}

function dateBefore(dateStr: string, days = 1) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function Avatar({ name, avatar_url }: { name: string; avatar_url: string | null }) {
  if (avatar_url) return <img src={avatar_url} alt={name} className="w-8 h-8 rounded-full object-cover object-top flex-shrink-0" />;
  return (
    <div className="w-8 h-8 rounded-full bg-[#FF6B35] flex items-center justify-center flex-shrink-0">
      <span className="text-white text-xs font-bold">{name.charAt(0).toUpperCase()}</span>
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

function buildPdfFromJpeg(jpegBytes: Uint8Array, imageWidth: number, imageHeight: number) {
  const encoder = new TextEncoder();
  const pageWidth = 612;
  const pageHeight = 792;
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
  const [loading, setLoading] = useState(true);
  const [usdRate, setUsdRate] = useState<number>(56);

  // Load closed periods once on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);

  // Disputes map: payout_id → dispute
  const [disputesMap, setDisputesMap] = useState<Record<string, any>>({});
  // Notes input per dispute (dispute_id → note text)
  const [disputeNotesMap, setDisputeNotesMap] = useState<Record<string, string>>({});

  // Row edit overrides (before approval)
  const [editRowId, setEditRowId] = useState<string | null>(null);
  const [editHours, setEditHours] = useState('');
  const [editPay, setEditPay] = useState('');
  const [editOTHours, setEditOTHours] = useState('');
  const [editOTRate, setEditOTRate] = useState('');
  const [rowOverrides, setRowOverrides] = useState<Record<string, { hours?: number; pay?: number; otHours?: number; otRate?: number }>>({});
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

  const openEditRow = (r: PayRow) => {
    const override = rowOverrides[r.contractor.id];
    const p = payoutsMap[r.contractor.id];
    setEditHours(String(override?.hours ?? r.cappedHours));
    setEditPay(String(override?.pay !== undefined ? override.pay : parseFloat(r.pay.toFixed(2))));
    setEditOTHours(String(override?.otHours !== undefined ? override.otHours : r.overtimeHours));
    setEditOTRate(String(override?.otRate !== undefined ? override.otRate : r.derivedHourlyRate));
    setEditAdjItems((p?.adjustments || []).map((a: any) => ({ ...a, type: a.type || 'other' })));
    setEditAdjLabel('');
    setEditAdjAmount('');
    setEditAdjType('bonus');
    setEditAdjSign('+');
    setEditRowId(r.contractor.id);
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
    const otH = parseFloat(editOTHours);
    const otR = parseFloat(editOTRate);
    setRowOverrides(prev => ({
      ...prev,
      [contractorId]: {
        hours: isNaN(h) ? undefined : h,
        pay: isNaN(p) ? undefined : p,
        otHours: isNaN(otH) ? undefined : otH,
        otRate: isNaN(otR) ? undefined : otR,
      },
    }));

    const row = rows.find(r => r.contractor.id === contractorId);
    const basePay = isNaN(p) ? (row?.pay ?? 0) : p;
    const computedOTPay = (!isNaN(otH) && !isNaN(otR)) ? otH * otR : (row?.overtimePay ?? 0);
    const adjTotal = finalAdjItems.reduce((s, i) => s + i.amount, 0);
    const finalPay = basePay + computedOTPay + adjTotal;

    // Write edited OT hours back to hub_daily_hours for each day in the period
    if (!isNaN(otH) && row && otH !== row.overtimeHours) {
      const { data: dailyRows } = await supabase
        .from('hub_daily_hours')
        .select('date, overtime_hours')
        .eq('user_id', contractorId)
        .gte('date', selectedPeriod.start)
        .lte('date', selectedPeriod.end)
        .gt('overtime_hours', 0)
        .order('date', { ascending: true });
      if (dailyRows && dailyRows.length > 0) {
        // Distribute OT hours: put all on the last OT day to keep daily records meaningful
        const otDays = [...dailyRows];
        const lastOTDate = otDays[otDays.length - 1].date;
        const otherDays = otDays.slice(0, -1);
        const otherTotal = otherDays.reduce((s: number, d: any) => s + (d.overtime_hours || 0), 0);
        const lastDayOT = Math.max(0, otH - otherTotal);
        await supabase.from('hub_daily_hours').upsert({
          user_id: contractorId,
          date: lastOTDate,
          overtime_hours: lastDayOT,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,date' });
      }
    }
    const existing = payoutsMap[contractorId];

    const { error } = await supabase.from('hub_payouts').upsert({
      ...(existing ? { id: existing.id } : {}),
      contractor_id: contractorId,
      cutoff_start: selectedPeriod.start,
      cutoff_end: selectedPeriod.end,
      final_payout: finalPay,
      overtime_pay: computedOTPay,
      status: existing?.status || 'pending',
      locked: existing?.locked ?? false,
      adjustments: finalAdjItems,
    }, { onConflict: 'contractor_id,cutoff_start' });

    if (error) {
      setEditSaving(false);
      return;
    }

    await fetchWorkflow();
    setEditSaving(false);
    setEditRowId(null);
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
        .select('id, contractor_id, status, final_payout, payment_date, batch_id, adjustments, payslip_sent_at, overtime_pay')
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

  const approvePayout = async (contractorId: string, computedPay: number) => {
    setWorkflowLoading(true);
    const row = rows.find(r => r.contractor.id === contractorId);
    const override = rowOverrides[contractorId];
    const basePay = override?.pay !== undefined ? override.pay : computedPay;
    const otPay = override?.otHours !== undefined && override?.otRate !== undefined
      ? override.otHours * override.otRate
      : (row?.overtimePay ?? 0);
    const adjs: any[] = payoutsMap[contractorId]?.adjustments || [];
    const adjTotal = adjs.reduce((s: number, a: any) => s + (a.amount || 0), 0);
    const finalPay = basePay + otPay + adjTotal;
    const existing = payoutsMap[contractorId];
    const contractorName = rows.find(r => r.contractor.id === contractorId)?.contractor.full_name ?? contractorId;
    if (existing) {
      await supabase.from('hub_payouts').update({ status: 'hr_approved', approved_at: new Date().toISOString(), final_payout: finalPay }).eq('id', existing.id);
    } else {
      await supabase.from('hub_payouts').insert({
        contractor_id: contractorId,
        cutoff_start: selectedPeriod.start,
        cutoff_end: selectedPeriod.end,
        final_payout: finalPay,
        status: 'hr_approved',
        approved_at: new Date().toISOString(),
      });
    }
    logAudit({ actor_id: hubUser?.id, actor_name: hubUser?.full_name, action: 'approve', entity_type: 'payout', entity_id: contractorId, description: `Approved payout of ${fmt(finalPay)} for ${contractorName} — ${selectedPeriod.label}` });
    // Notify contractor of approval (fire-and-forget)
    const approvedPayout = existing
      ? { id: existing.id }
      : (await supabase.from('hub_payouts').select('id').eq('contractor_id', contractorId).eq('cutoff_start', selectedPeriod.start).single()).data;
    if (approvedPayout?.id) {
      supabase.functions.invoke('notify-contractor', { body: { payout_id: approvedPayout.id, type: 'hr_approved' } }).catch(() => {});
    }
    await fetchWorkflow();
    setWorkflowLoading(false);
  };

  const approveAll = async () => {
    const toApprove = rows.filter(r => {
      const p = payoutsMap[r.contractor.id];
      return !batch && (!p || p.status === 'pending' || p.status === 'submitted');
    });
    if (toApprove.length === 0) return;
    setWorkflowLoading(true);
    const now = new Date().toISOString();
    await Promise.all(toApprove.map(async r => {
      const override = rowOverrides[r.contractor.id];
      const basePay = override?.pay !== undefined ? override.pay : r.pay;
      const otPay = override?.otHours !== undefined && override?.otRate !== undefined
        ? override.otHours * override.otRate
        : r.overtimePay;
      const adjs: any[] = payoutsMap[r.contractor.id]?.adjustments || [];
      const adjTotal = adjs.reduce((s: number, a: any) => s + (a.amount || 0), 0);
      const finalPay = basePay + otPay + adjTotal;
      const existing = payoutsMap[r.contractor.id];
      if (existing) {
        await supabase.from('hub_payouts').update({ status: 'hr_approved', approved_at: now, final_payout: finalPay }).eq('id', existing.id);
      } else {
        await supabase.from('hub_payouts').insert({
          contractor_id: r.contractor.id,
          cutoff_start: selectedPeriod.start,
          cutoff_end: selectedPeriod.end,
          final_payout: finalPay,
          status: 'hr_approved',
          approved_at: now,
        });
      }
    }));
    // Notify each contractor (fire-and-forget — fetch IDs after batch update)
    const { data: newPayouts } = await supabase
      .from('hub_payouts')
      .select('id, contractor_id')
      .eq('cutoff_start', selectedPeriod.start)
      .eq('status', 'hr_approved');
    for (const np of newPayouts ?? []) {
      if (toApprove.some(r => r.contractor.id === np.contractor_id)) {
        supabase.functions.invoke('notify-contractor', { body: { payout_id: np.id, type: 'hr_approved' } }).catch(() => {});
      }
    }
    logAudit({ actor_id: hubUser?.id, actor_name: hubUser?.full_name, action: 'approve', entity_type: 'payout', entity_id: selectedPeriod.start, description: `Bulk approved ${toApprove.length} payouts for ${selectedPeriod.label}` });
    await fetchWorkflow();
    setWorkflowLoading(false);
  };

  const requestFundTransfer = async () => {
    setWorkflowLoading(true);
    const approved = rows.filter(r => {
      const p = payoutsMap[r.contractor.id];
      return p?.status === 'hr_approved';
    });
    const total = approved.reduce((s, r) => {
      const p = payoutsMap[r.contractor.id];
      return s + (p?.final_payout ?? r.pay);
    }, 0);
    const { data: newBatch, error: batchError } = await supabase.from('hub_payroll_batches').insert({
      period_start: selectedPeriod.start,
      period_end: selectedPeriod.end,
      period_label: selectedPeriod.label,
      total_amount: total,
      contractor_count: approved.length,
      status: 'pending_owner',
      requested_by: hubUser?.id,
    }).select('id').single();

    if (batchError) {
      alert('Failed to request fund transfer: ' + batchError.message);
      setWorkflowLoading(false);
      return;
    }

    if (newBatch) {
      const approvedIds = approved.map(r => payoutsMap[r.contractor.id]?.id).filter(Boolean);
      await supabase.from('hub_payouts').update({ batch_id: newBatch.id }).in('id', approvedIds);
      supabase.functions.invoke('notify-owner', { body: { batch_id: newBatch.id } }).catch(() => {});
    }
    await fetchWorkflow();
    setWorkflowLoading(false);
  };

  const approveBatch = async () => {
    if (!batch) return;
    setWorkflowLoading(true);
    await supabase.from('hub_payroll_batches').update({
      status: 'owner_approved',
      approved_by: hubUser?.id,
      approved_at: new Date().toISOString(),
    }).eq('id', batch.id);
    logAudit({ actor_id: hubUser?.id, actor_name: hubUser?.full_name, action: 'approve', entity_type: 'payroll_batch', entity_id: batch.id, description: `Approved fund transfer of ${fmt(batch.total_amount)} for ${batch.period_label} (${batch.contractor_count} contractors)` });
    supabase.functions.invoke('notify-owner', { body: { batch_id: batch.id, type: 'fund_approved' } }).catch(() => {});
    await fetchWorkflow();
    setWorkflowLoading(false);
  };


  const cancelPayout = async (contractorId: string) => {
    const p = payoutsMap[contractorId];
    if (!p) return;
    setWorkflowLoading(true);
    if (p.status === 'paid') {
      await supabase.from('hub_payouts').update({
        status: 'hr_approved',
        payment_date: null,
        paid_at: null,
      }).eq('id', p.id);
    } else {
      await supabase.from('hub_payouts').delete().eq('id', p.id);
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
    await fetchWorkflow();
    setWorkflowLoading(false);
  };

  const markPaid = async (contractorId: string) => {
    const existing = payoutsMap[contractorId];
    if (!existing) return;
    setWorkflowLoading(true);
    await supabase.from('hub_payouts').update({
      status: 'paid',
      payment_date: new Date().toISOString().slice(0, 10),
      paid_at: new Date().toISOString(),
    }).eq('id', existing.id);
    // Fire payslip email (non-blocking — ignore failures)
    supabase.functions.invoke('send-payslip', { body: { payout_id: existing.id } }).catch(() => {});
    await fetchWorkflow();
    setWorkflowLoading(false);
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
    const logoUrl = `${window.location.origin}/images/547b59870e776a20eb28e4f20931787c.png`;
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
      const displayOTHours = override?.otHours !== undefined ? override.otHours : r.overtimeHours;
      const total = getRowDisplayTotal(r);
      return `
        <tr>
          <td>${c.full_name}</td>
          <td>${c.department || '—'}</td>
          <td>${isFixed ? 'Fixed' : 'Hourly'}</td>
          <td>${rate}</td>
          <td>${r.days}</td>
          <td>${r.cappedHours.toFixed(2)}h</td>
          <td>${displayOTHours > 0 ? `${displayOTHours.toFixed(2)}h` : '—'}</td>
          <td style="text-align:right;font-weight:700">₱${total.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        </tr>
      `;
    }).join('');

    return `
      <div style="width:1080px;background:#ffffff;color:#111827;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:40px 44px;">
        <div style="display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid #FF6B35;padding-bottom:20px;margin-bottom:28px;">
          <div style="display:flex;align-items:center;gap:14px;">
            <img src="${logoUrl}" alt="Huna Creatives" style="height:46px;object-fit:contain;" />
            <div>
              <div style="font-size:12px;letter-spacing:0.18em;text-transform:uppercase;color:#9ca3af;font-weight:700;">Huna Creatives</div>
              <div style="font-size:24px;font-weight:800;color:#111827;margin-top:2px;">Payroll Report</div>
            </div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:16px;font-weight:700;">${label}</div>
            <div style="font-size:12px;color:#6b7280;margin-top:4px;">${generatedLabel}</div>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-bottom:24px;">
          ${[
            { label: 'Total Payroll', value: fmt(displayTotalPay, 'PHP') },
            { label: 'Total Hours', value: `${totalHours.toFixed(2)}h` },
            { label: 'Contractors', value: `${rows.length}` },
            { label: 'Hourly / Fixed', value: `${hourlyRows} / ${fixedRows}` },
          ].map((item) => `
            <div style="border:1px solid #e5e7eb;border-radius:16px;background:#f9fafb;padding:14px 16px;">
              <div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#9ca3af;font-weight:700;">${item.label}</div>
              <div style="font-size:20px;font-weight:800;color:${item.label === 'Total Payroll' ? '#FF6B35' : '#111827'};margin-top:6px;">${item.value}</div>
            </div>
          `).join('')}
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead>
            <tr>
              <th style="background:#111827;color:#ffffff;padding:11px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;">Contractor</th>
              <th style="background:#111827;color:#ffffff;padding:11px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;">Department</th>
              <th style="background:#111827;color:#ffffff;padding:11px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;">Type</th>
              <th style="background:#111827;color:#ffffff;padding:11px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;">Rate</th>
              <th style="background:#111827;color:#ffffff;padding:11px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;">Days</th>
              <th style="background:#111827;color:#ffffff;padding:11px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;">Billed Hours</th>
              <th style="background:#111827;color:#ffffff;padding:11px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;">Overtime</th>
              <th style="background:#111827;color:#ffffff;padding:11px 12px;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;">Pay</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
            <tr>
              <td colspan="7" style="padding:12px;border-top:2px solid #111827;font-weight:800;font-size:14px;">Total</td>
              <td style="padding:12px;border-top:2px solid #111827;text-align:right;font-weight:800;font-size:14px;">${fmt(displayTotalPay, 'PHP')}</td>
            </tr>
          </tbody>
        </table>
      </div>
    `;
  };

  const savePayrollToDrive = async () => {
    if (isDemo) return;
    setSavingToDrive(true);
    try {
      const label = selectedPeriod.label;
      const year = selectedPeriod.start.slice(0, 4);
      const generatedLabel = `Closed ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`;
      const markup = buildPayrollReportMarkup(label, generatedLabel);
      const container = document.createElement('div');
      container.style.position = 'fixed';
      container.style.left = '-10000px';
      container.style.top = '0';
      container.style.zIndex = '-1';
      container.innerHTML = markup;
      document.body.appendChild(container);
      const target = container.firstElementChild as HTMLElement | null;
      if (!target) throw new Error('Could not render payroll report for PDF export.');
      const canvas = await html2canvas(target, { backgroundColor: '#ffffff', scale: 2, useCORS: true });
      document.body.removeChild(container);
      const jpegBytes = dataUrlToUint8Array(canvas.toDataURL('image/jpeg', 0.92));
      const pdfBytes = buildPdfFromJpeg(jpegBytes, canvas.width, canvas.height);
      const b64 = uint8ToBase64(pdfBytes);
      const safeName = label.replace(/[^a-zA-Z0-9\s]/g,'_').replace(/\s+/g,'_');
      const { data, error } = await supabase.functions.invoke('upload-to-drive', {
        body: { type: 'payroll', year, filename: `Payroll_${safeName}_${new Date().toISOString().slice(0,10)}.pdf`, base64Content: b64, mimeType: 'application/pdf', meta: { year } },
      });
      if (error || (data as any)?.error) {
        alert('Drive upload failed: ' + (error?.message || (data as any)?.error));
      } else {
        await setSetting(`payroll_pdf_saved_${selectedPeriod.start}`, 'true');
        setSavedPdfPeriods((prev) => {
          const next = new Set(prev);
          next.add(selectedPeriod.start);
          return next;
        });
        alert('Saved PDF to Google Drive ✓');
      }
    } catch (e) {
      alert('Upload failed: ' + String(e));
    }
    setSavingToDrive(false);
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
      alert('Failed to close period: ' + error.message);
    } else {
      logAudit({ actor_id: hubUser?.id, actor_name: hubUser?.full_name, action: 'close', entity_type: 'payroll_batch', entity_id: batch.id, description: `Closed payroll period ${batch.period_label}` });
      supabase.functions.invoke('notify-payroll-closed', {
        body: {
          batch_id: batch.id,
          closed_by_name: hubUser?.full_name ?? null,
        },
      }).catch(() => {});
      await fetchWorkflow();
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
      return () => { supabase.removeChannel(channel); };
    }
  }, [fetchPayroll, fetchWorkflow, isDemo, selectedPeriod, usdRate]);

  const fetchPayroll = async () => {
    setLoading(true);
    try {

    const [contractorsRes, hoursRes] = await Promise.all([
      supabase
        .from('hub_users')
        .select('id, full_name, avatar_url, department, currency, payment_type, hourly_rate, monthly_rate, start_date, work_days')
        .eq('status', 'active')
        .in('role', ['contractor', 'admin']),
      supabase
        .from('hub_daily_hours')
        .select('user_id, hours_capped, hours_raw, overtime_hours, date')
        .gte('date', selectedPeriod.start)
        .lte('date', selectedPeriod.end),
    ]);

    const eligibleContractors = (contractorsRes.data || []).filter((c: any) =>
      c.payment_type !== 'project_based' &&
      (!c.start_date || c.start_date <= selectedPeriod.end)
    );

    // Per-user per-date hours map (for hourly proration)
    const hoursByDate: Record<string, Record<string, number>> = {};
    const overtimeByDate: Record<string, Record<string, number>> = {};
    const hoursMap: Record<string, { capped: number; raw: number; overtime: number; days: number }> = {};
    for (const h of hoursRes.data || []) {
      if (!hoursMap[h.user_id]) hoursMap[h.user_id] = { capped: 0, raw: 0, overtime: 0, days: 0 };
      hoursMap[h.user_id].capped += h.hours_capped;
      hoursMap[h.user_id].raw += h.hours_raw;
      hoursMap[h.user_id].overtime += h.overtime_hours || 0;
      hoursMap[h.user_id].days += 1;
      if (!hoursByDate[h.user_id]) hoursByDate[h.user_id] = {};
      hoursByDate[h.user_id][h.date] = (hoursByDate[h.user_id][h.date] || 0) + h.hours_capped;
      if (h.overtime_hours) {
        if (!overtimeByDate[h.user_id]) overtimeByDate[h.user_id] = {};
        overtimeByDate[h.user_id][h.date] = (overtimeByDate[h.user_id][h.date] || 0) + h.overtime_hours;
      }
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
          const today = new Date().toISOString().slice(0, 10);
          const isCurrentPeriod = today >= selectedPeriod.start && today <= selectedPeriod.end;
          const effectiveEnd = isCurrentPeriod
            ? (today < selectedPeriod.end ? today : selectedPeriod.end)
            : selectedPeriod.end;
          const oldSegmentEnd = changeInPeriod.effective_date > selectedPeriod.start
            ? dateBefore(changeInPeriod.effective_date)
            : '';
          const expectedOldHours = oldSegmentEnd
            ? countScheduledHours(selectedPeriod.start, oldSegmentEnd, c.work_days)
            : 0;
          const expectedNewHours = changeInPeriod.effective_date <= effectiveEnd
            ? countScheduledHours(changeInPeriod.effective_date, effectiveEnd, c.work_days)
            : 0;
          const totalExpectedHours = expectedOldHours + expectedNewHours;
          const datesMap = hoursByDate[c.id] || {};
          let hrsAtOld = 0;
          let hrsAtNew = 0;
          for (const [date, h] of Object.entries(datesMap)) {
            if (date < changeInPeriod.effective_date) hrsAtOld += h;
            else hrsAtNew += h;
          }
          const oldPortion = totalExpectedHours > 0 ? (oldMonthly / 2) * (expectedOldHours / totalExpectedHours) : 0;
          const newPortion = totalExpectedHours > 0 ? (newMonthly / 2) * (expectedNewHours / totalExpectedHours) : 0;
          const oldPay = expectedOldHours > 0 ? oldPortion * Math.min(hrsAtOld / expectedOldHours, 1) : 0;
          const newPay = expectedNewHours > 0 ? newPortion * Math.min(hrsAtNew / expectedNewHours, 1) : 0;

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
          overtimePay = otAtOld * oldHourlyForOT + otAtNew * newHourlyForOT;
          pay = oldPay + newPay;
          proratedNote = `${hrsAtOld.toFixed(1)}/${expectedOldHours || 0}h @ ₱${oldMonthly.toLocaleString()}/mo · ${hrsAtNew.toFixed(1)}/${expectedNewHours || 0}h @ ₱${newMonthly.toLocaleString()}/mo`;
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
          overtimePay = hrs.overtime * newHourly;
          pay = hrsAtOld * oldHourly + hrsAtNew * newHourly;
          proratedNote = `${hrsAtOld.toFixed(1)}h @ ₱${oldHourly}/hr · ${hrsAtNew.toFixed(1)}h @ ₱${newHourly}/hr`;
        }
      } else {
        // No change in period — use rate in effect at period start (or current hub_users rate)
        const effectiveRate = rateAtStart || null;
        const monthly = effectiveRate?.monthly_rate ?? c.monthly_rate ?? 0;
        const hourly  = effectiveRate?.hourly_rate  ?? c.hourly_rate  ?? 0;

        // For fixed: use explicit hourly_rate as OT rate if set, else derive from monthly
        derivedHourlyRate = payType === 'fixed' ? (hourly || monthly / 176) : hourly;

        if (payType === 'hourly') {
          overtimePay = hrs.overtime * derivedHourlyRate;
          pay = hrs.capped * derivedHourlyRate;
        } else {
          overtimePay = hrs.overtime * derivedHourlyRate;
          const today = new Date().toISOString().slice(0, 10);
          const isCurrentPeriod = today >= selectedPeriod.start && today <= selectedPeriod.end;
          const effectiveEnd = isCurrentPeriod ? (today < selectedPeriod.end ? today : selectedPeriod.end) : selectedPeriod.end;
          const expectedHours = countScheduledHours(selectedPeriod.start, effectiveEnd, c.work_days);
          const accrualRatio = expectedHours > 0 ? Math.min(hrs.capped / expectedHours, 1) : 0;
          pay = (monthly / 2) * accrualRatio;
          prorated = true;
          proratedNote = `${hrs.capped.toFixed(1)}/${expectedHours}h scheduled${isCurrentPeriod ? ' · accruing' : ''}`;
        }
      }

      const isUSD = c.currency === 'USD';
      const payInPHP = isUSD ? pay * usdRate : pay;

      const isAccruing = prorated && proratedNote?.includes('accruing');
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
        prorated,
        proratedNote,
        accruing: isAccruing,
        accrualTotal: isAccruing ? (isUSD ? ((c.monthly_rate ?? 0) / 2) * usdRate : (c.monthly_rate ?? 0) / 2) : undefined,
      };
    });

    result.sort((a, b) => b.pay - a.pay);
    setRows(result);
    } catch {
      // Ignore fetch failures here; loading state still resets in finally.
    } finally {
      setLoading(false);
    }
  };
  const isSelectedPeriodClosed = closedPeriods.has(selectedPeriod.start);
  const getRowDisplayTotal = (row: PayRow) => {
    const payout = payoutsMap[row.contractor.id];
    if (isSelectedPeriodClosed && payout?.final_payout != null) {
      return Number(payout.final_payout);
    }

    const override = rowOverrides[row.contractor.id];
    const basePay = override?.pay !== undefined ? override.pay : row.pay;
    const otPay = override?.otHours !== undefined && override?.otRate !== undefined
      ? override.otHours * override.otRate
      : row.overtimePay;
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
  }, [displayTotalPay, rows.length, selectedPeriod.start]);
  const totalHours = rows.reduce((s, r) => s + r.cappedHours, 0);
  const hourlyCount = rows.filter(r => r.contractor.payment_type === 'hourly').length;
  const fixedCount = rows.filter(r => r.contractor.payment_type === 'fixed').length;

  const downloadPDF = () => {
    const logoUrl = `${window.location.origin}/images/547b59870e776a20eb28e4f20931787c.png`;
    const win = window.open('', '_blank', 'width=1000,height=800');
    if (!win) return;

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

    win.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Payroll — ${selectedPeriod.label}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #111827; background: #fff; padding: 40px; }
    .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 3px solid #FF6B35; padding-bottom: 20px; margin-bottom: 28px; }
    .header img { height: 48px; object-fit: contain; }
    .header-right { text-align: right; }
    .header-right h1 { font-size: 22px; font-weight: 700; color: #111827; }
    .header-right p { font-size: 13px; color: #6b7280; margin-top: 4px; }
    .summary { display: flex; gap: 24px; margin-bottom: 24px; }
    .summary-item { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px 18px; }
    .summary-item .label { font-size: 11px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.05em; }
    .summary-item .value { font-size: 18px; font-weight: 700; color: #111827; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { background: #111827; color: #fff; padding: 10px 12px; text-align: left; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }
    td { padding: 10px 12px; border-bottom: 1px solid #f3f4f6; }
    tr:nth-child(even) td { background: #fafafa; }
    tfoot td { background: #f3f4f6 !important; font-weight: 700; border-top: 2px solid #e5e7eb; }
    .accent { color: #FF6B35; }
    .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #9ca3af; text-align: center; }
    @media print { body { padding: 20px; } }
  </style>
</head>
<body>
  <div class="header">
    <img src="${logoUrl}" alt="Huna Creatives" onerror="this.style.display='none'" />
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
      <div class="label">Contractors</div>
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
        <th>Contractor</th>
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
  <div class="footer">Huna Creatives · Payroll · ${selectedPeriod.label}</div>
  <script>window.onload = function() { setTimeout(function() { window.print(); }, 400); };</script>
</body>
</html>`);
    win.document.close();

    const year = String(new Date().getFullYear());
    const pdfSummary = [
      `Payroll Report — ${selectedPeriod.label}`,
      `Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`,
      `Contractors: ${rows.length}`,
      `Total Hours: ${totalHours.toFixed(2)}h`,
      `Total Payroll: ₱${displayTotalPay.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`,
    ].join('\n');
    supabase.functions.invoke('upload-to-drive', {
      body: {
        filename: `Payroll-${selectedPeriod.label.replace(/[^a-z0-9]/gi, '-')}.txt`,
        mimeType: 'text/plain',
        base64Content: btoa(unescape(encodeURIComponent(pdfSummary))),
        type: 'payroll',
        meta: { year },
      },
    }).catch(() => {});
  };

  return (
    <AdminLayout title="Payroll">
      <div className="space-y-5">

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
        <div className="bg-[#111827] rounded-2xl p-5 text-white">
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
                  onClick={() => fetchWorkflow()}
                  title="Refresh submission statuses"
                  className="bg-white/10 border border-white/10 text-white/60 hover:text-white hover:bg-white/20 text-xs rounded-lg px-2.5 py-1.5 transition-colors cursor-pointer"
                >
                  <i className="ri-refresh-line"></i>
                </button>
              </div>

              {/* KPIs inline */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { label: 'Total Payroll', value: fmt(displayTotalPay, 'PHP'), accent: true },
                  { label: 'Total Hours', value: `${totalHours.toFixed(1)}h` },
                  { label: 'Hourly', value: `${hourlyCount} contractor${hourlyCount !== 1 ? 's' : ''}` },
                  { label: 'Fixed Rate', value: `${fixedCount} contractor${fixedCount !== 1 ? 's' : ''}` },
                ].map((k) => (
                  <div key={k.label}>
                    <p className="text-white/40 text-[11px] uppercase tracking-wide mb-1">{k.label}</p>
                    <p className={`text-lg font-bold tabular-nums leading-tight ${k.accent ? 'text-[#FF6B35]' : 'text-white'}`}>{k.value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: export + USD rate */}
            <div className="flex flex-col gap-3 sm:items-end flex-shrink-0">
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const headers = ['Contractor', 'Department', 'Type', 'Rate', 'Days', 'Raw Hours', 'Billed Hours', 'Overtime Hours', 'Overtime Pay (PHP)', 'Pay (PHP)'];
                    const csvRows = rows.map(r => {
                      const c = r.contractor;
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
                    a.click();
                    URL.revokeObjectURL(url);
                    const year = String(new Date().getFullYear());
                    supabase.functions.invoke('upload-to-drive', {
                      body: {
                        filename: `Payroll-${selectedPeriod.label.replace(/[^a-z0-9]/gi, '-')}.csv`,
                        mimeType: 'text/csv',
                        base64Content: btoa(unescape(encodeURIComponent(csv))),
                        type: 'payroll',
                        meta: { year },
                      },
                    }).catch(() => {});
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
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#FF6B35] text-white hover:bg-[#e55a27] transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
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
              Hours from Slack · 8h daily cap · Fixed-rate contractors paid <strong className="text-white/40 font-medium">monthly ÷ 2</strong> regardless of hours
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
              <div className="bg-white rounded-xl border border-gray-100 p-8 text-center text-sm text-gray-400">No contractor data found</div>
            ) : rows.map((r) => {
              const c = r.contractor;
              const isFixed = c.payment_type === 'fixed' || c.payment_type === 'fixed_flexible';
              const isUSD = c.currency === 'USD';
              const rateLabel = isFixed
                ? isUSD ? `$${(c.monthly_rate || 0).toLocaleString()}/mo` : `₱${(c.monthly_rate || 0).toLocaleString('en-PH', { maximumFractionDigits: 0 })}/mo`
                : isUSD ? `$${c.hourly_rate}/hr` : `₱${(c.hourly_rate || 0).toLocaleString('en-PH', { maximumFractionDigits: 0 })}/hr`;
              const override = rowOverrides[c.id];
              const displayHours = override?.hours !== undefined ? override.hours : r.cappedHours;
              const displayOTHours = override?.otHours !== undefined ? override.otHours : r.overtimeHours;
              const displayOTPay = override?.otHours !== undefined && override?.otRate !== undefined ? override.otHours * override.otRate : r.overtimePay;
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
                        {c.department && <><span className="text-gray-200">·</span><span className="text-xs text-gray-400">{c.department}</span></>}
                      </div>
                    </div>
                    <button onClick={() => openEditRow(r)} className="text-gray-300 hover:text-[#FF6B35] cursor-pointer flex-shrink-0">
                      <i className="ri-edit-line text-sm"></i>
                    </button>
                  </div>

                  {/* Stats row */}
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <div className="bg-gray-50 rounded-lg px-3 py-2">
                      <p className="text-[10px] text-gray-400 mb-0.5">Billed</p>
                      <p className="text-sm font-semibold text-gray-900">{displayHours.toFixed(1)}h</p>
                      <p className="text-[10px] text-gray-400">{r.days}d{hoursExceeded ? <span className="text-amber-500 ml-0.5">⚠</span> : ''}</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg px-3 py-2">
                      <p className="text-[10px] text-gray-400 mb-0.5">Overtime</p>
                      {displayOTHours > 0 ? (
                        <>
                          <p className="text-sm font-semibold text-violet-700">+{displayOTHours}h</p>
                          <p className="text-[10px] text-gray-400">{fmt(displayOTPay, 'PHP')}</p>
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
                      if (!p || p.status === 'pending') return <span className="text-xs text-gray-400">Pending</span>;
                      const cfg = {
                        submitted:   { label: 'Submitted',   cls: 'bg-amber-100 text-amber-700' },
                        hr_approved: { label: 'HR Approved', cls: 'bg-sky-100 text-sky-700' },
                        paid:        { label: 'Paid',        cls: 'bg-emerald-100 text-emerald-700' },
                      }[p.status as string] || { label: p.status, cls: 'bg-gray-100 text-gray-500' };
                      return (
                        <div className="flex items-center gap-1.5">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.cls}`}>{cfg.label}</span>
                          {p.status === 'paid' && p.payslip_sent_at && (
                            <span title={`Receipt sent ${new Date(p.payslip_sent_at).toLocaleString()}`} className="text-emerald-400"><i className="ri-mail-check-line text-xs"></i></span>
                          )}
                          {p.status === 'paid' && !p.payslip_sent_at && (
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
                          {p && p.status !== 'pending' && (
                            <button onClick={() => setConfirmCancelId(c.id)} className="text-gray-300 hover:text-rose-400 cursor-pointer">
                              <i className="ri-arrow-go-back-line text-sm"></i>
                            </button>
                          )}
                          {(() => {
                            const batchApproved = batch?.status === 'owner_approved';
                            if (p?.status === 'paid') return <i className="ri-checkbox-circle-fill text-emerald-400 text-base"></i>;
                            if (batchApproved && p?.status === 'hr_approved') return (
                              <button onClick={() => markPaid(c.id)} disabled={workflowLoading || batch?.status === 'closed'} className="text-xs px-3 py-1.5 bg-emerald-500 text-white rounded-lg cursor-pointer disabled:opacity-40 font-medium">Mark Paid</button>
                            );
                            if (!p || p.status === 'pending' || p.status === 'submitted') return (
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
                  {!batch && rows.some(r => { const p = payoutsMap[r.contractor.id]; return !p || p.status === 'pending' || p.status === 'submitted'; }) && (
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
                      { label: 'Contractor', cls: 'w-64' },
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
                        No contractor data found
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
                    const otRateLabel = isFixed
                      ? isUSD ? `$${r.derivedHourlyRate} OT` : `₱${r.derivedHourlyRate} OT`
                      : null;
                    const hoursExceeded = r.hours > r.cappedHours;
                    const override = rowOverrides[c.id];
                    const displayPay = override?.pay !== undefined ? override.pay : r.pay;
                    const displayHours = override?.hours !== undefined ? override.hours : r.cappedHours;
                    const p = payoutsMap[c.id];
                    const adjs: { label: string; amount: number }[] = p?.adjustments || [];
                    const adjTotal = adjs.reduce((s: number, i: { label: string; amount: number }) => s + i.amount, 0);
                    const displayOTHours = override?.otHours !== undefined ? override.otHours : r.overtimeHours;
                    const displayOTPay = override?.otHours !== undefined && override?.otRate !== undefined
                      ? override.otHours * override.otRate
                      : r.overtimePay;
                    const total = getRowDisplayTotal(r);
                    const dispute = p ? disputesMap[p.id] : null;

                    return (
                      <tr key={c.id} className="hover:bg-gray-50/60 transition-colors group">
                        {/* Contractor */}
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
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
                            <p className="text-xs text-gray-400 mt-0.5">{r.days} day{r.days !== 1 ? 's' : ''}</p>
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
                              <span className="inline-flex items-center gap-1 text-xs font-semibold text-violet-700 bg-violet-50 px-2 py-0.5 rounded-full">
                                +{displayOTHours}h OT
                              </span>
                              <p className="text-xs text-gray-500 mt-1">
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
                              else if (r.prorated && r.proratedNote) parts.push(r.proratedNote);
                              if (isUSD && r.payOriginalCurrency !== undefined) parts.push(`$${r.payOriginalCurrency.toFixed(2)} × ₱${usdRate.toFixed(2)}`);
                              if (r.accruing && r.accrualTotal !== undefined) parts.push(`full ${fmt(r.accrualTotal, 'PHP')}`);
                              if (isFixed && r.days === 0 && !r.prorated) parts.push('no attendance');
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
                        <td className="px-5 py-4">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => openEditRow(r)}
                              title="Edit payroll"
                              className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-[#FF6B35] hover:bg-orange-50 transition-colors cursor-pointer flex-shrink-0"
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
                                  if (!p || p.status === 'pending') return <span className="text-xs text-gray-400 font-medium">Pending</span>;
                                  const cfg = {
                                    submitted:   { label: 'Submitted',   cls: 'bg-amber-100 text-amber-700' },
                                    hr_approved: { label: 'HR Approved', cls: 'bg-sky-100 text-sky-700' },
                                    paid:        { label: 'Paid',        cls: 'bg-emerald-100 text-emerald-700' },
                                  }[p.status as string] || { label: p.status, cls: 'bg-gray-100 text-gray-500' };
                                  return (
                                    <div className="flex items-center gap-1">
                                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${cfg.cls}`}>{cfg.label}</span>
                                      {p.status === 'paid' && p.payslip_sent_at && (
                                        <span title={`Receipt sent ${new Date(p.payslip_sent_at).toLocaleString()}`} className="text-emerald-400"><i className="ri-mail-check-line text-xs"></i></span>
                                      )}
                                      {p.status === 'paid' && !p.payslip_sent_at && (
                                        <span title="Receipt email pending" className="text-amber-400"><i className="ri-mail-line text-xs"></i></span>
                                      )}
                                    </div>
                                  );
                                })()}
                                {(() => {
                                  const batchApproved = batch?.status === 'owner_approved';
                                  if (p?.status === 'paid') return <i className="ri-checkbox-circle-fill text-emerald-400 text-base"></i>;
                                  if (batchApproved && p?.status === 'hr_approved') {
                                    return (
                                      <button onClick={() => markPaid(c.id)} disabled={workflowLoading || batch?.status === 'closed'}
                                        className="text-xs px-3 py-1.5 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 cursor-pointer disabled:opacity-40 whitespace-nowrap font-medium">
                                        Mark Paid
                                      </button>
                                    );
                                  }
                                  if (!p || p.status === 'pending' || p.status === 'submitted') {
                                    return (
                                      <button onClick={() => approvePayout(c.id, r.pay)} disabled={workflowLoading || !!batch || batch?.status === 'closed'}
                                        className="text-xs px-3 py-1.5 bg-[#111827] text-white rounded-lg hover:bg-gray-700 cursor-pointer disabled:opacity-40 whitespace-nowrap font-medium">
                                        Approve
                                      </button>
                                    );
                                  }
                                  return null;
                                })()}
                                {p && p.status !== 'pending' && (
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
                        {!batch && rows.some(r => { const p = payoutsMap[r.contractor.id]; return !p || p.status === 'pending' || p.status === 'submitted'; }) && (
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
          const approvedCount = rows.filter(r => payoutsMap[r.contractor.id]?.status === 'hr_approved').length;
          const paidCount = rows.filter(r => payoutsMap[r.contractor.id]?.status === 'paid').length;
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
                    className="flex items-center gap-1.5 px-3 py-2 bg-[#FF6B35] text-white text-xs font-medium rounded-lg hover:bg-[#e55a27] cursor-pointer disabled:opacity-40 whitespace-nowrap"
                  >
                    <i className="ri-send-plane-line text-sm"></i>
                    Request Fund Transfer ({approvedCount} contractors)
                  </button>
                )}
              </div>

              {!batch && approvedCount === 0 && (
                <p className="text-xs text-gray-400">Approve at least one contractor to request a fund transfer.</p>
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
                          <span className="text-xs text-gray-500">{batch.contractor_count} contractor{batch.contractor_count !== 1 ? 's' : ''}</span>
                          <span className="text-gray-300">·</span>
                          <span className="text-xs font-semibold text-gray-700">{fmt(batch.total_amount, 'PHP')}</span>
                          {batch.approved_at && <><span className="text-gray-300">·</span><span className="text-xs text-gray-400">Approved {new Date(batch.approved_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span></>}
                          {isBatchClosed && batch.closed_at && <><span className="text-gray-300">·</span><span className="text-xs text-gray-400">Closed {new Date(batch.closed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span></>}
                        </div>
                      </div>
                      {/* CTA */}
                      {isOwner && isPending && (
                        <button onClick={approveBatch} disabled={workflowLoading}
                          className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2 bg-[#111827] hover:bg-gray-800 text-white text-xs font-semibold rounded-xl cursor-pointer disabled:opacity-40 transition-colors whitespace-nowrap">
                          <i className="ri-check-line text-sm"></i> Approve Transfer
                        </button>
                      )}
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
                          <p className="text-xs font-medium text-emerald-700">All {paidCount} contractors paid</p>
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
        const otHoursVal = parseFloat(editOTHours) || 0;
        const otRateVal = parseFloat(editOTRate) || 0;
        const otPay = otHoursVal * otRateVal;
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
                          <p className="text-xs font-semibold text-rose-700">Flagged by contractor</p>
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
                              supabase.functions.invoke('notify-contractor', { body: { payout_id: payout.id, type: 'dispute_resolved' } }).catch(() => {});
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
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/30 focus:border-[#FF6B35]" />
                      <p className="text-[10px] text-gray-400">Slack: {editRow.cappedHours.toFixed(2)}h</p>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-gray-600">Base Pay (₱)</label>
                      <input type="number" value={editPay} onChange={e => setEditPay(e.target.value)} step="0.01"
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/30 focus:border-[#FF6B35]" />
                      <p className="text-[10px] text-gray-400">Computed: {fmt(editRow.pay, 'PHP')}</p>
                    </div>
                  </div>
                </div>

                {/* Overtime */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Overtime</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-gray-600">OT Hours</label>
                      <input type="number" value={editOTHours} onChange={e => setEditOTHours(e.target.value)} step="0.5" min="0"
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/30 focus:border-[#FF6B35]" />
                      <p className="text-[10px] text-gray-400">Approved: {editRow.overtimeHours}h</p>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-gray-600">OT Rate (₱/hr)</label>
                      <input type="number" value={editOTRate} onChange={e => setEditOTRate(e.target.value)} step="0.01" min="0"
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/30 focus:border-[#FF6B35]" />
                      <p className="text-[10px] text-gray-400">Computed: {fmt(editRow.derivedHourlyRate, 'PHP')}/hr</p>
                    </div>
                  </div>
                  {otPay > 0 && (
                    <p className="text-[10px] text-gray-400 mt-1.5">OT pay: {fmt(otPay, 'PHP')}</p>
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
                        className="border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/30 focus:border-[#FF6B35] bg-white cursor-pointer">
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
                          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/30 focus:border-[#FF6B35]" />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <input type="text" placeholder="Description (e.g. May referral — John)" value={editAdjLabel}
                        onChange={e => setEditAdjLabel(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && addEditAdjItem()}
                        className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/30 focus:border-[#FF6B35]" />
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
                      <span>Overtime ({otHoursVal}h × {fmt(otRateVal, 'PHP')})</span>
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
                  onClick={() => { setRowOverrides(prev => { const n = { ...prev }; delete n[editRowId!]; return n; }); setEditAdjItems([]); setEditOTHours(''); setEditOTRate(''); setEditRowId(null); }}
                  className="px-3 py-2 text-xs text-rose-400 hover:text-rose-600 cursor-pointer"
                >
                  Reset all
                </button>
                <div className="flex gap-2">
                  <button onClick={() => setEditRowId(null)} className="px-4 py-2 text-xs text-gray-500 hover:text-gray-700 cursor-pointer">Cancel</button>
                  <button onClick={() => saveEditRow(editRowId!)} disabled={editSaving}
                    className="px-4 py-2 bg-[#FF6B35] text-white text-xs font-medium rounded-lg hover:bg-[#e55a27] cursor-pointer disabled:opacity-40">
                    {editSaving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </AdminLayout>
  );
}
