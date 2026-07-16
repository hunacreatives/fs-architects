import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Navigation from '../../../components/feature/Navigation';

interface HeroSectionProps {
  isVisible: boolean;
}

interface Slide {
  src: string;
  title: string;
  location: string;
  year: string;
  video?: string;
  videoMp4?: string;
}

const SLIDES: Slide[] = [
  { src: "/images/hero-denza-greenhills.webp",        title: "Denza Greenhills",           location: "Mandaluyong City",        year: "2025" },
  { src: "/images/hero-blush-mandaue.webp",           title: "Blush Prestige Clinic",      location: "Mandaue City",            year: "2025", video: "/images/projects/blush-video.webm", videoMp4: "/images/projects/blush-video.mp4" },
  { src: "/images/hero-byd-butuan.webp",              title: "BYD Butuan",                 location: "Butuan City",             year: "2025" },
  { src: "/images/hero-byd-c5-acropolis.webp",        title: "BYD C5 Acropolis",           location: "Quezon City",             year: "2025", video: "/images/projects/byd-c5-acropolis-video.webm", videoMp4: "/images/projects/byd-c5-acropolis-video.mp4" },
  { src: "/images/hero-byd-marikina.webp",            title: "BYD Marikina",               location: "Marikina City",           year: "2025" },
  { src: "/images/hero-byd-marikina-interiors.webp",  title: "BYD Marikina Interiors",     location: "Marikina City",           year: "2025" },
  { src: "/images/hero-byd-zamboanga.webp",           title: "BYD Zamboanga",              location: "Zamboanga City",          year: "2024" },
  { src: "/images/hero-byd-zamboanga-interiors.webp", title: "BYD Zamboanga Interiors",    location: "Zamboanga City",          year: "2024" },
  { src: "/images/hero-graphic-gadget.webp",          title: "Graphic Gadget Store",       location: "Cagayan de Oro",          year: "2025", video: "/images/projects/graphic-annex-video.webm", videoMp4: "/images/projects/graphic-annex-video.mp4" },
  { src: "/images/hero-mixed-use-car-showroom.webp",  title: "Mixed Use Car Showroom",     location: "San Fernando, Pampanga",  year: "2025" },
  { src: "/images/hero-sorana-cafe.webp",             title: "Sorana Cafe",                location: "Bantayan, Cebu",          year: "2025" },
  { src: "/images/hero-yang-residence-cebu.webp",     title: "Yang Residence",             location: "Consolacion, Cebu",       year: "2025" },
];

const TAGLINES = [
  'Guided by intent.',
  'Defined by form.',
  'Shaped by space.',
];

// Chained cycle: each entry's `to` equals the next entry's `from`.
// This means the camera never jumps — each incoming slide starts exactly
// where the outgoing slide stopped.
const KENBURNS = [
  { from: 'scale(1.06) translate(0.8%, 0.8%)',   to: 'scale(1.02) translate(-0.8%, -0.8%)' }, // A→B
  { from: 'scale(1.02) translate(-0.8%, -0.8%)', to: 'scale(1.06) translate(-0.6%, 0.6%)' },  // B→C
  { from: 'scale(1.06) translate(-0.6%, 0.6%)',  to: 'scale(1.02) translate(0.6%, -0.6%)' },  // C→D
  { from: 'scale(1.02) translate(0.6%, -0.6%)',  to: 'scale(1.06) translate(0.8%, 0.8%)' },   // D→A
];

const CROSSFADE_MS = 1800;
const HOLD_FIRST_MS = 9000;
const HOLD_REST_MS  = 6000;


export default function HeroSection({ isVisible }: HeroSectionProps) {
  const [showContent, setShowContent] = useState(false);
  const [taglineIndex, setTaglineIndex] = useState(0);
  const [taglineVisible, setTaglineVisible] = useState(false);
  const [activeSlide, setActiveSlide] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeSlideRef = useRef(0);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  // Tracks which slides have completed at least one full animation run.
  // Used to park the slide at kb.to (its end position) instead of kb.from.
  const activatedRef = useRef<boolean[]>(new Array(SLIDES.length).fill(false));
  const navigate = useNavigate();
  const { t } = useTranslation();

  useEffect(() => {
    if (isVisible) {
      const t1 = setTimeout(() => setShowContent(true), 100);
      return () => clearTimeout(t1);
    }
  }, [isVisible]);

  useEffect(() => {
    if (!showContent) return;
    setTaglineVisible(true);
    const interval = setInterval(() => {
      setTaglineVisible(false);
      // Swap the text only after the fade-out (450ms) is guaranteed done —
      // the ~250ms buffer absorbs transition start-up delay and timer drift,
      // so the new tagline never appears while the old one is still visible.
      setTimeout(() => {
        setTaglineIndex(prev => (prev + 1) % TAGLINES.length);
        setTaglineVisible(true);
      }, 700);
    }, 3800);
    return () => clearInterval(interval);
  }, [showContent]);

  useEffect(() => {
    const advance = () => {
      setActiveSlide(prev => {
        // Mark the outgoing slide as having completed so it parks at kb.to
        activatedRef.current[prev] = true;
        const next = (prev + 1) % SLIDES.length;
        activeSlideRef.current = next;
        return next;
      });
    };
    // First slide holds HOLD_FIRST_MS; every subsequent slide holds HOLD_REST_MS
    timerRef.current = setTimeout(() => {
      advance();
      intervalRef.current = setInterval(advance, HOLD_REST_MS);
    }, HOLD_FIRST_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Restart video from beginning when its slide becomes active; let it keep playing as it fades out
  useEffect(() => {
    SLIDES.forEach((slide, i) => {
      const vid = videoRefs.current[i];
      if (!slide.video || !vid) return;
      if (i === activeSlide) { vid.currentTime = 0; vid.play().catch(() => {}); }
    });
  }, [activeSlide]);

  const goToSlide = (i: number) => {
    if (i === activeSlideRef.current) return;
    // Mark the outgoing slide as activated (even if mid-animation)
    activatedRef.current[activeSlideRef.current] = true;
    activeSlideRef.current = i;
    setActiveSlide(i);
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      setActiveSlide(prev => {
        activatedRef.current[prev] = true;
        const next = (prev + 1) % SLIDES.length;
        activeSlideRef.current = next;
        return next;
      });
    }, HOLD_REST_MS);
  };

  return (
    <div
      className={`relative w-full min-h-screen transition-opacity duration-1000 ${
        isVisible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      {/* Slideshow — all slides stacked, crossfade via opacity, Ken Burns via global @keyframes */}
      <div
        className="absolute inset-0 overflow-hidden"
        style={{ backgroundColor: '#1a2028', zIndex: 0 }}
      >
        {SLIDES.map((slide, i) => {
          const kb = KENBURNS[i % KENBURNS.length];
          const isActive = i === activeSlide;
          const sharedStyle: React.CSSProperties = {
            opacity: isActive ? 1 : 0,
            transition: `opacity ${CROSSFADE_MS}ms cubic-bezier(0.45, 0, 0.55, 1)`,
            zIndex: isActive ? 1 : 0,
          };

          if (slide.video) {
            return (
              <video
                key={i}
                ref={el => { videoRefs.current[i] = el; }}
                muted
                playsInline
                loop
                className="absolute inset-0 w-full h-full object-cover object-center"
                style={sharedStyle}
              >
                <source src={slide.video} type="video/webm" />
                {slide.videoMp4 && <source src={slide.videoMp4} type="video/mp4" />}
              </video>
            );
          }

          return (
            <img
              key={i}
              src={slide.src}
              alt={`Architectural work ${i + 1}`}
              className="absolute inset-0 w-full h-full object-cover object-center"
              style={{
                ...sharedStyle,
                animation: isActive ? `kb-${i % KENBURNS.length} ${HOLD_REST_MS}ms ease-in-out forwards` : 'none',
                transform: isActive ? undefined : (activatedRef.current[i] ? kb.to : kb.from),
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
      <div className="relative z-20 h-screen flex flex-col justify-end">

        {/* ── MOBILE + DESKTOP padded content ── */}
        <div className="px-6 md:px-16 lg:px-24 pb-6 md:pb-8">

        {/* ── MOBILE layout ── */}
        <div className="flex flex-col gap-4 md:hidden">
          {/* Row 1: tagline (left) | project title (right) — bottom aligned */}
          <div className="flex items-center justify-between">
            <h1
              style={{
                fontFamily: 'Marcellus, serif',
                fontWeight: 400,
                fontSize: '1.35rem',
                lineHeight: '1.3',
                letterSpacing: '0.01em',
                textShadow: '0 4px 32px rgba(0,0,0,0.45), 0 1px 4px rgba(0,0,0,0.3)',
                color: 'rgba(255,255,255,0.95)',
                opacity: taglineVisible ? 1 : 0,
                transition: 'opacity 0.45s ease',
                margin: 0,
              }}
            >
              {TAGLINES[taglineIndex]}
            </h1>
            <div
              className={`flex flex-col items-end gap-0.5 transition-all duration-1000 delay-500 ${showContent ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
              style={{ textShadow: '0 2px 12px rgba(0,0,0,0.4)' }}
            >
              <p style={{ fontFamily: 'Geist, sans-serif', fontSize: '15px', fontWeight: 400, letterSpacing: '0.01em', color: 'rgba(255,255,255,0.95)', lineHeight: 1.4, margin: 0 }}>
                {SLIDES[activeSlide].title}
              </p>
              <p style={{ fontFamily: 'Geist, sans-serif', fontSize: '10px', letterSpacing: '0.04em', color: 'rgba(255,255,255,0.85)', lineHeight: 1.4, margin: 0 }}>
                {SLIDES[activeSlide].location} • {SLIDES[activeSlide].year}
              </p>
            </div>
          </div>

          {/* Row 2: indicator bar */}
          <div className={`flex w-full transition-all duration-1000 delay-700 ${showContent ? 'opacity-100' : 'opacity-0'}`}>
            {SLIDES.map((_, i) => (
              <button
                key={i}
                onClick={() => goToSlide(i)}
                className="flex-1 cursor-pointer flex items-center"
                style={{ height: '20px', background: 'none', border: 'none', padding: 0 }}
              >
                <div style={{
                  width: '100%',
                  height: '1px',
                  backgroundColor: i === activeSlide ? '#ffffff' : 'rgba(255,255,255,0.55)',
                  transition: 'background-color 500ms',
                }} />
              </button>
            ))}
          </div>

          {/* Row 3: CTA right */}
          <div className={`flex justify-end transition-all duration-1000 delay-500 ${showContent ? 'opacity-100' : 'opacity-0'}`}>
            <button
              onClick={() => navigate('/projects')}
              className="px-5 py-2 border border-white/80 rounded-full text-white text-xs uppercase cursor-pointer transition-all duration-500 hover:bg-white/10 whitespace-nowrap"
              style={{ letterSpacing: '0.1em', fontFamily: 'Geist, sans-serif' }}
            >
              {t('hero_cta')}
            </button>
          </div>
        </div>

        {/* ── DESKTOP layout ── */}
        <div className="hidden md:flex flex-col gap-4">

          {/* Row 1: tagline (left) centered against project title + address (right) */}
          <div className="flex items-center justify-between">
            <h1
              style={{
                fontFamily: 'Marcellus, serif',
                fontWeight: 400,
                fontSize: 'clamp(1.5rem, 2.6vw, 2.4rem)',
                lineHeight: '1.3',
                letterSpacing: '0.01em',
                textShadow: '0 4px 32px rgba(0,0,0,0.45), 0 1px 4px rgba(0,0,0,0.3)',
                color: 'rgba(255,255,255,0.95)',
                opacity: taglineVisible ? 1 : 0,
                transition: 'opacity 0.45s ease',
                margin: 0,
              }}
            >
              {TAGLINES[taglineIndex]}
            </h1>
            {/* Right — project title + address stacked */}
            <div
              className={`flex flex-col items-end gap-1 transition-all duration-1000 delay-500 ${showContent ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
              style={{ textShadow: '0 2px 12px rgba(0,0,0,0.4)' }}
            >
              <p style={{ fontFamily: 'Geist, sans-serif', fontSize: 'clamp(1.25rem, 2vw, 1.85rem)', fontWeight: 400, letterSpacing: '0.01em', color: 'rgba(255,255,255,0.95)', lineHeight: 1.3, margin: 0 }}>
                {SLIDES[activeSlide].title}
              </p>
              <p style={{ fontFamily: 'Geist, sans-serif', fontSize: '14px', letterSpacing: '0.02em', color: 'rgba(255,255,255,0.85)', lineHeight: 1.5, margin: 0 }}>
                {SLIDES[activeSlide].location} • {SLIDES[activeSlide].year}
              </p>
            </div>
          </div>

          {/* Row 2: indicator bar */}
          <div className={`flex w-full transition-all duration-1000 delay-700 ${showContent ? 'opacity-100' : 'opacity-0'}`}>
            {SLIDES.map((_, i) => (
              <button
                key={i}
                onClick={() => goToSlide(i)}
                className="flex-1 cursor-pointer flex items-center"
                style={{ height: '20px', background: 'none', border: 'none', padding: 0 }}
              >
                <div style={{
                  width: '100%',
                  height: '1px',
                  backgroundColor: i === activeSlide ? '#ffffff' : 'rgba(255,255,255,0.55)',
                  transition: 'background-color 500ms',
                }} />
              </button>
            ))}
          </div>

          {/* Row 3: CTA right */}
          <div className={`flex justify-end transition-all duration-1000 delay-500 ${showContent ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
            <button
              onClick={() => navigate('/projects')}
              className="group px-7 py-2.5 border border-white/80 rounded-full text-white text-xs uppercase tracking-wide transition-all duration-500 hover:bg-white/10 hover:border-white whitespace-nowrap cursor-pointer"
              style={{ letterSpacing: '0.1em' }}
            >
              {t('hero_cta')}
            </button>
          </div>

        </div>{/* end desktop column */}

        </div>{/* end padded content */}

      </div>
    </div>
  );
}
