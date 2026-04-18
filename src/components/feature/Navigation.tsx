import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';

const LOGO_URL = '/images/logo-fs.png';
const HAMBURGER_URL = '/images/hamburger.png';
const GIF_FORWARD_URL = '/images/logo-forward.gif';
const GIF_REVERSE_URL = '/images/logo-reverse.gif';

const FORWARD_DURATION = 8430;
const REVERSE_DURATION = 680;

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
    // Reset src while still at opacity 0, then flip phase next frame to avoid flicker
    if (forwardRef.current) {
      forwardRef.current.src = `${GIF_FORWARD_URL}#${Date.now()}`;
    }
    requestAnimationFrame(() => {
      updatePhase('forward');
      timerRef.current = setTimeout(() => updatePhase('hamburger'), FORWARD_DURATION);
    });
  };

  const handleMouseLeave = () => {
    const current = phaseRef.current;
    if (current === 'logo') return;
    if (timerRef.current) clearTimeout(timerRef.current);
    // Reset src while still at opacity 0, then flip phase next frame to avoid flicker
    if (reverseReady && reverseRef.current) {
      reverseRef.current.src = `${GIF_REVERSE_URL}#${Date.now()}`;
    }
    requestAnimationFrame(() => {
      updatePhase('reverse');
      timerRef.current = setTimeout(() => updatePhase('logo'), REVERSE_DURATION);
    });
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
          style={{ opacity: phase === 'logo' ? 1 : 0, ...imgStyle }}
          draggable={false}
        />
        {forwardReady && (
          <img
            ref={forwardRef}
            src={GIF_FORWARD_URL}
            alt=""
            className="absolute inset-0 w-full h-full object-contain"
            style={{ opacity: phase === 'forward' ? 1 : 0, ...imgStyle }}
            draggable={false}
          />
        )}
        <img
          src={HAMBURGER_URL}
          alt=""
          className="absolute inset-0 w-full h-full object-contain"
          style={{ opacity: phase === 'hamburger' ? 1 : 0, ...imgStyle }}
          draggable={false}
        />
        {reverseReady && (
          <img
            ref={reverseRef}
            src={GIF_REVERSE_URL}
            alt=""
            className="absolute inset-0 w-full h-full object-contain"
            style={{ opacity: phase === 'reverse' ? 1 : 0, ...imgStyle }}
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

interface NavigationProps {
  theme?: 'light' | 'dark';
  showContent?: boolean;
  pageTitle?: string;
}

export default function Navigation({ theme = 'light', showContent, pageTitle }: NavigationProps) {
  const [isScrolled, setIsScrolled] = useState(false);
  const [activeLanguage, setActiveLanguage] = useState<LangLabel>('ENG');
  const [menuOpen, setMenuOpen] = useState(false);
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});

  const navigate = useNavigate();
  const { t } = useTranslation();
  const { pathname } = useLocation();

  const isDark = theme === 'dark';

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
      href: '/studio',
      sub: [
        { label: t('nav_team'), href: '/studio#team' },
        { label: t('nav_design_process'), href: '/studio#design-process' },
      ],
    },
    { label: t('nav_careers'), href: '/careers', sub: [] },
    { label: t('nav_contact'), href: '/contact', sub: [] },
  ];

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    if (!menuOpen) setExpandedItems({});
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
    if (href.includes('#')) {
      const [path, hash] = href.split('#');
      const scrollToSection = () => {
        const el = document.getElementById(hash);
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      };
      if (!path || window.location.pathname === path) {
        setTimeout(scrollToSection, 100);
      } else {
        navigate(path);
        setTimeout(scrollToSection, 500);
      }
    } else if (href.startsWith('/')) {
      navigate(href);
    } else if (href.startsWith('#')) {
      const el = document.querySelector(href);
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <>
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-700 overflow-visible ${
          showContent === false
            ? 'opacity-0'
            : isDark
              ? isScrolled
                ? 'bg-white/98 backdrop-blur-sm shadow-sm'
                : 'bg-white'
              : isScrolled
                ? 'bg-black/20 backdrop-blur-sm'
                : 'bg-transparent'
        }`}
      >

        <div className="relative w-full px-4 md:px-16 lg:px-24 flex items-center justify-between" style={{ height: '56px' }}>

          {/* Left — FS Logo morphs into hamburger via GIF on hover */}
          <div className="w-10 md:w-32 flex items-center gap-4">
            <LogoHamburger size={56} onClick={() => setMenuOpen(true)} invert={isDark} />
            {pageTitle && (
              <span
                className="text-[9px] tracking-widest uppercase whitespace-nowrap"
                style={{
                  fontFamily: 'Geist, sans-serif',
                  letterSpacing: '0.22em',
                  color: isDark ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.55)',
                }}
              >
                {pageTitle}
              </span>
            )}
          </div>

          {/* Center — brand logo — absolutely centered so it's always pixel-perfect */}
          <button
            onClick={() => handleNavClick('/')}
            className="absolute left-1/2 -translate-x-1/2 flex items-center justify-center cursor-pointer"
            aria-label="Go to homepage"
          >
            <img
              src="/images/logo-wordmark.png"
              alt="FS Architects"
              className={`transition-all duration-700 ${isDark ? '' : 'brightness-0 invert'}`}
              style={{ height: '62px', width: 'auto', objectFit: 'contain', display: 'block' }}
              draggable={false}
            />
          </button>

          {/* Right — language selector */}
          <div className="flex items-center gap-1.5 md:gap-2 text-xs tracking-wider w-auto md:w-32 justify-end">
            {LANGUAGES.map((lang, i) => (
              <div key={lang.label} className="flex items-center gap-1.5 md:gap-2">
                <button
                  onClick={() => handleLanguageChange(lang)}
                  className={`transition-all duration-300 whitespace-nowrap cursor-pointer text-[10px] md:text-xs ${
                    activeLanguage === lang.label
                      ? isDark ? 'text-black opacity-100 font-semibold' : 'text-white opacity-100 font-semibold'
                      : isDark ? 'text-black/50 hover:text-black/90' : 'text-white/50 hover:text-white/90'
                  }`}
                  style={{ letterSpacing: '0.08em' }}
                >
                  {lang.label}
                </button>
                {i < 2 && (
                  <div className={`w-px h-2.5 md:h-3 ${isDark ? 'bg-black/30' : 'bg-white/30'}`} />
                )}
              </div>
            ))}
          </div>

        </div>

        {/* Thin divider line — full-width when scrolled, padded when at top */}
        <div className={`w-full flex items-center transition-all duration-700 ${isScrolled ? 'px-0' : 'px-4 md:px-16 lg:px-24'}`}>
          <div className={`flex-1 h-px transition-all duration-700 ${isDark ? (isScrolled ? 'bg-black/25' : 'bg-black/10') : 'bg-white/15'}`} />
        </div>
      </nav>

      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-50 bg-black/40 transition-opacity duration-500 ${
          menuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={() => setMenuOpen(false)}
      />

      {/* Left sliding panel */}
      <div
        className={`fixed top-0 left-0 h-full z-[60] flex flex-col transition-transform duration-500 ease-in-out ${
          menuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{ width: '280px', backgroundColor: '#2b3640' }}
      >
        {/* Panel header */}
        <div className="flex items-center pl-6 pr-8 py-5">
          <button
            onClick={() => setMenuOpen(false)}
            className="cursor-pointer p-0 bg-transparent border-0 outline-none"
            aria-label="Close menu"
          >
            <img
              src={LOGO_URL}
              alt="FS"
              style={{ width: 48, height: 48, objectFit: 'contain' }}
              draggable={false}
            />
          </button>
        </div>

        {/* Thin divider */}
        <div className="w-full h-px bg-white/10 mb-2" />

        {/* Nav links */}
        <nav className="flex-1 overflow-y-auto px-8 py-4">
          {menuItems.map(({ label, href, sub }) => {
            const isExpanded = expandedItems[href] ?? false;
            const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href);
            return (
              <div key={href} className="mb-1">
                <div className="flex items-center w-full">
                  <button
                    onClick={() => !isActive && handleNavClick(href)}
                    disabled={isActive}
                    className={`flex-1 text-left text-[17px] font-normal tracking-wide py-1.5 transition-colors duration-300 ${isActive ? 'text-white/35 cursor-default' : 'text-white hover:text-white/70 cursor-pointer'}`}
                    style={{ fontFamily: 'Marcellus, serif', letterSpacing: '0.04em' }}
                  >
                    <span className="whitespace-nowrap">{label}</span>
                  </button>
                  {sub.length > 0 && (
                    <button
                      onClick={() => setExpandedItems(prev => ({ ...prev, [href]: !isExpanded }))}
                      className="flex items-center justify-center w-7 h-7 text-white/40 hover:text-white/70 transition-colors duration-300 cursor-pointer"
                      aria-label={isExpanded ? 'Collapse' : 'Expand'}
                    >
                      <svg
                        width="10" height="10" viewBox="0 0 10 10" fill="none"
                        className={`transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}
                      >
                        <path d="M1 3l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  )}
                </div>
                {sub.length > 0 && (
                  <div
                    className="overflow-hidden transition-all duration-300"
                    style={{ maxHeight: isExpanded ? `${sub.length * 28}px` : '0px' }}
                  >
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
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Bottom strip */}
        <div className="px-8 py-4 border-t border-white/10">
          <div className="flex items-center gap-5">
            <a href="#" aria-label="Facebook" className="w-8 h-8 flex items-center justify-center text-white/35 hover:text-white/80 transition-colors duration-300 cursor-pointer">
              <i className="ri-facebook-fill text-lg" />
            </a>
            <a href="#" aria-label="Instagram" className="w-8 h-8 flex items-center justify-center text-white/35 hover:text-white/80 transition-colors duration-300 cursor-pointer">
              <i className="ri-instagram-line text-lg" />
            </a>
            <a href="#" aria-label="LinkedIn" className="w-8 h-8 flex items-center justify-center text-white/35 hover:text-white/80 transition-colors duration-300 cursor-pointer">
              <i className="ri-linkedin-fill text-lg" />
            </a>
          </div>
        </div>
      </div>
    </>
  );
}
