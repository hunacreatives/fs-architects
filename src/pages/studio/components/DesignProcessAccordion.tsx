import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';

const STEPS = [
  { key: 'discovery', num: '01' },
  { key: 'concept', num: '02' },
  { key: 'design', num: '03' },
  { key: 'documentation', num: '04' },
  { key: 'construction', num: '05' },
  { key: 'completion', num: '06' },
];

export default function DesignProcessAccordion({ bioOpen = false }: { bioOpen?: boolean }) {
  const { t } = useTranslation();
  const [openIndex, setOpenIndex] = useState<number>(-1);
  const closingSet = useRef<Set<number>>(new Set());
  const [, tick] = useState(0);

  const toggle = (i: number) => {
    if (openIndex === i) {
      closingSet.current.add(i);
      tick(n => n + 1);
      setOpenIndex(-1);
      setTimeout(() => {
        closingSet.current.delete(i);
        tick(n => n + 1);
      }, 200);
    } else {
      closingSet.current.delete(i);
      setOpenIndex(i);
    }
  };

  return (
    <>
      <style>{`
        @keyframes dpShimmer {
          0%, 100% { opacity: 0.07; }
          50%       { opacity: 0.22; }
        }
        @keyframes dpSweep {
          0%   { transform: skewX(-14deg) translateX(-160%); }
          100% { transform: skewX(-14deg) translateX(420%); }
        }

        /* Mobile-only: step title, plus icon, description → white, no shadow */
        @media (max-width: 767px) {
          .dp-step-title       { color: rgba(255,255,255,0.88) !important; text-shadow: none !important; }
          .dp-step-title-open  { color: rgba(255,255,255,1)    !important; text-shadow: none !important; }
          .dp-step-plus        { color: rgba(255,255,255,0.55) !important; text-shadow: none !important; }
          .dp-step-plus-open   { color: rgba(255,255,255,0.90) !important; text-shadow: none !important; }
          .dp-step-desc        { color: rgba(255,255,255,0.65) !important; }
        }
      `}</style>

      <section
        id="design-process"
        className="relative overflow-hidden mx-6 md:mx-20 lg:mx-28"
        style={{
          marginTop: bioOpen ? '0px' : '-40px',
          transition: 'margin-top 0.55s cubic-bezier(0.4,0,0.2,1)',
          position: 'relative',
          zIndex: 2,
          contain: 'paint',
          transform: 'translateZ(0)',
          borderRadius: '20px',
        }}
      >
        {/* ── Blurred background image layer ── */}
        <div
          className="absolute pointer-events-none"
          style={{
            inset: '-12px',
            backgroundImage: `url("/images/design-process-bg.png")`,
            backgroundSize: 'cover',
            backgroundPosition: 'left center',
            backgroundRepeat: 'no-repeat',
            filter: 'blur(8px)',
            willChange: 'transform',
          }}
        />

        {/* ── Shimmer pulse — GPU composited opacity only ── */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'linear-gradient(132deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.01) 40%, rgba(255,255,255,0.05) 100%)',
            animation: 'dpShimmer 10s ease-in-out infinite',
            willChange: 'opacity',
          }}
        />

        {/* ── Light sweep — GPU composited transform only ── */}
        <div className="absolute inset-0 pointer-events-none" style={{ overflow: 'hidden' }}>
          <div
            style={{
              position: 'absolute',
              top: '-30%',
              left: 0,
              width: '28%',
              height: '160%',
              background: 'linear-gradient(105deg, transparent 0%, rgba(255,255,255,0.75) 50%, transparent 100%)',
              animation: 'dpSweep 18s ease-in-out infinite',
              opacity: 0.045,
              willChange: 'transform',
            }}
          />
        </div>

        {/* ── Content ── */}
        <div
          className="relative px-6 md:px-12 lg:px-16 pb-14"
          style={{ paddingTop: '72px' }}
        >
          {/* ── Mobile-only divider ── */}
          <div
            className="block md:hidden mx-auto mb-8"
            style={{ width: '40px', height: '1px', background: 'rgba(255,255,255,0.18)' }}
          />

          {/* ── Headline ── */}
          <div className="mb-10 lg:mb-14">
            <h2
              style={{
                fontFamily: 'Marcellus, serif',
                fontSize: 'clamp(30px, 4vw, 52px)',
                letterSpacing: '-0.025em',
                lineHeight: 1.05,
                color: 'rgba(255,255,255,0.93)',
                margin: 0,
              }}
            >
              {t('studio_accordion_heading1')}
              <br />
              <span style={{ color: 'rgba(255,255,255,0.38)' }}>{t('studio_accordion_heading2')}</span>
            </h2>
          </div>

          {/* ── Steps List ── */}
          <div>
            <div style={{ height: '1px', backgroundColor: 'rgba(51,64,74,0.15)' }} />

            {STEPS.map(({ key, num }, i) => {
              const isOpen = openIndex === i;
              return (
                <div key={key}>
                  <button
                    onClick={() => toggle(i)}
                    className="w-full flex items-center justify-between cursor-pointer group"
                    style={{ background: 'none', border: 'none', outline: 'none', padding: '20px 0' }}
                  >
                    <span
                      style={{
                        fontFamily: 'Marcellus, serif',
                        fontSize: 'clamp(18px, 1.8vw, 26px)',
                        letterSpacing: '0.10em',
                        color: isOpen ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.50)',
                        transition: 'color 0.25s ease',
                        flexShrink: 0,
                      }}
                    >
                      {num}
                    </span>

                    <div className="flex items-center gap-5 ml-auto">
                      <span
                        className={isOpen ? 'dp-step-title-open' : 'dp-step-title'}
                        style={{
                          fontFamily: 'Marcellus, serif',
                          fontSize: 'clamp(15px, 1.5vw, 20px)',
                          letterSpacing: '0.01em',
                          color: isOpen ? 'rgba(28,43,58,1)' : 'rgba(28,43,58,0.75)',
                          transition: 'color 0.25s ease',
                          textAlign: 'right',
                          textShadow: '0 0 12px rgba(255,255,255,0.6)',
                        }}
                      >
                        {t(`studio_process_${key}_title`)}
                      </span>
                      <span
                        className={isOpen ? 'dp-step-plus-open' : 'dp-step-plus'}
                        style={{
                          fontFamily: 'Geist, sans-serif',
                          fontSize: '14px',
                          color: isOpen ? 'rgba(28,43,58,0.85)' : 'rgba(28,43,58,0.50)',
                          transition: 'color 0.25s ease, transform 0.25s ease',
                          display: 'inline-block',
                          transform: isOpen ? 'rotate(45deg)' : 'rotate(0deg)',
                          flexShrink: 0,
                          textShadow: '0 0 10px rgba(255,255,255,0.5)',
                        }}
                      >
                        +
                      </span>
                    </div>
                  </button>

                  {/* Expanded description */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateRows: isOpen ? '1fr' : '0fr',
                      transition: closingSet.current.has(i)
                        ? 'grid-template-rows 0.18s cubic-bezier(0.4,0,1,1)'
                        : 'grid-template-rows 0.30s cubic-bezier(0,0,0.2,1)',
                      willChange: 'grid-template-rows',
                      transform: 'translateZ(0)',
                    }}
                  >
                    <div style={{ overflow: 'hidden', minHeight: 0 }}>
                      <div style={{
                        display: 'flex',
                        justifyContent: 'flex-end',
                        paddingBottom: '20px',
                        maxWidth: '680px',
                        marginLeft: 'auto',
                      }}>
                        <p
                          className="dp-step-desc"
                          style={{
                            fontFamily: 'Geist, sans-serif',
                            fontSize: '12px',
                            lineHeight: '2',
                            letterSpacing: '0.02em',
                            color: 'rgba(28,43,58,0.85)',
                            textAlign: 'right',
                            margin: 0,
                            textWrap: 'pretty',
                          } as React.CSSProperties}
                        >
                          {t(`studio_process_${key}_desc`)}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div style={{ height: '1px', backgroundColor: 'rgba(51,64,74,0.15)' }} />
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </>
  );
}
