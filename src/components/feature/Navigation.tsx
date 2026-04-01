import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';

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
  const navigate = useNavigate();
  const { t } = useTranslation();

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
        className={`fixed top-0 left-0 right-0 z-40 transition-all duration-700 overflow-visible ${
          showContent === false
            ? 'opacity-0'
            : isScrolled
              ? isDark
                ? 'bg-white/95 backdrop-blur-sm'
                : 'bg-black/20 backdrop-blur-sm'
              : 'bg-transparent'
        }`}
      >

        <div className="relative w-full px-4 md:px-16 lg:px-24 flex items-center justify-between" style={{ height: '56px' }}>

          {/* Left — FS Logo morphs into hamburger lines on hover */}
          <div className="w-10 md:w-32 flex items-center gap-4">
            <button
              onClick={() => setMenuOpen(true)}
              className="flex items-center group cursor-pointer"
              aria-label="Open menu"
            >
              <div className="relative w-[43px] h-[43px] flex items-center justify-center">
                <img
                  src={isDark
                    ? "https://static.readdy.ai/image/08981d36cd0b73cf08022d4d82071d03/1059e0a313dadf06683203566a99a94a.png"
                    : "https://static.readdy.ai/image/08981d36cd0b73cf08022d4d82071d03/af9840250b5d4b8ed50bb36142137e11.png"}
                  alt="FS"
                  className={`absolute inset-0 w-full h-full object-contain transition-all duration-500 ease-in-out group-hover:opacity-0 group-hover:scale-75 ${
                    isDark ? '' : 'brightness-0 invert'
                  }`}
                  draggable={false}
                />
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-[6px] opacity-0 scale-75 group-hover:opacity-100 group-hover:scale-100 transition-all duration-500 ease-in-out">
                  {[20, 14, 20].map((w, i) => (
                    <div
                      key={i}
                      className={`h-px transition-colors duration-500 ${isDark ? 'bg-black' : 'bg-white'}`}
                      style={{ width: `${w}px` }}
                    />
                  ))}
                </div>
              </div>
            </button>
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
              src="https://static.readdy.ai/image/08981d36cd0b73cf08022d4d82071d03/ba19a8ad592864043ff2c21c8607c9c8.png"
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
          <div className={`flex-1 h-px ${isDark ? 'bg-black/15' : 'bg-white/15'}`} />
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
          <button
            onClick={() => setMenuOpen(false)}
            className="flex items-center group cursor-pointer p-0"
            aria-label="Close menu"
          >
            <div className="relative w-[36px] h-[36px] flex items-center justify-center">
              <img
                src="https://static.readdy.ai/image/08981d36cd0b73cf08022d4d82071d03/af9840250b5d4b8ed50bb36142137e11.png"
                alt="FS"
                className="absolute inset-0 w-full h-full object-contain brightness-0 invert opacity-80 transition-all duration-500 ease-in-out group-hover:opacity-0 group-hover:scale-75"
                draggable={false}
              />
              <div className="absolute inset-0 flex items-center justify-center opacity-0 scale-75 group-hover:opacity-100 group-hover:scale-100 transition-all duration-500 ease-in-out">
                <div className="relative w-4 h-4">
                  <div className="w-4 h-px bg-white/80 absolute top-1/2 left-0" style={{ transform: 'rotate(45deg)' }} />
                  <div className="w-4 h-px bg-white/80 absolute top-1/2 left-0" style={{ transform: 'rotate(-45deg)' }} />
                </div>
              </div>
            </div>
          </button>
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
