
import { useTranslation } from 'react-i18next';

const STEPS = [
  { key: 'discovery', num: '01' },
  { key: 'concept', num: '02' },
  { key: 'design', num: '03' },
  { key: 'documentation', num: '04' },
  { key: 'construction', num: '05' },
  { key: 'completion', num: '06' },
];

export default function DesignProcess() {
  const { t } = useTranslation();

  return (
    <section id="design-process" style={{ backgroundColor: '#1a2028' }} className="w-full px-8 md:px-16 lg:px-24 py-24">
      {/* Section header */}
      <div className="mb-20">
        <p
          className="text-white/35 text-xs tracking-widest uppercase mb-4"
          style={{ fontFamily: 'Geist, sans-serif', letterSpacing: '0.18em' }}
        >
          {t('studio_process_eyebrow')}
        </p>
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
          <h2
            className="text-3xl md:text-4xl lg:text-5xl text-white leading-tight"
            style={{ fontFamily: 'Marcellus, serif', letterSpacing: '-0.02em' }}
          >
            {t('studio_process_headline')}
          </h2>
          <p
            className="text-white/45 text-sm leading-relaxed md:max-w-sm"
            style={{ fontFamily: 'Geist, sans-serif', letterSpacing: '0.02em' }}
          >
            {t('studio_process_subtext')}
          </p>
        </div>
      </div>

      {/* Process image strip */}
      <div className="w-full mb-20 overflow-hidden" style={{ height: '280px' }}>
        <img
          src="/images/process-banner.jpg"
          alt="Design process"
          className="w-full h-full object-cover object-center"
        />
      </div>

      {/* Steps — vertical timeline */}
      <div className="flex flex-col">
        {STEPS.map(({ key, num }, i) => (
          <div key={key}>
            <div className="flex flex-col md:flex-row md:items-start gap-6 md:gap-16 py-10">
              {/* Number */}
              <div className="flex-shrink-0 w-16">
                <span
                  className="text-white/15 text-4xl"
                  style={{ fontFamily: 'Marcellus, serif' }}
                >
                  {num}
                </span>
              </div>

              {/* Step name */}
              <div className="flex-shrink-0 md:w-56">
                <h3
                  className="text-white text-lg md:text-xl"
                  style={{ fontFamily: 'Marcellus, serif', letterSpacing: '0.01em' }}
                >
                  {t(`studio_process_${key}_title`)}
                </h3>
              </div>

              {/* Description */}
              <div className="flex-1">
                <p
                  className="text-white/50 text-sm leading-loose"
                  style={{ fontFamily: 'Geist, sans-serif', letterSpacing: '0.02em' }}
                >
                  {t(`studio_process_${key}_desc`)}
                </p>
              </div>

              {/* Tag */}
              <div className="flex-shrink-0 md:w-32 flex md:justify-end items-start pt-1">
                <span
                  className="text-white/20 text-xs tracking-widest uppercase border border-white/10 px-3 py-1 whitespace-nowrap"
                  style={{ fontFamily: 'Geist, sans-serif', letterSpacing: '0.12em' }}
                >
                  {t(`studio_process_${key}_tag`)}
                </span>
              </div>
            </div>
            {i < STEPS.length - 1 && (
              <div className="w-full h-px" style={{ backgroundColor: 'rgba(255,255,255,0.07)' }} />
            )}
          </div>
        ))}
      </div>

      {/* Bottom CTA */}
      <div className="mt-20 pt-10 border-t border-white/10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
        <p
          className="text-white/50 text-sm leading-relaxed md:max-w-md"
          style={{ fontFamily: 'Geist, sans-serif', letterSpacing: '0.02em' }}
        >
          {t('studio_process_cta_text')}
        </p>
        <a
          href="#contact"
          className="inline-flex items-center gap-3 px-8 py-3 border border-white/30 text-white/70 text-xs tracking-widest uppercase hover:border-white/60 hover:text-white transition-all duration-400 cursor-pointer whitespace-nowrap self-start md:self-auto"
          style={{ fontFamily: 'Geist, sans-serif', letterSpacing: '0.14em' }}
        >
          {t('studio_process_cta_btn')}
          <i className="ri-arrow-right-line text-sm" />
        </a>
      </div>
    </section>
  );
}
