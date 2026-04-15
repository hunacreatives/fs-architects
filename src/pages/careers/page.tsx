import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import Navigation from '../../components/feature/Navigation';
import ValuesSection from './components/ValuesSection';
import OpenRoles, { OPEN_ROLES } from './components/OpenRoles';
import ApplicationForm from './components/ApplicationForm';
import ContactFooter from '../contact/components/ContactFooter';

export default function CareersPage() {
  const { t } = useTranslation();
  const [navTheme, setNavTheme] = useState<'light' | 'dark'>('dark');
  const [selectedPosition, setSelectedPosition] = useState<string | null>(null);
  const [headerVisible, setHeaderVisible] = useState(false);

  const rolesSectionRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const quoteRef = useRef<HTMLDivElement>(null);

  const handleApply = (titleKey: string) => {
    setSelectedPosition(t(titleKey));
    setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  };

  useEffect(() => {
    const timer = setTimeout(() => setHeaderVisible(true), 100);
    return () => clearTimeout(timer);
  }, []);

  /* Nav theme: dark on white, light inside dark open roles */
  useEffect(() => {
    const update = () => {
      const el = rolesSectionRef.current;
      const inDarkRoles = el
        ? el.getBoundingClientRect().top <= 44 && el.getBoundingClientRect().bottom > 44
        : false;
      setNavTheme(inDarkRoles ? 'light' : 'dark');
    };
    window.addEventListener('scroll', update, { passive: true });
    update();
    return () => window.removeEventListener('scroll', update);
  }, []);

  // Quote scroll reveal
  useEffect(() => {
    const el = quoteRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add('quote-visible');
          obs.disconnect();
        }
      },
      { threshold: 0.3 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const positionOptions = OPEN_ROLES.map(r => t(r.titleKey));

  const hi = (delay: string) =>
    `transition-all duration-700 ease-out ${delay} ${headerVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'}`;

  return (
    <div className="w-full min-h-screen bg-white">
      <style>{`
        .quote-item {
          opacity: 0;
          transform: translateY(20px);
          transition: opacity 0.75s cubic-bezier(0.22,1,0.36,1), transform 0.75s cubic-bezier(0.22,1,0.36,1);
        }
        .quote-visible .quote-item { opacity: 1; transform: translateY(0); }
        .quote-d0 { transition-delay: 0s; }
        .quote-d1 { transition-delay: 0.14s; }
      `}</style>

      <Navigation theme={navTheme} />

      {/* ── PAGE HEADER ── */}
      <div
        className="w-full px-6 md:px-20 lg:px-28 flex flex-col md:flex-row md:items-start md:justify-between gap-8 md:gap-16"
        style={{ paddingTop: '100px', paddingBottom: '36px', borderBottom: '1px solid rgba(0,0,0,0.08)' }}
      >
        <h1
          className={hi('delay-[0ms]')}
          style={{
            fontFamily: 'Marcellus, serif',
            fontSize: 'clamp(28px, 3.6vw, 52px)',
            letterSpacing: '-0.03em',
            color: 'rgba(0,0,0,0.82)',
            lineHeight: 1.05,
            margin: 0,
          }}
        >
          {t('careers_heading')}
        </h1>

        <p
          className={`flex-shrink-0 md:text-right ${hi('delay-[120ms]')}`}
          style={{
            fontFamily: 'Geist, sans-serif',
            fontSize: '12px',
            lineHeight: 1.9,
            color: 'rgba(0,0,0,0.45)',
            letterSpacing: '0.02em',
            margin: 0,
            maxWidth: '320px',
          }}
        >
          {t('careers_intro')}
        </p>
      </div>

      {/* ── FULL-BLEED STUDIO IMAGE ── */}
      <div className="w-full overflow-hidden" style={{ height: '360px' }}>
        <img
          src="/images/careers-banner.jpg"
          alt="FS Architects studio workspace"
          className="w-full h-full object-cover object-top"
          draggable={false}
        />
      </div>

      {/* ── VALUES ── */}
      <ValuesSection />

      {/* ── OPEN ROLES ── */}
      <OpenRoles sectionRef={rolesSectionRef} onApply={handleApply} />

      {/* ── APPLICATION FORM ── */}
      <div ref={formRef}>
        <div className="px-6 md:px-20 lg:px-28 py-8">
          <ApplicationForm positions={positionOptions} selectedPosition={selectedPosition} />
        </div>
      </div>

      {/* ── PULL QUOTE ── */}
      <div
        ref={quoteRef}
        className="w-full px-6 md:px-20 lg:px-28 py-14 md:py-20 flex flex-col items-center text-center overflow-hidden"
        style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }}
      >
        <blockquote
          className="quote-item quote-d0"
          style={{
            fontFamily: 'Marcellus, serif',
            fontSize: 'clamp(14px, 1.55vw, 22px)',
            letterSpacing: '-0.01em',
            color: 'rgba(0,0,0,0.68)',
            lineHeight: 1.4,
            margin: '0 0 20px 0',
            fontStyle: 'italic',
          }}
        >
          &ldquo;We do not hire for roles. We invite people into a practice.&rdquo;
        </blockquote>
        <p
          className="quote-item quote-d1"
          style={{
            fontFamily: 'Geist, sans-serif',
            fontSize: '9px',
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            color: 'rgba(0,0,0,0.25)',
          }}
        >
          FS Architects, Cebu
        </p>
      </div>

      <ContactFooter hideContactBar />
    </div>
  );
}
