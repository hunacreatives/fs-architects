import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Navigation from '../../../components/feature/Navigation';

interface HeroSectionProps {
  isVisible: boolean;
}

const SLIDES = [
  "https://storage.readdy-site.link/project_files/3530b75e-ff34-41a0-81d5-ae38e0742267/99c59eb0-4815-4d7a-866a-f56d3e927d63_FS-Homepage.png?v=1766117ffab489d25f6b03973bad0b09",
  "https://readdy.ai/api/search-image?query=Elegant%20modern%20residential%20architecture%20with%20cantilevered%20volumes%2C%20warm%20timber%20accents%2C%20and%20floor-to-ceiling%20glass%20reflecting%20a%20calm%20evening%20sky%2C%20architectural%20photography%20with%20soft%20natural%20light%20and%20restrained%20material%20palette%2C%20serene%20and%20timeless%20composition&width=1920&height=1080&seq=fs-arch-slide-002&orientation=landscape",
  "https://readdy.ai/api/search-image?query=Refined%20institutional%20building%20with%20rhythmic%20concrete%20columns%2C%20deep%20shadow%20reveals%2C%20and%20a%20monumental%20yet%20human-scale%20entrance%20plaza%2C%20professional%20architectural%20photography%20in%20soft%20daylight%20with%20muted%20stone%20and%20concrete%20tones%2C%20calm%20and%20authoritative%20atmosphere&width=1920&height=1080&seq=fs-arch-slide-003&orientation=landscape",
  "https://readdy.ai/api/search-image?query=Luxury%20private%20villa%20architecture%20with%20long%20horizontal%20rooflines%2C%20infinity%20pool%20reflecting%20the%20sky%2C%20surrounded%20by%20manicured%20landscape%20and%20natural%20stone%20walls%2C%20architectural%20photography%20with%20golden%20hour%20light%2C%20serene%20and%20composed%20atmosphere&width=1920&height=1080&seq=fs-arch-slide-004&orientation=landscape",
];

export default function HeroSection({ isVisible }: HeroSectionProps) {
  const [showContent, setShowContent] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [nextSlide, setNextSlide] = useState(1);
  const [transitioning, setTransitioning] = useState(false);
  const navigate = useNavigate();
  const { t } = useTranslation();

  useEffect(() => {
    if (isVisible) {
      const timer = setTimeout(() => setShowContent(true), 100);
      return () => clearTimeout(timer);
    }
  }, [isVisible]);

  useEffect(() => {
    // First slide stays for 10s, subsequent slides 6s
    const duration = currentSlide === 0 ? 10000 : 6000;
    const interval = setTimeout(() => {
      const next = (currentSlide + 1) % SLIDES.length;
      setNextSlide(next);
      setTransitioning(true);
      setTimeout(() => {
        setCurrentSlide(next);
        setTransitioning(false);
      }, 1800);
    }, duration);
    return () => clearTimeout(interval);
  }, [currentSlide]);

  return (
    <div
      className={`relative w-full min-h-screen transition-opacity duration-1000 ${
        isVisible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      {/* Slideshow Background */}
      <div className="absolute inset-0 overflow-hidden">
        {/* Current slide — subtle scale-down entrance on first load */}
        <img
          key={`current-${currentSlide}`}
          src={SLIDES[currentSlide]}
          alt="Architectural work"
          className={`absolute inset-0 w-full h-full object-cover object-top transition-transform duration-[3500ms] ease-out ${
            isVisible ? 'scale-100' : 'scale-110'
          }`}
        />
        {/* Next slide — fades in during transition */}
        <img
          key={`next-${nextSlide}`}
          src={SLIDES[nextSlide]}
          alt="Architectural work"
          className="absolute inset-0 w-full h-full object-cover object-top transition-opacity duration-[1800ms] ease-in-out"
          style={{ opacity: transitioning ? 1 : 0 }}
        />
        {/* Dim overlay */}
        <div className="absolute inset-0" style={{ backgroundColor: 'rgba(30, 36, 42, 0.58)' }} />
        {/* Gradient for bottom legibility */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/20" />
      </div>

      {/* Navigation */}
      <Navigation theme="light" showContent={showContent} />

      {/* Hero Content */}
      <div className="relative z-10 h-screen flex flex-col justify-end px-6 md:px-16 lg:px-24 pb-12 md:pb-20">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-8 md:gap-0">
          {/* Left Content */}
          <div
            className={`transition-all duration-1000 delay-300 ${
              showContent ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
            }`}
          >
            <h1
              className="text-2xl md:text-3xl lg:text-4xl flex flex-col text-white"
              style={{
                fontFamily: 'Marcellus, serif',
                letterSpacing: '-0.02em',
                lineHeight: '1.12',
                textShadow: '0 4px 32px rgba(0,0,0,0.45), 0 1px 4px rgba(0,0,0,0.3)',
              }}
            >
              <span>{t('hero_tagline_line1')}</span>
              <span>{t('hero_tagline_line2')}</span>
            </h1>
          </div>

          {/* Right CTA */}
          <div
            className={`transition-all duration-1000 delay-500 ${
              showContent ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
            }`}
          >
            <button
              onClick={() => navigate('/projects')}
              className="group px-7 py-2.5 border border-white/80 rounded-full text-white text-xs tracking-wide transition-all duration-500 hover:bg-white/10 hover:border-white whitespace-nowrap cursor-pointer"
              style={{ letterSpacing: '0.1em' }}
            >
              {t('hero_cta')}
            </button>
          </div>
        </div>

        {/* Slide indicators */}
        <div
          className={`flex items-center gap-2 mt-10 transition-all duration-1000 delay-700 ${
            showContent ? 'opacity-100' : 'opacity-0'
          }`}
        >
          {SLIDES.map((_, i) => (
            <button
              key={i}
              onClick={() => { setNextSlide(i); setTransitioning(true); setTimeout(() => { setCurrentSlide(i); setTransitioning(false); }, 1800); }}
              className="cursor-pointer transition-all duration-500"
              style={{
                width: i === currentSlide ? '28px' : '8px',
                height: '2px',
                backgroundColor: i === currentSlide ? '#f2f2f2' : 'rgba(242,242,242,0.35)',
              }}
              aria-label={`Slide ${i + 1}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
