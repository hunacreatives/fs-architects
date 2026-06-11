import { useEffect, useRef, useState } from 'react';

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
  quote?: string;
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
  quote,
}: ProjectInfoProps) {
  const openerRef = useReveal(0.04);
  const imagesRef = useReveal(0.03);
  const plansRef  = useReveal(0.05);

  // Sample evenly: first 12 displayed, extras queue for rotation
  const { initial, extras } = (() => {
    const all = galleryImages.filter(Boolean);
    if (all.length <= 12) return { initial: all, extras: [] };
    const step = all.length / 12;
    const selected = Array.from({ length: 12 }, (_, i) => all[Math.floor(i * step)]);
    const selectedSet = new Set(selected);
    return { initial: selected, extras: all.filter(s => !selectedSet.has(s)) };
  })();

  const [imgs, setImgs] = useState<string[]>(initial);
  const [fadingIdx, setFadingIdx] = useState<number | null>(null);
  const unusedRef = useRef<string[]>(extras);
  const fadingRef = useRef(false);

  useEffect(() => {
    if (unusedRef.current.length === 0) return;
    const interval = setInterval(() => {
      if (fadingRef.current) return;
      fadingRef.current = true;
      const idx = Math.floor(Math.random() * 12);
      // Phase 1: fade out
      setFadingIdx(idx);
      // Phase 2: swap src while still invisible
      setTimeout(() => {
        setImgs(prev => {
          const next = [...prev];
          const outgoing = next[idx];
          const incoming = unusedRef.current.shift()!;
          unusedRef.current.push(outgoing);
          next[idx] = incoming;
          return next;
        });
        // Phase 3: fade in after a tick so the new src renders at opacity 0 first
        setTimeout(() => {
          setFadingIdx(null);
          fadingRef.current = false;
        }, 60);
      }, 700);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

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
      {/* Dynamic spreads — cycles through 6 layout types to show all gallery images */}
      <div ref={imagesRef}>
        {(() => {
          // Build groups carrying original index so fade swaps can target the right slot
          const PATTERN = [2, 1, 3, 2, 3, 2, 1, 3];
          const groups: { src: string; idx: number }[][] = [];
          let i = 0, p = 0;
          while (i < imgs.length) {
            const take = PATTERN[p % PATTERN.length];
            const end = Math.min(i + take, imgs.length);
            const slice = Array.from({ length: end - i }, (_, k) => ({ src: imgs[i + k], idx: i + k }));
            if (slice.length > 0) groups.push(slice);
            i += take;
            p++;
          }

          const quoteAfterGroup = Math.floor(groups.length * 0.45);

          // Helper: fade-aware image wrapper
          const FadeImg = ({ item, className, style }: { item: { src: string; idx: number }; className?: string; style?: React.CSSProperties }) => (
            <div
              className={`mag-reveal mag-img${className ? ' ' + className : ''}`}
              style={{
                ...style,
                position: 'relative',
              }}
            >
              <img
                src={item.src}
                alt={name}
                style={{
                  opacity: fadingIdx === item.idx ? 0 : 1,
                  transition: 'opacity 0.65s ease',
                }}
              />
            </div>
          );

          return groups.map((grp, gi) => {
            const layoutType = gi % 6;
            const delay = (k: number) => `${k * 0.08}s`;

            const spread = (() => {
              // Single image — full bleed
              if (grp.length === 1) {
                return (
                  <FadeImg item={grp[0]} className="w-full" style={{ height: 'clamp(300px, 46vw, 680px)' }} />
                );
              }

              // Two images
              if (grp.length === 2) {
                if (layoutType === 0 || layoutType === 4) {
                  return (
                    <div className="flex flex-col md:flex-row" style={{ gap: '3px' }}>
                      <FadeImg item={grp[0]} className="w-full md:w-[38%]" style={{ height: 'clamp(300px, 50vw, 740px)', transitionDelay: delay(0) }} />
                      <FadeImg item={grp[1]} className="w-full md:w-[60%]" style={{ height: 'clamp(220px, 32vw, 480px)', alignSelf: 'flex-end', transitionDelay: delay(1) }} />
                    </div>
                  );
                } else {
                  return (
                    <div className="flex flex-col md:flex-row" style={{ gap: '3px' }}>
                      <FadeImg item={grp[0]} className="w-full md:w-[62%]" style={{ height: 'clamp(240px, 36vw, 540px)', transitionDelay: delay(0) }} />
                      <FadeImg item={grp[1]} className="w-full md:w-[36%]" style={{ height: 'clamp(300px, 46vw, 660px)', transitionDelay: delay(1) }} />
                    </div>
                  );
                }
              }

              // Three images
              if (layoutType === 1 || layoutType === 5) {
                return (
                  <div className="flex flex-col sm:flex-row" style={{ gap: '3px' }}>
                    <FadeImg item={grp[0]} className="w-full sm:w-[24%]" style={{ height: 'clamp(200px, 32vw, 460px)', transitionDelay: delay(0) }} />
                    <FadeImg item={grp[1]} className="w-full sm:w-[50%]" style={{ height: 'clamp(180px, 24vw, 360px)', alignSelf: 'flex-end', transitionDelay: delay(1) }} />
                    <FadeImg item={grp[2]} className="w-full sm:w-[24%]" style={{ height: 'clamp(220px, 30vw, 440px)', transitionDelay: delay(2) }} />
                  </div>
                );
              } else {
                return (
                  <div className="flex flex-col md:flex-row" style={{ gap: '3px' }}>
                    <FadeImg item={grp[0]} className="w-full md:w-[58%]" style={{ height: 'clamp(300px, 44vw, 640px)', transitionDelay: delay(0) }} />
                    <div className="flex flex-col w-full md:w-[40%]" style={{ gap: '3px' }}>
                      <FadeImg item={grp[1]} className="w-full" style={{ flex: 1, height: 'clamp(150px, 21vw, 316px)', transitionDelay: delay(1) }} />
                      <FadeImg item={grp[2]} className="w-full" style={{ flex: 1, height: 'clamp(150px, 21vw, 316px)', transitionDelay: delay(2) }} />
                    </div>
                  </div>
                );
              }
            })();

            return (
              <div key={gi}>
                <div style={{ marginTop: gi === 0 ? 0 : '3px' }}>{spread}</div>

                {/* Pull quote injected once, roughly mid-way */}
                {gi === quoteAfterGroup && (
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
                      {quote || "Architecture is not about form — it is the way a building responds to its context, its light, and the lives of the people who inhabit it."}
                    </p>
                  </div>
                )}
              </div>
            );
          });
        })()}
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
