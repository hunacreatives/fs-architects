import { useEffect, useState } from 'react';
import AdminLayout from '@/pages/hub/components/AdminLayout';
import { useAuth } from '@/contexts/AuthContext';
import HubAvatar from '@/pages/hub/components/HubAvatar';
import { supabase } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';

interface Contractor { id: string; full_name: string; avatar_url: string | null; department: string | null; }
interface Review {
  id: number;
  contractor_id: string;
  reviewer_id: string | null;
  period_label: string;
  overall_rating: number | null;
  attendance_rating: number | null;
  quality_rating: number | null;
  communication_rating: number | null;
  initiative_rating: number | null;
  strengths: string | null;
  improvements: string | null;
  notes: string | null;
  created_at: string;
  hub_users?: { full_name: string; avatar_url: string | null };
  reviewer?: { full_name: string } | null;
}

const RATING_LABELS: Record<number, string> = { 1: 'Poor', 2: 'Below Avg', 3: 'Average', 4: 'Good', 5: 'Excellent' };
const RATING_COLORS: Record<number, string> = {
  1: 'text-red-600 bg-red-50', 2: 'text-[#1c2b3a] bg-slate-50',
  3: 'text-amber-600 bg-amber-50', 4: 'text-sky-600 bg-sky-50', 5: 'text-emerald-600 bg-emerald-50',
};

function Stars({ value, onChange }: { value: number; onChange?: (v: number) => void }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map(i => (
        <button
          key={i}
          type="button"
          onClick={() => onChange?.(i)}
          className={`text-lg transition-colors ${onChange ? 'cursor-pointer' : 'cursor-default'} ${i <= value ? 'text-amber-400' : 'text-gray-200'}`}
        >
          ★
        </button>
      ))}
    </div>
  );
}

function Avatar({ name, url }: { name: string; url: string | null }) {
  return <HubAvatar fullName={name} avatarUrl={url} size="w-8 h-8" />;
}

const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4'] as const;
const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 3 }, (_, i) => currentYear + i); // current to +2

function parsePeriod(label: string): { year: number; quarter: string } | null {
  const m = label.match(/^(Q[1-4])\s+(\d{4})$/);
  if (!m) return null;
  return { quarter: m[1], year: parseInt(m[2]) };
}

const emptyForm = {
  contractor_id: '',
  period_year: currentYear,
  period_quarter: 'Q2' as string,
  overall_rating: 3,
  attendance_rating: 3,
  quality_rating: 3,
  communication_rating: 3,
  initiative_rating: 3,
  strengths: '',
  improvements: '',
  notes: '',
};

export default function AdminPerformancePage() {
  const { hubUser } = useAuth();
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [selectedReview, setSelectedReview] = useState<Review | null>(null);
  const [filterContractor, setFilterContractor] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);

  const fetchAll = async () => {
    setLoading(true);
    const [cRes, rRes] = await Promise.all([
      supabase.from('hub_users').select('id, full_name, avatar_url, department').eq('status', 'active').in('role', ['contractor', 'admin']).neq('is_developer', true).order('full_name'),
      supabase.from('hub_performance_reviews').select('*, hub_users!contractor_id(full_name, avatar_url), reviewer:hub_users!reviewer_id(full_name)').order('created_at', { ascending: false }),
    ]);
    setContractors((cRes.data as Contractor[]) ?? []);
    setReviews((rRes.data as Review[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.contractor_id || !form.period_quarter || !form.period_year) return;
    setSaving(true);

    const period_label = `${form.period_quarter} ${form.period_year}`;
    const payload = {
      contractor_id: form.contractor_id,
      reviewer_id: hubUser?.id,
      period_label,
      overall_rating: form.overall_rating,
      attendance_rating: form.attendance_rating,
      quality_rating: form.quality_rating,
      communication_rating: form.communication_rating,
      initiative_rating: form.initiative_rating,
      strengths: form.strengths.trim() || null,
      improvements: form.improvements.trim() || null,
      notes: form.notes.trim() || null,
      updated_at: new Date().toISOString(),
    };

    if (editingId) {
      await supabase.from('hub_performance_reviews').update(payload).eq('id', editingId);
    } else {
      await supabase.from('hub_performance_reviews').insert(payload);
    }

    const name = contractors.find(c => c.id === form.contractor_id)?.full_name || form.contractor_id;
    logAudit({ actor_id: hubUser?.id, actor_name: hubUser?.full_name, action: editingId ? 'update' : 'create', entity_type: 'performance_review', description: `${editingId ? 'Updated' : 'Created'} performance review for ${name} — ${form.period_quarter} ${form.period_year}` });

    setSaving(false);
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
    fetchAll();
  };

  const startEdit = (r: Review) => {
    const parsed = parsePeriod(r.period_label);
    setForm({
      contractor_id: r.contractor_id,
      period_year: parsed?.year ?? currentYear,
      period_quarter: parsed?.quarter ?? 'Q1',
      overall_rating: r.overall_rating ?? 3,
      attendance_rating: r.attendance_rating ?? 3,
      quality_rating: r.quality_rating ?? 3,
      communication_rating: r.communication_rating ?? 3,
      initiative_rating: r.initiative_rating ?? 3,
      strengths: r.strengths ?? '',
      improvements: r.improvements ?? '',
      notes: r.notes ?? '',
    });
    setEditingId(r.id);
    setSelectedReview(null);
    setShowForm(true);
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Delete this performance review? This cannot be undone.')) return;
    await supabase.from('hub_performance_reviews').delete().eq('id', id);
    setSelectedReview(null);
    fetchAll();
  };

  const setF = (v: Partial<typeof emptyForm>) => setForm(prev => ({ ...prev, ...v }));

  const filtered = filterContractor
    ? reviews.filter(r => r.contractor_id === filterContractor)
    : reviews;

  // Group by year desc → quarter desc
  const grouped = (() => {
    const byYear: Record<number, Record<string, Review[]>> = {};
    for (const r of filtered) {
      const p = parsePeriod(r.period_label);
      const year = p?.year ?? 0;
      const quarter = p?.quarter ?? r.period_label;
      if (!byYear[year]) byYear[year] = {};
      if (!byYear[year][quarter]) byYear[year][quarter] = [];
      byYear[year][quarter].push(r);
    }
    return Object.entries(byYear)
      .sort(([a], [b]) => Number(b) - Number(a))
      .map(([year, quarters]) => ({
        year: Number(year),
        quarters: Object.entries(quarters)
          .sort(([a], [b]) => b.localeCompare(a))
          .map(([quarter, items]) => ({ quarter, items })),
      }));
  })();

  const avgRating = (r: Review) => {
    const vals = [r.overall_rating, r.attendance_rating, r.quality_rating, r.communication_rating, r.initiative_rating].filter(Boolean) as number[];
    return vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length) : null;
  };

  return (
    <AdminLayout title="Performance Reviews">
      <div className="space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <select
              value={filterContractor}
              onChange={e => setFilterContractor(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a] bg-white"
            >
              <option value="">All employees</option>
              {contractors.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
            </select>
            <span className="text-xs text-gray-400">{filtered.length} review{filtered.length !== 1 ? 's' : ''}</span>
          </div>
          <button
            onClick={() => { setForm(emptyForm); setEditingId(null); setShowForm(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-[#1c2b3a] text-white rounded-xl text-sm font-medium hover:bg-[#0f1c28] cursor-pointer transition-colors"
          >
            <i className="ri-add-line"></i>
            New Review
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><i className="ri-loader-4-line animate-spin text-2xl text-gray-300"></i></div>
        ) : filtered.length === 0 ? (
          <div className="bg-white border border-gray-100 rounded-xl p-12 text-center">
            <i className="ri-medal-line text-4xl text-gray-200 mb-3 block"></i>
            <p className="text-sm font-medium text-gray-500">No reviews yet</p>
            <p className="text-xs text-gray-400 mt-1">Create your first performance review to get started</p>
          </div>
        ) : (
          <div className="space-y-6">
            {grouped.map(({ year, quarters }) => (
              <div key={year}>
                <p className="text-sm font-bold text-[#111827] mb-3">{year || 'Other'}</p>
                <div className="space-y-4">
                  {quarters.map(({ quarter, items }) => (
                    <div key={quarter}>
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2 px-1">{quarter}</p>
                      <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-gray-100 bg-gray-50">
                                {['Employee', 'Overall', 'Attendance', 'Quality', 'Communication', 'Initiative', 'Reviewed by', ''].map(h => (
                                  <th key={h} className="text-left text-xs font-medium text-gray-400 px-4 py-2.5 whitespace-nowrap">{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                              {items.map(r => {
                                const avg = avgRating(r);
                                return (
                                  <tr key={r.id} className="hover:bg-gray-50/50 transition-colors cursor-pointer" onClick={() => setSelectedReview(r)}>
                                    <td className="px-4 py-3">
                                      <div className="flex items-center gap-2.5">
                                        <Avatar name={(r.hub_users as any)?.full_name || '?'} url={(r.hub_users as any)?.avatar_url || null} />
                                        <p className="text-sm font-medium text-[#111827]">{(r.hub_users as any)?.full_name}</p>
                                      </div>
                                    </td>
                                    <td className="px-4 py-3">
                                      {avg != null ? (
                                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${RATING_COLORS[Math.round(avg)]}`}>
                                          {avg.toFixed(1)} · {RATING_LABELS[Math.round(avg)]}
                                        </span>
                                      ) : <span className="text-gray-300">—</span>}
                                    </td>
                                    {[r.attendance_rating, r.quality_rating, r.communication_rating, r.initiative_rating].map((v, i) => (
                                      <td key={i} className="px-4 py-3">
                                        {v != null ? (
                                          <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${RATING_COLORS[v]}`}>{v}/5</span>
                                        ) : <span className="text-gray-300">—</span>}
                                      </td>
                                    ))}
                                    <td className="px-4 py-3 text-xs text-gray-400">{(r.reviewer as any)?.full_name || '—'}</td>
                                    <td className="px-4 py-3">
                                      <button onClick={e => { e.stopPropagation(); startEdit(r); }}
                                        className="text-gray-300 hover:text-[#1c2b3a] transition-colors cursor-pointer">
                                        <i className="ri-pencil-line text-sm"></i>
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* New/Edit Review modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white">
              <h2 className="font-semibold text-[#111827]">{editingId ? 'Edit Review' : 'New Performance Review'}</h2>
              <button onClick={() => { setShowForm(false); setEditingId(null); }} className="text-gray-400 hover:text-gray-600 cursor-pointer">
                <i className="ri-close-line text-lg"></i>
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1 col-span-2">
                  <label className="text-xs font-medium text-gray-700">Employee *</label>
                  <select required value={form.contractor_id} onChange={e => setF({ contractor_id: e.target.value })}
                    className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a] bg-white">
                    <option value="">Select employee...</option>
                    {contractors.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
                  </select>
                </div>
                <div className="space-y-1 col-span-2">
                  <label className="text-xs font-medium text-gray-700">Period *</label>
                  <div className="flex gap-2">
                    <select value={form.period_quarter} onChange={e => setF({ period_quarter: e.target.value })}
                      className="flex-1 px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a] bg-white">
                      {QUARTERS.map(q => <option key={q} value={q}>{q}</option>)}
                    </select>
                    <select value={form.period_year} onChange={e => setF({ period_year: parseInt(e.target.value) })}
                      className="flex-1 px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a] bg-white">
                      {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                  <p className="text-[11px] text-gray-400">Will be saved as: {form.period_quarter} {form.period_year}</p>
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-xs font-medium text-gray-700">Ratings</p>
                {([
                  { key: 'overall_rating', label: 'Overall Performance' },
                  { key: 'attendance_rating', label: 'Attendance & Punctuality' },
                  { key: 'quality_rating', label: 'Work Quality' },
                  { key: 'communication_rating', label: 'Communication' },
                  { key: 'initiative_rating', label: 'Initiative & Proactiveness' },
                ] as { key: keyof typeof emptyForm; label: string }[]).map(({ key, label }) => (
                  <div key={key} className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">{label}</span>
                    <div className="flex items-center gap-3">
                      <Stars value={form[key] as number} onChange={v => setF({ [key]: v })} />
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full w-24 text-center ${RATING_COLORS[form[key] as number]}`}>
                        {RATING_LABELS[form[key] as number]}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-700">Strengths</label>
                <textarea value={form.strengths} onChange={e => setF({ strengths: e.target.value })} rows={2}
                  placeholder="What this employee does well..."
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a] resize-none" />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-700">Areas for Improvement</label>
                <textarea value={form.improvements} onChange={e => setF({ improvements: e.target.value })} rows={2}
                  placeholder="What can they improve on..."
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a] resize-none" />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-700">Internal Notes <span className="text-gray-400 font-normal">(not shown to employee)</span></label>
                <textarea value={form.notes} onChange={e => setF({ notes: e.target.value })} rows={2}
                  placeholder="Private notes for admin..."
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a] resize-none" />
              </div>

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => { setShowForm(false); setEditingId(null); }}
                  className="flex-1 py-2.5 text-sm border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 cursor-pointer">
                  Cancel
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 py-2.5 text-sm bg-[#1c2b3a] text-white rounded-lg hover:bg-[#0f1c28] disabled:opacity-60 cursor-pointer font-medium">
                  {saving ? 'Saving…' : editingId ? 'Save Changes' : 'Save Review'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Review modal */}
      {selectedReview && !showForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <h2 className="font-semibold text-[#111827]">{(selectedReview.hub_users as any)?.full_name}</h2>
                <p className="text-xs text-gray-400 mt-0.5">{selectedReview.period_label}</p>
              </div>
              <button onClick={() => setSelectedReview(null)} className="text-gray-400 hover:text-gray-600 cursor-pointer">
                <i className="ri-close-line text-lg"></i>
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {([
                  { label: 'Overall', val: selectedReview.overall_rating },
                  { label: 'Attendance', val: selectedReview.attendance_rating },
                  { label: 'Quality', val: selectedReview.quality_rating },
                  { label: 'Communication', val: selectedReview.communication_rating },
                  { label: 'Initiative', val: selectedReview.initiative_rating },
                ]).map(({ label, val }) => val != null && (
                  <div key={label} className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-400 mb-1">{label}</p>
                    <div className="flex items-center gap-2">
                      <Stars value={val} />
                      <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${RATING_COLORS[val]}`}>{RATING_LABELS[val]}</span>
                    </div>
                  </div>
                ))}
              </div>
              {selectedReview.strengths && (
                <div>
                  <p className="text-xs font-medium text-gray-700 mb-1">Strengths</p>
                  <p className="text-sm text-gray-600 bg-emerald-50 rounded-lg p-3">{selectedReview.strengths}</p>
                </div>
              )}
              {selectedReview.improvements && (
                <div>
                  <p className="text-xs font-medium text-gray-700 mb-1">Areas for Improvement</p>
                  <p className="text-sm text-gray-600 bg-amber-50 rounded-lg p-3">{selectedReview.improvements}</p>
                </div>
              )}
              {selectedReview.notes && (
                <div>
                  <p className="text-xs font-medium text-gray-700 mb-1">Internal Notes</p>
                  <p className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3">{selectedReview.notes}</p>
                </div>
              )}
              <p className="text-xs text-gray-400">Reviewed by {(selectedReview.reviewer as any)?.full_name || 'Admin'} · {new Date(selectedReview.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
              <div className="flex gap-3 pt-1">
                <button onClick={() => startEdit(selectedReview)}
                  className="flex-1 py-2.5 text-sm border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 cursor-pointer flex items-center justify-center gap-1.5">
                  <i className="ri-pencil-line text-sm"></i> Edit
                </button>
                <button onClick={() => handleDelete(selectedReview.id)}
                  className="flex-1 py-2.5 text-sm border border-rose-200 rounded-lg text-rose-600 hover:bg-rose-50 cursor-pointer flex items-center justify-center gap-1.5">
                  <i className="ri-delete-bin-line text-sm"></i> Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
