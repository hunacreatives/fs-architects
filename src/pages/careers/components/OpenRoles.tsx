import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useJobPosts } from '@/lib/site/content';


interface OpenRolesProps {
  onApply: (title: string) => void;
  sectionRef?: React.RefObject<HTMLDivElement>;
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {items.map((item, i) => (
        <li key={i} style={{ display: 'flex', gap: '10px', alignItems: 'baseline' }}>
          <span style={{ color: 'rgba(0,0,0,0.35)', flexShrink: 0, fontSize: '14px', lineHeight: 1 }}>•</span>
          <span style={{ fontFamily: 'Geist, sans-serif', fontSize: '12px', lineHeight: 1.75, color: 'rgba(0,0,0,0.48)', letterSpacing: '0.01em' }}>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export default function OpenRoles({ onApply, sectionRef }: OpenRolesProps) {
  const { t } = useTranslation();
  const roles = useJobPosts();
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

      <div ref={sectionRef} className="w-full px-4 md:px-16 lg:px-24 mb-20">
        {/* Header */}
        <p style={{ fontFamily: 'Marcellus, serif', fontSize: 'clamp(20px, 2vw, 28px)', letterSpacing: '-0.02em', color: 'rgba(0,0,0,0.82)', marginBottom: '32px', lineHeight: 1.15 }}>
          {roles.length} {t('careers_open_positions')}
        </p>

        {/* Roles list */}
        <div style={{ borderTop: '1px solid rgba(0,0,0,0.08)' }}>
          {roles.map((role, i) => {
            const isOpen = openIndex === i;
            return (
              <div key={role.id} style={{ borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
                {/* Row — clickable */}
                <button
                  onClick={() => toggle(i)}
                  className="w-full flex items-center justify-between gap-6 cursor-pointer group"
                  style={{ background: 'none', border: 'none', outline: 'none', padding: '28px 0', textAlign: 'left' }}
                >
                  {/* Number */}
                  <span style={{ fontFamily: 'Geist, sans-serif', fontSize: '11px', color: 'rgba(0,0,0,0.25)', letterSpacing: '0.08em', flexShrink: 0, width: '24px' }}>
                    {i + 1}
                  </span>

                  {/* Title + meta */}
                  <div className="flex-1 min-w-0">
                    <p style={{ fontFamily: 'Marcellus, serif', fontSize: 'clamp(16px, 1.6vw, 22px)', color: 'rgba(0,0,0,0.85)', letterSpacing: '-0.01em', marginBottom: '6px', lineHeight: 1.15 }}>
                      {role.title}
                    </p>
                    <div className="flex flex-wrap gap-x-3 gap-y-1">
                      {[`${role.location}, PH`, role.type, role.department].filter(Boolean).map((tag, ti, tags) => (
                        <span key={ti} style={{ fontFamily: 'Geist, sans-serif', fontSize: '9px', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.30)' }}>
                          {tag}{ti < tags.length - 1 ? <>&nbsp;&nbsp;·</> : null}
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
                    <div className="pl-0 md:pl-9" style={{ paddingBottom: '32px' }}>
                      {/* Description */}
                      <p style={{ fontFamily: 'Geist, sans-serif', fontSize: '12px', lineHeight: 1.9, color: 'rgba(0,0,0,0.45)', letterSpacing: '0.01em', maxWidth: '600px', marginBottom: '32px' }}>
                        {role.summary}
                      </p>

                      {/* Two-column detail grid */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8" style={{ maxWidth: '720px' }}>
                        <div>
                          <p style={{ fontFamily: 'Geist, sans-serif', fontSize: '9px', letterSpacing: '0.24em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.28)', marginBottom: '14px' }}>
                            {t('careers_responsibilities')}
                          </p>
                          <BulletList items={role.responsibilities} />
                        </div>
                        <div>
                          <p style={{ fontFamily: 'Geist, sans-serif', fontSize: '9px', letterSpacing: '0.24em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.28)', marginBottom: '14px' }}>
                            {t('careers_looking_for')}
                          </p>
                          <BulletList items={role.requirements} />
                        </div>
                      </div>

                      {/* Apply */}
                      <button
                        onClick={(e) => { e.stopPropagation(); onApply(role.title); }}
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
