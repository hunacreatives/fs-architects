import { useEffect, useRef } from 'react';

interface FloorPlan {
  label: string;
  image: string;
}

interface ProjectInfoProps {
  name: string;
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
  description,
  mainImage,
  galleryImages,
  plans = [],
}: ProjectInfoProps) {
  const openerRef = useReveal(0.04);
  const imagesRef = useReveal(0.03);
  const plansRef  = useReveal(0.05);

  const imgs = [mainImage, ...galleryImages];
  const g = (i: number) => imgs[i % imgs.length];

  const sentences = description.split(/(?<=[.!?])\s+/).filter(Boolean);
  const paragraphs: string[] = [];
  for (let i = 0; i < sentences.length; i += 2) {
    paragraphs.push(sentences.slice(i, i + 2).join(' '));
  }
  const allParagraphs = [
    ...paragraphs,
    ...EXTRA_PARAGRAPHS.slice(0, Math.max(0, 5 - paragraphs.length)),
  ];

  return (
    <>
      <style>{`
        .mag-reveal {
          opacity: 0;
          transform: translateY(24px);
          transition: opacity 1s cubic-bezier(0.22,1,0.36,1), transform 1s cubic-bezier(0.22,1,0.36,1);
        }
        .mag-revealed .mag-reveal { opacity: 1; transform: translateY(0); }

        .mag-img {
          overflow: hidden;
          background: #eceae6;
        }
        .mag-img img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: center;
          display: block;
          transition: transform 1s cubic-bezier(0.22,1,0.36,1);
        }
        .mag-img:hover img { transform: scale(1.03); }
      `}</style>

      {/* ── DESCRIPTION ─────────────────────────────────────────────────── */}
      <div
        ref={openerRef}
        className="px-6 md:px-16 lg:px-24 pt-14 md:pt-20 pb-24 md:pb-36"
      >
          <div className="mx-auto" style={{ maxWidth: '840px' }}>
            {/* Intro paragraph — large editorial */}
            {allParagraphs[0] && (
              <p
                className="mag-reveal"
                style={{
                  fontFamily: 'Marcellus, serif',
                  fontSize: 'clamp(17px, 1.8vw, 23px)',
                  lineHeight: 1.75,
                  color: 'rgba(0,0,0,0.80)',
                  letterSpacing: '-0.01em',
                  textAlign: 'justify',
                  marginBottom: 'clamp(28px, 4vw, 56px)',
                  transitionDelay: '0.15s',
                }}
              >
                {allParagraphs[0]}
              </p>
            )}

            {/* Body paragraphs — two columns */}
            <div
              className="grid grid-cols-1 md:grid-cols-2"
              style={{ gap: 'clamp(18px, 2.5vw, 40px) clamp(28px, 5vw, 72px)' }}
            >
              {allParagraphs.slice(1).map((para, i) => (
                <p
                  key={i}
                  className="mag-reveal"
                  style={{
                    fontFamily: 'Geist, sans-serif',
                    fontSize: 'clamp(13px, 1vw, 14px)',
                    lineHeight: 2.1,
                    color: 'rgba(0,0,0,0.48)',
                    letterSpacing: '0.01em',
                    textAlign: 'justify',
                    transitionDelay: `${0.2 + i * 0.07}s`,
                  }}
                >
                  {para}
                </p>
              ))}
            </div>
          </div>
      </div>

      {/* ── IMAGE SPREADS ───────────────────────────────────────────────── */}
      <div ref={imagesRef}>

        {/* Row 1 — portrait left (tall) + landscape right (shorter) */}
        <div className="flex flex-col md:flex-row" style={{ gap: '3px' }}>
          <div
            className="mag-reveal mag-img w-full md:w-[38%]"
            style={{ height: 'clamp(320px, 52vw, 760px)', transitionDelay: '0s' }}
          >
            <img src={g(0)} alt={name} style={{ objectPosition: 'center' }} />
          </div>
          <div
            className="mag-reveal mag-img w-full md:w-[60%]"
            style={{ height: 'clamp(220px, 34vw, 500px)', alignSelf: 'flex-end', transitionDelay: '0.08s' }}
          >
            <img src={g(1)} alt={`${name} — view`} />
          </div>
        </div>

        {/* Row 2 — full bleed wide */}
        <div
          className="mag-reveal mag-img w-full"
          style={{ height: 'clamp(300px, 46vw, 680px)', marginTop: '3px' }}
        >
          <img src={g(2)} alt={`${name} — exterior`} style={{ objectPosition: 'top' }} />
        </div>

        {/* Row 3 — three unequal columns: narrow | wide | narrow-tall */}
        <div className="flex flex-col sm:flex-row" style={{ gap: '3px', marginTop: '3px' }}>
          <div
            className="mag-reveal mag-img w-full sm:w-[24%]"
            style={{ height: 'clamp(200px, 34vw, 480px)', transitionDelay: '0s' }}
          >
            <img src={g(3)} alt={`${name} — detail`} />
          </div>
          <div
            className="mag-reveal mag-img w-full sm:w-[48%]"
            style={{ height: 'clamp(180px, 26vw, 380px)', alignSelf: 'flex-end', transitionDelay: '0.07s' }}
          >
            <img src={g(4)} alt={`${name} — interior`} />
          </div>
          <div
            className="mag-reveal mag-img w-full sm:w-[26%]"
            style={{ height: 'clamp(200px, 30vw, 440px)', transitionDelay: '0.14s' }}
          >
            <img src={g(5)} alt={`${name} — material`} />
          </div>
        </div>

        {/* Pull quote */}
        <div className="px-6 md:px-20 lg:px-36 py-20 md:py-28 flex flex-col items-center text-center">
          <div style={{ width: '1px', height: '48px', backgroundColor: 'rgba(0,0,0,0.12)', marginBottom: '28px' }} />
          <p
            className="mag-reveal"
            style={{
              fontFamily: 'Marcellus, serif',
              fontSize: 'clamp(17px, 2vw, 27px)',
              color: 'rgba(0,0,0,0.60)',
              lineHeight: 1.7,
              letterSpacing: '-0.01em',
              maxWidth: '640px',
            }}
          >
            "Architecture is not about form — it is the way a building responds to its context, its light, and the lives of the people who inhabit it."
          </p>
        </div>

        {/* Row 4 — landscape left (dominant) + portrait right (tall, crops up) */}
        <div className="flex flex-col md:flex-row" style={{ gap: '3px' }}>
          <div
            className="mag-reveal mag-img w-full md:w-[65%]"
            style={{ height: 'clamp(260px, 38vw, 560px)', transitionDelay: '0s' }}
          >
            <img src={g(6 % imgs.length)} alt={`${name} — overview`} />
          </div>
          <div
            className="mag-reveal mag-img w-full md:w-[33%]"
            style={{ height: 'clamp(300px, 46vw, 660px)', transitionDelay: '0.1s' }}
          >
            <img src={g(0)} alt={`${name} — facade`} />
          </div>
        </div>

      </div>

      {/* ── FLOOR PLANS ─────────────────────────────────────────────────── */}
      {plans.length > 0 && (
        <div
          ref={plansRef}
          className="px-6 md:px-16 lg:px-24 pt-20 md:pt-28 pb-20 md:pb-28 border-t"
          style={{ borderColor: 'rgba(0,0,0,0.06)' }}
        >
          <p
            className="mag-reveal mb-12 md:mb-16"
            style={{
              fontFamily: 'Geist, sans-serif',
              fontSize: '8px',
              letterSpacing: '0.28em',
              textTransform: 'uppercase',
              color: 'rgba(0,0,0,0.25)',
            }}
          >
            Floor Plans
          </p>

          <div
            className="grid gap-4 md:gap-8"
            style={{ gridTemplateColumns: `repeat(${Math.min(plans.length, 3)}, 1fr)` }}
          >
            {plans.map((plan, i) => (
              <div
                key={i}
                className="mag-reveal flex flex-col gap-4"
                style={{ transitionDelay: `${i * 0.1}s` }}
              >
                <div
                  className="w-full mag-img"
                  style={{
                    height: 'clamp(140px, 15vw, 220px)',
                    border: '1px solid rgba(0,0,0,0.05)',
                    background: '#f7f6f4',
                  }}
                >
                  <img
                    src={plan.image}
                    alt={plan.label}
                    style={{
                      objectFit: 'contain',
                      padding: '20px',
                      background: '#f7f6f4',
                    }}
                  />
                </div>
                {plan.label && (
                  <p
                    style={{
                      fontFamily: 'Geist, sans-serif',
                      fontSize: '8px',
                      letterSpacing: '0.18em',
                      textTransform: 'uppercase',
                      color: 'rgba(0,0,0,0.28)',
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
    </>
  );
}
