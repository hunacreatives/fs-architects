import { useState, useEffect, FormEvent } from 'react';
import { supabase } from '@/lib/supabase';

interface Props {
  userId: string;
  date: string;
  fullName: string;
  currentHours: number | null;
  onClose: () => void;
  onSuccess: () => void;
}

const REASONS = [
  'Paid Holiday',
  'Make-up Hours',
  'Manual Correction',
  'System Error Fix',
  'Other',
];

export default function EditHoursModal({ userId, date, fullName, currentHours, onClose, onSuccess }: Props) {
  const [hours, setHours] = useState(currentHours != null ? String(currentHours) : '');
  const [reason, setReason] = useState('Paid Holiday');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [reverting, setReverting] = useState(false);
  const [error, setError] = useState('');
  const [existingRecord, setExistingRecord] = useState<{
    is_manual: boolean;
    override_reason: string | null;
    original_hours_raw: number | null;
    original_hours_capped: number | null;
  } | null>(null);

  const displayDate = new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });

  useEffect(() => {
    supabase
      .from('hub_daily_hours')
      .select('is_manual, override_reason, original_hours_raw, original_hours_capped, hours_raw, hours_capped')
      .eq('user_id', userId)
      .eq('date', date)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setExistingRecord(data as any);
      });
  }, [userId, date]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const h = parseFloat(hours);
    if (isNaN(h) || h < 0 || h > 24) {
      setError('Enter a valid number of hours (0–24).');
      return;
    }
    setLoading(true);
    setError('');

    const overrideReason = reason === 'Other' && notes.trim()
      ? notes.trim()
      : reason + (notes.trim() ? ` — ${notes.trim()}` : '');

    // Only save originals if this is the FIRST manual edit (not overwriting a previous manual edit)
    const saveOriginals = existingRecord && !existingRecord.is_manual;

    const { error: err } = await supabase
      .from('hub_daily_hours')
      .upsert(
        {
          user_id: userId,
          date,
          hours_raw: h,
          hours_capped: h,
          is_manual: true,
          override_reason: overrideReason,
          updated_at: new Date().toISOString(),
          ...(saveOriginals ? {
            original_hours_raw: (existingRecord as any).hours_raw,
            original_hours_capped: (existingRecord as any).hours_capped,
          } : {}),
        },
        { onConflict: 'user_id,date' }
      );

    setLoading(false);
    if (err) { setError(err.message); return; }
    onSuccess();
  };

  const handleRevert = async () => {
    if (!existingRecord?.is_manual) return;
    setReverting(true);
    setError('');

    const { error: err } = await supabase
      .from('hub_daily_hours')
      .update({
        hours_raw: existingRecord.original_hours_raw,
        hours_capped: existingRecord.original_hours_capped,
        is_manual: false,
        override_reason: null,
        original_hours_raw: null,
        original_hours_capped: null,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('date', date);

    setReverting(false);
    if (err) { setError(err.message); return; }
    onSuccess();
  };

  const isManual = existingRecord?.is_manual;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-[#111827] text-sm">Edit Hours</h2>
              {isManual && (
                <span className="text-[10px] px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full font-medium">
                  Manual override active
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-0.5">{fullName} · {displayDate}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 cursor-pointer">
            <i className="ri-close-line text-lg"></i>
          </button>
        </div>

        {isManual && existingRecord?.override_reason && (
          <div className="px-5 pt-4">
            <div className="bg-amber-50 border border-amber-100 rounded-lg px-3 py-2.5 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-amber-700">Previously overridden</p>
                <p className="text-xs text-amber-600 mt-0.5">{existingRecord.override_reason}</p>
                {existingRecord.original_hours_raw != null && (
                  <p className="text-xs text-amber-500 mt-1">
                    Original: {Number(existingRecord.original_hours_raw).toFixed(2)}h
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={handleRevert}
                disabled={reverting}
                className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-amber-700 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors cursor-pointer disabled:opacity-50"
              >
                {reverting
                  ? <><i className="ri-loader-4-line animate-spin"></i> Reverting…</>
                  : <><i className="ri-arrow-go-back-line"></i> Undo Override</>
                }
              </button>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-700">Hours to apply *</label>
            <div className="relative">
              <input
                required
                type="number"
                step="0.25"
                min="0"
                max="24"
                value={hours}
                onChange={e => setHours(e.target.value)}
                placeholder="e.g. 8"
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/30 focus:border-[#FF6B35] pr-10"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">hrs</span>
            </div>
            {currentHours != null && (
              <p className="text-xs text-gray-400">Current: {currentHours.toFixed(2)}h</p>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-700">Reason *</label>
            <select
              value={reason}
              onChange={e => setReason(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/30 focus:border-[#FF6B35] bg-white"
            >
              {REASONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-700">Notes {reason !== 'Other' ? '(optional)' : '*'}</label>
            <input
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder={reason === 'Paid Holiday' ? 'e.g. Cebu Day holiday' : 'Add details...'}
              required={reason === 'Other'}
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/30 focus:border-[#FF6B35]"
            />
          </div>

          <div className="bg-gray-50 border border-gray-100 rounded-lg px-3 py-2.5 flex gap-2 text-xs text-gray-500">
            <i className="ri-information-line flex-shrink-0 mt-0.5"></i>
            <span>This will override the logged hours for this day and count toward payroll.</span>
          </div>

          {error && (
            <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
          )}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 text-sm border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 cursor-pointer">
              Cancel
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 py-2.5 text-sm bg-[#FF6B35] text-white rounded-lg hover:bg-[#e55a27] disabled:opacity-60 cursor-pointer">
              {loading ? 'Saving…' : 'Save & Apply'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
