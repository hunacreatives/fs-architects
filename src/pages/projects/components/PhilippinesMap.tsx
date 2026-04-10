import { useMemo, useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

interface FeaturedProject {
  name: string;
  year: string;
  category: string;
}

interface CityProjectData {
  count: number;
  categories: string[];
  featuredProjects: FeaturedProject[];
  yearRange: { min: string; max: string };
}

interface PhilippinesMapProps {
  activeLocation: string;
  onLocationChange: (loc: string) => void;
  onViewAllProjects: () => void;
  projectCounts: Record<string, number>;
  cityProjectData: Record<string, CityProjectData>;
}

interface LocationPin {
  id: string;
  label: string;
  x: number;
  y: number;
  count: number;
  goLeft: boolean;
}

// ── Pin positions (% within the 7:9 map column) ──
// Cebu is the fixed reference. All others positioned relative to it.
// Conversion: 1px ≈ 0.143% x, 0.111% y  (700×900 working space)
const CITY_PINS: { id: string; label: string; x: number; y: number; goLeft: boolean }[] = [
  // Manila     — NCR / Manila Bay area, central-west Luzon waist.  +3px down
  { id: 'Manila',    label: 'Manila',    x: 46.2, y: 42.9, goLeft: true  },
  // Leyte      — lower on Leyte island, away from Samar.  +4px right, +18px down
  { id: 'Leyte',     label: 'Leyte',     x: 66.6, y: 58.5, goLeft: false },
  // Cebu       — FIXED reference, center-right Visayas. DO NOT MOVE.
  { id: 'Cebu',      label: 'Cebu',      x: 61.7, y: 60.9, goLeft: false },
  // CDO        — north-central Mindanao, shifted right onto landmass.  +6px right
  { id: 'CDO',       label: 'CDO',       x: 63.6, y: 69.7, goLeft: false },
  // Davao      — FIXED, south-east Mindanao inside island silhouette. DO NOT MOVE.
  { id: 'Davao',     label: 'Davao',     x: 69.4, y: 77.3, goLeft: false },
  // Zamboanga  — Zamboanga Peninsula on land, correct height.  +6px right
  { id: 'Zamboanga', label: 'Zamboanga', x: 50.6, y: 75.2, goLeft: true  },
];

const ABBREV: Record<string, string> = {
  'Interior Design': 'Interiors',
  'Mixed Use': 'Mixed Use',
};
const abbrev = (cat: string) => ABBREV[cat] ?? cat;

// ── Count-up hook ──
function useCountUp(target: number, duration: number, isVisible: boolean) {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!isVisible) return;
    let startTime: number | null = null;
    const animate = (ts: number) => {
      if (!startTime) startTime = ts;
      const progress = Math.min((ts - startTime) / duration, 1);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(eased * target));
      if (progress < 1) rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isVisible, target, duration]);

  return value;
}

// ── Individual stat item with its own count-up ──
function StatItem({
  target,
  suffix,
  label,
  delay,
  isVisible,
}: {
  target: number;
  suffix: string;
  label: string;
  delay: number;
  isVisible: boolean;
}) {
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!isVisible) return;
    const t = setTimeout(() => setActive(true), delay);
    return () => clearTimeout(t);
  }, [isVisible, delay]);

  const count = useCountUp(target, 1800, active);

  return (
    <div
      className="flex flex-col items-center md:items-end mb-0 md:mb-8 md:last:mb-0"
      style={{
        animation: `mapFadeIn 0.9s cubic-bezier(0.22,1,0.36,1) ${delay / 1000}s both`,
      }}
    >
      <span
        className="text-base md:text-3xl font-light tracking-tight leading-none tabular-nums"
        style={{ fontFamily: 'Marcellus, serif', color: '#1c2b3a' }}
      >
        {count}{suffix}
      </span>
      <span
        className="text-[8px] md:text-[9px] tracking-widest mt-0.5 text-center md:text-right"
        style={{ fontFamily: 'Geist, sans-serif', letterSpacing: '0.10em', color: 'rgba(28,43,58,0.38)' }}
      >
        {label.toUpperCase()}
      </span>
    </div>
  );
}

export default function PhilippinesMap({
  activeLocation,
  onLocationChange,
  onViewAllProjects,
  projectCounts,
  cityProjectData,
}: PhilippinesMapProps) {
  const { t } = useTranslation();

  const pins: LocationPin[] = useMemo(() =>
    CITY_PINS.map((c) => ({
      ...c,
      count: projectCounts[c.id] ?? 0,
    })),
  [projectCounts]);

  const totalCount = Object.values(projectCounts).reduce((a, b) => a + b, 0);

  // ── Stats visibility for count-up trigger ──
  const statsRef = useRef<HTMLDivElement>(null);
  const [statsVisible, setStatsVisible] = useState(false);

  useEffect(() => {
    const el = statsRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setStatsVisible(true);
          obs.disconnect();
        }
      },
      { threshold: 0.2 }
    );
    obs.observe(el);
    // Also trigger after a small delay as fallback
    const t = setTimeout(() => { setStatsVisible(true); obs.disconnect(); }, 600);
    return () => { obs.disconnect(); clearTimeout(t); };
  }, []);

  // ── Map mount transition (background bloom + SVG entrance) ──
  const [mapMounted, setMapMounted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMapMounted(true), 40);
    return () => clearTimeout(t);
  }, []);

  // ── Pins visibility for entrance animation ──
  const mapColRef = useRef<HTMLDivElement>(null);
  const [pinsVisible, setPinsVisible] = useState(false);

  useEffect(() => {
    const el = mapColRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setPinsVisible(true);
          obs.disconnect();
        }
      },
      { threshold: 0.15 }
    );
    obs.observe(el);
    const t = setTimeout(() => { setPinsVisible(true); obs.disconnect(); }, 800);
    return () => { obs.disconnect(); clearTimeout(t); };
  }, []);

  const STATS = [
    { target: 2021, suffix: '',  label: t('studio_founded_label'), delay: 600  },
    { target: 100,  suffix: '+', label: t('map_project_plural'),   delay: 740  },
    { target: 10,   suffix: '',  label: t('studio_offices_label'), delay: 880  },
    { target: 5,    suffix: '',  label: t('studio_team_label'),    delay: 1020 },
  ];

  return (
    <div className="w-full bg-white overflow-hidden relative" style={{ height: '100vh' }}>
      <style>{`
        @keyframes mapPulse {
          0%, 100% { transform: translate(-50%, -50%) scale(1); opacity: 0.5; }
          50%       { transform: translate(-50%, -50%) scale(2); opacity: 0; }
        }
        @keyframes mapFadeIn {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes pinEntrance {
          0%   { transform: translate(-50%, -50%) scale(0);    opacity: 0; }
          60%  { transform: translate(-50%, -50%) scale(1.18); opacity: 1; }
          100% { transform: translate(-50%, -50%) scale(1);    opacity: 1; }
        }
        .map-hero-title { animation: mapFadeIn 0.9s cubic-bezier(0.22,1,0.36,1) 0.55s both; }
        .map-hero-hint  { animation: mapFadeIn 0.9s cubic-bezier(0.22,1,0.36,1) 0.72s both; }
        .map-hero-cta   { animation: mapFadeIn 0.9s cubic-bezier(0.22,1,0.36,1) 0.90s both; }
        .pin-pulse {
          position: absolute; top: 50%; left: 50%;
          width: 36px; height: 36px; border-radius: 50%;
          background: #1c2b3a;
          animation: mapPulse 2.2s ease-in-out infinite;
        }

        /* Hover card slide-in — desktop only */
        .pin-line-left  { transform-origin: right center; }
        .pin-line-right { transform-origin: left center; }

        .pin-line {
          transform: scaleX(0);
          transition: transform 0.35s cubic-bezier(0.4,0,0.2,1);
        }
        .pin-card {
          opacity: 0;
          transition: opacity 0.28s ease 0.22s, transform 0.28s ease 0.22s;
        }
        .pin-label {
          transition: opacity 0.15s ease, transform 0.15s ease;
        }

        /* Desktop only: hover shows card, hides label */
        @media (min-width: 768px) {
          .pin-group:hover .pin-line  { transform: scaleX(1) !important; }
          .pin-group:hover .pin-card  { opacity: 1 !important; transform: translateX(0) !important; }
          .pin-group:hover .pin-label { opacity: 0; transform: scale(0.85); }
        }

        /* Mobile: map fills full viewport, no shrinking */
        @media (max-width: 767px) {
          .map-col-mobile {
            top: 0 !important;
            bottom: 0 !important;
          }
        }
      `}</style>

      {/* ── Background map image ── */}
      <div
        className="absolute inset-0 pointer-events-none overflow-hidden"
        style={{ zIndex: 0 }}
        aria-hidden="true"
      >
        {/* Layer 1 — blurred copy, visible at edges */}
        <img
          src="https://storage.readdy-site.link/project_files/3530b75e-ff34-41a0-81d5-ae38e0742267/a411f0a0-7383-40bf-8554-15baf00ff8ec_World-Map.png?v=591f9d4777ca7050b06f9d07addba790"
          alt=""
          className="absolute inset-0 w-full h-full"
          style={{
            objectFit: 'cover',
            objectPosition: 'center center',
            opacity: mapMounted ? 0.55 : 0,
            filter: 'blur(10px)',
            transform: 'scale(1.04)',
            transition: 'opacity 1.4s cubic-bezier(0.22, 1, 0.36, 1) 0.1s',
          }}
          draggable={false}
        />
        {/* Layer 2 — sharp copy, masked to center only */}
        <img
          src="https://storage.readdy-site.link/project_files/3530b75e-ff34-41a0-81d5-ae38e0742267/a411f0a0-7383-40bf-8554-15baf00ff8ec_World-Map.png?v=591f9d4777ca7050b06f9d07addba790"
          alt=""
          className="absolute inset-0 w-full h-full"
          style={{
            objectFit: 'cover',
            objectPosition: 'center center',
            opacity: mapMounted ? 0.55 : 0,
            filter: 'blur(0.5px)',
            maskImage: 'radial-gradient(ellipse 55% 52% at 50% 50%, black 15%, rgba(0,0,0,0.6) 42%, transparent 68%)',
            WebkitMaskImage: 'radial-gradient(ellipse 55% 52% at 50% 50%, black 15%, rgba(0,0,0,0.6) 42%, transparent 68%)',
            transition: 'opacity 1.8s cubic-bezier(0.22, 1, 0.36, 1) 0.3s',
          }}
          draggable={false}
        />
      </div>

      {/* ── MAP COLUMN — portrait, centered, fills full height ── */}
      <div
        ref={mapColRef}
        className="absolute top-0 bottom-0 z-10 map-col-mobile"
        style={{
          aspectRatio: '7 / 9',
          left: '50%',
          transform: mapMounted
            ? 'translateX(-50%) scale(1.14)'
            : 'translateX(-50%) scale(1.08)',
          transformOrigin: 'center center',
          opacity: mapMounted ? 1 : 0,
          transition: 'opacity 1.1s cubic-bezier(0.22, 1, 0.36, 1) 0.25s, transform 1.4s cubic-bezier(0.22, 1, 0.36, 1) 0.25s',
        }}
      >
        {/* Base map image */}
        <img
          src="https://storage.readdy-site.link/project_files/3530b75e-ff34-41a0-81d5-ae38e0742267/24b204ac-0ddb-418c-863c-dd662c7f1fef_ph.svg?v=47ebe8b8e1e2c3c3d9761785e68809a2"
          alt="Philippines Map"
          className="absolute inset-0 w-full h-full select-none"
          style={{ objectFit: 'contain', objectPosition: 'center', filter: 'grayscale(1)', opacity: 0.52 }}
          draggable={false}
        />

        {/* ── City Pins ── */}
        {pins.map((pin, index) => {
          const isActive = activeLocation === pin.id;
          const data = cityProjectData[pin.id];
          const cats = data?.categories.slice(0, 4).map(abbrev) ?? [];
          const projLabel = data ? `${data.count} ${data.count === 1 ? t('map_project_singular') : t('map_project_plural')}` : '';
          const yearRange =
            data?.yearRange
              ? data.yearRange.min === data.yearRange.max
                ? data.yearRange.min
                : `${data.yearRange.min} – ${data.yearRange.max}`
              : '';
          const featured = data?.featuredProjects ?? [];

          // Card width for the expanded tooltip
          const CARD_W = 180;

          // Staggered entrance: 0.3s base delay + 120ms per pin (geographic order)
          const entranceDelay = 0.3 + index * 0.12;

          return (
            <button
              key={pin.id}
              onClick={() => onLocationChange(pin.id)}
              className="pin-group absolute cursor-pointer"
              style={{
                left: `${pin.x}%`,
                top: `${pin.y}%`,
                transform: 'translate(-50%, -50%)',
                zIndex: isActive ? 30 : 20,
                background: 'none',
                border: 'none',
                outline: 'none',
                padding: 0,
                opacity: pinsVisible ? undefined : 0,
                animation: pinsVisible
                  ? `pinEntrance 0.6s cubic-bezier(0.34, 1.4, 0.64, 1) ${entranceDelay}s both`
                  : 'none',
              }}
              aria-label={`Show ${pin.label} projects`}
            >
              {/* ── Hover card (left or right) — desktop only ── */}
              {pin.goLeft ? (
                <div
                  className="hidden md:flex absolute top-1/2 right-[calc(100%+4px)] -translate-y-1/2 flex-row-reverse items-center pointer-events-none"
                  style={{ gap: 0 }}
                >
                  {/* Line */}
                  <div
                    className="pin-line pin-line-left h-px bg-[#1c2b3a]/30"
                    style={{ width: '64px', flexShrink: 0 }}
                  />
                  {/* Card */}
                  <div
                    className="pin-card pr-3 text-right"
                    style={{ width: `${CARD_W}px`, transform: 'translateX(10px)' }}
                  >
                    {/* City title */}
                    <p
                      className="text-[13px] font-semibold text-[#1c2b3a] leading-tight mb-0.5"
                      style={{ fontFamily: 'Marcellus, serif' }}
                    >
                      {pin.label}
                    </p>
                    {/* Count + year range */}
                    <p
                      className="text-[11px] font-medium text-[#1c2b3a]/80 leading-snug"
                      style={{ fontFamily: 'Geist, sans-serif', letterSpacing: '0.02em' }}
                    >
                      {projLabel}
                      {yearRange && (
                        <span className="text-[#1c2b3a]/40 ml-1 font-normal">· {yearRange}</span>
                      )}
                    </p>
                    {/* Categories */}
                    <div className="flex flex-wrap justify-end gap-1 mt-1.5">
                      {cats.map((cat) => (
                        <span
                          key={cat}
                          className="px-1.5 py-0.5 text-[8.5px] tracking-wide bg-[#1c2b3a]/8 text-[#1c2b3a]/60 rounded"
                          style={{ fontFamily: 'Geist, sans-serif', letterSpacing: '0.06em', background: 'rgba(28,43,58,0.07)' }}
                        >
                          {cat.toUpperCase()}
                        </span>
                      ))}
                    </div>
                    {/* Featured projects */}
                    {featured.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-[#1c2b3a]/10">
                        {featured.map((fp) => (
                          <div key={fp.name} className="flex items-center justify-end gap-1.5 mb-1 last:mb-0">
                            <span
                              className="text-[9px] text-[#1c2b3a]/40"
                              style={{ fontFamily: 'Geist, sans-serif' }}
                            >
                              {fp.year}
                            </span>
                            <span
                              className="text-[10px] text-[#1c2b3a]/70 leading-tight"
                              style={{ fontFamily: 'Geist, sans-serif' }}
                            >
                              {fp.name}
                            </span>
                            <span className="w-1 h-1 rounded-full bg-[#1c2b3a]/25 flex-shrink-0" />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div
                  className="hidden md:flex absolute top-1/2 left-[calc(100%+4px)] -translate-y-1/2 flex-row items-center pointer-events-none"
                  style={{ gap: 0 }}
                >
                  {/* Line */}
                  <div
                    className="pin-line pin-line-right h-px bg-[#1c2b3a]/30"
                    style={{ width: '64px', flexShrink: 0 }}
                  />
                  {/* Card */}
                  <div
                    className="pin-card pl-3"
                    style={{ width: `${CARD_W}px`, transform: 'translateX(-10px)' }}
                  >
                    {/* City title */}
                    <p
                      className="text-[13px] font-semibold text-[#1c2b3a] leading-tight mb-0.5"
                      style={{ fontFamily: 'Marcellus, serif' }}
                    >
                      {pin.label}
                    </p>
                    {/* Count + year range */}
                    <p
                      className="text-[11px] font-medium text-[#1c2b3a]/80 leading-snug"
                      style={{ fontFamily: 'Geist, sans-serif', letterSpacing: '0.02em' }}
                    >
                      {projLabel}
                      {yearRange && (
                        <span className="text-[#1c2b3a]/40 ml-1 font-normal">· {yearRange}</span>
                      )}
                    </p>
                    {/* Categories */}
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {cats.map((cat) => (
                        <span
                          key={cat}
                          className="px-1.5 py-0.5 text-[8.5px] tracking-wide text-[#1c2b3a]/60 rounded"
                          style={{ fontFamily: 'Geist, sans-serif', letterSpacing: '0.06em', background: 'rgba(28,43,58,0.07)' }}
                        >
                          {cat.toUpperCase()}
                        </span>
                      ))}
                    </div>
                    {/* Featured projects */}
                    {featured.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-[#1c2b3a]/10">
                        {featured.map((fp) => (
                          <div key={fp.name} className="flex items-center gap-1.5 mb-1 last:mb-0">
                            <span className="w-1 h-1 rounded-full bg-[#1c2b3a]/25 flex-shrink-0" />
                            <span
                              className="text-[10px] text-[#1c2b3a]/70 leading-tight"
                              style={{ fontFamily: 'Geist, sans-serif' }}
                            >
                              {fp.name}
                            </span>
                            <span
                              className="text-[9px] text-[#1c2b3a]/40 ml-auto"
                              style={{ fontFamily: 'Geist, sans-serif' }}
                            >
                              {fp.year}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Invisible hit-zone: desktop only — on mobile this blocks neighbouring pins */}
              <span
                aria-hidden="true"
                className="hidden md:block"
                style={{
                  position: 'absolute',
                  top: '-52px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: '100px',
                  height: '66px',
                  pointerEvents: 'auto',
                  zIndex: 0,
                }}
              />

              {/* Active pulse ring */}
              {isActive && <span className="pin-pulse" />}

              {/* Hover glow ring */}
              {!isActive && (
                <span
                  className="absolute top-1/2 left-1/2 w-8 h-8 rounded-full bg-[#1c2b3a]/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                  style={{ transform: 'translate(-50%, -50%)' }}
                />
              )}

              {/* Dot */}
              <span
                className={`relative block rounded-full border-2 transition-all duration-300 ${
                  isActive
                    ? 'w-4 h-4 bg-[#1c2b3a] border-white'
                    : 'w-3 h-3 bg-white border-[#1c2b3a]/55 hover:border-[#1c2b3a] hover:scale-125'
                }`}
              />

              {/* Label bubble — smaller on mobile for all pins */}
              <div
                className={`pin-label absolute left-1/2 whitespace-nowrap rounded-full tracking-wider -translate-x-1/2 bottom-full mb-2 ${
                  isActive
                    ? 'bg-[#1c2b3a] text-white opacity-100 px-2.5 py-1 text-[10px]'
                    : 'bg-white/95 text-[#1c2b3a] border border-black/10 opacity-70 px-1.5 py-0.5 text-[8px]'
                }`}
                style={{ fontFamily: 'Geist, sans-serif', letterSpacing: '0.1em', pointerEvents: 'none' }}
              >
                {pin.label}
                {pin.count > 0 && (
                  <span className={`ml-1 ${isActive ? 'text-white/55' : 'text-[#1c2b3a]/40'}`}>
                    {pin.count}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* ── DESKTOP: Left overlay (title + hint + CTA) ── */}
      <div
        className="hidden md:flex absolute top-1/2 left-0 z-20 flex-col items-center px-20"
        style={{ transform: 'translateY(-50%)' }}
      >
        <h2
          className="map-hero-title text-xl md:text-2xl font-light tracking-wide mb-2 text-center"
          style={{ fontFamily: 'Marcellus, serif', color: '#1c2b3a' }}
        >
          {t('map_select_location')}
        </h2>
        <p
          className="map-hero-hint text-xs tracking-widest mb-6 text-center"
          style={{ fontFamily: 'Geist, sans-serif', letterSpacing: '0.12em', color: 'rgba(28,43,58,0.35)' }}
        >
          {t('map_click_hint')}
        </p>
        <button
          onClick={() => { onLocationChange('all'); onViewAllProjects(); }}
          className="map-hero-cta self-center flex items-center gap-3 px-7 py-3 rounded-full text-xs tracking-widest transition-all duration-300 cursor-pointer whitespace-nowrap border bg-white text-[#1c2b3a] border-[#1c2b3a]/20 hover:border-[#1c2b3a]"
          style={{ fontFamily: 'Geist, sans-serif', letterSpacing: '0.12em' }}
        >
          {t('map_view_all')}
          <span className="text-[10px] text-[#1c2b3a]/40">{totalCount}</span>
        </button>
      </div>

      {/* ── DESKTOP: Right overlay — animated stats ── */}
      <div
        ref={statsRef}
        className="hidden md:flex absolute top-1/2 right-0 z-20 flex-col items-end px-20"
        style={{ transform: 'translateY(-50%)' }}
      >
        {STATS.map((stat) => (
          <StatItem
            key={stat.label}
            target={stat.target}
            suffix={stat.suffix}
            label={stat.label}
            delay={stat.delay}
            isVisible={statsVisible}
          />
        ))}
      </div>

      {/* ── MOBILE: Title at top — white fade from top so text is readable over map ── */}
      <div
        className="md:hidden absolute top-0 left-0 right-0 z-20 flex flex-col items-center px-6"
        style={{
          paddingTop: '72px',
          paddingBottom: '32px',
          background: 'linear-gradient(to bottom, rgba(255,255,255,0.96) 0%, rgba(255,255,255,0.88) 60%, transparent 100%)',
        }}
      >
        <h2
          className="map-hero-title text-lg font-light tracking-wide mb-1 text-center"
          style={{ fontFamily: 'Marcellus, serif', color: '#1c2b3a' }}
        >
          {t('map_select_location')}
        </h2>
        <p
          className="map-hero-hint text-[10px] tracking-widest text-center"
          style={{ fontFamily: 'Geist, sans-serif', letterSpacing: '0.12em', color: 'rgba(28,43,58,0.35)' }}
        >
          {t('map_click_hint')}
        </p>
      </div>

      {/* ── MOBILE: Stats + View All at bottom ── */}
      <div
        ref={statsRef}
        className="md:hidden absolute left-0 right-0 px-6 pb-5 pt-2"
        style={{ zIndex: 26, bottom: 0, background: 'linear-gradient(to bottom, transparent 0%, rgba(255,255,255,0.90) 20%, #ffffff 45%)' }}
      >
        {/* Stats row — 4 columns */}
        <div className="grid grid-cols-4 gap-1 mb-2">
          {STATS.map((stat) => (
            <div
              key={stat.label}
              className="flex flex-col items-center"
              style={{
                animation: `mapFadeIn 0.9s cubic-bezier(0.22,1,0.36,1) ${stat.delay / 1000}s both`,
              }}
            >
              <StatItem
                target={stat.target}
                suffix={stat.suffix}
                label={stat.label}
                delay={stat.delay}
                isVisible={statsVisible}
              />
            </div>
          ))}
        </div>
        {/* View All button */}
        <button
          onClick={() => { onLocationChange('all'); onViewAllProjects(); }}
          className="map-hero-cta w-full flex items-center justify-center gap-3 px-7 py-2.5 rounded-full text-xs tracking-widest transition-all duration-300 cursor-pointer whitespace-nowrap border bg-white text-[#1c2b3a] border-[#1c2b3a]/20 hover:border-[#1c2b3a]"
          style={{ fontFamily: 'Geist, sans-serif', letterSpacing: '0.12em' }}
        >
          {t('map_view_all')}
          <span className="text-[10px] text-[#1c2b3a]/40">{totalCount}</span>
        </button>
      </div>

      {/* ── Bottom fade-to-white (desktop only — mobile has stats bar instead) ── */}
      <div
        className="hidden md:block absolute bottom-0 left-0 right-0 pointer-events-none"
        style={{
          height: '180px',
          zIndex: 25,
          background: 'linear-gradient(to bottom, transparent 0%, rgba(255,255,255,0.55) 40%, rgba(255,255,255,0.92) 72%, #ffffff 100%)',
        }}
      />
    </div>
  );
}
