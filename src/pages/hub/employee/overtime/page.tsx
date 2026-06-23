import { useEffect, useState } from 'react';
import ContractorLayout from '@/pages/hub/components/ContractorLayout';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

const statusColors: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-rose-100 text-rose-700',
};
const statusLabels: Record<string, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
};

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
const gracePeriodMin = () => {
  const d = new Date();
  d.setDate(d.getDate() - 3);
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
};

export default function ContractorOvertimePage() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const [date, setDate] = useState('');
  const [hours, setHours] = useState('');
  const [reason, setReason] = useState('');

  const fetchAll = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from('hub_overtime_requests')
      .select('*')
      .eq('contractor_id', user.id)
      .eq('archived', false)
      .order('created_at', { ascending: false });
    setRequests(data ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, [user]);

  const openModal = () => {
    setDate('');
    setHours('');
    setReason('');
    setFormError('');
    setShowModal(true);
  };

  const submit = async () => {
    if (!date) { setFormError('Please select a date.'); return; }
    const h = parseFloat(hours);
    if (isNaN(h) || h <= 0) { setFormError('Please enter a valid number of hours.'); return; }
    if (h > 12) { setFormError('Maximum 12 overtime hours per request.'); return; }
    if (!user) return;
    setSaving(true);
    setFormError('');
    await supabase.from('hub_overtime_requests').insert({
      contractor_id: user.id,
      date,
      hours: h,
      reason: reason.trim() || null,
      status: 'pending',
    });
    setSaving(false);
    setShowModal(false);
    supabase.functions.invoke('notify-internal-request', {
      body: { type: 'overtime', contractor_name: user.full_name, detail: `${date} · ${h}hrs`, notes: reason.trim() || null },
    }).catch(console.error);
    fetchAll();
  };

  return (
    <ContractorLayout title="Overtime Requests">
      <div className="space-y-5">

        {/* Info card */}
        <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 space-y-1">
          <p className="text-xs font-semibold text-amber-700 flex items-center gap-1.5">
            <i className="ri-timer-flash-line"></i>Overtime Pre-Approval Required
          </p>
          <p className="text-xs text-amber-600">
            Submit overtime requests in advance or up to 3 days after the fact. Include the date, hours, and a reason — all requests require HR approval before they're counted in payroll.
          </p>
        </div>

        {/* Header */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-400">{requests.length} request{requests.length !== 1 ? 's' : ''}</p>
          <button onClick={openModal}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#111827] text-white text-sm rounded-lg hover:bg-gray-800 transition-colors cursor-pointer whitespace-nowrap">
            <i className="ri-add-line"></i> Request Overtime
          </button>
        </div>

        {/* List */}
        {loading ? (
          <div className="flex justify-center py-12"><i className="ri-loader-4-line animate-spin text-xl text-gray-400"></i></div>
        ) : requests.length === 0 ? (
          <div className="bg-white border border-gray-100 rounded-xl p-10 text-center">
            <i className="ri-timer-flash-line text-3xl text-gray-200 mb-2 block"></i>
            <p className="text-sm text-gray-400">No overtime requests yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {requests.map((r) => (
              <div key={r.id} className="bg-white border border-gray-100 rounded-xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[r.status] || 'bg-gray-100 text-gray-600'}`}>
                        {statusLabels[r.status] || r.status}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">
                        +{r.hours}h OT
                      </span>
                    </div>
                    <p className="text-sm font-medium text-[#111827]">
                      {new Date(r.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                    {r.reason && <p className="text-xs text-gray-400 mt-0.5">{r.reason}</p>}
                    {r.admin_notes && (
                      <div className="mt-2 bg-gray-50 rounded-lg px-3 py-2">
                        <p className="text-xs text-gray-500"><span className="font-medium">HR: </span>{r.admin_notes}</p>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 whitespace-nowrap flex-shrink-0">
                    {new Date(r.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="font-semibold text-[#111827]">Request Overtime</h2>
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-700">Date</label>
                  <input
                    type="date"
                    value={date}
                    min={gracePeriodMin()}
                    onChange={(e) => { setDate(e.target.value); setFormError(''); }}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-700">Hours</label>
                  <input
                    type="number"
                    value={hours}
                    min="0.5"
                    max="12"
                    step="0.5"
                    placeholder="e.g. 2"
                    onChange={(e) => { setHours(e.target.value); setFormError(''); }}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-700">
                  Reason <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={2}
                  placeholder="What work requires overtime?"
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
