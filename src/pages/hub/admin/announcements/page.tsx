import { useEffect, useState } from 'react';
import AdminLayout from '@/pages/hub/components/AdminLayout';
import { supabase } from '@/lib/supabase';
import { HubAnnouncement } from '@/lib/types';
import { useAuth } from '@/contexts/AuthContext';
import { useDemo } from '@/contexts/DemoContext';
import { DEMO_ANNOUNCEMENTS } from '@/lib/demoData';
import { createHubNotifications } from '@/lib/hubNotifications';
import HubAvatar from '@/pages/hub/components/HubAvatar';

const priorityColors: Record<string, string> = {
  normal: 'bg-gray-100 text-gray-600',
  important: 'bg-amber-100 text-amber-700',
  urgent: 'bg-rose-100 text-rose-700',
};
const categoryColors: Record<string, string> = {
  payroll: 'bg-emerald-100 text-emerald-700',
  meeting: 'bg-sky-100 text-sky-700',
  holiday: 'bg-purple-100 text-purple-700',
  policy: 'bg-slate-100 text-[#1c2b3a]',
  general: 'bg-gray-100 text-gray-600',
};

const SLACK_CHANNELS = [
  { key: 'announcements', label: '#announcements' },
  { key: 'attendance', label: '#attendance' },
];

const emptyForm = { title: '', body: '', priority: 'normal', category: 'general', published: true, scheduled_at: '', slack_channels: ['announcements'] as string[] };

export default function AnnouncementsPage() {
  const { hubUser } = useAuth();
  const { isDemo } = useDemo();
  const [announcements, setAnnouncements] = useState<HubAnnouncement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<HubAnnouncement | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [detailAnn, setDetailAnn] = useState<HubAnnouncement | null>(null);
  const [detailComments, setDetailComments] = useState<any[]>([]);
  const [detailReactions, setDetailReactions] = useState<any[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const openDetail = async (a: HubAnnouncement) => {
    setDetailAnn(a);
    setDetailLoading(true);
    const [commRes, reactRes] = await Promise.all([
      supabase.from('hub_announcement_comments').select('*, hub_users(full_name, avatar_url)').eq('announcement_id', a.id).order('created_at', { ascending: true }),
      supabase.from('hub_announcement_reactions').select('emoji, hub_users(full_name)').eq('announcement_id', a.id),
    ]);
    setDetailComments(commRes.data ?? []);
    setDetailReactions(reactRes.data ?? []);
    setDetailLoading(false);
  };

  const fetchAnnouncements = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('hub_announcements').select('*, hub_users(full_name, avatar_url, is_developer)').order('created_at', { ascending: false });
    if (error) console.error('fetchAnnouncements error:', error);
    setAnnouncements((data as HubAnnouncement[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    if (isDemo) {
      setAnnouncements(DEMO_ANNOUNCEMENTS);
      setLoading(false);
      return;
    }
    fetchAnnouncements();
  }, [isDemo]);

  const openNew = () => { setEditing(null); setForm(emptyForm); setShowModal(true); };
  const openEdit = (a: HubAnnouncement) => {
    setEditing(a);
    setForm({ title: a.title, body: a.body, priority: a.priority, category: a.category, published: a.published, scheduled_at: (a as any).scheduled_at ? new Date((a as any).scheduled_at).toISOString().slice(0, 16) : '', slack_channels: ['announcements'] });
    setShowModal(true);
  };

  const save = async () => {
    if (!form.title.trim() || !form.body.trim()) return;
    setSaving(true);
    setSaveError(null);
    try {
      let error;
      const isScheduled = !form.published && !!form.scheduled_at;
      const payload = {
        title: form.title, body: form.body, priority: form.priority,
        category: form.category, published: form.published,
        scheduled_at: isScheduled ? new Date(form.scheduled_at).toISOString() : null,
      };
      if (editing) {
        ({ error } = await supabase.from('hub_announcements').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', editing.id));
      } else {
        ({ error } = await supabase.from('hub_announcements').insert({ ...payload, posted_by: hubUser?.id }));
        if (!error && form.published && !isScheduled) {
          supabase.functions.invoke('notify-announcement', {
            body: { title: form.title, body: form.body, priority: form.priority, category: form.category, poster_name: hubUser?.is_developer ? undefined : hubUser?.full_name, channels: form.slack_channels },
          }).catch(console.error);
          // In-app notifications for all active contractors
          supabase.from('hub_users').select('id').eq('status', 'active').eq('role', 'contractor').neq('is_developer', true).then(({ data }) => {
            if (!data?.length) return;
            createHubNotifications(
              data.map(u => ({
                user_id: u.id,
                type: 'announcement',
                title: form.priority === 'urgent' ? '🚨 ' + form.title : form.title,
                body: form.body.slice(0, 100),
                link: '/hub/employee/announcements',
                read: false,
              }))
            ).catch(console.error);
          });
        }
      }
      if (error) { console.error('save error:', error); setSaveError(error.message); return; }
      setShowModal(false);
      fetchAnnouncements();
    } catch (e: any) {
      setSaveError(e?.message ?? 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  const deleteAnnouncement = async (id: number) => {
    await supabase.from('hub_announcements').delete().eq('id', id);
    setDeleteConfirm(null);
    fetchAnnouncements();
  };

  return (
    <AdminLayout title="Announcements">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">{announcements.length} announcement{announcements.length !== 1 ? 's' : ''}</p>
          <button onClick={openNew} className="flex items-center gap-1.5 px-4 py-2 bg-[#111827] text-white text-sm rounded-lg hover:bg-gray-800 transition-colors cursor-pointer whitespace-nowrap">
            <i className="ri-add-line"></i> New Announcement
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><i className="ri-loader-4-line animate-spin text-xl text-gray-400"></i></div>
        ) : announcements.length === 0 ? (
          <div className="bg-white border border-gray-100 rounded-xl p-10 text-center">
            <i className="ri-megaphone-line text-3xl text-gray-200 mb-2 block"></i>
            <p className="text-sm text-gray-400">No announcements yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {announcements.map((a) => (
              <div key={a.id} onClick={() => openDetail(a)} className="bg-white border border-gray-100 rounded-xl p-5 hover:border-gray-200 hover:shadow-sm transition-all cursor-pointer">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      {a.published
                        ? <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-emerald-100 text-emerald-700">Published</span>
                        : (a as any).scheduled_at
                          ? <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-sky-100 text-sky-700 flex items-center gap-1"><i className="ri-time-line text-[10px]"></i>Scheduled · {new Date((a as any).scheduled_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}</span>
                          : <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-500">Draft</span>
                      }
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${priorityColors[a.priority]}`}>{a.priority}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${categoryColors[a.category]}`}>{a.category}</span>
                    </div>
                    <h3 className="text-sm font-semibold text-[#111827] mb-1">{a.title}</h3>
                    <p className="text-sm text-gray-500 line-clamp-2">{a.body}</p>
                    {!(a as any).hub_users?.is_developer && (
                      <div className="flex items-center gap-2 mt-2">
                        <HubAvatar fullName={(a as any).hub_users?.full_name ?? ''} avatarUrl={(a as any).hub_users?.avatar_url} size="w-5 h-5" />
                        <p className="text-xs text-gray-400">{(a as any).hub_users?.full_name ?? 'Unknown'} · {new Date(a.created_at!).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                    <button onClick={() => openEdit(a)} className="p-1.5 text-gray-400 hover:text-gray-700 cursor-pointer transition-colors rounded-lg hover:bg-gray-100 w-7 h-7 flex items-center justify-center">
                      <i className="ri-edit-line text-sm"></i>
                    </button>
                    <button onClick={() => setDeleteConfirm(a.id)} className="p-1.5 text-gray-400 hover:text-rose-500 cursor-pointer transition-colors rounded-lg hover:bg-rose-50 w-7 h-7 flex items-center justify-center">
                      <i className="ri-delete-bin-line text-sm"></i>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="font-semibold text-[#111827]">{editing ? 'Edit Announcement' : 'New Announcement'}</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 cursor-pointer w-7 h-7 flex items-center justify-center">
                <i className="ri-close-line text-lg"></i>
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-700">Title *</label>
                <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Announcement title..." className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-700">Message *</label>
                <textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} rows={4}
                  placeholder="Write your announcement..." maxLength={500}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a] resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-700">Category</label>
                  <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a] bg-white">
                    {['general', 'payroll', 'meeting', 'holiday', 'policy'].map((c) => (
                      <option key={c} value={c} className="capitalize">{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-700">Priority</label>
                  <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a] bg-white">
                    {['normal', 'important', 'urgent'].map((p) => (
                      <option key={p} value={p} className="capitalize">{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-700">Post to Slack channels</label>
                <div className="flex gap-2">
                  {SLACK_CHANNELS.map(ch => {
                    const active = form.slack_channels.includes(ch.key);
                    return (
                      <button
                        key={ch.key}
                        type="button"
                        onClick={() => {
                          const next = active
                            ? form.slack_channels.filter(c => c !== ch.key)
                            : [...form.slack_channels, ch.key];
                          setForm({ ...form, slack_channels: next });
                        }}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
                          active ? 'bg-[#111827] text-white border-[#111827]' : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                        }`}
                      >
                        <i className="ri-slack-line"></i>
                        {ch.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-700">When to post</label>
                <div className="flex gap-2">
                  {[
                    { label: 'Post now', value: 'now' },
                    { label: 'Schedule', value: 'schedule' },
                    { label: 'Save as draft', value: 'draft' },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setForm({ ...form, published: opt.value === 'now', scheduled_at: opt.value !== 'schedule' ? '' : form.scheduled_at })}
                      className={`flex-1 py-2 text-xs rounded-lg border transition-colors cursor-pointer ${
                        (opt.value === 'now' && form.published) || (opt.value === 'schedule' && !form.published && !!form.scheduled_at) || (opt.value === 'draft' && !form.published && !form.scheduled_at)
                          ? 'bg-[#111827] text-white border-[#111827]'
                          : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >{opt.label}</button>
                  ))}
                </div>
                {!form.published && (
                  <input
                    type="datetime-local"
                    value={form.scheduled_at}
                    onChange={e => setForm({ ...form, scheduled_at: e.target.value })}
                    min={new Date().toISOString().slice(0, 16)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]"
                  />
                )}
              </div>
            </div>
            {saveError && (
              <p className="mx-5 mb-3 text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">{saveError}</p>
            )}
            <div className="flex gap-2 p-5 pt-0">
              <button onClick={() => setShowModal(false)} className="flex-1 py-2.5 text-sm border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors whitespace-nowrap">Cancel</button>
              <button onClick={save} disabled={saving || !form.title.trim() || !form.body.trim()}
                className="flex-1 py-2.5 text-sm bg-[#111827] text-white rounded-lg hover:bg-gray-800 disabled:opacity-40 cursor-pointer transition-colors whitespace-nowrap">
                {saving ? 'Saving...' : editing ? 'Save Changes' : form.published ? 'Post Announcement' : form.scheduled_at ? 'Schedule' : 'Save Draft'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm !== null && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 sm:p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 text-center space-y-4">
            <div className="w-12 h-12 bg-rose-100 rounded-full flex items-center justify-center mx-auto">
              <i className="ri-delete-bin-line text-rose-500 text-xl"></i>
            </div>
            <div>
              <h3 className="font-semibold text-[#111827]">Delete Announcement?</h3>
              <p className="text-sm text-gray-500 mt-1">This action cannot be undone.</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 py-2.5 text-sm border border-gray-200 text-gray-600 rounded-lg cursor-pointer whitespace-nowrap">Cancel</button>
              <button onClick={() => deleteAnnouncement(deleteConfirm)} className="flex-1 py-2.5 text-sm bg-rose-500 text-white rounded-lg hover:bg-rose-600 cursor-pointer transition-colors whitespace-nowrap">Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {detailAnn && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4" onClick={() => setDetailAnn(null)}>
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[85vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${priorityColors[detailAnn.priority]}`}>{detailAnn.priority}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${categoryColors[detailAnn.category]}`}>{detailAnn.category}</span>
              </div>
              <button onClick={() => setDetailAnn(null)} className="text-gray-400 hover:text-gray-600 cursor-pointer w-7 h-7 flex items-center justify-center">
                <i className="ri-close-line text-lg"></i>
              </button>
            </div>

            <div className="overflow-y-auto flex-1">
              {/* Body */}
              <div className="px-5 py-4 border-b border-gray-50">
                <h2 className="text-base font-semibold text-[#111827] mb-2">{detailAnn.title}</h2>
                <p className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">{detailAnn.body}</p>
                {!(detailAnn as any).hub_users?.is_developer && (
                  <div className="flex items-center gap-2 mt-3">
                    <HubAvatar fullName={(detailAnn as any).hub_users?.full_name ?? ''} avatarUrl={(detailAnn as any).hub_users?.avatar_url} size="w-6 h-6" />
                    <p className="text-xs text-gray-400">{(detailAnn as any).hub_users?.full_name ?? 'Unknown'} · {new Date(detailAnn.created_at!).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
                  </div>
                )}
              </div>

              {detailLoading ? (
                <div className="flex justify-center py-8"><i className="ri-loader-4-line animate-spin text-gray-300 text-xl"></i></div>
              ) : (
                <>
                  {/* Reactions */}
                  {detailReactions.length > 0 && (
                    <div className="px-5 py-3 border-b border-gray-50">
                      <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Reactions</p>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(
                          detailReactions.reduce((acc: Record<string, string[]>, r: any) => {
                            const name = r.hub_users?.full_name?.split(' ')[0] ?? '?';
                            acc[r.emoji] = [...(acc[r.emoji] || []), name];
                            return acc;
                          }, {})
                        ).map(([emoji, names]) => (
                          <div key={emoji} className="flex items-center gap-1 bg-gray-50 rounded-full px-2.5 py-1 text-sm" title={(names as string[]).join(', ')}>
                            <span>{emoji}</span>
                            <span className="text-xs text-gray-500 font-medium">{(names as string[]).length}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Comments */}
                  <div className="px-5 py-3">
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">
                      Comments ({detailComments.length})
                    </p>
                    {detailComments.length === 0 ? (
                      <p className="text-sm text-gray-400 py-2">No comments yet.</p>
                    ) : (
                      <div className="space-y-3">
                        {detailComments.map((c: any) => {
                          const poster = c.hub_users;
                          return (
                            <div key={c.id} className="flex items-start gap-2.5">
                              <HubAvatar fullName={poster?.full_name ?? ''} avatarUrl={poster?.avatar_url} size="w-7 h-7" className="flex-shrink-0" />
                              <div className="flex-1 bg-gray-50 rounded-xl px-3 py-2">
                                <div className="flex items-center justify-between mb-0.5">
                                  <span className="text-xs font-semibold text-[#111827]">{poster?.full_name?.split(' ')[0] ?? 'Unknown'}</span>
                                  <span className="text-[10px] text-gray-400">{new Date(c.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                                </div>
                                <p className="text-sm text-gray-600">{c.body}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Footer actions */}
            <div className="px-5 py-3 border-t border-gray-100 flex gap-2 flex-shrink-0">
              <button onClick={() => { setDetailAnn(null); openEdit(detailAnn); }} className="flex items-center gap-1.5 px-4 py-2 text-sm border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 cursor-pointer whitespace-nowrap">
                <i className="ri-edit-line text-sm"></i> Edit
              </button>
              <button onClick={() => { setDetailAnn(null); setDeleteConfirm(detailAnn.id); }} className="flex items-center gap-1.5 px-4 py-2 text-sm border border-rose-100 text-rose-500 rounded-lg hover:bg-rose-50 cursor-pointer whitespace-nowrap">
                <i className="ri-delete-bin-line text-sm"></i> Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
