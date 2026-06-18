import { useEffect, useState, useRef, useCallback } from 'react';

interface IntroSequenceProps {
  userInterrupted: boolean;
  onComplete: () => void;
}

const NAV_LOGO_SIZE = 43;
const INTRO_LOGO_SIZE = 96;
const TARGET_SCALE = NAV_LOGO_SIZE / INTRO_LOGO_SIZE;

const PNG_URL = '/images/intro-logo.png';

type Phase = 'intro' | 'hold' | 'moving' | 'fading' | 'done';

export default function IntroSequence({ userInterrupted, onComplete }: IntroSequenceProps) {
  const [phase, setPhase] = useState<Phase>('intro');
  const [logoOpacity, setLogoOpacity] = useState(0);
  const [animated, setAnimated] = useState(false);
  const [targetPos, setTargetPos] = useState({ x: 0, y: 0 });
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const logoRef = useRef<HTMLDivElement>(null);

  const clearAll = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  const advance = useCallback(() => {
    setPhase('hold');
    const t1 = setTimeout(() => {
      setPhase('moving');
      // RAF ensures the browser sees the identity transform before we apply the target
      requestAnimationFrame(() => requestAnimationFrame(() => setAnimated(true)));
    }, 300);
    const t2 = setTimeout(() => setPhase('fading'), 1800);
    const t3 = setTimeout(() => { setPhase('done'); onComplete(); }, 2600);
    timersRef.current = [t1, t2, t3];
  }, [onComplete]);

  // Calculate nav logo target position
  useEffect(() => {
    const calc = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let navPaddingLeft = 32;
      if (vw >= 1024) navPaddingLeft = 96;
      else if (vw >= 768) navPaddingLeft = 64;
      const navLogoCenterX = navPaddingLeft + NAV_LOGO_SIZE / 2;
      const navLogoCenterY = 6 + NAV_LOGO_SIZE / 2;
      setTargetPos({ x: navLogoCenterX - vw / 2, y: navLogoCenterY - vh / 2 });
    };
    calc();
    window.addEventListener('resize', calc);
    return () => window.removeEventListener('resize', calc);
  }, []);

  // User interrupt
  useEffect(() => {
    if (userInterrupted) {
      clearAll();
      setPhase('done');
      onComplete();
    }
  }, [userInterrupted, clearAll, onComplete]);

  // Fade logo in, then start advance sequence
  useEffect(() => {
    const t0 = setTimeout(() => setLogoOpacity(1), 80);
    const t1 = setTimeout(advance, 1800);
    timersRef.current = [t0, t1];
    return clearAll;
  }, [advance, clearAll]);

  if (phase === 'done') return null;

  const overlayOpacity = phase === 'fading' ? 0 : 1;

  const transform = animated
    ? `translate(${targetPos.x}px, ${targetPos.y}px) scale(${TARGET_SCALE})`
    : 'translate(0px, 0px) scale(1)';

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden"
      style={{
        backgroundColor: '#2c363e',
        opacity: overlayOpacity,
        transition: phase === 'fading' ? 'opacity 0.85s cubic-bezier(0.4, 0, 0.2, 1)' : 'none',
      }}
    >
      <div
        ref={logoRef}
        style={{
          position: 'relative',
          width: INTRO_LOGO_SIZE,
          height: INTRO_LOGO_SIZE,
          flexShrink: 0,
          transform,
          transition: 'transform 1.5s cubic-bezier(0.76, 0, 0.24, 1)',
          transformOrigin: 'center center',
          willChange: 'transform',
        }}
      >
        <img
          src={PNG_URL}
          alt="FS Architects"
          style={{
            position: 'absolute',
            inset: 0,
            width: `${INTRO_LOGO_SIZE}px`,
            height: `${INTRO_LOGO_SIZE}px`,
            objectFit: 'contain',
            filter: 'grayscale(1) brightness(1.4)',
            opacity: logoOpacity,
            transition: 'opacity 0.6s ease',
          }}
          className="select-none"
          draggable={false}
        />
      </div>
    </div>
  );
}
