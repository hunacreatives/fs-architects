import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export default function DesignProcessTeaser() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const steps = [
    t('studio_teaser_step1'),
    t('studio_teaser_step2'),
    t('studio_teaser_step3'),
    t('studio_teaser_step4'),
    t('studio_teaser_step5'),
    t('studio_teaser_step6'),
  ];

  return (
    <section
      style={{ backgroundColor: '#141c23' }}
      className="w-full px-8 md:px-16 lg:px-24 py-24"
    >
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-10">
        {/* Left — text */}
        <div className="flex flex-col gap-4 max-w-xl">
          <p
            className="text-white/30 text-xs tracking-widest uppercase"
            style={{ fontFamily: 'Geist, sans-serif', letterSpacing: '0.18em' }}
          >
            {t('studio_teaser_eyebrow')}
          </p>
          <h2
            className="text-3xl md:text-4xl text-white leading-snug whitespace-pre-line"
            style={{ fontFamily: 'Marcellus, serif', letterSpacing: '-0.01em' }}
          >
            {t('studio_teaser_heading')}
          </h2>
          <p
            className="text-white/40 text-sm leading-loose"
            style={{ fontFamily: 'Geist, sans-serif', letterSpacing: '0.02em' }}
          >
            {t('studio_teaser_desc')}
          </p>
        </div>

        {/* Right — CTA */}
        <div className="flex flex-col items-start md:items-end gap-5 flex-shrink-0">
          <button
            onClick={() => navigate('/process')}
            className="group inline-flex items-center gap-3 px-8 py-4 border border-white/25 text-white/70 text-xs tracking-widest uppercase hover:border-white/60 hover:text-white transition-all duration-300 cursor-pointer whitespace-nowrap"
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
      <div className="mt-16 pt-10 border-t border-white/8 flex items-center gap-0">
        {steps.map((step, i, arr) => (
          <div key={step} className="flex items-center flex-1">
            <button
              onClick={() => navigate('/process')}
              className="flex-1 text-center cursor-pointer group"
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
  );
}
