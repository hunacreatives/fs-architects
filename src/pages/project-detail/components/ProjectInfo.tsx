import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

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

export default function ProjectInfo({
  name,
  description,
  mainImage,
  galleryImages,
  plans = [],
  quote,
}: ProjectInfoProps) {
  const { t } = useTranslation();
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
      const incomingSrc = unusedRef.current[0];

      const doSwap = () => {
        // Phase 1: scale down (card closes)
        setFadingIdx(idx);
        // Phase 2: swap src at scale zero
        setTimeout(() => {
          setImgs(prev => {
            const next = [...prev];
            const outgoing = next[idx];
            const incoming = unusedRef.current.shift()!;
            unusedRef.current.push(outgoing);
            next[idx] = incoming;
            return next;
          });
          // Phase 3: scale back up (card opens)
          setTimeout(() => {
            setFadingIdx(null);
            fadingRef.current = false;
          }, 40);
        }, 420);
      };

      // Preload incoming image before starting the fade so there's no blank frame
      const preload = new window.Image();
      preload.onload = doSwap;
      preload.onerror = doSwap;
      preload.src = incomingSrc;
      if (preload.complete) doSwap();
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const g = (i: number) => imgs[i % imgs.length];

  const extraParagraphs = [
    t('extra_para_1'),
    t('extra_para_2'),
    t('extra_para_3'),
    t('extra_para_4'),
  ];
  const sentences = description.split(/(?<=[.!?])\s+/).filter(Boolean);
  const paragraphs: string[] = [];
  for (let i = 0; i < sentences.length; i += 2) {
    paragraphs.push(sentences.slice(i, i + 2).join(' '));
  }
  const allParagraphs = [
    ...paragraphs,
    ...extraParagraphs.slice(0, Math.max(0, 5 - paragraphs.length)),
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
          position: relative;
        }
        .mag-img img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: center;
          display: block;
          transition: transform 1.8s ease-out, opacity 0.5s ease;
        }
        .mag-img:hover img { transform: scale(1.05); }
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

      {/* ── IMAGE GALLERY ───────────────────────────────────────────────── */}
      <div ref={imagesRef} className="px-4 md:px-16 lg:px-24 pb-16 md:pb-24">
        {(() => {
          const items = imgs.map((src, idx) => ({ src, idx }));
          // Pattern: 1 full-width, then pairs, then repeat
          // Every 5 images: [full, pair, pair] → indices 0, 1-2, 3-4
          const rows: { type: 'full' | 'pair'; items: { src: string; idx: number }[] }[] = [];
          let i = 0;
          while (i < items.length) {
            if (i % 5 === 0) {
              // Full-width
              rows.push({ type: 'full', items: [items[i]] });
              i += 1;
            } else {
              // Pair (or single if at end)
              const pair = items.slice(i, i + 2);
              rows.push({ type: pair.length === 2 ? 'pair' : 'full', items: pair });
              i += 2;
            }
          }

          const quoteAfterRow = Math.floor(rows.length * 0.5);

          const FadeImg = ({ item, className }: { item: { src: string; idx: number }; className?: string }) => {
            const isSwapping = fadingIdx === item.idx;
            return (
              <div className={`mag-reveal mag-img${className ? ' ' + className : ''}`}>
                <img
                  src={item.src}
                  alt={name}
                  style={{
                    opacity: isSwapping ? 0 : 1,
                    transition: isSwapping
                      ? 'opacity 0.4s ease'
                      : 'opacity 0.4s ease 0.1s, transform 1.8s ease-out',
                  }}
                />
              </div>
            );
          };

          return rows.map((row, ri) => (
            <div key={ri}>
              <div className={`mt-3 ${row.type === 'pair' ? 'grid grid-cols-2 gap-3' : ''}`}>
                {row.type === 'full' ? (
                  <FadeImg
                    item={row.items[0]}
                    className="w-full"
                  />
                ) : (
                  row.items.map((item) => (
                    <FadeImg key={item.idx} item={item} className="aspect-[4/3]" />
                  ))
                )}
              </div>

              {ri === quoteAfterRow && (
                <div className="py-20 md:py-28 flex flex-col items-center text-center">
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
          ));
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
            className={`grid gap-4 md:gap-8 ${
              plans.length === 1 ? 'grid-cols-1 max-w-xs' :
              plans.length === 2 ? 'grid-cols-1 sm:grid-cols-2' :
              'grid-cols-2 md:grid-cols-3'
            }`}
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
