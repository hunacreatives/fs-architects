import { supabase } from '@/lib/supabase';
import { localToday } from '@/lib/formatUtils';
import { fetchUserFinanceMap, mergeFinance } from '@/lib/userFinance';

const DAY_MAP: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function normalizeWorkDay(day: string) {
  const trimmed = String(day || '').trim();
  if (!trimmed) return '';
  const lower = trimmed.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1, 3);
}

export function isAutoPayrollUser(user: { full_name?: string | null; role?: string | null; auto_payroll?: boolean | null }) {
  if (user.auto_payroll != null) return user.auto_payroll === true;
  // Fallback for rows that predate the auto_payroll column
  const name = (user.full_name || '').trim().toLowerCase();
  const role = (user.role || '').trim().toLowerCase();
  return (role === 'admin' || role === 'hr') && !name.includes('testing');
}

type DailyHoursRow = {
  date: string;
  hours_raw?: number | null;
  hours_capped?: number | null;
  overtime_hours?: number | null;
  user_id?: string | null;
};

type LiveAttendanceRow = {
  hub_user_id: string | null;
  hours_today?: number | null;
  overtime_today?: number | null;
  shift_date?: string | null;
  last_punch?: string | null;
  punches?: Array<{ status?: string | null; time?: string | null }> | null;
};

function toAsiaManilaDate(value?: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
}

function inferAttendanceDate(item: LiveAttendanceRow, targetDate: string) {
  if (item.shift_date) return item.shift_date;
  const firstOn = item.punches?.find((p) => p.status === 'on' && p.time)?.time;
  return toAsiaManilaDate(firstOn) || toAsiaManilaDate(item.last_punch) || targetDate;
}

export function consolidateDailyHoursByUserDate<T extends DailyHoursRow>(rows: T[]) {
  const merged = new Map<string, T>();

  for (const row of rows) {
    const key = `${row.user_id || ''}::${row.date}`;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, { ...row });
      continue;
    }

    merged.set(key, {
      ...existing,
      ...row,
      user_id: row.user_id ?? existing.user_id,
      date: row.date || existing.date,
      hours_raw: Math.max(Number(existing.hours_raw || 0), Number(row.hours_raw || 0)),
      hours_capped: Math.max(Number(existing.hours_capped || 0), Number(row.hours_capped || 0)),
      overtime_hours: Math.max(Number(existing.overtime_hours || 0), Number(row.overtime_hours || 0)),
    });
  }

  return Array.from(merged.values());
}

export function mergeLiveAttendanceIntoDailyHours<T extends {
  date: string;
  hours_raw?: number | null;
  hours_capped?: number | null;
  overtime_hours?: number | null;
  user_id?: string;
  is_manual?: boolean | null;
}>(
  rows: T[],
  attendance: LiveAttendanceRow[] | null | undefined,
  userIds?: string[],
  targetDate = localToday(),
) {
  const allowed = userIds ? new Set(userIds) : null;
  const merged = new Map<string, T>();

  for (const row of consolidateDailyHoursByUserDate(rows)) {
    const key = `${row.user_id || ''}::${row.date}`;
    merged.set(key, { ...row });
  }

  // Accumulate live hours across multiple sessions for the same user+date
  const liveAccum = new Map<string, { userId: string; date: string; hours: number; ot: number }>();
  for (const item of attendance || []) {
    const userId = item.hub_user_id;
    if (!userId) continue;
    if (allowed && !allowed.has(userId)) continue;
    const liveHours = Number(item.hours_today || 0);
    const liveOt = Number(item.overtime_today || 0);
    if (liveHours <= 0 && liveOt <= 0) continue;

    const attendanceDate = inferAttendanceDate(item, targetDate);
    const key = `${userId}::${attendanceDate}`;
    const acc = liveAccum.get(key);
    if (acc) {
      acc.hours += liveHours;
      acc.ot += liveOt;
    } else {
      liveAccum.set(key, { userId, date: attendanceDate, hours: liveHours, ot: liveOt });
    }
  }

  for (const [key, live] of liveAccum) {
    const existing = merged.get(key);

    // Never overwrite a manually-edited record with live Slack data
    if (existing?.is_manual) continue;

    merged.set(key, {
      ...(existing || { user_id: live.userId, date: live.date }),
      user_id: live.userId,
      date: live.date,
      hours_raw: Math.max(Number(existing?.hours_raw || 0), live.hours),
      hours_capped: Math.max(Number(existing?.hours_capped || 0), live.hours),
      overtime_hours: Math.max(Number(existing?.overtime_hours || 0), live.ot),
    } as T);
  }

  return Array.from(merged.values());
}

export function countWorkingDays(startDate: string, endDate: string, workDays: string[] = []) {
  const scheduled = workDays.length > 0
    ? new Set(
        workDays
          .map(normalizeWorkDay)
          .map((d) => DAY_MAP[d])
          .filter((d): d is number => typeof d === 'number')
      )
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

export function countScheduledHours(startDate: string, endDate: string, workDays: string[] | null | undefined) {
  if (!startDate || !endDate || endDate < startDate) return 0;
  return countWorkingDays(startDate, endDate, workDays || []) * 8;
}

export function dateBefore(dateStr: string, days = 1) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

// DOLE overtime multipliers: 1.25× for regular weekdays, 1.30× for rest days (Sat/Sun)
// Pass isRestDay explicitly to override auto-detection (e.g. holidays on weekdays).
export function getOTMultiplier(date: string, isRestDay?: boolean | null): number {
  if (isRestDay != null) return isRestDay ? 1.30 : 1.25;
  const day = new Date(date + 'T12:00:00').getDay(); // 0=Sun, 6=Sat
  return (day === 0 || day === 6) ? 1.30 : 1.25;
}

// Minimum raw hours to qualify for OT pay (9h = 8h paid + 1h unpaid lunch per handbook)
const OT_QUALIFYING_RAW_HOURS = 9;

// Compute OT pay from a date→hours map, applying per-date DOLE multipliers.
// rawHoursByDate: if provided, OT is skipped for dates where actual raw hours < 9 —
// UNLESS the date is in trackedDates (explicitly admin/employee-approved via hub_overtime_requests),
// in which case it always vests since a human already confirmed the hours.
// isRestDayMap: explicit rest-day flags per date (from hub_overtime_requests.is_rest_day).
export function computeOTPayFromDates(
  otDates: Record<string, number>,
  rate: number,
  rawHoursByDate?: Record<string, number>,
  isRestDayMap?: Record<string, boolean>,
  trackedDates?: Set<string>
): number {
  return Object.entries(otDates).reduce((sum, [date, hours]) => {
    if (!trackedDates?.has(date) && rawHoursByDate && (rawHoursByDate[date] ?? 0) < OT_QUALIFYING_RAW_HOURS) return sum;
    return sum + hours * rate * getOTMultiplier(date, isRestDayMap?.[date]);
  }, 0);
}

// Prorated OT pay: split by a rate-change date (pre vs post raise)
export function computeSplitOTPayFromDates(
  otDates: Record<string, number>,
  splitDate: string,
  oldRate: number,
  newRate: number,
  rawHoursByDate?: Record<string, number>,
  isRestDayMap?: Record<string, boolean>,
  trackedDates?: Set<string>
): number {
  return Object.entries(otDates).reduce((sum, [date, hours]) => {
    if (!trackedDates?.has(date) && rawHoursByDate && (rawHoursByDate[date] ?? 0) < OT_QUALIFYING_RAW_HOURS) return sum;
    const rate = date < splitDate ? oldRate : newRate;
    return sum + hours * rate * getOTMultiplier(date, isRestDayMap?.[date]);
  }, 0);
}

function clampDayUnits(hours: number, scheduledDays: number) {
  if (scheduledDays <= 0) return 0;
  return Math.min(hours / 8, scheduledDays);
}

// ── Paid leave → payroll ──────────────────────────────────────────────────────
// A paid leave day counts as a full paid workday (8 hours = the daily paid hours;
// handbook: 9 raw clocked hours = 8 paid + 1h unpaid lunch). A half-day = 4h.
// These leave-hours are fed into the same hours maps the pay math already uses,
// so both hourly (hours × rate) and fixed/salaried (earned day units) employees
// are made whole for approved paid leave without any special-case pay formula.
export const PAID_LEAVE_DAY_HOURS = 8;

// Every leave type is employer-paid EXCEPT explicit unpaid leave.
export function isPaidLeaveType(type: string | null | undefined): boolean {
  return !!type && type !== 'unpaid';
}

function workDayNumberSet(workDays: string[] | null | undefined): Set<number> {
  if (!workDays || workDays.length === 0) return new Set([1, 2, 3, 4, 5]); // Mon–Fri
  const set = new Set<number>();
  for (const d of workDays) {
    const n = DAY_MAP[normalizeWorkDay(d)];
    if (typeof n === 'number') set.add(n);
  }
  return set.size ? set : new Set([1, 2, 3, 4, 5]);
}

type LeaveRow = { type: string; start_date: string; end_date: string; half_day?: boolean | null };

// Map of date → paid-leave hours for one employee's APPROVED leaves, clipped to
// the pay period and to the employee's scheduled work days. Unpaid leave and
// non-work days contribute nothing. Caller is responsible for passing only
// approved rows.
export function computeLeaveHoursByDate(
  leaves: LeaveRow[],
  periodStart: string,
  periodEnd: string,
  workDays: string[] | null | undefined,
): Record<string, number> {
  const result: Record<string, number> = {};
  const scheduled = workDayNumberSet(workDays);
  const pad = (n: number) => String(n).padStart(2, '0');
  for (const lv of leaves) {
    if (!isPaidLeaveType(lv.type)) continue;
    const from = lv.start_date > periodStart ? lv.start_date : periodStart;
    const to = lv.end_date < periodEnd ? lv.end_date : periodEnd;
    if (!from || !to || to < from) continue;
    const hoursPerDay = lv.half_day ? PAID_LEAVE_DAY_HOURS / 2 : PAID_LEAVE_DAY_HOURS;
    const cur = new Date(`${from}T00:00:00`);
    const end = new Date(`${to}T00:00:00`);
    while (cur <= end) {
      if (scheduled.has(cur.getDay())) {
        const ds = `${cur.getFullYear()}-${pad(cur.getMonth() + 1)}-${pad(cur.getDate())}`;
        result[ds] = Math.max(result[ds] || 0, hoursPerDay);
      }
      cur.setDate(cur.getDate() + 1);
    }
  }
  return result;
}

export function computeFixedAccrual(params: {
  periodStart: string;
  periodEnd: string;
  monthlyRate: number;
  workDays: string[] | null | undefined;
  cappedHours: number;
}) {
  const { periodStart, periodEnd, monthlyRate, workDays, cappedHours } = params;
  const totalScheduledDays = countWorkingDays(periodStart, periodEnd, workDays || []);
  const earnedDayUnits = clampDayUnits(cappedHours, totalScheduledDays);
  const fullPeriodPay = monthlyRate / 2;
  const accruedPay = totalScheduledDays > 0 ? fullPeriodPay * (earnedDayUnits / totalScheduledDays) : 0;
  return {
    totalScheduledDays,
    earnedDayUnits,
    fullPeriodPay,
    accruedPay,
  };
}

export function computeSplitFixedAccrual(params: {
  periodStart: string;
  periodEnd: string;
  changeDate: string;
  workDays: string[] | null | undefined;
  oldMonthlyRate: number;
  newMonthlyRate: number;
  oldCappedHours: number;
  newCappedHours: number;
}) {
  const {
    periodStart,
    periodEnd,
    changeDate,
    workDays,
    oldMonthlyRate,
    newMonthlyRate,
    oldCappedHours,
    newCappedHours,
  } = params;

  const totalScheduledDays = countWorkingDays(periodStart, periodEnd, workDays || []);
  const oldSegmentEnd = changeDate > periodStart ? dateBefore(changeDate) : '';
  const oldScheduledDays = oldSegmentEnd
    ? countWorkingDays(periodStart, oldSegmentEnd, workDays || [])
    : 0;
  const newScheduledDays = changeDate <= periodEnd
    ? countWorkingDays(changeDate, periodEnd, workDays || [])
    : 0;
  const oldEarnedDayUnits = clampDayUnits(oldCappedHours, oldScheduledDays);
  const newEarnedDayUnits = clampDayUnits(newCappedHours, newScheduledDays);

  const oldPortion = totalScheduledDays > 0 ? (oldMonthlyRate / 2) * (oldScheduledDays / totalScheduledDays) : 0;
  const newPortion = totalScheduledDays > 0 ? (newMonthlyRate / 2) * (newScheduledDays / totalScheduledDays) : 0;
  const oldAccruedPay = oldScheduledDays > 0 ? oldPortion * (oldEarnedDayUnits / oldScheduledDays) : 0;
  const newAccruedPay = newScheduledDays > 0 ? newPortion * (newEarnedDayUnits / newScheduledDays) : 0;

  return {
    totalScheduledDays,
    oldScheduledDays,
    newScheduledDays,
    oldEarnedDayUnits,
    newEarnedDayUnits,
    oldPortion,
    newPortion,
    accruedPay: oldAccruedPay + newAccruedPay,
  };
}

export async function fetchPayrollTotal(periodStart: string, periodEnd: string, usdRate = 56): Promise<number> {
  const [contractorsRes, hoursRes, paidPayoutsRes, otRequestsRes, leaveRes] = await Promise.all([
    supabase
      .from('hub_users')
      .select('id, full_name, role, currency, payment_type, hourly_rate, monthly_rate, start_date, work_days')
      .eq('status', 'active')
      .in('role', ['contractor', 'admin'])
      .neq('is_developer', true),
    supabase
      .from('hub_daily_hours')
      .select('user_id, hours_capped, overtime_hours, date')
      .gte('date', periodStart)
      .lte('date', periodEnd),
    supabase
      .from('hub_payouts')
      .select('contractor_id, payment_date')
      .eq('cutoff_start', periodStart)
      .eq('status', 'paid'),
    supabase
      .from('hub_overtime_requests')
      .select('contractor_id, date, is_rest_day')
      .eq('status', 'approved')
      .gte('date', periodStart)
      .lte('date', periodEnd),
    supabase
      .from('hub_time_off')
      .select('contractor_id, type, start_date, end_date, half_day')
      .eq('status', 'approved')
      .lte('start_date', periodEnd)
      .gte('end_date', periodStart),
  ]);

  const leavesByUser: Record<string, LeaveRow[]> = {};
  for (const lv of leaveRes.data || []) {
    if (!leavesByUser[lv.contractor_id]) leavesByUser[lv.contractor_id] = [];
    leavesByUser[lv.contractor_id].push(lv);
  }

  const isRestDayByUser: Record<string, Record<string, boolean>> = {};
  for (const req of otRequestsRes.data || []) {
    if (req.is_rest_day == null) continue;
    if (!isRestDayByUser[req.contractor_id]) isRestDayByUser[req.contractor_id] = {};
    isRestDayByUser[req.contractor_id][req.date] = req.is_rest_day;
  }

  // Salary columns are served only through the authorization-checked finance RPC.
  const financeMap = await fetchUserFinanceMap((contractorsRes.data || []).map((c: any) => c.id));
  const contractors = mergeFinance((contractorsRes.data || []) as any[], financeMap).filter((c: any) =>
    c.payment_type !== 'project_based' &&
    (!c.start_date || c.start_date <= periodEnd)
  );

  // Mirror payroll page: skip hours on or before payment_date for already-paid contractors
  const paidPaymentDateMap: Record<string, string> = {};
  for (const p of paidPayoutsRes.data || []) {
    if (p.payment_date) paidPaymentDateMap[p.contractor_id] = p.payment_date;
  }

  const hoursByDate: Record<string, Record<string, number>> = {};
  const overtimeByDate: Record<string, Record<string, number>> = {};
  const hoursMap: Record<string, { capped: number; overtime: number }> = {};
  for (const h of consolidateDailyHoursByUserDate((hoursRes.data || []) as DailyHoursRow[])) {
    const paymentDate = paidPaymentDateMap[h.user_id];
    if (paymentDate && h.date <= paymentDate) continue;
    if (!hoursMap[h.user_id]) hoursMap[h.user_id] = { capped: 0, overtime: 0 };
    hoursMap[h.user_id].capped += h.hours_capped;
    hoursMap[h.user_id].overtime += h.overtime_hours || 0;
    if (!hoursByDate[h.user_id]) hoursByDate[h.user_id] = {};
    hoursByDate[h.user_id][h.date] = (hoursByDate[h.user_id][h.date] || 0) + h.hours_capped;
    if (h.overtime_hours) {
      if (!overtimeByDate[h.user_id]) overtimeByDate[h.user_id] = {};
      overtimeByDate[h.user_id][h.date] = (overtimeByDate[h.user_id][h.date] || 0) + h.overtime_hours;
    }
  }

  // Fold approved paid leave into the capped-hours maps so leave days are paid.
  // A leave day acts as a floor of 8 paid hours (4 for a half-day): it tops a
  // date up to a full paid day without double-counting any hours already clocked.
  for (const c of contractors) {
    const leaves = leavesByUser[c.id];
    if (!leaves || leaves.length === 0) continue;
    const leaveHours = computeLeaveHoursByDate(leaves, periodStart, periodEnd, (c as any).work_days);
    const paymentDate = paidPaymentDateMap[c.id];
    for (const [date, hrs] of Object.entries(leaveHours)) {
      if (paymentDate && date <= paymentDate) continue; // already settled
      if (!hoursByDate[c.id]) hoursByDate[c.id] = {};
      const existing = hoursByDate[c.id][date] || 0;
      if (hrs <= existing) continue;
      const delta = hrs - existing;
      hoursByDate[c.id][date] = hrs;
      if (!hoursMap[c.id]) hoursMap[c.id] = { capped: 0, overtime: 0 };
      hoursMap[c.id].capped += delta;
    }
  }

  const ids = contractors.map((c: any) => c.id);
  const [{ data: rateHistoryAll }, { data: payoutsData }] = await Promise.all([
    ids.length > 0
      ? supabase
          .from('hub_rate_history')
          .select('contractor_id, effective_date, hourly_rate, monthly_rate')
          .in('contractor_id', ids)
          .lte('effective_date', periodEnd)
          .order('effective_date', { ascending: true })
      : Promise.resolve({ data: [] }),
    ids.length > 0
      ? supabase
          .from('hub_payouts')
          .select('contractor_id, adjustments')
          .in('contractor_id', ids)
          .eq('cutoff_start', periodStart)
      : Promise.resolve({ data: [] }),
  ]);

  const rateHistoryMap: Record<string, any[]> = {};
  for (const r of rateHistoryAll || []) {
    if (!rateHistoryMap[r.contractor_id]) rateHistoryMap[r.contractor_id] = [];
    rateHistoryMap[r.contractor_id].push(r);
  }

  const adjMap: Record<string, number> = {};
  for (const p of payoutsData || []) {
    const adjs: any[] = p.adjustments || [];
    adjMap[p.contractor_id] = adjs.reduce((s: number, a: any) => s + (a.amount || 0), 0);
  }

  let total = 0;

  for (const c of contractors) {
    const hrs = hoursMap[c.id] || { capped: 0, overtime: 0 };
    const payType = c.payment_type || 'hourly';
    const history = rateHistoryMap[c.id] || [];

    const changeInPeriod = history.find(r =>
      r.effective_date >= periodStart && r.effective_date <= periodEnd
    );
    const rateAtStart = [...history].filter(r => r.effective_date < periodStart).pop() || null;

    let pay = 0;

    if (changeInPeriod) {
      const beforeChange = [...history].filter(r => r.effective_date < changeInPeriod.effective_date).pop();
      const oldMonthly = beforeChange ? (beforeChange.monthly_rate || 0) : (c.monthly_rate || 0);
      const oldHourly  = beforeChange ? (beforeChange.hourly_rate  || 0) : (c.hourly_rate  || 0);
      const newMonthly = changeInPeriod.monthly_rate || 0;
      const newHourly  = changeInPeriod.hourly_rate  || 0;

      if (payType === 'fixed' || payType === 'fixed_flexible') {
        const autoPayroll = isAutoPayrollUser(c);
        const basePay = autoPayroll
          ? computeSplitFixedAccrual({
              periodStart,
              periodEnd,
              changeDate: changeInPeriod.effective_date,
              workDays: c.work_days,
              oldMonthlyRate: oldMonthly,
              newMonthlyRate: newMonthly,
              oldCappedHours: Number.MAX_SAFE_INTEGER,
              newCappedHours: Number.MAX_SAFE_INTEGER,
            }).accruedPay
          : (() => {
              const datesMap = hoursByDate[c.id] || {};
              let hrsAtOld = 0;
              let hrsAtNew = 0;
              for (const [date, h] of Object.entries(datesMap)) {
                if (date < changeInPeriod.effective_date) hrsAtOld += h as number;
                else hrsAtNew += h as number;
              }
              return computeSplitFixedAccrual({
                periodStart,
                periodEnd,
                changeDate: changeInPeriod.effective_date,
                workDays: c.work_days,
                oldMonthlyRate: oldMonthly,
                newMonthlyRate: newMonthly,
                oldCappedHours: hrsAtOld,
                newCappedHours: hrsAtNew,
              }).accruedPay;
            })();
        const oldOT = (beforeChange?.hourly_rate) || oldMonthly / 176;
        const newOT = changeInPeriod.hourly_rate || newMonthly / 176;
        const otDates = overtimeByDate[c.id] || {};
        const otPay = computeSplitOTPayFromDates(otDates, changeInPeriod.effective_date, oldOT, newOT, undefined, isRestDayByUser[c.id]);
        pay = basePay + otPay;
      } else {
        const datesMap = hoursByDate[c.id] || {};
        let hrsAtOld = 0, hrsAtNew = 0;
        for (const [date, h] of Object.entries(datesMap)) {
          if (date < changeInPeriod.effective_date) hrsAtOld += h as number;
          else hrsAtNew += h as number;
        }
        const otPay = computeOTPayFromDates(overtimeByDate[c.id] || {}, newHourly, undefined, isRestDayByUser[c.id]);
        pay = hrsAtOld * oldHourly + hrsAtNew * newHourly + otPay;
      }
    } else {
      const monthly = rateAtStart?.monthly_rate ?? c.monthly_rate ?? 0;
      const hourly  = rateAtStart?.hourly_rate  ?? c.hourly_rate  ?? 0;
      const otRate  = payType === 'fixed' || payType === 'fixed_flexible' ? (hourly || monthly / 176) : hourly;
      const otPay = computeOTPayFromDates(overtimeByDate[c.id] || {}, otRate, undefined, isRestDayByUser[c.id]);
      if (payType === 'fixed' || payType === 'fixed_flexible') {
        pay = computeFixedAccrual({
          periodStart,
          periodEnd,
          monthlyRate: monthly,
          workDays: c.work_days,
          cappedHours: isAutoPayrollUser(c) ? Number.MAX_SAFE_INTEGER : hrs.capped,
        }).accruedPay + otPay;
      } else {
        pay = hrs.capped * hourly + otPay;
      }
    }

    const inPHP = c.currency === 'USD' ? pay * usdRate : pay;
    total += inPHP + (adjMap[c.id] || 0);
  }

  return total;
}
