import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Navigation from '../../components/feature/Navigation';
import ContactFooter from '../contact/components/ContactFooter';
import StudioCTA from '../studio/components/StudioCTA';
import OpenRoles, { OPEN_ROLES } from './components/OpenRoles';
import ValuesSection from './components/ValuesSection';
import ApplicationForm from './components/ApplicationForm';

export default function CareersPage() {
  const { t } = useTranslation();
  const [selectedPosition, setSelectedPosition] = useState<string | null>(null);
  const formRef = useRef<HTMLDivElement>(null);

  const positionOptions = OPEN_ROLES.map(r => t(r.titleKey));

  const handleApply = (titleKey: string) => {
    setSelectedPosition(t(titleKey));
    setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  };

  return (
    <div className="w-full min-h-screen bg-white">
      <Navigation theme="dark" />

      {/* ── HEADER ── */}
      <div className="w-full px-6 md:px-20 lg:px-28" style={{ paddingTop: '100px', paddingBottom: '40px' }}>
        <p style={{ fontFamily: 'Geist, sans-serif', fontSize: '9px', letterSpacing: '0.28em', color: 'rgba(0,0,0,0.28)', textTransform: 'uppercase', marginBottom: '14px' }}>
          {t('careers_open_eyebrow')}
        </p>
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
          <h1 style={{ fontFamily: 'Marcellus, serif', fontSize: 'clamp(32px, 4vw, 58px)', letterSpacing: '-0.03em', color: 'rgba(0,0,0,0.85)', lineHeight: 1.0, margin: 0 }}>
            {t('careers_heading')}
          </h1>
          <p style={{ fontFamily: 'Geist, sans-serif', fontSize: '12px', lineHeight: 1.85, color: 'rgba(0,0,0,0.42)', letterSpacing: '0.01em', maxWidth: '320px', margin: 0, flexShrink: 0 }}>
            {t('careers_intro')}
          </p>
        </div>
      </div>

      {/* ── HERO IMAGE ── */}
      <div className="px-6 md:px-20 lg:px-28 mb-20">
        <div className="w-full overflow-hidden" style={{ height: 'clamp(220px, 38vw, 480px)', borderRadius: '12px' }}>
          <img
            src="/images/careers-banner.jpg"
            alt="FS Architects studio"
            className="w-full h-full object-cover object-center"
            draggable={false}
          />
        </div>
      </div>

      {/* ── OPEN POSITIONS ── */}
      <OpenRoles onApply={handleApply} />

      {/* ── WHY JOIN US ── */}
      <ValuesSection />

      {/* ── APPLICATION FORM ── */}
      <div ref={formRef} className="px-6 md:px-20 lg:px-28 py-16 md:py-24" style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }}>
        <ApplicationForm positions={positionOptions} selectedPosition={selectedPosition} />
      </div>

      <StudioCTA />
      <ContactFooter hideContactBar />
    </div>
  );
}
