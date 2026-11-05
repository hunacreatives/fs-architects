// Building blocks for Admin → Website: the language tabs, image/video fields that upload to the site-media bucket,
// reorder/publish helpers, and the "live" switch that hands a section of the public site over to these tables.
import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '@/lib/supabase';
import { LANGS, type Lang, invalidateSite } from '@/lib/site/content';

export type Section = 'projects' | 'team' | 'hero' | 'jobs' | 'contact';
export const TABLES: Record<Exclude<Section, 'contact'>, string> = { projects: 'site_projects', team: 'site_team', hero: 'site_hero_slides', jobs: 'hub_job_postings' };

// ── the live switch ───────────────────────────────────────────────────────────────────────────────────────────────
export async function getLive(): Promise<Record<string, boolean>> {
  const { data } = await supabase.from('site_settings').select('value').eq('key', 'live').maybeSingle();
  return (data?.value as Record<string, boolean>) ?? {};
}
export async function setLive(section: Section) {
  const live = await getLive();
  await supabase.from('site_settings').upsert({ key: 'live', value: { ...live, [section]: true }, updated_at: new Date().toISOString() });
  invalidateSite();
}
export function useLive(section: Section): [boolean | null, () => Promise<void>] {
  const [live, setL] = useState<boolean | null>(null);
  const refresh = async () => setL(!!(await getLive())[section]);
  useEffect(() => { refresh(); }, [section]); // eslint-disable-line react-hooks/exhaustive-deps
  return [live, refresh];
}

// ── uploads ───────────────────────────────────────────────────────────────────────────────────────────────────────
/** Images go up as WebP, no wider than `max` px (the site never needs more); videos go up as they are. */
export async function uploadSiteMedia(file: File, folder: string, max = 2400): Promise<string> {
  let body: Blob = file, ext = file.name.split('.').pop()?.toLowerCase() || 'bin', type = file.type;
  if (file.type.startsWith('image/') && file.type !== 'image/svg+xml' && file.type !== 'image/gif') {
    const img = await createImageBitmap(file);
    const k = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    body = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not convert the image'))), 'image/webp', 0.86));
    ext = 'webp'; type = 'image/webp';
  }
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from('site-media').upload(path, body, { contentType: type, cacheControl: '31536000', upsert: false });
  if (error) throw error;
  return supabase.storage.from('site-media').getPublicUrl(path).data.publicUrl;
}

// ── small pieces of UI, in the hub's style ────────────────────────────────────────────────────────────────────────
export const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-gray-400 bg-white';
export const labelCls = 'block text-xs font-medium text-gray-500 mb-1';
export const btnDark = 'flex items-center gap-1.5 px-4 py-2 bg-[#111827] text-white text-sm rounded-lg hover:bg-gray-800 transition-colors cursor-pointer disabled:opacity-50';
export const btnLight = 'flex items-center gap-1.5 px-3 py-2 border border-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-50 transition-colors cursor-pointer disabled:opacity-50';
export const iconBtn = 'p-1.5 text-gray-400 hover:text-gray-700 cursor-pointer transition-colors rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:cursor-default';

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className={labelCls}>{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-gray-400 mt-1">{hint}</span>}
    </label>
  );
}

/** English, Español, 中文: English is required; a blank translation shows the English on the site. */
export function LangTabs({ lang, onChange, filled }: { lang: Lang; onChange: (l: Lang) => void; filled?: Partial<Record<Lang, boolean>> }) {
  return (
    <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 w-fit">
      {LANGS.map((l) => (
        <button key={l.code} type="button" onClick={() => onChange(l.code)}
          className={`px-3 py-1 rounded-md text-xs font-medium cursor-pointer transition-colors ${lang === l.code ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}>
          {l.label}{l.code !== 'en' && filled && !filled[l.code] && <span className="ml-1 text-gray-400">·</span>}
        </button>
      ))}
    </div>
  );
}

export function ImageField({ label, value, onChange, folder, max, hint, aspect = 'aspect-[4/3]' }: {
  label: string; value: string; onChange: (url: string) => void; folder: string; max?: number; hint?: string; aspect?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const pick = async (f?: File) => {
    if (!f) return;
    setBusy(true); setErr('');
    try { onChange(await uploadSiteMedia(f, folder, max)); } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };
  return (
    <div>
      <span className={labelCls}>{label}</span>
      <label className={`relative block ${aspect} rounded-lg border border-dashed border-gray-300 bg-gray-50 overflow-hidden cursor-pointer hover:border-gray-400`}>
        {value
          ? <img src={value} alt="" className="absolute inset-0 w-full h-full object-cover" />
          : <span className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 text-xs gap-1"><i className="ri-image-add-line text-xl" />Upload image</span>}
        {busy && <span className="absolute inset-0 flex items-center justify-center bg-white/70"><i className="ri-loader-4-line animate-spin text-gray-500" /></span>}
        <input type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
      </label>
      {value && <button type="button" onClick={() => onChange('')} className="text-[11px] text-gray-400 hover:text-rose-500 mt-1 cursor-pointer">Remove</button>}
      {hint && <span className="block text-[11px] text-gray-400 mt-1">{hint}</span>}
      {err && <span className="block text-[11px] text-rose-500 mt-1">{err}</span>}
    </div>
  );
}

export function VideoField({ label, value, onChange, folder, accept }: { label: string; value: string; onChange: (url: string) => void; folder: string; accept: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const pick = async (f?: File) => {
    if (!f) return;
    if (f.size > 45 * 1024 * 1024) { setErr('Keep videos under 45 MB'); return; }
    setBusy(true); setErr('');
    try { onChange(await uploadSiteMedia(f, folder)); } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };
  return (
    <div>
      <span className={labelCls}>{label}</span>
      <div className="flex items-center gap-2">
        <label className={btnLight}>
          {busy ? <i className="ri-loader-4-line animate-spin" /> : <i className="ri-upload-2-line" />} {value ? 'Replace' : 'Upload'}
          <input type="file" accept={accept} className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
        </label>
        {value && <><span className="text-xs text-gray-500 truncate max-w-[180px]">{decodeURIComponent(value.split('/').pop() || '')}</span>
          <button type="button" onClick={() => onChange('')} className="text-[11px] text-gray-400 hover:text-rose-500 cursor-pointer">Remove</button></>}
      </div>
      {err && <span className="block text-[11px] text-rose-500 mt-1">{err}</span>}
    </div>
  );
}

/** A row of images: add several at once, drag order with the arrows, remove. */
export function GalleryField({ label, value, onChange, folder }: { label: string; value: string[]; onChange: (v: string[]) => void; folder: string }) {
  const [busy, setBusy] = useState(0);
  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    const list = [...files];
    setBusy(list.length);
    const urls: string[] = [];
    for (const f of list) { try { urls.push(await uploadSiteMedia(f, folder)); } catch { /* skip that one */ } setBusy((n) => n - 1); }
    onChange([...value, ...urls]);
  };
  const move = (i: number, d: number) => { const v = [...value]; [v[i], v[i + d]] = [v[i + d], v[i]]; onChange(v); };
  return (
    <div>
      <span className={labelCls}>{label} <span className="text-gray-400 font-normal">· {value.length}</span></span>
      <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
        {value.map((src, i) => (
          <div key={src + i} className="relative aspect-square rounded-md overflow-hidden bg-gray-100 group">
            <img src={src} alt="" loading="lazy" className="w-full h-full object-cover" />
            <div className="absolute inset-x-0 bottom-0 flex justify-between bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity">
              <button type="button" disabled={i === 0} onClick={() => move(i, -1)} className="px-1.5 py-0.5 text-white text-xs disabled:opacity-30 cursor-pointer"><i className="ri-arrow-left-s-line" /></button>
              <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))} className="px-1.5 py-0.5 text-white text-xs cursor-pointer"><i className="ri-delete-bin-line" /></button>
              <button type="button" disabled={i === value.length - 1} onClick={() => move(i, 1)} className="px-1.5 py-0.5 text-white text-xs disabled:opacity-30 cursor-pointer"><i className="ri-arrow-right-s-line" /></button>
            </div>
          </div>
        ))}
        <label className="aspect-square rounded-md border border-dashed border-gray-300 flex flex-col items-center justify-center text-gray-400 text-[11px] cursor-pointer hover:border-gray-400">
          {busy ? <><i className="ri-loader-4-line animate-spin" />{busy} left</> : <><i className="ri-add-line text-lg" />Add</>}
          <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => add(e.target.files)} />
        </label>
      </div>
    </div>
  );
}

/** One line per item, for bullet lists. */
export function LinesField({ label, value, onChange, hint }: { label: string; value: string[]; onChange: (v: string[]) => void; hint?: string }) {
  return (
    <Field label={label} hint={hint ?? 'One per line'}>
      <textarea className={`${inputCls} min-h-[110px]`} value={(value ?? []).join('\n')}
        onChange={(e) => onChange(e.target.value.split('\n'))}
        onBlur={(e) => onChange(e.target.value.split('\n').map((l) => l.trim()).filter(Boolean))} />
    </Field>
  );
}

// rendered on <body>: the hub's glass panels would otherwise trap a fixed overlay inside them and clip its top
export function Modal({ title, onClose, children, footer, wide }: { title: string; onClose: () => void; children: ReactNode; footer: ReactNode; wide?: boolean }) {
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 sm:p-4">
      <div className={`bg-white rounded-t-2xl sm:rounded-2xl w-full ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'} max-h-[92vh] flex flex-col`}>
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className={iconBtn}><i className="ri-close-line text-lg" /></button>
        </div>
        <div className="p-5 overflow-y-auto space-y-4 flex-1">{children}</div>
        <div className="p-4 border-t border-gray-100 flex justify-end gap-2">{footer}</div>
      </div>
    </div>,
    document.body,
  );
}

/** The banner a section shows until it's been imported from the live website. */
export function ImportBanner({ what, onImport, busy }: { what: string; onImport: () => void; busy: boolean }) {
  return (
    <div className="bg-amber-50 border border-amber-100 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
      <div>
        <p className="text-sm font-medium text-amber-900">The website is still showing its built-in {what}.</p>
        <p className="text-xs text-amber-800/80 mt-0.5">Import them once to edit them here. The website looks exactly the same afterwards.</p>
      </div>
      <button onClick={onImport} disabled={busy} className={btnDark}>
        {busy ? <i className="ri-loader-4-line animate-spin" /> : <i className="ri-download-2-line" />} Import from the live website
      </button>
    </div>
  );
}

/** Swap two neighbours' sort order. */
export async function swapOrder(table: string, a: { id?: string; sort_order: number }, b: { id?: string; sort_order: number }) {
  await Promise.all([
    supabase.from(table).update({ sort_order: b.sort_order }).eq('id', a.id!),
    supabase.from(table).update({ sort_order: a.sort_order }).eq('id', b.id!),
  ]);
  invalidateSite();
}

export const filledLangs = (i18n: Partial<Record<Lang, Record<string, unknown>>> | undefined, key: string) =>
  Object.fromEntries(LANGS.map((l) => [l.code, !!i18n?.[l.code]?.[key]])) as Partial<Record<Lang, boolean>>;
