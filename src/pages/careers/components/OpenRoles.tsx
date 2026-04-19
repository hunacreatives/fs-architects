import { useState } from 'react';
import { useTranslation } from 'react-i18next';

export const OPEN_ROLES = [
  {
    titleKey: 'careers_role_arch_title',
    typeKey: 'careers_role_arch_type',
    locationKey: 'careers_role_arch_location',
    deptKey: 'careers_role_arch_dept',
    expKey: 'careers_role_arch_exp',
    responsibilitiesKey: 'careers_role_arch_responsibilities',
    requirementsKey: 'careers_role_arch_requirements',
  },
  {
    titleKey: 'careers_role_apprent_title',
    typeKey: 'careers_role_apprent_type',
    locationKey: 'careers_role_apprent_location',
    deptKey: 'careers_role_apprent_dept',
    expKey: 'careers_role_apprent_exp',
    responsibilitiesKey: 'careers_role_apprent_responsibilities',
    requirementsKey: 'careers_role_apprent_requirements',
  },
];

interface OpenRolesProps {
  onApply: (titleKey: string) => void;
  sectionRef?: React.RefObject<HTMLDivElement>;
}

function BulletList({ text }: { text: string }) {
  const items = text.split(' · ').map(s => s.trim()).filter(Boolean);
  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {items.map((item, i) => (
        <li key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
          <span style={{ color: 'rgba(0,0,0,0.20)', flexShrink: 0, marginTop: '2px' }}>—</span>
          <span style={{ fontFamily: 'Geist, sans-serif', fontSize: '12px', lineHeight: 1.75, color: 'rgba(0,0,0,0.48)', letterSpacing: '0.01em' }}>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export default function OpenRoles({ onApply, sectionRef }: OpenRolesProps) {
  const { t } = useTranslation();
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggle = (i: number) => setOpenIndex(prev => (prev === i ? null : i));

  return (
    <>
      <style>{`
        .role-drawer {
          display: grid;
          grid-template-rows: 0fr;
          transition: grid-template-rows 0.38s cubic-bezier(0.22,1,0.36,1);
          overflow: hidden;
        }
        .role-drawer.open {
          grid-template-rows: 1fr;
        }
        .role-drawer-inner {
          min-height: 0;
          overflow: hidden;
        }
      `}</style>

      <div ref={sectionRef} className="w-full px-6 md:px-20 lg:px-28 mb-20">
        {/* Header */}
        <p style={{ fontFamily: 'Marcellus, serif', fontSize: 'clamp(20px, 2vw, 28px)', letterSpacing: '-0.02em', color: 'rgba(0,0,0,0.82)', marginBottom: '32px', lineHeight: 1.15 }}>
          {OPEN_ROLES.length} Open Positions
        </p>

        {/* Roles list */}
        <div style={{ borderTop: '1px solid rgba(0,0,0,0.08)' }}>
          {OPEN_ROLES.map((role, i) => {
            const isOpen = openIndex === i;
            return (
              <div key={i} style={{ borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
                {/* Row — clickable */}
                <button
                  onClick={() => toggle(i)}
                  className="w-full flex items-center justify-between gap-6 cursor-pointer group"
                  style={{ background: 'none', border: 'none', outline: 'none', padding: '28px 0', textAlign: 'left' }}
                >
                  {/* Number */}
                  <span style={{ fontFamily: 'Geist, sans-serif', fontSize: '11px', color: 'rgba(0,0,0,0.25)', letterSpacing: '0.08em', flexShrink: 0, width: '24px' }}>
                    {String(i + 1).padStart(2, '0')}
                  </span>

                  {/* Title + meta */}
                  <div className="flex-1 min-w-0">
                    <p style={{ fontFamily: 'Marcellus, serif', fontSize: 'clamp(16px, 1.6vw, 22px)', color: 'rgba(0,0,0,0.85)', letterSpacing: '-0.01em', marginBottom: '6px', lineHeight: 1.15 }}>
                      {t(role.titleKey)}
                    </p>
                    <div className="flex flex-wrap gap-x-3 gap-y-1">
                      {[`${t(role.locationKey)}, PH`, t(role.typeKey), t(role.deptKey)].map((tag, ti) => (
                        <span key={ti} style={{ fontFamily: 'Geist, sans-serif', fontSize: '9px', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.30)' }}>
                          {tag}{ti < 2 ? <>&nbsp;&nbsp;·</> : null}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Toggle icon */}
                  <div style={{
                    width: '32px', height: '32px', borderRadius: '50%',
                    border: '1px solid rgba(0,0,0,0.14)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                    transition: 'transform 0.32s cubic-bezier(0.22,1,0.36,1), background 0.2s ease',
                    transform: isOpen ? 'rotate(45deg)' : 'rotate(0deg)',
                    background: isOpen ? 'rgba(0,0,0,0.06)' : 'transparent',
                  }}>
                    <i className="ri-add-line" style={{ fontSize: '14px', color: 'rgba(0,0,0,0.45)' }} />
                  </div>
                </button>

                {/* Drawer */}
                <div className={`role-drawer${isOpen ? ' open' : ''}`}>
                  <div className="role-drawer-inner">
                    <div style={{ paddingBottom: '32px', paddingLeft: '36px' }}>
                      {/* Description */}
                      <p style={{ fontFamily: 'Geist, sans-serif', fontSize: '12px', lineHeight: 1.9, color: 'rgba(0,0,0,0.45)', letterSpacing: '0.01em', maxWidth: '600px', marginBottom: '32px' }}>
                        {t(role.expKey)}
                      </p>

                      {/* Two-column detail grid */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8" style={{ maxWidth: '720px' }}>
                        <div>
                          <p style={{ fontFamily: 'Geist, sans-serif', fontSize: '9px', letterSpacing: '0.24em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.28)', marginBottom: '14px' }}>
                            Responsibilities
                          </p>
                          <BulletList text={t(role.responsibilitiesKey)} />
                        </div>
                        <div>
                          <p style={{ fontFamily: 'Geist, sans-serif', fontSize: '9px', letterSpacing: '0.24em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.28)', marginBottom: '14px' }}>
                            What We're Looking For
                          </p>
                          <BulletList text={t(role.requirementsKey)} />
                        </div>
                      </div>

                      {/* Apply */}
                      <button
                        onClick={(e) => { e.stopPropagation(); onApply(role.titleKey); }}
                        className="flex items-center gap-2 group cursor-pointer"
                        style={{ background: 'none', border: 'none', outline: 'none', padding: 0 }}
                      >
                        <span
                          className="group-hover:text-black"
                          style={{ fontFamily: 'Geist, sans-serif', fontSize: '10px', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.40)', transition: 'color 0.2s ease' }}
                        >
                          Apply for this role
                        </span>
                        <div
                          className="group-hover:bg-black group-hover:border-black transition-all duration-200"
                          style={{ width: '28px', height: '28px', borderRadius: '50%', border: '1px solid rgba(0,0,0,0.20)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                          <i className="ri-arrow-right-up-line text-xs group-hover:text-white transition-colors duration-200" style={{ color: 'rgba(0,0,0,0.50)' }} />
                        </div>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
