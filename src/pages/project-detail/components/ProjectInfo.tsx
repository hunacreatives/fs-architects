import { useEffect, useRef } from 'react';

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
  const sectionRef = useRef<HTMLElement>(null);
  const galleryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    const gallery = galleryRef.current;
    if (!section || !gallery) return;

    const obs1 = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          section.classList.add('proj-info-visible');
          obs1.disconnect();
        }
      },
      { threshold: 0.1 }
    );

    const obs2 = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          gallery.classList.add('gallery-visible');
          obs2.disconnect();
        }
      },
      { threshold: 0.12 }
    );

    obs1.observe(section);
    obs2.observe(gallery);
    return () => { obs1.disconnect(); obs2.disconnect(); };
  }, []);

  return (
    <>
      <style>{`
        .proj-info-left {
          opacity: 0;
          transform: translateX(-22px);
          transition: opacity 0.8s cubic-bezier(0.22,1,0.36,1), transform 0.8s cubic-bezier(0.22,1,0.36,1);
        }
        .proj-info-right {
          opacity: 0;
          transform: translateX(22px);
          transition: opacity 0.8s cubic-bezier(0.22,1,0.36,1) 0.12s, transform 0.8s cubic-bezier(0.22,1,0.36,1) 0.12s;
        }
        .proj-info-visible .proj-info-left,
        .proj-info-visible .proj-info-right {
          opacity: 1;
          transform: translateX(0);
        }
        @keyframes galleryItemIn {
          from { opacity: 0; transform: translateY(16px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        .gallery-item { opacity: 0; }
        .gallery-visible .gallery-item {
          animation: galleryItemIn 0.55s cubic-bezier(0.22,1,0.36,1) forwards;
        }
        .gallery-visible .gallery-item:nth-child(1) { animation-delay: 0.00s; }
        .gallery-visible .gallery-item:nth-child(2) { animation-delay: 0.07s; }
        .gallery-visible .gallery-item:nth-child(3) { animation-delay: 0.14s; }
        .gallery-visible .gallery-item:nth-child(4) { animation-delay: 0.21s; }
        .gallery-visible .gallery-item:nth-child(5) { animation-delay: 0.28s; }
      `}</style>
      <section ref={sectionRef} className="px-4 md:px-16 lg:px-24 py-12 md:py-20">
        {/* Top row: large image left, text right */}
        <div className="flex flex-col lg:flex-row gap-8 lg:gap-16 mb-8 md:mb-12">

          {/* Main image */}
          <div className="proj-info-left w-full lg:w-[55%] flex-shrink-0">
            <div className="w-full h-[220px] sm:h-[320px] md:h-[420px] overflow-hidden bg-gray-100">
              <img
                src={mainImage}
                alt={name}
                className="w-full h-full object-cover object-top"
              />
            </div>
          </div>

          {/* Project details */}
          <div className="proj-info-right flex flex-col justify-end lg:w-[45%]">
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

        {/* Gallery thumbnails */}
        <div className="relative" ref={galleryRef}>
          <div className="flex gap-2 md:gap-3 overflow-x-auto scrollbar-hide pb-1">
            {galleryImages.map((img, i) => (
              <div
                key={i}
                className="gallery-item flex-shrink-0 w-[42vw] sm:w-[28vw] md:w-[18%] md:min-w-[140px] h-20 md:h-24 overflow-hidden bg-gray-100 cursor-pointer group"
              >
                <img
                  src={img}
                  alt={`Gallery ${i + 1}`}
                  className="w-full h-full object-cover object-top transition-transform duration-500 group-hover:scale-105"
                />
              </div>
            ))}
          </div>
          <div className="absolute top-0 right-0 h-full w-12 bg-gradient-to-l from-white to-transparent pointer-events-none md:hidden" />
        </div>
      </section>
    </>
  );
}
