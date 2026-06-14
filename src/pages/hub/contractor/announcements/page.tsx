import { useEffect, useState } from 'react';
import ContractorLayout from '@/pages/hub/components/ContractorLayout';
import { supabase } from '@/lib/supabase';
import { HubAnnouncement } from '@/lib/types';

const priorityColors: Record<string, string> = {
  normal: 'bg-gray-100 text-gray-600',
  important: 'bg-amber-100 text-amber-700',
  urgent: 'bg-rose-100 text-rose-700',
};
const priorityIcons: Record<string, string> = {
  normal: 'ri-information-line',
  important: 'ri-alert-line',
  urgent: 'ri-alarm-warning-line',
};
const categoryColors: Record<string, string> = {
  payroll: 'bg-emerald-100 text-emerald-700',
  meeting: 'bg-sky-100 text-sky-700',
  holiday: 'bg-purple-100 text-purple-700',
  policy: 'bg-slate-100 text-[#1c2b3a]',
  general: 'bg-gray-100 text-gray-600',
};

export default function ContractorAnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<HubAnnouncement[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    const fetchAnnouncements = async () => {
      setLoading(true);
      const { data } = await supabase.from('hub_announcements').select('*, hub_users!posted_by(full_name, avatar_url, role)').eq('published', true).order('created_at', { ascending: false });
      setAnnouncements((data as HubAnnouncement[]) ?? []);
      setLoading(false);
    };
    fetchAnnouncements();
  }, []);

  const categories = ['all', ...Array.from(new Set(announcements.map((a) => a.category)))];
  const filtered = announcements.filter((a) => categoryFilter === 'all' || a.category === categoryFilter);

  return (
    <ContractorLayout title="Announcements">
      <div className="space-y-4 max-w-3xl">
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit flex-wrap">
          {categories.slice(0, 6).map((c) => (
            <button key={c} onClick={() => setCategoryFilter(c)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer whitespace-nowrap capitalize ${categoryFilter === c ? 'bg-white text-[#111827] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              {c === 'all' ? 'All' : c}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><i className="ri-loader-4-line animate-spin text-xl text-gray-400"></i></div>
        ) : filtered.length === 0 ? (
          <div className="bg-white border border-gray-100 rounded-xl p-10 text-center">
            <i className="ri-megaphone-line text-3xl text-gray-200 mb-2 block"></i>
            <p className="text-sm text-gray-400">No announcements</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((a) => (
              <div key={a.id} className={`bg-white border rounded-xl transition-all ${a.priority === 'urgent' ? 'border-rose-200' : a.priority === 'important' ? 'border-amber-200' : 'border-gray-100'}`}>
                <div className="p-4 cursor-pointer" onClick={() => setExpanded(expanded === a.id ? null : a.id)}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5 flex-1 min-w-0">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${priorityColors[a.priority]}`}>
                        <i className={`${priorityIcons[a.priority]} text-sm`}></i>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-0.5">
                          <h3 className="text-sm font-semibold text-[#111827]">{a.title}</h3>
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium capitalize ${categoryColors[a.category]}`}>{a.category}</span>
                          {a.priority !== 'normal' && <span className={`text-xs px-1.5 py-0.5 rounded font-medium capitalize ${priorityColors[a.priority]}`}>{a.priority}</span>}
                        </div>
                        {expanded !== a.id && <p className="text-xs text-gray-400 line-clamp-1">{a.body}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-xs text-gray-400">{new Date(a.created_at!).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                      {expanded === a.id ? <i className="ri-arrow-up-s-line text-gray-400 text-sm"></i> : <i className="ri-arrow-down-s-line text-gray-400 text-sm"></i>}
                    </div>
                  </div>
                </div>
                {expanded === a.id && (
                  <div className="px-4 pb-4 pt-0">
                    <div className="ml-9.5 border-t border-gray-50 pt-3">
                      <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{a.body}</p>
                      {/* Posted by */}
                      {(() => {
                        const poster = (a as any).hub_users;
                        if (!poster) return null;
                        const roleLabel = poster.role === 'owner' ? 'Owner' : poster.role === 'admin' ? 'HR / Admin' : 'Contractor';
                        return (
                          <div className="flex items-center gap-2 mt-4 pt-3 border-t border-gray-50">
                            {poster.avatar_url
                              ? <img src={poster.avatar_url} alt={poster.full_name} className="w-7 h-7 rounded-full object-cover object-top flex-shrink-0" />
                              : <div className="w-7 h-7 rounded-full bg-[#1c2b3a] flex items-center justify-center flex-shrink-0"><span className="text-white text-xs font-bold">{poster.full_name?.charAt(0)}</span></div>
                            }
                            <div>
                              <p className="text-xs font-semibold text-[#111827]">{poster.full_name}</p>
                              <p className="text-[10px] text-gray-400">{roleLabel} · {new Date(a.created_at!).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </ContractorLayout>
  );
}