import { useTranslation } from 'react-i18next';

export const OPEN_ROLES = [
  {
    titleKey: 'careers_role_arch_title',
    typeKey: 'careers_role_arch_type',
    locationKey: 'careers_role_arch_location',
    deptKey: 'careers_role_arch_dept',
    expKey: 'careers_role_arch_exp',
  },
  {
    titleKey: 'careers_role_apprent_title',
    typeKey: 'careers_role_apprent_type',
    locationKey: 'careers_role_apprent_location',
    deptKey: 'careers_role_apprent_dept',
    expKey: 'careers_role_apprent_exp',
  },
];

interface OpenRolesProps {
  onApply: (titleKey: string) => void;
  sectionRef?: React.RefObject<HTMLDivElement>;
}

export default function OpenRoles({ onApply, sectionRef }: OpenRolesProps) {
  const { t } = useTranslation();

  return (
    <div ref={sectionRef} className="w-full px-6 md:px-20 lg:px-28 mb-20">
      {/* Section label */}
      <p style={{ fontFamily: 'Geist, sans-serif', fontSize: '9px', letterSpacing: '0.28em', color: 'rgba(0,0,0,0.28)', textTransform: 'uppercase', marginBottom: '24px' }}>
        {t('careers_open_eyebrow')}
      </p>

      {/* Roles list */}
      <div style={{ borderTop: '1px solid rgba(0,0,0,0.08)' }}>
        {OPEN_ROLES.map((role, i) => (
          <div
            key={i}
            className="flex items-center justify-between gap-6 py-6 md:py-8"
            style={{ borderBottom: '1px solid rgba(0,0,0,0.08)' }}
          >
            {/* Number */}
            <span style={{ fontFamily: 'Geist, sans-serif', fontSize: '11px', color: 'rgba(0,0,0,0.25)', letterSpacing: '0.08em', flexShrink: 0, width: '24px' }}>
              {String(i + 1).padStart(2, '0')}
            </span>

            {/* Title + meta */}
            <div className="flex-1 min-w-0">
              <p style={{ fontFamily: 'Marcellus, serif', fontSize: 'clamp(16px, 1.6vw, 22px)', color: 'rgba(0,0,0,0.85)', letterSpacing: '-0.01em', marginBottom: '4px', lineHeight: 1.15 }}>
                {t(role.titleKey)}
              </p>
              <p style={{ fontFamily: 'Geist, sans-serif', fontSize: '10px', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.30)' }}>
                {t(role.locationKey)}, PH &nbsp;·&nbsp; {t(role.typeKey)}
              </p>
            </div>

            {/* Apply button */}
            <button
              onClick={() => onApply(role.titleKey)}
              className="flex items-center gap-2 flex-shrink-0 cursor-pointer group"
              style={{ background: 'none', border: 'none', outline: 'none', padding: 0 }}
            >
              <span style={{ fontFamily: 'Geist, sans-serif', fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.40)' }}
                className="hidden md:inline group-hover:text-black transition-colors duration-200"
              >
                Apply
              </span>
              <div
                className="group-hover:bg-black group-hover:border-black transition-all duration-200"
                style={{ width: '32px', height: '32px', borderRadius: '50%', border: '1px solid rgba(0,0,0,0.20)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(0,0,0,0.50)' }}
              >
                <i className="ri-arrow-right-up-line text-sm group-hover:text-white transition-colors duration-200" />
              </div>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
