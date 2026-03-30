import { useState } from 'react';
import { useTranslation } from 'react-i18next';

export default function ContactForm() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [charCount, setCharCount] = useState(0);

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
      const res = await fetch('https://readdy.ai/api/form/d6jlpnnrgrhbthj8n1eg', {
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
    'w-full border border-black/15 bg-white px-4 py-3 text-sm text-black placeholder-black/25 focus:outline-none focus:border-black/40 transition-colors duration-200';

  const contactDetails = [
    {
      label: 'Address',
      icon: 'ri-map-pin-line',
      lines: [
        'Unit XXXX Meridian Building,',
        'Golam Drive, Brgy. Kasambagan,',
        'Mabolo, Cebu City',
      ],
    },
    {
      label: 'Phone',
      icon: 'ri-phone-line',
      lines: ['(+63) 926 751 6692'],
    },
    {
      label: 'Email',
      icon: 'ri-mail-line',
      lines: ['info@fsarchitects.ph'],
    },
  ];

  return (
    <section id="contact-form" className="w-full px-10 md:px-20 lg:px-28 pt-12 pb-20">

      {/* ── Heading above both columns ── */}
      <h1
        className="mb-10 leading-tight"
        style={{
          fontFamily: 'Marcellus, serif',
          fontSize: 'clamp(26px, 2.8vw, 42px)',
          letterSpacing: '-0.02em',
          color: 'rgba(0,0,0,0.85)',
          lineHeight: 1.15,
        }}
      >
        Contact Us
      </h1>

      <div className="flex flex-col lg:flex-row gap-16 lg:gap-24">

        {/* ── LEFT: Contact Info — starts at same level as first form field ── */}
        <div className="lg:w-5/12 flex flex-col">
          <div className="flex flex-col gap-8">
            {contactDetails.map(({ label, icon, lines }) => (
              <div key={label} className="flex items-start gap-4">
                <div className="w-8 h-8 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <i className={`${icon} text-base text-black/40`} />
                </div>
                <div>
                  <p
                    className="text-xs uppercase tracking-widest text-black/30 mb-1.5"
                    style={{ fontFamily: 'Geist, sans-serif', letterSpacing: '0.14em' }}
                  >
                    {label}
                  </p>
                  {lines.map((line, i) => (
                    <p
                      key={i}
                      className="text-sm text-black/70 leading-relaxed"
                      style={{ fontFamily: 'Geist, sans-serif' }}
                    >
                      {line}
                    </p>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── RIGHT: Form ── */}
        <div className="lg:w-7/12">
          {status === 'success' ? (
            <div className="border border-black/10 px-8 py-12 text-center flex flex-col items-center justify-center">
              <i className="ri-check-line text-2xl text-black/30 mb-3 block" />
              <p className="text-sm text-black/50" style={{ fontFamily: 'Geist, sans-serif' }}>
                {t('contact_form_success')}
              </p>
            </div>
          ) : (
            <form
              data-readdy-form
              id="contact-main-form"
              onSubmit={handleSubmit}
              className="flex flex-col gap-6"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="flex flex-col gap-1">
                  <label
                    className="text-xs text-black/40 tracking-wider uppercase"
                    style={{ fontFamily: 'Geist, sans-serif', letterSpacing: '0.1em' }}
                  >
                    {t('contact_field_name')}
                  </label>
                  <input
                    type="text"
                    name="name"
                    required
                    placeholder={t('contact_placeholder_name')}
                    className={inputClass}
                    style={{ fontFamily: 'Geist, sans-serif' }}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label
                    className="text-xs text-black/40 tracking-wider uppercase"
                    style={{ fontFamily: 'Geist, sans-serif', letterSpacing: '0.1em' }}
                  >
                    {t('contact_field_email')}
                  </label>
                  <input
                    type="email"
                    name="email"
                    required
                    placeholder={t('contact_placeholder_email')}
                    className={inputClass}
                    style={{ fontFamily: 'Geist, sans-serif' }}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label
                  className="text-xs text-black/40 tracking-wider uppercase"
                  style={{ fontFamily: 'Geist, sans-serif', letterSpacing: '0.1em' }}
                >
                  {t('contact_field_subject')}
                </label>
                <select
                  name="subject"
                  required
                  className={`${inputClass} cursor-pointer`}
                  style={{ fontFamily: 'Geist, sans-serif' }}
                  defaultValue=""
                >
                  <option value="" disabled>{t('contact_placeholder_subject')}</option>
                  <option value="New Project">{t('contact_subject_new_project')}</option>
                  <option value="Collaboration">{t('contact_subject_collaboration')}</option>
                  <option value="Press & Media">{t('contact_subject_press')}</option>
                  <option value="Careers">{t('contact_subject_careers')}</option>
                  <option value="General Inquiry">{t('contact_subject_general')}</option>
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label
                  className="text-xs text-black/40 tracking-wider uppercase"
                  style={{ fontFamily: 'Geist, sans-serif', letterSpacing: '0.1em' }}
                >
                  {t('contact_field_message')}
                </label>
                <div className="relative">
                  <textarea
                    name="message"
                    required
                    rows={6}
                    maxLength={500}
                    placeholder={t('contact_placeholder_message')}
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
                  {t('contact_form_error')}
                </p>
              )}

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={status === 'sending' || charCount > 500}
                  className="px-8 py-3 bg-black text-white text-xs tracking-widest uppercase hover:bg-black/80 transition-colors duration-300 cursor-pointer whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ fontFamily: 'Geist, sans-serif', letterSpacing: '0.12em' }}
                >
                  {status === 'sending' ? t('contact_form_sending') : t('contact_form_submit')}
                </button>
              </div>
            </form>
          )}
        </div>

      </div>
    </section>
  );
}
