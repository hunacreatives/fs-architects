// "Import from the live website": copies the site's built-in content (src/lib/site/defaults.ts plus its text in all
// three languages from the i18n files) into the Website tables, then hands that section over to them. The site looks
// exactly the same afterwards; from then on the hub is where it's edited.
import i18n from '@/i18n';
import { supabase } from '@/lib/supabase';
import { DEFAULT_CONTACT, DEFAULT_HERO, DEFAULT_JOBS, DEFAULT_PROJECTS, DEFAULT_TEAM } from '@/lib/site/defaults';
import { LANGS, type Lang } from '@/lib/site/content';
import { setLive, TABLES, type Section } from './shared';

const tr = (lang: Lang, key: string) => {
  const v = i18n.getFixedT(lang)(key, { defaultValue: '' });
  return v === key ? '' : v;
};
const perLang = <T,>(make: (lang: Lang) => T) => Object.fromEntries(LANGS.map((l) => [l.code, make(l.code)])) as Record<Lang, T>;
const bullets = (s: string) => s.split(' · ').map((x) => x.trim()).filter(Boolean);

export function rows(section: Exclude<Section, 'contact'>): Record<string, unknown>[] {
  if (section === 'projects') return DEFAULT_PROJECTS.map((d, i) => ({
    slug: d.slug, sort_order: i * 10, published: true, year: d.year, location: d.location, lat: d.lat, lng: d.lng,
    category: d.category, thumb: d.thumb, hero: d.hero, main_image: d.main, gallery: d.gallery,
    floor_plans: d.floorPlans.map((f) => ({ image: f.image, label: perLang((l) => tr(l, f.labelKey)) })),
    video: d.video, video_mp4: d.videoMp4, floors: d.floors, plot_area: d.plotArea, built_area: d.builtArea,
    i18n: perLang((l) => ({
      name: tr(l, `proj_${d.key}_name`) || (l === 'en' ? d.nameEn : ''),
      address: tr(l, `proj_${d.key}_address`) || (l === 'en' ? d.addressEn : ''),
      category: tr(l, `proj_${d.key}_category`), description: tr(l, `proj_${d.key}_description`), quote: tr(l, `proj_${d.key}_quote`),
    })),
  }));
  if (section === 'team') return DEFAULT_TEAM.map((d, i) => ({
    key: d.key, sort_order: i * 10, published: true, photo: d.img, photo_shift: d.imgShift ?? '', photo_shift_x: d.imgShiftX ?? '',
    photo_scale: d.imgScale ?? null, credentials: d.credentials ?? [],
    i18n: perLang((l) => ({ name: tr(l, d.nameKey), title: tr(l, d.titleKey), bio: tr(l, d.bioKey) })),
  }));
  if (section === 'hero') return DEFAULT_HERO.map((d, i) => ({
    sort_order: i * 10, published: true, image: d.src, video: d.video ?? '', video_mp4: d.videoMp4 ?? '', title: d.title, location: d.location, year: d.year,
  }));
  return DEFAULT_JOBS.map((d, i) => ({
    sort_order: i * 10, published: true,
    i18n: perLang((l) => ({
      title: tr(l, d.titleKey), type: tr(l, d.typeKey), location: tr(l, d.locationKey), department: tr(l, d.deptKey),
      summary: tr(l, d.expKey), responsibilities: bullets(tr(l, d.responsibilitiesKey)), requirements: bullets(tr(l, d.requirementsKey)),
    })),
  }));
}

export async function importDefaults(section: Section) {
  if (section === 'contact') {
    const { error } = await supabase.from('site_settings').upsert({
      key: 'contact',
      value: { email: DEFAULT_CONTACT.email, phone: DEFAULT_CONTACT.phone, address: perLang(() => DEFAULT_CONTACT.address), socials: DEFAULT_CONTACT.socials },
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
  } else {
    const table = TABLES[section];
    const { count } = await supabase.from(table).select('id', { count: 'exact', head: true });
    if (!count) {                                     // never double up if it was imported before
      const { error } = await supabase.from(table).insert(rows(section));
      if (error) throw error;
    }
  }
  await setLive(section);
}
