import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

interface ProjectHeroProps {
  name: string;
  image: string;
  index: number;
  total: number;
}

export default function ProjectHero({ name, image, index, total }: ProjectHeroProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 80);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="relative w-full" style={{ height: '100vh', minHeight: '600px' }}>
      {/* Full-bleed background */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${image})` }}
      />
      {/* Gradient overlay — heavy at bottom for text legibility */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-black/5 to-black/80" />

      {/* Back button */}
      <button
        onClick={() => navigate('/projects')}
        className="absolute top-20 left-6 md:left-16 lg:left-24 flex items-center gap-2 text-white/45 hover:text-white cursor-pointer group z-10 transition-colors duration-300"
        style={{ fontFamily: 'Geist, sans-serif', letterSpacing: '0.14em', fontSize: '9px', textTransform: 'uppercase' }}
      >
        <i className="ri-arrow-left-line text-xs group-hover:-translate-x-1 transition-transform duration-300" />
        {t('detail_back')}
      </button>

      {/* Project counter — top right */}
      <div
        className="absolute top-20 right-6 md:right-16 lg:right-24 z-10"
        style={{
          opacity: visible ? 0.4 : 0,
          transition: 'opacity 0.8s ease 0.5s',
        }}
      >
        <p style={{ fontFamily: 'Geist, sans-serif', fontSize: '9px', letterSpacing: '0.20em', color: 'white', textTransform: 'uppercase' }}>
          {String(index + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
        </p>
      </div>

      {/* Bottom editorial block */}
      <div
        className="absolute bottom-0 left-0 right-0 px-6 md:px-16 lg:px-24 pb-14 md:pb-20"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0)' : 'translateY(20px)',
          transition: 'opacity 1.1s cubic-bezier(0.22,1,0.36,1) 0.2s, transform 1.1s cubic-bezier(0.22,1,0.36,1) 0.2s',
        }}
      >
        {/* Project title — editorial large */}
        <h1
          className="text-white font-light leading-none"
          style={{
            fontFamily: 'Marcellus, serif',
            fontSize: 'clamp(24px, 5.5vw, 82px)',
            letterSpacing: '-0.025em',
            maxWidth: '860px',
            lineHeight: 1.05,
          }}
        >
          {name}
        </h1>
      </div>

      {/* Scroll indicator */}
      <div
        className="absolute bottom-6 right-6 md:right-16 lg:right-24 flex flex-col items-center gap-2"
        style={{
          opacity: visible ? 0.35 : 0,
          transition: 'opacity 1s ease 0.9s',
        }}
      >
        <div
          style={{
            width: '1px',
            height: '40px',
            backgroundColor: 'white',
            animation: 'heroPulse 2.2s ease-in-out infinite',
          }}
        />
      </div>

      <style>{`
        @keyframes heroPulse {
          0%, 100% { transform: scaleY(1); opacity: 0.35; }
          50% { transform: scaleY(0.45); opacity: 0.9; }
        }
      `}</style>
    </div>
  );
}
