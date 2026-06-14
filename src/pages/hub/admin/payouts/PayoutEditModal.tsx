import { useState, useEffect, FormEvent } from 'react';
import { supabase } from '@/lib/supabase';
import { HubPayout, HubUser } from '@/lib/types';

interface Props {
  payout: HubPayout | null;
  contractors: HubUser[];
  onClose: () => void;
  onSaved: () => void;
}

function calcFinal(fields: Partial<HubPayout>) {
  const base = (Number(fields.approved_hours) || 0) * (Number(fields.hourly_rate) || 0);
  return base
    + (Number(fields.bonus) || 0)
    + (Number(fields.incentives) || 0)
    + (Number(fields.reimbursements) || 0)
    - (Number(fields.deductions) || 0)
    - (Number(fields.advances) || 0)
    - (Number(fields.penalties) || 0);
}

export default function PayoutEditModal({ payout, contractors, onClose, onSaved }: Props) {
  const isNew = !payout;
  const [form, setForm] = useState({
    contractor_id: payout?.contractor_id || '',
    cutoff_start: payout?.cutoff_start || '',
    cutoff_end: payout?.cutoff_end || '',
    approved_hours: String(payout?.approved_hours ?? ''),
    hourly_rate: String(payout?.hourly_rate ?? ''),
    bonus: String(payout?.bonus ?? '0'),
    incentives: String(payout?.incentives ?? '0'),
    reimbursements: String(payout?.reimbursements ?? '0'),
    deductions: String(payout?.deductions ?? '0'),
    advances: String(payout?.advances ?? '0'),
    penalties: String(payout?.penalties ?? '0'),
    notes: payout?.notes || '',
    status: payout?.status || 'draft',
    payment_date: payout?.payment_date || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const preview = calcFinal(form as any);
  const basePay = (Number(form.approved_hours) || 0) * (Number(form.hourly_rate) || 0);

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  // If contractor changes, auto-fill hourly rate
  useEffect(() => {
    if (isNew && form.contractor_id) {
      const c = contractors.find(u => u.id === form.contractor_id);
      if (c?.hourly_rate) set('hourly_rate', String(c.hourly_rate));
    }
  }, [form.contractor_id]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    const payload = {
      contractor_id: form.contractor_id,
      cutoff_start: form.cutoff_start,
      cutoff_end: form.cutoff_end,
      approved_hours: Number(form.approved_hours),
      hourly_rate: Number(form.hourly_rate),
      base_pay: basePay,
      bonus: Number(form.bonus),
      incentives: Number(form.incentives),
      reimbursements: Number(form.reimbursements),
      deductions: Number(form.deductions),
      advances: Number(form.advances),
      penalties: Number(form.penalties),
      final_payout: preview,
      notes: form.notes || null,
      status: form.status,
      payment_date: form.payment_date || null,
      updated_at: new Date().toISOString(),
    };

    let err = null;
    if (isNew) {
      ({ error: err } = await supabase.from('hub_payouts').insert(payload));
    } else {
      ({ error: err } = await supabase.from('hub_payouts').update(payload).eq('id', payout!.id));
    }

    setSaving(false);
    if (err) { setError(err.message); return; }
    onSaved();
  };

  const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a] bg-white';

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">{isNew ? 'Add Payout Record' : 'Edit Payout'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 cursor-pointer w-6 h-6 flex items-center justify-center">
            <i className="ri-close-line text-lg"></i>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-5">
          {error && <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>}

          {/* Contractor + Period */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-1">
              <label className="block text-xs font-medium text-gray-600 mb-1">Employee *</label>
              <select className={inputCls} value={form.contractor_id} onChange={e => set('contractor_id', e.target.value)} required disabled={!isNew}>
                <option value="">Select...</option>
                {contractors.map(c => (
                  <option key={c.id} value={c.id}>{c.full_name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Cutoff Start *</label>
              <input type="date" className={inputCls} value={form.cutoff_start} onChange={e => set('cutoff_start', e.target.value)} required />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Cutoff End *</label>
              <input type="date" className={inputCls} value={form.cutoff_end} onChange={e => set('cutoff_end', e.target.value)} required />
            </div>
          </div>

          {/* Hours & Rate */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Approved Hours</label>
              <input type="number" step="0.01" min="0" className={inputCls} value={form.approved_hours} onChange={e => set('approved_hours', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Hourly Rate (PHP)</label>
              <input type="number" step="0.01" min="0" className={inputCls} value={form.hourly_rate} onChange={e => set('hourly_rate', e.target.value)} />
            </div>
          </div>

          {/* Preview base pay */}
          <div className="bg-gray-50 rounded-lg px-4 py-3 text-sm text-gray-600">
            Base Pay: <span className="font-semibold text-gray-900">{basePay.toLocaleString('en-PH', { style: 'currency', currency: 'PHP' })}</span>
            <span className="text-gray-400 ml-1">({form.approved_hours || 0} hrs × ₱{form.hourly_rate || 0}/hr)</span>
          </div>

          {/* Additions */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Additions</p>
            <div className="grid grid-cols-3 gap-3">
              {[
                { key: 'bonus', label: 'Bonus' },
                { key: 'incentives', label: 'Incentives' },
                { key: 'reimbursements', label: 'Reimbursements' },
              ].map(f => (
                <div key={f.key}>
                  <label className="block text-xs text-gray-500 mb-1">{f.label}</label>
                  <input type="number" step="0.01" min="0" className={inputCls} value={(form as any)[f.key]} onChange={e => set(f.key, e.target.value)} />
                </div>
              ))}
            </div>
          </div>

          {/* Deductions */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Deductions</p>
            <div className="grid grid-cols-3 gap-3">
              {[
                { key: 'deductions', label: 'Deductions' },
                { key: 'advances', label: 'Advances' },
                { key: 'penalties', label: 'Penalties' },
              ].map(f => (
                <div key={f.key}>
                  <label className="block text-xs text-gray-500 mb-1">{f.label}</label>
                  <input type="number" step="0.01" min="0" className={inputCls} value={(form as any)[f.key]} onChange={e => set(f.key, e.target.value)} />
                </div>
              ))}
            </div>
          </div>

          {/* Final Preview */}
          <div className="bg-[#1c2b3a]/5 border border-[#1c2b3a]/20 rounded-lg px-4 py-3 flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">Final Payout</span>
            <span className="text-xl font-bold text-[#1c2b3a]">
              {preview.toLocaleString('en-PH', { style: 'currency', currency: 'PHP' })}
            </span>
          </div>

          {/* Status + Date + Notes */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
              <select className={inputCls} value={form.status} onChange={e => set('status', e.target.value)}>
                <option value="draft">Draft</option>
                <option value="reviewed">Reviewed</option>
                <option value="approved">Approved</option>
                <option value="paid">Paid</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Payment Date</label>
              <input type="date" className={inputCls} value={form.payment_date} onChange={e => set('payment_date', e.target.value)} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
            <textarea className={`${inputCls} resize-none`} rows={3} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Optional notes..." maxLength={500} />
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 border border-gray-200 text-gray-600 rounded-lg py-2 text-sm hover:bg-gray-50 transition-colors cursor-pointer whitespace-nowrap">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="flex-1 bg-[#1c2b3a] text-white rounded-lg py-2 text-sm font-medium hover:bg-[#e55a24] transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50">
              {saving ? 'Saving…' : isNew ? 'Add Payout' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}