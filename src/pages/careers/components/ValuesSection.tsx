import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

const VALUES = [
  { num: '01', titleKey: 'careers_val_growth_title', descKey: 'careers_val_growth_desc' },
  { num: '02', titleKey: 'careers_val_impact_title', descKey: 'careers_val_impact_desc' },
  { num: '03', titleKey: 'careers_val_collab_title', descKey: 'careers_val_collab_desc' },
];

export default function ValuesSection() {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { el.classList.add('vals-visible'); obs.disconnect(); } },
      { threshold: 0.1 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <>
      <style>{`
        .val-item { opacity: 0; transform: translateY(16px); transition: opacity 0.7s cubic-bezier(0.22,1,0.36,1), transform 0.7s cubic-bezier(0.22,1,0.36,1); }
        .vals-visible .val-item { opacity: 1; transform: translateY(0); }
        .val-d0 { transition-delay: 0s; }
        .val-d1 { transition-delay: 0.12s; }
        .val-d2 { transition-delay: 0.22s; }
      `}</style>

      <div className="w-full px-6 md:px-20 lg:px-28 py-16 md:py-24" style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }}>
        {/* Header */}
        <p style={{ fontFamily: 'Geist, sans-serif', fontSize: '9px', letterSpacing: '0.28em', color: 'rgba(0,0,0,0.28)', textTransform: 'uppercase', marginBottom: '14px' }}>
          {t('careers_why_eyebrow')}
        </p>
        <h2 style={{ fontFamily: 'Marcellus, serif', fontSize: 'clamp(20px, 2vw, 28px)', letterSpacing: '-0.02em', color: 'rgba(0,0,0,0.82)', lineHeight: 1.15, margin: '0 0 40px 0' }}>
          {t('careers_why_heading')}
        </h2>

        {/* Grid */}
        <div ref={ref} className="grid grid-cols-1 md:grid-cols-3 gap-px" style={{ borderTop: '1px solid rgba(0,0,0,0.08)', borderLeft: '1px solid rgba(0,0,0,0.08)' }}>
          {VALUES.map((val, i) => (
            <div
              key={val.num}
              className={`val-item val-d${i} px-6 py-8`}
              style={{ borderBottom: '1px solid rgba(0,0,0,0.08)', borderRight: '1px solid rgba(0,0,0,0.08)' }}
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
