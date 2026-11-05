import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { invalidateSite, type Lang, type TeamRow, type TeamText } from '@/lib/site/content';
import { importDefaults } from './importDefaults';
import { Field, ImageField, ImportBanner, LangTabs, Modal, btnDark, btnLight, filledLangs, iconBtn, inputCls, labelCls, swapOrder, useLive } from './shared';

const blank = (sort: number): TeamRow => ({
  key: '', sort_order: sort, published: true, photo: '', photo_shift: '-18%', photo_shift_x: '', photo_scale: 1.5, credentials: [], i18n: { en: {}, es: {}, zh: {} },
});
const pct = (v: string) => parseFloat(v || '0') || 0;

export default function TeamTab() {
  const [live, refreshLive] = useLive('team');
  const [rows, setRows] = useState<TeamRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [editing, setEditing] = useState<TeamRow | null>(null);
  const [deleting, setDeleting] = useState<TeamRow | null>(null);
  const [error, setError] = useState('');

  const load = async () => {
    const { data } = await supabase.from('site_team').select('*').order('sort_order').order('created_at');
    setRows((data as TeamRow[]) ?? []); setLoading(false);
  };
  useEffect(() => { load(); }, []);
  const runImport = async () => {
    setImporting(true); setError('');
    try { await importDefaults('team'); await load(); await refreshLive(); } catch (e) { setError((e as Error).message); }
    setImporting(false);
  };
  const togglePublished = async (r: TeamRow) => {
    await supabase.from('site_team').update({ published: !r.published, updated_at: new Date().toISOString() }).eq('id', r.id!);
    invalidateSite('team'); load();
  };
  const move = async (i: number, d: number) => { await swapOrder('site_team', rows[i], rows[i + d]); load(); };
  const remove = async () => {
    if (!deleting) return;
    await supabase.from('site_team').delete().eq('id', deleting.id!);
    setDeleting(null); invalidateSite('team'); load();
  };

  if (loading || live === null) return <div className="flex justify-center py-12"><i className="ri-loader-4-line animate-spin text-xl text-gray-400" /></div>;
  if (!live) return <div className="space-y-3"><ImportBanner what="team" onImport={runImport} busy={importing} />{error && <p className="text-xs text-rose-500">{error}</p>}</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-gray-500">{rows.filter((r) => r.published).length} on the Studio page, in this order</p>
        <button onClick={() => setEditing(blank((rows.at(-1)?.sort_order ?? 0) + 10))} className={btnDark}><i className="ri-add-line" /> Add a person</button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        {rows.map((r, i) => (
          <div key={r.id} className="bg-white border border-gray-100 rounded-xl overflow-hidden">
            <Portrait row={r} />
            <div className="p-2.5">
              <p className="text-sm font-medium text-gray-900 truncate">{r.i18n?.en?.name}</p>
              <p className="text-[11px] text-gray-400 truncate">{r.i18n?.en?.title}</p>
              <div className="flex items-center justify-between mt-1.5">
                <button onClick={() => togglePublished(r)} className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium cursor-pointer ${r.published ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>{r.published ? 'Shown' : 'Hidden'}</button>
                <div className="flex">
                  <button disabled={i === 0} onClick={() => move(i, -1)} className={iconBtn} title="Earlier"><i className="ri-arrow-left-line text-xs" /></button>
                  <button disabled={i === rows.length - 1} onClick={() => move(i, 1)} className={iconBtn} title="Later"><i className="ri-arrow-right-line text-xs" /></button>
                  <button onClick={() => setEditing(r)} className={iconBtn} title="Edit"><i className="ri-edit-line text-xs" /></button>
                  <button onClick={() => setDeleting(r)} className={`${iconBtn} hover:!text-rose-500`} title="Remove"><i className="ri-delete-bin-line text-xs" /></button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {editing && <TeamEditor row={editing} keys={rows.filter((r) => r.id !== editing.id).map((r) => r.key)} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
      {deleting && (
        <Modal title="Remove from the team" onClose={() => setDeleting(null)} footer={<>
          <button onClick={() => setDeleting(null)} className={btnLight}>Cancel</button>
          <button onClick={remove} className="px-4 py-2 bg-rose-600 text-white text-sm rounded-lg hover:bg-rose-700 cursor-pointer">Remove</button>
        </>}>
          <p className="text-sm text-gray-600">Remove <strong>{deleting.i18n?.en?.name}</strong> from the Studio page? To take them off for now, hide them instead.</p>
        </Modal>
      )}
    </div>
  );
}

/** The portrait cropped exactly as the Studio page's card crops it. */
function Portrait({ row }: { row: TeamRow }) {
  return (
    <div className="relative overflow-hidden bg-[#1a2028]" style={{ aspectRatio: '3 / 4' }}>
      {row.photo && (
        <img src={row.photo} alt="" className="w-full h-full object-cover block" style={{
          objectPosition: 'top center', transformOrigin: 'top center',
          transform: `scale(${row.photo_scale ?? 1.5}) translateX(${row.photo_shift_x || '0%'}) translateY(${row.photo_shift || '0%'})`,
        }} />
      )}
    </div>
  );
}

function TeamEditor({ row, keys, onClose, onSaved }: { row: TeamRow; keys: string[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<TeamRow>(() => JSON.parse(JSON.stringify(row)));
  const [lang, setLang] = useState<Lang>('en');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = <K extends keyof TeamRow>(k: K, v: TeamRow[K]) => setF((p) => ({ ...p, [k]: v }));
  const text = (k: keyof TeamText) => (f.i18n?.[lang]?.[k] as string) ?? '';
  const setText = (k: keyof TeamText, v: string) => setF((p) => ({ ...p, i18n: { ...p.i18n, [lang]: { ...p.i18n?.[lang], [k]: v } } }));
  const isNew = !row.id;

  const save = async () => {
    const name = f.i18n?.en?.name?.trim();
    if (!name) { setLang('en'); setError('Add their name in English.'); return; }
    let key = f.key || name.toLowerCase().split(/\s+/)[0].replace(/[^a-z0-9]/g, '');
    while (keys.includes(key)) key += '-2';
    setSaving(true); setError('');
    const { id, ...rest } = f;
    const body = { ...rest, key, credentials: f.credentials.filter((c) => c.label.trim() || c.value.trim()), updated_at: new Date().toISOString() };
    const { error: e } = isNew ? await supabase.from('site_team').insert(body) : await supabase.from('site_team').update(body).eq('id', id!);
    setSaving(false);
    if (e) { setError(e.message); return; }
    invalidateSite('team'); onSaved();
  };

  return (
    <Modal wide title={isNew ? 'Add a person' : `Edit ${row.i18n?.en?.name}`} onClose={onClose} footer={<>
      {error && <p className="text-xs text-rose-500 mr-auto self-center">{error}</p>}
      <button onClick={onClose} className={btnLight}>Cancel</button>
      <button onClick={save} disabled={saving} className={btnDark}>{saving && <i className="ri-loader-4-line animate-spin" />} Save</button>
    </>}>
      <div className="flex items-center justify-between gap-3">
        <LangTabs lang={lang} onChange={setLang} filled={filledLangs(f.i18n as never, 'bio')} />
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input type="checkbox" checked={f.published} onChange={(e) => set('published', e.target.checked)} /> Show on the Studio page
        </label>
      </div>
      <div className="grid sm:grid-cols-[1fr_180px] gap-5">
        <div className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Name"><input className={inputCls} value={text('name')} onChange={(e) => setText('name', e.target.value)} placeholder={lang === 'en' ? '' : f.i18n?.en?.name} /></Field>
            <Field label="Title"><input className={inputCls} value={text('title')} onChange={(e) => setText('title', e.target.value)} placeholder={lang === 'en' ? 'Junior Architect' : f.i18n?.en?.title} /></Field>
          </div>
          <Field label="Bio" hint="A blank line starts a new paragraph"><textarea className={`${inputCls} min-h-[160px]`} value={text('bio')} onChange={(e) => setText('bio', e.target.value)} /></Field>
          <div>
            <span className={labelCls}>Details <span className="text-gray-400 font-normal">· shown under the bio, e.g. Education, License, Experience</span></span>
            <div className="space-y-2">
              {f.credentials.map((c, i) => (
                <div key={i} className="flex gap-2">
                  <input className={`${inputCls} w-36`} value={c.label} placeholder="Label" onChange={(e) => set('credentials', f.credentials.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                  <input className={inputCls} value={c.value} placeholder="Value" onChange={(e) => set('credentials', f.credentials.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} />
                  <button type="button" onClick={() => set('credentials', f.credentials.filter((_, j) => j !== i))} className={iconBtn}><i className="ri-delete-bin-line text-sm" /></button>
                </div>
              ))}
              <button type="button" onClick={() => set('credentials', [...f.credentials, { label: '', value: '' }])} className={btnLight}><i className="ri-add-line" /> Add a detail</button>
            </div>
          </div>
        </div>
        <div className="space-y-3">
          <ImageField label="Portrait" value={f.photo} onChange={(v) => set('photo', v)} folder={`team/${f.key || 'new'}`} max={1600} aspect="aspect-[3/4]" />
          {f.photo && (
            <>
              <span className={labelCls}>On the Studio page</span>
              <div className="rounded-2xl overflow-hidden"><Portrait row={f} /></div>
              <Field label={`Zoom · ${(f.photo_scale ?? 1.5).toFixed(2)}×`}>
                <input type="range" min={1} max={2.4} step={0.05} value={f.photo_scale ?? 1.5} onChange={(e) => set('photo_scale', parseFloat(e.target.value))} className="w-full" />
              </Field>
              <Field label={`Up / down · ${pct(f.photo_shift)}%`}>
                <input type="range" min={-40} max={10} step={1} value={pct(f.photo_shift)} onChange={(e) => set('photo_shift', `${e.target.value}%`)} className="w-full" />
              </Field>
              <Field label={`Left / right · ${pct(f.photo_shift_x)}%`}>
                <input type="range" min={-25} max={25} step={1} value={pct(f.photo_shift_x)} onChange={(e) => set('photo_shift_x', `${e.target.value}%`)} className="w-full" />
              </Field>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
