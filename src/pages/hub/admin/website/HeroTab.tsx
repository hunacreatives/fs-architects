import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { invalidateSite, type HeroRow } from '@/lib/site/content';
import { importDefaults } from './importDefaults';
import { Field, ImageField, ImportBanner, Modal, VideoField, btnDark, btnLight, iconBtn, inputCls, swapOrder, useLive } from './shared';

const blank = (sort: number): HeroRow => ({ sort_order: sort, published: true, image: '', video: '', video_mp4: '', title: '', location: '', year: String(new Date().getFullYear()) });

export default function HeroTab() {
  const [live, refreshLive] = useLive('hero');
  const [rows, setRows] = useState<HeroRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [editing, setEditing] = useState<HeroRow | null>(null);
  const [deleting, setDeleting] = useState<HeroRow | null>(null);
  const [error, setError] = useState('');

  const load = async () => {
    const { data } = await supabase.from('site_hero_slides').select('*').order('sort_order').order('created_at');
    setRows((data as HeroRow[]) ?? []); setLoading(false);
  };
  useEffect(() => { load(); }, []);
  const runImport = async () => {
    setImporting(true); setError('');
    try { await importDefaults('hero'); await load(); await refreshLive(); } catch (e) { setError((e as Error).message); }
    setImporting(false);
  };
  const shownCount = rows.filter((r) => r.published).length;
  const togglePublished = async (r: HeroRow) => {
    if (r.published && shownCount === 1) { setError('The homepage needs at least one slide.'); return; }
    setError('');
    await supabase.from('site_hero_slides').update({ published: !r.published, updated_at: new Date().toISOString() }).eq('id', r.id!);
    invalidateSite('hero'); load();
  };
  const move = async (i: number, d: number) => { await swapOrder('site_hero_slides', rows[i], rows[i + d]); load(); };
  const remove = async () => {
    if (!deleting) return;
    await supabase.from('site_hero_slides').delete().eq('id', deleting.id!);
    setDeleting(null); invalidateSite('hero'); load();
  };

  if (loading || live === null) return <div className="flex justify-center py-12"><i className="ri-loader-4-line animate-spin text-xl text-gray-400" /></div>;
  if (!live) return <div className="space-y-3"><ImportBanner what="homepage slides" onImport={runImport} busy={importing} />{error && <p className="text-xs text-rose-500">{error}</p>}</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-gray-500">{shownCount} slide{shownCount === 1 ? '' : 's'} rotating on the homepage, in this order</p>
        <button onClick={() => setEditing(blank((rows.at(-1)?.sort_order ?? 0) + 10))} className={btnDark}><i className="ri-add-line" /> Add a slide</button>
      </div>
      {error && <p className="text-xs text-rose-500">{error}</p>}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {rows.map((r, i) => (
          <div key={r.id} className={`bg-white border border-gray-100 rounded-xl overflow-hidden ${r.published ? '' : 'opacity-60'}`}>
            <div className="relative aspect-video bg-gray-100">
              <img src={r.image} alt="" loading="lazy" className="w-full h-full object-cover" />
              {r.video && <span className="absolute top-2 left-2 text-[10px] px-1.5 py-0.5 rounded bg-black/60 text-white"><i className="ri-film-line" /> Video</span>}
              <span className="absolute top-2 right-2 text-[10px] px-1.5 py-0.5 rounded bg-black/60 text-white">{i + 1}</span>
            </div>
            <div className="p-3 flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{r.title}</p>
                <p className="text-xs text-gray-400 truncate">{r.location} · {r.year}</p>
              </div>
              <button onClick={() => togglePublished(r)} className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium cursor-pointer ${r.published ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>{r.published ? 'Shown' : 'Hidden'}</button>
              <button disabled={i === 0} onClick={() => move(i, -1)} className={iconBtn}><i className="ri-arrow-up-line text-sm" /></button>
              <button disabled={i === rows.length - 1} onClick={() => move(i, 1)} className={iconBtn}><i className="ri-arrow-down-line text-sm" /></button>
              <button onClick={() => setEditing(r)} className={iconBtn}><i className="ri-edit-line text-sm" /></button>
              <button onClick={() => (r.published && shownCount === 1 ? setError('The homepage needs at least one slide.') : setDeleting(r))} className={`${iconBtn} hover:!text-rose-500`}><i className="ri-delete-bin-line text-sm" /></button>
            </div>
          </div>
        ))}
      </div>

      {editing && <HeroEditor row={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
      {deleting && (
        <Modal title="Delete slide" onClose={() => setDeleting(null)} footer={<>
          <button onClick={() => setDeleting(null)} className={btnLight}>Cancel</button>
          <button onClick={remove} className="px-4 py-2 bg-rose-600 text-white text-sm rounded-lg hover:bg-rose-700 cursor-pointer">Delete</button>
        </>}>
          <p className="text-sm text-gray-600">Delete the <strong>{deleting.title}</strong> slide from the homepage?</p>
        </Modal>
      )}
    </div>
  );
}

function HeroEditor({ row, onClose, onSaved }: { row: HeroRow; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<HeroRow>({ ...row });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = <K extends keyof HeroRow>(k: K, v: HeroRow[K]) => setF((p) => ({ ...p, [k]: v }));
  const save = async () => {
    if (!f.image) { setError('Add the slide image.'); return; }
    if (!f.title.trim()) { setError('Add the project name.'); return; }
    setSaving(true); setError('');
    const { id, ...rest } = f;
    const body = { ...rest, updated_at: new Date().toISOString() };
    const { error: e } = row.id ? await supabase.from('site_hero_slides').update(body).eq('id', id!) : await supabase.from('site_hero_slides').insert(body);
    setSaving(false);
    if (e) { setError(e.message); return; }
    invalidateSite('hero'); onSaved();
  };
  return (
    <Modal wide title={row.id ? `Edit ${row.title}` : 'Add a slide'} onClose={onClose} footer={<>
      {error && <p className="text-xs text-rose-500 mr-auto self-center">{error}</p>}
      <button onClick={onClose} className={btnLight}>Cancel</button>
      <button onClick={save} disabled={saving} className={btnDark}>{saving && <i className="ri-loader-4-line animate-spin" />} Save</button>
    </>}>
      <ImageField label="Slide image" value={f.image} onChange={(v) => set('image', v)} folder="hero" max={2800} aspect="aspect-video" hint="Landscape, full width. It slowly zooms while it's on screen." />
      <div className="grid sm:grid-cols-3 gap-3">
        <Field label="Project name"><input className={inputCls} value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="BYD Zamboanga" /></Field>
        <Field label="Location"><input className={inputCls} value={f.location} onChange={(e) => set('location', e.target.value)} placeholder="Zamboanga City" /></Field>
        <Field label="Year"><input className={inputCls} value={f.year} onChange={(e) => set('year', e.target.value)} /></Field>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <VideoField label="Film, WebM (optional, plays instead of the image)" value={f.video} onChange={(v) => set('video', v)} folder="hero" accept="video/webm" />
        <VideoField label="Film, MP4 (for Safari)" value={f.video_mp4} onChange={(v) => set('video_mp4', v)} folder="hero" accept="video/mp4" />
      </div>
      <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
        <input type="checkbox" checked={f.published} onChange={(e) => set('published', e.target.checked)} /> Show on the homepage
      </label>
    </Modal>
  );
}
