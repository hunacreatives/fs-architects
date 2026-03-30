import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

const VALUES = [
  { num: '1', titleKey: 'careers_val_growth_title', descKey: 'careers_val_growth_desc' },
  { num: '2', titleKey: 'careers_val_impact_title', descKey: 'careers_val_impact_desc' },
  { num: '3', titleKey: 'careers_val_collab_title', descKey: 'careers_val_collab_desc' },
];

export default function ValuesSection() {
  const { t } = useTranslation();
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add('vals-visible');
          obs.disconnect();
        }
      },
      { threshold: 0.1 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <>
      <style>{`
        .val-item {
          opacity: 0;
          transform: translateX(-18px);
          transition: opacity 0.72s cubic-bezier(0.22,1,0.36,1), transform 0.72s cubic-bezier(0.22,1,0.36,1);
        }
        .vals-visible .val-item { opacity: 1; transform: translateX(0); }
        .val-d0 { transition-delay: 0s; }
        .val-d1 { transition-delay: 0.15s; }
        .val-d2 { transition-delay: 0.30s; }
        .val-heading {
          opacity: 0;
          transform: translateY(16px);
          transition: opacity 0.65s cubic-bezier(0.22,1,0.36,1), transform 0.65s cubic-bezier(0.22,1,0.36,1);
        }
        .vals-visible .val-heading { opacity: 1; transform: translateY(0); }
        .val-heading-d0 { transition-delay: 0s; }
        .val-heading-d1 { transition-delay: 0.1s; }
      `}</style>
      <div
        ref={sectionRef}
        className="w-full py-16 md:py-24 lg:py-[120px]"
        style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }}
      >
        {/* Section header */}
        <div className="px-6 md:px-20 lg:px-28 mb-10 md:mb-14">
          <p
            className="val-heading val-heading-d0"
            style={{
              fontFamily: 'Geist, sans-serif',
              fontSize: '9px',
              letterSpacing: '0.26em',
              color: 'rgba(0,0,0,0.22)',
              textTransform: 'uppercase',
              margin: '0 0 10px 0',
            }}
          >
            {t('careers_why_eyebrow')}
          </p>
          <h2
            className="val-heading val-heading-d1"
            style={{
              fontFamily: 'Marcellus, serif',
              fontSize: 'clamp(18px, 1.9vw, 26px)',
              letterSpacing: '-0.02em',
              color: 'rgba(0,0,0,0.82)',
              lineHeight: 1.2,
              margin: 0,
            }}
          >
            {t('careers_why_heading')}
          </h2>
        </div>

        {/* Rows */}
        <div className="w-full" style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }}>
          {VALUES.map((val, i) => (
            <div
              key={val.num}
              className={`val-item val-d${i} px-6 md:px-20 lg:px-28 flex flex-col md:flex-row md:items-center gap-3 md:gap-16 py-8 md:py-14`}
              style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}
            >
              {/* Number + Title row */}
              <div className="flex items-center gap-3 md:gap-16 md:contents">
                <span
                  style={{
                    fontFamily: 'Marcellus, serif',
                    fontSize: 'clamp(36px, 4.5vw, 72px)',
                    color: 'rgba(0,0,0,0.06)',
                    lineHeight: 1,
                    flexShrink: 0,
                    width: '2.8rem',
                    letterSpacing: '-0.04em',
                  }}
                >
                  {val.num}
                </span>
                <h3
                  style={{
                    fontFamily: 'Marcellus, serif',
                    fontSize: 'clamp(15px, 1.35vw, 20px)',
                    letterSpacing: '-0.01em',
                    color: 'rgba(0,0,0,0.80)',
                    lineHeight: 1.25,
                    margin: 0,
                    flexShrink: 0,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {t(val.titleKey)}
                </h3>
              </div>
              <p
                style={{
                  fontFamily: 'Geist, sans-serif',
                  fontSize: '12px',
                  lineHeight: 1.9,
                  color: 'rgba(0,0,0,0.42)',
                  letterSpacing: '0.02em',
                  margin: 0,
                  flex: 1,
                }}
              >
                {t(val.descKey)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
