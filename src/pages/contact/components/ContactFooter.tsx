import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

interface ContactFooterProps {
  hideContactBar?: boolean;
}

export default function ContactFooter({ hideContactBar = false }: ContactFooterProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const navLinks = [
    { label: t('nav_home'), href: '/' },
    { label: t('nav_projects'), href: '/projects' },
    { label: t('nav_studio'), href: '/studio' },
    { label: t('nav_careers'), href: '/careers' },
    { label: t('nav_contact'), href: '/contact' },
  ];

  const socials = [
    { icon: 'ri-facebook-fill', label: 'Facebook', href: '#' },
    { icon: 'ri-instagram-line', label: 'Instagram', href: '#' },
    { icon: 'ri-linkedin-fill', label: 'LinkedIn', href: '#' },
  ];

  return (
    <footer className="w-full bg-white">

      {/* ── TOP SECTION: Contact Us bar ── */}
      {!hideContactBar && (
        <>
          <div className="w-full px-4 md:px-20 lg:px-28 pt-6 pb-5 flex flex-col sm:flex-row sm:items-center justify-start gap-3 sm:gap-10">
            <h2
              className="text-2xl font-semibold text-black tracking-tight whitespace-nowrap"
              style={{ fontFamily: 'Marcellus, serif' }}
            >
              {t('contact_footer_heading')}
            </h2>
            <div className="hidden sm:block w-px h-8 bg-black/15 flex-shrink-0" />
            <p
              className="text-xs text-black/50 leading-relaxed [text-wrap:pretty]"
              style={{ fontFamily: 'Geist, sans-serif' }}
            >
              <button
                onClick={() => navigate('/contact')}
                className="underline underline-offset-2 hover:text-black/80 transition-colors duration-200 cursor-pointer whitespace-nowrap"
              >
                {t('contact_footer_discuss')}
              </button>
              {' '}{t('contact_footer_form_note')}
            </p>
          </div>
          <div className="w-full px-4 md:px-20 lg:px-28">
            <div className="w-full h-px bg-black/10" />
          </div>
        </>
      )}

      {hideContactBar && (
        <div className="w-full px-4 md:px-20 lg:px-28">
          <div className="w-full h-px bg-black/10" />
        </div>
      )}

      {/* ── BOTTOM SECTION ── */}
      <div className="w-full px-4 md:px-20 lg:px-28 pt-5 pb-7 flex flex-col md:flex-row md:items-end md:justify-between gap-0 md:gap-6">

        {/* Left block — logo + nav */}
        <div className="flex flex-col gap-2">
          <img
            src="/images/logo-footer.png"
            alt="FS Architects"
            className="h-14 w-auto object-contain object-left"
            draggable={false}
          />
          <nav className="flex items-center gap-4 flex-wrap">
            {navLinks.map(({ label, href }) => (
              <button
                key={label}
                onClick={() => href.startsWith('/') ? navigate(href) : undefined}
                className="text-xs text-black/50 hover:text-black transition-colors duration-200 cursor-pointer whitespace-nowrap"
                style={{ fontFamily: 'Geist, sans-serif', letterSpacing: '0.03em' }}
              >
                {label}
              </button>
            ))}
          </nav>
        </div>

        {/* Mobile divider between blocks */}
        <div className="w-full h-px bg-black/8 my-5 md:hidden" />

        {/* Right block — GET IN TOUCH, email, socials */}
        <div className="flex flex-col items-start md:items-end gap-2">
          <p
            className="text-xs font-bold text-black tracking-widest uppercase"
            style={{ fontFamily: 'Geist, sans-serif', letterSpacing: '0.14em' }}
          >
            {t('footer_get_in_touch')}
          </p>
          <a
            href="mailto:info@fsarchitects.ph"
            className="text-xs text-black/50 hover:text-black transition-colors duration-200 cursor-pointer"
            style={{ fontFamily: 'Geist, sans-serif' }}
          >
            info@fsarchitects.ph
          </a>
          <div className="flex items-center gap-3 mt-0.5">
            {socials.map(({ icon, label, href }) => (
              <a
                key={label}
                href={href}
                aria-label={label}
                className="w-6 h-6 flex items-center justify-center text-black/50 hover:text-black transition-colors duration-200 cursor-pointer"
              >
                <i className={`${icon} text-base`} />
              </a>
            ))}
          </div>
        </div>

      </div>
    </footer>
  );
}
