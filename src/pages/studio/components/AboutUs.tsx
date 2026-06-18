import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

const CLIENT_LOGOS = [
  { type: 'image' as const, src: '/images/byd-logo.png', alt: 'BYD' },
  { type: 'text' as const, label: 'DENZA' },
  { type: 'text' as const, label: 'MALLBERRY' },
  { type: 'text' as const, label: 'VMC' },
  { type: 'text' as const, label: 'FOXHOMES' },
  { type: 'text' as const, label: 'KAWAY RESORT' },
  { type: 'text' as const, label: 'RAINTREE' },
  { type: 'text' as const, label: '207 CAFÉ' },
  { type: 'text' as const, label: 'SQUAREVIEW' },
];

function useReveal(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add('reveal-visible');
          obs.disconnect();
        }
      },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return ref;
}

export default function AboutUs() {
  const { t } = useTranslation();

  const overlayRef = useRef<HTMLDivElement>(null);
  const cinematicRef = useRef<HTMLDivElement>(null);
  const quoteRef = useRef<HTMLDivElement>(null);
  const logosRef = useRef<HTMLDivElement>(null);
  const logosActiveRef = useRef(false);
  const rafRef = useRef<number>(0);

  const h2Ref = useReveal(0.2);
  const bodyRef = useReveal(0.2);
  const statsRef = useReveal(0.15);

  const TAGLINES = ['Defined by Form.', 'Shaped by Space.', 'Guided by Intent.'];
  const [taglineIndex, setTaglineIndex] = useState(0);
  const [taglineVisible, setTaglineVisible] = useState(false);

  // Cinematic intro: pitch black → slowly reveals background image
  useEffect(() => {
    const cinematicTimeout = setTimeout(() => {
      if (cinematicRef.current) {
        cinematicRef.current.style.transition = 'opacity 3.2s cubic-bezier(0.4, 0, 0.25, 1)';
        cinematicRef.current.style.opacity = '0';
      }
    }, 400);
    return () => clearTimeout(cinematicTimeout);
  }, []);

  // Tagline fade cycle — same rhythm as homepage
  useEffect(() => {
    const showTimer = setTimeout(() => setTaglineVisible(true), 800);
    return () => clearTimeout(showTimer);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setTaglineVisible(false);
      setTimeout(() => {
        setTaglineIndex(prev => (prev + 1) % TAGLINES.length);
        setTaglineVisible(true);
      }, 600);
    }, 3800);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const onScroll = () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        const y = window.scrollY;
        const vh = window.innerHeight;

        // Dark overlay deepens gradually — faster, hits max by ~30% scroll
        const overlayOpacity = Math.min(y / (vh * 0.3), 0.82);
        if (overlayRef.current) overlayRef.current.style.opacity = String(overlayOpacity);

        // Quote fades out fast — gone by ~12% of viewport scroll
        const quoteFade = Math.max(0, 1 - y / (vh * 0.12));
        const quoteY = y * 0.22;
        if (quoteRef.current) {
          quoteRef.current.style.opacity = String(quoteFade);
          quoteRef.current.style.transform = `translateY(-50%) translateY(-${quoteY}px)`;
        }

        // Logos track scroll bidirectionally — fade in at 2%, full by ~16%, fade back out on scroll up
        const logosProgress = Math.min(Math.max((y - vh * 0.02) / (vh * 0.14), 0), 1);
        const logosY = Math.max(0, 36 * (1 - logosProgress));
        if (logosRef.current) {
          logosRef.current.style.opacity = String(logosProgress);
          logosRef.current.style.transform = `translateY(calc(-50% + ${logosY}px))`;

          // Trigger staggered CSS animation once on first reveal
          if (logosProgress > 0.12 && !logosActiveRef.current) {
            logosActiveRef.current = true;
            logosRef.current.classList.add('logos-active');
          }
        }
      });
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <section id="about" className="w-full bg-white">
      <style>{`
        /* ── Scroll reveal ── */
        .reveal-item { opacity: 1; transform: none; }
        .reveal-item-left { opacity: 1; transform: none; }
        .reveal-item-right { opacity: 1; transform: none; }
        .reveal-delay-1 { transition-delay: 0.10s; }
        .reveal-delay-2 { transition-delay: 0.22s; }
        .stat-reveal {
          opacity: 1;
          transform: translateY(0);
        }
        .stat-d0 { transition-delay: 0s; }
        .stat-d1 { transition-delay: 0.12s; }
        .stat-d2 { transition-delay: 0.24s; }
        .stat-d3 { transition-delay: 0.36s; }

        /* ── Logo reveal keyframe ── */
        @keyframes logoItemReveal {
          from {
            opacity: 0;
            transform: translateY(28px) scale(0.86);
            filter: blur(6px);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
            filter: blur(0px);
          }
        }

        @keyframes logoLabelReveal {
          from { opacity: 0; letter-spacing: 0.45em; }
          to   { opacity: 1; letter-spacing: 0.3em; }
        }

        .logo-item { opacity: 0; }
        .logo-label { opacity: 0; }

        .logos-active .logo-label {
          animation: logoLabelReveal 0.7s cubic-bezier(0.22,1,0.36,1) forwards;
          animation-delay: 0.1s;
        }
        .logos-active .logo-item { animation: logoItemReveal 0.75s cubic-bezier(0.22,1,0.36,1) forwards; }
        .logos-active .logo-d0 { animation-delay: 0.18s; }
        .logos-active .logo-d1 { animation-delay: 0.28s; }
        .logos-active .logo-d2 { animation-delay: 0.37s; }
        .logos-active .logo-d3 { animation-delay: 0.46s; }
        .logos-active .logo-d4 { animation-delay: 0.55s; }
        .logos-active .logo-d5 { animation-delay: 0.64s; }
        .logos-active .logo-d6 { animation-delay: 0.72s; }
        .logos-active .logo-d7 { animation-delay: 0.80s; }
        .logos-active .logo-d8 { animation-delay: 0.88s; }

        @media (max-width: 639px) {
          .logo-text-item {
            font-size: 10px !important;
            letter-spacing: 0.14em !important;
          }
        }
      `}</style>

      {/* ── Sticky hero ── */}
      <div style={{ position: 'sticky', top: 0, height: '100vh', width: '100%', overflow: 'hidden', zIndex: 0 }}>

        {/* Background photo */}
        <img
          src="/images/studio-bg.webp"
          alt="FS Architects Studio"
          className="w-full h-full object-cover object-center"
        />

        {/* Base dark tint — always present */}
        <div className="absolute inset-0 bg-black pointer-events-none" style={{ opacity: 0.45 }} />

        {/* Dark overlay — deepens on scroll */}
        <div
          ref={overlayRef}
          className="absolute inset-0 bg-black pointer-events-none"
          style={{ opacity: 0, willChange: 'opacity' }}
        />

        {/* Cinematic intro overlay — starts pitch black, fades out to reveal image */}
        <div
          ref={cinematicRef}
          className="absolute inset-0 bg-black pointer-events-none"
          style={{ opacity: 1, zIndex: 1, willChange: 'opacity' }}
        />

        {/* ── QUOTE — homepage style, bottom-left ── */}
        <div
          ref={quoteRef}
          className="absolute left-6 md:left-16 lg:left-24 bottom-10 md:bottom-20 pointer-events-none"
          style={{ willChange: 'opacity, transform', opacity: 1, zIndex: 2 }}
        >
          <h1
            style={{
              fontSize: 'clamp(1.1rem, 1.9vw, 1.75rem)',
              lineHeight: 1.5,
              textShadow: '0 4px 32px rgba(0,0,0,0.45), 0 1px 4px rgba(0,0,0,0.3)',
              color: 'rgba(255,255,255,0.88)',
              opacity: taglineVisible ? 1 : 0,
              transition: 'opacity 0.6s ease',
              margin: 0,
            }}
          >
            {(() => {
              const words = TAGLINES[taglineIndex].split(' ');
              const prefix = words.slice(0, 2).join(' ') + ' ';
              const suffix = words.slice(2).join(' ');
              return (
                <>
                  <span style={{ fontFamily: 'Geist, sans-serif', fontWeight: 100, letterSpacing: '0.04em' }}>{prefix}</span>
                  <span style={{ fontFamily: 'Marcellus, serif', fontStyle: 'italic', fontWeight: 400, letterSpacing: '0.01em', fontSize: 'clamp(1.4rem, 2.4vw, 2.2rem)' }}>{suffix}</span>
                </>
              );
            })()}
          </h1>
        </div>

        {/* ── LOGOS — wow reveal ── */}
        <div
          ref={logosRef}
          className="absolute left-0 right-0 pointer-events-none flex flex-col items-center"
          style={{
            top: '44%',
            transform: 'translateY(-50%)',
            willChange: 'opacity, transform',
            opacity: 0,
            padding: '0 16px',
            zIndex: 2,
          }}
        >
          {/* Label */}
          <p
            className="logo-label"
            style={{
              fontFamily: 'Geist, sans-serif',
              fontSize: '9px',
              letterSpacing: '0.3em',
              color: 'rgba(255,255,255,0.35)',
              textTransform: 'uppercase',
              textAlign: 'center',
              marginBottom: '24px',
            }}
          >
            Clients we&apos;ve worked with
          </p>

          {/* Logos — two balanced rows */}
          {[CLIENT_LOGOS.slice(0, 5), CLIENT_LOGOS.slice(5)].map((row, rowIdx) => (
            <div key={rowIdx} className={`flex items-center justify-center flex-wrap gap-3 sm:gap-6 md:gap-12 px-4${rowIdx === 0 ? ' mb-4 sm:mb-6' : ''}`}>
              {row.map((client, j) => {
                const i = rowIdx === 0 ? j : 5 + j;
                return (
                  <div
                    key={i}
                    className={`logo-item logo-d${i} flex items-center justify-center`}
                    style={{ height: '40px' }}
                  >
                    {client.type === 'image' ? (
                      <img
                        src={client.src}
                        alt={client.alt}
                        draggable={false}
                        style={{
                          height: '44px',
                          width: 'auto',
                          filter: 'brightness(0) invert(1)',
                          opacity: 0.85,
                          objectFit: 'contain',
                        }}
                      />
                    ) : (
                      <span
                        className="logo-text-item"
                        style={{
                          fontFamily: 'Geist, sans-serif',
                          fontSize: '18px',
                          fontWeight: 700,
                          letterSpacing: '0.24em',
                          textTransform: 'uppercase',
                          color: 'rgba(255,255,255,0.88)',
                        }}
                      >
                        {client.label}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}

        </div>

      </div>

      {/* ── Content that scrolls over the sticky image ── */}
      <div className="relative bg-white" style={{ zIndex: 1 }}>
        <div className="w-full">

          {/* Two-col philosophy */}
          <div className="flex flex-col lg:flex-row px-4 md:px-20 lg:px-28 pt-24 pb-20 gap-12 lg:gap-24">

            {/* Left — manifesto eyebrow + h2 */}
            <div ref={h2Ref} className="lg:w-5/12 flex-shrink-0">
              <p
                className="reveal-item reveal-item-left reveal-delay-1 text-center lg:text-left mb-3"
                style={{ fontFamily: 'Geist, sans-serif', fontSize: '9px', letterSpacing: '0.28em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.28)' }}
              >
                {t('studio_about_manifesto_eyebrow')}
              </p>
              <h2
                className="reveal-item reveal-item-left text-black/80 leading-snug text-center lg:text-left [text-wrap:pretty]"
                style={{ fontFamily: 'Marcellus, serif', fontSize: 'clamp(20px, 2.4vw, 32px)', letterSpacing: '-0.01em' }}
              >
                {t('studio_about_h2')}
              </h2>
            </div>

            {/* Right — body paragraph */}
            <div ref={bodyRef} className="lg:w-7/12 flex flex-col justify-center">
              <p
                className="reveal-item reveal-item-right reveal-delay-1 text-black/45 text-center lg:text-right [text-wrap:pretty]"
                style={{ fontFamily: 'Geist, sans-serif', fontSize: 'clamp(13px, 1vw, 14px)', lineHeight: 1.9, letterSpacing: '0.01em' }}
              >
                {t('studio_about_intro')}
              </p>
            </div>
          </div>

          {/* Stats strip */}
          <div ref={statsRef} className="px-4 md:px-20 lg:px-28 pt-0 pb-10 grid grid-cols-4">
            {[
              { value: '2022', label: t('studio_founded_label') },
              { value: '100+', label: t('studio_projects_label') },
              { value: '10', label: t('studio_offices_label') },
              { value: '14', label: t('studio_team_label') },
            ].map(({ value, label }, i) => (
              <div
                key={label}
                className={`stat-reveal stat-d${i} flex flex-col items-center gap-1 py-4 md:py-8 ${i < 3 ? 'border-r border-black/8 pr-2 md:pr-8' : ''} ${i > 0 ? 'pl-2 md:pl-8' : ''}`}
              >
                <span style={{ fontFamily: 'Marcellus, serif', fontSize: 'clamp(20px, 2.5vw, 32px)', color: 'rgba(0,0,0,0.75)' }}>{value}</span>
                <span style={{ fontFamily: 'Geist, sans-serif', fontSize: '8px', letterSpacing: '0.28em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.28)', textAlign: 'center' }}>{label}</span>
              </div>
            ))}
          </div>

        </div>
      </div>
    </section>
  );
}
