import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { invalidateSite, type JobRow, type JobText, type Lang } from '@/lib/site/content';
import { importDefaults } from './importDefaults';
import { Field, ImportBanner, LangTabs, LinesField, Modal, btnDark, btnLight, filledLangs, iconBtn, inputCls, swapOrder, useLive } from './shared';

const blank = (sort: number): JobRow => ({
  sort_order: sort, published: true,
  i18n: { en: { type: 'Full-time', location: 'Cebu', department: 'Design', responsibilities: [], requirements: [] }, es: {}, zh: {} },
});

export default function JobsTab() {
  const [live, refreshLive] = useLive('jobs');
  const [rows, setRows] = useState<JobRow[]>([]);
  const [applied, setApplied] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [editing, setEditing] = useState<JobRow | null>(null);
  const [deleting, setDeleting] = useState<JobRow | null>(null);
  const [error, setError] = useState('');

  const load = async () => {
    const [{ data }, { data: apps }] = await Promise.all([
      supabase.from('hub_job_postings').select('*').order('sort_order').order('created_at'),
      supabase.from('hub_job_applications').select('job_id').not('job_id', 'is', null),
    ]);
    setRows((data as JobRow[]) ?? []);
    const counts: Record<string, number> = {};
    for (const a of apps ?? []) counts[a.job_id as string] = (counts[a.job_id as string] ?? 0) + 1;
    setApplied(counts); setLoading(false);
  };
  useEffect(() => { load(); }, []);
  const runImport = async () => {
    setImporting(true); setError('');
    try { await importDefaults('jobs'); await load(); await refreshLive(); } catch (e) { setError((e as Error).message); }
    setImporting(false);
  };
  const togglePublished = async (r: JobRow) => {
    await supabase.from('hub_job_postings').update({ published: !r.published, updated_at: new Date().toISOString() }).eq('id', r.id!);
    invalidateSite('jobs'); load();
  };
  const move = async (i: number, d: number) => { await swapOrder('hub_job_postings', rows[i], rows[i + d]); load(); };
  const remove = async () => {
    if (!deleting) return;
    await supabase.from('hub_job_postings').delete().eq('id', deleting.id!);
    setDeleting(null); invalidateSite('jobs'); load();
  };

  if (loading || live === null) return <div className="flex justify-center py-12"><i className="ri-loader-4-line animate-spin text-xl text-gray-400" /></div>;
  if (!live) return <div className="space-y-3"><ImportBanner what="job posts" onImport={runImport} busy={importing} />{error && <p className="text-xs text-rose-500">{error}</p>}</div>;

  const open = rows.filter((r) => r.published).length;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-gray-500">{open ? `${open} open on the Careers page` : 'No open roles on the Careers page. Applicants can still send an open application.'}</p>
        <button onClick={() => setEditing(blank((rows.at(-1)?.sort_order ?? 0) + 10))} className={btnDark}><i className="ri-add-line" /> New job post</button>
      </div>
      <div className="space-y-3">
        {rows.map((r, i) => (
          <div key={r.id} className="bg-white border border-gray-100 rounded-xl p-4 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900">{r.i18n?.en?.title}</p>
              <p className="text-xs text-gray-400">
                {[r.i18n?.en?.location, r.i18n?.en?.type, r.i18n?.en?.department].filter(Boolean).join(' · ')}
                {applied[r.id!] ? <> · <a href="/hub/admin/applications" className="text-gray-600 underline">{applied[r.id!]} applicant{applied[r.id!] === 1 ? '' : 's'}</a></> : null}
              </p>
            </div>
            <button onClick={() => togglePublished(r)} className={`text-xs px-2 py-0.5 rounded-full font-medium cursor-pointer ${r.published ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>{r.published ? 'Open' : 'Closed'}</button>
            <button disabled={i === 0} onClick={() => move(i, -1)} className={iconBtn}><i className="ri-arrow-up-line text-sm" /></button>
            <button disabled={i === rows.length - 1} onClick={() => move(i, 1)} className={iconBtn}><i className="ri-arrow-down-line text-sm" /></button>
            <button onClick={() => setEditing(r)} className={iconBtn}><i className="ri-edit-line text-sm" /></button>
            <button onClick={() => setDeleting(r)} className={`${iconBtn} hover:!text-rose-500`}><i className="ri-delete-bin-line text-sm" /></button>
          </div>
        ))}
      </div>

      {editing && <JobEditor row={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
      {deleting && (
        <Modal title="Delete job post" onClose={() => setDeleting(null)} footer={<>
          <button onClick={() => setDeleting(null)} className={btnLight}>Cancel</button>
          <button onClick={remove} className="px-4 py-2 bg-rose-600 text-white text-sm rounded-lg hover:bg-rose-700 cursor-pointer">Delete</button>
        </>}>
          <p className="text-sm text-gray-600">
            Delete <strong>{deleting.i18n?.en?.title}</strong>?
            {applied[deleting.id!] ? ` Its ${applied[deleting.id!]} application${applied[deleting.id!] === 1 ? '' : 's'} stay in Applications.` : ''} To stop taking applications but keep the post, close it instead.
          </p>
        </Modal>
      )}
    </div>
  );
}

function JobEditor({ row, onClose, onSaved }: { row: JobRow; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<JobRow>(() => JSON.parse(JSON.stringify(row)));
  const [lang, setLang] = useState<Lang>('en');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const v = <K extends keyof JobText>(k: K) => f.i18n?.[lang]?.[k];
  const setV = <K extends keyof JobText>(k: K, val: JobText[K]) => setF((p) => ({ ...p, i18n: { ...p.i18n, [lang]: { ...p.i18n?.[lang], [k]: val } } }));
  const en = f.i18n?.en ?? {};
  const save = async () => {
    if (!en.title?.trim()) { setLang('en'); setError('Give the role an English title.'); return; }
    setSaving(true); setError('');
    const { id, ...rest } = f;
    const body = { ...rest, updated_at: new Date().toISOString() };
    const { error: e } = row.id ? await supabase.from('hub_job_postings').update(body).eq('id', id!) : await supabase.from('hub_job_postings').insert(body);
    setSaving(false);
    if (e) { setError(e.message); return; }
    invalidateSite('jobs'); onSaved();
  };
  return (
    <Modal wide title={row.id ? `Edit ${row.i18n?.en?.title}` : 'New job post'} onClose={onClose} footer={<>
      {error && <p className="text-xs text-rose-500 mr-auto self-center">{error}</p>}
      <button onClick={onClose} className={btnLight}>Cancel</button>
      <button onClick={save} disabled={saving} className={btnDark}>{saving && <i className="ri-loader-4-line animate-spin" />} Save</button>
    </>}>
      <div className="flex items-center justify-between gap-3">
        <LangTabs lang={lang} onChange={setLang} filled={filledLangs(f.i18n as never, 'title')} />
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input type="checkbox" checked={f.published} onChange={(e) => setF((p) => ({ ...p, published: e.target.checked }))} /> Open, on the Careers page
        </label>
      </div>
      {lang !== 'en' && <p className="text-[11px] text-gray-400 -mt-2">Leave a field blank to show the English on the {lang === 'es' ? 'Spanish' : 'Chinese'} site.</p>}
      <div className="grid sm:grid-cols-4 gap-3">
        <div className="sm:col-span-4"><Field label="Title"><input className={inputCls} value={(v('title') as string) ?? ''} onChange={(e) => setV('title', e.target.value)} placeholder={lang === 'en' ? 'Architect' : en.title} /></Field></div>
        <Field label="Type"><input className={inputCls} value={(v('type') as string) ?? ''} onChange={(e) => setV('type', e.target.value)} placeholder={lang === 'en' ? 'Full-time' : en.type} /></Field>
        <Field label="Location"><input className={inputCls} value={(v('location') as string) ?? ''} onChange={(e) => setV('location', e.target.value)} placeholder={lang === 'en' ? 'Cebu' : en.location} /></Field>
        <div className="sm:col-span-2"><Field label="Team"><input className={inputCls} value={(v('department') as string) ?? ''} onChange={(e) => setV('department', e.target.value)} placeholder={lang === 'en' ? 'Design' : en.department} /></Field></div>
      </div>
      <Field label="About the role"><textarea className={`${inputCls} min-h-[100px]`} value={(v('summary') as string) ?? ''} onChange={(e) => setV('summary', e.target.value)} /></Field>
      <div className="grid sm:grid-cols-2 gap-3">
        <LinesField label="What you'll do" value={(v('responsibilities') as string[]) ?? []} onChange={(x) => setV('responsibilities', x)} />
        <LinesField label="What we're looking for" value={(v('requirements') as string[]) ?? []} onChange={(x) => setV('requirements', x)} />
      </div>
    </Modal>
  );
}
