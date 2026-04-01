import { useMemo, useState, useEffect, useRef } from 'react';

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
const CITY_PINS: { id: string; label: string; x: number; y: number; goLeft: boolean }[] = [
  { id: 'Manila',    label: 'Manila',    x: 40, y: 35, goLeft: true  },
  { id: 'Cebu',      label: 'Cebu',      x: 61, y: 60, goLeft: false },
  { id: 'Leyte',     label: 'Leyte',     x: 69, y: 54, goLeft: false },
  { id: 'CDO',       label: 'CDO',       x: 65, y: 72, goLeft: false },
  { id: 'Davao',     label: 'Davao',     x: 71, y: 81, goLeft: false },
  { id: 'Zamboanga', label: 'Zamboanga', x: 47, y: 81, goLeft: true  },
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
      className="flex flex-col items-end mb-8 last:mb-0"
      style={{
        animation: `mapFadeIn 0.9s cubic-bezier(0.22,1,0.36,1) ${delay / 1000}s both`,
      }}
    >
      <span
        className="text-2xl md:text-3xl font-light tracking-tight leading-none tabular-nums"
        style={{ fontFamily: 'Marcellus, serif', color: '#1c2b3a' }}
      >
        {count}{suffix}
      </span>
      <span
        className="text-[10px] tracking-widest mt-1.5 text-right"
        style={{ fontFamily: 'Geist, sans-serif', letterSpacing: '0.14em', color: 'rgba(28,43,58,0.38)' }}
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

  const STATS = [
    { target: 2021, suffix: '',  label: 'Year Founded',      delay: 100  },
    { target: 100,  suffix: '+', label: 'Projects',          delay: 220  },
    { target: 10,   suffix: '',  label: 'Ongoing Projects',  delay: 340  },
    { target: 5,    suffix: '',  label: 'Team Members',      delay: 460  },
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
        .map-hero-title { animation: mapFadeIn 0.9s cubic-bezier(0.22,1,0.36,1) both; }
        .map-hero-hint  { animation: mapFadeIn 0.9s cubic-bezier(0.22,1,0.36,1) 0.24s both; }
        .map-hero-cta   { animation: mapFadeIn 0.9s cubic-bezier(0.22,1,0.36,1) 0.38s both; }
        .pin-pulse {
          position: absolute; top: 50%; left: 50%;
          width: 36px; height: 36px; border-radius: 50%;
          background: #1c2b3a;
          animation: mapPulse 2.2s ease-in-out infinite;
        }

        /* Hover card slide-in */
        .pin-line-left  { transform-origin: right center; }
        .pin-line-right { transform-origin: left center; }
        .pin-group:hover .pin-line  { transform: scaleX(1) !important; }
        .pin-group:hover .pin-card  { opacity: 1 !important; transform: translateX(0) !important; }
        .pin-group:hover .pin-label { opacity: 0; transform: scale(0.85); }

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
            opacity: 0.55,
            filter: 'blur(10px)',
            transform: 'scale(1.04)',
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
            opacity: 0.55,
            filter: 'blur(0.5px)',
            maskImage: 'radial-gradient(ellipse 55% 52% at 50% 50%, black 15%, rgba(0,0,0,0.6) 42%, transparent 68%)',
            WebkitMaskImage: 'radial-gradient(ellipse 55% 52% at 50% 50%, black 15%, rgba(0,0,0,0.6) 42%, transparent 68%)',
          }}
          draggable={false}
        />
      </div>

      {/* ── MAP COLUMN — portrait, centered, fills full height ── */}
      <div
        className="absolute top-0 bottom-0 z-10"
        style={{
          aspectRatio: '7 / 9',
          left: '50%',
          transform: 'translateX(-50%) scale(1.14)',
          transformOrigin: 'center center',
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
        {pins.map((pin) => {
          const isActive = activeLocation === pin.id;
          const data = cityProjectData[pin.id];
          const cats = data?.categories.slice(0, 4).map(abbrev) ?? [];
          const projLabel = data ? `${data.count} ${data.count === 1 ? 'Project' : 'Projects'}` : '';
          const yearRange =
            data?.yearRange
              ? data.yearRange.min === data.yearRange.max
                ? data.yearRange.min
                : `${data.yearRange.min} – ${data.yearRange.max}`
              : '';
          const featured = data?.featuredProjects ?? [];

          // Card width for the expanded tooltip
          const CARD_W = 180;

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
              }}
              aria-label={`Show ${pin.label} projects`}
            >
              {/* ── Hover card (left or right) ── */}
              {pin.goLeft ? (
                <div
                  className="absolute top-1/2 right-[calc(100%+4px)] -translate-y-1/2 flex flex-row-reverse items-center pointer-events-none"
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
                    {/* CTA hint */}
                    <p
                      className="mt-2 text-[9px] tracking-widest text-[#1c2b3a]/35 uppercase"
                      style={{ fontFamily: 'Geist, sans-serif', letterSpacing: '0.1em' }}
                    >
                      Click to explore →
                    </p>
                  </div>
                </div>
              ) : (
                <div
                  className="absolute top-1/2 left-[calc(100%+4px)] -translate-y-1/2 flex flex-row items-center pointer-events-none"
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
                    {/* CTA hint */}
                    <p
                      className="mt-2 text-[9px] tracking-widest text-[#1c2b3a]/35 uppercase"
                      style={{ fontFamily: 'Geist, sans-serif', letterSpacing: '0.1em' }}
                    >
                      Click to explore →
                    </p>
                  </div>
                </div>
              )}

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

              {/* Label bubble */}
              <div
                className={`pin-label absolute left-1/2 pointer-events-none whitespace-nowrap px-2.5 py-1 rounded-full text-[10px] tracking-wider -translate-x-1/2 bottom-full mb-2 ${
                  isActive
                    ? 'bg-[#1c2b3a] text-white opacity-100'
                    : 'bg-white/95 text-[#1c2b3a] border border-black/10 opacity-70'
                }`}
                style={{ fontFamily: 'Geist, sans-serif', letterSpacing: '0.1em' }}
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

      {/* ── LEFT OVERLAY ── */}
      <div
        className="absolute top-1/2 left-0 z-20 flex flex-col items-center px-12 md:px-20"
        style={{ transform: 'translateY(-50%)' }}
      >
        <h2
          className="map-hero-title text-xl md:text-2xl font-light tracking-wide mb-2 text-center"
          style={{ fontFamily: 'Marcellus, serif', color: '#1c2b3a' }}
        >
          Select a Location
        </h2>
        <p
          className="map-hero-hint text-xs tracking-widest mb-6 text-center"
          style={{ fontFamily: 'Geist, sans-serif', letterSpacing: '0.12em', color: 'rgba(28,43,58,0.35)' }}
        >
          Click a city on the map to explore projects
        </p>
        <button
          onClick={() => { onLocationChange('all'); onViewAllProjects(); }}
          className="map-hero-cta self-center flex items-center gap-3 px-7 py-3 rounded-full text-xs tracking-widest transition-all duration-300 cursor-pointer whitespace-nowrap border bg-white text-[#1c2b3a] border-[#1c2b3a]/20 hover:border-[#1c2b3a]"
          style={{ fontFamily: 'Geist, sans-serif', letterSpacing: '0.12em' }}
        >
          VIEW ALL PROJECTS
          <span className="text-[10px] text-[#1c2b3a]/40">{totalCount}</span>
        </button>
      </div>

      {/* ── RIGHT OVERLAY — animated stats ── */}
      <div
        ref={statsRef}
        className="absolute top-1/2 right-0 z-20 flex flex-col items-end px-12 md:px-20"
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
    </div>
  );
}
