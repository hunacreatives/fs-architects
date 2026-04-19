import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';


export default function Footer() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const projectLinks = [
    { label: t('nav_healthcare'),      href: '/projects?category=Healthcare' },
    { label: t('nav_hospitality'),     href: '/projects?category=Hospitality' },
    { label: t('nav_mixed_use'),       href: '/projects?category=Mixed Use' },
    { label: t('nav_offices'),         href: '/projects?category=Offices' },
    { label: t('nav_residential'),     href: '/projects?category=Residential' },
    { label: t('nav_retail'),          href: '/projects?category=Retail' },
    { label: t('nav_interior_design'), href: '/projects?category=Interior Design' },
  ];

  const studioLinks = [
    { label: t('nav_team'),            href: '/studio',  hash: 'team' },
    { label: t('nav_design_process'),  href: '/studio',  hash: 'design-process' },
    { label: t('nav_careers'),         href: '/careers', hash: '' },
    { label: t('nav_contact'),         href: '/contact', hash: '' },
  ];

  const socialLinks = [
    { icon: 'ri-instagram-line',    label: 'Instagram', href: 'https://www.instagram.com/fsarchitects.ph' },
    { icon: 'ri-facebook-line',     label: 'Facebook',  href: 'https://www.facebook.com/fsdesignstudio/' },
    { icon: 'ri-linkedin-box-line', label: 'LinkedIn',  href: 'https://www.linkedin.com/in/fretzsuralta/' },
  ];

  const handleStudioLink = (href: string, hash: string) => {
    navigate(href);
    if (hash) {
      setTimeout(() => {
        const el = document.getElementById(hash);
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      }, 500);
    }
  };

  const linkClass = 'text-white/30 text-[11px] hover:text-white/65 transition-colors duration-300 cursor-pointer whitespace-nowrap';
  const linkStyle = { fontFamily: 'Geist, sans-serif', letterSpacing: '0.03em' };
  const headingStyle = { fontFamily: 'Geist, sans-serif', letterSpacing: '0.14em' };

  return (
    <footer style={{ backgroundColor: '#1a2028' }} className="w-full text-white">
      <div className="w-full px-4 md:px-16 lg:px-24 pt-6 pb-5 lg:py-8">

        {/* ─────────────── MOBILE layout (hidden on lg+) ─────────────── */}
        <div className="flex flex-col gap-5 lg:hidden">

          {/* Row 1: logo + social icons */}
          <div className="flex flex-row items-center justify-between">
            <img
              src="/images/logo-wordmark-alt.png"
              alt="FS Architects"
              className="h-8 w-auto object-contain brightness-0 invert"
              draggable={false}
            />
            <div className="flex items-center gap-3">
              {socialLinks.map(({ icon, label, href }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  className="w-6 h-6 flex items-center justify-center text-white/30 hover:text-white/65 transition-colors duration-300 cursor-pointer"
                >
                  <i className={`${icon} text-sm`} />
                </a>
              ))}
            </div>
          </div>

          {/* Row 2: Projects + Studio side by side */}
          <div className="grid grid-cols-2 gap-5">

            {/* Projects */}
            <div className="flex flex-col gap-2">
              <p className="text-white/70 text-[10px] tracking-widest uppercase" style={headingStyle}>
                {t('footer_projects')}
              </p>
              <div className="flex flex-col gap-1.5">
                {projectLinks.map(({ label, href }) => (
                  <a
                    key={label}
                    href={href}
                    onClick={(e) => { e.preventDefault(); navigate(href); }}
                    className={linkClass}
                    style={linkStyle}
                  >
                    {label}
                  </a>
                ))}
              </div>
            </div>

            {/* Studio + Get in touch */}
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <p className="text-white/70 text-[10px] tracking-widest uppercase" style={headingStyle}>
                  {t('footer_studio')}
                </p>
                <div className="flex flex-col gap-1.5">
                  {studioLinks.map(({ label, href, hash }) => (
                    <a
                      key={label}
                      href={hash ? `${href}#${hash}` : href}
                      onClick={(e) => { e.preventDefault(); handleStudioLink(href, hash); }}
                      className={linkClass}
                      style={linkStyle}
                    >
                      {label}
                    </a>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <p className="text-white/70 text-[10px] tracking-widest uppercase" style={headingStyle}>
                  {t('footer_get_in_touch')}
                </p>
                <a href="mailto:info@fsarchitects.ph" className={linkClass} style={linkStyle}>
                  info@fsarchitects.ph
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* ─────────────── DESKTOP layout (hidden below lg) ─────────────── */}
        <div className="hidden lg:flex lg:flex-row lg:items-start lg:justify-between gap-8">

          {/* Left — Logo + divider + Get in Touch + social */}
          <div className="flex flex-row items-start gap-10">
            {/* Logo + tagline */}
            <div className="shrink-0">
              <img
                src="/images/logo-wordmark-alt.png"
                alt="FS Architects"
                className="h-10 w-auto object-contain object-top brightness-0 invert block -mt-3"
                draggable={false}
              />
              <p
                className="text-white/30 text-[11px] leading-relaxed max-w-[150px] -mt-1"
                style={{ fontFamily: 'Geist, sans-serif', letterSpacing: '0.05em' }}
              >
                {t('footer_tagline')}
              </p>
            </div>

            {/* Vertical divider */}
            <div className="w-px bg-white/10 self-stretch" />

            {/* Get in Touch + social */}
            <div className="flex flex-col gap-2.5">
              <p className="text-white/70 text-[10px] leading-none tracking-widest uppercase" style={headingStyle}>
                {t('footer_get_in_touch')}
              </p>
              <a
                href="mailto:info@fsarchitects.ph"
                className="text-white/30 text-[11px] hover:text-white/65 transition-colors duration-300 cursor-pointer"
                style={linkStyle}
              >
                info@fsarchitects.ph
              </a>
              <div className="flex items-center gap-3 mt-0.5">
                {socialLinks.map(({ icon, label, href }) => (
                  <a
                    key={label}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={label}
                    className="flex items-center justify-center text-white/30 hover:text-white/65 transition-colors duration-300 cursor-pointer"
                  >
                    <i className={`${icon} text-sm`} />
                  </a>
                ))}
              </div>
            </div>
          </div>

          {/* Right — nav link rows */}
          <div className="flex flex-col gap-5">
            {/* Projects — horizontal */}
            <div className="flex flex-col gap-2">
              <p className="text-white/70 text-[10px] leading-none tracking-widest uppercase" style={headingStyle}>
                {t('footer_projects')}
              </p>
              <div className="flex flex-row flex-wrap gap-x-5 gap-y-1.5">
                {projectLinks.map(({ label, href }) => (
                  <a
                    key={label}
                    href={href}
                    onClick={(e) => { e.preventDefault(); navigate(href); }}
                    className={linkClass}
                    style={linkStyle}
                  >
                    {label}
                  </a>
                ))}
              </div>
            </div>

            {/* Studio — horizontal */}
            <div className="flex flex-col gap-2">
              <p className="text-white/70 text-[10px] leading-none tracking-widest uppercase" style={headingStyle}>
                {t('footer_studio')}
              </p>
              <div className="flex flex-row flex-wrap gap-x-5 gap-y-1.5">
                {studioLinks.map(({ label, href, hash }) => (
                  <a
                    key={label}
                    href={hash ? `${href}#${hash}` : href}
                    onClick={(e) => { e.preventDefault(); handleStudioLink(href, hash); }}
                    className={linkClass}
                    style={linkStyle}
                  >
                    {label}
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="w-full px-4 md:px-16 lg:px-24">
        <div className="h-px bg-white/10 w-full" />
      </div>

      {/* Bottom bar */}
      <div className="w-full px-4 md:px-16 lg:px-24 py-3 lg:py-4 flex flex-col sm:flex-row items-start sm:items-center sm:justify-between gap-1 sm:gap-2">
        <a
          href="https://hunacreatives.com"
          target="_blank"
          rel="nofollow noopener noreferrer"
          className="text-white/20 text-[11px] hover:text-white/45 transition-colors duration-300 cursor-pointer whitespace-nowrap"
          style={{ fontFamily: 'Geist, sans-serif', letterSpacing: '0.06em' }}
        >
          {t('footer_website_by')} Huna Creatives
        </a>
        <p
          className="text-white/20 text-[11px]"
          style={{ fontFamily: 'Geist, sans-serif', letterSpacing: '0.06em' }}
        >
          © {new Date().getFullYear()} FS Architects. All Rights Reserved.
        </p>
      </div>
    </footer>
  );
}
