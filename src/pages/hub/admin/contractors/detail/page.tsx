import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import AdminLayout from '@/pages/hub/components/AdminLayout';
import { supabase } from '@/lib/supabase';
import { HubUser, HubAttendance, HubTimeOff, HubRequest, HubClient, HubAsset } from '@/lib/types';
import EditContractorModal from './EditContractorModal';
import { getPeriods, fmtTime, fmtDate } from '@/lib/formatUtils';
import { logAudit } from '@/lib/audit';
import { useAuth } from '@/contexts/AuthContext';

interface DayRow {
  date: string;
  hours_raw: number;
  hours_capped: number;
  overtime_hours: number;
  first_on: string | null;
  last_off: string | null;
}

export default function ContractorDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { hubUser: actor } = useAuth();
  const [contractor, setContractor] = useState<HubUser | null>(null);
  const [requests, setRequests] = useState<HubRequest[]>([]);
  const [assets, setAssets] = useState<HubAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEdit, setShowEdit] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'attendance' | 'requests' | 'assets' | 'payslip' | 'contracts'>('overview');
  const [contracts, setContracts] = useState<any[]>([]);

  // Schedule
  const [scheduleForm, setScheduleForm] = useState({ shift_start: '', shift_end: '', work_days: [] as string[] });
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [scheduleEditing, setScheduleEditing] = useState(false);

  // Rate history
  const [rateHistory, setRateHistory] = useState<any[]>([]);
  const [showRateModal, setShowRateModal] = useState(false);
  const [rateForm, setRateForm] = useState({ payment_type: 'fixed', monthly_rate: '', hourly_rate: '', effective_date: new Date().toISOString().slice(0, 10), note: '' });
  const [rateSaving, setRateSaving] = useState(false);
  const [rateError, setRateError] = useState('');
  const [confirmDeleteRateId, setConfirmDeleteRateId] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const photoRef = useRef<HTMLInputElement>(null);

  const handlePhotoUpload = async (file: File) => {
    if (!contractor) return;
    setUploadingPhoto(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `${contractor.id}/avatar.${ext}`;
      const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);
      const { error: dbErr } = await supabase.from('hub_users').update({ avatar_url: publicUrl, updated_at: new Date().toISOString() }).eq('id', contractor.id);
      if (dbErr) throw dbErr;
      setContractor(prev => prev ? { ...prev, avatar_url: publicUrl } : prev);
    } catch (e: any) {
      alert(e.message || 'Photo upload failed');
    }
    setUploadingPhoto(false);
  };

  // Payslip tab state
  const allPeriods = getPeriods();
  const [selectedPeriod, setSelectedPeriod] = useState(allPeriods[allPeriods.length - 1]);

  // Attendance tab state
  const reversedPeriods = [...allPeriods].reverse();
  const [attPeriodIdx, setAttPeriodIdx] = useState(0);
  const attPeriod = reversedPeriods[attPeriodIdx];
  const [attDays, setAttDays] = useState<DayRow[]>([]);
  const [attLoading, setAttLoading] = useState(false);
  const [payslipDays, setPayslipDays] = useState<DayRow[]>([]);
  const [payslipPayout, setPayslipPayout] = useState<any>(null);
  const [payslipLoading, setPayslipLoading] = useState(false);

  const fetchRateHistory = async () => {
    if (!id) return;
    const { data } = await supabase
      .from('hub_rate_history')
      .select('id, effective_date, payment_type, hourly_rate, monthly_rate, note, created_at')
      .eq('contractor_id', id)
      .order('effective_date', { ascending: false });
    setRateHistory(data || []);
  };

  const fetch = async () => {
    if (!id) return;
    const [u, att, to, req, cl, ast] = await Promise.all([
      supabase.from('hub_users').select('*').eq('id', id).maybeSingle(),
      supabase.from('hub_attendance').select('*').eq('contractor_id', id).order('date', { ascending: false }).limit(10),
      supabase.from('hub_time_off').select('*').eq('contractor_id', id).order('created_at', { ascending: false }),
      supabase.from('hub_requests').select('*').eq('contractor_id', id).order('created_at', { ascending: false }),
      supabase.from('hub_clients').select('*').eq('contractor_id', id),
      supabase.from('hub_assets').select('*').eq('contractor_id', id),
    ]);
    const user = u.data as HubUser ?? null;
    setContractor(user);
    if (user) {
      setScheduleForm({
        shift_start: user.shift_start || '',
        shift_end: user.shift_end || '',
        work_days: user.work_days || [],
      });
    }
    setAttendance((att.data as HubAttendance[]) ?? []);

    setTimeOff((to.data as HubTimeOff[]) ?? []);
    setRequests((req.data as HubRequest[]) ?? []);
    setClients((cl.data as HubClient[]) ?? []);
    setAssets((ast.data as HubAsset[]) ?? []);
    setLoading(false);
  };

  const saveSchedule = async () => {
    if (!id) return;
    setScheduleSaving(true);
    await supabase.from('hub_users').update({
      shift_start: scheduleForm.shift_start || null,
      shift_end: scheduleForm.shift_end || null,
      work_days: scheduleForm.work_days,
    }).eq('id', id);
    setScheduleSaving(false);
    setScheduleEditing(false);
    await fetch();
  };

  const saveRate = async () => {
    if (!id || !contractor) return;
    setRateError('');
    const monthly = rateForm.monthly_rate ? parseFloat(rateForm.monthly_rate) : null;
    const hourly  = rateForm.hourly_rate  ? parseFloat(rateForm.hourly_rate)  : null;
    if (!monthly && !hourly) {
      setRateError('Fill in at least one rate.'); return;
    }
    setRateSaving(true);

    // If no history yet, seed the current rates as the original entry
    const { data: existing } = await supabase
      .from('hub_rate_history')
      .select('id')
      .eq('contractor_id', id)
      .limit(1);

    if (!existing || existing.length === 0) {
      await supabase.from('hub_rate_history').insert({
        contractor_id: id,
        effective_date: contractor.start_date || new Date().toISOString().slice(0, 10),
        payment_type: contractor.payment_type || 'fixed',
        hourly_rate: contractor.hourly_rate || null,
        monthly_rate: contractor.monthly_rate || null,
        currency: contractor.currency || 'PHP',
        note: 'Initial rate',
      });
    }

    // Determine updated payment_type: if only one field filled, use that; if both, keep existing
    const newPaymentType = monthly && !hourly ? 'fixed' : !monthly && hourly ? 'hourly' : contractor.payment_type || 'fixed';

    const { error } = await supabase.from('hub_rate_history').insert({
      contractor_id: id,
      effective_date: rateForm.effective_date,
      payment_type: newPaymentType,
      hourly_rate: hourly ?? null,
      monthly_rate: monthly ?? null,
      currency: contractor.currency || 'PHP',
      note: rateForm.note || null,
    });

    if (error) { setRateError(error.message); setRateSaving(false); return; }

    // Update hub_users with whichever rates were filled
    await supabase.from('hub_users').update({
      payment_type: newPaymentType,
      ...(monthly !== null ? { monthly_rate: monthly } : {}),
      ...(hourly  !== null ? { hourly_rate:  hourly  } : {}),
    }).eq('id', id);

    const rateDesc = monthly ? `₱${monthly.toLocaleString()}/mo` : `₱${hourly?.toLocaleString()}/hr`;
    logAudit({ actor_id: actor?.id, actor_name: actor?.full_name, action: 'update', entity_type: 'contractor', entity_id: id, description: `Updated rate for ${contractor.full_name} to ${rateDesc} (effective ${rateForm.effective_date})` });

    setRateSaving(false);
    setShowRateModal(false);
    await Promise.all([fetch(), fetchRateHistory()]);
  };

  const deleteRate = async (entryId: string) => {
    if (!id || !contractor) return;
    // Deleting the most recent entry → revert hub_users to the one before it
    const isLatest = rateHistory[0]?.id === entryId;
    await supabase.from('hub_rate_history').delete().eq('id', entryId);
    if (isLatest) {
      const remaining = rateHistory.filter(r => r.id !== entryId);
      const prev = remaining[0] || null;
      if (prev) {
        await supabase.from('hub_users').update({
          payment_type: prev.payment_type,
          hourly_rate: prev.hourly_rate,
          monthly_rate: prev.monthly_rate,
        }).eq('id', id);
      }
    }
    logAudit({ actor_id: actor?.id, actor_name: actor?.full_name, action: 'delete', entity_type: 'contractor', entity_id: id, description: `Deleted rate history entry for ${contractor.full_name}` });
    setConfirmDeleteRateId(null);
    await Promise.all([fetch(), fetchRateHistory()]);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetch(); fetchRateHistory(); }, [id]);

  const fetchAttendanceDays = async () => {
    if (!id || !attPeriod) return;
    setAttLoading(true);
    const { data } = await supabase
      .from('hub_daily_hours')
      .select('date, hours_raw, hours_capped, overtime_hours, first_on, last_off')
      .eq('user_id', id)
      .gte('date', attPeriod.start)
      .lte('date', attPeriod.end)
      .order('date', { ascending: false });
    setAttDays((data as DayRow[]) ?? []);
    setAttLoading(false);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (activeTab === 'payslip' && id) fetchPayslip();
    if (activeTab === 'contracts' && id) fetchContracts();
    if (activeTab === 'attendance' && id) fetchAttendanceDays();
  }, [activeTab, selectedPeriod, attPeriodIdx, id]);

  const fetchContracts = async () => {
    const { data } = await supabase
      .from('hub_sign_assignments')
      .select('*, hub_sign_documents(id, title, description, amendment_type, rate_snapshot, is_generated, content, file_url, created_at)')
      .eq('contractor_id', id!)
      .order('created_at', { ascending: false });
    setContracts(data ?? []);
  };

  const fetchPayslip = async () => {
    setPayslipLoading(true);
    const [daysRes, payoutRes] = await Promise.all([
      supabase.from('hub_daily_hours')
        .select('date, hours_raw, hours_capped, overtime_hours, first_on, last_off')
        .eq('user_id', id!)
        .gte('date', selectedPeriod.start)
        .lte('date', selectedPeriod.end)
        .order('date', { ascending: true }),
      supabase.from('hub_payouts')
        .select('id, status, final_payout, payment_date')
        .eq('contractor_id', id!)
        .eq('cutoff_start', selectedPeriod.start)
        .maybeSingle(),
    ]);
    setPayslipDays((daysRes.data as DayRow[]) ?? []);
    setPayslipPayout(payoutRes.data ?? null);
    setPayslipLoading(false);
  };

  const tabs = [
    { key: 'overview', label: 'Overview', icon: 'ri-user-line' },
    { key: 'attendance', label: 'Attendance', icon: 'ri-time-line' },
    { key: 'requests', label: 'Requests', icon: 'ri-inbox-line' },
    { key: 'assets', label: 'Assets', icon: 'ri-key-2-line' },
    { key: 'payslip', label: 'Payslip', icon: 'ri-file-text-line' },
    { key: 'contracts', label: 'Contracts', icon: 'ri-pen-nib-line' },
  ];

  if (loading) {
    return (
      <AdminLayout title="Contractor Detail">
        <div className="flex items-center justify-center h-48">
          <i className="ri-loader-4-line animate-spin text-2xl text-gray-400"></i>
        </div>
      </AdminLayout>
    );
  }

  if (!contractor) {
    return (
      <AdminLayout title="Not Found">
        <p className="text-gray-500">Contractor not found.</p>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout
      title={contractor.full_name}
      actions={
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/hub/admin/contractors')}
            className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1 cursor-pointer whitespace-nowrap"
          >
            <i className="ri-arrow-left-line text-sm"></i>
            Back
          </button>
          <button
            onClick={() => setShowEdit(true)}
            className="flex items-center gap-1.5 bg-[#FF6B35] text-white text-sm px-3 py-2 rounded-lg hover:bg-[#e55a27] transition-colors cursor-pointer whitespace-nowrap"
          >
            <i className="ri-edit-line text-sm"></i>
            Edit
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        {/* Profile header */}
        <div className="bg-white border border-gray-100 rounded-xl p-5 flex flex-col sm:flex-row gap-5 items-start">
          <div className="relative flex-shrink-0">
            {contractor.avatar_url ? (
              <img src={contractor.avatar_url} alt={contractor.full_name} className="w-20 h-20 rounded-xl object-cover object-top" />
            ) : (
              <div className="w-20 h-20 rounded-xl bg-[#FF6B35] flex items-center justify-center">
                <span className="text-white text-2xl font-bold">{contractor.full_name.charAt(0).toUpperCase()}</span>
              </div>
            )}
            <button
              onClick={() => photoRef.current?.click()}
              disabled={uploadingPhoto}
              className="absolute -bottom-1.5 -right-1.5 w-7 h-7 bg-[#111827] text-white rounded-full flex items-center justify-center cursor-pointer hover:bg-gray-700 transition-colors"
            >
              {uploadingPhoto ? <i className="ri-loader-4-line animate-spin text-xs"></i> : <i className="ri-camera-line text-xs"></i>}
            </button>
            <input ref={photoRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePhotoUpload(f); }} />
          </div>
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex flex-wrap items-start gap-2">
              <h2 className="text-lg font-bold text-[#111827]">{contractor.full_name}</h2>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${
                contractor.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
              }`}>{contractor.status === 'active' ? 'Active' : 'Inactive'}</span>
            </div>
            <div className="flex flex-wrap gap-3 text-sm text-gray-500">
              <span className="flex items-center gap-1"><i className="ri-mail-line text-xs"></i>{contractor.email}</span>
              {contractor.phone && <span className="flex items-center gap-1"><i className="ri-phone-line text-xs"></i>{contractor.phone}</span>}
              {contractor.slack_username && <span className="flex items-center gap-1"><i className="ri-slack-line text-xs"></i>{contractor.slack_username}</span>}
            </div>
            <div className="flex flex-wrap gap-2">
              {contractor.department && (
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{contractor.department}</span>
              )}
              {contractor.hourly_rate && (
                <span className="text-xs bg-[#FF6B35]/10 text-[#FF6B35] px-2 py-0.5 rounded-full font-medium">
                  ₱{contractor.hourly_rate}/hr {contractor.currency}
                </span>
              )}
              {contractor.payment_method && (
                <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">{contractor.payment_method}</span>
              )}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key as typeof activeTab)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
                activeTab === t.key ? 'bg-white text-[#111827] shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <i className={`${t.icon} text-xs`}></i>
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-white border border-gray-100 rounded-xl p-4 space-y-3">
              <h3 className="text-sm font-semibold text-[#111827]">Personal Info</h3>
              {[
                { label: 'Phone', value: contractor.phone, icon: 'ri-phone-line' },
                { label: 'Birthday', value: contractor.birthday, icon: 'ri-cake-line' },
                { label: 'Start Date', value: contractor.start_date ? new Date(contractor.start_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : undefined, icon: 'ri-calendar-line' },
                { label: 'Address', value: contractor.address, icon: 'ri-map-pin-line' },
              ].map((f) => f.value ? (
                <div key={f.label} className="flex items-start gap-2.5">
                  <div className="w-6 h-6 rounded-md bg-gray-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <i className={`${f.icon} text-gray-400 text-xs`}></i>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">{f.label}</p>
                    <p className="text-sm text-gray-700 mt-0.5">{f.value}</p>
                  </div>
                </div>
              ) : null)}
            </div>

            <div className="bg-white border border-gray-100 rounded-xl p-4 space-y-3">
              <h3 className="text-sm font-semibold text-[#111827]">Emergency Contact</h3>
              {contractor.emergency_contact_name ? (
                <div className="space-y-2.5">
                  <div className="flex items-start gap-2.5">
                    <div className="w-6 h-6 rounded-md bg-rose-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <i className="ri-user-heart-line text-rose-400 text-xs"></i>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">Name</p>
                      <p className="text-sm text-gray-700 mt-0.5">{contractor.emergency_contact_name}</p>
                    </div>
                  </div>
                  {contractor.emergency_contact_relationship && (
                    <div className="flex items-start gap-2.5">
                      <div className="w-6 h-6 rounded-md bg-gray-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <i className="ri-group-line text-gray-400 text-xs"></i>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400">Relationship</p>
                        <p className="text-sm text-gray-700 mt-0.5">{contractor.emergency_contact_relationship}</p>
                      </div>
                    </div>
                  )}
                  {contractor.emergency_contact_phone && (
                    <div className="flex items-start gap-2.5">
                      <div className="w-6 h-6 rounded-md bg-gray-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <i className="ri-phone-line text-gray-400 text-xs"></i>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400">Phone</p>
                        <p className="text-sm text-gray-700 mt-0.5">{contractor.emergency_contact_phone}</p>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-gray-400">No emergency contact on file</p>
              )}
            </div>

            <div className="bg-white border border-gray-100 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[#111827]">Pay Info</h3>
                <button
                  onClick={() => {
                    setRateForm({
                      payment_type: contractor.payment_type || 'fixed',
                      monthly_rate: contractor.monthly_rate ? String(contractor.monthly_rate) : '',
                      hourly_rate: contractor.hourly_rate ? String(contractor.hourly_rate) : '',
                      effective_date: new Date().toISOString().slice(0, 10),
                      note: '',
                    });
                    setRateError('');
                    setShowRateModal(true);
                  }}
                  className="flex items-center gap-1 text-xs text-[#FF6B35] hover:underline cursor-pointer"
                >
                  <i className="ri-arrow-up-circle-line text-sm"></i>
                  Update Rate
                </button>
              </div>
              {[
                { label: 'Payment Type', value: contractor.payment_type ? ({ fixed: 'Fixed Monthly', hourly: 'Hourly', fixed_flexible: 'Fixed Flexible', project_based: 'Project Based' } as Record<string,string>)[contractor.payment_type] ?? contractor.payment_type : undefined, icon: 'ri-bank-card-line' },
                { label: 'Rate', value: contractor.payment_type === 'project_based' ? ((contractor as any).project_percentage ? `${(contractor as any).project_percentage}% of project` : undefined) : contractor.payment_type === 'fixed' ? (contractor.monthly_rate ? `₱${contractor.monthly_rate.toLocaleString()}/mo` : undefined) : (contractor.hourly_rate ? `₱${contractor.hourly_rate}/hr ${contractor.currency || ''}` : undefined), icon: 'ri-money-dollar-circle-line' },
                { label: 'OT Rate', value: contractor.payment_type === 'fixed' && contractor.hourly_rate ? `₱${contractor.hourly_rate}/hr` : undefined, icon: 'ri-time-line' },
                { label: 'Bank', value: contractor.bank_name, icon: 'ri-building-line' },
                { label: 'Account Name', value: contractor.bank_account_name, icon: 'ri-user-line' },
                { label: 'Account Number', value: contractor.bank_account_number, icon: 'ri-hashtag' },
              ].map((f) => f.value ? (
                <div key={f.label} className="flex items-start gap-2.5">
                  <div className="w-6 h-6 rounded-md bg-gray-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <i className={`${f.icon} text-gray-400 text-xs`}></i>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">{f.label}</p>
                    <p className="text-sm text-gray-700 mt-0.5 font-mono">{f.value}</p>
                  </div>
                </div>
              ) : null)}

              {/* Rate History */}
              {rateHistory.length > 0 && (
                <div className="pt-2 border-t border-gray-50">
                  <p className="text-xs text-gray-400 font-medium mb-2">Rate History</p>
                  <div className="space-y-1.5">
                    {rateHistory.map((r, i) => (
                      <div key={r.id}>
                        {confirmDeleteRateId === r.id ? (
                          <div className="flex items-center justify-between bg-red-50 border border-red-100 rounded-lg px-2.5 py-2 text-xs">
                            <span className="text-red-700 font-medium">Delete this entry?{i === 0 ? ' Rate will revert to previous.' : ''}</span>
                            <div className="flex items-center gap-2">
                              <button onClick={() => deleteRate(r.id)} className="text-red-600 font-semibold hover:underline cursor-pointer">Delete</button>
                              <button onClick={() => setConfirmDeleteRateId(null)} className="text-gray-500 hover:underline cursor-pointer">Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between text-xs group">
                            <div className="flex items-center gap-1.5">
                              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${i === 0 ? 'bg-emerald-400' : 'bg-gray-300'}`}></span>
                              <span className="text-gray-500">{new Date(r.effective_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                              {r.note && <span className="text-gray-400 italic">· {r.note}</span>}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`font-medium ${i === 0 ? 'text-emerald-600' : 'text-gray-500'}`}>
                                {r.payment_type === 'fixed'
                                  ? `₱${(r.monthly_rate || 0).toLocaleString()}/mo`
                                  : `₱${r.hourly_rate}/hr`}
                              </span>
                              <button
                                onClick={() => setConfirmDeleteRateId(r.id)}
                                className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 transition-all cursor-pointer"
                                title="Delete this rate entry"
                              >
                                <i className="ri-delete-bin-line text-xs"></i>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Schedule */}
            <div className="bg-white border border-gray-100 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[#111827]">Work Schedule</h3>
                {!scheduleEditing ? (
                  <button onClick={() => setScheduleEditing(true)} className="text-xs text-[#FF6B35] hover:underline cursor-pointer flex items-center gap-1">
                    <i className="ri-edit-line text-sm"></i> Edit
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <button onClick={saveSchedule} disabled={scheduleSaving} className="text-xs text-emerald-600 hover:underline cursor-pointer font-medium">
                      {scheduleSaving ? 'Saving…' : 'Save'}
                    </button>
                    <button onClick={() => { setScheduleEditing(false); setScheduleForm({ shift_start: contractor.shift_start || '', shift_end: contractor.shift_end || '', work_days: contractor.work_days || [] }); }} className="text-xs text-gray-400 hover:underline cursor-pointer">Cancel</button>
                  </div>
                )}
              </div>

              {scheduleEditing ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-gray-400 mb-1">Shift Start</p>
                      <input type="time" value={scheduleForm.shift_start} onChange={e => setScheduleForm(f => ({ ...f, shift_start: e.target.value }))}
                        className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-[#FF6B35]" />
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 mb-1">Shift End</p>
                      <input type="time" value={scheduleForm.shift_end} onChange={e => setScheduleForm(f => ({ ...f, shift_end: e.target.value }))}
                        className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-[#FF6B35]" />
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 mb-1.5">Work Days</p>
                    <div className="flex gap-1.5 flex-wrap">
                      {['mon','tue','wed','thu','fri','sat','sun'].map(d => (
                        <button key={d} onClick={() => setScheduleForm(f => ({ ...f, work_days: f.work_days.includes(d) ? f.work_days.filter(x => x !== d) : [...f.work_days, d] }))}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium cursor-pointer transition-colors ${scheduleForm.work_days.includes(d) ? 'bg-[#111827] text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                          {d.charAt(0).toUpperCase() + d.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : contractor.shift_start ? (
                <div className="space-y-2.5">
                  <div className="flex items-start gap-2.5">
                    <div className="w-6 h-6 rounded-md bg-gray-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <i className="ri-time-line text-gray-400 text-xs"></i>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">Shift Hours</p>
                      <p className="text-sm text-gray-700 mt-0.5">
                        {contractor.shift_start} → {contractor.shift_end || '—'}
                        {contractor.shift_end && contractor.shift_end < contractor.shift_start && (
                          <span className="ml-1.5 text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full">Overnight</span>
                        )}
                      </p>
                    </div>
                  </div>
                  {contractor.work_days && contractor.work_days.length > 0 && (
                    <div className="flex items-start gap-2.5">
                      <div className="w-6 h-6 rounded-md bg-gray-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <i className="ri-calendar-line text-gray-400 text-xs"></i>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400">Work Days</p>
                        <div className="flex gap-1 mt-1 flex-wrap">
                          {['mon','tue','wed','thu','fri','sat','sun'].map(d => (
                            <span key={d} className={`text-xs px-2 py-0.5 rounded-full font-medium ${contractor.work_days!.includes(d) ? 'bg-[#111827] text-white' : 'bg-gray-100 text-gray-400'}`}>
                              {d.charAt(0).toUpperCase() + d.slice(1)}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-gray-400">No schedule set</p>
              )}
            </div>

            {contractor.notes && (
              <div className="sm:col-span-2 bg-amber-50 border border-amber-100 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-amber-800 mb-1.5">Admin Notes</h3>
                <p className="text-sm text-amber-700">{contractor.notes}</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'attendance' && (
          <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <p className="text-sm font-semibold text-gray-800">Attendance</p>
              <select
                value={attPeriodIdx}
                onChange={e => setAttPeriodIdx(Number(e.target.value))}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none bg-white cursor-pointer"
              >
                {reversedPeriods.map((p, i) => (
                  <option key={p.start} value={i}>{p.label}</option>
                ))}
              </select>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[500px]">
                <thead>
                  <tr className="bg-gray-50/50 border-b border-gray-100">
                    <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Date</th>
                    <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">On</th>
                    <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Off</th>
                    <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Hours</th>
                    <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {attLoading ? (
                    <tr><td colSpan={5} className="text-center py-8"><i className="ri-loader-4-line animate-spin text-gray-300 text-xl"></i></td></tr>
                  ) : attDays.length === 0 ? (
                    <tr><td colSpan={5} className="text-center text-sm text-gray-400 py-8">No attendance records for this period</td></tr>
                  ) : attDays.map((a) => {
                    const present = a.hours_raw > 0;
                    const status = !a.first_on ? 'absent' : !a.last_off ? 'missing off' : 'complete';
                    const statusCls = status === 'complete' ? 'bg-emerald-100 text-emerald-700' : status === 'missing off' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500';
                    return (
                      <tr key={a.date} className="hover:bg-gray-50/40">
                        <td className="px-4 py-3 text-sm text-gray-700">{fmtDate(a.date)}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{fmtTime(a.first_on)}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{fmtTime(a.last_off)}</td>
                        <td className="px-4 py-3 text-sm font-medium text-gray-700">
                          {present ? `${a.hours_capped.toFixed(1)}h` : '—'}
                          {a.overtime_hours > 0 && <span className="ml-1 text-xs text-purple-500">+{a.overtime_hours}h OT</span>}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap capitalize ${statusCls}`}>{status}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'requests' && (
          <div className="space-y-3">
            {requests.length === 0 ? (
              <div className="bg-white border border-gray-100 rounded-xl p-8 text-center">
                <p className="text-sm text-gray-400">No requests from this contractor</p>
              </div>
            ) : requests.map((r) => (
              <div key={r.id} className="bg-white border border-gray-100 rounded-xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-[#111827]">{r.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{r.type} · {new Date(r.created_at!).toLocaleDateString()}</p>
                    {r.description && <p className="text-sm text-gray-500 mt-2">{r.description}</p>}
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0 ${
                    r.status === 'open' ? 'bg-amber-100 text-amber-700' :
                    r.status === 'in_review' ? 'bg-sky-100 text-sky-700' :
                    r.status === 'resolved' ? 'bg-emerald-100 text-emerald-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>{r.status.replace('_', ' ')}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'payslip' && (() => {
          const paymentType = (contractor as any)?.payment_type || 'hourly';
          const currentHourlyRate = Number((contractor as any)?.hourly_rate || 0);
          const currentMonthlyRate = Number((contractor as any)?.monthly_rate || 0);
          const currency = (contractor as any)?.currency || 'PHP';
          const isUSD = currency === 'USD';
          const fmt = (val: number) => isUSD
            ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val)
            : new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(val);

          const startDate = (contractor as any)?.start_date ?? null;
          const periods = startDate ? allPeriods.filter(p => p.end >= startDate) : allPeriods;

          const totalDaysWorked = payslipDays.length;
          const totalHoursRaw = payslipDays.reduce((s, d) => s + d.hours_raw, 0);
          const totalHoursBillable = payslipDays.reduce((s, d) => s + d.hours_capped, 0);
          const totalOvertime = payslipDays.reduce((s, d) => s + (d.overtime_hours || 0), 0);

          // Use rate history for accurate prorated pay (same logic as admin payroll page)
          const history = [...rateHistory].sort((a, b) => a.effective_date.localeCompare(b.effective_date));
          const changeInPeriod = history.find(r =>
            r.effective_date >= selectedPeriod.start && r.effective_date <= selectedPeriod.end
          );
          const rateAtStart = [...history].filter(r => r.effective_date < selectedPeriod.start).pop() || null;

          let basePay: number;
          let overtimePay: number;
          let otRate: number;
          let isProrated = false;
          let displayMonthlyRate: number;
          let displayHourlyRate: number;
          let proratedLabel = '';

          if (changeInPeriod) {
            isProrated = true;
            const beforeChange = [...history].filter(r => r.effective_date < changeInPeriod.effective_date).pop();
            const oldMonthly = beforeChange?.monthly_rate ?? currentMonthlyRate;
            const oldHourly  = beforeChange?.hourly_rate  ?? currentHourlyRate;
            const newMonthly = changeInPeriod.monthly_rate || 0;
            const newHourly  = changeInPeriod.hourly_rate  || 0;
            displayMonthlyRate = newMonthly;
            displayHourlyRate  = newHourly;
            const periodStart = new Date(selectedPeriod.start);
            const periodEnd   = new Date(selectedPeriod.end);
            const changeDate  = new Date(changeInPeriod.effective_date);
            if (paymentType === 'fixed') {
              const totalDays = Math.round((periodEnd.getTime() - periodStart.getTime()) / 86400000) + 1;
              const daysAtOld = Math.max(0, Math.round((changeDate.getTime() - periodStart.getTime()) / 86400000));
              const daysAtNew = totalDays - daysAtOld;
              basePay = (oldMonthly / 2 / totalDays * daysAtOld) + (newMonthly / 2 / totalDays * daysAtNew);
              const oldOT = oldHourly || oldMonthly / 176;
              const newOT = newHourly || newMonthly / 176;
              let otAtOld = 0, otAtNew = 0;
              for (const d of payslipDays) {
                if (d.date < changeInPeriod.effective_date) otAtOld += d.overtime_hours || 0;
                else otAtNew += d.overtime_hours || 0;
              }
              overtimePay = otAtOld * oldOT + otAtNew * newOT;
              otRate = newOT;
              proratedLabel = `${daysAtOld}d @ ₱${oldMonthly.toLocaleString()}/mo · ${daysAtNew}d @ ₱${newMonthly.toLocaleString()}/mo`;
            } else {
              let hrsAtOld = 0, hrsAtNew = 0;
              for (const d of payslipDays) {
                if (d.date < changeInPeriod.effective_date) hrsAtOld += d.hours_capped;
                else hrsAtNew += d.hours_capped;
              }
              basePay = hrsAtOld * oldHourly + hrsAtNew * newHourly;
              otRate = newHourly;
              overtimePay = totalOvertime * newHourly;
            }
          } else {
            const eff = rateAtStart;
            const monthly = eff?.monthly_rate ?? currentMonthlyRate;
            const hourly  = eff?.hourly_rate  ?? currentHourlyRate;
            displayMonthlyRate = monthly;
            displayHourlyRate  = hourly;
            if (paymentType === 'fixed') {
              basePay = monthly / 2;
              otRate = hourly || monthly / 176;
            } else {
              basePay = totalHoursBillable * hourly;
              otRate = hourly;
            }
            overtimePay = totalOvertime * otRate;
          }
          const totalPay = basePay + overtimePay;

          return (
            <div className="max-w-2xl space-y-5">
              {/* Period selector */}
              <div className="bg-white border border-gray-100 rounded-xl p-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-gray-800">Pay Period</p>
                  <p className="text-xs text-gray-400 mt-0.5">{selectedPeriod.start} — {selectedPeriod.end}</p>
                </div>
                <select
                  value={selectedPeriod.start}
                  onChange={(e) => setSelectedPeriod(periods.find(p => p.start === e.target.value)!)}
                  className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/30 focus:border-[#FF6B35] bg-white cursor-pointer"
                >
                  {periods.map((p) => (
                    <option key={p.start} value={p.start}>{p.label}</option>
                  ))}
                </select>
              </div>

              {payslipLoading ? (
                <div className="flex items-center justify-center py-20">
                  <i className="ri-loader-4-line animate-spin text-2xl text-gray-300"></i>
                </div>
              ) : (
                <>
                  <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                    <div className="bg-[#111827] px-6 py-5 flex items-start justify-between">
                      <div>
                        <p className="text-white font-bold text-base">Huna Creatives</p>
                        <p className="text-white/40 text-xs mt-0.5">Contractor Payment Summary</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[#FF6B35] font-bold text-sm tracking-widest">PAYSLIP</p>
                        <p className="text-white/40 text-xs mt-1">{selectedPeriod.label}</p>
                      </div>
                    </div>

                    <div className="px-6 py-4 border-b border-gray-50 grid grid-cols-2 sm:grid-cols-3 gap-4">
                      <div>
                        <p className="text-xs text-gray-400 mb-0.5">Contractor</p>
                        <p className="text-sm font-semibold text-gray-900">{contractor?.full_name}</p>
                        {(contractor as any)?.department && <p className="text-xs text-gray-400">{(contractor as any).department}</p>}
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 mb-0.5">Pay Period</p>
                        <p className="text-sm font-semibold text-gray-900">{selectedPeriod.label}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 mb-0.5">Rate</p>
                        <p className="text-sm font-semibold text-gray-900">
                          {isProrated ? 'Prorated' : paymentType === 'fixed' ? `₱${displayMonthlyRate.toLocaleString()}/mo` : `${isUSD ? '$' : '₱'}${displayHourlyRate}/hr`}
                        </p>
                        <p className="text-xs text-gray-400">{isProrated ? proratedLabel : paymentType}</p>
                      </div>
                    </div>

                    <div className="px-6 py-4 border-b border-gray-50 grid grid-cols-4 gap-3 text-center">
                      {[
                        { label: 'Days Worked', value: totalDaysWorked, color: 'text-gray-900' },
                        { label: 'Hours Logged', value: `${totalHoursRaw.toFixed(1)}h`, color: 'text-gray-900' },
                        { label: 'Billable Hours', value: `${totalHoursBillable.toFixed(1)}h`, color: 'text-sky-700' },
                        { label: 'Overtime', value: totalOvertime > 0 ? `+${totalOvertime}h` : '—', color: totalOvertime > 0 ? 'text-purple-700' : 'text-gray-400' },
                      ].map(s => (
                        <div key={s.label} className="bg-gray-50 rounded-xl py-3">
                          <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{s.label}</p>
                        </div>
                      ))}
                    </div>

                    {payslipDays.length > 0 ? (
                      <div className="px-6 py-4 border-b border-gray-50">
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Attendance Log</p>
                        <div className="space-y-1.5">
                          {payslipDays.map((d) => (
                            <div key={d.date} className="flex items-center gap-3 text-sm py-1.5 border-b border-gray-50 last:border-0">
                              <span className="text-gray-500 w-32 flex-shrink-0">{fmtDate(d.date)}</span>
                              <span className="text-gray-400 text-xs w-20 flex-shrink-0 text-center">{fmtTime(d.first_on)}</span>
                              <i className="ri-arrow-right-line text-gray-300 text-xs flex-shrink-0"></i>
                              <span className="text-gray-400 text-xs w-20 flex-shrink-0 text-center">{fmtTime(d.last_off)}</span>
                              <span className="flex-1 text-right">
                                <span className="font-medium text-gray-800">{d.hours_capped.toFixed(2)}h</span>
                                {d.hours_raw > d.hours_capped && (
                                  <span className="text-xs text-amber-500 ml-1.5">(raw {d.hours_raw.toFixed(2)}h)</span>
                                )}
                              </span>
                              {d.overtime_hours > 0 && (
                                <span className="text-xs px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded font-medium flex-shrink-0">+{d.overtime_hours}h OT</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="px-6 py-8 text-center border-b border-gray-50">
                        <i className="ri-calendar-line text-2xl text-gray-200 block mb-2"></i>
                        <p className="text-sm text-gray-400">No attendance logged for this period</p>
                      </div>
                    )}

                    <div className="px-6 py-4">
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Earnings</p>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-500">
                            {isProrated
                              ? `Prorated base (${proratedLabel})`
                              : paymentType === 'fixed'
                                ? `Fixed rate (${fmt(displayMonthlyRate)}/mo ÷ 2)`
                                : `Base pay (${totalHoursBillable.toFixed(2)}h × ${isUSD ? '$' : '₱'}${displayHourlyRate})`}
                          </span>
                          <span className="text-sm font-medium text-gray-800">{fmt(basePay)}</span>
                        </div>
                        {overtimePay > 0 && (
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-purple-600">Overtime ({totalOvertime}h × {isUSD ? '$' : '₱'}{otRate.toFixed(2)}/hr)</span>
                            <span className="text-sm font-medium text-purple-700">+{fmt(overtimePay)}</span>
                          </div>
                        )}
                        <div className="flex items-center justify-between pt-3 mt-1 border-t border-gray-100">
                          <span className="font-semibold text-gray-900">Total Payout</span>
                          <span className="text-xl font-bold text-[#FF6B35]">{fmt(totalPay)}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {payslipPayout && (
                    <div className={`rounded-xl px-4 py-3.5 flex items-center gap-3 ${
                      payslipPayout.status === 'paid' ? 'bg-emerald-50 border border-emerald-100' :
                      payslipPayout.status === 'approved' ? 'bg-sky-50 border border-sky-100' :
                      'bg-amber-50 border border-amber-100'
                    }`}>
                      <i className={`text-lg ${
                        payslipPayout.status === 'paid' ? 'ri-checkbox-circle-fill text-emerald-500' :
                        payslipPayout.status === 'approved' ? 'ri-shield-check-fill text-sky-500' :
                        'ri-time-fill text-amber-500'
                      }`}></i>
                      <div className="flex-1">
                        <p className={`text-sm font-semibold ${
                          payslipPayout.status === 'paid' ? 'text-emerald-800' :
                          payslipPayout.status === 'approved' ? 'text-sky-800' : 'text-amber-800'
                        }`}>
                          {payslipPayout.status === 'paid' ? 'Payment sent' :
                           payslipPayout.status === 'approved' ? 'Approved — payment incoming' :
                           payslipPayout.status === 'reviewed' ? 'Under review' : 'Submitted — awaiting approval'}
                        </p>
                        {payslipPayout.status === 'paid' && payslipPayout.payment_date && (
                          <p className="text-xs text-emerald-600 mt-0.5">Paid on {new Date(payslipPayout.payment_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
                        )}
                      </div>
                      <span className="text-sm font-bold text-gray-800">{fmt(payslipPayout.final_payout)}</span>
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })()}

        {activeTab === 'assets' && (
          <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[400px]">
                <thead>
                  <tr className="bg-gray-50/50 border-b border-gray-100">
                    <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Platform</th>
                    <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Account</th>
                    <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Access</th>
                    <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {assets.length === 0 ? (
                    <tr><td colSpan={4} className="text-center text-sm text-gray-400 py-8">No asset access records</td></tr>
                  ) : assets.map((a) => (
                    <tr key={a.id}>
                      <td className="px-4 py-3 text-sm font-medium text-gray-700 capitalize">{a.platform.replace('_', ' ')}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{a.account_name}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 capitalize">{a.access_level}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${
                          a.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                        }`}>{a.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'contracts' && (() => {
          const TYPE_LABELS: Record<string, { label: string; color: string; icon: string }> = {
            initial:        { label: 'Initial Agreement', color: 'bg-sky-50 text-sky-700',     icon: 'ri-file-text-line' },
            rate_amendment: { label: 'Rate Amendment',    color: 'bg-emerald-50 text-emerald-700', icon: 'ri-money-dollar-circle-line' },
            scope_change:   { label: 'Scope Change',      color: 'bg-purple-50 text-purple-700', icon: 'ri-edit-box-line' },
            renewal:        { label: 'Renewal',           color: 'bg-amber-50 text-amber-700',  icon: 'ri-refresh-line' },
            other:          { label: 'Amendment',         color: 'bg-gray-100 text-gray-600',   icon: 'ri-file-edit-line' },
          };
          return (
            <div className="space-y-3">
              {contracts.length === 0 ? (
                <div className="bg-white rounded-xl border border-gray-100 py-12 text-center">
                  <i className="ri-pen-nib-line text-3xl text-gray-200 block mb-2"></i>
                  <p className="text-gray-400 text-sm">No contracts sent yet.</p>
                  <p className="text-gray-300 text-xs mt-1">Go to Contracts → Generate Contract to send one.</p>
                </div>
              ) : contracts.map((a: any, i: number) => {
                const doc = a.hub_sign_documents;
                const type = TYPE_LABELS[doc?.amendment_type] ?? TYPE_LABELS.other;
                const isSigned = a.status === 'signed';
                const openDoc = () => {
                  if (doc?.is_generated && doc?.content) {
                    const blob = new Blob([doc.content], { type: 'text/html' });
                    window.open(URL.createObjectURL(blob), '_blank');
                  } else if (doc?.file_url) {
                    window.open(doc.file_url, '_blank');
                  }
                };
                return (
                  <div key={a.id} className="bg-white rounded-xl border border-gray-100 p-5">
                    <div className="flex items-start gap-4">
                      {/* Timeline dot */}
                      <div className="flex flex-col items-center flex-shrink-0 mt-1">
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${isSigned ? 'bg-emerald-50' : 'bg-gray-100'}`}>
                          <i className={`${type.icon} text-sm ${isSigned ? 'text-emerald-500' : 'text-gray-400'}`}></i>
                        </div>
                        {i < contracts.length - 1 && <div className="w-px flex-1 bg-gray-100 mt-2 min-h-[16px]"></div>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${type.color}`}>{type.label}</span>
                              {doc?.rate_snapshot && (
                                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">
                                  ₱{Number(doc.rate_snapshot).toLocaleString()}/mo
                                </span>
                              )}
                            </div>
                            <p className="text-sm font-medium text-gray-800 mt-1">{doc?.title}</p>
                            {doc?.description && <p className="text-xs text-gray-400 mt-0.5">{doc.description}</p>}
                          </div>
                          <span className={`text-xs px-2.5 py-1 rounded-full font-medium flex-shrink-0 ${isSigned ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                            {isSigned ? <><i className="ri-checkbox-circle-line mr-1"></i>Signed</> : <><i className="ri-time-line mr-1"></i>Pending</>}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 mt-2">
                          <span className="text-xs text-gray-400">
                            Sent {new Date(doc?.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </span>
                          {isSigned && a.signed_at && (
                            <span className="text-xs text-gray-400">
                              Signed {new Date(a.signed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} as "{a.signed_name}"
                            </span>
                          )}
                          <button onClick={openDoc} className="text-xs text-[#FF6B35] hover:underline cursor-pointer ml-auto">
                            View <i className="ri-external-link-line"></i>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>

      {showEdit && contractor && (
        <EditContractorModal
          contractor={contractor}
          onClose={() => setShowEdit(false)}
          onSuccess={() => { setShowEdit(false); fetch(); }}
        />
      )}

      {showRateModal && contractor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div>
                <h2 className="font-semibold text-[#111827] text-sm">Update Rate</h2>
                <p className="text-xs text-gray-400 mt-0.5">{contractor.full_name}</p>
              </div>
              <button onClick={() => setShowRateModal(false)} className="text-gray-400 hover:text-gray-600 cursor-pointer">
                <i className="ri-close-line text-lg"></i>
              </button>
            </div>
            <div className="p-5 space-y-4">
              {/* Current rates */}
              <div className="grid grid-cols-2 gap-2">
                {contractor.monthly_rate && (
                  <div className="px-3 py-2.5 bg-gray-50 rounded-lg">
                    <p className="text-[10px] text-gray-400">Current monthly</p>
                    <p className="text-sm font-semibold text-gray-700">₱{contractor.monthly_rate.toLocaleString()}/mo</p>
                  </div>
                )}
                {contractor.hourly_rate && (
                  <div className="px-3 py-2.5 bg-gray-50 rounded-lg">
                    <p className="text-[10px] text-gray-400">Current hourly</p>
                    <p className="text-sm font-semibold text-gray-700">₱{contractor.hourly_rate}/hr</p>
                  </div>
                )}
              </div>

              {/* New rates — both optional */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-700">Monthly Rate (₱) <span className="text-gray-400 font-normal">optional</span></label>
                  <input
                    type="number"
                    value={rateForm.monthly_rate}
                    onChange={e => setRateForm(f => ({ ...f, monthly_rate: e.target.value }))}
                    placeholder="e.g. 35000"
                    className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/30 focus:border-[#FF6B35]"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-700">
                    {rateForm.monthly_rate ? 'OT Rate (₱/hr)' : 'Hourly Rate (₱/hr)'}
                    <span className="text-gray-400 font-normal"> optional</span>
                  </label>
                  <input
                    type="number"
                    value={rateForm.hourly_rate}
                    onChange={e => setRateForm(f => ({ ...f, hourly_rate: e.target.value }))}
                    placeholder={rateForm.monthly_rate ? 'e.g. 166' : 'e.g. 200'}
                    className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/30 focus:border-[#FF6B35]"
                  />
                  {rateForm.monthly_rate && (
                    <p className="text-[10px] text-gray-400">Used for overtime. Leave blank to auto-derive from monthly ÷ 176.</p>
                  )}
                </div>
              </div>

              {/* Effective date */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-700">Effective Date</label>
                <input
                  type="date"
                  value={rateForm.effective_date}
                  onChange={e => setRateForm(f => ({ ...f, effective_date: e.target.value }))}
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/30 focus:border-[#FF6B35]"
                />
                <p className="text-[10px] text-gray-400">If this falls mid-period, payroll will be prorated automatically.</p>
              </div>

              {/* Note */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-700">Note <span className="text-gray-400 font-normal">(optional)</span></label>
                <input
                  type="text"
                  value={rateForm.note}
                  onChange={e => setRateForm(f => ({ ...f, note: e.target.value }))}
                  placeholder="e.g. Annual raise, promotion"
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/30 focus:border-[#FF6B35]"
                />
              </div>

              {rateError && <p className="text-xs text-red-500">{rateError}</p>}

              <div className="flex gap-3 pt-1">
                <button onClick={() => setShowRateModal(false)} className="flex-1 py-2.5 text-sm border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 cursor-pointer">
                  Cancel
                </button>
                <button
                  onClick={saveRate}
                  disabled={rateSaving}
                  className="flex-1 py-2.5 text-sm bg-[#FF6B35] text-white rounded-lg hover:bg-[#e55a27] disabled:opacity-50 cursor-pointer"
                >
                  {rateSaving ? 'Saving…' : 'Save Rate'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
