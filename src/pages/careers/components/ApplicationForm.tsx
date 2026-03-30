import { useState, FormEvent, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

interface ApplicationFormProps {
  dark?: boolean;
  positions?: string[];
  selectedPosition?: string | null;
}

interface FormErrors {
  position?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  message?: string;
  resume?: string;
  portfolio?: string;
}

export default function ApplicationForm({ dark = false, positions = [], selectedPosition = null }: ApplicationFormProps) {
  const { t } = useTranslation();

  const [formData, setFormData] = useState({
    position: '',
    firstName: '',
    lastName: '',
    email: '',
    message: '',
    portfolioLink: '',
  });
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [portfolioType, setPortfolioType] = useState<'link' | 'upload'>('link');
  const [portfolioFile, setPortfolioFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');

  useEffect(() => {
    if (selectedPosition) setFormData(prev => ({ ...prev, position: selectedPosition }));
  }, [selectedPosition]);

  const validate = (): FormErrors => {
    const errs: FormErrors = {};
    if (positions.length > 0 && !formData.position) errs.position = 'Please select a position.';
    if (!formData.firstName.trim()) errs.firstName = 'First name is required.';
    if (!formData.lastName.trim()) errs.lastName = 'Last name is required.';
    if (!formData.email.trim()) errs.email = 'Email is required.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) errs.email = 'Please enter a valid email.';
    if (!formData.message.trim()) errs.message = 'Message is required.';
    if (!resumeFile) errs.resume = 'Please upload your resume.';
    if (portfolioType === 'link' && !formData.portfolioLink.trim()) {
      errs.portfolio = 'Please provide a portfolio link.';
    } else if (portfolioType === 'upload' && !portfolioFile) {
      errs.portfolio = 'Please upload your portfolio file.';
    }
    return errs;
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setErrors({});
    setIsSubmitting(true);
    setSubmitStatus('idle');
    try {
      const params = new URLSearchParams();
      params.append('position', formData.position);
      params.append('firstName', formData.firstName);
      params.append('lastName', formData.lastName);
      params.append('email', formData.email);
      params.append('message', formData.message);
      params.append('resume', resumeFile ? resumeFile.name : 'Uncollectable');
      if (portfolioType === 'link') {
        params.append('portfolioLink', formData.portfolioLink);
      } else {
        params.append('portfolioFile', portfolioFile ? portfolioFile.name : 'Uncollectable');
      }
      const response = await fetch('https://readdy.ai/api/form/d6jmlluc9mmd5omn5pag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });
      if (response.ok) {
        setSubmitStatus('success');
        setFormData({ position: '', firstName: '', lastName: '', email: '', message: '', portfolioLink: '' });
        setResumeFile(null);
        setPortfolioFile(null);
      } else {
        setSubmitStatus('error');
      }
    } catch {
      setSubmitStatus('error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Style tokens
  const labelColor  = dark ? 'text-white/45'  : 'text-black/50';
  const inputBase   = `w-full px-0 py-2.5 border-b bg-transparent text-sm focus:outline-none transition-colors duration-200`;
  const inputColor  = dark
    ? 'text-white border-white/20 focus:border-white/60 placeholder:text-white/20'
    : 'text-black border-black/20 focus:border-black placeholder:text-black/25';
  const inputErr    = dark ? 'border-red-400/60' : 'border-red-400';
  const errText     = 'text-red-400 text-[10px] mt-1 tracking-wide';
  const charCount   = dark ? 'text-white/25' : 'text-black/30';
  const uploadColor = dark
    ? 'text-white/45 border-white/20 hover:text-white hover:border-white/60'
    : 'text-black/50 border-black/20 hover:text-black hover:border-black';
  const fileLabel   = dark ? 'text-white/35' : 'text-black/40';
  const btnClass    = dark ? 'bg-white text-black hover:bg-white/85' : 'bg-black text-white hover:bg-black/80';
  const successColor = dark ? 'text-white/50' : 'text-black/60';
  const toggleBase  = `text-[10px] tracking-widest uppercase px-3 py-1 transition-all duration-200 cursor-pointer whitespace-nowrap`;
  const toggleActive = dark
    ? 'bg-white/12 text-white border border-white/25'
    : 'bg-black text-white border border-black';
  const toggleInactive = dark
    ? 'text-white/35 border border-transparent hover:text-white/60'
    : 'text-black/40 border border-transparent hover:text-black/70';

  const req = <span className="text-red-400/70 ml-0.5">*</span>;

  return (
    <div className="w-full">
      {/* Editorial header — full width, same style as other page sections */}
      <div className="flex flex-col items-center text-center md:items-start md:text-left mb-8 pb-7" style={{ borderBottom: `1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}` }}>
          <h2
            className={dark ? 'text-white/93' : 'text-black/82'}
            style={{
              fontFamily: 'Marcellus, serif',
              fontSize: 'clamp(18px, 1.9vw, 26px)',
              letterSpacing: '-0.02em',
              lineHeight: 1.2,
              fontWeight: 400,
              margin: '0 0 12px 0',
            }}
          >
            {t('careers_form_heading')}
          </h2>
          <p
            className={`text-xs ${dark ? 'text-white/45' : 'text-black/50'}`}
            style={{ fontFamily: 'Geist, sans-serif', lineHeight: 1.85, letterSpacing: '0.02em', maxWidth: '480px' }}
          >
            {t('careers_form_desc')}
          </p>
      </div>

      {/* Form — open layout, no box */}
      <form id="careers-application-form" data-readdy-form onSubmit={handleSubmit} className="space-y-4" noValidate>

        {/* Position */}
        {positions.length > 0 && (
          <div>
            <label htmlFor="position" className={`block text-xs tracking-widest uppercase mb-2 ${labelColor}`} style={{ fontFamily: 'Geist, sans-serif', letterSpacing: '0.1em' }}>
              {t('careers_form_position')}{req}
            </label>
            <select
              id="position" name="position"
              value={formData.position}
              onChange={(e) => { setFormData({ ...formData, position: e.target.value }); setErrors(p => ({ ...p, position: undefined })); }}
              className={`${inputBase} cursor-pointer ${errors.position ? inputErr : inputColor}`}
              style={{ fontFamily: 'Geist, sans-serif', appearance: 'none' }}
            >
              <option value="" style={{ background: '#1a2028', color: '#fff' }}>{t('careers_form_position_placeholder')}</option>
              {positions.map(p => (
                <option key={p} value={p} style={{ background: '#1a2028', color: '#fff' }}>{p}</option>
              ))}
              <option value={t('careers_form_open_application')} style={{ background: '#1a2028', color: '#fff' }}>{t('careers_form_open_application')}</option>
            </select>
            {errors.position && <p className={errText} style={{ fontFamily: 'Geist, sans-serif' }}>{errors.position}</p>}
          </div>
        )}

        {/* First + Last name */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="firstName" className={`block text-xs tracking-widest uppercase mb-2 ${labelColor}`} style={{ fontFamily: 'Geist, sans-serif', letterSpacing: '0.1em' }}>
              {t('careers_form_first_name')}{req}
            </label>
            <input
              type="text" id="firstName" name="firstName"
              value={formData.firstName}
              onChange={(e) => { setFormData({ ...formData, firstName: e.target.value }); setErrors(p => ({ ...p, firstName: undefined })); }}
              className={`${inputBase} ${errors.firstName ? inputErr : inputColor}`}
              style={{ fontFamily: 'Geist, sans-serif' }}
            />
            {errors.firstName && <p className={errText} style={{ fontFamily: 'Geist, sans-serif' }}>{errors.firstName}</p>}
          </div>
          <div>
            <label htmlFor="lastName" className={`block text-xs tracking-widest uppercase mb-2 ${labelColor}`} style={{ fontFamily: 'Geist, sans-serif', letterSpacing: '0.1em' }}>
              {t('careers_form_last_name')}{req}
            </label>
            <input
              type="text" id="lastName" name="lastName"
              value={formData.lastName}
              onChange={(e) => { setFormData({ ...formData, lastName: e.target.value }); setErrors(p => ({ ...p, lastName: undefined })); }}
              className={`${inputBase} ${errors.lastName ? inputErr : inputColor}`}
              style={{ fontFamily: 'Geist, sans-serif' }}
            />
            {errors.lastName && <p className={errText} style={{ fontFamily: 'Geist, sans-serif' }}>{errors.lastName}</p>}
          </div>
        </div>

        {/* Email */}
        <div>
          <label htmlFor="email" className={`block text-xs tracking-widest uppercase mb-2 ${labelColor}`} style={{ fontFamily: 'Geist, sans-serif', letterSpacing: '0.1em' }}>
            {t('careers_form_email')}{req}
          </label>
          <input
            type="email" id="email" name="email"
            value={formData.email}
            onChange={(e) => { setFormData({ ...formData, email: e.target.value }); setErrors(p => ({ ...p, email: undefined })); }}
            className={`${inputBase} ${errors.email ? inputErr : inputColor}`}
            style={{ fontFamily: 'Geist, sans-serif' }}
          />
          {errors.email && <p className={errText} style={{ fontFamily: 'Geist, sans-serif' }}>{errors.email}</p>}
        </div>

        {/* Message */}
        <div>
          <label htmlFor="message" className={`block text-xs tracking-widest uppercase mb-2 ${labelColor}`} style={{ fontFamily: 'Geist, sans-serif', letterSpacing: '0.1em' }}>
            {t('careers_form_message')}{req}
          </label>
          <textarea
            id="message" name="message"
            value={formData.message}
            onChange={(e) => { if (e.target.value.length <= 500) { setFormData({ ...formData, message: e.target.value }); setErrors(p => ({ ...p, message: undefined })); } }}
            maxLength={500} rows={3}
            className={`${inputBase} resize-none ${errors.message ? inputErr : inputColor}`}
            style={{ fontFamily: 'Geist, sans-serif' }}
          />
          <div className="flex items-center justify-between mt-1">
            {errors.message
              ? <p className={errText} style={{ fontFamily: 'Geist, sans-serif' }}>{errors.message}</p>
              : <span />}
            <p className={`text-[10px] ${charCount}`} style={{ fontFamily: 'Geist, sans-serif' }}>{formData.message.length}/500</p>
          </div>
        </div>

        {/* Resume upload — required */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label htmlFor="resume" className={`text-xs tracking-widest uppercase ${labelColor}`} style={{ fontFamily: 'Geist, sans-serif', letterSpacing: '0.1em' }}>
              {t('careers_form_upload')}{req}
            </label>
          </div>
          <label
            htmlFor="resume"
            className={`inline-flex items-center gap-2 text-xs tracking-widest uppercase border-b pb-0.5 transition-colors duration-200 cursor-pointer whitespace-nowrap ${errors.resume ? 'text-red-400 border-red-400/60' : uploadColor}`}
            style={{ fontFamily: 'Geist, sans-serif', letterSpacing: '0.1em' }}
          >
            <i className="ri-upload-line text-sm" />
            {resumeFile ? resumeFile.name : 'Choose file (.pdf / .doc / .docx)'}
          </label>
          <input
            type="file" id="resume" name="resume"
            accept=".pdf,.doc,.docx"
            onChange={(e) => { setResumeFile(e.target.files?.[0] || null); setErrors(p => ({ ...p, resume: undefined })); }}
            className="hidden"
          />
          {errors.resume && <p className={errText} style={{ fontFamily: 'Geist, sans-serif' }}>{errors.resume}</p>}
        </div>

        {/* Portfolio — link or upload */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <label className={`text-xs tracking-widest uppercase ${labelColor}`} style={{ fontFamily: 'Geist, sans-serif', letterSpacing: '0.1em' }}>
              Portfolio{req}
            </label>
            {/* Toggle */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => { setPortfolioType('link'); setErrors(p => ({ ...p, portfolio: undefined })); }}
                className={`${toggleBase} ${portfolioType === 'link' ? toggleActive : toggleInactive}`}
                style={{ fontFamily: 'Geist, sans-serif' }}
              >
                <i className="ri-link text-xs mr-1" />Link
              </button>
              <button
                type="button"
                onClick={() => { setPortfolioType('upload'); setErrors(p => ({ ...p, portfolio: undefined })); }}
                className={`${toggleBase} ${portfolioType === 'upload' ? toggleActive : toggleInactive}`}
                style={{ fontFamily: 'Geist, sans-serif' }}
              >
                <i className="ri-upload-line text-xs mr-1" />Upload
              </button>
            </div>
          </div>

          {portfolioType === 'link' ? (
            <input
              type="url" name="portfolioLink"
              value={formData.portfolioLink}
              onChange={(e) => { setFormData({ ...formData, portfolioLink: e.target.value }); setErrors(p => ({ ...p, portfolio: undefined })); }}
              placeholder="https://your-portfolio.com"
              className={`${inputBase} ${errors.portfolio ? inputErr : inputColor}`}
              style={{ fontFamily: 'Geist, sans-serif' }}
            />
          ) : (
            <>
              <label
                htmlFor="portfolioFile"
                className={`inline-flex items-center gap-2 text-xs tracking-widest uppercase border-b pb-0.5 transition-colors duration-200 cursor-pointer whitespace-nowrap ${errors.portfolio ? 'text-red-400 border-red-400/60' : uploadColor}`}
                style={{ fontFamily: 'Geist, sans-serif', letterSpacing: '0.1em' }}
              >
                <i className="ri-upload-line text-sm" />
                {portfolioFile ? portfolioFile.name : 'Choose file (.pdf / .zip / .jpg)'}
              </label>
              <input
                type="file" id="portfolioFile" name="portfolioFile"
                accept=".pdf,.zip,.jpg,.jpeg,.png"
                onChange={(e) => { setPortfolioFile(e.target.files?.[0] || null); setErrors(p => ({ ...p, portfolio: undefined })); }}
                className="hidden"
              />
            </>
          )}
          {errors.portfolio && <p className={errText} style={{ fontFamily: 'Geist, sans-serif' }}>{errors.portfolio}</p>}
        </div>

        {/* Submit row */}
        <div className="flex items-center justify-between pt-1">
          <div>
            {submitStatus === 'success' && (
              <p className={`text-sm ${successColor}`} style={{ fontFamily: 'Geist, sans-serif' }}>{t('careers_form_success')}</p>
            )}
            {submitStatus === 'error' && (
              <p className="text-sm text-red-400" style={{ fontFamily: 'Geist, sans-serif' }}>{t('careers_form_error')}</p>
            )}
          </div>
          <button
            type="submit" disabled={isSubmitting}
            className={`px-8 py-3 text-xs tracking-widest transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap ${btnClass}`}
            style={{ fontFamily: 'Geist, sans-serif', letterSpacing: '0.1em' }}
          >
            {isSubmitting ? t('careers_form_sending') : t('careers_form_send')}
          </button>
        </div>
      </form>
    </div>
  );
}
