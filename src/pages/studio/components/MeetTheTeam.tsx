import { useTranslation } from 'react-i18next';
import { useEffect, useRef, useState } from 'react';

const TEAM = [
  {
    key: 'fretz',
    nameKey: 'studio_team_francisco_name',
    titleKey: 'studio_team_francisco_title',
    bioKey: 'studio_team_francisco_bio',
    img: '/images/team/fretz.png',
    imgShift: '10%',
    credentials: [
      { label: 'Education', value: 'B.S. Architecture, University of San Carlos' },
      { label: 'License', value: 'PRC Lic. No. 0012345' },
      { label: 'Experience', value: '18+ years' },
      { label: 'Specialization', value: 'Mixed-Use & Civic Design' },
    ],
  },
  {
    key: 'sofia',
    nameKey: 'studio_team_sofia_name',
    titleKey: 'studio_team_sofia_title',
    bioKey: 'studio_team_sofia_bio',
    img: '/images/team/sofia.png',
    imgShift: '10%',
    credentials: [
      { label: 'Education', value: 'B.S. Architecture, UP Diliman · AA London' },
      { label: 'License', value: 'PRC Lic. No. 0023456' },
      { label: 'Experience', value: '12+ years' },
      { label: 'Specialization', value: 'Spatial Experience & Human Scale' },
    ],
  },
  {
    key: 'marco',
    nameKey: 'studio_team_marco_name',
    titleKey: 'studio_team_marco_title',
    bioKey: 'studio_team_marco_bio',
    img: '/images/team/marco.png',
    imgShift: '0%',
    credentials: [
      { label: 'Education', value: 'B.S. Architecture, Cebu Institute of Technology' },
      { label: 'License', value: 'PRC Lic. No. 0034567' },
      { label: 'Experience', value: '10+ years' },
      { label: 'Specialization', value: 'Structural Systems & Building Technology' },
    ],
  },
  {
    key: 'elena',
    nameKey: 'studio_team_elena_name',
    titleKey: 'studio_team_elena_title',
    bioKey: 'studio_team_elena_bio',
    img: '/images/team/elena.png',
    imgShift: '10%',
    credentials: [
      { label: 'Education', value: 'B.S. Interior Design, De La Salle – CSB' },
      { label: 'License', value: 'PRC Lic. No. 0045678' },
      { label: 'Experience', value: '9+ years' },
      { label: 'Specialization', value: 'Bespoke Furniture & Material Curation' },
    ],
  },
  {
    key: 'rafael',
    nameKey: 'studio_team_rafael_name',
    titleKey: 'studio_team_rafael_title',
    bioKey: 'studio_team_rafael_bio',
    img: '/images/team/rafael.png',
    imgShift: '10%',
    credentials: [
      { label: 'Education', value: 'B.S. Architecture, University of the Philippines' },
      { label: 'License', value: 'PRC Lic. No. 0056789' },
      { label: 'Experience', value: '11+ years' },
      { label: 'Specialization', value: 'Healthcare & Civic Projects' },
    ],
  },
  {
    key: 'ana',
    nameKey: 'studio_team_ana_name',
    titleKey: 'studio_team_ana_title',
    bioKey: 'studio_team_ana_bio',
    img: '/images/team/ana.png',
    imgShift: '0%',
    credentials: [
      { label: 'Education', value: 'B.S. Architecture, Ateneo de Davao University' },
      { label: 'License', value: 'PRC Lic. No. 0067890' },
      { label: 'Experience', value: '6+ years' },
      { label: 'Specialization', value: 'Residential & Resort Design' },
    ],
  },
];

const COLS_DESKTOP = 4;
const COLS_MOBILE = 2;

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
  const headingRef = useReveal(0.2);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelKey, setPanelKey] = useState<string | null>(null);
  const [cols, setCols] = useState(COLS_DESKTOP);

  // Track breakpoint for row calculation
  useEffect(() => {
    const update = () => setCols(window.innerWidth < 768 ? COLS_MOBILE : COLS_DESKTOP);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // One ref per row to scroll to the panel
  const panelRefs = useRef<Record<number, HTMLDivElement | null>>({});

  // Build rows based on current cols
  const rows: typeof TEAM[] = [];
  for (let i = 0; i < TEAM.length; i += cols) {
    rows.push(TEAM.slice(i, i + cols));
  }

  const activeMember = TEAM.find(m => m.key === (panelKey ?? activeKey)) ?? null;

  const activeIndex = activeKey ? TEAM.findIndex(m => m.key === activeKey) : -1;
  const activeRow = activeIndex >= 0 ? Math.floor(activeIndex / cols) : -1;

  const scrollToPanel = (rowIndex: number) => {
    setTimeout(() => {
      const el = panelRefs.current[rowIndex];
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 120);
  };

  const handleOpen = (key: string) => {
    if (activeKey === key) {
      handleClose();
      return;
    }
    const idx = TEAM.findIndex(m => m.key === key);
    const rowIdx = Math.floor(idx / cols);
    if (panelOpen) {
      setActiveKey(key);
      onSelect(key);
      setPanelKey(key);
      scrollToPanel(rowIdx);
      return;
    }
    setActiveKey(key);
    onSelect(key);
    setPanelKey(key);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setPanelOpen(true);
        scrollToPanel(rowIdx);
      });
    });
  };

  const handleClose = () => {
    setPanelOpen(false);
    setTimeout(() => {
      setActiveKey(null);
      setPanelKey(null);
      onSelect(null);
    }, 420);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && activeKey) handleClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeKey]);

  return (
    <section id="team" className="w-full bg-white">
      <style>{`
        .team-heading-item {
          opacity: 0;
          transform: translateY(22px);
          transition: opacity 0.70s cubic-bezier(0.22,1,0.36,1), transform 0.70s cubic-bezier(0.22,1,0.36,1);
        }
        .team-heading-visible .team-heading-item { opacity: 1; transform: translateY(0); }
        .team-h-d0 { transition-delay: 0s; }
        .team-h-d1 { transition-delay: 0.12s; }
        .team-h-d2 { transition-delay: 0.22s; }

        .team-card-wrap {
          display: flex;
          flex-direction: column;
          cursor: pointer;
        }
        .team-card-photo {
          position: relative;
          overflow: hidden;
          background: #111;
          aspect-ratio: 3 / 4;
          border-radius: 16px;
        }
        .team-card-wrap:hover .team-card-photo,
        .team-card-wrap.active .team-card-photo {
          border-radius: 16px 16px 16px 16px;
        }
        .team-card-photo img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
          transition: transform 0.55s cubic-bezier(0.22,1,0.36,1), opacity 0.40s ease;
          opacity: 1;
        }
        .team-card-wrap:hover .team-card-photo img,
        .team-card-wrap.dimmed .team-card-photo img {
          opacity: 0.55;
        }
        .team-card-wrap.active .team-card-photo img {
          opacity: 1;
          transform: scale(1.03);
        }
        .team-card-wrap:hover .team-card-photo img {
          transform: scale(1.03);
          opacity: 0.75;
        }
        .team-card-view-badge {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 0;
          transition: opacity 0.30s ease;
          pointer-events: none;
        }
        .team-card-wrap:hover .team-card-view-badge,
        .team-card-wrap.active .team-card-view-badge {
          opacity: 1;
        }
        .team-view-pill {
          font-family: 'Geist', sans-serif;
          font-size: 9px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: #fff;
          background: rgba(0,0,0,0.55);
          backdrop-filter: blur(8px);
          border: 1px solid rgba(255,255,255,0.25);
          padding: 8px 20px;
          border-radius: 9999px;
          white-space: nowrap;
          transition: background 0.2s ease, border-color 0.2s ease;
        }
        .team-card-wrap:hover .team-view-pill {
          background: rgba(0,0,0,0.75);
          border-color: rgba(255,255,255,0.45);
        }

        /* Inline bio panel */
        .team-bio-panel-outer {
          display: grid;
          grid-template-rows: 0fr;
          transition: grid-template-rows 0.42s cubic-bezier(0.22,1,0.36,1);
          overflow: hidden;
        }
        .team-bio-panel-outer.open {
          grid-template-rows: 1fr;
        }
        .team-bio-panel-inner {
          min-height: 0;
          overflow: hidden;
        }
      `}</style>

      {/* Heading */}
      <div ref={headingRef} className="px-4 md:px-20 lg:px-28 pt-16 pb-12">
        <p className="team-heading-item team-h-d0" style={{
          fontFamily: 'Geist, sans-serif',
          fontSize: '10px',
          letterSpacing: '0.22em',
          color: 'rgba(0,0,0,0.22)',
          textTransform: 'uppercase',
          marginBottom: '14px',
        }}>
          {t('studio_team_strip_eyebrow')}
        </p>
        <h2 className="team-heading-item team-h-d1" style={{
          fontFamily: 'Marcellus, serif',
          fontSize: 'clamp(26px, 2.5vw, 32px)',
          letterSpacing: '-0.025em',
          color: 'rgba(0,0,0,0.82)',
          lineHeight: 1.15,
          margin: 0,
        }}>
          {t('studio_team_heading1')}
        </h2>
        <h2 className="team-heading-item team-h-d2" style={{
          fontFamily: 'Marcellus, serif',
          fontSize: 'clamp(26px, 2.5vw, 32px)',
          letterSpacing: '-0.025em',
          color: 'rgba(0,0,0,0.25)',
          lineHeight: 1.15,
          margin: 0,
        }}>
          {t('studio_team_heading2')}
        </h2>
      </div>

      {/* Grid — rows of 3 with inline bio panel after each row */}
      <div className="px-4 md:px-28 lg:px-40" style={{ paddingBottom: '160px' }}>
        {rows.map((row, rowIndex) => {
          const isThisRowActive = activeRow === rowIndex;
          return (
            <div key={rowIndex}>
              {/* Row of cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                {row.map((member) => {
                  const isActive = activeKey === member.key;
                  const isDimmed = activeKey !== null && !isActive;
                  return (
                    <div
                      key={member.key}
                      className={`team-card-wrap${isActive ? ' active' : ''}${isDimmed ? ' dimmed' : ''}`}
                      onClick={() => handleOpen(member.key)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => e.key === 'Enter' && handleOpen(member.key)}
                      aria-label={`View bio for ${t(member.nameKey)}`}
                      aria-expanded={isActive}
                    >
                      {/* Photo */}
                      <div className="team-card-photo">
                        <img
                          src={member.img}
                          alt={t(member.nameKey)}
                          draggable={false}
                          style={{
                            objectPosition: 'top',
                            transform: `translateY(${member.imgShift})`,
                          }}
                        />
                        <div className="team-card-view-badge">
                          <span className="team-view-pill">
                            {isActive ? 'Close' : 'View Bio'}
                          </span>
                        </div>
                      </div>

                      {/* Name + title below photo */}
                      <div style={{ paddingTop: '12px', paddingBottom: '4px' }}>
                        <p style={{
                          fontFamily: 'Marcellus, serif',
                          fontSize: '15px',
                          color: isDimmed ? 'rgba(0,0,0,0.28)' : 'rgba(0,0,0,0.82)',
                          margin: '0 0 4px 0',
                          lineHeight: 1.3,
                          transition: 'color 0.35s ease',
                        }}>
                          {t(member.nameKey)}
                        </p>
                        <p style={{
                          fontFamily: 'Geist, sans-serif',
                          fontSize: '10px',
                          letterSpacing: '0.18em',
                          color: isDimmed ? 'rgba(0,0,0,0.18)' : 'rgba(0,0,0,0.35)',
                          textTransform: 'uppercase',
                          margin: 0,
                          transition: 'color 0.35s ease',
                        }}>
                          {t(member.titleKey)}
                        </p>
                      </div>
                    </div>
                  );
                })}
                {/* Fill empty cells in last partial row */}
                {row.length < cols && Array.from({ length: cols - row.length }).map((_, i) => (
                  <div key={`empty-${i}`} />
                ))}
              </div>

              {/* Inline bio panel — expands after this row */}
              <div
                className={`team-bio-panel-outer${isThisRowActive ? ' open' : ''}`}
                ref={(el) => { panelRefs.current[rowIndex] = el; }}
              >
                <div className="team-bio-panel-inner">
                  {activeMember && isThisRowActive && (
                    <div
                      style={{
                        background: '#fff',
                        borderTop: '1px solid rgba(0,0,0,0.07)',
                        borderBottom: '1px solid rgba(0,0,0,0.07)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        textAlign: 'center',
                        padding: '52px 48px',
                        marginBottom: '3px',
                      }}
                    >
                      {/* Name */}
                      <h3 style={{
                        fontFamily: 'Marcellus, serif',
                        fontSize: 'clamp(22px, 2vw, 30px)',
                        letterSpacing: '-0.02em',
                        color: 'rgba(0,0,0,0.84)',
                        lineHeight: 1.2,
                        margin: '0 0 6px 0',
                      }}>
                        {t(activeMember.nameKey)}
                      </h3>

                      {/* Title */}
                      <p style={{
                        fontFamily: 'Geist, sans-serif',
                        fontSize: '10px',
                        letterSpacing: '0.22em',
                        color: 'rgba(0,0,0,0.30)',
                        textTransform: 'uppercase',
                        marginBottom: '24px',
                      }}>
                        {t(activeMember.titleKey)}
                      </p>

                      {/* Bio */}
                      <p style={{
                        fontFamily: 'Geist, sans-serif',
                        fontSize: '13px',
                        lineHeight: 2,
                        color: 'rgba(0,0,0,0.50)',
                        letterSpacing: '0.015em',
                        maxWidth: '520px',
                        margin: '0 0 36px 0',
                      }}>
                        {t(activeMember.bioKey)}
                      </p>

                      {/* Credentials */}
                      {activeMember.credentials && (
                        <div style={{ width: '100%', maxWidth: '520px', marginBottom: '32px', borderTop: '1px solid rgba(0,0,0,0.07)', paddingTop: '28px' }}>
                          <p style={{ fontFamily: 'Geist, sans-serif', fontSize: '9px', letterSpacing: '0.26em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.25)', marginBottom: '20px' }}>
                            Credentials
                          </p>
                          <div className="grid grid-cols-2 gap-x-8 gap-y-4" style={{ textAlign: 'left' }}>
                            {activeMember.credentials.map((c) => (
                              <div key={c.label}>
                                <p style={{ fontFamily: 'Geist, sans-serif', fontSize: '9px', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.25)', marginBottom: '4px' }}>
                                  {c.label}
                                </p>
                                <p style={{ fontFamily: 'Geist, sans-serif', fontSize: '12px', color: 'rgba(0,0,0,0.65)', lineHeight: 1.5, letterSpacing: '0.01em' }}>
                                  {c.value}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Close — pill */}
                      <button
                        onClick={(e) => { e.stopPropagation(); handleClose(); }}
                        style={{
                          fontFamily: 'Geist, sans-serif',
                          fontSize: '9px',
                          letterSpacing: '0.20em',
                          textTransform: 'uppercase',
                          color: 'rgba(0,0,0,0.40)',
                          border: '1px solid rgba(0,0,0,0.14)',
                          padding: '9px 24px',
                          borderRadius: '9999px',
                          background: 'none',
                          cursor: 'pointer',
                          transition: 'color 0.2s ease, border-color 0.2s ease',
                          whiteSpace: 'nowrap',
                        }}
                        onMouseEnter={e => {
                          (e.currentTarget as HTMLButtonElement).style.color = 'rgba(0,0,0,0.80)';
                          (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(0,0,0,0.40)';
                        }}
                        onMouseLeave={e => {
                          (e.currentTarget as HTMLButtonElement).style.color = 'rgba(0,0,0,0.40)';
                          (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(0,0,0,0.14)';
                        }}
                      >
                        Close
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
