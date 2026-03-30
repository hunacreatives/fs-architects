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

  const rolesSectionRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLDivElement>(null);

  const handleApply = (titleKey: string) => {
    setSelectedPosition(t(titleKey));
    setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  };

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

  const positionOptions = OPEN_ROLES.map(r => t(r.titleKey));

  return (
    <div className="w-full min-h-screen bg-white">
      <Navigation theme={navTheme} />

      {/* ── PAGE HEADER ── */}
      <div
        className="w-full px-6 md:px-20 lg:px-28 flex flex-col md:flex-row md:items-start md:justify-between gap-8 md:gap-16"
        style={{
          paddingTop: '100px',
          paddingBottom: '36px',
          borderBottom: '1px solid rgba(0,0,0,0.08)',
        }}
      >
        {/* Left — title + intro */}
        <div className="flex flex-col gap-4 md:gap-5 max-w-lg">
          <h1
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
            style={{
              fontFamily: 'Geist, sans-serif',
              fontSize: '12px',
              lineHeight: 1.9,
              color: 'rgba(0,0,0,0.45)',
              letterSpacing: '0.02em',
              margin: 0,
            }}
          >
            {t('careers_intro')}
          </p>
        </div>

        {/* Right — open positions counter */}
        <div className="flex flex-row md:flex-col items-center md:items-end gap-3 md:gap-1 flex-shrink-0">
          <span
            style={{
              fontFamily: 'Marcellus, serif',
              fontSize: 'clamp(36px, 4.2vw, 60px)',
              color: 'rgba(0,0,0,0.88)',
              lineHeight: 1,
              letterSpacing: '-0.04em',
              textAlign: 'right',
              display: 'block',
            }}
          >
            {OPEN_ROLES.length}
          </span>
          <span
            style={{
              fontFamily: 'Geist, sans-serif',
              fontSize: '8px',
              letterSpacing: '0.24em',
              color: 'rgba(0,0,0,0.30)',
              textTransform: 'uppercase',
              textAlign: 'right',
              display: 'block',
            }}
          >
            Open {OPEN_ROLES.length === 1 ? 'Position' : 'Positions'}
          </span>
        </div>
      </div>

      {/* ── FULL-BLEED STUDIO IMAGE ── */}
      <div className="w-full overflow-hidden" style={{ height: '360px' }}>
        <img
          src="https://readdy.ai/api/search-image?query=overhead%20birds%20eye%20view%20of%20a%20large%20white%20architectural%20drafting%20table%20covered%20in%20overlapping%20blueprints%2C%20technical%20drawings%2C%20white%20scale%20models%2C%20material%20sample%20swatches%20and%20precision%20drafting%20tools%2C%20cool%20diffused%20natural%20light%20from%20above%2C%20clean%20minimal%20studio%20surface%2C%20strong%20graphic%20shadows%20on%20white%20paper%2C%20editorial%20flat%20lay%20architectural%20photography&width=1400&height=560&seq=careers-mid-banner-001&orientation=landscape"
          alt="FS Architects studio workspace"
          className="w-full h-full object-cover object-top"
          draggable={false}
        />
      </div>

      {/* ── VALUES MAGAZINE GRID ── */}
      <ValuesSection />

      {/* ── OPEN ROLES (dark) ── */}
      <OpenRoles sectionRef={rolesSectionRef} onApply={handleApply} />

      {/* ── APPLICATION FORM ── */}
      <div ref={formRef}>
        <div className="px-6 md:px-20 lg:px-28 py-8">
          <ApplicationForm positions={positionOptions} selectedPosition={selectedPosition} />
        </div>
      </div>

      {/* ── PULL QUOTE ── */}
      <div
        className="w-full px-6 md:px-20 lg:px-28 py-14 md:py-20 flex flex-col items-center text-center overflow-hidden"
        style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }}
      >
        <blockquote
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
