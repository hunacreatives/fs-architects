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

  return (
    <div className="relative w-full h-[60vh] md:h-screen md:max-h-[700px]">
      {/* Background image — fixed on desktop, scroll on mobile (iOS compat) */}
      <div
        className="absolute inset-0 bg-cover bg-top bg-scroll md:bg-fixed"
        style={{ backgroundImage: `url(${image})` }}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-transparent" />

      {/* Back button */}
      <button
        onClick={() => navigate('/projects')}
        className="absolute top-24 md:top-28 left-4 md:left-16 lg:left-24 flex items-center gap-2 text-white/70 hover:text-white transition-colors duration-300 cursor-pointer group"
        style={{ fontFamily: 'Geist, sans-serif', letterSpacing: '0.06em', fontSize: '12px' }}
      >
        <span className="w-4 h-4 flex items-center justify-center group-hover:-translate-x-1 transition-transform duration-300">
          <i className="ri-arrow-left-line text-sm" />
        </span>
        {t('detail_back')}
      </button>

      {/* ── Mobile bottom block: name + address + category stacked left ── */}
      <div className="md:hidden absolute bottom-8 left-4 right-4">
        <span
          className="inline-block border border-white/40 text-white/70 text-[10px] px-3 py-1 rounded-full tracking-widest mb-3"
          style={{ fontFamily: 'Geist, sans-serif', letterSpacing: '0.12em' }}
        >
          {category}
        </span>
        <h1
          className="text-2xl font-light text-white mb-1 leading-tight [text-wrap:pretty]"
          style={{ fontFamily: 'Marcellus, serif' }}
        >
          {name}
        </h1>
        <p
          className="text-white/65 text-xs tracking-wide"
          style={{ fontFamily: 'Geist, sans-serif', letterSpacing: '0.06em' }}
        >
          {address}
        </p>
      </div>

      {/* ── Desktop: name left, category right ── */}
      <div className="hidden md:block absolute bottom-10 left-16 lg:left-24">
        <h1
          className="text-4xl font-light text-white mb-2 leading-tight"
          style={{ fontFamily: 'Marcellus, serif' }}
        >
          {name}
        </h1>
        <p
          className="text-white/70 text-xs tracking-wider"
          style={{ fontFamily: 'Geist, sans-serif', letterSpacing: '0.06em' }}
        >
          {address}
        </p>
      </div>
      <div className="hidden md:block absolute bottom-10 right-16 lg:right-24">
        <span
          className="border border-white/50 text-white/80 text-xs px-4 py-1.5 rounded-full tracking-widest"
          style={{ fontFamily: 'Geist, sans-serif', letterSpacing: '0.12em' }}
        >
          {category}
        </span>
      </div>
    </div>
  );
}
