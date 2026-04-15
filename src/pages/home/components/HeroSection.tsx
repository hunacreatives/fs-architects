import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Navigation from '../../../components/feature/Navigation';

interface HeroSectionProps {
  isVisible: boolean;
}

const SLIDES = [
  "/images/hero-slide-1.jpg",
  "/images/hero-slide-2.jpg",
  "/images/hero-slide-3.jpg",
  "/images/hero-slide-4.jpg",
];

// Varied Ken Burns directions so each slide feels different
const KENBURNS = [
  { from: 'scale(1.07) translate(1%, 1%)',  to: 'scale(1.0)  translate(-1%, -1%)' },
  { from: 'scale(1.0)  translate(-1%, -1%)', to: 'scale(1.07) translate(1%,  1%)' },
  { from: 'scale(1.06) translate(0%,  1%)',  to: 'scale(1.0)  translate(0%,  -1%)' },
  { from: 'scale(1.0)  translate(1%,  0%)',  to: 'scale(1.06) translate(-1%, 0%)' },
];

const CROSSFADE_MS = 1800;
const HOLD_FIRST_MS = 9000;
const HOLD_REST_MS  = 6000;

export default function HeroSection({ isVisible }: HeroSectionProps) {
  const [showContent, setShowContent] = useState(false);
  const [activeSlide, setActiveSlide] = useState(0);
  const [kbActive, setKbActive] = useState<boolean[]>(SLIDES.map((_, i) => i === 0));
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigate = useNavigate();
  const { t } = useTranslation();

  useEffect(() => {
    if (isVisible) {
      const t1 = setTimeout(() => setShowContent(true), 100);
      return () => clearTimeout(t1);
    }
  }, [isVisible]);

  const scheduleNext = (current: number, isFirst: boolean) => {
    const hold = isFirst ? HOLD_FIRST_MS : HOLD_REST_MS;
    timerRef.current = setTimeout(() => {
      const next = (current + 1) % SLIDES.length;
      setActiveSlide(next);
      // Start Ken Burns on incoming slide shortly after crossfade begins
      setTimeout(() => {
        setKbActive(prev => {
          const updated = [...prev];
          updated[next] = true;
          return updated;
        });
      }, 100);
      scheduleNext(next, false);
    }, hold);
  };

  useEffect(() => {
    scheduleNext(0, true);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const goToSlide = (i: number) => {
    if (i === activeSlide) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    setActiveSlide(i);
    setTimeout(() => {
      setKbActive(prev => {
        const updated = [...prev];
        // Reset outgoing, activate incoming
        updated[activeSlide] = false;
        updated[i] = true;
        return updated;
      });
    }, 100);
    scheduleNext(i, false);
  };

  return (
    <div
      className={`relative w-full min-h-screen transition-opacity duration-1000 ${
        isVisible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      {/* Slideshow — all slides stacked, crossfade via opacity only, no React remounting */}
      <div className="absolute inset-0 overflow-hidden">
        {SLIDES.map((src, i) => {
          const kb = KENBURNS[i % KENBURNS.length];
          const isActive = i === activeSlide;
          const isMoving = kbActive[i];

          return (
            <img
              key={i}
              src={src}
              alt={`Architectural work ${i + 1}`}
              className="absolute inset-0 w-full h-full object-cover object-top"
              style={{
                opacity: isActive ? 1 : 0,
                transform: isMoving ? kb.to : kb.from,
                transition: [
                  `opacity ${CROSSFADE_MS}ms cubic-bezier(0.45, 0, 0.55, 1)`,
                  `transform ${isMoving ? 10000 : 0}ms ease-in-out`,
                ].join(', '),
                willChange: 'opacity, transform',
                zIndex: isActive ? 1 : 0,
              }}
            />
          );
        })}

        {/* Overlay */}
        <div className="absolute inset-0 z-10" style={{ backgroundColor: 'rgba(30, 36, 42, 0.55)' }} />
        <div className="absolute inset-0 z-10 bg-gradient-to-t from-black/50 via-transparent to-black/20" />
      </div>

      {/* Navigation */}
      <Navigation theme="light" showContent={showContent} />

      {/* Hero Content */}
      <div className="relative z-20 h-screen flex flex-col justify-end px-6 md:px-16 lg:px-24 pb-12 md:pb-20">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-8 md:gap-0">
          {/* Left */}
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
              onClick={() => goToSlide(i)}
              className="cursor-pointer transition-all duration-500"
              style={{
                width: i === activeSlide ? '28px' : '8px',
                height: '2px',
                backgroundColor: i === activeSlide ? '#f2f2f2' : 'rgba(242,242,242,0.35)',
              }}
              aria-label={`Slide ${i + 1}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
