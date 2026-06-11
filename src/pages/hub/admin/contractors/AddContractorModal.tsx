import { useState } from 'react';
import { supabase } from '@/lib/supabase';

interface Props {
  onClose: () => void;
  onSuccess: () => void;
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const emptyForm = {
  full_name: '',
  email: '',
  role: 'contractor' as 'contractor' | 'admin',
  department: '',
  start_date: new Date().toISOString().slice(0, 10),
  payment_type: 'fixed' as 'fixed' | 'hourly' | 'fixed_flexible' | 'project_based',
  monthly_rate: '',
  hourly_rate: '',
  project_percentage: '',
  currency: 'PHP',
  shift_start: '',
  shift_end: '',
  work_days: [] as string[],
  slack_id: '',
};

export default function AddContractorModal({ onClose, onSuccess }: Props) {
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const set = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }));

  const toggleDay = (d: string) =>
    set('work_days', form.work_days.includes(d) ? form.work_days.filter(x => x !== d) : [...form.work_days, d]);

  const save = async () => {
    if (!form.full_name.trim() || !form.email.trim()) { setError('Name and email are required.'); return; }
    if (form.payment_type === 'hourly' && !form.hourly_rate) { setError('Hourly rate is required for hourly contractors.'); return; }
    if ((form.payment_type === 'fixed' || form.payment_type === 'fixed_flexible') && !form.monthly_rate) { setError('Monthly rate is required.'); return; }
    if (form.payment_type === 'project_based' && !form.project_percentage) { setError('Project percentage is required.'); return; }

    setSaving(true);
    setError('');

    const { data, error: fnErr } = await supabase.functions.invoke('invite-contractor', {
      body: {
        email: form.email.trim().toLowerCase(),
        full_name: form.full_name.trim(),
        role: form.role,
        department: form.department || null,
        start_date: form.start_date || null,
        payment_type: form.payment_type,
        hourly_rate: form.hourly_rate ? parseFloat(form.hourly_rate) : null,
        monthly_rate: form.monthly_rate ? parseFloat(form.monthly_rate) : null,
        project_percentage: form.project_percentage ? parseFloat(form.project_percentage) : null,
        currency: form.currency,
        shift_start: form.shift_start || null,
        shift_end: form.shift_end || null,
        work_days: form.work_days,
        slack_id: null,
      },
    });

    setSaving(false);

    if (fnErr || data?.error) {
      setError(data?.error ?? fnErr?.message ?? 'Something went wrong.');
      return;
    }

    setDone(true);
    onSuccess();
  };

  if (done) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div className="bg-white rounded-2xl w-full max-w-md p-8 text-center space-y-4">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
            <i className="ri-mail-send-line text-emerald-600 text-2xl"></i>
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 text-lg">Invite sent!</h3>
            <p className="text-sm text-gray-500 mt-1">
              <strong>{form.full_name}</strong>'s profile has been created and an invite email has been sent to <strong>{form.email}</strong>.
            </p>
            <p className="text-xs text-gray-400 mt-2">They'll set their password when they click the link.</p>
          </div>
          <button onClick={onClose} className="w-full py-2.5 bg-[#111827] text-white rounded-lg text-sm font-medium cursor-pointer hover:bg-gray-800">
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div>
            <h2 className="font-semibold text-[#111827]">Add Member</h2>
            <p className="text-xs text-gray-400 mt-0.5">Create their profile — they'll get an invite email to set their password.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 cursor-pointer w-7 h-7 flex items-center justify-center">
            <i className="ri-close-line text-lg"></i>
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Basic info */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Basic Info</p>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-700">Full Name *</label>
                  <input value={form.full_name} onChange={e => set('full_name', e.target.value)}
                    placeholder="Full name"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/30 focus:border-[#FF6B35]" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-700">Email *</label>
                  <input type="email" value={form.email} onChange={e => set('email', e.target.value)}
                    placeholder="their@email.com"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/30 focus:border-[#FF6B35]" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-700">Position / Role Title</label>
                  <input value={form.department} onChange={e => set('department', e.target.value)}
                    placeholder="e.g. Architect, Draftsman"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/30 focus:border-[#FF6B35]" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-700">Start Date</label>
                  <input type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/30 focus:border-[#FF6B35]" />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-700">Access Role</label>
                  <select value={form.role} onChange={e => set('role', e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none bg-white">
                    <option value="contractor">Employee</option>
                    <option value="admin">HR / Admin</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Pay */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Compensation</p>
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-700">Payment Type</label>
                <div className="flex gap-2">
                  {[
                    { value: 'fixed', label: 'Fixed Monthly' },
                    { value: 'project_based', label: 'Project Based' },
                  ].map(opt => (
                    <button key={opt.value} type="button"
                      onClick={() => set('payment_type', opt.value)}
                      className={`flex-1 py-2 text-xs rounded-lg border transition-colors cursor-pointer ${form.payment_type === opt.value ? 'bg-[#111827] text-white border-[#111827]' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              {form.payment_type === 'project_based' ? (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-700">Their Cut (% of project) *</label>
                    <div className="relative">
                      <input type="number" value={form.project_percentage} onChange={e => set('project_percentage', e.target.value)}
                        placeholder="e.g. 40" min="1" max="100" step="0.5"
                        className="w-full px-3 py-2 pr-8 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/30 focus:border-[#FF6B35]" />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 font-medium">%</span>
                    </div>
                    <p className="text-[11px] text-gray-400">They earn this % of the project fee after operational costs are deducted.</p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {(form.payment_type === 'fixed' || form.payment_type === 'fixed_flexible') && (
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-gray-700">Monthly Rate (PHP) *</label>
                      <input type="number" value={form.monthly_rate} onChange={e => set('monthly_rate', e.target.value)}
                        placeholder="0.00"
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/30 focus:border-[#FF6B35]" />
                    </div>
                  )}
                  {(form.payment_type === 'hourly' || form.payment_type === 'fixed_flexible') && (
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-gray-700">Hourly Rate (PHP) *</label>
                      <input type="number" value={form.hourly_rate} onChange={e => set('hourly_rate', e.target.value)}
                        placeholder="0.00"
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/30 focus:border-[#FF6B35]" />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Schedule */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Schedule <span className="text-gray-300 font-normal normal-case">(optional)</span></p>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-700">Shift Start</label>
                  <input type="time" value={form.shift_start} onChange={e => set('shift_start', e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/30 focus:border-[#FF6B35]" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-700">Shift End</label>
                  <input type="time" value={form.shift_end} onChange={e => set('shift_end', e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/30 focus:border-[#FF6B35]" />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-700">Work Days</label>
                <div className="flex gap-2 flex-wrap">
                  {DAYS.map(d => (
                    <button key={d} type="button" onClick={() => toggleDay(d)}
                      className={`px-3 py-1.5 text-xs rounded-lg border transition-colors cursor-pointer ${form.work_days.includes(d) ? 'bg-[#111827] text-white border-[#111827]' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                      {d}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-lg">
              <i className="ri-error-warning-line text-red-500 text-sm flex-shrink-0"></i>
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}
        </div>

        <div className="flex gap-2 p-5 pt-0">
          <button onClick={onClose} className="flex-1 py-2.5 text-sm border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 cursor-pointer whitespace-nowrap">
            Cancel
          </button>
          <button onClick={save} disabled={saving || !form.full_name.trim() || !form.email.trim()}
            className="flex-1 py-2.5 text-sm bg-[#FF6B35] text-white rounded-lg hover:bg-[#e55a27] disabled:opacity-40 cursor-pointer transition-colors whitespace-nowrap flex items-center justify-center gap-2">
            {saving ? <><i className="ri-loader-4-line animate-spin text-sm"></i> Sending invite…</> : <><i className="ri-mail-send-line text-sm"></i> Create & Send Invite</>}
          </button>
        </div>
      </div>
    </div>
  );
}
