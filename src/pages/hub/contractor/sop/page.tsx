import { useEffect, useRef, useState } from 'react';
import ContractorLayout from '@/pages/hub/components/ContractorLayout';
import { supabase } from '@/lib/supabase';
import { HubSop } from '@/lib/types';

const CATEGORY_CFG: Record<string, { icon: string; color: string; bg: string; light: string }> = {
  Attendance:    { icon: 'ri-time-line',              color: 'text-sky-600',     bg: 'bg-sky-500',     light: 'bg-sky-50 text-sky-700 border-sky-100' },
  Payroll:       { icon: 'ri-money-dollar-circle-line',color: 'text-emerald-600', bg: 'bg-emerald-500', light: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
  HR:            { icon: 'ri-user-heart-line',         color: 'text-violet-600',  bg: 'bg-violet-500',  light: 'bg-violet-50 text-violet-700 border-violet-100' },
  Projects:      { icon: 'ri-folder-line',             color: 'text-indigo-600',  bg: 'bg-indigo-500',  light: 'bg-indigo-50 text-indigo-700 border-indigo-100' },
  Operations:    { icon: 'ri-settings-3-line',         color: 'text-amber-600',   bg: 'bg-amber-500',   light: 'bg-amber-50 text-amber-700 border-amber-100' },
  Communication: { icon: 'ri-chat-3-line',             color: 'text-rose-600',    bg: 'bg-rose-500',    light: 'bg-rose-50 text-rose-700 border-rose-100' },
  Onboarding:    { icon: 'ri-rocket-line',             color: 'text-teal-600',    bg: 'bg-teal-500',    light: 'bg-teal-50 text-teal-700 border-teal-100' },
};

const getCfg = (cat: string) => CATEGORY_CFG[cat] ?? { icon: 'ri-book-2-line', color: 'text-gray-500', bg: 'bg-gray-400', light: 'bg-gray-50 text-gray-600 border-gray-200' };

function formatContent(text: string) {
  return text.split('\n').map((line, i) => {
    if (!line.trim()) return <div key={i} className="h-3" />;
    // All-caps line ending with : → section heading
    if (/^[A-Z][A-Z\s/&-]+:/.test(line.trim())) {
      return <p key={i} className="text-xs font-bold text-gray-500 uppercase tracking-widest mt-5 mb-1">{line}</p>;
    }
    // Bullet points
    if (line.startsWith('• ') || line.startsWith('- ')) {
      return (
        <div key={i} className="flex gap-2 text-sm text-gray-700 leading-relaxed">
          <span className="text-gray-400 flex-shrink-0 mt-0.5">•</span>
          <span dangerouslySetInnerHTML={{ __html: line.slice(2).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />
        </div>
      );
    }
    // Numbered steps
    if (/^\d+\.\s/.test(line.trim())) {
      const [num, ...rest] = line.trim().split(/\.\s/);
      return (
        <div key={i} className="flex gap-3 text-sm text-gray-700 leading-relaxed">
          <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-600 text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{num}</span>
          <span dangerouslySetInnerHTML={{ __html: rest.join('. ').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />
        </div>
      );
    }
    // ❌ ✅ emoji lines
    if (line.startsWith('❌') || line.startsWith('✅')) {
      return <p key={i} className="text-sm text-gray-700 leading-relaxed">{line}</p>;
    }
    return <p key={i} className="text-sm text-gray-700 leading-relaxed">{line}</p>;
  });
}

export default function ContractorSopPage() {
  const [sops, setSops] = useState<HubSop[]>([]);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [loading, setLoading] = useState(true);
  const [viewSop, setViewSop] = useState<HubSop | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.from('hub_sops').select('*').eq('published', true).order('category').order('title')
      .then(({ data }) => { setSops((data as HubSop[]) ?? []); setLoading(false); });
  }, []);

  const categories = ['All', ...Array.from(new Set(sops.map(s => s.category))).sort()];

  const filtered = sops.filter(s => {
    const matchSearch = !search || s.title.toLowerCase().includes(search.toLowerCase()) || s.content?.toLowerCase().includes(search.toLowerCase());
    const matchCat = activeCategory === 'All' || s.category === activeCategory;
    return matchSearch && matchCat;
  });

  const grouped = categories.filter(c => c !== 'All').reduce((acc, cat) => {
    const items = filtered.filter(s => s.category === cat);
    if (items.length) acc[cat] = items;
    return acc;
  }, {} as Record<string, HubSop[]>);

  const scrollToCategory = (cat: string) => {
    setActiveCategory(cat);
    if (cat === 'All') { contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    const el = document.getElementById(`sop-cat-${cat}`);
    if (el && contentRef.current) {
      const offset = el.offsetTop - contentRef.current.offsetTop - 16;
      contentRef.current.scrollTo({ top: offset, behavior: 'smooth' });
    }
  };

  return (
    <ContractorLayout title="SOP Library">
      <div className="flex gap-6 -mx-4 md:-mx-6 px-4 md:px-6" style={{ minHeight: 'calc(100vh - 100px)' }}>

        {/* ── Left sidebar ── */}
        <div className="hidden lg:flex flex-col gap-1 w-52 flex-shrink-0 sticky top-0 self-start pt-1">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest px-3 mb-2">Categories</p>
          {categories.map(cat => {
            const cfg = getCfg(cat);
            const count = cat === 'All' ? sops.length : sops.filter(s => s.category === cat).length;
            const isActive = activeCategory === cat;
            return (
              <button key={cat} onClick={() => scrollToCategory(cat)}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-all cursor-pointer ${isActive ? 'bg-white shadow-sm border border-gray-100' : 'hover:bg-gray-50'}`}>
                <div className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 ${isActive ? cfg.bg + ' text-white' : 'bg-gray-100'}`}>
                  <i className={`${cat === 'All' ? 'ri-apps-2-line' : cfg.icon} text-[11px] ${isActive ? 'text-white' : 'text-gray-500'}`}></i>
                </div>
                <span className={`text-xs font-medium flex-1 ${isActive ? 'text-gray-900' : 'text-gray-500'}`}>{cat}</span>
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${isActive ? 'bg-gray-100 text-gray-600' : 'text-gray-300'}`}>{count}</span>
              </button>
            );
          })}
        </div>

        {/* ── Main content ── */}
        <div className="flex-1 min-w-0 space-y-8" ref={contentRef}>

          {/* Search */}
          <div className="relative">
            <i className="ri-search-line absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none"></i>
            <input value={search} onChange={e => { setSearch(e.target.value); setActiveCategory('All'); }}
              placeholder="Search SOPs by title or content…"
              className="w-full pl-10 pr-4 py-2.5 text-sm bg-white/70 backdrop-blur-sm border border-white/80 rounded-2xl shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300 placeholder-gray-400" />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer">
                <i className="ri-close-line text-sm"></i>
              </button>
            )}
          </div>

          {/* Mobile category pills */}
          <div className="flex gap-2 overflow-x-auto pb-1 lg:hidden">
            {categories.map(cat => {
              const cfg = getCfg(cat);
              return (
                <button key={cat} onClick={() => scrollToCategory(cat)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium flex-shrink-0 cursor-pointer transition-all ${activeCategory === cat ? cfg.light + ' border' : 'bg-white border border-gray-200 text-gray-500'}`}>
                  <i className={`${cat === 'All' ? 'ri-apps-2-line' : cfg.icon} text-[10px]`}></i>
                  {cat}
                </button>
              );
            })}
          </div>

          {loading ? (
            <div className="flex justify-center py-20"><i className="ri-loader-4-line animate-spin text-2xl text-gray-300"></i></div>
          ) : Object.keys(grouped).length === 0 ? (
            <div className="bg-white/70 backdrop-blur-sm border border-white/80 rounded-3xl p-16 text-center">
              <i className="ri-search-line text-3xl text-gray-200 block mb-3"></i>
              <p className="text-sm font-medium text-gray-400">No SOPs match "{search}"</p>
            </div>
          ) : (
            Object.entries(grouped).map(([cat, items]) => {
              const cfg = getCfg(cat);
              return (
                <div key={cat} id={`sop-cat-${cat}`}>
                  {/* Category header */}
                  <div className="flex items-center gap-3 mb-4">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${cfg.bg}`}>
                      <i className={`${cfg.icon} text-white text-sm`}></i>
                    </div>
                    <h2 className="text-base font-bold text-gray-900">{cat}</h2>
                    <span className="text-xs text-gray-400">{items.length} guide{items.length !== 1 ? 's' : ''}</span>
                    <div className="flex-1 h-px bg-gray-100 ml-1"></div>
                  </div>

                  {/* Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {items.map(s => (
                      <button key={s.id} onClick={() => setViewSop(s)} className="text-left bg-white/70 backdrop-blur-sm border border-white/80 rounded-2xl p-4 hover:shadow-md hover:bg-white hover:-translate-y-0.5 transition-all cursor-pointer group">
                        <div className="flex items-start gap-3">
                          <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${cfg.light} border`}>
                            <i className={`${cfg.icon} text-sm`}></i>
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="text-sm font-semibold text-gray-900 leading-snug group-hover:text-indigo-700 transition-colors">{s.title}</h3>
                            {s.content && (
                              <p className="text-xs text-gray-400 mt-1 line-clamp-2 leading-relaxed">
                                {s.content.replace(/\n/g, ' ').slice(0, 120)}…
                              </p>
                            )}
                          </div>
                          <i className="ri-arrow-right-s-line text-gray-300 group-hover:text-indigo-400 transition-colors text-base flex-shrink-0 mt-0.5"></i>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── SOP Reader modal ── */}
      {viewSop && (
        <>
          <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px]" onClick={() => setViewSop(null)} />
          <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-xl bg-white shadow-2xl flex flex-col" style={{ borderLeft: '1px solid #f3f4f6' }}>
            {/* Header */}
            {(() => {
              const cfg = getCfg(viewSop.category);
              return (
                <div className="flex-shrink-0">
                  <div className={`px-6 pt-6 pb-5 ${cfg.bg}`}>
                    <div className="flex items-start justify-between gap-3 mb-4">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-white/60">{viewSop.category}</span>
                      <button onClick={() => setViewSop(null)} className="w-6 h-6 flex items-center justify-center rounded-full bg-white/20 text-white/70 hover:bg-white/30 cursor-pointer transition-colors">
                        <i className="ri-close-line text-sm"></i>
                      </button>
                    </div>
                    <h1 className="text-lg font-bold text-white leading-snug">{viewSop.title}</h1>
                  </div>
                </div>
              );
            })()}

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-1.5">
              {viewSop.content ? formatContent(viewSop.content) : <p className="text-sm text-gray-400">No content yet.</p>}
            </div>

            {/* Footer nav */}
            <div className="flex-shrink-0 px-6 py-4 border-t border-gray-100 flex items-center justify-between">
              <button onClick={() => {
                const all = sops.filter(s => s.category === viewSop.category);
                const idx = all.findIndex(s => s.id === viewSop.id);
                if (idx > 0) setViewSop(all[idx - 1]);
              }} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700 cursor-pointer transition-colors disabled:opacity-30"
                disabled={sops.filter(s => s.category === viewSop.category).findIndex(s => s.id === viewSop.id) === 0}>
                <i className="ri-arrow-left-s-line"></i> Previous
              </button>
              <span className="text-[10px] text-gray-300">
                {sops.filter(s => s.category === viewSop.category).findIndex(s => s.id === viewSop.id) + 1} of {sops.filter(s => s.category === viewSop.category).length} in {viewSop.category}
              </span>
              <button onClick={() => {
                const all = sops.filter(s => s.category === viewSop.category);
                const idx = all.findIndex(s => s.id === viewSop.id);
                if (idx < all.length - 1) setViewSop(all[idx + 1]);
              }} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700 cursor-pointer transition-colors"
                disabled={(() => { const all = sops.filter(s => s.category === viewSop.category); return all.findIndex(s => s.id === viewSop.id) === all.length - 1; })()}>
                Next <i className="ri-arrow-right-s-line"></i>
              </button>
            </div>
          </div>
        </>
      )}
    </ContractorLayout>
  );
}
