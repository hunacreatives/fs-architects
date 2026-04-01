import { useEffect, useRef, useState } from 'react';

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

function useReveal(threshold = 0.08) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add('mag-revealed');
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

const EXTRA_PARAGRAPHS = [
  'The materiality of the project responds to its surroundings through a careful selection of local elements — raw concrete, natural stone, and warm timber — establishing a dialogue between the built structure and the landscape that frames it.',
  'Natural light becomes the primary architectural material. Strategically placed openings filter the changing quality of light throughout the day, transforming the interior atmosphere from the cool clarity of morning to the warm, raking light of late afternoon.',
  'The spatial sequence from threshold to interior unfolds gradually, each transition revealing a new relationship between shelter and openness — between the private world within and the broader landscape it inhabits.',
  'Every surface, joint, and edge has been considered with the same rigour as the overall form. The architecture does not impose itself on the site; instead, it settles quietly, as though it had always been there.',
];

export default function ProjectInfo({
  name,
  address,
  year,
  description,
  mainImage,
  galleryImages,
  plans = [],
}: ProjectInfoProps) {
  const infoRef = useReveal(0.05);
  const imagesRef = useReveal(0.04);
  const plansRef = useReveal(0.06);
  const [activeSection, setActiveSection] = useState<'info' | 'images' | 'plans'>('info');

  const infoAnchorRef = useRef<HTMLDivElement>(null);
  const imagesAnchorRef = useRef<HTMLDivElement>(null);
  const plansAnchorRef = useRef<HTMLDivElement>(null);

  // Track active nav section via scroll
  useEffect(() => {
    const sections: { id: 'info' | 'images' | 'plans'; ref: React.RefObject<HTMLDivElement | null> }[] = [
      { id: 'info', ref: infoAnchorRef },
      { id: 'images', ref: imagesAnchorRef },
      { id: 'plans', ref: plansAnchorRef },
    ];

    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const found = sections.find((s) => s.ref.current === entry.target);
            if (found) setActiveSection(found.id);
          }
        });
      },
      { threshold: 0.25 }
    );

    sections.forEach((s) => { if (s.ref.current) obs.observe(s.ref.current); });
    return () => obs.disconnect();
  }, []);

  const scrollTo = (ref: React.RefObject<HTMLDivElement | null>) => {
    if (ref.current) {
      const top = ref.current.getBoundingClientRect().top + window.scrollY - 80;
      window.scrollTo({ top, behavior: 'smooth' });
    }
  };

  const imgs = [mainImage, ...galleryImages];
  const g = (i: number) => imgs[i % imgs.length];

  // Split description into sentences for paragraph blocks
  const sentences = description
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean);

  // Group into ~2 sentences per paragraph
  const paragraphs: string[] = [];
  for (let i = 0; i < sentences.length; i += 2) {
    paragraphs.push(sentences.slice(i, i + 2).join(' '));
  }
  // Merge with extra paragraphs to reach at least 5 blocks
  const allParagraphs = [
    ...paragraphs,
    ...EXTRA_PARAGRAPHS.slice(0, Math.max(0, 5 - paragraphs.length)),
  ];

  return (
    <>
      <style>{`
        .mag-reveal {
          opacity: 0;
          transform: translateY(20px);
          transition: opacity 0.9s cubic-bezier(0.22,1,0.36,1), transform 0.9s cubic-bezier(0.22,1,0.36,1);
        }
        .mag-revealed .mag-reveal { opacity: 1; transform: translateY(0); }

        .mag-img {
          overflow: hidden;
          background: #f0eeeb;
        }
        .mag-img img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: top;
          display: block;
          transition: transform 0.9s cubic-bezier(0.22,1,0.36,1);
        }
        .mag-img:hover img { transform: scale(1.03); }

        .proj-nav-link {
          font-family: 'Geist', sans-serif;
          font-size: 9px;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: rgba(0,0,0,0.35);
          cursor: pointer;
          transition: color 0.3s;
          padding: 0;
          background: none;
          border: none;
          outline: none;
          white-space: nowrap;
        }
        .proj-nav-link:hover { color: rgba(0,0,0,0.85); }
        .proj-nav-link.active { color: rgba(0,0,0,0.85); }
        .proj-nav-sep {
          color: rgba(0,0,0,0.18);
          font-family: 'Geist', sans-serif;
          font-size: 9px;
          letter-spacing: 0;
          user-select: none;
        }
      `}</style>

      {/* ── SECTION NAV: INFO | IMAGES | PLANS ─────────────────────────── */}
      <div
        className="sticky z-30 border-b"
        style={{ top: '57px', backgroundColor: 'white', borderColor: 'rgba(0,0,0,0.07)' }}
      >
        <div
          className="px-6 md:px-12 lg:px-16 flex items-center gap-4"
          style={{ height: '44px' }}
        >
          <button
            className={`proj-nav-link${activeSection === 'info' ? ' active' : ''}`}
            onClick={() => scrollTo(infoAnchorRef)}
          >
            Info
          </button>
          <span className="proj-nav-sep">|</span>
          <button
            className={`proj-nav-link${activeSection === 'images' ? ' active' : ''}`}
            onClick={() => scrollTo(imagesAnchorRef)}
          >
            Images
          </button>
          <span className="proj-nav-sep">|</span>
          <button
            className={`proj-nav-link${activeSection === 'plans' ? ' active' : ''}`}
            onClick={() => scrollTo(plansAnchorRef)}
          >
            Plans
          </button>
        </div>
      </div>

      {/* ── INFO SECTION ───────────────────────────────────────────────── */}
      <div ref={infoAnchorRef}>
        <div
          ref={infoRef}
          className="px-6 md:px-12 lg:px-16 pt-16 md:pt-24 pb-20 md:pb-32"
        >
          <div
            className="flex flex-col lg:flex-row lg:items-start"
            style={{ gap: 'clamp(40px, 8vw, 120px)' }}
          >

            {/* ── Left: meta sidebar ── */}
            <div
              className="mag-reveal flex-shrink-0 flex flex-col gap-7"
              style={{ width: 'clamp(160px, 18vw, 220px)' }}
            >
              <div style={{ width: '20px', height: '1px', backgroundColor: 'rgba(0,0,0,0.2)' }} />

              {[
                { label: 'Project', value: name },
                { label: 'Location', value: address },
                { label: 'Year', value: year },
                { label: 'Status', value: 'Completed' },
              ].map((item) => (
                <div key={item.label}>
                  <p
                    className="mb-1.5"
                    style={{ fontFamily: 'Geist, sans-serif', fontSize: '8px', letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.28)' }}
                  >
                    {item.label}
                  </p>
                  <p
                    style={{ fontFamily: 'Geist, sans-serif', fontSize: '12px', color: 'rgba(0,0,0,0.7)', lineHeight: 1.6 }}
                  >
                    {item.value}
                  </p>
                </div>
              ))}
            </div>

            {/* ── Right: two-column editorial text ── */}
            <div className="flex-1" style={{ maxWidth: '860px' }}>
              {/* First paragraph spans full width — large intro statement */}
              {allParagraphs[0] && (
                <p
                  className="mag-reveal"
                  style={{
                    fontFamily: 'Marcellus, serif',
                    fontSize: 'clamp(18px, 2vw, 26px)',
                    lineHeight: 1.65,
                    color: 'rgba(0,0,0,0.82)',
                    letterSpacing: '-0.01em',
                    textAlign: 'justify',
                    marginBottom: 'clamp(28px, 3.5vw, 52px)',
                  }}
                >
                  {allParagraphs[0]}
                </p>
              )}

              {/* Remaining paragraphs in two columns */}
              <div
                className="grid grid-cols-1 md:grid-cols-2"
                style={{ gap: 'clamp(20px, 3vw, 48px) clamp(32px, 5vw, 80px)' }}
              >
                {allParagraphs.slice(1).map((para, i) => (
                  <p
                    key={i}
                    className="mag-reveal"
                    style={{
                      fontFamily: 'Geist, sans-serif',
                      fontSize: 'clamp(13px, 1.05vw, 15px)',
                      lineHeight: 2,
                      color: 'rgba(0,0,0,0.52)',
                      letterSpacing: '0.01em',
                      textAlign: 'justify',
                      transitionDelay: `${(i + 1) * 0.07}s`,
                    }}
                  >
                    {para}
                  </p>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── IMAGES SECTION ─────────────────────────────────────────────── */}
      <div ref={imagesAnchorRef}>
        <div ref={imagesRef}>

          {/* Full bleed image 1 */}
          <div className="mag-reveal mag-img w-full" style={{ height: 'clamp(320px, 52vw, 760px)' }}>
            <img src={g(0)} alt={name} />
          </div>

          {/* Asymmetric split */}
          <div className="flex flex-col md:flex-row" style={{ gap: '3px', marginTop: '3px' }}>
            <div
              className="mag-reveal mag-img"
              style={{ flex: '0 0 62%', height: 'clamp(240px, 36vw, 540px)', transitionDelay: '0s' }}
            >
              <img src={g(1)} alt={`${name} detail`} />
            </div>
            <div
              className="mag-reveal mag-img"
              style={{ flex: '1', height: 'clamp(240px, 36vw, 540px)', transitionDelay: '0.08s' }}
            >
              <img src={g(2)} alt={`${name} detail`} />
            </div>
          </div>

          {/* Pull quote */}
          <div className="px-6 md:px-12 lg:px-16 py-20 md:py-28 flex justify-end">
            <div style={{ maxWidth: '500px' }}>
              <div style={{ width: '1px', height: '52px', backgroundColor: 'rgba(0,0,0,0.13)', marginBottom: '28px' }} />
              <p
                style={{
                  fontFamily: 'Marcellus, serif',
                  fontSize: 'clamp(17px, 1.8vw, 24px)',
                  color: 'rgba(0,0,0,0.68)',
                  lineHeight: 1.6,
                  letterSpacing: '-0.01em',
                }}
              >
                "Architecture is not about form — it is the way a building responds to its context, its light, and the lives of the people who inhabit it."
              </p>
            </div>
          </div>

          {/* Three equal images */}
          <div className="flex flex-col sm:flex-row" style={{ gap: '3px' }}>
            {[g(3), g(4), g(5)].map((src, i) => (
              <div
                key={i}
                className="mag-reveal mag-img"
                style={{ flex: 1, height: 'clamp(200px, 26vw, 400px)', transitionDelay: `${i * 0.08}s` }}
              >
                <img src={src} alt={`${name} ${i + 3}`} />
              </div>
            ))}
          </div>

          {/* Final full bleed */}
          <div
            className="mag-reveal mag-img w-full"
            style={{ height: 'clamp(280px, 45vw, 660px)', marginTop: '3px' }}
          >
            <img src={g(6 % imgs.length)} alt={`${name} overview`} style={{ objectPosition: 'center' }} />
          </div>

        </div>
      </div>

      {/* ── PLANS SECTION ──────────────────────────────────────────────── */}
      <div ref={plansAnchorRef}>
        {plans.length > 0 && (
          <div
            ref={plansRef}
            className="px-6 md:px-12 lg:px-16 pt-20 md:pt-28 pb-20 md:pb-28 border-t"
            style={{ borderColor: 'rgba(0,0,0,0.06)' }}
          >
            <p
              className="mag-reveal mb-10 md:mb-14"
              style={{ fontFamily: 'Geist, sans-serif', fontSize: '9px', letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.28)' }}
            >
              Floor Plans
            </p>
            <div
              className="grid gap-4 md:gap-6"
              style={{ gridTemplateColumns: `repeat(${Math.min(plans.length, 3)}, 1fr)` }}
            >
              {plans.map((plan, i) => (
                <div
                  key={i}
                  className="mag-reveal flex flex-col gap-3"
                  style={{ transitionDelay: `${i * 0.1}s` }}
                >
                  <div
                    className="w-full mag-img"
                    style={{
                      height: 'clamp(150px, 16vw, 240px)',
                      border: '1px solid rgba(0,0,0,0.06)',
                      background: '#f9f8f7',
                    }}
                  >
                    <img
                      src={plan.image}
                      alt={plan.label}
                      style={{ objectFit: 'contain', padding: '16px', background: '#f9f8f7' }}
                    />
                  </div>
                  {plan.label && (
                    <p
                      style={{
                        fontFamily: 'Geist, sans-serif',
                        fontSize: '8px',
                        letterSpacing: '0.16em',
                        textTransform: 'uppercase',
                        color: 'rgba(0,0,0,0.3)',
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
      </div>
    </>
  );
}
