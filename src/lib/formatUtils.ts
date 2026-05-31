export const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
export const FULL_MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function pad(n: number) {
  return String(n).padStart(2, '0');
}

/** Returns today's date in YYYY-MM-DD using LOCAL time (not UTC) */
export function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toDateStr(date: Date) {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function addUtcDays(dateStr: string, days: number) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return toDateStr(d);
}

export function formatPayrollPeriodLabel(start: string, end: string): string {
  const startDate = new Date(`${start}T00:00:00Z`);
  const endDate = new Date(`${end}T00:00:00Z`);
  const sameYear = startDate.getUTCFullYear() === endDate.getUTCFullYear();
  const sameMonth = sameYear && startDate.getUTCMonth() === endDate.getUTCMonth();

  if (sameMonth) {
    return `${MONTHS[startDate.getUTCMonth()]} ${startDate.getUTCDate()}–${endDate.getUTCDate()}, ${startDate.getUTCFullYear()}`;
  }

  return `${MONTHS[startDate.getUTCMonth()]} ${startDate.getUTCDate()} – ${MONTHS[endDate.getUTCMonth()]} ${endDate.getUTCDate()}, ${endDate.getUTCFullYear()}`;
}

export function getPeriods(): { label: string; start: string; end: string }[] {
  const periods: { label: string; start: string; end: string }[] = [];
  const now = new Date();
  const lastDay = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
  const lastWorkingDay = (y: number, m: number) => {
    const d = new Date(y, m + 1, 0); // last calendar day
    if (d.getDay() === 6) d.setDate(d.getDate() - 1); // Sat → Fri
    if (d.getDay() === 0) d.setDate(d.getDate() - 2); // Sun → Fri
    return d.getDate();
  };

  let year = 2026;
  let month = 0;
  let firstHalf = true;

  const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  while (true) {
    const start = firstHalf
      ? `${year}-${pad(month + 1)}-01`
      : `${year}-${pad(month + 1)}-16`;
    if (start > todayStr) return periods;

    const endDay = firstHalf ? 15 : lastWorkingDay(year, month);
    const calendarEndDay = firstHalf ? 15 : lastDay(year, month);
    const end = `${year}-${pad(month + 1)}-${pad(endDay)}`;
    const label = firstHalf
      ? `${MONTHS[month]} 1–15, ${year}`
      : `${MONTHS[month]} 16–${calendarEndDay}, ${year}`;

    periods.push({ label, start, end });

    if (firstHalf) {
      firstHalf = false;
    } else {
      firstHalf = true;
      month += 1;
      if (month > 11) { month = 0; year += 1; }
    }
  }
}

export function getNextPayrollCutoff(): { date: string; label: string; daysAway: number } {
  const pad = (n: number) => String(n).padStart(2, '0');
  const now = new Date();

  const phtParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);

  const year = Number(phtParts.find(p => p.type === 'year')?.value);
  const month = Number(phtParts.find(p => p.type === 'month')?.value);
  const day = Number(phtParts.find(p => p.type === 'day')?.value);

  const todayUtc = new Date(Date.UTC(year, month - 1, day));

  const lastWorkingDay = (y: number, m1: number) => {
    const d = new Date(Date.UTC(y, m1, 0));
    const dow = d.getUTCDay();
    if (dow === 6) d.setUTCDate(d.getUTCDate() - 1);
    if (dow === 0) d.setUTCDate(d.getUTCDate() - 2);
    return d;
  };

  const candidates: Date[] = [];
  for (let offset = 0; offset <= 1; offset++) {
    const base = new Date(Date.UTC(year, month - 1 + offset, 1));
    const y = base.getUTCFullYear();
    const m = base.getUTCMonth() + 1;
    candidates.push(new Date(Date.UTC(y, m - 1, 15)));
    candidates.push(lastWorkingDay(y, m));
  }

  for (const cutoff of candidates.sort((a, b) => a.getTime() - b.getTime())) {
    if (cutoff >= todayUtc) {
      const daysAway = Math.round((cutoff.getTime() - todayUtc.getTime()) / 86400000);
      return {
        date: `${cutoff.getUTCFullYear()}-${pad(cutoff.getUTCMonth() + 1)}-${pad(cutoff.getUTCDate())}`,
        label: cutoff.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long', day: 'numeric', year: 'numeric' }),
        daysAway,
      };
    }
  }

  return { date: '', label: '', daysAway: 0 };
}

export function fmtCurrency(val: number, currency = 'PHP') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2 }).format(val);
}

export function fmtPHP(val: number) {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 2 }).format(val);
}

export function fmtTime(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

export function fmtDate(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
