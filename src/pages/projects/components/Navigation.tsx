import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import i18n from '../../../i18n';

const LOGO_URL = 'https://storage.readdy-site.link/project_files/3530b75e-ff34-41a0-81d5-ae38e0742267/4fa7d6c0-23e8-4c54-909a-7ec172674b09_4.png?v=5d628b311d93cf6c9d87f976195cb525';
const HAMBURGER_URL = 'https://storage.readdy-site.link/project_files/3530b75e-ff34-41a0-81d5-ae38e0742267/d4e31a0a-648a-4452-a5fd-4db72583e0fa_5.png?v=7ea3e0a25c871cbaa6d3cdbb2436b6f2';
const GIF_FORWARD_URL = 'https://storage.readdy-site.link/project_files/3530b75e-ff34-41a0-81d5-ae38e0742267/e3962a03-d22f-4483-8872-cac9f70174a6_FINAL---SASDASDSDasdas-ezgif.com-speed.gif?v=09ea27f14667d24b5d855d81536e0939';
const GIF_REVERSE_URL = 'https://storage.readdy-site.link/project_files/3530b75e-ff34-41a0-81d5-ae38e0742267/fe01d251-7e54-4397-ab42-e87878638b7e_REVERSE-FINAL-SASDASDSDasdas-ezgif.com-speed-4.gif?v=19c0e1751bcc95621cc3ead5d5d338b8';

const FORWARD_DURATION = 8430;
const REVERSE_DURATION = 720;

type Phase = 'logo' | 'forward' | 'hamburger' | 'reverse';

function LogoHamburger({ size = 43, onClick, invert = false }: { size?: number; onClick?: () => void; invert?: boolean }) {
  const [phase, setPhase] = useState<Phase>('logo');
  const [forwardReady, setForwardReady] = useState(false);
  const [reverseReady, setReverseReady] = useState(false);
  const forwardRef = useRef<HTMLImageElement>(null);
  const reverseRef = useRef<HTMLImageElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phaseRef = useRef<Phase>('logo');

  const imgStyle: React.CSSProperties = invert ? { filter: 'invert(1)' } : {};

  const updatePhase = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  useEffect(() => {
    const fwd = new Image();
    fwd.onload = () => setForwardReady(true);
    fwd.src = GIF_FORWARD_URL;

    const rev = new Image();
    rev.onload = () => setReverseReady(true);
    rev.src = GIF_REVERSE_URL;

    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  const handleMouseEnter = () => {
    if (!forwardReady) return;
    if (phaseRef.current === 'hamburger') return;
    if (timerRef.current) clearTimeout(timerRef.current);
    if (forwardRef.current) {
      forwardRef.current.src = `${GIF_FORWARD_URL}#${Date.now()}`;
    }
    updatePhase('forward');
    timerRef.current = setTimeout(() => updatePhase('hamburger'), FORWARD_DURATION);
  };

  const handleMouseLeave = () => {
    const current = phaseRef.current;
    if (current === 'logo') return;
    if (timerRef.current) clearTimeout(timerRef.current);
    if (reverseReady && reverseRef.current) {
      reverseRef.current.src = `${GIF_REVERSE_URL}#${Date.now()}`;
    }
    updatePhase('reverse');
    timerRef.current = setTimeout(() => updatePhase('logo'), REVERSE_DURATION);
  };

  return (
    <button
      onClick={onClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className="flex items-center cursor-pointer p-0 bg-transparent border-0 outline-none"
      aria-label="Open menu"
      style={{ width: size, height: size }}
    >
      <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
        <img
          src={LOGO_URL}
          alt="FS"
          className="absolute inset-0 w-full h-full object-contain"
          style={{ visibility: phase === 'logo' ? 'visible' : 'hidden', ...imgStyle }}
          draggable={false}
        />
        {forwardReady && (
          <img
            ref={forwardRef}
            src={GIF_FORWARD_URL}
            alt=""
            className="absolute inset-0 w-full h-full object-contain"
            style={{ visibility: phase === 'forward' ? 'visible' : 'hidden', ...imgStyle }}
            draggable={false}
          />
        )}
        <img
          src={HAMBURGER_URL}
          alt=""
          className="absolute inset-0 w-full h-full object-contain"
          style={{ visibility: phase === 'hamburger' ? 'visible' : 'hidden', ...imgStyle }}
          draggable={false}
        />
        {reverseReady && (
          <img
            ref={reverseRef}
            src={GIF_REVERSE_URL}
            alt=""
            className="absolute inset-0 w-full h-full object-contain"
            style={{ visibility: phase === 'reverse' ? 'visible' : 'hidden', ...imgStyle }}
            draggable={false}
          />
        )}
      </div>
    </button>
  );
}

const LANGUAGES = [
  { label: 'ENG', code: 'en' },
  { label: 'ESP', code: 'es' },
  { label: '中文', code: 'zh' },
] as const;

type LangLabel = typeof LANGUAGES[number]['label'];

export default function Navigation() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [activeLanguage, setActiveLanguage] = useState<LangLabel>('ENG');
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  const { t } = useTranslation();

  const menuItems = [
    { label: t('nav_home'), href: '/', sub: [] },
    {
      label: t('nav_projects'),
      href: '/projects',
      sub: [
        { label: t('nav_healthcare'), href: '/projects?category=Healthcare' },
        { label: t('nav_hospitality'), href: '/projects?category=Hospitality' },
        { label: t('nav_mixed_use'), href: '/projects?category=Mixed+Use' },
        { label: t('nav_offices'), href: '/projects?category=Offices' },
        { label: t('nav_residential'), href: '/projects?category=Residential' },
        { label: t('nav_retail'), href: '/projects?category=Retail' },
        { label: t('nav_interior_design'), href: '/projects?category=Interior+Design' },
      ],
    },
    {
      label: t('nav_studio'),
      href: '#studio',
      sub: [
        { label: t('nav_team'), href: '#team' },
        { label: t('nav_design_process'), href: '#design-process' },
      ],
    },
    { label: t('nav_careers'), href: '#careers', sub: [] },
    { label: t('nav_contact'), href: '#contact', sub: [] },
  ];

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [menuOpen]);

  // Sync active language label with current i18n language on mount
  useEffect(() => {
    const current = LANGUAGES.find((l) => l.code === i18n.language);
    if (current) setActiveLanguage(current.label);
  }, []);

  const handleLanguageChange = (lang: typeof LANGUAGES[number]) => {
    setActiveLanguage(lang.label);
    i18n.changeLanguage(lang.code);
  };

  const handleNavClick = (href: string) => {
    setMenuOpen(false);
    if (href.startsWith('/')) {
      navigate(href);
    } else if (href.startsWith('#')) {
      const el = document.querySelector(href);
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <>
      <nav
        className={`fixed top-0 left-0 right-0 z-40 transition-all duration-700 ${
          isScrolled ? 'bg-white/95 backdrop-blur-sm shadow-sm' : 'bg-white'
        }`}
      >
        <div className="absolute top-0 left-0 right-0 h-px bg-black/10" />

        <div className="w-full px-8 md:px-16 lg:px-24 py-1.5 flex items-center justify-between">

          {/* Left — FS Logo morphs into hamburger via GIF on hover (inverted for dark nav) */}
          <div className="w-32 flex items-center">
            <LogoHamburger size={43} onClick={() => setMenuOpen(true)} invert />
          </div>

          {/* Center — brand logo */}
          <div className="flex items-center justify-center">
            <img
              src="https://static.readdy.ai/image/08981d36cd0b73cf08022d4d82071d03/ba19a8ad592864043ff2c21c8607c9c8.png"
              alt="FS Architects"
              style={{ height: '36px', width: 'auto', minWidth: '160px', objectFit: 'contain', display: 'block' }}
              draggable={false}
            />
          </div>

          {/* Right — language selector */}
          <div className="flex items-center gap-2 text-xs tracking-wider w-32 justify-end">
            {LANGUAGES.map((lang, i) => (
              <div key={lang.label} className="flex items-center gap-2">
                <button
                  onClick={() => handleLanguageChange(lang)}
                  className={`transition-all duration-300 whitespace-nowrap cursor-pointer ${
                    activeLanguage === lang.label
                      ? 'text-black opacity-100 font-semibold'
                      : 'text-black/50 hover:text-black/90'
                  }`}
                  style={{ letterSpacing: '0.1em' }}
                >
                  {lang.label}
                </button>
                {i < 2 && <div className="w-px h-3 bg-black/30" />}
              </div>
            ))}
          </div>

        </div>

        {/* Thin divider line */}
        <div className="w-full px-8 md:px-16 lg:px-24 flex items-center">
          <div className="flex-1 h-px bg-black/15" />
        </div>
      </nav>

      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity duration-500 ${
          menuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={() => setMenuOpen(false)}
      />

      {/* Left sliding panel */}
      <div
        className={`fixed top-0 left-0 h-full z-50 flex flex-col transition-transform duration-500 ease-in-out ${
          menuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{ width: '280px', backgroundColor: '#2b3640' }}
      >
        {/* Panel header */}
        <div className="flex items-center pl-6 pr-8 py-5">
          <LogoHamburger size={48} onClick={() => setMenuOpen(false)} />
        </div>

        {/* Thin divider */}
        <div className="w-full h-px bg-white/10 mb-2" />

        {/* Nav links */}
        <nav className="flex-1 overflow-y-auto px-8 py-4">
          {menuItems.map(({ label, href, sub }) => (
            <div key={href} className="mb-1">
              <button
                onClick={() => handleNavClick(href)}
                className="flex items-center w-full text-left text-white text-[17px] font-normal tracking-wide py-1.5 hover:text-white/70 transition-colors duration-300 cursor-pointer"
                style={{ fontFamily: 'Marcellus, serif', letterSpacing: '0.04em' }}
              >
                <span className="whitespace-nowrap">{label}</span>
              </button>
              {sub.length > 0 && (
                <div className="mb-1.5 flex flex-col gap-0.5">
                  {sub.map((item) => (
                    <button
                      key={item.href}
                      onClick={() => handleNavClick(item.href)}
                      className="block w-full text-left text-white/45 text-[11px] py-0.5 hover:text-white/75 transition-colors duration-300 cursor-pointer whitespace-nowrap"
                      style={{ fontFamily: 'Geist, sans-serif', letterSpacing: '0.03em' }}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>

        {/* Bottom strip */}
        <div className="px-8 py-4 border-t border-white/10">
          <div className="flex flex-col gap-2 text-white/30 text-xs tracking-wider">
            <a href="#" className="hover:text-white/60 transition-colors duration-300 cursor-pointer whitespace-nowrap">{t('nav_instagram')}</a>
            <a href="#" className="hover:text-white/60 transition-colors duration-300 cursor-pointer whitespace-nowrap">{t('nav_linkedin')}</a>
          </div>
          <p className="text-white/20 text-[11px] mt-4 leading-relaxed" style={{ letterSpacing: '0.08em' }}>
            {t('nav_tagline')}
          </p>
        </div>
      </div>
    </>
  );
}
