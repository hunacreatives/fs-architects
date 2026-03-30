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
      // closing — mark it so we apply fast ease-in transition
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
      `}</style>

      <section
        id="design-process"
        className="w-full relative overflow-hidden"
        style={{
          background: 'rgba(216, 232, 240, 0.62)',
          backdropFilter: 'blur(36px) saturate(170%) brightness(1.04)',
          WebkitBackdropFilter: 'blur(36px) saturate(170%) brightness(1.04)',
          marginTop: bioOpen ? '0px' : '-100px',
          transition: 'margin-top 0.55s cubic-bezier(0.4,0,0.2,1)',
          position: 'relative',
          zIndex: 2,
        }}
      >
        {/* ── Dark wash — diagonal flood from top-left ── */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `linear-gradient(118deg, #33404a 0%, rgba(51,64,74,0.88) 18%, rgba(51,64,74,0.55) 38%, rgba(51,64,74,0.20) 58%, transparent 76%)`,
          }}
        />

        {/* ── Depth layer — upper-left anchor ── */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `linear-gradient(to bottom right, rgba(51,64,74,0.30) 0%, transparent 55%)`,
          }}
        />

        {/* ── Glass surface highlight — diagonal sheen ── */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'linear-gradient(132deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.02) 40%, rgba(255,255,255,0.08) 100%)',
            animation: 'dpShimmer 10s ease-in-out infinite',
          }}
        />

        {/* ── Light sweep — ghost glint drifting across ── */}
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
            }}
          />
        </div>

        {/* ── Grain layer 1 — overlay ── */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
            opacity: 0.62,
            mixBlendMode: 'overlay' as const,
          }}
        />

        {/* ── Grain layer 2 — soft-light for depth ── */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n2'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.92' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n2)'/%3E%3C/svg%3E")`,
            opacity: 0.28,
            mixBlendMode: 'soft-light' as const,
          }}
        />

        {/* ── Content ── */}
        <div
          className="relative px-4 md:px-20 lg:px-28 pb-14"
          style={{ paddingTop: '72px' }}
        >
          {/* ── Studio Philosophy ── */}
          <div className="flex flex-col items-center text-center" style={{ maxWidth: '900px', margin: '0 auto 36px' }}>
            <p style={{
              fontFamily: 'Marcellus, serif',
              fontSize: '13px',
              lineHeight: 1.7,
              color: 'rgba(255,255,255,0.72)',
              letterSpacing: '0.01em',
              margin: '0 0 10px 0',
              textWrap: 'pretty',
            } as React.CSSProperties}>
              {t('studio_philosophy_p1')}
            </p>

          </div>

          {/* ── Divider ── */}
          <div style={{ height: '1px', backgroundColor: 'rgba(255,255,255,0.10)', margin: '0 0 36px 0' }} />

          {/* ── Eyebrow + Headline ── */}
          <div className="mb-10 lg:mb-14">
            <p
              className="mb-3"
              style={{
                fontFamily: 'Geist, sans-serif',
                fontSize: '9px',
                letterSpacing: '0.28em',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.70)',
              }}
            >
              {t('studio_process_eyebrow')}
            </p>
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
            <div style={{ height: '1px', backgroundColor: 'rgba(51,64,74,0.18)' }} />

            {STEPS.map(({ key, num }, i) => {
              const isOpen = openIndex === i;
              return (
                <div key={key}>
                  <button
                    onClick={() => toggle(i)}
                    className="w-full flex items-center justify-between cursor-pointer"
                    style={{ background: 'none', border: 'none', outline: 'none', padding: '20px 0' }}
                  >
                    {/* Left — number only */}
                    <span
                      style={{
                        fontFamily: 'Marcellus, serif',
                        fontSize: 'clamp(18px, 1.8vw, 26px)',
                        letterSpacing: '0.10em',
                        color: isOpen ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.28)',
                        transition: 'color 0.25s ease',
                        flexShrink: 0,
                      }}
                    >
                      {num}
                    </span>

                    {/* Right — title + toggle icon */}
                    <div className="flex items-center gap-5 ml-auto">
                      <span
                        style={{
                          fontFamily: 'Marcellus, serif',
                          fontSize: 'clamp(15px, 1.5vw, 20px)',
                          letterSpacing: '0.01em',
                          color: isOpen ? 'rgba(51,64,74,0.95)' : 'rgba(51,64,74,0.62)',
                          transition: 'color 0.25s ease',
                          textAlign: 'right',
                        }}
                      >
                        {t(`studio_process_${key}_title`)}
                      </span>
                      <span
                        style={{
                          fontFamily: 'Geist, sans-serif',
                          fontSize: '14px',
                          color: isOpen ? 'rgba(51,64,74,0.75)' : 'rgba(51,64,74,0.30)',
                          transition: 'color 0.25s ease, transform 0.25s ease',
                          display: 'inline-block',
                          transform: isOpen ? 'rotate(45deg)' : 'rotate(0deg)',
                          flexShrink: 0,
                        }}
                      >
                        +
                      </span>
                    </div>
                  </button>

                  {/* Expanded description — right-aligned */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateRows: isOpen ? '1fr' : '0fr',
                      transition: closingSet.current.has(i)
                        ? 'grid-template-rows 0.18s cubic-bezier(0.4,0,1,1)'
                        : 'grid-template-rows 0.30s cubic-bezier(0,0,0.2,1)',
                    }}
                  >
                    <div style={{ overflow: 'hidden', minHeight: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', paddingBottom: '20px' }}>
                        <p
                          style={{
                            fontFamily: 'Geist, sans-serif',
                            fontSize: '12px',
                            lineHeight: '2',
                            letterSpacing: '0.02em',
                            color: 'rgba(26,40,58,0.90)',
                            textAlign: 'right',
                            maxWidth: '780px',
                            textWrap: 'pretty',
                          } as React.CSSProperties}
                        >
                          {t(`studio_process_${key}_desc`)}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div style={{ height: '1px', backgroundColor: 'rgba(51,64,74,0.18)' }} />
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </>
  );
}
