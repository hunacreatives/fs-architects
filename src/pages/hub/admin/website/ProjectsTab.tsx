import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { MAP_CITIES, PROJECT_CATEGORIES, invalidateSite, type Lang, type ProjectRow, type ProjectText } from '@/lib/site/content';
import { DEFAULT_PROJECTS } from '@/lib/site/defaults';
import { importDefaults } from './importDefaults';
import {
  Field, GalleryField, ImageField, ImportBanner, LangTabs, Modal, VideoField, btnDark, btnLight, filledLangs, iconBtn, inputCls, labelCls,
  swapOrder, useLive,
} from './shared';

// each map city's pin coordinates, taken from the projects already there
const CITY_LATLNG: Record<string, [number, number]> = Object.fromEntries(
  DEFAULT_PROJECTS.map((p) => [p.location, [p.lat, p.lng] as [number, number]]),
);
const slugify = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-');
const blank = (sort: number): ProjectRow => ({
  slug: '', sort_order: sort, published: true, year: String(new Date().getFullYear()), location: 'CDO', lat: CITY_LATLNG.CDO?.[0] ?? null,
  lng: CITY_LATLNG.CDO?.[1] ?? null, category: 'Residential', thumb: '', hero: '', main_image: '', gallery: [], floor_plans: [],
  video: '', video_mp4: '', floors: '', plot_area: '', built_area: '', i18n: { en: {}, es: {}, zh: {} },
});

export default function ProjectsTab() {
  const [live, refreshLive] = useLive('projects');
  const [rows, setRows] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [editing, setEditing] = useState<ProjectRow | null>(null);
  const [deleting, setDeleting] = useState<ProjectRow | null>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    const { data } = await supabase.from('site_projects').select('*').order('sort_order').order('created_at');
    setRows((data as ProjectRow[]) ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const runImport = async () => {
    setImporting(true); setError('');
    try { await importDefaults('projects'); await load(); await refreshLive(); } catch (e) { setError((e as Error).message); }
    setImporting(false);
  };
  const togglePublished = async (r: ProjectRow) => {
    await supabase.from('site_projects').update({ published: !r.published, updated_at: new Date().toISOString() }).eq('id', r.id!);
    invalidateSite('projects'); load();
  };
  const move = async (i: number, d: number) => { await swapOrder('site_projects', rows[i], rows[i + d]); load(); };
  const remove = async () => {
    if (!deleting) return;
    await supabase.from('site_projects').delete().eq('id', deleting.id!);
    setDeleting(null); invalidateSite('projects'); load();
  };

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.map((r, i) => ({ r, i })).filter(({ r }) => !q || `${r.i18n?.en?.name ?? ''} ${r.location} ${r.category}`.toLowerCase().includes(q));
  }, [rows, query]);

  if (loading || live === null) return <div className="flex justify-center py-12"><i className="ri-loader-4-line animate-spin text-xl text-gray-400" /></div>;
  if (!live) return <div className="space-y-3"><ImportBanner what="projects" onImport={runImport} busy={importing} />{error && <p className="text-xs text-rose-500">{error}</p>}</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative">
          <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search projects" className={`${inputCls} pl-8 w-64`} />
        </div>
        <div className="flex items-center gap-2">
          <p className="text-sm text-gray-500">{rows.filter((r) => r.published).length} on the website · {rows.length} in all</p>
          <button onClick={() => setEditing(blank((rows.at(-1)?.sort_order ?? 0) + 10))} className={btnDark}><i className="ri-add-line" /> New project</button>
        </div>
      </div>

      <div className="bg-white border border-gray-100 rounded-xl divide-y divide-gray-50">
        {shown.map(({ r, i }) => (
          <div key={r.id} className="flex items-center gap-3 p-3">
            <img src={r.thumb || r.hero} alt="" loading="lazy" className="w-16 h-12 rounded-md object-cover bg-gray-100 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{r.i18n?.en?.name || r.slug}</p>
              <p className="text-xs text-gray-400 truncate">{r.year} · {r.location} · {r.category}</p>
            </div>
            <button onClick={() => togglePublished(r)} title={r.published ? 'Hide from the website' : 'Show on the website'}
              className={`text-xs px-2 py-0.5 rounded-full font-medium cursor-pointer ${r.published ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
              {r.published ? 'On website' : 'Hidden'}
            </button>
            <div className="flex items-center">
              <button disabled={i === 0 || !!query} onClick={() => move(i, -1)} className={iconBtn} title="Move up"><i className="ri-arrow-up-line text-sm" /></button>
              <button disabled={i === rows.length - 1 || !!query} onClick={() => move(i, 1)} className={iconBtn} title="Move down"><i className="ri-arrow-down-line text-sm" /></button>
              <a href={`/projects/${r.slug}`} target="_blank" rel="noreferrer" className={iconBtn} title="Open on the website"><i className="ri-external-link-line text-sm" /></a>
              <button onClick={() => setEditing(r)} className={iconBtn} title="Edit"><i className="ri-edit-line text-sm" /></button>
              <button onClick={() => setDeleting(r)} className={`${iconBtn} hover:!text-rose-500`} title="Delete"><i className="ri-delete-bin-line text-sm" /></button>
            </div>
          </div>
        ))}
        {!shown.length && <p className="p-8 text-center text-sm text-gray-400">No projects match</p>}
      </div>

      {editing && <ProjectEditor row={editing} slugs={rows.filter((r) => r.id !== editing.id).map((r) => r.slug)} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
      {deleting && (
        <Modal title="Delete project" onClose={() => setDeleting(null)} footer={<>
          <button onClick={() => setDeleting(null)} className={btnLight}>Cancel</button>
          <button onClick={remove} className="px-4 py-2 bg-rose-600 text-white text-sm rounded-lg hover:bg-rose-700 cursor-pointer">Delete</button>
        </>}>
          <p className="text-sm text-gray-600">Delete <strong>{deleting.i18n?.en?.name || deleting.slug}</strong> from the website? To take it off the site for now, hide it instead.</p>
        </Modal>
      )}
    </div>
  );
}

function ProjectEditor({ row, slugs, onClose, onSaved }: { row: ProjectRow; slugs: string[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<ProjectRow>(() => JSON.parse(JSON.stringify(row)));
  const [lang, setLang] = useState<Lang>('en');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = <K extends keyof ProjectRow>(k: K, v: ProjectRow[K]) => setF((p) => ({ ...p, [k]: v }));
  const text = (k: keyof ProjectText) => (f.i18n?.[lang]?.[k] as string) ?? '';
  const setText = (k: keyof ProjectText, v: string) => setF((p) => ({ ...p, i18n: { ...p.i18n, [lang]: { ...p.i18n?.[lang], [k]: v } } }));
  const folder = `projects/${f.slug || 'new'}`;
  const isNew = !row.id;

  const save = async () => {
    const name = f.i18n?.en?.name?.trim();
    const slug = (f.slug || slugify(name ?? '')).trim();
    if (!name) { setLang('en'); setError('Give the project an English name.'); return; }
    if (!slug || slugs.includes(slug)) { setError('That web address is already used by another project.'); return; }
    if (!f.hero) { setError('Add a hero image.'); return; }
    setSaving(true); setError('');
    const { id, ...rest } = f;
    const body = { ...rest, slug, floor_plans: f.floor_plans.filter((p) => p.image), updated_at: new Date().toISOString() };
    const { error: e } = isNew ? await supabase.from('site_projects').insert(body) : await supabase.from('site_projects').update(body).eq('id', id!);
    setSaving(false);
    if (e) { setError(e.message); return; }
    invalidateSite('projects');
    onSaved();
  };

  return (
    <Modal wide title={isNew ? 'New project' : `Edit ${row.i18n?.en?.name || row.slug}`} onClose={onClose} footer={<>
      {error && <p className="text-xs text-rose-500 mr-auto self-center">{error}</p>}
      <button onClick={onClose} className={btnLight}>Cancel</button>
      <button onClick={save} disabled={saving} className={btnDark}>{saving && <i className="ri-loader-4-line animate-spin" />} Save</button>
    </>}>
      <div className="flex items-center justify-between gap-3">
        <LangTabs lang={lang} onChange={setLang} filled={filledLangs(f.i18n as never, 'name')} />
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input type="checkbox" checked={f.published} onChange={(e) => set('published', e.target.checked)} /> Show on the website
        </label>
      </div>
      {lang !== 'en' && <p className="text-[11px] text-gray-400 -mt-2">Leave a field blank to show the English on the {lang === 'es' ? 'Spanish' : 'Chinese'} site.</p>}

      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Name"><input className={inputCls} value={text('name')} onChange={(e) => setText('name', e.target.value)} placeholder={lang === 'en' ? 'Yang Residence' : f.i18n?.en?.name} /></Field>
        <Field label="Address"><input className={inputCls} value={text('address')} onChange={(e) => setText('address', e.target.value)} placeholder={lang === 'en' ? 'Consolacion, Cebu' : f.i18n?.en?.address} /></Field>
      </div>
      <Field label="Description"><textarea className={`${inputCls} min-h-[120px]`} value={text('description')} onChange={(e) => setText('description', e.target.value)} /></Field>
      <Field label="Quote" hint="Optional. Shown as a pull quote on the project page."><textarea className={`${inputCls} min-h-[60px]`} value={text('quote')} onChange={(e) => setText('quote', e.target.value)} /></Field>

      <div className="grid sm:grid-cols-4 gap-3">
        <Field label="Category" hint="The Projects page filter">
          <select className={inputCls} value={f.category} onChange={(e) => set('category', e.target.value)}>
            {PROJECT_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Map city">
          <select className={inputCls} value={f.location} onChange={(e) => { const c = e.target.value; setF((p) => ({ ...p, location: c, lat: CITY_LATLNG[c]?.[0] ?? p.lat, lng: CITY_LATLNG[c]?.[1] ?? p.lng })); }}>
            {MAP_CITIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Year"><input className={inputCls} value={f.year} onChange={(e) => set('year', e.target.value)} /></Field>
        <Field label="Web address" hint={`/projects/${f.slug || slugify(f.i18n?.en?.name ?? '') || '…'}`}>
          <input className={inputCls} value={f.slug} onChange={(e) => set('slug', slugify(e.target.value))} placeholder={slugify(f.i18n?.en?.name ?? '')} />
        </Field>
      </div>
      <div className="grid sm:grid-cols-3 gap-3">
        <Field label="Floors"><input className={inputCls} value={f.floors} onChange={(e) => set('floors', e.target.value)} /></Field>
        <Field label="Plot area"><input className={inputCls} value={f.plot_area} onChange={(e) => set('plot_area', e.target.value)} placeholder="e.g. 450 sqm" /></Field>
        <Field label="Built area"><input className={inputCls} value={f.built_area} onChange={(e) => set('built_area', e.target.value)} placeholder="e.g. 1,200 sqm" /></Field>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <ImageField label="Hero image" value={f.hero} onChange={(v) => set('hero', v)} folder={folder} hint="The project's card on the Projects page, and the top of its page" />
        <ImageField label="Main image" value={f.main_image} onChange={(v) => set('main_image', v)} folder={folder} hint="Beside the description. Leave empty to use the hero." />
      </div>
      <GalleryField label="Gallery" value={f.gallery} onChange={(v) => set('gallery', v)} folder={folder} />

      <div>
        <span className={labelCls}>Floor plans</span>
        <div className="space-y-2">
          {f.floor_plans.map((p, i) => (
            <div key={i} className="flex items-center gap-2">
              <img src={p.image} alt="" className="w-14 h-10 rounded object-cover bg-gray-100" />
              <input className={inputCls} value={p.label?.[lang] ?? ''} placeholder={lang === 'en' ? 'Ground floor' : p.label?.en}
                onChange={(e) => set('floor_plans', f.floor_plans.map((q, j) => (j === i ? { ...q, label: { ...q.label, [lang]: e.target.value } } : q)))} />
              <button type="button" onClick={() => set('floor_plans', f.floor_plans.filter((_, j) => j !== i))} className={iconBtn}><i className="ri-delete-bin-line text-sm" /></button>
            </div>
          ))}
          <div className="w-40">
            <ImageField label="" aspect="aspect-[3/1]" value="" folder={folder} onChange={(url) => url && set('floor_plans', [...f.floor_plans, { image: url, label: {} }])} />
          </div>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <VideoField label="Card video, WebM (optional, plays on hover)" value={f.video} onChange={(v) => set('video', v)} folder={folder} accept="video/webm" />
        <VideoField label="Card video, MP4 (for Safari)" value={f.video_mp4} onChange={(v) => set('video_mp4', v)} folder={folder} accept="video/mp4" />
      </div>
      {(f.video || f.video_mp4) && (
        <div className="w-60"><ImageField label="Video cover" value={f.thumb} onChange={(v) => set('thumb', v)} folder={folder} max={1400} hint="Shown on the card until the video plays" /></div>
      )}
    </Modal>
  );
}
