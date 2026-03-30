import { useEffect, useRef, useState, useCallback, useMemo } from 'react';

interface FloorPlan {
  label: string;
  image: string;
}

interface ProjectInfoProps {
  name: string;
  address: string;
  year: string;
  description: string;
  mainImage: string;
  galleryImages: string[];
  plans?: FloorPlan[];
}

export default function ProjectInfo({
  name,
  address,
  year,
  description,
  mainImage,
  galleryImages,
  plans = [],
}: ProjectInfoProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const galleryRef = useRef<HTMLDivElement>(null);
  const activeIndexRef = useRef(0);

  // All images: main first, then gallery
  const allImages = useMemo(() => [mainImage, ...galleryImages], [mainImage, galleryImages]);

  const [activeIndex, setActiveIndex] = useState(0);
  const [fading, setFading] = useState(false);

  const goToIndex = useCallback((i: number) => {
    if (i === activeIndexRef.current) return;
    setFading(true);
    setTimeout(() => {
      setActiveIndex(i);
      activeIndexRef.current = i;
      setFading(false);
    }, 280);
  }, []);

  // Auto-rotate every 8 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      const next = (activeIndexRef.current + 1) % allImages.length;
      goToIndex(next);
    }, 8000);
    return () => clearInterval(interval);
  }, [allImages.length, goToIndex]);

  // Section + gallery reveal
  useEffect(() => {
    const section = sectionRef.current;
    const gallery = galleryRef.current;
    if (!section || !gallery) return;

    const obs1 = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) { section.classList.add('proj-info-visible'); obs1.disconnect(); }
      },
      { threshold: 0.06 }
    );
    const obs2 = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) { gallery.classList.add('gallery-visible'); obs2.disconnect(); }
      },
      { threshold: 0.08 }
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
          transform: translateY(20px);
          transition: opacity 0.75s cubic-bezier(0.22,1,0.36,1), transform 0.75s cubic-bezier(0.22,1,0.36,1);
        }
        .proj-info-right {
          opacity: 0;
          transform: translateY(20px);
          transition: opacity 0.75s cubic-bezier(0.22,1,0.36,1) 0.14s, transform 0.75s cubic-bezier(0.22,1,0.36,1) 0.14s;
        }
        .proj-info-visible .proj-info-left,
        .proj-info-visible .proj-info-right {
          opacity: 1;
          transform: translateY(0);
        }
        @keyframes galleryItemIn {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .gallery-item { opacity: 0; }
        .gallery-visible .gallery-item {
          animation: galleryItemIn 0.50s cubic-bezier(0.22,1,0.36,1) forwards;
        }
        .gallery-visible .gallery-item:nth-child(1) { animation-delay: 0.00s; }
        .gallery-visible .gallery-item:nth-child(2) { animation-delay: 0.05s; }
        .gallery-visible .gallery-item:nth-child(3) { animation-delay: 0.10s; }
        .gallery-visible .gallery-item:nth-child(4) { animation-delay: 0.15s; }
        .gallery-visible .gallery-item:nth-child(5) { animation-delay: 0.20s; }
        .gallery-visible .gallery-item:nth-child(6) { animation-delay: 0.25s; }
      `}</style>

      <section
        ref={sectionRef}
        className="px-4 md:px-16 lg:px-24 pt-14 md:pt-20 pb-10 md:pb-16"
      >
        <div
          className="flex flex-col lg:grid lg:items-start gap-10 lg:gap-14"
          style={{ gridTemplateColumns: '1fr 340px' }}
        >

          {/* ── LEFT — Visual column ── */}
          <div className="proj-info-left flex flex-col gap-3">

            {/* Main display image with crossfade */}
            <div
              className="w-full overflow-hidden bg-stone-100 relative"
              style={{ height: 'clamp(280px, 44vw, 580px)' }}
            >
              <img
                src={allImages[activeIndex]}
                alt={name}
                className="w-full h-full object-cover object-top"
                style={{
                  opacity: fading ? 0 : 1,
                  transition: 'opacity 0.28s ease',
                }}
              />

              {/* Progress bar */}
              <div
                className="absolute bottom-0 left-0 right-0"
                style={{ height: '2px', backgroundColor: 'rgba(0,0,0,0.10)' }}
              >
                <div
                  key={activeIndex}
                  style={{
                    height: '100%',
                    backgroundColor: 'rgba(0,0,0,0.35)',
                    animation: 'imgProgress 8s linear forwards',
                  }}
                />
              </div>
            </div>

            {/* Thumbnail strip — all images */}
            <div
              ref={galleryRef}
              className="grid gap-2"
              style={{ gridTemplateColumns: `repeat(${allImages.length}, 1fr)` }}
            >
              {allImages.map((img, i) => (
                <button
                  key={i}
                  onClick={() => goToIndex(i)}
                  className="gallery-item overflow-hidden bg-stone-100 cursor-pointer group relative p-0 border-0 outline-none"
                  style={{
                    height: 'clamp(56px, 6.5vw, 88px)',
                    flexShrink: 0,
                  }}
                >
                  <img
                    src={img}
                    alt={`View ${i + 1}`}
                    className="w-full h-full object-cover object-top transition-all duration-400"
                    style={{
                      filter: activeIndex === i ? 'brightness(1)' : 'brightness(0.65)',
                      transform: activeIndex === i ? 'scale(1.03)' : 'scale(1)',
                    }}
                  />
                  {/* Active bottom line */}
                  <div
                    className="absolute bottom-0 left-0 right-0 transition-all duration-300"
                    style={{
                      height: '2px',
                      backgroundColor: activeIndex === i ? 'rgba(0,0,0,0.75)' : 'transparent',
                    }}
                  />
                </button>
              ))}
            </div>
          </div>

          {/* ── RIGHT — Info column ── */}
          <div className="proj-info-right flex flex-col gap-7 lg:pt-0">

            {/* Top rule */}
            <div style={{ width: '32px', height: '1px', backgroundColor: 'rgba(0,0,0,0.18)' }} />

            {/* Title */}
            <h2
              style={{
                fontFamily: 'Marcellus, serif',
                fontSize: 'clamp(22px, 2.4vw, 36px)',
                lineHeight: 1.12,
                letterSpacing: '-0.015em',
                color: '#111',
                margin: 0,
              }}
            >
              {name}
            </h2>

            {/* Meta — year only */}
            <div className="flex flex-col gap-1.5">
              <p
                style={{
                  fontFamily: 'Geist, sans-serif',
                  fontSize: '10px',
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color: 'rgba(0,0,0,0.28)',
                  margin: 0,
                }}
              >
                {year}
              </p>
            </div>

            {/* Thin divider */}
            <div style={{ height: '1px', backgroundColor: 'rgba(0,0,0,0.07)', width: '100%' }} />

            {/* Description */}
            <p
              style={{
                fontFamily: 'Geist, sans-serif',
                fontSize: '12px',
                lineHeight: '2',
                letterSpacing: '0.02em',
                color: 'rgba(0,0,0,0.58)',
                margin: 0,
              }}
            >
              {description}
            </p>
          </div>
        </div>

        {/* ── PLANS — full width below both columns ── */}
        {plans.length > 0 && (
          <div className="mt-8 md:mt-10">
            <div className="h-px mb-6" style={{ backgroundColor: 'rgba(0,0,0,0.06)' }} />
            <div
              className="grid gap-4"
              style={{ gridTemplateColumns: `repeat(${plans.length}, 1fr)` }}
            >
              {plans.map((plan, i) => (
                <div key={i} className="flex flex-col gap-2">
                  <div
                    className="w-full overflow-hidden bg-stone-50"
                    style={{ height: 'clamp(130px, 14vw, 200px)', border: '1px solid rgba(0,0,0,0.07)' }}
                  >
                    <img
                      src={plan.image}
                      alt={plan.label}
                      className="w-full h-full object-cover object-top"
                    />
                  </div>
                  {plan.label && (
                    <p
                      style={{
                        fontFamily: 'Geist, sans-serif',
                        fontSize: '9px',
                        letterSpacing: '0.10em',
                        textTransform: 'uppercase',
                        color: 'rgba(0,0,0,0.35)',
                      }}
                    >
                      {plan.label}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <style>{`
          @keyframes imgProgress {
            from { width: 0%; }
            to   { width: 100%; }
          }
        `}</style>
      </section>
    </>
  );
}
