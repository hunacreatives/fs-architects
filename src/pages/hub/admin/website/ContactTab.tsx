import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { invalidateSite, type ContactValue, type Lang } from '@/lib/site/content';
import { importDefaults } from './importDefaults';
import { Field, ImportBanner, LangTabs, btnDark, btnLight, iconBtn, inputCls, labelCls, useLive } from './shared';

const NETWORKS: Record<string, string> = {
  Instagram: 'ri-instagram-line', Facebook: 'ri-facebook-line', LinkedIn: 'ri-linkedin-box-line',
  YouTube: 'ri-youtube-line', TikTok: 'ri-tiktok-line', X: 'ri-twitter-x-line', Pinterest: 'ri-pinterest-line', Behance: 'ri-behance-line',
};

export default function ContactTab() {
  const [live, refreshLive] = useLive('contact');
  const [f, setF] = useState<ContactValue | null>(null);
  const [lang, setLang] = useState<Lang>('en');
  const [importing, setImporting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = async () => {
    const { data } = await supabase.from('site_settings').select('value').eq('key', 'contact').maybeSingle();
    setF((data?.value as ContactValue) ?? null);
  };
  useEffect(() => { load(); }, []);
  const runImport = async () => {
    setImporting(true); setMsg(null);
    try { await importDefaults('contact'); await load(); await refreshLive(); } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
    setImporting(false);
  };
  const save = async () => {
    if (!f) return;
    if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) { setMsg({ ok: false, text: 'Enter a valid email address.' }); return; }
    setSaving(true); setMsg(null);
    const value = { ...f, email: f.email.trim(), socials: f.socials.filter((s) => s.href.trim()) };
    const { error } = await supabase.from('site_settings').upsert({ key: 'contact', value, updated_at: new Date().toISOString() });
    setSaving(false);
    if (error) { setMsg({ ok: false, text: error.message }); return; }
    invalidateSite('contact'); setMsg({ ok: true, text: 'Saved. The website shows the new details now.' });
  };

  if (live === null) return <div className="flex justify-center py-12"><i className="ri-loader-4-line animate-spin text-xl text-gray-400" /></div>;
  if (!live || !f) return <div className="space-y-3"><ImportBanner what="contact details" onImport={runImport} busy={importing} />{msg && <p className="text-xs text-rose-500">{msg.text}</p>}</div>;

  const set = <K extends keyof ContactValue>(k: K, v: ContactValue[K]) => setF((p) => (p ? { ...p, [k]: v } : p));
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-5 space-y-5 max-w-2xl">
      <p className="text-xs text-gray-400">Shown on the Contact page and in the footer of every page.</p>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Email" hint="The address on the website. Contact form messages still go to info@fsarchitects.ph.">
          <input className={inputCls} value={f.email} onChange={(e) => set('email', e.target.value)} />
        </Field>
        <Field label="Phone" hint="Optional. Leave empty to hide it.">
          <input className={inputCls} value={f.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+63 9XX XXX XXXX" />
        </Field>
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between"><span className={labelCls}>Address</span><LangTabs lang={lang} onChange={setLang} /></div>
        <input className={inputCls} value={f.address?.[lang] ?? ''} placeholder={lang === 'en' ? 'Cebu City, Philippines' : f.address?.en}
          onChange={(e) => set('address', { ...f.address, [lang]: e.target.value })} />
      </div>
      <div>
        <span className={labelCls}>Social links</span>
        <div className="space-y-2">
          {f.socials.map((s, i) => (
            <div key={i} className="flex gap-2">
              <select className={`${inputCls} w-36`} value={s.label}
                onChange={(e) => set('socials', f.socials.map((x, j) => (j === i ? { ...x, label: e.target.value, icon: NETWORKS[e.target.value] ?? x.icon } : x)))}>
                {Object.keys(NETWORKS).map((n) => <option key={n}>{n}</option>)}
              </select>
              <input className={inputCls} value={s.href} placeholder="https://…" onChange={(e) => set('socials', f.socials.map((x, j) => (j === i ? { ...x, href: e.target.value } : x)))} />
              <button type="button" onClick={() => set('socials', f.socials.filter((_, j) => j !== i))} className={iconBtn}><i className="ri-delete-bin-line text-sm" /></button>
            </div>
          ))}
          <button type="button" onClick={() => set('socials', [...f.socials, { label: 'Instagram', icon: NETWORKS.Instagram, href: '' }])} className={btnLight}><i className="ri-add-line" /> Add a link</button>
        </div>
      </div>
      <div className="flex items-center gap-3 pt-1">
        <button onClick={save} disabled={saving} className={btnDark}>{saving && <i className="ri-loader-4-line animate-spin" />} Save</button>
        {msg && <p className={`text-xs ${msg.ok ? 'text-emerald-600' : 'text-rose-500'}`}>{msg.text}</p>}
      </div>
    </div>
  );
}
