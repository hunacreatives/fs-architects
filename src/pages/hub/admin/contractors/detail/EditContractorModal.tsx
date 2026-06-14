import { useState, FormEvent } from 'react';
import { supabase } from '@/lib/supabase';
import { HubUser } from '@/lib/types';

interface Props {
  contractor: HubUser;
  onClose: () => void;
  onSuccess: () => void;
}

export default function EditContractorModal({ contractor, onClose, onSuccess }: Props) {
  const [form, setForm] = useState({
    full_name: contractor.full_name,
    email: contractor.email,
    phone: contractor.phone || '',
    address: contractor.address || '',
    emergency_contact_name: (contractor as any).emergency_contact_name || '',
    emergency_contact_relationship: (contractor as any).emergency_contact_relationship || '',
    emergency_contact_phone: (contractor as any).emergency_contact_phone || '',
    slack_username: contractor.slack_username || '',
    department: contractor.department || '',
    employment_classification: (contractor as any).employment_classification || '',
    role: contractor.role || 'contractor',
    start_date: contractor.start_date || '',
    birthday: (contractor as any).birthday || '',
    status: contractor.status,
    payment_type: (contractor as any).payment_type || 'hourly',
    hourly_rate: contractor.hourly_rate?.toString() || '',
    monthly_rate: (contractor as any).monthly_rate?.toString() || '',
    project_percentage: (contractor as any).project_percentage?.toString() || '',
    currency: contractor.currency || 'PHP',
    payment_method: contractor.payment_method || '',
    bank_name: contractor.bank_name || '',
    bank_account_name: contractor.bank_account_name || '',
    bank_account_number: contractor.bank_account_number || '',
    bank_account_type: contractor.bank_account_type || '',
    notes: contractor.notes || '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const currencySymbol = form.currency === 'USD' ? '$' : form.currency === 'EUR' ? 'EUR ' : form.currency === 'GBP' ? 'GBP ' : form.currency === 'AUD' ? 'AUD ' : form.currency === 'CAD' ? 'CAD ' : '₱';

  const set = (key: string, val: string) => setForm((p) => ({ ...p, [key]: val }));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error: err } = await supabase.from('hub_users').update({
      ...form,
      hourly_rate: form.hourly_rate ? parseFloat(form.hourly_rate) : null,
      monthly_rate: form.monthly_rate ? parseFloat(form.monthly_rate) : null,
      project_percentage: form.project_percentage ? parseFloat(form.project_percentage) : null,
      updated_at: new Date().toISOString(),
    }).eq('id', contractor.id);
    setLoading(false);
    if (err) { setError(err.message); return; }
    onSuccess();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="font-semibold text-[#111827]">Edit Employee</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 cursor-pointer">
            <i className="ri-close-line text-lg"></i>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Full Name *', key: 'full_name', required: true, colSpan: '2' },
              { label: 'Email *', key: 'email', required: true, type: 'email', colSpan: '2' },
              { label: 'Phone', key: 'phone' },
              { label: 'Slack Username', key: 'slack_username' },
              { label: 'Address', key: 'address', colSpan: '2' },
              { label: 'Emergency Contact Name', key: 'emergency_contact_name', colSpan: '2' },
              { label: 'Relationship', key: 'emergency_contact_relationship', colSpan: '2' },
              { label: 'Emergency Contact Number', key: 'emergency_contact_phone', colSpan: '2' },
              { label: 'Start Date', key: 'start_date', type: 'date' },
              { label: 'Birthday', key: 'birthday', type: 'date' },
            ].map((f) => (
              <div key={f.key} className={`space-y-1 ${f.colSpan === '2' ? 'col-span-2' : ''}`}>
                <label className="text-xs font-medium text-gray-700">{f.label}</label>
                <input
                  type={f.type || 'text'}
                  required={f.required}
                  value={(form as Record<string, string>)[f.key]}
                  onChange={(e) => set(f.key, e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]"
                />
              </div>
            ))}

            {/* Payment type + rate */}
            <div className="col-span-2 pt-1">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Compensation</p>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1 col-span-2 sm:col-span-1">
                    <label className="text-xs font-medium text-gray-700">Payment Type</label>
                    <select value={form.payment_type} onChange={(e) => set('payment_type', e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a] bg-white">
                      <option value="hourly">Hourly</option>
                      <option value="fixed">Fixed Monthly</option>
                      <option value="fixed_flexible">Fixed Flexible</option>
                      <option value="project_based">Project Based</option>
                    </select>
                  </div>
                  <div className="space-y-1 col-span-2 sm:col-span-1">
                    <label className="text-xs font-medium text-gray-700">Currency</label>
                    <select value={form.currency} onChange={(e) => set('currency', e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a] bg-white">
                      {['PHP', 'USD', 'EUR', 'GBP', 'AUD', 'CAD'].map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                </div>
                {form.payment_type === 'project_based' ? (
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-700">Their Cut (% of project) *</label>
                    <div className="relative">
                      <input type="number" step="0.5" min="1" max="100"
                        value={form.project_percentage} onChange={(e) => set('project_percentage', e.target.value)}
                        placeholder="e.g. 40"
                        className="w-full px-3 py-2 pr-8 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]" />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 font-medium">%</span>
                    </div>
                    <p className="text-[11px] text-gray-400">They earn this % of the project fee after operational costs are deducted.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {(form.payment_type === 'fixed' || form.payment_type === 'fixed_flexible') && (
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-gray-700">Monthly Rate ({form.currency})</label>
                        <input type="number" step="0.01" value={form.monthly_rate} onChange={(e) => set('monthly_rate', e.target.value)}
                          placeholder={`e.g. ${currencySymbol}20000`}
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]" />
                      </div>
                    )}
                    {(form.payment_type === 'hourly' || form.payment_type === 'fixed_flexible') && (
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-gray-700">Hourly Rate ({form.currency})</label>
                        <input type="number" step="0.01" value={form.hourly_rate} onChange={(e) => set('hourly_rate', e.target.value)}
                          placeholder={`e.g. ${currencySymbol}5.00`}
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]" />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-700">Job Title / Department</label>
              <select value={form.department} onChange={(e) => set('department', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a] bg-white">
                <option value="">Select...</option>
                <optgroup label="Architecture Career Levels">
                  {['Junior Architect', 'Architect', 'Project Architect', 'Studio Head'].map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </optgroup>
                <optgroup label="Departments">
                  {['Architecture', 'Interior Design', 'Design & Drafting', 'Project Management', 'Construction Admin', 'Business Development', 'Admin', 'Management'].map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </optgroup>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-700">Employment Classification</label>
              <select value={form.employment_classification} onChange={(e) => set('employment_classification', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a] bg-white">
                <option value="">Select...</option>
                {['Probationary', 'Regular', 'Project-Based', 'Apprentice/Intern'].map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-700">Role</label>
              <select value={form.role} onChange={(e) => set('role', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a] bg-white">
                <option value="contractor">Employee</option>
                <option value="admin">Admin</option>
                <option value="owner">Owner</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-700">Status</label>
              <select value={form.status} onChange={(e) => set('status', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a] bg-white">
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-700">Payment Method</label>
              <select value={form.payment_method} onChange={(e) => set('payment_method', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a] bg-white">
                <option value="">Select...</option>
                {['PayPal', 'Wise', 'GCash', 'Bank Transfer', 'Other'].map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>

            {/* Bank Account Details */}
            <div className="col-span-2 pt-1">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Bank Account Details</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-700">Bank Name</label>
                  <input value={form.bank_name} onChange={(e) => set('bank_name', e.target.value)}
                    placeholder="e.g. BDO, BPI, Metrobank"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-700">Account Type</label>
                  <select value={form.bank_account_type} onChange={(e) => set('bank_account_type', e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a] bg-white">
                    <option value="">Select...</option>
                    {['Savings', 'Checking', 'Payroll', 'Current'].map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-2 space-y-1">
                  <label className="text-xs font-medium text-gray-700">Account Name</label>
                  <input value={form.bank_account_name} onChange={(e) => set('bank_account_name', e.target.value)}
                    placeholder="Name on bank account"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]" />
                </div>
                <div className="col-span-2 space-y-1">
                  <label className="text-xs font-medium text-gray-700">Account Number</label>
                  <input value={form.bank_account_number} onChange={(e) => set('bank_account_number', e.target.value)}
                    placeholder="Account number"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]" />
                </div>
              </div>
            </div>

            <div className="col-span-2 space-y-1">
              <label className="text-xs font-medium text-gray-700">Notes</label>
              <textarea value={form.notes} onChange={(e) => set('notes', e.target.value)}
                rows={3}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a] resize-none"
              />
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 rounded-lg">
              <i className="ri-error-warning-line text-red-500 text-sm"></i>
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 text-sm border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 cursor-pointer whitespace-nowrap">
              Cancel
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 py-2.5 text-sm bg-[#1c2b3a] text-white rounded-lg hover:bg-[#0f1c28] disabled:opacity-60 cursor-pointer whitespace-nowrap">
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
