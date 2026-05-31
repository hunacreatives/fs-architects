import { useState, useEffect } from 'react';
import ContractorLayout from '@/pages/hub/components/ContractorLayout';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { getPeriods, fmtTime, fmtDate, fmtPHP } from '@/lib/formatUtils';

interface DayRow {
  date: string;
  hours_raw: number;
  hours_capped: number;
  overtime_hours: number;
  first_on: string | null;
  last_off: string | null;
}

interface RateEntry {
  effective_date: string;
  payment_type: string;
  hourly_rate: number | null;
  monthly_rate: number | null;
}

const DAY_MAP: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function countWorkingDays(startDate: string, endDate: string, workDays: string[] = []) {
  const scheduled = workDays.length > 0
    ? new Set(workDays.map(d => DAY_MAP[d]))
    : new Set([1, 2, 3, 4, 5]);
  let count = 0;
  const end = new Date(`${endDate}T00:00:00`);
  const cur = new Date(`${startDate}T00:00:00`);
  while (cur <= end) {
    if (scheduled.has(cur.getDay())) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

function countScheduledHours(startDate: string, endDate: string, workDays: string[] | null | undefined) {
  if (!startDate || !endDate || endDate < startDate) return 0;
  return countWorkingDays(startDate, endDate, workDays || []) * 8;
}

function dateBefore(dateStr: string, days = 1) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function generatePayslipHTML(opts: {
  name: string;
  department: string | null;
  period: { label: string; start: string; end: string };
  days: DayRow[];
  paymentType: 'hourly' | 'fixed' | 'fixed_flexible';
  hourlyRate: number;
  monthlyRate: number;
  currency: string;
  totalDaysWorked: number;
  totalHoursRaw: number;
  totalHoursBillable: number;
  totalOvertime: number;
  basePay: number;
  overtimePay: number;
  totalPay: number;
  generatedDate: string;
  logoUrl: string;
}) {
  const { name, department, period, days, paymentType, hourlyRate, monthlyRate, currency,
    totalDaysWorked, totalHoursRaw, totalHoursBillable, totalOvertime,
    basePay, overtimePay, totalPay, generatedDate, logoUrl } = opts;

  const isUSD = currency === 'USD';
  const fmt = (val: number) => isUSD
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val)
    : new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(val);

  const rateDisplay = paymentType === 'fixed'
    ? `${fmt(monthlyRate)} / month (bi-monthly disbursement of ${fmt(monthlyRate / 2)})`
    : `${isUSD ? 'USD' : 'PHP'} ${hourlyRate}.00 per hour`;

  const dayRows = days.map(d => `
    <tr>
      <td style="padding:7px 10px;border-bottom:1px solid #f0f0f0;color:#374151;">${fmtDate(d.date)}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #f0f0f0;color:#374151;text-align:center;">${fmtTime(d.first_on)}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #f0f0f0;color:#374151;text-align:center;">${fmtTime(d.last_off)}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #f0f0f0;color:#6b7280;text-align:center;">${d.hours_raw.toFixed(2)}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #f0f0f0;font-weight:600;color:#111827;text-align:center;">${d.hours_capped.toFixed(2)}</td>
      ${d.overtime_hours > 0
        ? `<td style="padding:7px 10px;border-bottom:1px solid #f0f0f0;color:#7c3aed;font-weight:600;text-align:center;">+${d.overtime_hours}</td>`
        : `<td style="padding:7px 10px;border-bottom:1px solid #f0f0f0;color:#d1d5db;text-align:center;">—</td>`}
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Payslip – ${name} – ${period.label}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #111827; background: #fff; padding: 48px; font-size: 13px; line-height: 1.5; }
    @media print {
      body { padding: 24px; }
      .no-print { display: none !important; }
      @page { margin: 1cm; }
    }
  </style>
</head>
<body>

  <!-- Letterhead -->
  <div style="display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:20px;border-bottom:3px solid #FF6B35;margin-bottom:28px;">
    <div style="display:flex;align-items:center;gap:14px;">
      <img src="${logoUrl}" alt="Huna Creatives" style="height:44px;width:auto;object-fit:contain;" />
      <div>
        <div style="font-size:18px;font-weight:800;color:#111827;letter-spacing:-0.3px;">Huna Creatives</div>
        <div style="font-size:11px;color:#9ca3af;margin-top:1px;">Cebu, Philippines · hunacreatives.com</div>
      </div>
    </div>
    <div style="text-align:right;">
      <div style="font-size:22px;font-weight:800;color:#FF6B35;letter-spacing:3px;">PAYSLIP</div>
      <div style="font-size:11px;color:#9ca3af;margin-top:4px;">Document No. HC-${Date.now().toString().slice(-8)}</div>
      <div style="font-size:11px;color:#9ca3af;">Issued: ${generatedDate}</div>
    </div>
  </div>

  <!-- Certification statement -->
  <div style="background:#f9fafb;border-left:3px solid #FF6B35;padding:14px 16px;border-radius:0 8px 8px 0;margin-bottom:28px;">
    <p style="font-size:12px;color:#374151;line-height:1.7;">
      <strong>To Whom It May Concern:</strong><br>
      This is to certify that <strong>${name}</strong>${department ? `, assigned to the <strong>${department}</strong> department,` : ''} is an active independent contractor of <strong>Huna Creatives</strong>, a creative agency based in Cebu, Philippines. This document serves as an official record of compensation rendered for the pay period indicated below, and may be used for financial, banking, or institutional purposes.
    </p>
  </div>

  <!-- Contractor + Period info -->
  <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px;margin-bottom:28px;">
    <div>
      <div style="font-size:10px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:5px;font-weight:600;">Contractor</div>
      <div style="font-size:15px;font-weight:700;color:#111827;">${name}</div>
      ${department ? `<div style="font-size:12px;color:#6b7280;margin-top:2px;">${department}</div>` : ''}
      <div style="font-size:11px;color:#9ca3af;margin-top:2px;">Independent Contractor</div>
    </div>
    <div>
      <div style="font-size:10px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:5px;font-weight:600;">Pay Period</div>
      <div style="font-size:14px;font-weight:700;color:#111827;">${period.label}</div>
      <div style="font-size:11px;color:#6b7280;margin-top:2px;">${period.start} to ${period.end}</div>
    </div>
    <div>
      <div style="font-size:10px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:5px;font-weight:600;">Compensation Basis</div>
      <div style="font-size:13px;font-weight:600;color:#111827;">${paymentType === 'fixed' ? 'Fixed Monthly Rate' : 'Hourly Rate'}</div>
      <div style="font-size:11px;color:#6b7280;margin-top:2px;">${rateDisplay}</div>
    </div>
  </div>

  <!-- Summary stats -->
  <div style="display:grid;grid-template-columns:repeat(${totalOvertime > 0 ? 4 : 3},1fr);gap:10px;margin-bottom:28px;">
    <div style="background:#f3f4f6;border-radius:10px;padding:14px;text-align:center;">
      <div style="font-size:24px;font-weight:800;color:#111827;">${totalDaysWorked}</div>
      <div style="font-size:10px;color:#6b7280;margin-top:3px;text-transform:uppercase;letter-spacing:0.5px;">Days Worked</div>
    </div>
    <div style="background:#f3f4f6;border-radius:10px;padding:14px;text-align:center;">
      <div style="font-size:24px;font-weight:800;color:#111827;">${totalHoursRaw.toFixed(1)}</div>
      <div style="font-size:10px;color:#6b7280;margin-top:3px;text-transform:uppercase;letter-spacing:0.5px;">Total Hours Logged</div>
    </div>
    <div style="background:#e0f2fe;border-radius:10px;padding:14px;text-align:center;">
      <div style="font-size:24px;font-weight:800;color:#0369a1;">${totalHoursBillable.toFixed(1)}</div>
      <div style="font-size:10px;color:#6b7280;margin-top:3px;text-transform:uppercase;letter-spacing:0.5px;">Billable Hours</div>
    </div>
    ${totalOvertime > 0 ? `
    <div style="background:#ede9fe;border-radius:10px;padding:14px;text-align:center;">
      <div style="font-size:24px;font-weight:800;color:#7c3aed;">+${totalOvertime}</div>
      <div style="font-size:10px;color:#6b7280;margin-top:3px;text-transform:uppercase;letter-spacing:0.5px;">Overtime Hours</div>
    </div>` : ''}
  </div>

  <!-- Attendance table -->
  <div style="margin-bottom:28px;">
    <div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:10px;">Attendance Record</div>
    <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
      <thead>
        <tr style="background:#f9fafb;">
          <th style="padding:9px 10px;text-align:left;font-size:10px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;">Date</th>
          <th style="padding:9px 10px;text-align:center;font-size:10px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;">Time In</th>
          <th style="padding:9px 10px;text-align:center;font-size:10px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;">Time Out</th>
          <th style="padding:9px 10px;text-align:center;font-size:10px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;">Raw Hrs</th>
          <th style="padding:9px 10px;text-align:center;font-size:10px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;">Billable Hrs</th>
          <th style="padding:9px 10px;text-align:center;font-size:10px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;">Overtime</th>
        </tr>
      </thead>
      <tbody>
        ${days.length > 0 ? dayRows : `<tr><td colspan="6" style="padding:20px;text-align:center;color:#9ca3af;font-style:italic;">No attendance records for this period.</td></tr>`}
      </tbody>
    </table>
  </div>

  <!-- Earnings breakdown -->
  <div style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;margin-bottom:28px;">
    <div style="background:#f9fafb;padding:11px 16px;font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.8px;border-bottom:1px solid #e5e7eb;">Compensation Breakdown</div>
    <table style="width:100%;border-collapse:collapse;">
      <tbody>
        ${paymentType === 'fixed' ? `
        <tr>
          <td style="padding:11px 16px;color:#374151;border-bottom:1px solid #f3f4f6;">Fixed Service Fee &nbsp;<span style="color:#9ca3af;font-size:11px;">(${fmt(monthlyRate)}/mo ÷ 2 periods)</span></td>
          <td style="padding:11px 16px;text-align:right;font-weight:600;color:#111827;border-bottom:1px solid #f3f4f6;">${fmt(basePay)}</td>
        </tr>` : `
        <tr>
          <td style="padding:11px 16px;color:#374151;border-bottom:1px solid #f3f4f6;">Base Pay &nbsp;<span style="color:#9ca3af;font-size:11px;">(${totalHoursBillable.toFixed(2)} billable hrs × ${isUSD ? '$' : '₱'}${hourlyRate}/hr)</span></td>
          <td style="padding:11px 16px;text-align:right;font-weight:600;color:#111827;border-bottom:1px solid #f3f4f6;">${fmt(basePay)}</td>
        </tr>`}
        ${totalOvertime > 0 ? `
        <tr>
          <td style="padding:11px 16px;color:#7c3aed;border-bottom:1px solid #f3f4f6;">Overtime Compensation &nbsp;<span style="color:#9ca3af;font-size:11px;">(${totalOvertime} hrs × ${isUSD ? '$' : '₱'}${hourlyRate}/hr)</span></td>
          <td style="padding:11px 16px;text-align:right;font-weight:600;color:#7c3aed;border-bottom:1px solid #f3f4f6;">+ ${fmt(overtimePay)}</td>
        </tr>` : ''}
        <tr style="background:#fff7f4;">
          <td style="padding:16px;font-weight:800;font-size:15px;color:#111827;">
            TOTAL COMPENSATION
            <div style="font-size:11px;font-weight:400;color:#9ca3af;margin-top:2px;">For the period ${period.label}</div>
          </td>
          <td style="padding:16px;text-align:right;font-weight:900;font-size:22px;color:#FF6B35;">${fmt(totalPay)}</td>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- Signature block -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:48px;margin-bottom:32px;margin-top:16px;">
    <div>
      <div style="border-top:1.5px solid #374151;padding-top:8px;margin-top:48px;">
        <div style="font-size:12px;font-weight:700;color:#111827;">Francis Fiel Roble</div>
        <div style="font-size:11px;color:#6b7280;">Owner, Huna Creatives</div>
        <div style="font-size:11px;color:#6b7280;">Date: ${generatedDate}</div>
      </div>
    </div>
    <div>
      <div style="border-top:1.5px solid #d1d5db;padding-top:8px;margin-top:48px;">
        <div style="font-size:12px;font-weight:700;color:#111827;">${name}</div>
        <div style="font-size:11px;color:#6b7280;">Independent Contractor</div>
        <div style="font-size:11px;color:#6b7280;">Date: &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</div>
      </div>
    </div>
  </div>

  <!-- Footer -->
  <div style="border-top:1px solid #f0f0f0;padding-top:16px;display:flex;justify-content:space-between;align-items:flex-start;">
    <div style="font-size:10px;color:#9ca3af;max-width:420px;line-height:1.7;">
      This document is an officially issued payslip by Huna Creatives. Attendance and hours are recorded via the company's internal time-tracking system. This payslip may be presented to banks, government agencies, or other institutions as proof of income.
      <br>For verification, contact us at <strong>hunacreatives.com</strong>.
    </div>
    <div style="text-align:right;">
      <img src="${logoUrl}" alt="Huna Creatives" style="height:28px;width:auto;opacity:0.3;" />
    </div>
  </div>

</body>
</html>`;
}

export default function ContractorPayoutsPage() {
  const { hubUser } = useAuth();
  const allPeriods = getPeriods();
  // Only show periods on or after the contractor's start date
  const startDate = (hubUser as any)?.start_date ?? null;
  const periods = startDate
    ? allPeriods.filter(p => p.end >= startDate)
    : allPeriods;
  const [selectedPeriod, setSelectedPeriod] = useState(periods[periods.length - 1]);
  const [days, setDays] = useState<DayRow[]>([]);

  // Button unlocks on the cutoff day itself (compare date only, not time)
  const todayPHT = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const canSubmitPeriod = todayPHT >= selectedPeriod.end;
  const [loading, setLoading] = useState(true);
  const [existingPayout, setExistingPayout] = useState<any>(null);
  const [rateHistory, setRateHistory] = useState<RateEntry[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [disputeModal, setDisputeModal] = useState(false);
  const [disputeReason, setDisputeReason] = useState('');
  const [disputeSaving, setDisputeSaving] = useState(false);
  const [existingDispute, setExistingDispute] = useState<any>(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (hubUser?.id) fetchDays();
  }, [hubUser, selectedPeriod]);

  const fetchDays = async () => {
    setLoading(true);
    const [daysRes, payoutRes, rateRes] = await Promise.all([
      supabase
        .from('hub_daily_hours')
        .select('date, hours_raw, hours_capped, overtime_hours, first_on, last_off')
        .eq('user_id', hubUser!.id)
        .gte('date', selectedPeriod.start)
        .lte('date', selectedPeriod.end)
        .order('date', { ascending: true }),
      supabase
        .from('hub_payouts')
        .select('id, status, final_payout, payment_date')
        .eq('contractor_id', hubUser!.id)
        .eq('cutoff_start', selectedPeriod.start)
        .maybeSingle(),
      supabase
        .from('hub_rate_history')
        .select('effective_date, payment_type, hourly_rate, monthly_rate')
        .eq('contractor_id', hubUser!.id)
        .lte('effective_date', selectedPeriod.end)
        .order('effective_date', { ascending: true }),
    ]);
    const payout = payoutRes.data ?? null;
    setDays((daysRes.data as DayRow[]) ?? []);
    setRateHistory((rateRes.data as RateEntry[]) ?? []);
    setExistingPayout(payout);

    if (payout?.id) {
      const { data: dispute } = await supabase
        .from('hub_payslip_disputes')
        .select('id, reason, status, admin_notes, created_at')
        .eq('payout_id', payout.id)
        .maybeSingle();
      setExistingDispute(dispute ?? null);
    } else {
      setExistingDispute(null);
    }
    setLoading(false);
  };

  const paymentType = (hubUser as any)?.payment_type || 'hourly';
  const currentHourlyRate = Number((hubUser as any)?.hourly_rate || 0);
  const currentMonthlyRate = Number((hubUser as any)?.monthly_rate || 0);
  const workDays = ((hubUser as any)?.work_days as string[] | null | undefined) || [];
  const currency = (hubUser as any)?.currency || 'PHP';
  const isUSD = currency === 'USD';

  const totalDaysWorked = days.length;
  const totalHoursRaw = days.reduce((s, d) => s + d.hours_raw, 0);
  const totalHoursBillable = days.reduce((s, d) => s + d.hours_capped, 0);
  const totalOvertime = days.reduce((s, d) => s + (d.overtime_hours || 0), 0);

  // Prorated pay calculation using rate history (same logic as admin payroll page)
  const changeInPeriod = rateHistory.find(r =>
    r.effective_date >= selectedPeriod.start && r.effective_date <= selectedPeriod.end
  );
  const rateAtStart = [...rateHistory].filter(r => r.effective_date < selectedPeriod.start).pop() || null;

  let basePay: number;
  let overtimePay: number;
  let otRate: number;
  let isProrated = false;
  let displayMonthlyRate: number;
  let displayHourlyRate: number;
  let proratedLabel = '';

  if (changeInPeriod) {
    isProrated = true;
    const beforeChange = [...rateHistory].filter(r => r.effective_date < changeInPeriod.effective_date).pop();
    const oldMonthly = beforeChange?.monthly_rate ?? currentMonthlyRate;
    const oldHourly  = beforeChange?.hourly_rate  ?? currentHourlyRate;
    const newMonthly = changeInPeriod.monthly_rate || 0;
    const newHourly  = changeInPeriod.hourly_rate  || 0;
    displayMonthlyRate = newMonthly;
    displayHourlyRate  = newHourly;
    if (paymentType === 'fixed' || paymentType === 'fixed_flexible') {
      const today = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const isCurrentPeriod = today >= selectedPeriod.start && today <= selectedPeriod.end;
      const effectiveEnd = isCurrentPeriod
        ? (today < selectedPeriod.end ? today : selectedPeriod.end)
        : selectedPeriod.end;
      const oldSegmentEnd = changeInPeriod.effective_date > selectedPeriod.start
        ? dateBefore(changeInPeriod.effective_date)
        : '';
      const expectedOldHours = oldSegmentEnd
        ? countScheduledHours(selectedPeriod.start, oldSegmentEnd, workDays)
        : 0;
      const expectedNewHours = changeInPeriod.effective_date <= effectiveEnd
        ? countScheduledHours(changeInPeriod.effective_date, effectiveEnd, workDays)
        : 0;
      const totalExpectedHours = expectedOldHours + expectedNewHours;
      let hrsAtOld = 0, hrsAtNew = 0;
      for (const d of days) {
        if (d.date < changeInPeriod.effective_date) hrsAtOld += d.hours_capped;
        else if (d.date <= effectiveEnd) hrsAtNew += d.hours_capped;
      }
      const oldPortion = totalExpectedHours > 0 ? (oldMonthly / 2) * (expectedOldHours / totalExpectedHours) : 0;
      const newPortion = totalExpectedHours > 0 ? (newMonthly / 2) * (expectedNewHours / totalExpectedHours) : 0;
      basePay =
        (expectedOldHours > 0 ? oldPortion * Math.min(hrsAtOld / expectedOldHours, 1) : 0) +
        (expectedNewHours > 0 ? newPortion * Math.min(hrsAtNew / expectedNewHours, 1) : 0);
      const oldOT = oldHourly || oldMonthly / 176;
      const newOT = newHourly || newMonthly / 176;
      let otAtOld = 0, otAtNew = 0;
      for (const d of days) {
        if (d.date < changeInPeriod.effective_date) otAtOld += d.overtime_hours || 0;
        else if (d.date <= effectiveEnd) otAtNew += d.overtime_hours || 0;
      }
      overtimePay = otAtOld * oldOT + otAtNew * newOT;
      otRate = newOT;
      proratedLabel = `${hrsAtOld.toFixed(1)}/${expectedOldHours || 0}h @ ₱${oldMonthly.toLocaleString()}/mo · ${hrsAtNew.toFixed(1)}/${expectedNewHours || 0}h @ ₱${newMonthly.toLocaleString()}/mo`;
    } else {
      let hrsAtOld = 0, hrsAtNew = 0;
      for (const d of days) {
        if (d.date < changeInPeriod.effective_date) hrsAtOld += d.hours_capped;
        else hrsAtNew += d.hours_capped;
      }
      basePay = hrsAtOld * oldHourly + hrsAtNew * newHourly;
      otRate = newHourly;
      overtimePay = totalOvertime * newHourly;
    }
  } else {
    const eff = rateAtStart;
    const monthly = eff?.monthly_rate ?? currentMonthlyRate;
    const hourly  = eff?.hourly_rate  ?? currentHourlyRate;
    displayMonthlyRate = monthly;
    displayHourlyRate  = hourly;
    if (paymentType === 'fixed' || paymentType === 'fixed_flexible') {
      const today = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const isCurrentPeriod = today >= selectedPeriod.start && today <= selectedPeriod.end;
      const effectiveEnd = isCurrentPeriod ? (today < selectedPeriod.end ? today : selectedPeriod.end) : selectedPeriod.end;
      const expectedHours = countScheduledHours(selectedPeriod.start, effectiveEnd, workDays);
      const accrualRatio = expectedHours > 0 ? Math.min(totalHoursBillable / expectedHours, 1) : 0;
      basePay = (monthly / 2) * accrualRatio;
      isProrated = true;
      proratedLabel = `${totalHoursBillable.toFixed(1)}/${expectedHours}h scheduled${isCurrentPeriod ? ' · accruing' : ''}`;
      otRate = hourly || monthly / 176;
    } else {
      basePay = totalHoursBillable * hourly;
      otRate = hourly;
    }
    overtimePay = totalOvertime * otRate;
  }
  const totalPay = basePay + overtimePay;

  const handleSubmit = async () => {
    if (!hubUser || submitting) return;
    setSubmitting(true);
    const { data, error } = await supabase.from('hub_payouts').upsert({
      contractor_id: hubUser.id,
      cutoff_start: selectedPeriod.start,
      cutoff_end: selectedPeriod.end,
      approved_hours: totalHoursBillable,
      hourly_rate: paymentType === 'hourly' ? displayHourlyRate : displayMonthlyRate / 176,
      base_pay: basePay,
      bonus: 0,
      incentives: 0,
      reimbursements: 0,
      deductions: 0,
      advances: 0,
      penalties: 0,
      final_payout: totalPay,
      status: 'submitted',
      submitted_at: new Date().toISOString(),
      locked: false,
    }, { onConflict: 'contractor_id,cutoff_start' }).select('id, status, final_payout, payment_date').single();
    if (!error && data) {
      setExistingPayout(data);
      await supabase.functions.invoke('notify-payslip-submitted', { body: { payout_id: data.id } });
    }
    setSubmitting(false);
  };

  const fmt = (val: number) => isUSD
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val)
    : fmtPHP(val);

  const submitDispute = async () => {
    if (!hubUser || !existingPayout || !disputeReason.trim()) return;
    setDisputeSaving(true);
    await supabase.from('hub_payslip_disputes').insert({
      payout_id: existingPayout.id,
      contractor_id: hubUser.id,
      reason: disputeReason.trim(),
    });
    supabase.functions.invoke('notify-payslip-submitted', { body: { payout_id: existingPayout.id, type: 'dispute' } }).catch(() => {});
    setDisputeSaving(false);
    setDisputeModal(false);
    setDisputeReason('');
    await fetchDays();
  };

  const handleDownload = () => {
    const html = generatePayslipHTML({
      name: hubUser?.full_name || '',
      department: (hubUser as any)?.department || null,
      period: selectedPeriod,
      days,
      paymentType,
      hourlyRate: displayHourlyRate,
      monthlyRate: displayMonthlyRate,
      currency,
      totalDaysWorked,
      totalHoursRaw,
      totalHoursBillable,
      totalOvertime,
      basePay,
      overtimePay,
      totalPay,
      generatedDate: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
      logoUrl: `${window.location.origin}/images/547b59870e776a20eb28e4f20931787c.png`,
    });
    const win = window.open('', '_blank', 'width=900,height=1000');
    if (!win) return;
    win.document.write(html);
    win.document.close();
    setTimeout(() => win.print(), 400);
  };

  return (
    <ContractorLayout title="My Payouts">
      <div className="max-w-2xl space-y-5">

        {/* Period selector */}
        <div className="bg-white border border-gray-100 rounded-xl p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-gray-800">Pay Period</p>
            <select
              value={selectedPeriod.start}
              onChange={(e) => setSelectedPeriod(periods.find(p => p.start === e.target.value)!)}
              className="flex-1 max-w-[220px] border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/30 focus:border-[#FF6B35] bg-white cursor-pointer"
            >
              {periods.map((p) => (
                <option key={p.start} value={p.start}>{p.label}</option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <i className="ri-loader-4-line animate-spin text-2xl text-gray-300"></i>
          </div>
        ) : (
          <>
            {/* Payslip preview card */}
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">

              {/* Payslip header */}
              <div className="bg-[#111827] px-6 py-5 flex items-start justify-between">
                <div>
                  <p className="text-white font-bold text-base">Huna Creatives</p>
                  <p className="text-white/40 text-xs mt-0.5">Contractor Payment Summary</p>
                </div>
                <div className="text-right">
                  <p className="text-[#FF6B35] font-bold text-sm tracking-widest">PAYSLIP</p>
                  <p className="text-white/40 text-xs mt-1">{selectedPeriod.label}</p>
                </div>
              </div>

              {/* Contractor info row */}
              <div className="px-6 py-4 border-b border-gray-50 grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">Contractor</p>
                  <p className="text-sm font-semibold text-gray-900">{hubUser?.full_name}</p>
                  {(hubUser as any)?.department && <p className="text-xs text-gray-400">{(hubUser as any).department}</p>}
                </div>
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">Pay Period</p>
                  <p className="text-sm font-semibold text-gray-900">{selectedPeriod.label}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">Rate</p>
                  <p className="text-sm font-semibold text-gray-900">
                    {isProrated ? 'Prorated' : paymentType === 'hourly' ? `${isUSD ? '$' : '₱'}${displayHourlyRate}/hr` : `₱${displayMonthlyRate.toLocaleString()}/mo`}
                  </p>
                  <p className="text-xs text-gray-400">{isProrated ? proratedLabel : paymentType}</p>
                </div>
              </div>

              {/* Stats row */}
              <div className="px-6 py-4 border-b border-gray-50 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                {[
                  { label: 'Days Worked', value: totalDaysWorked, color: 'text-gray-900' },
                  { label: 'Hours Logged', value: `${totalHoursRaw.toFixed(1)}h`, color: 'text-gray-900' },
                  { label: 'Billable Hours', value: `${totalHoursBillable.toFixed(1)}h`, color: 'text-sky-700' },
                  { label: 'Overtime', value: totalOvertime > 0 ? `+${totalOvertime}h` : '—', color: totalOvertime > 0 ? 'text-purple-700' : 'text-gray-400' },
                ].map(s => (
                  <div key={s.label} className="bg-gray-50 rounded-xl py-3">
                    <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{s.label}</p>
                  </div>
                ))}
              </div>

              {/* Day log */}
              {days.length > 0 ? (
                <div className="px-6 py-4 border-b border-gray-50">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Attendance Log</p>
                  <div className="space-y-1.5">
                    {days.map((d) => (
                      <div key={d.date} className="flex items-center gap-2 text-sm py-1.5 border-b border-gray-50 last:border-0">
                        <span className="text-gray-500 min-w-0 w-24 flex-shrink-0 text-xs">{fmtDate(d.date)}</span>
                        <span className="text-gray-400 text-xs flex-shrink-0 hidden sm:block">{fmtTime(d.first_on)}<i className="ri-arrow-right-line text-gray-300 mx-1"></i>{fmtTime(d.last_off)}</span>
                        <span className="flex-1 text-right">
                          <span className="font-medium text-gray-800 text-sm">{d.hours_capped.toFixed(2)}h</span>
                          {d.hours_raw > d.hours_capped && (
                            <span className="text-xs text-amber-500 ml-1" title="Capped at 8h">↑{d.hours_raw.toFixed(1)}h</span>
                          )}
                        </span>
                        {d.overtime_hours > 0 && (
                          <span className="text-xs px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded font-medium flex-shrink-0">+{d.overtime_hours}h OT</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="px-6 py-8 text-center border-b border-gray-50">
                  <i className="ri-calendar-line text-2xl text-gray-200 block mb-2"></i>
                  <p className="text-sm text-gray-400">No attendance logged for this period</p>
                </div>
              )}

              {/* Earnings breakdown */}
              <div className="px-6 py-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Earnings</p>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">
                      {isProrated
                        ? `Prorated base (${proratedLabel})`
                        : paymentType !== 'hourly'
                          ? `Fixed rate (${fmt(displayMonthlyRate)}/mo ÷ 2)`
                          : `Base pay (${totalHoursBillable.toFixed(2)}h × ${isUSD ? '$' : '₱'}${displayHourlyRate})`}
                    </span>
                    <span className="text-sm font-medium text-gray-800">{fmt(basePay)}</span>
                  </div>
                  {overtimePay > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-purple-600">
                        Overtime ({totalOvertime}h × {isUSD ? '$' : '₱'}{otRate.toFixed(2)}/hr)
                      </span>
                      <span className="text-sm font-medium text-purple-700">+{fmt(overtimePay)}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between pt-3 mt-1 border-t border-gray-100">
                    <span className="font-semibold text-gray-900">Total Payout</span>
                    <span className="text-xl font-bold text-[#FF6B35]">{fmt(totalPay)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Status + actions */}
            {existingPayout ? (
              <div className="space-y-3">
                <div className={`rounded-xl px-4 py-3.5 flex items-center gap-3 ${
                  existingPayout.status === 'paid' ? 'bg-emerald-50 border border-emerald-100' :
                  existingPayout.status === 'hr_approved' ? 'bg-sky-50 border border-sky-100' :
                  'bg-amber-50 border border-amber-100'
                }`}>
                  <i className={`text-lg ${
                    existingPayout.status === 'paid' ? 'ri-checkbox-circle-fill text-emerald-500' :
                    existingPayout.status === 'hr_approved' ? 'ri-shield-check-fill text-sky-500' :
                    'ri-time-fill text-amber-500'
                  }`}></i>
                  <div className="flex-1">
                    <p className={`text-sm font-semibold ${
                      existingPayout.status === 'paid' ? 'text-emerald-800' :
                      existingPayout.status === 'hr_approved' ? 'text-sky-800' : 'text-amber-800'
                    }`}>
                      {existingPayout.status === 'paid' ? 'Payment sent' :
                       existingPayout.status === 'hr_approved' ? 'Approved — payment incoming' :
                       'Submitted — awaiting HR review'}
                    </p>
                    {existingPayout.status === 'paid' && existingPayout.payment_date && (
                      <p className="text-xs text-emerald-600 mt-0.5">Paid on {new Date(existingPayout.payment_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
                    )}
                    {existingPayout.status === 'submitted' && (
                      <p className="text-xs text-amber-600 mt-0.5">Your payslip is under review.</p>
                    )}
                    {existingPayout.status === 'hr_approved' && (
                      <p className="text-xs text-sky-600 mt-0.5">Approved! Payment will be sent within 2 days.</p>
                    )}
                  </div>
                  <span className="text-sm font-bold text-gray-800">{fmt(existingPayout.final_payout)}</span>
                </div>
                <button
                  onClick={handleDownload}
                  className="w-full flex items-center justify-center gap-2 border border-gray-200 text-gray-600 hover:bg-gray-50 font-medium py-2.5 rounded-xl transition-colors cursor-pointer text-sm"
                >
                  <i className="ri-download-2-line"></i>
                  Download Payslip
                </button>

                {/* Dispute/flag section */}
                {existingDispute ? (
                  <div className={`rounded-xl px-4 py-3 border ${
                    existingDispute.status === 'resolved'
                      ? 'bg-emerald-50 border-emerald-100'
                      : 'bg-rose-50 border-rose-100'
                  }`}>
                    <div className="flex items-center gap-2 mb-1">
                      <i className={`ri-flag-fill text-sm ${existingDispute.status === 'resolved' ? 'text-emerald-500' : 'text-rose-500'}`}></i>
                      <p className={`text-xs font-semibold ${existingDispute.status === 'resolved' ? 'text-emerald-700' : 'text-rose-700'}`}>
                        {existingDispute.status === 'resolved' ? 'Dispute resolved' : 'Payslip flagged — HR will review'}
                      </p>
                    </div>
                    <p className="text-xs text-gray-500 ml-5">{existingDispute.reason}</p>
                    {existingDispute.admin_notes && (
                      <p className="text-xs text-emerald-700 ml-5 mt-1"><strong>HR: </strong>{existingDispute.admin_notes}</p>
                    )}
                  </div>
                ) : existingPayout && (
                  <button
                    onClick={() => { setDisputeReason(''); setDisputeModal(true); }}
                    className="w-full flex items-center justify-center gap-2 border border-rose-100 text-rose-400 hover:bg-rose-50 font-medium py-2 rounded-xl transition-colors cursor-pointer text-xs"
                  >
                    <i className="ri-flag-line"></i>
                    Flag an Issue with this Payslip
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <button
                  onClick={handleSubmit}
                  disabled={submitting || days.length === 0 || !canSubmitPeriod}
                  className="w-full flex items-center justify-center gap-2 bg-[#FF6B35] hover:bg-[#e55a27] disabled:opacity-40 text-white font-medium py-3 rounded-xl transition-colors cursor-pointer"
                >
                  {submitting ? <i className="ri-loader-4-line animate-spin"></i> : <i className="ri-send-plane-line"></i>}
                  {submitting ? 'Submitting...' : 'Submit for Payment'}
                </button>
                {!canSubmitPeriod && (
                  <p className="text-xs text-center text-gray-400">Available on {selectedPeriod.end} (cutoff day)</p>
                )}
                {canSubmitPeriod && (
                  <p className="text-xs text-center text-gray-400">Make sure all your hours are logged before submitting.</p>
                )}
                <button
                  onClick={handleDownload}
                  className="w-full flex items-center justify-center gap-2 border border-gray-200 text-gray-600 hover:bg-gray-50 font-medium py-2.5 rounded-xl transition-colors cursor-pointer text-sm"
                >
                  <i className="ri-download-2-line"></i>
                  Download Payslip
                </button>
                <p className="text-xs text-center text-gray-400">
                  Submit by the 15th or last day of the month. Payment is sent the first business day after.
                </p>
              </div>
            )}
          </>
        )}
      </div>
      {/* Dispute modal */}
      {disputeModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 sm:p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div>
                <h2 className="font-semibold text-[#111827]">Flag a Payslip Issue</h2>
                <p className="text-xs text-gray-400 mt-0.5">{selectedPeriod.label}</p>
              </div>
              <button onClick={() => setDisputeModal(false)} className="text-gray-400 hover:text-gray-600 cursor-pointer w-7 h-7 flex items-center justify-center">
                <i className="ri-close-line text-lg"></i>
              </button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-xs text-gray-500">Describe the issue — e.g. wrong hours, incorrect rate, missing overtime.</p>
              <textarea
                value={disputeReason}
                onChange={(e) => setDisputeReason(e.target.value)}
                rows={4}
                placeholder="e.g. My hours show 20h but I worked 32h this period..."
                maxLength={500}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/30 focus:border-[#FF6B35] resize-none"
              />
              <div className="flex gap-2">
                <button onClick={() => setDisputeModal(false)}
                  className="flex-1 py-2.5 text-sm border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 cursor-pointer">
                  Cancel
                </button>
                <button onClick={submitDispute} disabled={disputeSaving || !disputeReason.trim()}
                  className="flex-1 py-2.5 text-sm bg-rose-500 text-white rounded-lg hover:bg-rose-600 disabled:opacity-40 cursor-pointer transition-colors">
                  {disputeSaving ? 'Submitting...' : 'Submit Flag'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </ContractorLayout>
  );
}
