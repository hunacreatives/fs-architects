import { useEffect, useState } from 'react';
import ContractorLayout from '@/pages/hub/components/ContractorLayout';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import {
  APPRAISAL_FACTORS, PERFORMANCE_LEVEL_BANDS, APPRAISAL_STATUS_META,
  Appraisal, factorScore,
} from '@/lib/appraisalForm';
import { printAppraisal } from '@/lib/appraisalPrint';

const LEVEL_COLORS: Record<number, string> = {
  1: 'bg-rose-600 text-white',
  2: 'bg-orange-500 text-white',
  3: 'bg-amber-500 text-white',
  4: 'bg-sky-600 text-white',
  5: 'bg-emerald-600 text-white',
};

export default function EmployeePerformancePage() {
  const { hubUser } = useAuth();
  const [appraisals, setAppraisals] = useState<Appraisal[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Appraisal | null>(null);
  const [comments, setComments] = useState('');
  const [showRubric, setShowRubric] = useState(false);
  const [acknowledging, setAcknowledging] = useState(false);
  const [error, setError] = useState('');

  const fetchAll = async () => {
    if (!hubUser?.id) return;
    setLoading(true);
    const { data } = await supabase
      .from('hub_appraisals')
      .select('*, employee:hub_users!employee_id(full_name, avatar_url), rater:hub_users!rater_id(full_name), hr_reviewer:hub_users!hr_reviewer_id(full_name)')
      .eq('employee_id', hubUser.id)
      .order('created_at', { ascending: false });
    setAppraisals((data as Appraisal[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, [hubUser?.id]);

  const acknowledge = async (a: Appraisal) => {
    setAcknowledging(true);
    setError('');
    const { error: rpcError } = await supabase.rpc('acknowledge_appraisal', { p_id: a.id, p_comments: comments.trim() || null });
    if (rpcError) {
      setError(rpcError.message);
      setAcknowledging(false);
      return;
    }
    setAcknowledging(false);
    setComments('');
    setSelected(null);
    fetchAll();
  };

  return (
    <ContractorLayout title="My Performance">
      <div className="space-y-4 max-w-3xl">
        {loading ? (
          <div className="flex justify-center py-12"><i className="ri-loader-4-line animate-spin text-xl text-gray-400"></i></div>
        ) : appraisals.length === 0 ? (
          <div className="bg-white border border-gray-100 rounded-xl p-10 text-center">
            <i className="ri-medal-line text-3xl text-gray-200 mb-2 block"></i>
            <p className="text-sm font-medium text-gray-500">No appraisals yet</p>
            <p className="text-xs text-gray-400 mt-1">Your performance appraisals will appear here once shared by your immediate head</p>
          </div>
        ) : (
          <div className="space-y-3">
            {appraisals.map(a => (
              <button key={a.id} onClick={() => { setSelected(a); setComments(''); setError(''); }}
                className="w-full text-left bg-white border border-gray-100 rounded-xl p-4 hover:border-gray-200 transition-colors cursor-pointer">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <p className="text-sm font-semibold text-[#111827]">{a.month_appraised}</p>
                    <p className="text-xs text-gray-400 mt-0.5">Period covered: {a.period_covered}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {a.final_rating_pct != null && (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-[#1c2b3a]">
                        {Number(a.final_rating_pct).toFixed(1)}% · PL {Number(a.performance_level).toFixed(1)}
                      </span>
                    )}
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${APPRAISAL_STATUS_META[a.status].chip}`}>
                      {a.status === 'awaiting_employee' ? 'Needs Your Acknowledgment' : APPRAISAL_STATUS_META[a.status].label}
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
              <div>
                <h2 className="font-semibold text-[#111827]">Performance Appraisal — {selected.month_appraised}</h2>
                <p className="text-xs text-gray-400 mt-0.5">Rated by {selected.rater?.full_name || 'your immediate head'} · Period: {selected.period_covered}</p>
              </div>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 cursor-pointer">
                <i className="ri-close-line text-lg"></i>
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="bg-[#1c2b3a] text-white rounded-xl p-4 flex flex-wrap items-center gap-x-8 gap-y-2">
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-white/50">Final Rating</p>
                  <p className="text-lg font-bold">{selected.final_rating_pct != null ? `${Number(selected.final_rating_pct).toFixed(1)}%` : '—'}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-white/50">Performance Level</p>
                  <p className="text-lg font-bold">{selected.performance_level != null ? Number(selected.performance_level).toFixed(1) : '—'}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-white/50">Total Score</p>
                  <p className="text-lg font-bold">{selected.total_score != null ? `${Number(selected.total_score).toFixed(2)} / 40` : '—'}</p>
                </div>
              </div>

              <button type="button" onClick={() => setShowRubric(!showRubric)}
                className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 rounded-lg text-sm text-gray-600 hover:bg-gray-100 cursor-pointer">
                <span className="font-medium">What the ratings mean (1–5)</span>
                <i className={`ri-arrow-${showRubric ? 'up' : 'down'}-s-line`}></i>
              </button>
              {showRubric && (
                <div className="space-y-2 -mt-2">
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

              <div className="space-y-2">
                {APPRAISAL_FACTORS.map(f => {
                  const r = selected.ratings?.[f.key];
                  const score = factorScore(r);
                  return (
                    <div key={f.key} className="bg-gray-50 rounded-lg px-4 py-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-[#111827]">{f.label}</p>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${score == null ? 'bg-gray-100 text-gray-400' : score < 3 ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
                          {score == null ? '—' : score.toFixed(2)}
                        </span>
                      </div>
                      <div className="mt-2 space-y-1.5">
                        {f.criteria.map((c, i) => (
                          <div key={i} className="flex items-start gap-2">
                            <span className={`w-5 h-5 shrink-0 rounded flex items-center justify-center text-[10px] font-semibold ${r?.levels?.[i] != null ? LEVEL_COLORS[r.levels[i] as number] : 'bg-gray-100 text-gray-300'}`}>
                              {r?.levels?.[i] ?? '·'}
                            </span>
                            <p className="text-xs text-gray-500">{c}</p>
                          </div>
                        ))}
                      </div>
                      {r?.remarks && (
                        <p className="text-xs text-gray-600 bg-white rounded-lg px-3 py-2 mt-2"><span className="font-medium">Remarks:</span> {r.remarks}</p>
                      )}
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
                  {selected.below_satisfactory_action === 'monitoring' ? 'You will be subject for monitoring.' : 'You will be subject to a Performance Improvement Plan.'}
                </p>
              )}

              {selected.status === 'awaiting_employee' ? (
                <div className="border border-sky-200 bg-sky-50 rounded-xl p-4 space-y-3">
                  <p className="text-xs text-sky-900">
                    I acknowledge that this Performance Evaluation
                    {selected.one_on_one_at
                      ? ` was discussed with me by my immediate head on ${new Date(selected.one_on_one_at).toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })},`
                      : ' was discussed with me by my immediate head,'}
                    {' '}and I have read the comments and ratings.
                  </p>
                  <textarea value={comments} onChange={e => setComments(e.target.value)} rows={3}
                    placeholder="Your comments or concerns (optional)"
                    className="w-full px-3 py-2.5 text-sm border border-sky-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400/40 bg-white resize-none" />
                  {error && <p className="text-xs text-rose-600">{error}</p>}
                  <button disabled={acknowledging} onClick={() => acknowledge(selected)}
                    className="w-full py-2.5 text-sm bg-[#1c2b3a] text-white rounded-lg hover:bg-[#0f1c28] disabled:opacity-60 cursor-pointer font-medium">
                    {acknowledging ? 'Submitting…' : 'Acknowledge Appraisal'}
                  </button>
                </div>
              ) : (
                <>
                  {selected.employee_acknowledged_at && (
                    <div>
                      <p className="text-xs font-medium text-gray-700 mb-1">
                        You acknowledged this on {new Date(selected.employee_acknowledged_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                      </p>
                      {selected.employee_comments && <p className="text-sm text-gray-600 bg-sky-50 rounded-lg p-3 whitespace-pre-wrap">{selected.employee_comments}</p>}
                    </div>
                  )}
                  {selected.status === 'completed' && (
                    <div className="bg-emerald-50 rounded-xl p-4">
                      <p className="text-sm font-medium text-emerald-800">
                        Reviewed by {selected.hr_reviewer?.full_name || 'HR'}{selected.hr_reviewed_at ? ` · ${new Date(selected.hr_reviewed_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}` : ''}
                      </p>
                      {selected.hr_comments && <p className="text-sm text-emerald-900/80 mt-1.5 whitespace-pre-wrap">{selected.hr_comments}</p>}
                    </div>
                  )}
                  {selected.status === 'completed' && (
                    <button onClick={() => printAppraisal(selected)}
                      className="w-full py-2.5 text-sm border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 cursor-pointer flex items-center justify-center gap-1.5">
                      <i className="ri-printer-line text-sm"></i> Print Form
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </ContractorLayout>
  );
}
