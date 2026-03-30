import { useTranslation } from 'react-i18next';

interface ProjectLocationProps {
  lat: number;
  lng: number;
  name: string;
}

export default function ProjectLocation({ lat, lng, name }: ProjectLocationProps) {
  const { t } = useTranslation();
  const mapSrc = `https://www.google.com/maps/embed?pb=!1m14!1m12!1m3!1d8000!2d${lng}!3d${lat}!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!5e0!3m2!1sen!2s!4v1234567890`;

  return (
    <section className="px-4 md:px-16 lg:px-24 pb-16 md:pb-24">
      <h3
        className="text-xl md:text-2xl font-light text-black mb-4 md:mb-6"
        style={{ fontFamily: 'Marcellus, serif' }}
      >
        {t('detail_location_heading')}
      </h3>
      <div className="w-full h-[220px] sm:h-[300px] md:h-[420px] overflow-hidden">
        <iframe
          src={mapSrc}
          width="100%"
          height="100%"
          style={{ border: 0, filter: 'grayscale(100%)' }}
          allowFullScreen
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          title={`${name} location map`}
        />
      </div>
    </section>
  );
}
