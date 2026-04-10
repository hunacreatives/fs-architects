import { useState, useEffect, useRef } from 'react';

const LOGO_URL = 'https://storage.readdy-site.link/project_files/3530b75e-ff34-41a0-81d5-ae38e0742267/4fa7d6c0-23e8-4c54-909a-7ec172674b09_4.png?v=5d628b311d93cf6c9d87f976195cb525';
const HAMBURGER_URL = 'https://storage.readdy-site.link/project_files/3530b75e-ff34-41a0-81d5-ae38e0742267/d4e31a0a-648a-4452-a5fd-4db72583e0fa_5.png?v=7ea3e0a25c871cbaa6d3cdbb2436b6f2';
const GIF_FORWARD_URL = 'https://storage.readdy-site.link/project_files/3530b75e-ff34-41a0-81d5-ae38e0742267/e3962a03-d22f-4483-8872-cac9f70174a6_FINAL---SASDASDSDasdas-ezgif.com-speed.gif?v=09ea27f14667d24b5d855d81536e0939';
const GIF_REVERSE_URL = 'https://storage.readdy-site.link/project_files/3530b75e-ff34-41a0-81d5-ae38e0742267/fe01d251-7e54-4397-ab42-e87878638b7e_REVERSE-FINAL-SASDASDSDasdas-ezgif.com-speed-4.gif?v=19c0e1751bcc95621cc3ead5d5d338b8';

const FORWARD_DURATION = 8430;
const REVERSE_DURATION = 720;

interface LogoHamburgerProps {
  size?: number;
  onClick?: () => void;
  invert?: boolean;
}

type Phase = 'logo' | 'forward' | 'hamburger' | 'reverse';

export default function LogoHamburger({ size = 43, onClick, invert = false }: LogoHamburgerProps) {
  const [phase, setPhase] = useState<Phase>('logo');
  const [forwardReady, setForwardReady] = useState(false);
  const [reverseReady, setReverseReady] = useState(false);
  const forwardRef = useRef<HTMLImageElement>(null);
  const reverseRef = useRef<HTMLImageElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phaseRef = useRef<Phase>('logo');

  const imgStyle: React.CSSProperties = invert ? { filter: 'invert(1)' } : {};

  const updatePhase = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  useEffect(() => {
    const fwd = new Image();
    fwd.onload = () => setForwardReady(true);
    fwd.src = GIF_FORWARD_URL;

    const rev = new Image();
    rev.onload = () => setReverseReady(true);
    rev.src = GIF_REVERSE_URL;

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleMouseEnter = () => {
    if (!forwardReady) return;
    const current = phaseRef.current;

    // Already at hamburger — stay there, nothing to do
    if (current === 'hamburger') return;

    // Cancel any running timer (e.g. reverse was playing)
    if (timerRef.current) clearTimeout(timerRef.current);

    // Restart forward GIF from frame 0
    if (forwardRef.current) {
      forwardRef.current.src = `${GIF_FORWARD_URL}#${Date.now()}`;
    }
    updatePhase('forward');

    timerRef.current = setTimeout(() => {
      updatePhase('hamburger');
    }, FORWARD_DURATION);
  };

  const handleMouseLeave = () => {
    const current = phaseRef.current;

    // Already at logo — nothing to reverse
    if (current === 'logo') return;

    // Cancel any running timer
    if (timerRef.current) clearTimeout(timerRef.current);

    // Play reverse GIF regardless of whether forward finished or not
    if (reverseReady && reverseRef.current) {
      reverseRef.current.src = `${GIF_REVERSE_URL}#${Date.now()}`;
    }
    updatePhase('reverse');

    timerRef.current = setTimeout(() => {
      updatePhase('logo');
    }, REVERSE_DURATION);
  };

  return (
    <button
      onClick={onClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className="flex items-center cursor-pointer p-0 bg-transparent border-0 outline-none"
      aria-label="Open menu"
      style={{ width: size, height: size }}
    >
      <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>

        {/* Static FS logo — rest state */}
        <img
          src={LOGO_URL}
          alt="FS"
          className="absolute inset-0 w-full h-full object-contain"
          style={{ visibility: phase === 'logo' ? 'visible' : 'hidden', ...imgStyle }}
          draggable={false}
        />

        {/* Forward GIF — FS logo morphs into hamburger */}
        {forwardReady && (
          <img
            ref={forwardRef}
            src={GIF_FORWARD_URL}
            alt=""
            className="absolute inset-0 w-full h-full object-contain"
            style={{ visibility: phase === 'forward' ? 'visible' : 'hidden', ...imgStyle }}
            draggable={false}
          />
        )}

        {/* Static hamburger — shown when forward GIF fully completes */}
        <img
          src={HAMBURGER_URL}
          alt=""
          className="absolute inset-0 w-full h-full object-contain"
          style={{ visibility: phase === 'hamburger' ? 'visible' : 'hidden', ...imgStyle }}
          draggable={false}
        />

        {/* Reverse GIF — hamburger morphs back into FS logo */}
        {reverseReady && (
          <img
            ref={reverseRef}
            src={GIF_REVERSE_URL}
            alt=""
            className="absolute inset-0 w-full h-full object-contain"
            style={{ visibility: phase === 'reverse' ? 'visible' : 'hidden', ...imgStyle }}
            draggable={false}
          />
        )}

      </div>
    </button>
  );
}
