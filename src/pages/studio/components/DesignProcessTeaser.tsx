import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export default function DesignProcessTeaser() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const sectionRef = useRef<HTMLElement>(null);
  const stepsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    const steps = stepsRef.current;
    if (!section || !steps) return;

    const obs1 = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          section.classList.add('dpt-visible');
          obs1.disconnect();
        }
      },
      { threshold: 0.15 }
    );

    const obs2 = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          steps.classList.add('steps-visible');
          obs2.disconnect();
        }
      },
      { threshold: 0.2 }
    );

    obs1.observe(section);
    obs2.observe(steps);
    return () => { obs1.disconnect(); obs2.disconnect(); };
  }, []);

  const teaserSteps = [
    t('studio_teaser_step1'),
    t('studio_teaser_step2'),
    t('studio_teaser_step3'),
    t('studio_teaser_step4'),
    t('studio_teaser_step5'),
    t('studio_teaser_step6'),
  ];

  return (
    <>
      <style>{`
        .dpt-item {
          opacity: 0;
          transform: translateY(22px);
          transition: opacity 0.7s cubic-bezier(0.22,1,0.36,1), transform 0.7s cubic-bezier(0.22,1,0.36,1);
        }
        .dpt-visible .dpt-item { opacity: 1; transform: translateY(0); }
        .dpt-d0 { transition-delay: 0s; }
        .dpt-d1 { transition-delay: 0.10s; }
        .dpt-d2 { transition-delay: 0.20s; }
        .dpt-d3 { transition-delay: 0.32s; }
        .dpt-cta {
          opacity: 0;
          transform: translateX(18px);
          transition: opacity 0.7s cubic-bezier(0.22,1,0.36,1) 0.25s, transform 0.7s cubic-bezier(0.22,1,0.36,1) 0.25s;
        }
        .dpt-visible .dpt-cta { opacity: 1; transform: translateX(0); }
        @keyframes stepReveal {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .step-item { opacity: 0; }
        .steps-visible .step-item {
          animation: stepReveal 0.5s cubic-bezier(0.22,1,0.36,1) forwards;
        }
        .steps-visible .step-item:nth-child(1) { animation-delay: 0.00s; }
        .steps-visible .step-item:nth-child(3) { animation-delay: 0.07s; }
        .steps-visible .step-item:nth-child(5) { animation-delay: 0.14s; }
        .steps-visible .step-item:nth-child(7) { animation-delay: 0.21s; }
        .steps-visible .step-item:nth-child(9) { animation-delay: 0.28s; }
        .steps-visible .step-item:nth-child(11){ animation-delay: 0.35s; }
      `}</style>
      <section
        ref={sectionRef}
        style={{ backgroundColor: '#141c23' }}
        className="w-full px-8 md:px-16 lg:px-24 py-24"
      >
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-10">
          {/* Left — text */}
          <div className="flex flex-col gap-4 max-w-xl">
            <p
              className="dpt-item dpt-d0 text-white/30 text-xs tracking-widest uppercase"
              style={{ fontFamily: 'Geist, sans-serif', letterSpacing: '0.18em' }}
            >
              {t('studio_teaser_eyebrow')}
            </p>
            <h2
              className="dpt-item dpt-d1 text-3xl md:text-4xl text-white leading-snug whitespace-pre-line"
              style={{ fontFamily: 'Marcellus, serif', letterSpacing: '-0.01em' }}
            >
              {t('studio_teaser_heading')}
            </h2>
            <p
              className="dpt-item dpt-d2 text-white/40 text-sm leading-loose"
              style={{ fontFamily: 'Geist, sans-serif', letterSpacing: '0.02em' }}
            >
              {t('studio_teaser_desc')}
            </p>
          </div>

          {/* Right — CTA */}
          <div className="dpt-cta flex flex-col items-start md:items-end gap-5 flex-shrink-0">
            <button
              onClick={() => navigate('/process')}
              className="group inline-flex items-center gap-3 px-8 py-4 border border-white/25 rounded-full text-white/70 text-xs tracking-widest uppercase hover:border-white/60 hover:text-white transition-all duration-300 cursor-pointer whitespace-nowrap"
              style={{ fontFamily: 'Geist, sans-serif', letterSpacing: '0.14em' }}
            >
              {t('studio_teaser_cta')}
              <i className="ri-arrow-right-line text-sm transition-transform duration-300 group-hover:translate-x-1" />
            </button>
            <p
              className="text-white/20 text-xs"
              style={{ fontFamily: 'Geist, sans-serif', letterSpacing: '0.08em' }}
            >
              {t('studio_teaser_stages')}
            </p>
          </div>
        </div>

        {/* Step numbers strip */}
        <div ref={stepsRef} className="mt-16 pt-10 border-t border-white/8 flex items-center gap-0">
          {teaserSteps.map((step, i, arr) => (
            <div key={step} className="flex items-center flex-1">
              <button
                onClick={() => navigate('/process')}
                className="step-item flex-1 text-center cursor-pointer group"
              >
                <span
                  className="text-white/20 text-xs tracking-widest uppercase group-hover:text-white/50 transition-colors duration-300"
                  style={{ fontFamily: 'Geist, sans-serif', letterSpacing: '0.1em' }}
                >
                  {step}
                </span>
              </button>
              {i < arr.length - 1 && (
                <div className="w-px h-4 bg-white/10 flex-shrink-0" />
              )}
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
