import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export default function StudioCTA() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { content.classList.add('cta-content-visible'); obs.disconnect(); }
    }, { threshold: 0.12 });
    obs.observe(content);
    return () => obs.disconnect();
  }, []);

  return (
    <>
      <style>{`
        .cta-block-item {
          opacity: 0;
          transform: translateY(20px);
          transition: opacity 0.8s cubic-bezier(0.22,1,0.36,1), transform 0.8s cubic-bezier(0.22,1,0.36,1);
        }
        .cta-content-visible .cta-block-item { opacity: 1; transform: translateY(0); }
        .cta-d0 { transition-delay: 0s; }
        .cta-d1 { transition-delay: 0.12s; }
        .cta-d2 { transition-delay: 0.22s; }
        .cta-d3 { transition-delay: 0.32s; }

        .cta-btn-primary {
          background: #1a1916;
          color: #f7f5f2;
          border: none;
        }
        .cta-btn-primary:hover {
          background: #2e2b27;
          transform: translateY(-1px);
        }
        .cta-btn-secondary {
          background: transparent;
          color: rgba(0,0,0,0.45);
          border: 1.5px solid rgba(0,0,0,0.15);
        }
        .cta-btn-secondary:hover {
          color: rgba(0,0,0,0.75);
          border-color: rgba(0,0,0,0.35);
          transform: translateY(-1px);
        }
        .cta-btn-primary,
        .cta-btn-secondary {
          transition: background 180ms ease, color 180ms ease, border-color 180ms ease, transform 180ms ease;
          cursor: pointer;
        }
        .cta-btn-primary:focus-visible,
        .cta-btn-secondary:focus-visible {
          outline: 2px solid rgba(0,0,0,0.25);
          outline-offset: 3px;
        }
      `}</style>

      <section className="w-full bg-white">
        <div
          ref={contentRef}
          className="px-10 md:px-20 lg:px-28 py-10 md:py-12 flex flex-col lg:flex-row lg:items-center lg:justify-center gap-8 lg:gap-36"
        >
          {/* Left — copy block */}
          <div className="flex flex-col gap-2.5 lg:max-w-xl">
            <h2
              className="cta-block-item cta-d0 leading-tight"
              style={{
                fontFamily: 'Marcellus, serif',
                fontSize: 'clamp(26px, 3vw, 40px)',
                letterSpacing: '-0.02em',
                color: 'rgba(0,0,0,0.85)',
              }}
            >
              {t('studio_cta_headline')}
            </h2>
            <p
              className="cta-block-item cta-d1"
              style={{
                fontFamily: 'Geist, sans-serif',
                fontSize: 'clamp(13px, 1vw, 15px)',
                fontWeight: 400,
                lineHeight: '1.6',
                letterSpacing: '0.01em',
                maxWidth: '380px',
                color: 'rgba(0,0,0,0.45)',
              }}
            >
              {t('studio_cta_desc')}
            </p>
          </div>

          {/* Right — button stack */}
          <div className="cta-block-item cta-d2 flex flex-col gap-2.5 w-full lg:w-auto flex-shrink-0" style={{ minWidth: '220px', maxWidth: '280px' }}>
            <button
              onClick={() => navigate('/contact')}
              className="cta-btn-primary whitespace-nowrap rounded-full flex items-center justify-center w-full"
              style={{
                fontFamily: 'Geist, sans-serif',
                fontSize: '13px',
                fontWeight: 500,
                letterSpacing: '0.01em',
                minHeight: '48px',
                paddingLeft: '28px',
                paddingRight: '28px',
              }}
            >
              {t('studio_cta_btn')}
            </button>
            <button
              onClick={() => navigate('/consultation')}
              className="cta-btn-secondary whitespace-nowrap rounded-full flex items-center justify-center w-full"
              style={{
                fontFamily: 'Geist, sans-serif',
                fontSize: '13px',
                fontWeight: 500,
                letterSpacing: '0.01em',
                minHeight: '48px',
                paddingLeft: '28px',
                paddingRight: '28px',
              }}
            >
              {t('studio_cta_btn_secondary')}
            </button>
          </div>
        </div>
      </section>
    </>
  );
}
