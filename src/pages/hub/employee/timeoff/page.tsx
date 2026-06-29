import { useEffect, useState } from 'react';
import ContractorLayout from '@/pages/hub/components/ContractorLayout';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { HubTimeOff } from '@/lib/types';

const VL_LIMIT = 6;
const SL_LIMIT = 4;
const PTO_LIMIT = VL_LIMIT;
const SICK_LIMIT = SL_LIMIT;
const ADVANCE_DAYS = 30;
const MAX_CONSECUTIVE = 3;

const typeLabels: Record<string, string> = {
  pto: 'Vacation Leave (VL)',
  sick: 'Sick Leave (SL)',
  birthday: 'Birthday Leave',
  sil: 'Service Incentive Leave (SIL)',
  emergency: 'Emergency Leave',
  maternity: 'Maternity Leave',
  paternity: 'Paternity Leave',
  solo_parent: 'Solo Parent Leave',
  women_special: 'Special Leave for Women',
  vawc: 'VAWC Leave',
  unpaid: 'Unpaid Leave',
};
const typeColors: Record<string, string> = {
  pto: 'bg-sky-100 text-sky-700',
  sick: 'bg-rose-100 text-rose-700',
  birthday: 'bg-pink-100 text-pink-700',
  sil: 'bg-teal-100 text-teal-700',
  emergency: 'bg-slate-100 text-[#1c2b3a]',
  maternity: 'bg-purple-100 text-purple-700',
  paternity: 'bg-indigo-100 text-indigo-700',
  solo_parent: 'bg-orange-100 text-orange-700',
  women_special: 'bg-fuchsia-100 text-fuchsia-700',
  vawc: 'bg-rose-100 text-rose-800',
  unpaid: 'bg-gray-100 text-gray-600',
};
const statusColors: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  forwarded: 'bg-purple-100 text-purple-700',
  approved: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-rose-100 text-rose-700',
};
const statusLabels: Record<string, string> = {
  pending: 'Pending',
  forwarded: 'Under Review',
  approved: 'Approved',
  rejected: 'Rejected',
};

const today = () => new Date().toISOString().split('T')[0];
const addDays = (date: string, n: number) => {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
};
const WEEKDAY_TOKENS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DEFAULT_WORK_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri'];

// Count scheduled work days in an inclusive range, skipping rest days. Leave is
// measured in working days, so a request spanning a weekend must not over-deduct.
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

export default function ContractorTimeOffPage() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<HubTimeOff[]>([]);
  const [blackouts, setBlackouts] = useState<{ start_date: string; end_date: string; reason?: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const [type, setType] = useState('pto');
  const [halfDay, setHalfDay] = useState(false);
  const [halfDayPeriod, setHalfDayPeriod] = useState('morning');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');

  const fetchAll = async () => {
    if (!user) return;
    setLoading(true);
    const [{ data: leaves }, { data: bd }] = await Promise.all([
      supabase.from('hub_time_off').select('*').eq('contractor_id', user.id).order('created_at', { ascending: false }),
      supabase.from('hub_blackout_dates').select('start_date, end_date, reason').gte('end_date', today()),
    ]);
    setRequests((leaves as HubTimeOff[]) ?? []);
    setBlackouts(bd ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, [user]);

  // Balance calculation (current year, approved only)
  const year = new Date().getFullYear();
  const approvedThisYear = requests.filter(
    (r) => r.status === 'approved' && new Date(r.start_date).getFullYear() === year
  );
  const workDays = (user as any)?.work_days as string[] | undefined;
  const ptoUsed = approvedThisYear
    .filter((r) => r.type === 'pto' || r.type === 'vacation')
    .reduce((sum, r) => sum + (r.half_day ? 0.5 : workingDaysBetween(r.start_date, r.end_date, workDays)), 0);
  const sickUsed = approvedThisYear
    .filter((r) => r.type === 'sick')
    .reduce((sum, r) => sum + (r.half_day ? 0.5 : workingDaysBetween(r.start_date, r.end_date, workDays)), 0);
  const ptoLeft = Math.max(0, PTO_LIMIT - ptoUsed);
  const sickLeft = Math.max(0, SICK_LIMIT - sickUsed);

  // Eligibility: 6 months from start_date
  const startDateUser = user && (user as any).start_date;
  const ptoEligibleDate = startDateUser
    ? new Date(new Date(startDateUser).setMonth(new Date(startDateUser).getMonth() + 6))
    : null;
  const isEligibleForPTO = ptoEligibleDate ? new Date() >= ptoEligibleDate : false;
  const ptoEligibleLabel = ptoEligibleDate
    ? ptoEligibleDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : null;

  const effectiveDays = halfDay ? 0.5 : (startDate && endDate ? workingDaysBetween(startDate, endDate, workDays) : 0);

  // Validation
  const validate = () => {
    if (!startDate) return 'Please select a start date.';
    if (!halfDay && !endDate) return 'Please select an end date.';
    const effectiveEnd = halfDay ? startDate : endDate;
    if (!halfDay && new Date(endDate) < new Date(startDate)) return 'End date must be after start date.';

    if (type === 'pto') {
      if (!isEligibleForPTO) return 'You are not yet eligible for PTO. Available 6 months after your start date.';
      if (ptoLeft <= 0) return 'You have no PTO days remaining for this year.';
      if (effectiveDays > ptoLeft) return `You only have ${ptoLeft} PTO day${ptoLeft !== 1 ? 's' : ''} left.`;
      // 30-day advance notice
      const advanceDate = addDays(today(), ADVANCE_DAYS);
      if (startDate < advanceDate) return `PTO must be submitted at least ${ADVANCE_DAYS} days in advance. Earliest start: ${advanceDate}.`;
      // Max 3 consecutive days
      if (!halfDay && effectiveDays > MAX_CONSECUTIVE) return `PTO cannot exceed ${MAX_CONSECUTIVE} consecutive days in a month.`;
    }

    if (type === 'sick') {
      if (!isEligibleForPTO) return 'Sick leave is available 6 months after your start date.';
      if (sickLeft <= 0) return 'You have no sick leave days remaining for this year.';
      if (effectiveDays > sickLeft) return `You only have ${sickLeft} sick day${sickLeft !== 1 ? 's' : ''} left.`;
    }

    // Blackout check (skip for emergency)
    if (type !== 'emergency') {
      for (const b of blackouts) {
        const overlap = startDate <= b.end_date && effectiveEnd >= b.start_date;
        if (overlap) return `Your dates overlap with a blackout period${b.reason ? `: "${b.reason}"` : '.'}`;
      }
    }
    return null;
  };

  const openModal = () => {
    setType('pto');
    setHalfDay(false);
    setHalfDayPeriod('morning');
    setStartDate('');
    setEndDate('');
    setReason('');
    setFormError('');
    setShowModal(true);
  };

  const submit = async () => {
    const err = validate();
    if (err) { setFormError(err); return; }
    if (!user) return;
    setSaving(true);
    setFormError('');
    const { error: insertError } = await supabase.from('hub_time_off').insert({
      contractor_id: user.id,
      type,
      start_date: startDate,
      end_date: halfDay ? startDate : endDate,
      half_day: halfDay,
      half_day_period: halfDay ? halfDayPeriod : null,
      reason: reason || null,
      status: 'pending',
    });
    setSaving(false);
    // Don't close the modal or notify admins if the request never saved —
    // otherwise the employee sees "success" and HR gets an email for a request
    // that doesn't exist in the hub.
    if (insertError) {
      console.error('time-off insert failed', insertError);
      setFormError('Your request could not be submitted. Please try again or contact HR.');
      return;
    }
    setShowModal(false);
    const endForCalc = halfDay ? startDate : endDate;
    const days = halfDay ? 0.5 : workingDaysBetween(startDate, endForCalc, workDays);
    supabase.functions.invoke('notify-internal-request', {
      body: { type: 'time_off', contractor_name: user.full_name, detail: `${type} · ${startDate}${halfDay ? '' : ` – ${endDate}`}`, notes: reason || null },
    }).catch(console.error);
    supabase.functions.invoke('notify-admin', {
      body: { type: 'time_off_submitted', data: { contractor_name: user.full_name, leave_type: type, start_date: startDate, end_date: endForCalc, days } },
    }).catch(console.error);
    fetchAll();
  };

  // Advance notice check for display
  const advanceWarning = type === 'pto' && startDate && startDate < addDays(today(), ADVANCE_DAYS)
    ? `Earliest PTO start date is ${addDays(today(), ADVANCE_DAYS)}.` : null;

  return (
    <ContractorLayout title="Time Off">
      <div className="space-y-5">

        {/* Balance cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className={`border border-gray-100 rounded-xl p-4 ${isEligibleForPTO ? 'bg-sky-50' : 'bg-gray-50'}`}>
            <p className="text-xs text-gray-400 mb-1">VL Remaining</p>
            {isEligibleForPTO
              ? <p className="text-2xl font-bold text-sky-600">{ptoLeft}<span className="text-sm font-normal text-gray-300">/{VL_LIMIT}</span></p>
              : <p className="text-sm font-semibold text-gray-400">Unlocks {ptoEligibleLabel}</p>
            }
          </div>
          <div className="bg-white border border-gray-100 rounded-xl p-4">
            <p className="text-xs text-gray-400 mb-1">VL Used</p>
            <p className="text-2xl font-bold text-sky-400">{ptoUsed}<span className="text-sm font-normal text-gray-300">/{VL_LIMIT}</span></p>
          </div>
          <div className="bg-rose-50 border border-gray-100 rounded-xl p-4">
            <p className="text-xs text-gray-400 mb-1">SL Remaining</p>
            <p className="text-2xl font-bold text-rose-600">{sickLeft}<span className="text-sm font-normal text-gray-300">/{SL_LIMIT}</span></p>
          </div>
          <div className="bg-white border border-gray-100 rounded-xl p-4">
            <p className="text-xs text-gray-400 mb-1">SL Used</p>
            <p className="text-2xl font-bold text-rose-400">{sickUsed}<span className="text-sm font-normal text-gray-300">/{SL_LIMIT}</span></p>
          </div>
        </div>

        {/* Blackout notices */}
        {blackouts.length > 0 && (
          <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 space-y-1">
            <p className="text-xs font-semibold text-amber-700 flex items-center gap-1.5"><i className="ri-calendar-close-line"></i>Upcoming Blackout Dates</p>
            {blackouts.map((b, i) => (
              <p key={i} className="text-xs text-amber-600">
                {new Date(b.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – {new Date(b.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                {b.reason && ` · ${b.reason}`}
              </p>
            ))}
          </div>
        )}

        {/* Policy reminder */}
        <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 space-y-1.5">
          <p className="text-xs font-semibold text-gray-500 flex items-center gap-1.5"><i className="ri-information-line"></i>Leave Policy</p>
          <ul className="text-xs text-gray-400 space-y-1 list-disc list-inside">
            <li>VL: 6 days/year · available after 6 months · no carryover</li>
            <li>SL: 4 days/year · available after 6 months · separate from VL</li>
            <li>Birthday Leave: 1 paid day · file 3 days in advance</li>
            <li>SIL: 5 days/year · available after 1 year of service</li>
            <li>VL must be filed <strong className="text-gray-500">30 days in advance</strong> · max 3 consecutive days per month</li>
            <li>Maternity (105d), Paternity (7d), Solo Parent (7d), Women's Special (60d), VAWC (10d) — statutory; HR approval required with documentation</li>
            <li>Emergency leave: notify HR immediately, no advance notice required</li>
            <li>Unpaid leave: subject to approval based on workload</li>
            <li>Unused VL and SL are forfeited at year-end</li>
          </ul>
        </div>

        {/* Header row */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-400">{requests.length} request{requests.length !== 1 ? 's' : ''}</p>
          <button onClick={openModal}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#111827] text-white text-sm rounded-lg hover:bg-gray-800 transition-colors cursor-pointer whitespace-nowrap">
            <i className="ri-add-line"></i> Request Leave
          </button>
        </div>

        {/* List */}
        {loading ? (
          <div className="flex justify-center py-12"><i className="ri-loader-4-line animate-spin text-xl text-gray-400"></i></div>
        ) : requests.length === 0 ? (
          <div className="bg-white border border-gray-100 rounded-xl p-10 text-center">
            <i className="ri-calendar-2-line text-3xl text-gray-200 mb-2 block"></i>
            <p className="text-sm text-gray-400">No leave requests yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {requests.map((r) => {
              const days = r.half_day ? 0.5 : workingDaysBetween(r.start_date, r.end_date, workDays);
              return (
                <div key={r.id} className="bg-white border border-gray-100 rounded-xl p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${typeColors[r.type] || 'bg-gray-100 text-gray-600'}`}>
                          {typeLabels[r.type] || r.type}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[r.status] || 'bg-gray-100'}`}>
                          {statusLabels[r.status] || r.status}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                          {days === 0.5 ? `Half day (${r.half_day_period})` : `${days} day${days !== 1 ? 's' : ''}`}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-[#111827]">
                        {new Date(r.start_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        {!r.half_day && r.start_date !== r.end_date && (
                          <> – {new Date(r.end_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</>
                        )}
                        {r.half_day && `, ${new Date(r.start_date + 'T12:00:00').getFullYear()}`}
                      </p>
                      {r.reason && <p className="text-xs text-gray-400 mt-0.5">{r.reason}</p>}
                      {r.admin_notes && (
                        <div className="mt-2 bg-gray-50 rounded-lg px-3 py-2">
                          <p className="text-xs text-gray-500"><span className="font-medium">HR: </span>{r.admin_notes}</p>
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 whitespace-nowrap flex-shrink-0">
                      {new Date(r.created_at!).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="font-semibold text-[#111827]">Request Leave</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 cursor-pointer w-7 h-7 flex items-center justify-center">
                <i className="ri-close-line text-lg"></i>
              </button>
            </div>

            <div className="p-5 space-y-4">
              {formError && (
                <div className="flex items-start gap-2 p-3 bg-rose-50 border border-rose-100 rounded-lg">
                  <i className="ri-error-warning-line text-rose-500 text-sm mt-0.5 flex-shrink-0"></i>
                  <p className="text-xs text-rose-600">{formError}</p>
                </div>
              )}

              {/* Type */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-700">Leave Type</label>
                <select
                  value={type}
                  onChange={(e) => { setType(e.target.value); setFormError(''); }}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a] bg-white"
                >
                  {Object.entries(typeLabels).map(([val, label]) => {
                    const locked = val === 'pto' && !isEligibleForPTO;
                    return (
                      <option key={val} value={val} disabled={locked}>
                        {label}{locked ? ` — unlocks ${ptoEligibleLabel}` : ''}
                      </option>
                    );
                  })}
                </select>
                {(type === 'pto' || type === 'sick') && (
                  <p className="text-xs text-gray-400">
                    {type === 'pto'
                      ? `${ptoLeft}/${PTO_LIMIT} days remaining this year`
                      : `${sickLeft}/${SICK_LIMIT} days remaining this year`}
                  </p>
                )}
              </div>

              {/* Type-specific notices */}
              {type === 'emergency' && (
                <div className="flex items-start gap-2 p-3 bg-slate-50 border border-slate-100 rounded-lg">
                  <i className="ri-alarm-warning-line text-[#1c2b3a]/70 text-sm mt-0.5 flex-shrink-0"></i>
                  <p className="text-xs text-[#1c2b3a]">Please notify HR immediately in addition to submitting this form. Emergencies do not require advance notice.</p>
                </div>
              )}
              {type === 'unpaid' && (
                <div className="flex items-start gap-2 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                  <i className="ri-information-line text-gray-400 text-sm mt-0.5 flex-shrink-0"></i>
                  <p className="text-xs text-gray-500">Unpaid leave is subject to approval based on current workload. It is not guaranteed.</p>
                </div>
              )}
              {type === 'maternity' && (
                <div className="flex items-start gap-2 p-3 bg-purple-50 border border-purple-100 rounded-lg">
                  <i className="ri-information-line text-purple-400 text-sm mt-0.5 flex-shrink-0"></i>
                  <p className="text-xs text-purple-700">Maternity Leave — up to 105 days paid (RA 11210). Notify HR as early as possible with medical documentation.</p>
                </div>
              )}
              {type === 'paternity' && (
                <div className="flex items-start gap-2 p-3 bg-indigo-50 border border-indigo-100 rounded-lg">
                  <i className="ri-information-line text-indigo-400 text-sm mt-0.5 flex-shrink-0"></i>
                  <p className="text-xs text-indigo-700">Paternity Leave — 7 days paid (RA 8187). Must be taken within 60 days of delivery. Notify HR with birth certificate.</p>
                </div>
              )}
              {type === 'solo_parent' && (
                <div className="flex items-start gap-2 p-3 bg-orange-50 border border-orange-100 rounded-lg">
                  <i className="ri-information-line text-orange-400 text-sm mt-0.5 flex-shrink-0"></i>
                  <p className="text-xs text-orange-700">Solo Parent Leave — 7 days paid (RA 8972). A valid Solo Parent ID is required.</p>
                </div>
              )}
              {type === 'women_special' && (
                <div className="flex items-start gap-2 p-3 bg-fuchsia-50 border border-fuchsia-100 rounded-lg">
                  <i className="ri-information-line text-fuchsia-400 text-sm mt-0.5 flex-shrink-0"></i>
                  <p className="text-xs text-fuchsia-700">Special Leave for Women — up to 60 days (RA 9710, Magna Carta for Women). Requires medical certification.</p>
                </div>
              )}
              {type === 'vawc' && (
                <div className="flex items-start gap-2 p-3 bg-rose-50 border border-rose-100 rounded-lg">
                  <i className="ri-information-line text-rose-400 text-sm mt-0.5 flex-shrink-0"></i>
                  <p className="text-xs text-rose-700">VAWC Leave — up to 10 days paid (RA 9262). Requires barangay protection order or court documentation. Notify HR confidentially.</p>
                </div>
              )}
              {type === 'birthday' && (
                <div className="flex items-start gap-2 p-3 bg-pink-50 border border-pink-100 rounded-lg">
                  <i className="ri-cake-line text-pink-400 text-sm mt-0.5 flex-shrink-0"></i>
                  <p className="text-xs text-pink-700">Birthday Leave — 1 paid day off on or near your birthday. File at least 3 days in advance.</p>
                </div>
              )}
              {type === 'sil' && (
                <div className="flex items-start gap-2 p-3 bg-teal-50 border border-teal-100 rounded-lg">
                  <i className="ri-information-line text-teal-400 text-sm mt-0.5 flex-shrink-0"></i>
                  <p className="text-xs text-teal-700">Service Incentive Leave — 5 days/year (Labor Code). Available to employees with at least 1 year of service.</p>
                </div>
              )}

              {/* Half day toggle */}
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="text-xs font-medium text-gray-700">Half Day</p>
                  <p className="text-xs text-gray-400">Uses 0.5 days from your balance</p>
                </div>
                <button
                  type="button"
                  onClick={() => { setHalfDay(!halfDay); setEndDate(''); setFormError(''); }}
                  className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer ${halfDay ? 'bg-[#1c2b3a]' : 'bg-gray-200'}`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${halfDay ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </button>
              </div>

              {halfDay && (
                <div className="grid grid-cols-2 gap-2">
                  {['morning', 'afternoon'].map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setHalfDayPeriod(p)}
                      className={`py-2 text-xs rounded-lg border transition-all cursor-pointer capitalize ${
                        halfDayPeriod === p ? 'border-[#1c2b3a] bg-slate-50 text-[#1c2b3a] font-medium' : 'border-gray-200 text-gray-600'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              )}

              {/* Dates */}
              <div className={`grid gap-3 ${halfDay ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'}`}>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-700">{halfDay ? 'Date' : 'Start Date'}</label>
                  <input
                    type="date"
                    value={startDate}
                    min={type === 'emergency' ? undefined : type === 'pto' ? addDays(today(), ADVANCE_DAYS) : today()}
                    onChange={(e) => { setStartDate(e.target.value); setFormError(''); }}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]"
                  />
                </div>
                {!halfDay && (
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-700">End Date</label>
                    <input
                      type="date"
                      value={endDate}
                      min={startDate || today()}
                      max={type === 'pto' && startDate ? addDays(startDate, MAX_CONSECUTIVE - 1) : undefined}
                      onChange={(e) => { setEndDate(e.target.value); setFormError(''); }}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]"
                    />
                  </div>
                )}
              </div>

              {/* Duration display */}
              {effectiveDays > 0 && (
                <p className="text-xs text-gray-400">
                  Duration: <strong className="text-gray-600">{effectiveDays === 0.5 ? 'Half day' : `${effectiveDays} day${effectiveDays !== 1 ? 's' : ''}`}</strong>
                  {(type === 'pto' || type === 'sick') && (
                    <span className="ml-1 text-gray-400">
                      · leaves {type === 'pto' ? ptoLeft - effectiveDays : sickLeft - effectiveDays} day{(type === 'pto' ? ptoLeft - effectiveDays : sickLeft - effectiveDays) !== 1 ? 's' : ''} remaining
                    </span>
                  )}
                </p>
              )}

              {/* Blackout warning when selected dates overlap */}
              {startDate && type !== 'emergency' && blackouts.some(b => startDate <= b.end_date && (halfDay ? startDate : endDate || startDate) >= b.start_date) && (
                <div className="flex items-start gap-2 p-3 bg-rose-50 border border-rose-100 rounded-lg">
                  <i className="ri-calendar-close-line text-rose-500 text-sm mt-0.5 flex-shrink-0"></i>
                  <p className="text-xs text-rose-600">Your selected dates fall within a blackout period. Please choose different dates.</p>
                </div>
              )}

              {advanceWarning && (
                <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-100 rounded-lg">
                  <i className="ri-calendar-line text-amber-500 text-sm mt-0.5 flex-shrink-0"></i>
                  <p className="text-xs text-amber-700">{advanceWarning}</p>
                </div>
              )}

              {/* Reason */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-700">
                  Reason <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={2}
                  placeholder="Brief description..."
                  maxLength={300}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a] resize-none"
                />
              </div>
            </div>

            <div className="flex gap-2 p-5 pt-0">
              <button onClick={() => setShowModal(false)}
                className="flex-1 py-2.5 text-sm border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 cursor-pointer whitespace-nowrap">
                Cancel
              </button>
              <button onClick={submit} disabled={saving}
                className="flex-1 py-2.5 text-sm bg-[#111827] text-white rounded-lg hover:bg-gray-800 disabled:opacity-40 cursor-pointer transition-colors whitespace-nowrap">
                {saving ? 'Submitting...' : 'Submit Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ContractorLayout>
  );
}
