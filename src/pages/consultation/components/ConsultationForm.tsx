import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

export default function ConsultationForm() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [charCount, setCharCount] = useState(0);
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add('cf-visible');
          obs.disconnect();
        }
      },
      { threshold: 0.08 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (charCount > 500) return;
    setStatus('sending');

    const form = e.currentTarget;
    const data = new URLSearchParams();
    const elements = form.elements as HTMLFormControlsCollection;

    Array.from(elements).forEach((el) => {
      const input = el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
      if (input.name) {
        data.append(input.name, input.value);
      }
    });

    try {
      const res = await fetch('https://readdy.ai/api/form/d76jr4l4hjod66j2esc0', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: data.toString(),
      });
      if (res.ok) {
        setStatus('success');
        form.reset();
        setCharCount(0);
      } else {
        setStatus('error');
      }
    } catch {
      setStatus('error');
    }
  };

  const inputClass =
    'w-full border border-black/15 rounded-lg bg-white px-4 py-3 text-sm text-black placeholder-black/25 focus:outline-none focus:border-black/40 transition-colors duration-200';

  const steps = [
    {
      number: '01',
      title: t('consult_step1_title'),
      desc: t('consult_step1_desc'),
    },
    {
      number: '02',
      title: t('consult_step2_title'),
      desc: t('consult_step2_desc'),
    },
    {
      number: '03',
      title: t('consult_step3_title'),
      desc: t('consult_step3_desc'),
    },
  ];

  return (
    <section ref={sectionRef} id="consultation-form" className="w-full px-5 md:px-10 lg:px-28 pt-8 md:pt-12 pb-12 md:pb-20">
      <style>{`
        .cf-item {
          opacity: 0;
          transform: translateY(20px);
          transition: opacity 0.65s cubic-bezier(0.22,1,0.36,1), transform 0.65s cubic-bezier(0.22,1,0.36,1);
        }
        .cf-visible .cf-item { opacity: 1; transform: translateY(0); }
        .cf-d0 { transition-delay: 0s; }
        .cf-d1 { transition-delay: 0.08s; }
        .cf-d2 { transition-delay: 0.16s; }
        .cf-d3 { transition-delay: 0.24s; }
        .cf-d4 { transition-delay: 0.32s; }
        .cf-left {
          opacity: 0;
          transform: translateX(-18px);
          transition: opacity 0.72s cubic-bezier(0.22,1,0.36,1), transform 0.72s cubic-bezier(0.22,1,0.36,1);
        }
        .cf-right {
          opacity: 0;
          transform: translateX(18px);
          transition: opacity 0.72s cubic-bezier(0.22,1,0.36,1) 0.1s, transform 0.72s cubic-bezier(0.22,1,0.36,1) 0.1s;
        }
        .cf-visible .cf-left, .cf-visible .cf-right { opacity: 1; transform: translateX(0); }
      `}</style>

      <h1
        className="cf-item cf-d0 mb-6 md:mb-10 leading-tight"
        style={{
          fontFamily: 'Marcellus, serif',
          fontSize: 'clamp(24px, 2.8vw, 42px)',
          letterSpacing: '-0.02em',
          color: 'rgba(0,0,0,0.85)',
          lineHeight: 1.15,
        }}
      >
        {t('consult_heading')}
      </h1>

      <div className="flex flex-col lg:flex-row gap-8 lg:gap-24">

        {/* ── LEFT: What to expect ── */}
        <div className="cf-left lg:w-5/12 flex flex-col gap-6 md:gap-10 lg:pb-[76px]">
          <p
            className="text-sm text-black/55 leading-relaxed"
            style={{ fontFamily: 'Geist, sans-serif' }}
          >
            {t('consult_intro')}
          </p>

          <div className="hidden lg:flex flex-col gap-7">
            {steps.map(({ number, title, desc }) => (
              <div key={number} className="flex items-start gap-4">
                <span
                  className="text-xs text-black/25 font-medium flex-shrink-0 mt-0.5"
                  style={{ fontFamily: 'Geist, sans-serif', letterSpacing: '0.06em', minWidth: '24px' }}
                >
                  {number}
                </span>
                <div>
                  <p
                    className="text-sm font-medium text-black/75 mb-1"
                    style={{ fontFamily: 'Geist, sans-serif' }}
                  >
                    {title}
                  </p>
                  <p
                    className="text-xs text-black/45 leading-relaxed"
                    style={{ fontFamily: 'Geist, sans-serif' }}
                  >
                    {desc}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="hidden lg:block mt-auto pt-4 border-t border-black/8">
            <p
              className="text-xs text-black/35 leading-relaxed"
              style={{ fontFamily: 'Geist, sans-serif' }}
            >
              {t('consult_response_note')}
            </p>
          </div>
        </div>

        {/* ── RIGHT: Form ── */}
        <div className="cf-right lg:w-7/12">
          {status === 'success' ? (
            <div className="border border-black/10 rounded-xl px-6 py-10 text-center flex flex-col items-center justify-center">
              <i className="ri-check-line text-2xl text-black/30 mb-3 block" />
              <p className="text-sm text-black/50" style={{ fontFamily: 'Geist, sans-serif' }}>
                {t('consult_form_success')}
              </p>
            </div>
          ) : (
            <form
              data-readdy-form
              id="consultation-main-form"
              onSubmit={handleSubmit}
              className="flex flex-col gap-4 md:gap-6"
            >
              {/* Name + Email */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                <div className="flex flex-col gap-1">
                  <label
                    className="text-xs text-black/40 tracking-wider uppercase"
                    style={{ fontFamily: 'Geist, sans-serif', letterSpacing: '0.1em' }}
                  >
                    {t('consult_field_name')}
                  </label>
                  <input
                    type="text"
                    name="name"
                    required
                    placeholder={t('consult_placeholder_name')}
                    className={inputClass}
                    style={{ fontFamily: 'Geist, sans-serif' }}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label
                    className="text-xs text-black/40 tracking-wider uppercase"
                    style={{ fontFamily: 'Geist, sans-serif', letterSpacing: '0.1em' }}
                  >
                    {t('consult_field_email')}
                  </label>
                  <input
                    type="email"
                    name="email"
                    required
                    placeholder={t('consult_placeholder_email')}
                    className={inputClass}
                    style={{ fontFamily: 'Geist, sans-serif' }}
                  />
                </div>
              </div>

              {/* Phone + Project Type */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                <div className="flex flex-col gap-1">
                  <label
                    className="text-xs text-black/40 tracking-wider uppercase"
                    style={{ fontFamily: 'Geist, sans-serif', letterSpacing: '0.1em' }}
                  >
                    {t('consult_field_phone')}
                  </label>
                  <input
                    type="tel"
                    name="phone"
                    placeholder={t('consult_placeholder_phone')}
                    className={inputClass}
                    style={{ fontFamily: 'Geist, sans-serif' }}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label
                    className="text-xs text-black/40 tracking-wider uppercase"
                    style={{ fontFamily: 'Geist, sans-serif', letterSpacing: '0.1em' }}
                  >
                    {t('consult_field_project_type')}
                  </label>
                  <div className="relative">
                    <select
                      name="project_type"
                      required
                      className={`${inputClass} cursor-pointer appearance-none pr-10`}
                      style={{ fontFamily: 'Geist, sans-serif' }}
                      defaultValue=""
                    >
                      <option value="" disabled>{t('consult_placeholder_project_type')}</option>
                      <option value="Residential">{t('consult_type_residential')}</option>
                      <option value="Commercial">{t('consult_type_commercial')}</option>
                      <option value="Healthcare">{t('consult_type_healthcare')}</option>
                      <option value="Hospitality">{t('consult_type_hospitality')}</option>
                      <option value="Mixed Use">{t('consult_type_mixed_use')}</option>
                      <option value="Interior Design">{t('consult_type_interior')}</option>
                      <option value="Other">{t('consult_type_other')}</option>
                    </select>
                    <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center">
                      <i className="ri-arrow-down-s-line text-sm text-black/30" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Location + Budget */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                <div className="flex flex-col gap-1">
                  <label
                    className="text-xs text-black/40 tracking-wider uppercase"
                    style={{ fontFamily: 'Geist, sans-serif', letterSpacing: '0.1em' }}
                  >
                    {t('consult_field_location')}
                  </label>
                  <input
                    type="text"
                    name="project_location"
                    placeholder={t('consult_placeholder_location')}
                    className={inputClass}
                    style={{ fontFamily: 'Geist, sans-serif' }}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label
                    className="text-xs text-black/40 tracking-wider uppercase"
                    style={{ fontFamily: 'Geist, sans-serif', letterSpacing: '0.1em' }}
                  >
                    {t('consult_field_budget')}
                  </label>
                  <div className="relative">
                    <select
                      name="budget_range"
                      className={`${inputClass} cursor-pointer appearance-none pr-10`}
                      style={{ fontFamily: 'Geist, sans-serif' }}
                      defaultValue=""
                    >
                      <option value="" disabled>{t('consult_placeholder_budget')}</option>
                      <option value="Below ₱5M">{t('consult_budget_1')}</option>
                      <option value="₱5M – ₱20M">{t('consult_budget_2')}</option>
                      <option value="₱20M – ₱50M">{t('consult_budget_3')}</option>
                      <option value="₱50M – ₱100M">{t('consult_budget_4')}</option>
                      <option value="Above ₱100M">{t('consult_budget_5')}</option>
                      <option value="Not sure yet">{t('consult_budget_6')}</option>
                    </select>
                    <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center">
                      <i className="ri-arrow-down-s-line text-sm text-black/30" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Message */}
              <div className="flex flex-col gap-1">
                <label
                  className="text-xs text-black/40 tracking-wider uppercase"
                  style={{ fontFamily: 'Geist, sans-serif', letterSpacing: '0.1em' }}
                >
                  {t('consult_field_message')}
                </label>
                <div className="relative">
                  <textarea
                    name="message"
                    required
                    rows={4}
                    maxLength={500}
                    placeholder={t('consult_placeholder_message')}
                    onChange={(e) => setCharCount(e.target.value.length)}
                    className={`${inputClass} resize-none`}
                    style={{ fontFamily: 'Geist, sans-serif' }}
                  />
                  <span
                    className={`absolute bottom-3 right-4 text-xs ${charCount > 500 ? 'text-red-400' : 'text-black/20'}`}
                    style={{ fontFamily: 'Geist, sans-serif' }}
                  >
                    {charCount}/500
                  </span>
                </div>
              </div>

              {status === 'error' && (
                <p className="text-xs text-red-400" style={{ fontFamily: 'Geist, sans-serif' }}>
                  {t('consult_form_error')}
                </p>
              )}

              <div className="pt-1 md:pt-2">
                <button
                  type="submit"
                  disabled={status === 'sending' || charCount > 500}
                  className="w-full md:w-auto px-8 py-3 rounded-full bg-black text-white text-xs tracking-widest uppercase hover:bg-black/80 transition-colors duration-300 cursor-pointer whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ fontFamily: 'Geist, sans-serif', letterSpacing: '0.12em' }}
                >
                  {status === 'sending' ? t('consult_form_sending') : t('consult_form_submit')}
                </button>
              </div>
            </form>
          )}
        </div>

      </div>
    </section>
  );
}
