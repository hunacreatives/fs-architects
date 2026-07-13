import { useEffect, useState } from 'react';
import AdminLayout from '@/pages/hub/components/AdminLayout';
import { useAuth } from '@/contexts/AuthContext';
import HubAvatar from '@/pages/hub/components/HubAvatar';
import { supabase } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';
import {
  APPRAISAL_FACTORS, PERFORMANCE_LEVEL_BANDS, APPRAISAL_STATUS_META,
  Appraisal, AppraisalRatings, emptyRatings, factorScore, computeScores, belowSatisfactoryFactors, bandForLevel,
} from '@/lib/appraisalForm';
import { printAppraisal } from '@/lib/appraisalPrint';

interface Employee { id: string; full_name: string; avatar_url: string | null; department: string | null; }

const APPRAISAL_SELECT = '*, employee:hub_users!employee_id(full_name, avatar_url, department), rater:hub_users!rater_id(full_name), hr_reviewer:hub_users!hr_reviewer_id(full_name)';

const LEVEL_COLORS: Record<number, string> = {
  1: 'bg-rose-600 text-white border-rose-600',
  2: 'bg-orange-500 text-white border-orange-500',
  3: 'bg-amber-500 text-white border-amber-500',
  4: 'bg-sky-600 text-white border-sky-600',
  5: 'bg-emerald-600 text-white border-emerald-600',
};

const emptyForm = {
  employee_id: '',
  job_title: '',
  period_covered: '',
  month_appraised: new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
  ratings: emptyRatings(),
  comments_recommendations: '',
  one_on_one_at: '',
  decision: '' as '' | 'regularization' | 'end_of_contract',
  below_satisfactory_action: '' as '' | 'monitoring' | 'pip',
};

function ScoreChip({ a }: { a: Appraisal }) {
  if (a.performance_level == null) return <span className="text-gray-300">—</span>;
  const pl = Number(a.performance_level);
  const chip = pl >= 4 ? 'bg-emerald-50 text-emerald-700' : pl >= 3 ? 'bg-sky-50 text-sky-700' : pl >= 2 ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700';
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${chip}`}>
      {Number(a.final_rating_pct).toFixed(1)}% · PL {pl.toFixed(1)}
    </span>
  );
}

export default function AdminPerformancePage() {
  const { hubUser } = useAuth();
  // Only the owner (Fretz) rates and sends appraisals; HR (Francis Yu) only
  // completes the HR-review step; a plain admin can view and print, nothing else.
  const isOwner = hubUser?.role === 'owner';
  const isHr = hubUser?.role === 'hr';
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [appraisals, setAppraisals] = useState<Appraisal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  // Preserves the row's current status across a save — Fretz may now edit an
  // appraisal that's already been sent (e.g. live-adjusting it mid-meeting),
  // and saving must not silently revert it back to draft.
  const [editingStatus, setEditingStatus] = useState<Appraisal['status']>('draft');
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<Appraisal | null>(null);
  const [filterEmployee, setFilterEmployee] = useState('');
  const [showRubric, setShowRubric] = useState(false);
  const [hrComments, setHrComments] = useState('');

  const fetchAll = async () => {
    setLoading(true);
    const [eRes, aRes] = await Promise.all([
      supabase.from('hub_users').select('id, full_name, avatar_url, department').eq('status', 'active').in('role', ['contractor', 'admin']).neq('is_developer', true).order('full_name'),
      supabase.from('hub_appraisals').select(APPRAISAL_SELECT).order('created_at', { ascending: false }),
    ]);
    setEmployees((eRes.data as Employee[]) ?? []);
    setAppraisals((aRes.data as Appraisal[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const setF = (v: Partial<typeof emptyForm>) => setForm(prev => ({ ...prev, ...v }));

  const setLevel = (factorKey: string, idx: number, level: number) => {
    setForm(prev => {
      const ratings: AppraisalRatings = { ...prev.ratings, [factorKey]: { ...prev.ratings[factorKey], levels: [...prev.ratings[factorKey].levels] } };
      ratings[factorKey].levels[idx] = ratings[factorKey].levels[idx] === level ? null : level;
      return { ...prev, ratings };
    });
  };

  const setRemarks = (factorKey: string, remarks: string) => {
    setForm(prev => ({ ...prev, ratings: { ...prev.ratings, [factorKey]: { ...prev.ratings[factorKey], remarks } } }));
  };

  const scores = computeScores(form.ratings);
  const belowSat = belowSatisfactoryFactors(form.ratings);

  // Only ever writes status: 'draft' — the employee never sees anything at
  // this stage. Sending happens later, as its own explicit action, only
  // after Fretz has actually held the 1-on-1 discussion in person.
  const save = async () => {
    if (!form.employee_id || !form.period_covered.trim() || !form.month_appraised.trim()) return;
    setSaving(true);

    const payload = {
      employee_id: form.employee_id,
      rater_id: hubUser?.id,
      job_title: form.job_title.trim() || null,
      period_covered: form.period_covered.trim(),
      month_appraised: form.month_appraised.trim(),
      status: editingId ? editingStatus : 'draft',
      ratings: form.ratings,
      total_score: scores.totalScore,
      final_rating_pct: scores.finalPct,
      performance_level: scores.performanceLevel,
      comments_recommendations: form.comments_recommendations.trim() || null,
      one_on_one_at: form.one_on_one_at ? new Date(form.one_on_one_at).toISOString() : null,
      decision: form.decision || null,
      below_satisfactory_action: belowSat.length > 0 ? (form.below_satisfactory_action || null) : null,
      updated_at: new Date().toISOString(),
    };

    const { error } = editingId
      ? await supabase.from('hub_appraisals').update(payload).eq('id', editingId)
      : await supabase.from('hub_appraisals').insert(payload);

    if (error) {
      alert(`Could not save appraisal: ${error.message}`);
      setSaving(false);
      return;
    }

    const name = employees.find(e => e.id === form.employee_id)?.full_name || 'employee';
    logAudit({ actor_id: hubUser?.id, actor_name: hubUser?.full_name, action: editingId ? 'update' : 'create', entity_type: 'appraisal', description: `${editingId ? 'Updated' : 'Drafted'} appraisal for ${name} — ${form.month_appraised.trim()}` });

    setSaving(false);
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
    fetchAll();
  };

  // Fretz's step 4: after actually holding the 1-on-1 discussion in person,
  // he confirms it here — this is what finally makes the appraisal visible
  // to the employee (in-app + email, the latter fired by a DB trigger on the
  // status change) and moves it into their acknowledgment queue.
  const confirmDiscussedAndSend = async (a: Appraisal) => {
    const aScores = computeScores(a.ratings);
    const aBelowSat = belowSatisfactoryFactors(a.ratings);
    if (!aScores.complete) {
      alert('All 24 criteria need a rating before this can be sent — edit the draft first.');
      return;
    }
    if (aBelowSat.length > 0 && !a.below_satisfactory_action) {
      alert('One or more factors are below satisfactory — edit the draft and choose Monitoring or a Performance Improvement Plan first.');
      return;
    }
    if (!a.one_on_one_at) {
      alert('Schedule a 1-on-1 discussion date first — edit the draft to set it.');
      return;
    }
    if (!window.confirm(`Confirm you've discussed this appraisal with ${a.employee?.full_name} in person? This sends it to them to acknowledge.`)) return;

    setSaving(true);
    const { error } = await supabase.from('hub_appraisals').update({
      status: 'awaiting_employee',
      updated_at: new Date().toISOString(),
    }).eq('id', a.id).eq('status', 'draft');

    if (error) {
      alert(`Could not send appraisal: ${error.message}`);
      setSaving(false);
      return;
    }

    await supabase.from('hub_notifications').insert({
      user_id: a.employee_id,
      type: 'appraisal',
      title: 'Performance appraisal ready for your review',
      body: `Your appraisal for ${a.month_appraised} is ready. Please read it, add any comments, and acknowledge.`,
      link: '/hub/employee/performance',
      read: false,
    });
    logAudit({ actor_id: hubUser?.id, actor_name: hubUser?.full_name, action: 'update', entity_type: 'appraisal', description: `Confirmed 1-on-1 discussed and sent appraisal for ${a.employee?.full_name} — ${a.month_appraised}` });

    setSaving(false);
    setSelected(null);
    fetchAll();
  };

  const startEdit = (a: Appraisal) => {
    const ratings = emptyRatings();
    for (const f of APPRAISAL_FACTORS) {
      if (a.ratings?.[f.key]) ratings[f.key] = { levels: f.criteria.map((_, i) => a.ratings[f.key].levels?.[i] ?? null), remarks: a.ratings[f.key].remarks ?? '' };
    }
    setForm({
      employee_id: a.employee_id,
      job_title: a.job_title ?? '',
      period_covered: a.period_covered,
      month_appraised: a.month_appraised,
      ratings,
      comments_recommendations: a.comments_recommendations ?? '',
      one_on_one_at: a.one_on_one_at ? new Date(a.one_on_one_at).toISOString().slice(0, 16) : '',
      decision: a.decision ?? '',
      below_satisfactory_action: a.below_satisfactory_action ?? '',
    });
    setEditingId(a.id);
    setEditingStatus(a.status);
    setSelected(null);
    setShowForm(true);
  };

  const completeHrReview = async (a: Appraisal) => {
    setSaving(true);
    const { error } = await supabase.from('hub_appraisals').update({
      status: 'completed',
      hr_reviewer_id: hubUser?.id,
      hr_comments: hrComments.trim() || null,
      hr_reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', a.id).eq('status', 'awaiting_hr');
    if (!error) {
      await supabase.from('hub_notifications').insert({
        user_id: a.employee_id,
        type: 'appraisal',
        title: 'Performance appraisal completed',
        body: `Your appraisal for ${a.month_appraised} has been reviewed by HR and is now final.`,
        link: '/hub/employee/performance',
        read: false,
      });
      logAudit({ actor_id: hubUser?.id, actor_name: hubUser?.full_name, action: 'update', entity_type: 'appraisal', description: `Completed HR review of appraisal for ${a.employee?.full_name} — ${a.month_appraised}` });
    }
    setSaving(false);
    setHrComments('');
    setSelected(null);
    fetchAll();
  };

  const handleDelete = async (a: Appraisal) => {
    if (!window.confirm(`Delete this appraisal for ${a.employee?.full_name}? This cannot be undone.`)) return;
    await supabase.from('hub_appraisals').delete().eq('id', a.id);
    logAudit({ actor_id: hubUser?.id, actor_name: hubUser?.full_name, action: 'delete', entity_type: 'appraisal', description: `Deleted appraisal for ${a.employee?.full_name} — ${a.month_appraised}` });
    setSelected(null);
    fetchAll();
  };

  const filtered = filterEmployee ? appraisals.filter(a => a.employee_id === filterEmployee) : appraisals;

  return (
    <AdminLayout title="Performance Appraisals">
      <div className="space-y-4">

        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <select
              value={filterEmployee}
              onChange={e => setFilterEmployee(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a] bg-white"
            >
              <option value="">All employees</option>
              {employees.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
            </select>
            <span className="text-xs text-gray-400">{filtered.length} appraisal{filtered.length !== 1 ? 's' : ''}</span>
          </div>
          {isOwner && (
            <button
              onClick={() => { setForm(emptyForm); setEditingId(null); setEditingStatus('draft'); setShowForm(true); }}
              className="flex items-center gap-2 px-4 py-2 bg-[#1c2b3a] text-white rounded-xl text-sm font-medium hover:bg-[#0f1c28] cursor-pointer transition-colors"
            >
              <i className="ri-add-line"></i>
              New Appraisal
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><i className="ri-loader-4-line animate-spin text-2xl text-gray-300"></i></div>
        ) : filtered.length === 0 ? (
          <div className="bg-white border border-gray-100 rounded-xl p-12 text-center">
            <i className="ri-medal-line text-4xl text-gray-200 mb-3 block"></i>
            <p className="text-sm font-medium text-gray-500">No appraisals yet</p>
            <p className="text-xs text-gray-400 mt-1">Start a new appraisal using the official FS Architects form</p>
          </div>
        ) : (
          <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    {['Employee', 'Month Appraised', 'Period Covered', 'Rating', 'Status', 'Rater', ''].map(h => (
                      <th key={h} className="text-left text-xs font-medium text-gray-400 px-4 py-2.5 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map(a => (
                    <tr key={a.id} className="hover:bg-gray-50/50 transition-colors cursor-pointer" onClick={() => { setSelected(a); setHrComments(''); }}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <HubAvatar fullName={a.employee?.full_name || '?'} avatarUrl={a.employee?.avatar_url || null} size="w-8 h-8" />
                          <div>
                            <p className="text-sm font-medium text-[#111827]">{a.employee?.full_name}</p>
                            {a.job_title && <p className="text-[11px] text-gray-400">{a.job_title}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">{a.month_appraised}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-500">{a.period_covered}</td>
                      <td className="px-4 py-3 whitespace-nowrap"><ScoreChip a={a} /></td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${APPRAISAL_STATUS_META[a.status].chip}`}>{APPRAISAL_STATUS_META[a.status].label}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{a.rater?.full_name || '—'}</td>
                      <td className="px-4 py-3">
                        {isOwner && (a.status === 'draft' || a.status === 'awaiting_employee') && (
                          <button onClick={e => { e.stopPropagation(); startEdit(a); }}
                            className="text-gray-300 hover:text-[#1c2b3a] transition-colors cursor-pointer">
                            <i className="ri-pencil-line text-sm"></i>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* New/Edit appraisal modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-3xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
              <div>
                <h2 className="font-semibold text-[#111827]">{editingId ? 'Edit Appraisal' : 'New Appraisal'}</h2>
                <p className="text-xs text-gray-400 mt-0.5">FS Architects Appraisal Form</p>
              </div>
              <button onClick={() => { setShowForm(false); setEditingId(null); }} className="text-gray-400 hover:text-gray-600 cursor-pointer">
                <i className="ri-close-line text-lg"></i>
              </button>
            </div>

            <div className="p-5 space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-700">Employee *</label>
                  <select required value={form.employee_id} onChange={e => setF({ employee_id: e.target.value })}
                    className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a] bg-white">
                    <option value="">Select employee...</option>
                    {employees.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-700">Job Title</label>
                  <input type="text" value={form.job_title} onChange={e => setF({ job_title: e.target.value })}
                    placeholder="e.g. Junior Architect"
                    className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-700">Period Covered *</label>
                  <input type="text" required value={form.period_covered} onChange={e => setF({ period_covered: e.target.value })}
                    placeholder="e.g. January – June 2026"
                    className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-700">Month Appraised *</label>
                  <input type="text" required value={form.month_appraised} onChange={e => setF({ month_appraised: e.target.value })}
                    placeholder="e.g. July 2026"
                    className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]" />
                </div>
              </div>

              <button type="button" onClick={() => setShowRubric(!showRubric)}
                className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 rounded-lg text-sm text-gray-600 hover:bg-gray-100 cursor-pointer">
                <span className="font-medium">Performance level guide (1–5)</span>
                <i className={`ri-arrow-${showRubric ? 'up' : 'down'}-s-line`}></i>
              </button>
              {showRubric && (
                <div className="space-y-2 -mt-3">
                  {PERFORMANCE_LEVEL_BANDS.map(b => (
                    <div key={b.level} className="flex gap-3 bg-gray-50 rounded-lg p-3">
                      <span className={`w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-xs font-bold ${LEVEL_COLORS[b.level]}`}>{b.level}</span>
                      <div>
                        <p className="text-xs font-semibold text-[#111827]">{b.label} <span className="text-gray-400 font-normal">({b.range})</span></p>
                        <p className="text-xs text-gray-500 mt-0.5">{b.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Factor grid */}
              <div className="space-y-4">
                {APPRAISAL_FACTORS.map(f => {
                  const score = factorScore(form.ratings[f.key]);
                  return (
                    <div key={f.key} className="border border-gray-100 rounded-xl overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50">
                        <p className="text-sm font-semibold text-[#111827]">{f.label}</p>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${score == null ? 'bg-gray-100 text-gray-400' : score < 3 ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>
                          {score == null ? '—' : `Avg ${score.toFixed(2)} / 5`}
                        </span>
                      </div>
                      <div className="divide-y divide-gray-50">
                        {f.criteria.map((c, i) => (
                          <div key={i} className="flex flex-col sm:flex-row sm:items-center gap-2 px-4 py-3">
                            <p className="text-xs text-gray-600 flex-1">{c}</p>
                            <div className="flex gap-1.5 shrink-0">
                              {[1, 2, 3, 4, 5].map(lv => (
                                <button key={lv} type="button" onClick={() => setLevel(f.key, i, lv)} title={`${lv} — ${PERFORMANCE_LEVEL_BANDS.find(b => b.level === lv)?.label ?? ''}`}
                                  className={`w-8 h-8 rounded-lg border text-xs font-semibold cursor-pointer transition-colors ${form.ratings[f.key].levels[i] === lv ? LEVEL_COLORS[lv] : 'border-gray-200 text-gray-400 hover:border-gray-300'}`}>
                                  {lv}
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="px-4 pb-3">
                        <input type="text" value={form.ratings[f.key].remarks} onChange={e => setRemarks(f.key, e.target.value)}
                          placeholder="Remarks (optional)"
                          className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]" />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Live score */}
              <div className="bg-[#1c2b3a] text-white rounded-xl p-4 flex flex-wrap items-center gap-x-8 gap-y-2">
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-white/50">Total Score</p>
                  <p className="text-lg font-bold">{scores.totalScore != null ? `${scores.totalScore.toFixed(2)} / 40` : '—'}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-white/50">Final Rating (× 2.5)</p>
                  <p className="text-lg font-bold">{scores.finalPct != null ? `${scores.finalPct.toFixed(1)}%` : '—'}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-white/50">Performance Level</p>
                  <p className="text-lg font-bold">{scores.performanceLevel != null ? `${scores.performanceLevel.toFixed(1)} / 5 · ${scores.band?.label}` : '—'}</p>
                </div>
                {!scores.complete && <p className="text-xs text-white/60 w-full">Rate all 24 criteria to finalize the score.</p>}
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-700">Schedule 1-on-1 Discussion *</label>
                <input type="datetime-local" value={form.one_on_one_at} onChange={e => setF({ one_on_one_at: e.target.value })}
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]" />
                <p className="text-[11px] text-gray-400">The employee won't see any of this until you confirm the discussion happened. Set a date so you both know when to meet.</p>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-700">Comments and Recommendations</label>
                <textarea value={form.comments_recommendations} onChange={e => setF({ comments_recommendations: e.target.value })} rows={3}
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a] resize-none" />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-700">Recommendation</label>
                <div className="flex gap-2">
                  {([
                    { value: 'regularization', label: 'For Regularization' },
                    { value: 'end_of_contract', label: 'For End of Contract' },
                    { value: '', label: 'Not Applicable' },
                  ] as const).map(opt => (
                    <button key={opt.value} type="button" onClick={() => setF({ decision: opt.value })}
                      className={`px-3 py-2 rounded-lg text-xs font-medium border cursor-pointer transition-colors ${form.decision === opt.value ? 'bg-[#1c2b3a] text-white border-[#1c2b3a]' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {belowSat.length > 0 && (
                <div className="bg-rose-50 border border-rose-100 rounded-xl p-4 space-y-2">
                  <p className="text-xs font-semibold text-rose-700">
                    Below satisfactory: {belowSat.map(f => f.label).join(', ')} — choose an action.
                  </p>
                  <div className="flex gap-2">
                    {([
                      { value: 'monitoring', label: 'Subject for Monitoring' },
                      { value: 'pip', label: 'Performance Improvement Plan' },
                    ] as const).map(opt => (
                      <button key={opt.value} type="button" onClick={() => setF({ below_satisfactory_action: opt.value })}
                        className={`px-3 py-2 rounded-lg text-xs font-medium border cursor-pointer transition-colors ${form.below_satisfactory_action === opt.value ? 'bg-rose-600 text-white border-rose-600' : 'border-rose-200 text-rose-600 hover:bg-rose-100'}`}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-3 pt-1">
                <button type="button" onClick={() => { setShowForm(false); setEditingId(null); }}
                  className="flex-1 py-2.5 text-sm border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 cursor-pointer">
                  Cancel
                </button>
                <button type="button" disabled={saving} onClick={() => save()}
                  className="flex-1 py-2.5 text-sm bg-[#1c2b3a] text-white rounded-lg hover:bg-[#0f1c28] disabled:opacity-60 cursor-pointer font-medium">
                  {saving ? 'Saving…' : editingId ? 'Save Changes' : 'Save Draft'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Detail modal */}
      {selected && !showForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
              <div className="flex items-center gap-3">
                <HubAvatar fullName={selected.employee?.full_name || '?'} avatarUrl={selected.employee?.avatar_url || null} size="w-9 h-9" />
                <div>
                  <h2 className="font-semibold text-[#111827]">{selected.employee?.full_name}</h2>
                  <p className="text-xs text-gray-400">{selected.month_appraised} · {selected.period_covered}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${APPRAISAL_STATUS_META[selected.status].chip}`}>{APPRAISAL_STATUS_META[selected.status].label}</span>
                <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 cursor-pointer">
                  <i className="ri-close-line text-lg"></i>
                </button>
              </div>
            </div>

            <div className="p-5 space-y-4">
              <div className="bg-[#1c2b3a] text-white rounded-xl p-4 flex flex-wrap items-center gap-x-8 gap-y-2">
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-white/50">Total Score</p>
                  <p className="text-lg font-bold">{selected.total_score != null ? `${Number(selected.total_score).toFixed(2)} / 40` : '—'}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-white/50">Final Rating</p>
                  <p className="text-lg font-bold">{selected.final_rating_pct != null ? `${Number(selected.final_rating_pct).toFixed(1)}%` : '—'}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-white/50">Performance Level</p>
                  <p className="text-lg font-bold">{selected.performance_level != null ? `${Number(selected.performance_level).toFixed(1)} / 5 · ${bandForLevel(Number(selected.performance_level)).label}` : '—'}</p>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-[11px] text-gray-400">Each factor below is scored by averaging its 3 criteria, rated 1 (poor) to 5 (excellent).</p>
                {APPRAISAL_FACTORS.map(f => {
                  const r = selected.ratings?.[f.key];
                  const score = factorScore(r);
                  return (
                    <div key={f.key} className="bg-gray-50 rounded-lg px-4 py-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-[#111827]">{f.label}</p>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${score == null ? 'bg-gray-100 text-gray-400' : score < 3 ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
                          {score == null ? '—' : `Avg ${score.toFixed(2)} / 5`}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <span className="text-[10px] text-gray-400 mr-0.5">Criteria:</span>
                        {(r?.levels ?? []).map((lv, i) => (
                          <span key={i} title={f.criteria[i]} className={`w-6 h-6 rounded flex items-center justify-center text-[11px] font-semibold ${lv != null ? LEVEL_COLORS[lv] : 'bg-gray-100 text-gray-300'}`}>{lv ?? '·'}</span>
                        ))}
                      </div>
                      {r?.remarks && <p className="text-xs text-gray-500 mt-1.5">{r.remarks}</p>}
                    </div>
                  );
                })}
              </div>

              {selected.one_on_one_at && (
                <div className="bg-sky-50 border border-sky-100 rounded-lg p-3 flex items-center gap-2.5">
                  <i className="ri-calendar-event-line text-sky-600"></i>
                  <div>
                    <p className="text-xs font-semibold text-sky-800">1-on-1 Discussion Scheduled</p>
                    <p className="text-xs text-sky-600">{new Date(selected.one_on_one_at).toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}</p>
                  </div>
                </div>
              )}

              {selected.comments_recommendations && (
                <div>
                  <p className="text-xs font-medium text-gray-700 mb-1">Comments and Recommendations</p>
                  <p className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3 whitespace-pre-wrap">{selected.comments_recommendations}</p>
                </div>
              )}

              {selected.decision && (
                <p className="text-sm font-medium text-[#111827]">
                  <i className="ri-checkbox-circle-line text-emerald-600 mr-1"></i>
                  {selected.decision === 'regularization' ? 'For Regularization' : 'For End of Contract'}
                </p>
              )}

              {selected.below_satisfactory_action && (
                <p className="text-sm font-medium text-rose-700 bg-rose-50 rounded-lg p-3">
                  {selected.below_satisfactory_action === 'monitoring' ? 'The employee will be subject for monitoring.' : 'The employee will be subject to a Performance Improvement Plan.'}
                </p>
              )}

              {selected.employee_acknowledged_at && (
                <div>
                  <p className="text-xs font-medium text-gray-700 mb-1">
                    Employee acknowledged {new Date(selected.employee_acknowledged_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                  </p>
                  {selected.employee_comments && <p className="text-sm text-gray-600 bg-sky-50 rounded-lg p-3 whitespace-pre-wrap">{selected.employee_comments}</p>}
                </div>
              )}

              {selected.status === 'awaiting_hr' && isHr && (
                <div className="border border-amber-200 bg-amber-50 rounded-xl p-4 space-y-3">
                  <p className="text-sm font-semibold text-amber-800"><i className="ri-shield-check-line mr-1"></i>HR Review</p>
                  <textarea value={hrComments} onChange={e => setHrComments(e.target.value)} rows={3}
                    placeholder="Reviewer's comments (optional)"
                    className="w-full px-3 py-2.5 text-sm border border-amber-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400/40 bg-white resize-none" />
                  <button disabled={saving} onClick={() => completeHrReview(selected)}
                    className="w-full py-2.5 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-60 cursor-pointer font-medium">
                    {saving ? 'Saving…' : 'Complete HR Review'}
                  </button>
                </div>
              )}
              {selected.status === 'awaiting_hr' && !isHr && (
                <div className="bg-amber-50 rounded-xl p-4">
                  <p className="text-sm font-medium text-amber-800"><i className="ri-shield-check-line mr-1"></i>Awaiting HR review</p>
                </div>
              )}

              {selected.status === 'completed' && (
                <div className="bg-emerald-50 rounded-xl p-4">
                  <p className="text-sm font-medium text-emerald-800">
                    Reviewed by {selected.hr_reviewer?.full_name || 'HR'} · {selected.hr_reviewed_at ? new Date(selected.hr_reviewed_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : ''}
                  </p>
                  {selected.hr_comments && <p className="text-sm text-emerald-900/80 mt-1.5 whitespace-pre-wrap">{selected.hr_comments}</p>}
                </div>
              )}

              {isOwner && selected.status === 'draft' && (
                <button disabled={saving} onClick={() => confirmDiscussedAndSend(selected)}
                  className="w-full py-2.5 text-sm bg-[#1c2b3a] text-white rounded-lg hover:bg-[#0f1c28] disabled:opacity-60 cursor-pointer font-medium flex items-center justify-center gap-1.5">
                  <i className="ri-checkbox-circle-line text-sm"></i>
                  {saving ? 'Sending…' : "Confirm Discussed & Send to Employee"}
                </button>
              )}

              <div className="flex flex-wrap gap-3 pt-1">
                <button onClick={() => printAppraisal(selected)}
                  className="flex-1 py-2.5 text-sm border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 cursor-pointer flex items-center justify-center gap-1.5">
                  <i className="ri-printer-line text-sm"></i> Print Form
                </button>
                {isOwner && (selected.status === 'draft' || selected.status === 'awaiting_employee') && (
                  <button onClick={() => startEdit(selected)}
                    className="flex-1 py-2.5 text-sm border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 cursor-pointer flex items-center justify-center gap-1.5">
                    <i className="ri-pencil-line text-sm"></i> Edit
                  </button>
                )}
                {isOwner && selected.status !== 'completed' && (
                  <button onClick={() => handleDelete(selected)}
                    className="flex-1 py-2.5 text-sm border border-rose-200 rounded-lg text-rose-600 hover:bg-rose-50 cursor-pointer flex items-center justify-center gap-1.5">
                    <i className="ri-delete-bin-line text-sm"></i> Delete
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
