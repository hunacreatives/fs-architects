// The website's editable content (projects, team, homepage hero, contact details, job posts), read from the hub's
// Website tables (see site-content.sql). Each section keeps the site's built-in content (./defaults) until the hub takes
// it over, and whenever the database can't be reached, so the live site never goes blank. Text comes in the visitor's language, falling back
// to English. The last copy from the database is kept in the browser, so repeat visits render instantly.
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { DEFAULT_CONTACT, DEFAULT_HERO, DEFAULT_JOBS, DEFAULT_PROJECTS, DEFAULT_TEAM } from './defaults';

export type Lang = 'en' | 'es' | 'zh';
/** The projects page's filters, and the cities its map can pin (Leyte is listed but has no pin). */
export const PROJECT_CATEGORIES = ['Healthcare', 'Hospitality', 'Mixed Use', 'Offices', 'Residential', 'Retail', 'Interior Design'];
export const MAP_CITIES = ['Manila', 'Bataan', 'Cavite', 'Bacolod', 'Cebu', 'Leyte', 'Butuan', 'Iligan', 'CDO', 'Ozamiz', 'Tagum', 'Davao', 'Zamboanga'];
export const LANGS: { code: Lang; label: string }[] = [{ code: 'en', label: 'English' }, { code: 'es', label: 'Español' }, { code: 'zh', label: '中文' }];
export type I18n<T> = Partial<Record<Lang, Partial<T>>>;

// ── rows as stored ────────────────────────────────────────────────────────────────────────────────────────────────
export interface ProjectText { name: string; address: string; category: string; description: string; quote: string }
export interface ProjectRow {
  id?: string; slug: string; sort_order: number; published: boolean; year: string; location: string;
  lat: number | null; lng: number | null; category: string; thumb: string; hero: string; main_image: string;
  gallery: string[]; floor_plans: { image: string; label: Partial<Record<Lang, string>> }[];
  video: string; video_mp4: string; floors: string; plot_area: string; built_area: string; i18n: I18n<ProjectText>;
}
export interface TeamText { name: string; title: string; bio: string }
export interface TeamRow {
  id?: string; key: string; sort_order: number; published: boolean; photo: string; photo_shift: string; photo_shift_x: string;
  photo_scale: number | null; credentials: { label: string; value: string }[]; i18n: I18n<TeamText>;
}
export interface HeroRow {
  id?: string; sort_order: number; published: boolean; image: string; video: string; video_mp4: string;
  title: string; location: string; year: string;
}
export interface JobText { title: string; type: string; location: string; department: string; summary: string; responsibilities: string[]; requirements: string[] }
export interface JobRow { id?: string; sort_order: number; published: boolean; i18n: I18n<JobText> }
export interface ContactValue {
  email: string; phone: string; address: Partial<Record<Lang, string>>;
  socials: { icon: string; label: string; href: string }[];
}

// ── what the pages use ────────────────────────────────────────────────────────────────────────────────────────────
export interface SiteProject {
  slug: string; year: string; location: string; lat: number; lng: number; category: string;
  thumb: string; hero: string; main: string; gallery: string[]; floorPlans: { image: string; label: string }[];
  video: string; videoMp4: string; floors: string; plotArea: string; builtArea: string;
  name: string; address: string; categoryLabel: string; description: string; quote: string;
  nameEn: string; addressEn: string;
}
export interface SiteTeamMember { key: string; name: string; title: string; bio: string; img: string; imgShift?: string; imgShiftX?: string; imgScale?: number; credentials: { label: string; value: string }[] }
export interface SiteHeroSlide { src: string; title: string; location: string; year: string; video?: string; videoMp4?: string }
export interface SiteJob { id: string; title: string; type: string; location: string; department: string; summary: string; responsibilities: string[]; requirements: string[] }
export interface SiteContact { email: string; phone: string; address: string; socials: { icon: string; label: string; href: string }[] }

// ── fetching, once per section per visit ──────────────────────────────────────────────────────────────────────────
type Section = 'projects' | 'team' | 'hero' | 'jobs' | 'contact';
const TABLE: Record<Exclude<Section, 'contact'>, string> = { projects: 'site_projects', team: 'site_team', hero: 'site_hero_slides', jobs: 'hub_job_postings' };
const CACHE = (s: Section) => `fsa_site_${s}`;
const inflight: Partial<Record<Section, Promise<unknown | null>>> = {};

function readCache<T>(s: Section): T | null {
  try { const v = localStorage.getItem(CACHE(s)); return v ? JSON.parse(v) as T : null; } catch { return null; }
}
function writeCache(s: Section, v: unknown) {
  try { if (v == null) localStorage.removeItem(CACHE(s)); else localStorage.setItem(CACHE(s), JSON.stringify(v)); } catch { /* private mode */ }
}

// Which sections the hub has taken over ({"projects": true, …} in site_settings 'live', set by its import or first
// save). A live section shows exactly what the hub has, even nothing (no open roles); the rest keep the built-in content.
let liveP: Promise<Record<string, boolean>> | undefined;
const live = () => (liveP ??= Promise.resolve(supabase.from('site_settings').select('value').eq('key', 'live').maybeSingle())
  .then(({ data }) => (data?.value as Record<string, boolean>) ?? {}, () => ({})));

async function load(s: Section): Promise<unknown | null> {
  if (!isSupabaseConfigured) return null;
  if (!(await live())[s]) return null;
  if (s === 'contact') {
    const { data, error } = await supabase.from('site_settings').select('value').eq('key', 'contact').maybeSingle();
    return error || !data ? null : data.value;
  }
  const { data, error } = await supabase.from(TABLE[s]).select('*').eq('published', true).order('sort_order').order('created_at');
  return error ? null : data ?? [];
}

/** Forget the cached copy so the next read goes to the database (the hub calls this after a save). */
export function invalidateSite(s?: Section) {
  liveP = undefined;
  for (const k of (s ? [s] : ['projects', 'team', 'hero', 'jobs', 'contact'] as Section[])) { delete inflight[k]; writeCache(k, null); }
}

/** A section's database rows: the cached copy straight away, then the fresh one. null = not live: use the built-in content. */
function useSection<T>(s: Section): { rows: T | null; ready: boolean } {
  const [rows, setRows] = useState<T | null>(() => readCache<T>(s));
  const [ready, setReady] = useState(() => readCache<T>(s) !== null);
  useEffect(() => {
    let alive = true;
    (inflight[s] ??= load(s)).then((v) => {
      if (!alive) return;
      writeCache(s, v);
      setRows(v as T | null);
      setReady(true);
    }).catch(() => { if (alive) setReady(true); });
    return () => { alive = false; };
  }, [s]);
  return { rows, ready };
}

const langOf = (code: string): Lang => (code?.startsWith('es') ? 'es' : code?.startsWith('zh') ? 'zh' : 'en');
function pick<T>(i18n: I18n<T> | undefined, lang: Lang, field: keyof T): T[keyof T] | undefined {
  const v = i18n?.[lang]?.[field];
  const blank = v == null || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && !v.length);
  return blank ? i18n?.en?.[field] : v;
}
const str = (v: unknown) => (typeof v === 'string' ? v : '');

// ── projects ──────────────────────────────────────────────────────────────────────────────────────────────────────
export function projectFromRow(r: ProjectRow, lang: Lang): SiteProject {
  const p = <K extends keyof ProjectText>(k: K) => str(pick(r.i18n, lang, k));
  return {
    slug: r.slug, year: r.year, location: r.location, lat: r.lat ?? 0, lng: r.lng ?? 0, category: r.category,
    thumb: r.thumb, hero: r.hero || r.thumb, main: r.main_image || r.hero || r.thumb, gallery: r.gallery ?? [],
    floorPlans: (r.floor_plans ?? []).map((f) => ({ image: f.image, label: f.label?.[lang] || f.label?.en || '' })),
    video: r.video, videoMp4: r.video_mp4, floors: r.floors, plotArea: r.plot_area, builtArea: r.built_area,
    name: p('name'), address: p('address'), categoryLabel: p('category') || r.category, description: p('description'), quote: p('quote'),
    nameEn: str(r.i18n?.en?.name), addressEn: str(r.i18n?.en?.address),
  };
}
export function projectFromDefault(d: (typeof DEFAULT_PROJECTS)[number], t: TFunction): SiteProject {
  const k = (f: string) => t(`proj_${d.key}_${f}`, { defaultValue: '' });
  return {
    slug: d.slug, year: d.year, location: d.location, lat: d.lat, lng: d.lng, category: d.category,
    thumb: d.thumb, hero: d.hero, main: d.main, gallery: d.gallery,
    floorPlans: d.floorPlans.map((f) => ({ image: f.image, label: t(f.labelKey, { defaultValue: '' }) })),
    video: d.video, videoMp4: d.videoMp4, floors: d.floors, plotArea: d.plotArea, builtArea: d.builtArea,
    name: k('name') || d.nameEn, address: k('address') || d.addressEn, categoryLabel: k('category') || d.category,
    description: k('description'), quote: k('quote'), nameEn: d.nameEn, addressEn: d.addressEn,
  };
}
export function useSiteProjects(): { projects: SiteProject[]; ready: boolean } {
  const { t, i18n } = useTranslation();
  const { rows, ready } = useSection<ProjectRow[]>('projects');
  const lang = langOf(i18n.language);
  const projects = useMemo(() => (rows ? rows.map((r) => projectFromRow(r, lang)) : DEFAULT_PROJECTS.map((d) => projectFromDefault(d, t))), [rows, lang, t]);
  return { projects, ready: ready || !rows };
}

// ── team ──────────────────────────────────────────────────────────────────────────────────────────────────────────
export function useSiteTeam(): SiteTeamMember[] {
  const { t, i18n } = useTranslation();
  const { rows } = useSection<TeamRow[]>('team');
  const lang = langOf(i18n.language);
  return useMemo(() => rows
    ? rows.map((r) => ({
        key: r.key, name: str(pick(r.i18n, lang, 'name')), title: str(pick(r.i18n, lang, 'title')), bio: str(pick(r.i18n, lang, 'bio')),
        img: r.photo, imgShift: r.photo_shift || undefined, imgShiftX: r.photo_shift_x || undefined, imgScale: r.photo_scale ?? undefined, credentials: r.credentials ?? [],
      }))
    : DEFAULT_TEAM.map((d) => ({
        key: d.key, name: t(d.nameKey), title: t(d.titleKey), bio: t(d.bioKey), img: d.img,
        imgShift: d.imgShift, imgShiftX: d.imgShiftX, imgScale: d.imgScale, credentials: d.credentials,
      })), [rows, lang, t]);
}

// ── homepage hero ─────────────────────────────────────────────────────────────────────────────────────────────────
export function useHeroSlides(): SiteHeroSlide[] {
  const { rows } = useSection<HeroRow[]>('hero');
  return useMemo(() => rows?.length   // the hero always needs at least one slide
    ? rows.map((r) => ({ src: r.image, title: r.title, location: r.location, year: r.year, video: r.video || undefined, videoMp4: r.video_mp4 || undefined }))
    : DEFAULT_HERO, [rows]);
}

// ── job posts ─────────────────────────────────────────────────────────────────────────────────────────────────────
const bullets = (s: string) => s.split(' · ').map((x) => x.trim()).filter(Boolean);
export function useJobPosts(): SiteJob[] {
  const { t, i18n } = useTranslation();
  const { rows } = useSection<JobRow[]>('jobs');
  const lang = langOf(i18n.language);
  return useMemo(() => rows
    ? rows.map((r) => {
        const g = <K extends keyof JobText>(k: K) => pick(r.i18n, lang, k);
        return {
          id: r.id!, title: str(g('title')), type: str(g('type')), location: str(g('location')), department: str(g('department')),
          summary: str(g('summary')), responsibilities: (g('responsibilities') as string[]) ?? [], requirements: (g('requirements') as string[]) ?? [],
        };
      })
    : DEFAULT_JOBS.map((d) => ({
        id: d.titleKey, title: t(d.titleKey), type: t(d.typeKey), location: t(d.locationKey), department: t(d.deptKey),
        summary: t(d.expKey), responsibilities: bullets(t(d.responsibilitiesKey)), requirements: bullets(t(d.requirementsKey)),
      })), [rows, lang, t]);
}

// ── contact details ───────────────────────────────────────────────────────────────────────────────────────────────
export function useSiteContact(): SiteContact {
  const { i18n } = useTranslation();
  const { rows } = useSection<ContactValue>('contact');
  const lang = langOf(i18n.language);
  return useMemo(() => rows
    ? { email: rows.email || DEFAULT_CONTACT.email, phone: rows.phone || '', address: rows.address?.[lang] || rows.address?.en || DEFAULT_CONTACT.address,
        socials: rows.socials?.length ? rows.socials : DEFAULT_CONTACT.socials }
    : { email: DEFAULT_CONTACT.email, phone: DEFAULT_CONTACT.phone, address: DEFAULT_CONTACT.address, socials: DEFAULT_CONTACT.socials }, [rows, lang]);
}
