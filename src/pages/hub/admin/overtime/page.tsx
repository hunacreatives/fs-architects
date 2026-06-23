import { useEffect, useState } from 'react';
import AdminLayout from '@/pages/hub/components/AdminLayout';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useDemo } from '@/contexts/DemoContext';
import { DEMO_OVERTIME } from '@/lib/demoData';

const statusColors: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-rose-100 text-rose-700',
};
const statusLabels: Record<string, string> = {
  pending: 'Pending', approved: 'Approved', rejected: 'Rejected',
};

export default function AdminOvertimePage() {
  const { hubUser } = useAuth();
  const { isDemo } = useDemo();
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [selected, setSelected] = useState<any | null>(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [updating, setUpdating] = useState(false);
  const [restDay, setRestDay] = useState(false);
  const [slackHours, setSlackHours] = useState<number | null>(null);

  const fetchRequests = async () => {
    setLoading(true);
    let q = supabase
      .from('hub_overtime_requests')
      .select('*, hub_users!contractor_id(full_name, avatar_url, department)')
      .eq('archived', false)
      .order('created_at', { ascending: false });
    if (statusFilter !== 'all') q = q.eq('status', statusFilter);
    const { data } = await q;
    setRequests(data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    if (isDemo) {
      const filtered = statusFilter === 'all' ? DEMO_OVERTIME : DEMO_OVERTIME.filter(r => r.status === statusFilter);
      setRequests(filtered);
      setLoading(false);
      return;
    }
    fetchRequests();
  }, [isDemo, statusFilter]);

  const openReview = async (r: any) => {
    setSelected(r);
    setAdminNotes('');
    setRestDay(r.is_rest_day ?? (new Date(r.date + 'T12:00:00').getDay() % 6 === 0));
    setSlackHours(null);
    const { data: dayRow } = await supabase
      .from('hub_daily_hours')
      .select('hours_raw')
      .eq('user_id', r.contractor_id)
      .eq('date', r.date)
      .maybeSingle();
    setSlackHours(dayRow?.hours_raw ?? 0);
  };

  const decide = async (status: 'approved' | 'rejected') => {
    if (!selected || !hubUser) return;
    setUpdating(true);

    await supabase.from('hub_overtime_requests').update({
      status,
      is_rest_day: restDay,
      reviewed_by: hubUser.id,
      admin_notes: adminNotes || null,
      updated_at: new Date().toISOString(),
    }).eq('id', selected.id);

    // On approval, credit the full approved OT hours for that date directly into
    // hub_daily_hours. HR approval is the source of truth here — it doesn't depend
    // on Slack-logged raw hours, since Slack attendance tracking can be flaky or
    // missing entirely (the request flow already required a reason/justification).
    if (status === 'approved') {
      const { data: approvedForDate } = await supabase
        .from('hub_overtime_requests')
        .select('hours')
        .eq('contractor_id', selected.contractor_id)
        .eq('date', selected.date)
        .eq('status', 'approved')
        .neq('id', selected.id);

      const totalApproved = (approvedForDate ?? []).reduce((s: number, r: any) => s + (r.hours || 0), 0) + (selected.hours || 0);

      await supabase.from('hub_daily_hours').upsert({
        user_id: selected.contractor_id,
        date: selected.date,
        overtime_hours: totalApproved,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,date' });
    }

    supabase.functions.invoke('notify-contractor', {
      body: { type: 'overtime_decision', contractor_id: selected.contractor_id, date: selected.date, hours: selected.hours, status, admin_notes: adminNotes || undefined },
    }).catch(console.error);

    setUpdating(false);
    setSelected(null);
    fetchRequests();
  };

  const filterTabs = ['pending', 'approved', 'rejected', 'all'];

  return (
    <AdminLayout title="Overtime Requests">
      <div className="space-y-4">

        {/* Filters */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
            {filterTabs.map((s) => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap capitalize ${
                  statusFilter === s ? 'bg-white text-[#111827] shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}>
                {s === 'all' ? 'All' : statusLabels[s]}
              </button>
            ))}
          </div>
          <span className="text-xs text-gray-400">{requests.length} request{requests.length !== 1 ? 's' : ''}</span>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><i className="ri-loader-4-line animate-spin text-xl text-gray-400"></i></div>
        ) : requests.length === 0 ? (
          <div className="bg-white border border-gray-100 rounded-xl p-10 text-center">
            <i className="ri-timer-flash-line text-3xl text-gray-200 mb-2 block"></i>
            <p className="text-sm text-gray-400">No {statusFilter !== 'all' ? statusFilter : ''} overtime requests</p>
          </div>
        ) : (
          <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {['Employee', 'Date', 'Hours', 'Reason', 'Status', 'Filed', ''].map(h => (
                    <th key={h} className="text-left text-xs font-medium text-gray-400 px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {requests.map((r) => {
                  const u = r.hub_users;
                  return (
                    <tr key={r.id} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-[#1c2b3a]/10 flex items-center justify-center flex-shrink-0">
                            <span className="text-[#1c2b3a] text-xs font-bold">{u?.full_name?.charAt(0) || '?'}</span>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-[#111827]">{u?.full_name}</p>
                            {u?.department && <p className="text-xs text-gray-400">{u.department}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-sm text-gray-600 whitespace-nowrap">
                        {new Date(r.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="text-sm font-semibold text-purple-600">+{r.hours}h</span>
                      </td>
                      <td className="px-4 py-3.5 text-xs text-gray-500 max-w-[200px] truncate">
                        {r.reason || <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[r.status]}`}>
                          {statusLabels[r.status] || r.status}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-xs text-gray-400 whitespace-nowrap">
                        {new Date(r.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3.5">
                        <button onClick={() => openReview(r)}
                          className="text-xs text-gray-500 hover:text-[#1c2b3a] cursor-pointer transition-colors font-medium whitespace-nowrap">
                          {r.status === 'pending' ? 'Review' : 'View'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </div>
        )}
      </div>

      {/* Review modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div>
                <h2 className="font-semibold text-[#111827]">{selected.hub_users?.full_name}</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  +{selected.hours}h OT · {new Date(selected.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                </p>
              </div>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 cursor-pointer w-7 h-7 flex items-center justify-center">
                <i className="ri-close-line text-lg"></i>
              </button>
            </div>
            <div className="p-5 space-y-4">
              {selected.reason && (
                <div>
                  <p className="text-xs font-medium text-gray-700 mb-1">Reason</p>
                  <p className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3">{selected.reason}</p>
                </div>
              )}
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-gray-700">Slack logged that day</span>
                {slackHours === null ? (
                  <span className="text-gray-400">Loading…</span>
                ) : (
                  <span className={slackHours < 9 ? 'text-amber-600 font-medium' : 'text-gray-500'}>
                    {slackHours.toFixed(1)}h {slackHours < 9 && '— below a full 9h shift'}
                  </span>
                )}
              </div>
              {selected.status === 'pending' && (
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-700">Rate</span>
                  <button type="button" onClick={() => setRestDay(prev => !prev)}
                    className={`text-[11px] px-2.5 py-1 rounded-full font-medium cursor-pointer whitespace-nowrap ${restDay ? 'bg-violet-100 text-violet-700' : 'bg-sky-100 text-sky-700'}`}>
                    {restDay ? '30% rest day' : '25% weekday'}
                  </button>
                </div>
              )}
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-700">Notes <span className="text-gray-400 font-normal">(visible to contractor)</span></label>
                <textarea
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  rows={2}
                  placeholder="Optional notes..."
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a] resize-none"
                />
              </div>
              {selected.status === 'pending' ? (
                <div className="flex gap-2">
                  <button onClick={() => decide('approved')} disabled={updating}
                    className="flex-1 py-2.5 text-sm bg-emerald-500 text-white rounded-lg font-medium hover:bg-emerald-600 disabled:opacity-40 cursor-pointer transition-colors whitespace-nowrap">
                    Approve
                  </button>
                  <button onClick={() => decide('rejected')} disabled={updating}
                    className="flex-1 py-2.5 text-sm bg-rose-500 text-white rounded-lg font-medium hover:bg-rose-600 disabled:opacity-40 cursor-pointer transition-colors whitespace-nowrap">
                    Reject
                  </button>
                </div>
              ) : (
                <div className={`text-center py-2 text-sm font-medium rounded-lg ${selected.status === 'approved' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                  {selected.status === 'approved' ? 'Approved' : 'Rejected'}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
