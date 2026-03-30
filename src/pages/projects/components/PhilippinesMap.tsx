import { useMemo } from 'react';

interface LocationPin {
  id: string;
  label: string;
  x: number;
  y: number;
  count: number;
  goLeft: boolean;
}

interface CityProjectData {
  count: number;
  categories: string[];
}

interface PhilippinesMapProps {
  activeLocation: string;
  onLocationChange: (loc: string) => void;
  projectCounts: Record<string, number>;
  cityProjectData: Record<string, CityProjectData>;
}

// Positions derived from real geographic coordinates
// Lon range: 118°E–127°E (9°), Lat range: 5°N–19°N (14°), ~8% padding each side
// x% = 8 + (lon - 118) / 9 * 84
// y% = 8 + (19 - lat) / 14 * 84
// goLeft: line extends toward left white-space (x ≤ 50), right otherwise
// Recalibrated for actual SVG bounds (includes Palawan)
// SVG spans ~116°E–127°E lon, ~5°N–19°N lat, with ~3% padding each side
// x% = 3 + (lon - 116) / 11 * 94   |   y% = 3 + (19 - lat) / 14 * 94
// object-contain in 7/9 container: SVG natural ratio ~0.65 → ~8% horizontal letterbox each side
// container_x = 8 + svg_x * 0.84
const CITY_PINS: { id: string; label: string; x: number; y: number; goLeft: boolean }[] = [
  { id: 'Manila',    label: 'Manila',    x: 45, y: 33, goLeft: true  }, // 14.60°N 121.00°E
  { id: 'Cebu',      label: 'Cebu',      x: 66, y: 61, goLeft: false }, // 10.32°N 123.89°E
  { id: 'Leyte',     label: 'Leyte',     x: 74, y: 55, goLeft: false }, // 11.24°N 124.99°E
  { id: 'CDO',       label: 'CDO',       x: 72, y: 74, goLeft: false }, //  8.48°N 124.65°E
  { id: 'Davao',     label: 'Davao',     x: 77, y: 82, goLeft: false }, //  7.19°N 125.46°E
  { id: 'Zamboanga', label: 'Zamboanga', x: 52, y: 84, goLeft: true  }, //  6.91°N 122.07°E
];

const ABBREV: Record<string, string> = {
  'Interior Design': 'Interiors',
  'Mixed Use': 'Mixed Use',
};
const abbrev = (cat: string) => ABBREV[cat] ?? cat;

export default function PhilippinesMap({
  activeLocation,
  onLocationChange,
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

  return (
    <div className="w-full bg-white overflow-hidden" style={{ height: '100vh' }}>
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

        /* Hover line grows via scaleX */
        .pin-line-left  { transform-origin: right center; }
        .pin-line-right { transform-origin: left center; }
        .pin-group:hover .pin-line  { transform: scaleX(1); }
        .pin-group:hover .pin-card  { opacity: 1; transform: translateX(0); }
        .pin-group:hover .pin-label { opacity: 0; transform: scale(0.85); }

        .pin-line {
          transform: scaleX(0);
          transition: transform 0.35s cubic-bezier(0.4,0,0.2,1);
        }
        .pin-card {
          opacity: 0;
          transition: opacity 0.25s ease 0.22s, transform 0.25s ease 0.22s;
        }
        .pin-label {
          transition: opacity 0.15s ease, transform 0.15s ease;
        }
      `}</style>

      {/* Dot-grid background */}
      <div
        className="absolute inset-0 pointer-events-none z-0"
        style={{
          backgroundImage: 'radial-gradient(circle, rgba(0,0,0,0.055) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      {/* ── MAP COLUMN — portrait, centered, fills full height ── */}
      <div
        className="absolute top-0 bottom-0 z-10"
        style={{ aspectRatio: '7 / 9', left: '50%', transform: 'translateX(-50%) scale(1.14)', transformOrigin: 'center center' }}
      >
        <img
          src="https://storage.readdy-site.link/project_files/3530b75e-ff34-41a0-81d5-ae38e0742267/24b204ac-0ddb-418c-863c-dd662c7f1fef_ph.svg?v=47ebe8b8e1e2c3c3d9761785e68809a2"
          alt="Philippines Map"
          className="absolute inset-0 w-full h-full select-none"
          style={{ objectFit: 'contain', objectPosition: 'center', filter: 'grayscale(1)', opacity: 0.45 }}
          draggable={false}
        />

        {/* ── City Pins ── */}
        {pins.map((pin) => {
          const isActive = activeLocation === pin.id;
          const data = cityProjectData[pin.id];
          const cats = data?.categories.slice(0, 3).map(abbrev).join(' · ') ?? '';
          const projLabel = data ? `${data.count} ${data.count === 1 ? 'Project' : 'Projects'}` : '';

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
              {/* ── Hover: line + data card ── */}
              {pin.goLeft ? (
                /* LEFT direction */
                <div
                  className="absolute top-1/2 right-[calc(100%+2px)] -translate-y-1/2 flex flex-row-reverse items-center pointer-events-none"
                  style={{ gap: 0 }}
                >
                  {/* Line — grows right→left */}
                  <div
                    className="pin-line pin-line-left h-px bg-[#1c2b3a]/25"
                    style={{ width: '80px', flexShrink: 0 }}
                  />
                  {/* Card */}
                  <div
                    className="pin-card pr-4 text-right"
                    style={{ transform: 'translateX(8px)' }}
                  >
                    <p
                      className="whitespace-nowrap text-[11px] font-medium text-[#1c2b3a]"
                      style={{ fontFamily: 'Geist, sans-serif', letterSpacing: '0.04em', lineHeight: 1.4 }}
                    >
                      {projLabel}
                    </p>
                    <p
                      className="whitespace-nowrap text-[9px] text-[#1c2b3a]/45 mt-0.5"
                      style={{ fontFamily: 'Geist, sans-serif', letterSpacing: '0.06em', lineHeight: 1.4 }}
                    >
                      {cats}
                    </p>
                  </div>
                </div>
              ) : (
                /* RIGHT direction */
                <div
                  className="absolute top-1/2 left-[calc(100%+2px)] -translate-y-1/2 flex flex-row items-center pointer-events-none"
                  style={{ gap: 0 }}
                >
                  {/* Line — grows left→right */}
                  <div
                    className="pin-line pin-line-right h-px bg-[#1c2b3a]/25"
                    style={{ width: '80px', flexShrink: 0 }}
                  />
                  {/* Card */}
                  <div
                    className="pin-card pl-4"
                    style={{ transform: 'translateX(-8px)' }}
                  >
                    <p
                      className="whitespace-nowrap text-[11px] font-medium text-[#1c2b3a]"
                      style={{ fontFamily: 'Geist, sans-serif', letterSpacing: '0.04em', lineHeight: 1.4 }}
                    >
                      {projLabel}
                    </p>
                    <p
                      className="whitespace-nowrap text-[9px] text-[#1c2b3a]/45 mt-0.5"
                      style={{ fontFamily: 'Geist, sans-serif', letterSpacing: '0.06em', lineHeight: 1.4 }}
                    >
                      {cats}
                    </p>
                  </div>
                </div>
              )}

              {/* Active pulse ring */}
              {isActive && <span className="pin-pulse" />}

              {/* Hover glow */}
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

              {/* Label bubble — fades out on hover, replaced by side card */}
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

      {/* ── LEFT OVERLAY — title, hint & CTA ── */}
      <div
        className="absolute top-1/2 left-0 z-20 flex flex-col items-start px-12 md:px-20"
        style={{ transform: 'translateY(-50%)' }}
      >
        <p
          className="map-hero-title text-xs mb-4"
          style={{ fontFamily: 'Geist, sans-serif', letterSpacing: '0.05em', color: 'rgba(28,43,58,0.38)', fontStyle: 'italic' }}
        >
          Form. Stillness. Foundational structures.
        </p>
        <h2
          className="map-hero-title text-3xl md:text-4xl font-light tracking-wide mb-2"
          style={{ fontFamily: 'Marcellus, serif', color: '#1c2b3a' }}
        >
          Select a Location
        </h2>
        <p
          className="map-hero-hint text-xs tracking-widest mb-6"
          style={{ fontFamily: 'Geist, sans-serif', letterSpacing: '0.12em', color: 'rgba(28,43,58,0.35)' }}
        >
          Click a city on the map to explore projects
        </p>
        <button
          onClick={() => onLocationChange('all')}
          className={`map-hero-cta self-center flex items-center gap-3 px-7 py-3 rounded-full text-xs tracking-widest transition-all duration-300 cursor-pointer whitespace-nowrap border ${
            activeLocation === 'all'
              ? 'bg-[#1c2b3a] text-white border-[#1c2b3a]'
              : 'text-[#1c2b3a] border-[#1c2b3a]/25 hover:border-[#1c2b3a] hover:bg-[#1c2b3a]/5 bg-white/80'
          }`}
          style={{ fontFamily: 'Geist, sans-serif', letterSpacing: '0.12em', backdropFilter: 'blur(8px)' }}
        >
          VIEW ALL PROJECTS
          <span className={`text-[10px] ${activeLocation === 'all' ? 'text-white/60' : 'text-[#1c2b3a]/40'}`}>
            {totalCount}
          </span>
        </button>
      </div>
    </div>
  );
}
