
import { useEffect, useState, useRef } from 'react';

interface IntroSequenceProps {
  userInterrupted: boolean;
  onComplete: () => void;
}

const NAV_LOGO_SIZE = 43; // px — matches the nav button w-[43px] h-[43px]
const INTRO_LOGO_SIZE = 96; // px — w-24 h-24
const TARGET_SCALE = NAV_LOGO_SIZE / INTRO_LOGO_SIZE; // ~0.448

export default function IntroSequence({ userInterrupted, onComplete }: IntroSequenceProps) {
  const [phase, setPhase] = useState<'hold' | 'moving' | 'fading' | 'done'>('hold');
  const [targetPos, setTargetPos] = useState({ x: 0, y: 0 });
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const calc = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      // Nav left padding: px-8 md:px-16 lg:px-24
      let navPaddingLeft = 32; // px-8 = 2rem = 32px
      if (vw >= 1024) navPaddingLeft = 96;       // lg:px-24
      else if (vw >= 768) navPaddingLeft = 64;   // md:px-16

      // Nav logo center X = left padding + half of logo size
      const navLogoCenterX = navPaddingLeft + NAV_LOGO_SIZE / 2;

      // Nav logo center Y = py-1.5 (6px) + half of logo size
      const navLogoCenterY = 6 + NAV_LOGO_SIZE / 2;

      // Offset from viewport center to nav logo center
      setTargetPos({
        x: navLogoCenterX - vw / 2,
        y: navLogoCenterY - vh / 2,
      });
    };
    calc();
    window.addEventListener('resize', calc);
    return () => window.removeEventListener('resize', calc);
  }, []);

  const clearAll = () => timersRef.current.forEach(clearTimeout);

  useEffect(() => {
    if (userInterrupted) {
      clearAll();
      setPhase('done');
      onComplete();
      return;
    }

    const t1 = setTimeout(() => setPhase('moving'), 1800);
    const t2 = setTimeout(() => setPhase('fading'), 3300);
    const t3 = setTimeout(() => {
      setPhase('done');
      onComplete();
    }, 4100);

    timersRef.current = [t1, t2, t3];
    return clearAll;
  }, [userInterrupted]); // eslint-disable-line react-hooks/exhaustive-deps

  if (phase === 'done') return null;

  const logoStyle: React.CSSProperties = {
    transform:
      phase === 'hold'
        ? 'translate(0px, 0px) scale(1)'
        : `translate(${targetPos.x}px, ${targetPos.y}px) scale(${TARGET_SCALE})`,
    transition:
      phase === 'moving'
        ? 'transform 1.5s cubic-bezier(0.76, 0, 0.24, 1)'
        : 'none',
    transformOrigin: 'center center',
    willChange: 'transform',
  };

  const overlayStyle: React.CSSProperties = {
    opacity: phase === 'fading' ? 0 : 1,
    transition: phase === 'fading' ? 'opacity 0.85s cubic-bezier(0.4, 0, 0.2, 1)' : 'none',
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{ backgroundColor: '#33404a', ...overlayStyle }}
    >
      <div style={logoStyle}>
        {/* Same size as the nav logo button: 43×43 */}
        <div
          style={{ width: `${INTRO_LOGO_SIZE}px`, height: `${INTRO_LOGO_SIZE}px` }}
          className="flex items-center justify-center"
        >
          <img
            src="https://static.readdy.ai/image/08981d36cd0b73cf08022d4d82071d03/af9840250b5d4b8ed50bb36142137e11.png"
            alt="FS Architects"
            style={{ width: `${INTRO_LOGO_SIZE}px`, height: `${INTRO_LOGO_SIZE}px`, objectFit: 'contain' }}
            className="select-none brightness-0 invert"
            draggable={false}
          />
        </div>
      </div>
    </div>
  );
}
