import { useTranslation } from 'react-i18next';
import { useEffect, useRef, useState } from 'react';

const TEAM = [
  // Principal Architect
  {
    key: 'fretz',
    nameKey: 'studio_team_fretz_name',
    titleKey: 'studio_team_fretz_title',
    bioKey: 'studio_team_fretz_bio',
    img: '/images/team/fretz.webp',
    imgShift: '-19%',
    credentials: [
      { label: 'Education', value: 'B.S. Architecture, University of San Carlos' },
      { label: 'License', value: 'PRC Licensed Architect' },
      { label: 'Experience', value: '18+ years' },
      { label: 'Specialization', value: 'Mixed-Use & Civic Design' },
    ],
  },
  // Design Lead
  {
    key: 'dan',
    nameKey: 'studio_team_dan_name',
    titleKey: 'studio_team_dan_title',
    bioKey: 'studio_team_dan_bio',
    img: '/images/team/dan.webp',
    imgShift: '-16%',
    credentials: [
      { label: 'Role', value: 'Design Lead' },
    ],
  },
  // Junior Architects
  {
    key: 'john',
    nameKey: 'studio_team_john_name',
    titleKey: 'studio_team_john_title',
    bioKey: 'studio_team_john_bio',
    img: '/images/team/john.webp',
    imgShift: '-24%',
    imgScale: 1.7,
    credentials: [
      { label: 'Role', value: 'Junior Architect' },
    ],
  },
  {
    key: 'jan',
    nameKey: 'studio_team_jan_name',
    titleKey: 'studio_team_jan_title',
    bioKey: 'studio_team_jan_bio',
    img: '/images/team/jan.webp',
    imgShift: '-20%',
    imgScale: 1.8,
    credentials: [
      { label: 'Role', value: 'Junior Architect' },
    ],
  },
  {
    key: 'raul',
    nameKey: 'studio_team_raul_name',
    titleKey: 'studio_team_raul_title',
    bioKey: 'studio_team_raul_bio',
    img: '/images/team/raul.webp',
    imgShift: '-13%',
    credentials: [
      { label: 'Role', value: 'Junior Architect' },
    ],
  },
  {
    key: 'gab',
    nameKey: 'studio_team_gab_name',
    titleKey: 'studio_team_gab_title',
    bioKey: 'studio_team_gab_bio',
    img: '/images/team/gab.webp',
    imgShift: '-20%',
    imgShiftX: '3%',
    imgScale: 1.85,
    credentials: [
      { label: 'Role', value: 'Junior Architect' },
    ],
  },
  {
    key: 'mikee',
    nameKey: 'studio_team_mikee_name',
    titleKey: 'studio_team_mikee_title',
    bioKey: 'studio_team_mikee_bio',
    img: '/images/team/mikee.webp',
    imgShift: '-24%',
    imgScale: 1.8,
    credentials: [
      { label: 'Education', value: 'B.S. Architecture' },
      { label: 'License', value: 'PRC Licensed Architect' },
      { label: 'Role', value: 'Junior Architect' },
    ],
  },
  // Architectural Apprentices
  {
    key: 'neil',
    nameKey: 'studio_team_neil_name',
    titleKey: 'studio_team_neil_title',
    bioKey: 'studio_team_neil_bio',
    img: '/images/team/neil.webp',
    imgShift: '-27%',
    imgScale: 1.8,
    credentials: [
      { label: 'Role', value: 'Architectural Apprentice' },
    ],
  },
  {
    key: 'chico',
    nameKey: 'studio_team_chico_name',
    titleKey: 'studio_team_chico_title',
    bioKey: 'studio_team_chico_bio',
    img: '/images/team/chico.webp',
    imgShift: '-22%',
    imgScale: 1.85,
    credentials: [
      { label: 'Role', value: 'Architectural Apprentice' },
    ],
  },
  {
    key: 'servacio',
    nameKey: 'studio_team_servacio_name',
    titleKey: 'studio_team_servacio_title',
    bioKey: 'studio_team_servacio_bio',
    img: '/images/team/servacio.webp',
    imgShift: '-13%',
    credentials: [
      { label: 'Role', value: 'Architectural Apprentice' },
    ],
  },
  {
    key: 'juls',
    nameKey: 'studio_team_juls_name',
    titleKey: 'studio_team_juls_title',
    bioKey: 'studio_team_juls_bio',
    img: '/images/team/juls.webp',
    imgShift: '-17%',
    credentials: [
      { label: 'Role', value: 'Architectural Apprentice' },
    ],
  },
  // Architectural Interns
  {
    key: 'villarin',
    nameKey: 'studio_team_villarin_name',
    titleKey: 'studio_team_villarin_title',
    bioKey: 'studio_team_villarin_bio',
    img: '/images/team/villarin.webp',
    imgShift: '-17%',
    credentials: [
      { label: 'Role', value: 'Architectural Intern' },
    ],
  },
  {
    key: 'iligan',
    nameKey: 'studio_team_iligan_name',
    titleKey: 'studio_team_iligan_title',
    bioKey: 'studio_team_iligan_bio',
    img: '/images/team/iligan.webp',
    imgShift: '-17%',
    credentials: [
      { label: 'Role', value: 'Architectural Intern' },
    ],
  },
  {
    key: 'divinigracia',
    nameKey: 'studio_team_divinigracia_name',
    titleKey: 'studio_team_divinigracia_title',
    bioKey: 'studio_team_divinigracia_bio',
    img: '/images/team/divinigracia.webp',
    imgShift: '-14%',
    credentials: [
      { label: 'Role', value: 'Architectural Intern' },
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
  // One ref per card to get card top for centering
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Build rows based on current cols
  const rows: typeof TEAM[] = [];
  for (let i = 0; i < TEAM.length; i += cols) {
    rows.push(TEAM.slice(i, i + cols));
  }

  const activeMember = TEAM.find(m => m.key === (panelKey ?? activeKey)) ?? null;

  const activeIndex = activeKey ? TEAM.findIndex(m => m.key === activeKey) : -1;
  const activeRow = activeIndex >= 0 ? Math.floor(activeIndex / cols) : -1;

  const scrollToPanel = (rowIndex: number, memberKey: string) => {
    setTimeout(() => {
      const card = cardRefs.current[memberKey];
      const panel = panelRefs.current[rowIndex];
      if (card && panel) {
        const cardTop = card.getBoundingClientRect().top + window.scrollY;
        const panelBottom = panel.getBoundingClientRect().bottom + window.scrollY;
        const centerY = (cardTop + panelBottom) / 2;
        window.scrollTo({ top: centerY - window.innerHeight / 2, behavior: 'smooth' });
      } else if (panel) {
        panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 320);
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
      scrollToPanel(rowIdx, key);
      return;
    }
    setActiveKey(key);
    onSelect(key);
    setPanelKey(key);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setPanelOpen(true);
        scrollToPanel(rowIdx, key);
      });
    });
  };

  const handleClose = () => {
    setPanelOpen(false);
    setTimeout(() => {
      setActiveKey(null);
      setPanelKey(null);
      onSelect(null);
    }, 280);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && activeKey) handleClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeKey]);

  return (
    <section id="team" className="w-full bg-white" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
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
          background: #1a2028;
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
        .team-card-wrap:hover .team-card-photo img {
          opacity: 0.75;
        }
        .team-card-wrap.dimmed .team-card-photo img {
          opacity: 0.25;
          filter: blur(3px);
        }
        .team-card-wrap.dimmed .team-card-photo {
          filter: blur(1px);
        }
        .team-card-wrap.active .team-card-photo img {
          opacity: 1;
        }
        .team-card-wrap:hover .team-card-photo img {
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
        .team-card-wrap:hover:not(.active) .team-card-view-badge {
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
          transition: grid-template-rows 0.28s cubic-bezier(0.22,1,0.36,1);
          overflow: hidden;
        }
        .team-bio-panel-outer.open {
          grid-template-rows: 1fr;
        }
        .team-bio-panel-inner {
          min-height: 0;
          overflow: hidden;
        }

        .team-bio-panel-body {
          display: flex;
          flex-direction: row;
          gap: 56px;
          align-items: flex-start;
        }
        .team-bio-credentials {
          flex: 0 0 260px;
          border-left: 1px solid rgba(255,255,255,0.08);
          padding-left: 48px;
        }
        @media (max-width: 767px) {
          .team-bio-panel-body {
            flex-direction: column;
            gap: 24px;
          }
          .team-bio-credentials {
            flex: none;
            width: 100%;
            border-left: none;
            border-top: 1px solid rgba(255,255,255,0.08);
            padding-left: 0;
            padding-top: 24px;
          }
        }
      `}</style>

      {/* Heading */}
      <div ref={headingRef} className="px-4 md:px-20 lg:px-28 pt-10 pb-6">
        <h2 className="team-heading-item team-h-d1" style={{
          fontFamily: 'Marcellus, serif',
          fontSize: 'clamp(20px, 2.4vw, 32px)',
          letterSpacing: '-0.01em',
          color: 'rgba(0,0,0,0.82)',
          lineHeight: 1.15,
          margin: 0,
        }}>
          {t('studio_team_heading1')}
        </h2>
        <h2 className="team-heading-item team-h-d2" style={{
          fontFamily: 'Marcellus, serif',
          fontSize: 'clamp(20px, 2.4vw, 32px)',
          letterSpacing: '-0.01em',
          color: 'rgba(0,0,0,0.25)',
          lineHeight: 1.15,
          margin: 0,
        }}>
          {t('studio_team_heading2')}
        </h2>
      </div>

      {/* Grid — rows of 3 with inline bio panel after each row */}
      <div className="px-4 md:px-20 lg:px-28" style={{ paddingBottom: '120px', flex: 1 }}>
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
                      ref={(el) => { cardRefs.current[member.key] = el; }}
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
                        {!member.img.includes('placeholder') && (
                          <img
                            src={member.img}
                            alt={t(member.nameKey)}
                            draggable={false}
                            style={{
                              objectPosition: 'top center',
                              transform: `scale(${member.imgScale ?? 1.5}) translateX(${member.imgShiftX ?? '0%'}) translateY(${member.imgShift})`,
                              transformOrigin: 'top center',
                            }}
                          />
                        )}
                        <div className="team-card-view-badge">
                          <span className="team-view-pill">
                            View Bio
                          </span>
                        </div>
                      </div>

                      {/* Name + title below photo */}
                      <div style={{ paddingTop: '12px', paddingBottom: '4px' }}>
                        <p style={{
                          fontFamily: 'Marcellus, serif',
                          fontSize: 'clamp(13px, 1.1vw, 16px)',
                          letterSpacing: '-0.01em',
                          color: isDimmed ? 'rgba(0,0,0,0.22)' : 'rgba(0,0,0,0.82)',
                          margin: '0 0 4px 0',
                          lineHeight: 1.3,
                          transition: 'color 0.35s ease',
                        }}>
                          {t(member.nameKey)}
                        </p>
                        <p style={{
                          fontFamily: 'Geist, sans-serif',
                          fontSize: '8px',
                          letterSpacing: '0.08em',
                          color: isDimmed ? 'rgba(0,0,0,0.14)' : 'rgba(0,0,0,0.30)',
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
                    <div style={{ padding: '0 0 24px 0', opacity: panelOpen ? 1 : 0, transition: 'opacity 0.12s ease' }}>
                      <div
                        style={{
                          background: 'linear-gradient(135deg, rgba(43,54,64,0.92) 0%, rgba(26,32,40,0.96) 100%)',
                          backdropFilter: 'blur(24px)',
                          WebkitBackdropFilter: 'blur(24px)',
                          border: '1px solid rgba(255,255,255,0.09)',
                          borderRadius: '20px',
                          padding: 'clamp(24px, 4vw, 44px) clamp(20px, 4vw, 48px)',
                          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
                        }}
                      >
                        <div className="team-bio-panel-body">
                        {/* LEFT — Name, Title, Bio, Close */}
                        <div style={{ flex: '1 1 0', minWidth: 0 }}>
                          <h3 style={{ fontFamily: 'Marcellus, serif', fontSize: 'clamp(17px, 1.8vw, 24px)', letterSpacing: '-0.01em', color: 'rgba(255,255,255,0.90)', lineHeight: 1.2, margin: '0 0 6px 0' }}>
                            {t(activeMember.nameKey)}
                          </h3>
                          <p style={{ fontFamily: 'Geist, sans-serif', fontSize: '8px', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.30)', textTransform: 'uppercase', margin: '0 0 24px 0' }}>
                            {t(activeMember.titleKey)}
                          </p>
                          <div style={{ margin: '0 0 32px 0' }}>
                            {t(activeMember.bioKey).split('\n\n').map((para, i) => (
                              <p key={i} style={{ fontFamily: 'Geist, sans-serif', fontSize: 'clamp(13px, 1vw, 14px)', lineHeight: 1.9, color: 'rgba(255,255,255,0.50)', letterSpacing: '0.01em', margin: i === 0 ? 0 : '16px 0 0 0', textAlign: 'justify' }}>
                                {para}
                              </p>
                            ))}
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleClose(); }}
                            style={{ fontFamily: 'Geist, sans-serif', fontSize: '9px', letterSpacing: '0.20em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', border: '1px solid rgba(255,255,255,0.15)', padding: '9px 24px', borderRadius: '9999px', background: 'rgba(255,255,255,0.05)', cursor: 'pointer', transition: 'color 0.2s ease, border-color 0.2s ease, background 0.2s ease', whiteSpace: 'nowrap' }}
                            onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.color = 'rgba(255,255,255,0.85)'; b.style.borderColor = 'rgba(255,255,255,0.35)'; b.style.background = 'rgba(255,255,255,0.10)'; }}
                            onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.color = 'rgba(255,255,255,0.35)'; b.style.borderColor = 'rgba(255,255,255,0.15)'; b.style.background = 'rgba(255,255,255,0.05)'; }}
                          >
                            Close
                          </button>
                        </div>

                        {/* RIGHT — Credentials */}
                        {activeMember.credentials && (
                          <div className="team-bio-credentials">
                            <p style={{ fontFamily: 'Geist, sans-serif', fontSize: '9px', letterSpacing: '0.26em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.22)', marginBottom: '24px' }}>
                              Credentials
                            </p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                              {activeMember.credentials.map((c) => (
                                <div key={c.label}>
                                  <p style={{ fontFamily: 'Geist, sans-serif', fontSize: '8px', letterSpacing: '0.28em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.22)', marginBottom: '4px' }}>
                                    {c.label}
                                  </p>
                                  <p style={{ fontFamily: 'Geist, sans-serif', fontSize: 'clamp(12px, 0.9vw, 13px)', color: 'rgba(255,255,255,0.62)', lineHeight: 1.7, letterSpacing: '0.01em' }}>
                                    {c.value}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        </div>
                      </div>
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
