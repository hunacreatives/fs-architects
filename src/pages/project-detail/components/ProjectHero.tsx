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
    const timer = setTimeout(() => setVisible(true), 80);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="relative w-full" style={{ height: '100vh', minHeight: '600px' }}>
      {/* Full bleed background */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${image})` }}
      />
      {/* Dark overlay - heavier at bottom for text legibility */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/10 to-black/75" />

      {/* Back button — sits below the 56px fixed nav */}
      <button
        onClick={() => navigate('/projects')}
        className="absolute top-20 left-6 md:left-12 lg:left-16 flex items-center gap-2 text-white/50 hover:text-white cursor-pointer group z-10 transition-colors duration-300"
        style={{ fontFamily: 'Geist, sans-serif', letterSpacing: '0.12em', fontSize: '9px', textTransform: 'uppercase' }}
      >
        <span className="w-4 h-4 flex items-center justify-center group-hover:-translate-x-1 transition-transform duration-300">
          <i className="ri-arrow-left-line text-xs" />
        </span>
        {t('detail_back')}
      </button>

      {/* Bottom editorial block */}
      <div
        className="absolute bottom-0 left-0 right-0 px-6 md:px-12 lg:px-16 pb-14 md:pb-20"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0)' : 'translateY(16px)',
          transition: 'opacity 1s cubic-bezier(0.22,1,0.36,1) 0.2s, transform 1s cubic-bezier(0.22,1,0.36,1) 0.2s',
        }}
      >
        {/* Category label */}
        <p
          className="text-white/40 mb-4"
          style={{ fontFamily: 'Geist, sans-serif', fontSize: '9px', letterSpacing: '0.22em', textTransform: 'uppercase' }}
        >
          {category}
        </p>

        {/* Project title — editorial large */}
        <h1
          className="text-white font-light leading-none mb-5"
          style={{
            fontFamily: 'Marcellus, serif',
            fontSize: 'clamp(40px, 6.5vw, 96px)',
            letterSpacing: '-0.02em',
            maxWidth: '900px',
          }}
        >
          {name}
        </h1>

        {/* Divider + address */}
        <div className="flex items-center gap-5">
          <div style={{ width: '32px', height: '1px', backgroundColor: 'rgba(255,255,255,0.25)' }} />
          <p
            className="text-white/40"
            style={{ fontFamily: 'Geist, sans-serif', fontSize: '9px', letterSpacing: '0.18em', textTransform: 'uppercase' }}
          >
            {address}
          </p>
        </div>
      </div>

      {/* Scroll indicator */}
      <div
        className="absolute bottom-6 right-6 md:right-12 lg:right-16 flex flex-col items-center gap-2"
        style={{
          opacity: visible ? 0.4 : 0,
          transition: 'opacity 1s ease 0.8s',
        }}
      >
        <div
          style={{
            width: '1px',
            height: '40px',
            backgroundColor: 'white',
            animation: 'scrollPulse 2.2s ease-in-out infinite',
          }}
        />
        <p
          style={{ fontFamily: 'Geist, sans-serif', fontSize: '8px', color: 'white', letterSpacing: '0.18em', textTransform: 'uppercase', writingMode: 'vertical-rl' }}
        >
          Scroll
        </p>
      </div>

      <style>{`
        @keyframes scrollPulse {
          0%, 100% { transform: scaleY(1); opacity: 0.4; }
          50% { transform: scaleY(0.5); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
