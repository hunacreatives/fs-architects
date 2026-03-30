import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

interface ProjectHeroProps {
  name: string;
  address: string;
  category: string;
  image: string;
}

export default function ProjectHero({ name, address, category, image }: ProjectHeroProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 120);
    return () => clearTimeout(timer);
  }, []);

  const fadeClass = (delay: string) =>
    `transition-all duration-700 ease-out ${delay} ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'}`;

  return (
    <div className="relative w-full h-[60vh] md:h-screen md:max-h-[680px]">
      {/* Background image */}
      <div
        className="absolute inset-0 bg-cover bg-top bg-scroll md:bg-fixed"
        style={{ backgroundImage: `url(${image})` }}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/8 to-transparent" />

      {/* Back button */}
      <button
        onClick={() => navigate('/projects')}
        className={`absolute top-24 md:top-28 left-4 md:left-16 lg:left-24 flex items-center gap-2 text-white/60 hover:text-white cursor-pointer group ${fadeClass('delay-[200ms]')}`}
        style={{ fontFamily: 'Geist, sans-serif', letterSpacing: '0.08em', fontSize: '10px', textTransform: 'uppercase' }}
      >
        <span className="w-4 h-4 flex items-center justify-center group-hover:-translate-x-1 transition-transform duration-300">
          <i className="ri-arrow-left-line text-sm" />
        </span>
        {t('detail_back')}
      </button>

      {/* ── Mobile bottom block ── */}
      <div className="md:hidden absolute bottom-8 left-4 right-4">
        <span
          className={`inline-block border border-white/30 text-white/60 text-[9px] px-3 py-1 tracking-widest mb-3 ${fadeClass('delay-[300ms]')}`}
          style={{ fontFamily: 'Geist, sans-serif', letterSpacing: '0.14em', textTransform: 'uppercase' }}
        >
          {category}
        </span>
        <h1
          className={`text-2xl font-light text-white mb-1.5 leading-tight [text-wrap:pretty] ${fadeClass('delay-[400ms]')}`}
          style={{ fontFamily: 'Marcellus, serif' }}
        >
          {name}
        </h1>
        <p
          className={`text-white/55 text-[10px] tracking-wider uppercase ${fadeClass('delay-[500ms]')}`}
          style={{ fontFamily: 'Geist, sans-serif', letterSpacing: '0.08em' }}
        >
          {address}
        </p>
      </div>

      {/* ── Desktop bottom ── */}
      <div className="hidden md:flex absolute bottom-10 left-16 lg:left-24 right-16 lg:right-24 items-end justify-between">
        {/* Title + address */}
        <div className={fadeClass('delay-[300ms]')}>
          <h1
            className="font-light text-white mb-1.5 leading-tight"
            style={{ fontFamily: 'Marcellus, serif', fontSize: 'clamp(26px, 3vw, 44px)' }}
          >
            {name}
          </h1>
          <p
            className="text-white/55 tracking-wider uppercase"
            style={{ fontFamily: 'Geist, sans-serif', fontSize: '10px', letterSpacing: '0.10em' }}
          >
            {address}
          </p>
        </div>

        {/* Category tag — pill */}
        <span
          className={`border border-white/35 text-white/65 text-[10px] px-4 py-1.5 rounded-full inline-block uppercase ${fadeClass('delay-[350ms]')}`}
          style={{ fontFamily: 'Geist, sans-serif', letterSpacing: '0.14em' }}
        >
          {category}
        </span>
      </div>
    </div>
  );
}
