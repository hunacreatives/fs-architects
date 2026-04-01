import { useTranslation } from 'react-i18next';

interface ProjectLocationProps {
  lat: number;
  lng: number;
  name: string;
}

export default function ProjectLocation({ lat, lng, name }: ProjectLocationProps) {
  const { t } = useTranslation();
  const mapSrc = `https://maps.google.com/maps?q=${lat},${lng}&z=16&output=embed`;

  return (
    <section className="pt-0 pb-0">
      {/* Label row */}
      <div className="px-6 md:px-12 lg:px-16 pb-6">
        <p
          style={{
            fontFamily: 'Geist, sans-serif',
            fontSize: '9px',
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            color: 'rgba(0,0,0,0.3)',
          }}
        >
          {t('detail_location_heading')}
        </p>
      </div>

      {/* Full bleed map */}
      <div className="w-full" style={{ height: 'clamp(260px, 36vw, 480px)' }}>
        <iframe
          src={mapSrc}
          width="100%"
          height="100%"
          style={{ border: 0, filter: 'grayscale(100%) contrast(1.05) brightness(0.97)', display: 'block' }}
          allowFullScreen
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          title={`${name} location map`}
        />
      </div>
    </section>
  );
}
