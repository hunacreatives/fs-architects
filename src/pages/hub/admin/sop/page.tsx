import { useEffect, useState } from 'react';
import AdminLayout from '@/pages/hub/components/AdminLayout';
import { supabase } from '@/lib/supabase';
import { HubSop } from '@/lib/types';
import { useDemo } from '@/contexts/DemoContext';
import { DEMO_SOPS } from '@/lib/demoData';

const categoryIcons: Record<string, string> = {
  onboarding: 'ri-user-add-line',
  reporting: 'ri-file-chart-line',
  ad_launch: 'ri-rocket-line',
  slack: 'ri-slack-line',
  training: 'ri-video-line',
  branding: 'ri-palette-line',
  general: 'ri-book-2-line',
};
const categoryColors: Record<string, string> = {
  onboarding: 'bg-emerald-100 text-emerald-700',
  reporting: 'bg-sky-100 text-sky-700',
  ad_launch: 'bg-slate-100 text-[#1c2b3a]',
  slack: 'bg-purple-100 text-purple-700',
  training: 'bg-rose-100 text-rose-700',
  branding: 'bg-amber-100 text-amber-700',
  general: 'bg-gray-100 text-gray-600',
};

const emptyForm = { title: '', content: '', category: 'general', video_url: '', published: true, visibility: 'all' };

export default function SopPage() {
  const { isDemo } = useDemo();
  const [sops, setSops] = useState<HubSop[]>([]);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<HubSop | null>(null);
  const [viewSop, setViewSop] = useState<HubSop | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const fetchSops = async () => {
    setLoading(true);
    const { data } = await supabase.from('hub_sop').select('*').order('category').order('title');
    setSops((data as HubSop[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    if (isDemo) {
      setSops(DEMO_SOPS);
      setLoading(false);
      return;
    }
    fetchSops();
  }, [isDemo]);

  const categories = ['all', ...Array.from(new Set(sops.map((s) => s.category)))];

  const filtered = sops.filter((s) => {
    const matchSearch = !search || s.title.toLowerCase().includes(search.toLowerCase()) || s.content?.toLowerCase().includes(search.toLowerCase());
    const matchCategory = categoryFilter === 'all' || s.category === categoryFilter;
    return matchSearch && matchCategory;
  });

  const openNew = () => { setEditing(null); setForm(emptyForm); setShowModal(true); };
  const openEdit = (s: HubSop) => {
    setEditing(s);
    setForm({ title: s.title, content: s.content || '', category: s.category, video_url: s.video_url || '', published: s.published, visibility: (s as any).visibility || 'all' });
    setShowModal(true);
  };

  const save = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    if (editing) {
      await supabase.from('hub_sop').update({ ...form, updated_at: new Date().toISOString() }).eq('id', editing.id);
    } else {
      await supabase.from('hub_sop').insert({ ...form });
    }
    setSaving(false);
    setShowModal(false);
    fetchSops();
  };

  const deleteSop = async (id: number) => {
    await supabase.from('hub_sop').delete().eq('id', id);
    setViewSop(null);
    fetchSops();
  };

  return (
    <AdminLayout title="SOP Library">
      <div className="space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search SOPs..."
              className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]" />
          </div>
          <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
            {categories.slice(0, 5).map((c) => (
              <button key={c} onClick={() => setCategoryFilter(c)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer whitespace-nowrap capitalize ${categoryFilter === c ? 'bg-white text-[#111827] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                {c === 'all' ? 'All' : c.replace('_', ' ')}
              </button>
            ))}
          </div>
          <button onClick={openNew} className="flex items-center gap-1.5 px-4 py-2 bg-[#111827] text-white text-sm rounded-lg hover:bg-gray-800 transition-colors cursor-pointer whitespace-nowrap">
            <i className="ri-add-line"></i> Add SOP
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><i className="ri-loader-4-line animate-spin text-xl text-gray-400"></i></div>
        ) : filtered.length === 0 ? (
          <div className="bg-white border border-gray-100 rounded-xl p-10 text-center">
            <i className="ri-book-2-line text-3xl text-gray-200 mb-2 block"></i>
            <p className="text-sm text-gray-400">No SOPs found</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map((s) => (
              <div key={s.id} className="bg-white border border-gray-100 rounded-xl p-4 hover:border-gray-200 transition-colors cursor-pointer group"
                onClick={() => setViewSop(s)}>
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${categoryColors[s.category] || 'bg-gray-100 text-gray-500'}`}>
                    <i className={`${categoryIcons[s.category] || 'ri-book-2-line'} text-base`}></i>
                  </div>
                  <div className="flex gap-1">
                    {!s.published && <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-400">Draft</span>}
                    {(s as any).visibility === 'admin_only' && <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-[#1c2b3a]">Admin only</span>}
                  </div>
                </div>
                <h3 className="text-sm font-semibold text-[#111827] mb-1 line-clamp-2">{s.title}</h3>
                {s.content && <p className="text-xs text-gray-400 line-clamp-2">{s.content}</p>}
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-50">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${categoryColors[s.category]}`}>{s.category.replace('_', ' ')}</span>
                  {s.video_url && <i className="ri-video-line text-xs text-gray-400"></i>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {viewSop && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 sm:p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${categoryColors[viewSop.category]}`}>
                  <i className={`${categoryIcons[viewSop.category] || 'ri-book-2-line'} text-base`}></i>
                </div>
                <div>
                  <h2 className="font-semibold text-[#111827]">{viewSop.title}</h2>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${categoryColors[viewSop.category]}`}>{viewSop.category.replace('_', ' ')}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => { openEdit(viewSop); setViewSop(null); }} className="p-1.5 text-gray-400 hover:text-gray-700 cursor-pointer rounded-lg hover:bg-gray-100 w-7 h-7 flex items-center justify-center">
                  <i className="ri-edit-line text-sm"></i>
                </button>
                <button onClick={() => deleteSop(viewSop.id)} className="p-1.5 text-gray-400 hover:text-rose-500 cursor-pointer rounded-lg hover:bg-rose-50 w-7 h-7 flex items-center justify-center">
                  <i className="ri-delete-bin-line text-sm"></i>
                </button>
                <button onClick={() => setViewSop(null)} className="p-1.5 text-gray-400 hover:text-gray-600 cursor-pointer w-7 h-7 flex items-center justify-center">
                  <i className="ri-close-line text-lg"></i>
                </button>
              </div>
            </div>
            <div className="p-5 overflow-y-auto flex-1 space-y-4">
              {viewSop.video_url && (
                <div className="bg-gray-50 rounded-xl overflow-hidden">
                  <iframe src={viewSop.video_url} className="w-full aspect-video rounded-xl" allowFullScreen title={viewSop.title}></iframe>
                </div>
              )}
              <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{viewSop.content || 'No content yet.'}</div>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="font-semibold text-[#111827]">{editing ? 'Edit SOP' : 'New SOP'}</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 cursor-pointer w-7 h-7 flex items-center justify-center">
                <i className="ri-close-line text-lg"></i>
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-700">Title *</label>
                <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="SOP title..." className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a]" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-700">Category</label>
                <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none bg-white">
                  {['general', 'onboarding', 'reporting', 'ad_launch', 'slack', 'training', 'branding'].map((c) => (
                    <option key={c} value={c}>{c.replace('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase())}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-700">Content</label>
                <textarea value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} rows={6}
                  placeholder="Write the SOP content..." maxLength={500}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a] resize-none" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-700">Video URL (optional)</label>
                <input value={form.video_url} onChange={(e) => setForm({ ...form, video_url: e.target.value })}
                  placeholder="https://www.youtube.com/embed/..." className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none" />
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.published} onChange={(e) => setForm({ ...form, published: e.target.checked })} className="rounded" />
                  <span className="text-sm text-gray-600">Published</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.visibility === 'admin_only'} onChange={(e) => setForm({ ...form, visibility: e.target.checked ? 'admin_only' : 'all' })} className="rounded" />
                  <span className="text-sm text-gray-600">Admin only <span className="text-xs text-gray-400">(hidden from contractors)</span></span>
                </label>
              </div>
            </div>
            <div className="flex gap-2 p-5 pt-0">
              <button onClick={() => setShowModal(false)} className="flex-1 py-2.5 text-sm border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors whitespace-nowrap">Cancel</button>
              <button onClick={save} disabled={saving || !form.title.trim()}
                className="flex-1 py-2.5 text-sm bg-[#111827] text-white rounded-lg hover:bg-gray-800 disabled:opacity-40 cursor-pointer transition-colors whitespace-nowrap">
                {saving ? 'Saving...' : editing ? 'Save Changes' : 'Create SOP'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}