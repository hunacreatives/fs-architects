import { useState, FormEvent } from 'react';
import { supabase } from '@/lib/supabase';
import { HubAttendance, HubUser } from '@/lib/types';

interface Props {
  record: HubAttendance | null;
  contractors: HubUser[];
  onClose: () => void;
  onSuccess: () => void;
}

export default function AttendanceEditModal({ record, contractors, onClose, onSuccess }: Props) {
  const [form, setForm] = useState({
    contractor_id: record?.contractor_id || '',
    date: record?.date || new Date().toISOString().split('T')[0],
    on_time: record?.on_time || '',
    off_time: record?.off_time || '',
    notes: record?.notes || '',
    status: record?.status || 'complete',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const set = (key: string, val: string) => setForm((p) => ({ ...p, [key]: val }));

  const calcHours = (on: string, off: string): number | null => {
    if (!on || !off) return null;
    const [oh, om] = on.split(':').map(Number);
    const [fh, fm] = off.split(':').map(Number);
    const diff = (fh * 60 + fm - oh * 60 - om) / 60;
    return diff > 0 ? Math.round(diff * 100) / 100 : null;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const total_hours = calcHours(form.on_time, form.off_time);
    const payload = { ...form, total_hours, updated_at: new Date().toISOString(), status: 'manual' as const };
    const { error: err } = record
      ? await supabase.from('hub_attendance').update(payload).eq('id', record.id)
      : await supabase.from('hub_attendance').insert(payload);
    setLoading(false);
    if (err) { setError(err.message); return; }
    onSuccess();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="font-semibold text-[#111827]">{record ? 'Edit Attendance' : 'Add Attendance Entry'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 cursor-pointer">
            <i className="ri-close-line text-lg"></i>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {!record && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-700">Employee *</label>
              <select required value={form.contractor_id} onChange={(e) => set('contractor_id', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a] bg-white">
                <option value="">Select employee...</option>
                {contractors.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
              </select>
            </div>
          )}
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-700">Date *</label>
            <input required type="date" value={form.date} onChange={(e) => set('date', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-700">On Time</label>
              <input type="time" value={form.on_time} onChange={(e) => set('on_time', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-700">Off Time</label>
              <input type="time" value={form.off_time} onChange={(e) => set('off_time', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]" />
            </div>
          </div>
          {form.on_time && form.off_time && (
            <p className="text-xs text-emerald-600 bg-emerald-50 px-3 py-2 rounded-lg">
              Calculated: <strong>{calcHours(form.on_time, form.off_time)}h</strong> total
            </p>
          )}
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-700">Notes</label>
            <input value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Manual adjustment reason..."
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]" />
          </div>
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 rounded-lg">
              <i className="ri-error-warning-line text-red-500 text-sm"></i>
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 text-sm border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 cursor-pointer whitespace-nowrap">Cancel</button>
            <button type="submit" disabled={loading} className="flex-1 py-2.5 text-sm bg-[#1c2b3a] text-white rounded-lg hover:bg-[#0f1c28] disabled:opacity-60 cursor-pointer whitespace-nowrap">
              {loading ? 'Saving...' : 'Save Entry'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}