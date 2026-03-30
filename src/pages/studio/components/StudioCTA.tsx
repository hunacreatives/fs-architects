import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const AWARDS = [
  { award: 'ASID Excellence Award', year: '2023' },
  { award: 'UAP National Design Award', year: '2022' },
  { award: 'Architizer A+ Finalist', year: '2021' },
  { award: 'ArchDaily Building of the Year', year: '2020' },
];

export default function StudioCTA() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <section
      className="w-full"
      style={{ backgroundColor: '#1a1916' }}
    >
      {/* Top divider row */}
      <div
        className="w-full flex items-center justify-between px-10 md:px-20 lg:px-28 py-6 border-b"
        style={{ borderColor: 'rgba(255,255,255,0.06)' }}
      >
        <span
          className="text-white/20 text-[9px] tracking-widest uppercase"
          style={{ fontFamily: 'Geist, sans-serif', letterSpacing: '0.22em' }}
        >
          {t('studio_cta_label')}
        </span>
        <span
          className="text-white/20 text-[9px] tracking-widest uppercase"
          style={{ fontFamily: 'Geist, sans-serif', letterSpacing: '0.22em' }}
        >
          FS Architects
        </span>
      </div>

      {/* Main content */}
      <div className="px-10 md:px-20 lg:px-28 pt-20 pb-16">

        {/* Large headline */}
        <h2
          className="text-4xl md:text-6xl lg:text-7xl text-white/85 leading-none mb-16 max-w-4xl"
          style={{ fontFamily: 'Marcellus, serif', letterSpacing: '-0.02em' }}
        >
          {t('studio_cta_headline')}
        </h2>

        {/* Middle row: description left + CTA right */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-10 pt-12">
          <p
            className="text-white/35 text-xs leading-loose max-w-sm"
            style={{ fontFamily: 'Geist, sans-serif', letterSpacing: '0.04em' }}
          >
            {t('studio_cta_desc')}
          </p>

          <button
            onClick={() => navigate('/contact')}
            className="group self-start lg:self-end inline-flex items-center gap-4 px-8 py-4 border text-white/50 text-[9px] tracking-widest uppercase hover:text-white/80 transition-all duration-300 cursor-pointer whitespace-nowrap flex-shrink-0"
            style={{
              fontFamily: 'Geist, sans-serif',
              letterSpacing: '0.18em',
              borderColor: 'rgba(255,255,255,0.15)',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.4)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.15)';
            }}
          >
            {t('studio_cta_btn')}
            <i className="ri-arrow-right-line text-sm transition-transform duration-300 group-hover:translate-x-1" />
          </button>
        </div>
      </div>

      {/* Awards / recognition strip */}
      <div
        className="w-full border-t"
        style={{ borderColor: 'rgba(255,255,255,0.06)' }}
      >
        <div className="px-10 md:px-20 lg:px-28 grid grid-cols-2 md:grid-cols-4">
          {AWARDS.map(({ award, year }, i) => (
            <div
              key={award}
              className={`flex flex-col gap-2 py-8 ${i < 3 ? 'border-r pr-8' : ''} ${i > 0 ? 'pl-8' : ''}`}
              style={{ borderColor: 'rgba(255,255,255,0.06)' }}
            >
              <span
                className="text-white/18 text-[9px] tracking-widest uppercase"
                style={{ fontFamily: 'Geist, sans-serif', letterSpacing: '0.16em' }}
              >
                {year}
              </span>
              <span
                className="text-white/45 text-[11px] leading-snug"
                style={{ fontFamily: 'Marcellus, serif' }}
              >
                {award}
              </span>
            </div>
          ))}
        </div>
      </div>

    </section>
  );
}
