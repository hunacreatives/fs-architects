import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Navigation from '../../components/feature/Navigation';
import DesignProcess from '../studio/components/DesignProcess';
import ContactFooter from '../contact/components/ContactFooter';

export default function ProcessPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0);
    const timer = setTimeout(() => setVisible(true), 100);
    return () => clearTimeout(timer);
  }, []);

  const item = (delay: string) =>
    `transition-all duration-800 ease-out ${delay} ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`;

  return (
    <div className="relative w-full min-h-screen" style={{ backgroundColor: '#1a2028' }}>
      <Navigation theme="light" />

      {/* Page Header */}
      <div className="w-full px-8 md:px-16 lg:px-24 pt-36 pb-16">
        <button
          onClick={() => navigate(-1)}
          className={`flex items-center gap-2 text-white/40 hover:text-white/80 transition-colors duration-300 cursor-pointer mb-10 group ${item('delay-[0ms]')}`}
          style={{ fontFamily: 'Geist, sans-serif', letterSpacing: '0.1em', fontSize: '12px' }}
        >
          <i className="ri-arrow-left-line text-sm transition-transform duration-300 group-hover:-translate-x-1" />
          <span className="uppercase tracking-widest">{t('process_back')}</span>
        </button>

        <p
          className={`text-white/30 text-xs tracking-widest uppercase mb-4 ${item('delay-[80ms]')}`}
          style={{ fontFamily: 'Geist, sans-serif', letterSpacing: '0.18em' }}
        >
          {t('studio_process_eyebrow')}
        </p>
        <h1
          className={`text-3xl md:text-4xl lg:text-5xl text-white leading-tight max-w-2xl ${item('delay-[160ms]')}`}
          style={{ fontFamily: 'Marcellus, serif', letterSpacing: '-0.02em' }}
        >
          {t('studio_process_headline')}
        </h1>
        <p
          className={`text-white/45 text-xs leading-loose mt-6 max-w-xl ${item('delay-[260ms]')}`}
          style={{ fontFamily: 'Geist, sans-serif', letterSpacing: '0.02em' }}
        >
          {t('process_page_subtext')}
        </p>
      </div>

      <DesignProcess />
      <ContactFooter />
    </div>
  );
}
