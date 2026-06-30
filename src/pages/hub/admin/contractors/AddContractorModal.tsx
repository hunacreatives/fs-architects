import { useState, useEffect } from 'react';
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
  employment_classification: '',
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
  auto_payroll: false,
  skip_email: false,
};

export default function AddContractorModal({ onClose, onSuccess }: Props) {
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);

  useEffect(() => {
    supabase.rpc('preview_next_employee_id', { p_role: form.role })
      .then(({ data }) => setPreviewId(data ?? null));
  }, [form.role]);

  const set = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }));
  const currencySymbol = form.currency === 'USD' ? '$' : '₱';

  const toggleDay = (d: string) =>
    set('work_days', form.work_days.includes(d) ? form.work_days.filter(x => x !== d) : [...form.work_days, d]);

  const save = async () => {
    if (!form.full_name.trim() || !form.email.trim()) { setError('Name and email are required.'); return; }
    if (form.payment_type === 'hourly' && !form.hourly_rate) { setError('Hourly rate is required for hourly contractors.'); return; }
    if ((form.payment_type === 'fixed' || form.payment_type === 'fixed_flexible') && !form.monthly_rate && form.role === 'contractor') { setError('Monthly rate is required.'); return; }
    if (form.payment_type === 'project_based' && !form.project_percentage) { setError('Project percentage is required.'); return; }

    setSaving(true);
    setError('');

    const { data, error: fnErr } = await supabase.functions.invoke('invite-contractor', {
      body: {
        email: form.email.trim().toLowerCase(),
        full_name: form.full_name.trim(),
        role: form.role,
        department: form.department || null,
        employment_classification: form.employment_classification || null,
        start_date: form.start_date || null,
        payment_type: form.payment_type,
        hourly_rate: form.hourly_rate ? parseFloat(form.hourly_rate) : null,
        monthly_rate: form.monthly_rate ? parseFloat(form.monthly_rate) : null,
        project_percentage: form.project_percentage ? parseFloat(form.project_percentage) : null,
        currency: form.currency,
        shift_start: form.shift_start || null,
        shift_end: form.shift_end || null,
        work_days: form.work_days,
        slack_id: form.slack_id || null,
        auto_payroll: form.auto_payroll,
        skip_email: form.skip_email,
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
          <div className={`w-16 h-16 ${form.skip_email ? 'bg-blue-100' : 'bg-emerald-100'} rounded-full flex items-center justify-center mx-auto`}>
            <i className={`${form.skip_email ? 'ri-user-add-line text-blue-600' : 'ri-mail-send-line text-emerald-600'} text-2xl`}></i>
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 text-lg">{form.skip_email ? 'Employee added!' : 'Invite sent!'}</h3>
            <p className="text-sm text-gray-500 mt-1">
              <strong>{form.full_name}</strong>'s profile has been created.
              {form.skip_email
                ? ' No invite email was sent — you can share the hub link with them directly.'
                : <> An invite email has been sent to <strong>{form.email}</strong>.</>}
            </p>
            {!form.skip_email && <p className="text-xs text-gray-400 mt-2">They'll set their password when they click the link.</p>}
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
            <h2 className="font-semibold text-[#111827]">Add Team Member</h2>
            <p className="text-xs text-gray-400 mt-0.5">Create their profile and optionally send an invite email.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 cursor-pointer w-7 h-7 flex items-center justify-center">
            <i className="ri-close-line text-lg"></i>
          </button>
        </div>
        <div className="px-5 pt-4 flex gap-2">
          <button type="button" onClick={() => set('skip_email', false)}
            className={`flex-1 py-2 text-xs rounded-lg border transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${!form.skip_email ? 'bg-[#1c2b3a] text-white border-[#1c2b3a]' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            <i className="ri-mail-send-line"></i> Send Invite Email
          </button>
          <button type="button" onClick={() => set('skip_email', true)}
            className={`flex-1 py-2 text-xs rounded-lg border transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${form.skip_email ? 'bg-[#1c2b3a] text-white border-[#1c2b3a]' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            <i className="ri-user-add-line"></i> Add Manually
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
                    placeholder="e.g. Juan dela Cruz"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-700">Email *</label>
                  <input type="email" value={form.email} onChange={e => set('email', e.target.value)}
                    placeholder="their@email.com"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-700">Job Title</label>
                  <select value={form.department} onChange={e => set('department', e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none bg-white focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]">
                    <option value="">Select or type...</option>
                    <optgroup label="Architecture">
                      {['Junior Architect', 'Architect', 'Project Architect', 'Studio Head'].map(d => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </optgroup>
                    <optgroup label="Other">
                      {['Interior Design', 'Design & Drafting', 'Project Management', 'Construction Admin', 'Business Development', 'Admin', 'Management'].map(d => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </optgroup>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-700">Start Date</label>
                  <input type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]" />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-700">Employment Classification</label>
                <select value={form.employment_classification} onChange={e => set('employment_classification', e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none bg-white focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]">
                  <option value="">Select...</option>
                  {['Probationary', 'Regular', 'Project-Based', 'Apprentice', 'Intern'].map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-700">Access Role</label>
                  <select value={form.role} onChange={e => set('role', e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none bg-white">
                    <option value="contractor">Employee</option>
                    <option value="admin">HR / Admin</option>
                    <option value="owner">Owner</option>
                  </select>
                  {previewId && (
                    <p className="text-[11px] text-gray-400 mt-1">
                      Will be assigned <span className="font-mono font-semibold text-[#1c2b3a]">{previewId}</span>
                    </p>
                  )}
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-700">Slack ID</label>
                  <input value={form.slack_id} onChange={e => set('slack_id', e.target.value)}
                    placeholder="e.g. U09NUQFTZL6"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]" />
                </div>
              </div>
              {(form.role === 'admin' || form.role === 'hr') && (
                <button
                  type="button"
                  onClick={() => set('auto_payroll', !form.auto_payroll)}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-colors cursor-pointer ${form.auto_payroll ? 'bg-emerald-50 border-emerald-200' : 'bg-gray-50 border-gray-200 hover:bg-gray-100'}`}
                >
                  <div className="flex items-center gap-3">
                    <i className={`ri-money-dollar-circle-line text-base ${form.auto_payroll ? 'text-emerald-600' : 'text-gray-400'}`}></i>
                    <div className="text-left">
                      <p className={`text-xs font-semibold ${form.auto_payroll ? 'text-emerald-700' : 'text-gray-700'}`}>Auto-include in payroll</p>
                      <p className="text-[11px] text-gray-400">Payslip sent automatically when batch is approved</p>
                    </div>
                  </div>
                  <div className={`w-8 h-4 rounded-full transition-colors flex-shrink-0 ${form.auto_payroll ? 'bg-emerald-500' : 'bg-gray-300'}`}>
                    <div className={`w-3 h-3 bg-white rounded-full mt-0.5 transition-transform ${form.auto_payroll ? 'translate-x-4' : 'translate-x-0.5'}`} />
                  </div>
                </button>
              )}
            </div>
          </div>

          {/* Pay */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Compensation</p>
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-700">Payment Type</label>
                <div className="flex gap-2 flex-wrap">
                  {[
                    { value: 'hourly', label: 'Hourly' },
                    { value: 'fixed', label: 'Fixed Monthly' },
                    { value: 'fixed_flexible', label: 'Fixed Flexible' },
                    { value: 'project_based', label: 'Project Based' },
                  ].map(opt => (
                    <button key={opt.value} type="button"
                      onClick={() => set('payment_type', opt.value)}
                      className={`flex-1 py-2 text-xs rounded-lg border transition-colors cursor-pointer whitespace-nowrap ${form.payment_type === opt.value ? 'bg-[#111827] text-white border-[#111827]' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
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
                        className="w-full px-3 py-2 pr-8 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]" />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 font-medium">%</span>
                    </div>
                    <p className="text-[11px] text-gray-400">They earn this % of the project fee after operational costs are deducted.</p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1 col-span-2 sm:col-span-1">
                    <label className="text-xs font-medium text-gray-700">Currency</label>
                    <select value={form.currency} onChange={e => set('currency', e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none bg-white focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]">
                      {['PHP', 'USD', 'EUR', 'GBP', 'AUD', 'CAD'].map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  {(form.payment_type === 'fixed' || form.payment_type === 'fixed_flexible') && (
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-gray-700">Monthly Rate ({form.currency}) *</label>
                      <input type="number" value={form.monthly_rate} onChange={e => set('monthly_rate', e.target.value)}
                        placeholder={`${currencySymbol}0.00`}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]" />
                    </div>
                  )}
                  {(form.payment_type === 'hourly' || form.payment_type === 'fixed_flexible') && (
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-gray-700">Hourly Rate ({form.currency}) *</label>
                      <input type="number" value={form.hourly_rate} onChange={e => set('hourly_rate', e.target.value)}
                        placeholder={`${currencySymbol}0.00`}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]" />
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
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-700">Shift End</label>
                  <input type="time" value={form.shift_end} onChange={e => set('shift_end', e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]" />
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
            className="flex-1 py-2.5 text-sm bg-[#1c2b3a] text-white rounded-lg hover:bg-[#0f1c28] disabled:opacity-40 cursor-pointer transition-colors whitespace-nowrap flex items-center justify-center gap-2">
            {saving
              ? <><i className="ri-loader-4-line animate-spin text-sm"></i> {form.skip_email ? 'Adding…' : 'Sending invite…'}</>
              : form.skip_email
                ? <><i className="ri-user-add-line text-sm"></i> Add Employee</>
                : <><i className="ri-mail-send-line text-sm"></i> Create & Send Invite</>}
          </button>
        </div>
      </div>
    </div>
  );
}
