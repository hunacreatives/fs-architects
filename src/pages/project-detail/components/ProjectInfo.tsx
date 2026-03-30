interface ProjectInfoProps {
  name: string;
  address: string;
  year: string;
  description: string;
  mainImage: string;
  galleryImages: string[];
}

export default function ProjectInfo({
  name,
  address,
  year,
  description,
  mainImage,
  galleryImages,
}: ProjectInfoProps) {
  return (
    <section className="px-4 md:px-16 lg:px-24 py-12 md:py-20">
      {/* Top row: large image left, text right */}
      <div className="flex flex-col lg:flex-row gap-8 lg:gap-16 mb-8 md:mb-12">

        {/* Main image */}
        <div className="w-full lg:w-[55%] flex-shrink-0">
          <div className="w-full h-[220px] sm:h-[320px] md:h-[420px] overflow-hidden bg-gray-100">
            <img
              src={mainImage}
              alt={name}
              className="w-full h-full object-cover object-top"
            />
          </div>
        </div>

        {/* Project details */}
        <div className="flex flex-col justify-end lg:w-[45%]">
          <h2
            className="text-xl md:text-2xl font-light text-black mb-1 text-left lg:text-right [text-wrap:pretty]"
            style={{ fontFamily: 'Marcellus, serif' }}
          >
            {name}
          </h2>
          <p
            className="text-xs text-black/50 text-left lg:text-right mb-1 tracking-wide"
            style={{ fontFamily: 'Geist, sans-serif', letterSpacing: '0.04em' }}
          >
            {address}
          </p>
          <p
            className="text-xs text-black/40 text-left lg:text-right mb-6 md:mb-8 tracking-wide"
            style={{ fontFamily: 'Geist, sans-serif', letterSpacing: '0.04em' }}
          >
            {year}
          </p>
          <p
            className="text-xs text-black/65 leading-relaxed text-left [text-wrap:pretty]"
            style={{ fontFamily: 'Geist, sans-serif', letterSpacing: '0.02em', lineHeight: '1.9' }}
          >
            {description}
          </p>
        </div>
      </div>

      {/* Gallery thumbnails — horizontal scroll */}
      <div className="relative">
        <div className="flex gap-2 md:gap-3 overflow-x-auto scrollbar-hide pb-1">
          {galleryImages.map((img, i) => (
            <div
              key={i}
              className="flex-shrink-0 w-[42vw] sm:w-[28vw] md:w-[18%] md:min-w-[140px] h-20 md:h-24 overflow-hidden bg-gray-100 cursor-pointer group"
            >
              <img
                src={img}
                alt={`Gallery ${i + 1}`}
                className="w-full h-full object-cover object-top transition-transform duration-500 group-hover:scale-105"
              />
            </div>
          ))}
        </div>
        {/* Scroll hint fade */}
        <div className="absolute top-0 right-0 h-full w-12 bg-gradient-to-l from-white to-transparent pointer-events-none md:hidden" />
      </div>
    </section>
  );
}
