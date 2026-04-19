import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

const VALUES = [
  { num: '01', titleKey: 'careers_val_growth_title', descKey: 'careers_val_growth_desc', bg: 'rgba(0,0,0,0.03)' },
  { num: '02', titleKey: 'careers_val_impact_title', descKey: 'careers_val_impact_desc', bg: 'rgba(0,0,0,0.055)' },
  { num: '03', titleKey: 'careers_val_collab_title', descKey: 'careers_val_collab_desc', bg: 'rgba(0,0,0,0.08)' },
];

export default function ValuesSection() {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { el.classList.add('vals-visible'); obs.disconnect(); } },
      { threshold: 0.05, rootMargin: '0px 0px -40px 0px' }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <>
      <style>{`
        .val-item { opacity: 1; }
      `}</style>

      <div className="w-full px-6 md:px-20 lg:px-28 py-16 md:py-24" style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }}>
        {/* Header */}
        <h2 style={{ fontFamily: 'Marcellus, serif', fontSize: 'clamp(20px, 2vw, 28px)', letterSpacing: '-0.02em', color: 'rgba(0,0,0,0.82)', lineHeight: 1.15, margin: '0 0 40px 0' }}>
          {t('careers_why_heading')}
        </h2>

        {/* Grid */}
        <div ref={ref} className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {VALUES.map((val, i) => (
            <div
              key={val.num}
              className={`val-item val-d${i} px-6 py-8 text-center md:text-left`}
              style={{ border: '1px solid rgba(0,0,0,0.08)', borderRadius: '12px', background: val.bg }}
            >
              <p style={{ fontFamily: 'Geist, sans-serif', fontSize: '11px', color: 'rgba(0,0,0,0.22)', letterSpacing: '0.08em', marginBottom: '16px' }}>
                {val.num}
              </p>
              <h3 style={{ fontFamily: 'Marcellus, serif', fontSize: 'clamp(15px, 1.2vw, 18px)', letterSpacing: '-0.01em', color: 'rgba(0,0,0,0.82)', lineHeight: 1.2, margin: '0 0 10px 0' }}>
                {t(val.titleKey)}
              </h3>
              <p style={{ fontFamily: 'Geist, sans-serif', fontSize: '12px', lineHeight: 1.85, color: 'rgba(0,0,0,0.42)', letterSpacing: '0.01em', margin: 0 }}>
                {t(val.descKey)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
