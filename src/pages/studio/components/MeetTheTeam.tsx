import { useTranslation } from 'react-i18next';
import { useEffect, useRef } from 'react';

// Ordered so that Fretz (index 2) lands in the visual center on load (5 cards visible, 20vw each)
const TEAM = [
  {
    key: 'rafael',
    nameKey: 'studio_team_rafael_name',
    titleKey: 'studio_team_rafael_title',
    bioKey: 'studio_team_rafael_bio',
    img: 'https://storage.readdy-site.link/project_files/3530b75e-ff34-41a0-81d5-ae38e0742267/e11df7c6-356e-419f-96b6-5f0fa4191508_19.png?v=fec461a42c97bbbf2594bb2a6d1c4c4a',
  },
  {
    key: 'ana',
    nameKey: 'studio_team_ana_name',
    titleKey: 'studio_team_ana_title',
    bioKey: 'studio_team_ana_bio',
    img: 'https://storage.readdy-site.link/project_files/3530b75e-ff34-41a0-81d5-ae38e0742267/1593ed2e-a95b-4107-8a6f-a5e435817b29_20.png?v=060e9de3147428a5b23a27854c3813fa',
  },
  {
    key: 'fretz',
    nameKey: 'studio_team_francisco_name',
    titleKey: 'studio_team_francisco_title',
    bioKey: 'studio_team_francisco_bio',
    img: 'https://storage.readdy-site.link/project_files/3530b75e-ff34-41a0-81d5-ae38e0742267/1271f415-5cef-4d33-8741-27ecd1388197_15.png?v=d1fe9e462a9759234380fea9f6f14461',
  },
  {
    key: 'sofia',
    nameKey: 'studio_team_sofia_name',
    titleKey: 'studio_team_sofia_title',
    bioKey: 'studio_team_sofia_bio',
    img: 'https://storage.readdy-site.link/project_files/3530b75e-ff34-41a0-81d5-ae38e0742267/2df352c7-89d9-4dc8-a1c7-85689550de88_16.png?v=ffca885a4a7042c541f6f1d13b98d1fc',
  },
  {
    key: 'marco',
    nameKey: 'studio_team_marco_name',
    titleKey: 'studio_team_marco_title',
    bioKey: 'studio_team_marco_bio',
    img: 'https://storage.readdy-site.link/project_files/3530b75e-ff34-41a0-81d5-ae38e0742267/562fc780-c3be-496c-bc6a-c97643052889_17.png?v=9eb6cca74a69a3b13802fe14f1b7cec5',
  },
  {
    key: 'elena',
    nameKey: 'studio_team_elena_name',
    titleKey: 'studio_team_elena_title',
    bioKey: 'studio_team_elena_bio',
    img: 'https://storage.readdy-site.link/project_files/3530b75e-ff34-41a0-81d5-ae38e0742267/c447d92c-3d88-4c21-89df-a783e2afe289_18.png?v=ca4765de1af5a8b4620bdb294a4e7955',
  },
];

interface MeetTheTeamProps {
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
}

function useReveal(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add('team-heading-visible');
          obs.disconnect();
        }
      },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return ref;
}

export default function MeetTheTeam({ selectedKey, onSelect }: MeetTheTeamProps) {
  const { t } = useTranslation();
  const doubled = [...TEAM, ...TEAM];
  const headingRef = useReveal(0.2);

  const selectedMember = TEAM.find(m => m.key === selectedKey) ?? null;

  const handleLearnMore = (key: string) => {
    onSelect(selectedKey === key ? null : key);
  };

  return (
    <section id="team" className="w-full bg-white" style={{ position: 'relative' }}>
      <style>{`
        @keyframes team-marquee {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .team-marquee-track {
          animation: team-marquee 36s linear infinite;
          will-change: transform;
        }
        .team-marquee-track:hover {
          animation-play-state: paused;
        }
        .team-marquee-track:hover .team-card img {
          filter: blur(5px);
          opacity: 0.25;
        }
        .team-card {
          backface-visibility: hidden;
        }
        .team-card:hover img {
          filter: blur(0px) !important;
          opacity: 1 !important;
        }
        .team-card img {
          transition: filter 0.55s ease, opacity 0.55s ease;
          backface-visibility: hidden;
        }
        .team-card-overlay {
          opacity: 0;
          transition: opacity 0.55s ease;
          pointer-events: none;
        }
        .team-card:hover .team-card-overlay {
          opacity: 1;
          pointer-events: auto;
        }
        .team-heading-item {
          opacity: 0;
          transform: translateY(22px);
          transition: opacity 0.70s cubic-bezier(0.22,1,0.36,1), transform 0.70s cubic-bezier(0.22,1,0.36,1);
        }
        .team-heading-visible .team-heading-item { opacity: 1; transform: translateY(0); }
        .team-h-d0 { transition-delay: 0s; }
        .team-h-d1 { transition-delay: 0.12s; }
        .team-h-d2 { transition-delay: 0.22s; }
      `}</style>

      {/* ── Heading ── */}
      <div ref={headingRef} className="px-4 md:px-20 lg:px-28 pt-16 pb-14">
        <p
          className="team-heading-item team-h-d0"
          style={{
            fontFamily: 'Geist, sans-serif',
            fontSize: '9px',
            letterSpacing: '0.22em',
            color: 'rgba(0,0,0,0.22)',
            textTransform: 'uppercase',
            marginBottom: '14px',
          }}
        >
          {t('studio_team_strip_eyebrow')}
        </p>
        <h2
          className="team-heading-item team-h-d1"
          style={{
            fontFamily: 'Marcellus, serif',
            fontSize: 'clamp(24px, 2.5vw, 30px)',
            letterSpacing: '-0.025em',
            color: 'rgba(0,0,0,0.82)',
            lineHeight: 1.15,
            margin: 0,
          }}
        >
          {t('studio_team_heading1')}
        </h2>
        <h2
          className="team-heading-item team-h-d2"
          style={{
            fontFamily: 'Marcellus, serif',
            fontSize: 'clamp(24px, 2.5vw, 30px)',
            letterSpacing: '-0.025em',
            color: 'rgba(0,0,0,0.25)',
            lineHeight: 1.15,
            margin: 0,
          }}
        >
          {t('studio_team_heading2')}
        </h2>
      </div>

      {/* ── Scrolling strip ── */}
      <div className="w-full overflow-hidden">
        <div
          className="team-marquee-track flex items-end"
          style={{ gap: '14px', width: 'max-content' }}
        >
          {doubled.map((member, idx) => (
            <div
              key={`${member.key}-${idx}`}
              className="team-card flex-shrink-0 relative"
              style={{ width: 'clamp(210px, 62vw, 280px)', cursor: 'pointer' }}
              onClick={() => handleLearnMore(member.key)}
            >
              <img
                src={member.img}
                alt={t(member.nameKey)}
                style={{
                  width: '100%',
                  height: 'auto',
                  display: 'block',
                  userSelect: 'none',
                  pointerEvents: 'none',
                }}
              />

              {/* Hover overlay — name, title, learn more button */}
              <div
                className="team-card-overlay absolute inset-x-0 bottom-0 flex flex-col items-center pt-10 pb-5"
                style={{
                  zIndex: 2,
                  background: 'linear-gradient(to top, rgba(255,255,255,0.97) 45%, rgba(255,255,255,0) 100%)',
                  height: '48%',
                  justifyContent: 'flex-end',
                }}
              >
                <p
                  className="pointer-events-none"
                  style={{
                    fontFamily: 'Marcellus, serif',
                    fontSize: '14px',
                    color: 'rgba(0,0,0,0.82)',
                    marginBottom: '3px',
                    textAlign: 'center',
                  }}
                >
                  {t(member.nameKey)}
                </p>
                <p
                  className="pointer-events-none"
                  style={{
                    fontFamily: 'Geist, sans-serif',
                    fontSize: '8px',
                    letterSpacing: '0.20em',
                    color: 'rgba(0,0,0,0.35)',
                    textTransform: 'uppercase',
                    textAlign: 'center',
                    marginBottom: '10px',
                  }}
                >
                  {t(member.titleKey)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Bio panel ── */}
      <div
        style={{
          maxHeight: selectedMember ? '300px' : '0px',
          overflow: 'hidden',
          transition: 'max-height 0.55s cubic-bezier(0.4,0,0.2,1)',
        }}
      >
        {selectedMember && (
          <div
            className="w-full border-t border-black/8 px-4 md:px-20 lg:px-28 py-8 flex flex-col items-center text-center"
            style={{
              opacity: selectedMember ? 1 : 0,
              transition: 'opacity 0.4s ease 0.15s',
            }}
          >
            {/* Title */}
            <p style={{
              fontFamily: 'Geist, sans-serif',
              fontSize: '8px',
              letterSpacing: '0.22em',
              color: 'rgba(0,0,0,0.28)',
              textTransform: 'uppercase',
              marginBottom: '6px',
            }}>
              {t(selectedMember.titleKey)}
            </p>

            {/* Name */}
            <h3 style={{
              fontFamily: 'Marcellus, serif',
              fontSize: 'clamp(16px, 1.6vw, 22px)',
              letterSpacing: '-0.02em',
              color: 'rgba(0,0,0,0.82)',
              lineHeight: 1.2,
              margin: '0 0 10px 0',
            }}>
              {t(selectedMember.nameKey)}
            </h3>

            {/* Rule */}
            <div style={{ width: '24px', height: '1px', backgroundColor: 'rgba(0,0,0,0.15)', marginBottom: '10px' }} />

            {/* Bio */}
            <p style={{
              fontFamily: 'Geist, sans-serif',
              fontSize: '11px',
              lineHeight: 1.9,
              color: 'rgba(0,0,0,0.45)',
              letterSpacing: '0.02em',
              maxWidth: '620px',
              marginBottom: '14px',
            }}>
              {t(selectedMember.bioKey)}
            </p>

            {/* Close */}
            <button
              onClick={(e) => { e.stopPropagation(); onSelect(null); }}
              className="transition-all duration-200 cursor-pointer whitespace-nowrap"
              style={{
                fontFamily: 'Geist, sans-serif',
                fontSize: '8px',
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: 'rgba(0,0,0,0.28)',
                border: '1px solid rgba(0,0,0,0.10)',
                padding: '5px 14px',
                background: 'none',
              }}
            >
              Close
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
