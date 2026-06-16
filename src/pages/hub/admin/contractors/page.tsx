import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from '@/pages/hub/components/AdminLayout';
import { supabase } from '@/lib/supabase';
import { HubUser } from '@/lib/types';
import { useDemo } from '@/contexts/DemoContext';
import { DEMO_CONTRACTORS } from '@/lib/demoData';
import AddContractorModal from './AddContractorModal';

type ConfirmAction = { type: 'deactivate' | 'delete' | 'resend-invite' | 'reset-password'; contractor: HubUser };
type Toast = { id: number; message: string; type: 'success' | 'error' };

export default function ContractorsPage() {
  const navigate = useNavigate();
  const { isDemo } = useDemo();
  const [contractors, setContractors] = useState<HubUser[]>([]);
  const [filtered, setFiltered] = useState<HubUser[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [deptFilter, setDeptFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmAction | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const menuRef = useRef<HTMLDivElement>(null);
  const toastCounter = useRef(0);

  const showToast = (message: string, type: 'success' | 'error') => {
    const id = ++toastCounter.current;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  };

  const fetchContractors = async () => {
    const { data } = await supabase
      .from('hub_users')
      .select('*')
      .in('role', ['contractor', 'admin'])
      .neq('is_developer', true)
      .order('full_name');
    setContractors((data as HubUser[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    if (isDemo) {
      setContractors(DEMO_CONTRACTORS);
      setFiltered(DEMO_CONTRACTORS);
      setLoading(false);
      return;
    }
    fetchContractors();
  }, [isDemo]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleDeactivate = async (c: HubUser) => {
    setActionLoading(true);
    await supabase.from('hub_users').update({ status: 'inactive' }).eq('id', c.id);
    setActionLoading(false);
    setConfirm(null);
    fetchContractors();
  };

  const handleDelete = async (c: HubUser) => {
    setActionLoading(true);
    const { data, error } = await supabase.functions.invoke('delete-employee', {
      body: { user_id: c.id },
    });
    if (error || data?.error) {
      // Fallback: delete from hub_users directly
      await supabase.from('hub_users').delete().eq('id', c.id);
    }
    setActionLoading(false);
    setConfirm(null);
    fetchContractors();
  };

  const departments = Array.from(
    new Set(contractors.map(c => c.department).filter(Boolean) as string[])
  ).sort();

  useEffect(() => {
    let result = contractors;
    if (statusFilter !== 'all') result = result.filter((c) => c.status === statusFilter);
    if (deptFilter !== 'all') result = result.filter((c) => c.department === deptFilter);
    if (search) result = result.filter((c) =>
      c.full_name.toLowerCase().includes(search.toLowerCase()) ||
      c.email.toLowerCase().includes(search.toLowerCase()) ||
      c.department?.toLowerCase().includes(search.toLowerCase()) ||
      c.slack_username?.toLowerCase().includes(search.toLowerCase())
    );
    setFiltered(result);
  }, [contractors, search, statusFilter, deptFilter]);

  const getCompleteness = (c: HubUser) => {
    const fields = [
      c.avatar_url, c.phone, c.birthday, c.department,
      c.shift_start, c.shift_end, c.work_days?.length,
      c.bank_account_number, c.emergency_contact, c.contract_expiry_date,
    ];
    const filled = fields.filter(Boolean).length;
    return Math.round((filled / fields.length) * 100);
  };

  const departmentColors: Record<string, string> = {
    Creative: 'bg-pink-100 text-pink-700',
    'Media Buying': 'bg-slate-100 text-[#1c2b3a]',
    Content: 'bg-amber-100 text-amber-700',
    'Social Media': 'bg-sky-100 text-sky-700',
    Tech: 'bg-slate-100 text-[#1c2b3a]',
    'Account Management': 'bg-teal-100 text-teal-700',
    SEO: 'bg-green-100 text-green-700',
  };

  return (
    <AdminLayout
      title="Employees"
      actions={
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 bg-[#1c2b3a] text-white text-sm px-3 py-2 rounded-lg hover:bg-[#0f1c28] transition-colors cursor-pointer whitespace-nowrap"
        >
          <i className="ri-user-add-line text-sm"></i>
          Add Employee
        </button>
      }
    >
      <div className="space-y-4">

        {/* Branded header */}
        <div className="bg-[#111827] rounded-2xl px-5 py-4 text-white">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <div className="flex -space-x-1.5">
                  {contractors.filter(c => c.status === 'active' && c.avatar_url).slice(0, 4).map(c => (
                    <div key={c.id} className="w-7 h-7 rounded-full overflow-hidden border-2 border-[#111827] flex-shrink-0">
                      <img src={c.avatar_url!} alt={c.full_name} className="w-full h-full object-cover" style={{ objectPosition: 'center 15%', transform: 'scale(1.8)', transformOrigin: 'center' }} />
                    </div>
                  ))}
                </div>
                <p className="text-white/50 text-xs">{contractors.filter(c => c.status === 'active').length} active</p>
              </div>
              <div className="flex items-center gap-4 flex-wrap mt-2">
                {Object.entries(
                  contractors.filter(c => c.status === 'active').reduce((acc: Record<string, number>, c) => {
                    if (c.department) acc[c.department] = (acc[c.department] || 0) + 1;
                    return acc;
                  }, {})
                ).slice(0, 4).map(([dept, count]) => (
                  <div key={dept} className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#1c2b3a] flex-shrink-0"></span>
                    <span className="text-white/50 text-xs">{dept}</span>
                    <span className="text-white/30 text-xs">{count}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex gap-4 sm:gap-6">
              {[
                { label: 'Total', value: contractors.length },
                { label: 'Active', value: contractors.filter(c => c.status === 'active').length },
                { label: 'Inactive', value: contractors.filter(c => c.status === 'inactive').length },
              ].map(s => (
                <div key={s.label} className="text-center sm:text-right">
                  <p className="text-xl font-bold text-white">{s.value}</p>
                  <p className="text-white/40 text-[11px] uppercase tracking-wide">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Search + filter */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, email, department..."
              className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a] bg-white"
            />
          </div>
          <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
            {(['all', 'active', 'inactive'] as const).map((s) => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap capitalize ${
                  statusFilter === s ? 'bg-white text-[#111827] shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}>
                {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Department filter */}
        {departments.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setDeptFilter('all')}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all cursor-pointer ${deptFilter === 'all' ? 'bg-[#111827] text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
            >
              All Departments
            </button>
            {departments.map(dept => (
              <button
                key={dept}
                onClick={() => setDeptFilter(deptFilter === dept ? 'all' : dept)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all cursor-pointer ${
                  deptFilter === dept
                    ? `${departmentColors[dept] || 'bg-gray-200 text-gray-700'} ring-2 ring-offset-1 ring-current`
                    : `${departmentColors[dept] || 'bg-gray-100 text-gray-600'} opacity-60 hover:opacity-100`
                }`}
              >
                {dept}
                <span className="ml-1.5 opacity-60">
                  {contractors.filter(c => c.department === dept && (statusFilter === 'all' || c.status === statusFilter)).length}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Contractor list */}
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <i className="ri-loader-4-line animate-spin text-xl text-gray-400"></i>
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white border border-gray-100 rounded-xl p-10 text-center">
            <i className="ri-user-search-line text-3xl text-gray-200 block mb-2"></i>
            <p className="text-sm text-gray-400">No employees found</p>
          </div>
        ) : (
          <div className="bg-white border border-gray-100 rounded-xl divide-y divide-gray-50">
            {filtered.map((c) => {
              const rateStr = c.payment_type === 'project_based' && c.project_percentage
                ? `${c.project_percentage}% per project`
                : (c.payment_type === 'fixed' || c.payment_type === 'fixed_flexible') && c.monthly_rate
                ? `₱${c.monthly_rate.toLocaleString('en-PH', { maximumFractionDigits: 0 })}/mo`
                : c.hourly_rate
                ? `${c.currency === 'USD' ? '$' : '₱'}${c.hourly_rate}/hr${c.currency === 'USD' ? ' USD' : ''}`
                : '—';

              return (
                <div key={c.id} className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50/60 transition-colors cursor-pointer group"
                  onClick={() => navigate(`/hub/admin/employees/${c.id}`)}>

                  {/* Avatar */}
                  <div className="flex-shrink-0 relative">
                    {c.avatar_url ? (
                      <div className="w-10 h-10 rounded-full overflow-hidden">
                        <img src={c.avatar_url} alt={c.full_name} className="w-full h-full object-cover" style={{ objectPosition: 'center 15%', transform: 'scale(1.8)', transformOrigin: 'center' }} />
                      </div>
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-[#1c2b3a] flex items-center justify-center">
                        <span className="text-white text-sm font-bold">{c.full_name.charAt(0).toUpperCase()}</span>
                      </div>
                    )}
                  </div>

                  {/* Name + email */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-[#111827] truncate">{c.full_name}</p>
                      {!c.onboarding_completed && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-full font-medium flex-shrink-0">pending invite</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 truncate">{c.email}</p>
                  </div>

                  {/* Dept + rate */}
                  <div className="hidden sm:flex flex-col items-start gap-1 w-[150px] flex-shrink-0">
                    {c.department && (
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${departmentColors[c.department] || 'bg-gray-100 text-gray-600'}`}>
                        {c.department}
                      </span>
                    )}
                    <span className="text-xs text-gray-500">{rateStr}</span>
                  </div>

                  {/* Slack */}
                  <div className="hidden md:flex items-center gap-1.5 w-[140px] flex-shrink-0">
                    {c.slack_username ? (
                      <>
                        <i className="ri-slack-line text-gray-300 text-sm flex-shrink-0"></i>
                        <span className="text-xs text-gray-500 truncate">{c.slack_username}</span>
                      </>
                    ) : (
                      <span className="text-xs text-gray-300">—</span>
                    )}
                  </div>

                  {/* Start date */}
                  <div className="hidden lg:block text-xs text-gray-400 whitespace-nowrap w-[100px] flex-shrink-0 text-right">
                    {c.start_date ? new Date(c.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                  </div>

                  {/* Profile completeness */}
                  {(() => {
                    const pct = getCompleteness(c);
                    const color = pct >= 80 ? 'bg-emerald-100 text-emerald-700' : pct >= 50 ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700';
                    return (
                      <div className="hidden xl:flex flex-col items-end gap-0.5 w-[56px] flex-shrink-0" title={`Profile ${pct}% complete`}>
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${color}`}>{pct}%</span>
                        <div className="w-10 h-1 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${pct >= 80 ? 'bg-emerald-400' : pct >= 50 ? 'bg-amber-400' : 'bg-rose-400'}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })()}

                  {/* Actions */}
                  <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                    <div className="relative" ref={openMenu === c.id ? menuRef : null}>
                      <button onClick={() => setOpenMenu(openMenu === c.id ? null : c.id)}
                        className="w-8 h-8 flex items-center justify-center text-gray-300 hover:text-gray-500 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer">
                        <i className="ri-more-2-fill text-sm"></i>
                      </button>
                      {openMenu === c.id && (
                        <div className="absolute right-0 bottom-full mb-1 z-20 w-48 bg-white border border-gray-100 rounded-xl shadow-lg py-1 text-sm">
                          <button onClick={() => navigate(`/hub/admin/employees/${c.id}`)}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-gray-700 hover:bg-gray-50 cursor-pointer">
                            <i className="ri-eye-line text-gray-400"></i> View profile
                          </button>
                          {!c.onboarding_completed && (
                            <>
                              <div className="border-t border-gray-50 my-1" />
                              <button onClick={() => { setOpenMenu(null); setConfirm({ type: 'resend-invite', contractor: c }); }}
                                className="w-full flex items-center gap-2.5 px-3 py-2 text-sky-600 hover:bg-sky-50 cursor-pointer">
                                <i className="ri-mail-send-line"></i> Resend invite
                              </button>
                            </>
                          )}
                          <div className="border-t border-gray-50 my-1" />
                          {c.status === 'active' ? (
                            <button onClick={() => { setOpenMenu(null); setConfirm({ type: 'deactivate', contractor: c }); }}
                              className="w-full flex items-center gap-2.5 px-3 py-2 text-amber-600 hover:bg-amber-50 cursor-pointer">
                              <i className="ri-user-forbid-line"></i> Deactivate
                            </button>
                          ) : (
                            <button onClick={async () => { setOpenMenu(null); await supabase.from('hub_users').update({ status: 'active' }).eq('id', c.id); fetchContractors(); }}
                              className="w-full flex items-center gap-2.5 px-3 py-2 text-emerald-600 hover:bg-emerald-50 cursor-pointer">
                              <i className="ri-user-follow-line"></i> Reactivate
                            </button>
                          )}
                          {c.status === 'active' && c.onboarding_completed && (
                            <>
                              <div className="border-t border-gray-50 my-1" />
                              <button onClick={() => { setOpenMenu(null); setConfirm({ type: 'reset-password', contractor: c }); }}
                                className="w-full flex items-center gap-2.5 px-3 py-2 text-[#1c2b3a] hover:bg-slate-50 cursor-pointer">
                                <i className="ri-lock-password-line"></i> Send password reset
                              </button>
                            </>
                          )}
                          <div className="border-t border-gray-50 my-1" />
                          <button onClick={() => { setOpenMenu(null); setConfirm({ type: 'delete', contractor: c }); }}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-rose-600 hover:bg-rose-50 cursor-pointer">
                            <i className="ri-delete-bin-line"></i> Remove permanently
                          </button>
                        </div>
                      )}
                    </div>
                    <button onClick={() => navigate(`/hub/admin/employees/${c.id}`)}
                      className="w-8 h-8 flex items-center justify-center text-gray-300 hover:text-[#1c2b3a] hover:bg-slate-50 rounded-lg transition-colors cursor-pointer opacity-0 group-hover:opacity-100">
                      <i className="ri-arrow-right-s-line text-lg"></i>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <p className="text-xs text-gray-400 pb-1">{filtered.length} employee{filtered.length !== 1 ? 's' : ''} shown</p>
      </div>

      {showAdd && (
        <AddContractorModal
          onClose={() => setShowAdd(false)}
          onSuccess={() => { setShowAdd(false); fetchContractors(); }}
        />
      )}

      {/* Toast notifications */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
          <div key={t.id} className={`flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-lg text-sm font-medium text-white pointer-events-auto transition-all ${t.type === 'success' ? 'bg-emerald-600' : 'bg-rose-600'}`}>
            <i className={t.type === 'success' ? 'ri-checkbox-circle-line' : 'ri-error-warning-line'}></i>
            {t.message}
          </div>
        ))}
      </div>

      {confirm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 sm:p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 space-y-4">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto ${
              confirm.type === 'delete' ? 'bg-rose-100' : confirm.type === 'resend-invite' ? 'bg-sky-100' : confirm.type === 'reset-password' ? 'bg-slate-100' : 'bg-amber-100'
            }`}>
              <i className={`text-xl ${
                confirm.type === 'delete' ? 'ri-delete-bin-line text-rose-600' : confirm.type === 'resend-invite' ? 'ri-mail-send-line text-sky-600' : confirm.type === 'reset-password' ? 'ri-lock-password-line text-[#1c2b3a]' : 'ri-user-forbid-line text-amber-600'
              }`}></i>
            </div>
            <div className="text-center space-y-1">
              <h3 className="font-semibold text-[#111827]">
                {confirm.type === 'delete' ? 'Remove employee?' : confirm.type === 'resend-invite' ? 'Resend invite?' : confirm.type === 'reset-password' ? 'Send password reset?' : 'Deactivate employee?'}
              </h3>
              <p className="text-sm text-gray-500">
                {confirm.type === 'delete'
                  ? <>This will permanently delete <strong>{confirm.contractor.full_name}</strong> and all their data. This cannot be undone.</>
                  : confirm.type === 'resend-invite'
                  ? <>A fresh invite link will be sent to <strong>{confirm.contractor.email}</strong>. Any previous link will no longer work.</>
                  : confirm.type === 'reset-password'
                  ? <>A password reset link will be sent to <strong>{confirm.contractor.email}</strong>. They can use it to set a new password.</>
                  : <>This will mark <strong>{confirm.contractor.full_name}</strong> as inactive. They won't be able to log in. You can reactivate them later.</>
                }
              </p>
            </div>
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setConfirm(null)}
                disabled={actionLoading || resendingId !== null}
                className="flex-1 py-2.5 text-sm border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (confirm.type === 'resend-invite') {
                    setResendingId(confirm.contractor.id);
                    try {
                      const { data, error } = await supabase.functions.invoke('resend-invite', {
                        body: { contractor_id: confirm.contractor.id },
                      });
                      if (error || data?.error) {
                        showToast(data?.error ?? 'Failed to resend invite', 'error');
                      } else {
                        showToast(`Invite resent to ${confirm.contractor.email}`, 'success');
                      }
                    } catch {
                      showToast('Failed to resend invite', 'error');
                    } finally {
                      setResendingId(null);
                      setConfirm(null);
                    }
                  } else if (confirm.type === 'reset-password') {
                    setResendingId(confirm.contractor.id);
                    try {
                      const { data, error } = await supabase.functions.invoke('resend-invite', {
                        body: { contractor_id: confirm.contractor.id },
                      });
                      if (error || data?.error) {
                        showToast(data?.error ?? 'Failed to send reset link', 'error');
                      } else {
                        showToast(`Password reset sent to ${confirm.contractor.email}`, 'success');
                      }
                    } catch {
                      showToast('Failed to send reset link', 'error');
                    } finally {
                      setResendingId(null);
                      setConfirm(null);
                    }
                  } else if (confirm.type === 'delete') {
                    handleDelete(confirm.contractor);
                  } else {
                    handleDeactivate(confirm.contractor);
                  }
                }}
                disabled={actionLoading || resendingId !== null}
                className={`flex-1 py-2.5 text-sm text-white rounded-lg cursor-pointer disabled:opacity-60 ${
                  confirm.type === 'delete' ? 'bg-rose-600 hover:bg-rose-700' : confirm.type === 'resend-invite' ? 'bg-sky-600 hover:bg-sky-700' : confirm.type === 'reset-password' ? 'bg-violet-600 hover:bg-[#0f1c28]' : 'bg-amber-500 hover:bg-amber-600'
                }`}
              >
                {(actionLoading || resendingId !== null) ? <i className="ri-loader-4-line animate-spin"></i> : confirm.type === 'delete' ? 'Remove' : confirm.type === 'resend-invite' ? 'Send Invite' : confirm.type === 'reset-password' ? 'Send Reset Link' : 'Deactivate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}