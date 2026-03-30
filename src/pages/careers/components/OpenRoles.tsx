import { useState } from 'react';
import { useTranslation } from 'react-i18next';

const SHARED_REQ_KEYS = [
  'careers_req_revit',
  'careers_req_org',
  'careers_req_timelines',
  'careers_req_proactive',
  'careers_req_team',
];

export const OPEN_ROLES = [
  {
    titleKey: 'careers_role_arch_title',
    typeKey: 'careers_role_arch_type',
    locationKey: 'careers_role_arch_location',
    deptKey: 'careers_role_arch_dept',
    expKey: 'careers_role_arch_exp',
    reqKeys: SHARED_REQ_KEYS,
  },
  {
    titleKey: 'careers_role_apprent_title',
    typeKey: 'careers_role_apprent_type',
    locationKey: 'careers_role_apprent_location',
    deptKey: 'careers_role_apprent_dept',
    expKey: 'careers_role_apprent_exp',
    reqKeys: SHARED_REQ_KEYS,
  },
];

interface OpenRolesProps {
  sectionRef: React.RefObject<HTMLDivElement>;
  onApply: (titleKey: string) => void;
}

export default function OpenRoles({ sectionRef, onApply }: OpenRolesProps) {
  const { t } = useTranslation();
  const [openRole, setOpenRole] = useState<number | null>(null);

  return (
    <div
      ref={sectionRef}
      className="w-full relative overflow-hidden"
      style={{ backgroundColor: '#1a2028' }}
    >
      <style>{`
        @keyframes rolesShimmer { 0%, 100% { opacity: 0.05; } 50% { opacity: 0.10; } }
        @keyframes glimmer {
          0%   { background-position: -250% center; }
          55%  { background-position: 250% center; }
          100% { background-position: 250% center; }
        }
        .glimmer-text {
          background: linear-gradient(
            105deg,
            rgba(255,255,255,0.72) 0%,
            rgba(255,255,255,0.72) 38%,
            rgba(255,255,255,1)    48%,
            rgba(255,255,255,0.98) 52%,
            rgba(255,255,255,0.72) 62%,
            rgba(255,255,255,0.72) 100%
          );
          background-size: 250% auto;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          animation: glimmer 5s ease-in-out infinite;
          animation-delay: 0.8s;
        }
      `}</style>

      {/* Depth gradient */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'linear-gradient(118deg, rgba(51,64,74,0.55) 0%, rgba(51,64,74,0.22) 35%, transparent 65%)' }}
      />
      {/* Shimmer */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'linear-gradient(132deg, rgba(255,255,255,0.04) 0%, transparent 50%)',
          animation: 'rolesShimmer 12s ease-in-out infinite',
        }}
      />
      {/* Grain */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          opacity: 0.35,
          mixBlendMode: 'overlay' as const,
        }}
      />

      <div className="relative px-6 md:px-20 lg:px-28 py-20 md:py-32 lg:py-44">

        {/* Section header */}
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 mb-10 md:mb-16">
          <div>
            <p
              style={{
                fontFamily: 'Geist, sans-serif',
                fontSize: '9px',
                letterSpacing: '0.28em',
                color: 'rgba(255,255,255,0.28)',
                textTransform: 'uppercase',
                marginBottom: '12px',
              }}
            >
              {t('careers_open_eyebrow')}
            </p>
            <h2
              className="glimmer-text"
              style={{
                fontFamily: 'Marcellus, serif',
                fontSize: 'clamp(28px, 3.6vw, 52px)',
                letterSpacing: '-0.03em',
                lineHeight: 1.05,
                margin: 0,
              }}
            >
              {t('careers_roles_available', { count: OPEN_ROLES.length })}
            </h2>
          </div>
          <p
            style={{
              fontFamily: 'Geist, sans-serif',
              fontSize: '11px',
              letterSpacing: '0.03em',
              color: 'rgba(255,255,255,0.28)',
              maxWidth: '300px',
              lineHeight: 1.8,
            }}
          >
            We take on a select number of people each year. Every applicant is reviewed personally.
          </p>
        </div>

        {/* Roles list */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          {OPEN_ROLES.map((role, i) => {
            const isOpen = openRole === i;
            return (
              <div key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>

                {/* Row trigger */}
                <button
                  onClick={() => setOpenRole(isOpen ? null : i)}
                  className="w-full flex items-center justify-between cursor-pointer"
                  style={{ background: 'none', border: 'none', outline: 'none', padding: '36px 0' }}
                >
                  <div className="flex items-center gap-5 md:gap-8 flex-1 min-w-0">
                    {/* Ghost number */}
                    <span
                      style={{
                        fontFamily: 'Marcellus, serif',
                        fontSize: 'clamp(28px, 3.5vw, 48px)',
                        color: isOpen ? 'rgba(255,255,255,0.13)' : 'rgba(255,255,255,0.05)',
                        lineHeight: 1,
                        flexShrink: 0,
                        transition: 'color 0.4s ease',
                        letterSpacing: '-0.03em',
                        width: 'clamp(28px, 3.5vw, 48px)',
                        textAlign: 'left',
                        userSelect: 'none',
                      }}
                    >
                      {String(i + 1).padStart(2, '0')}
                    </span>

                    {/* Title + meta */}
                    <div className="text-left min-w-0">
                      <p
                        style={{
                          fontFamily: 'Marcellus, serif',
                          fontSize: 'clamp(16px, 1.8vw, 26px)',
                          color: isOpen ? 'rgba(255,255,255,1)' : 'rgba(255,255,255,0.75)',
                          letterSpacing: '-0.01em',
                          lineHeight: 1.1,
                          marginBottom: '6px',
                          transition: 'color 0.3s ease',
                        }}
                      >
                        {t(role.titleKey)}
                      </p>
                      <p
                        style={{
                          fontFamily: 'Geist, sans-serif',
                          fontSize: '10px',
                          letterSpacing: '0.18em',
                          textTransform: 'uppercase',
                          color: 'rgba(255,255,255,0.30)',
                        }}
                      >
                        {t(role.deptKey)} &nbsp;·&nbsp; {t(role.locationKey)} &nbsp;·&nbsp; {t(role.typeKey)}
                      </p>
                    </div>
                  </div>

                  {/* Toggle icon */}
                  <div
                    style={{
                      width: '30px',
                      height: '30px',
                      border: '1px solid',
                      borderColor: isOpen ? 'rgba(255,255,255,0.40)' : 'rgba(255,255,255,0.15)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: isOpen ? 'rgba(255,255,255,0.90)' : 'rgba(255,255,255,0.35)',
                      transition: 'color 0.3s ease, transform 0.4s ease, border-color 0.3s ease',
                      transform: isOpen ? 'rotate(45deg)' : 'rotate(0deg)',
                      fontSize: '16px',
                      fontWeight: 300,
                      flexShrink: 0,
                      marginLeft: '20px',
                    }}
                  >
                    +
                  </div>
                </button>

                {/* Expanded panel */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateRows: isOpen ? '1fr' : '0fr',
                    transition: 'grid-template-rows 0.42s cubic-bezier(0.4,0,0.2,1)',
                  }}
                >
                  <div style={{ overflow: 'hidden', minHeight: 0 }}>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 pb-10"
                      style={{ paddingLeft: 'calc(clamp(28px,3.5vw,48px) + clamp(24px,2rem,32px))' }}
                    >
                      {/* Experience */}
                      <div>
                        <p
                          style={{
                            fontFamily: 'Geist, sans-serif',
                            fontSize: '9px',
                            letterSpacing: '0.24em',
                            textTransform: 'uppercase',
                            color: 'rgba(255,255,255,0.28)',
                            marginBottom: '12px',
                          }}
                        >
                          {t('careers_label_experience')}
                        </p>
                        <p
                          style={{
                            fontFamily: 'Geist, sans-serif',
                            fontSize: '13px',
                            lineHeight: 1.9,
                            color: 'rgba(255,255,255,0.68)',
                            letterSpacing: '0.02em',
                          }}
                        >
                          {t(role.expKey)}
                        </p>
                      </div>

                      {/* Requirements */}
                      <div>
                        <p
                          style={{
                            fontFamily: 'Geist, sans-serif',
                            fontSize: '9px',
                            letterSpacing: '0.24em',
                            textTransform: 'uppercase',
                            color: 'rgba(255,255,255,0.28)',
                            marginBottom: '12px',
                          }}
                        >
                          {t('careers_label_requirements')}
                        </p>
                        <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                          {role.reqKeys.map((reqKey) => (
                            <li key={reqKey} style={{ marginBottom: '8px' }}>
                              <span
                                style={{
                                  fontFamily: 'Geist, sans-serif',
                                  fontSize: '13px',
                                  lineHeight: 1.75,
                                  color: 'rgba(255,255,255,0.68)',
                                  letterSpacing: '0.01em',
                                }}
                              >
                                {t(reqKey)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* Apply button — spans full width below */}
                      <div className="lg:col-span-2 pt-2">
                        <button
                          onClick={() => onApply(role.titleKey)}
                          className="inline-flex items-center gap-3 cursor-pointer whitespace-nowrap"
                          style={{
                            fontFamily: 'Geist, sans-serif',
                            fontSize: '10px',
                            letterSpacing: '0.20em',
                            textTransform: 'uppercase',
                            color: 'rgba(255,255,255,0.80)',
                            border: '1px solid rgba(255,255,255,0.20)',
                            padding: '14px 36px',
                            background: 'rgba(255,255,255,0.05)',
                            transition: 'border-color 0.25s ease, color 0.25s ease, background 0.25s ease',
                          }}
                          onMouseEnter={e => {
                            const b = e.currentTarget as HTMLButtonElement;
                            b.style.borderColor = 'rgba(255,255,255,0.50)';
                            b.style.color = 'rgba(255,255,255,1)';
                            b.style.background = 'rgba(255,255,255,0.12)';
                          }}
                          onMouseLeave={e => {
                            const b = e.currentTarget as HTMLButtonElement;
                            b.style.borderColor = 'rgba(255,255,255,0.20)';
                            b.style.color = 'rgba(255,255,255,0.80)';
                            b.style.background = 'rgba(255,255,255,0.05)';
                          }}
                        >
                          {t('careers_apply_btn')}
                          <i className="ri-arrow-right-line" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
