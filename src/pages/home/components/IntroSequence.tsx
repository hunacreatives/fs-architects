import { useEffect, useState, useRef, useCallback } from 'react';

interface IntroSequenceProps {
  userInterrupted: boolean;
  onComplete: () => void;
}

const NAV_LOGO_SIZE = 43;
const INTRO_LOGO_SIZE = 200;
const TARGET_SCALE = NAV_LOGO_SIZE / INTRO_LOGO_SIZE;

const VIDEO_SAFARI_URL = '/images/intro-logo-safari.mp4'; // HEVC alpha — Safari
const VIDEO_MP4_URL    = '/images/intro-logo.mp4';        // H.264 composited — Chrome/Firefox
const PNG_URL          = '/images/intro-logo.png';

type Phase = 'video' | 'hold' | 'moving' | 'fading' | 'done';

export default function IntroSequence({ userInterrupted, onComplete }: IntroSequenceProps) {
  const [phase, setPhase] = useState<Phase>('video');
  const [animated, setAnimated] = useState(false);
  const [targetPos, setTargetPos] = useState({ x: 0, y: 0 });
  const videoRef = useRef<HTMLVideoElement>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearAll = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  const advance = useCallback(() => {
    setPhase('hold');
    const t1 = setTimeout(() => {
      setPhase('moving');
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
      if (videoRef.current) videoRef.current.pause();
      setPhase('done');
      onComplete();
    }
  }, [userInterrupted, clearAll, onComplete]);

  // Video end / error / fallback → fly to nav
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const fallback = setTimeout(advance, 16000);
    const handleEnded = () => { clearTimeout(fallback); advance(); };
    const handleError = () => { clearTimeout(fallback); advance(); };
    video.addEventListener('ended', handleEnded);
    video.addEventListener('error', handleError);
    return () => {
      clearTimeout(fallback);
      video.removeEventListener('ended', handleEnded);
      video.removeEventListener('error', handleError);
    };
  }, [advance]);

  if (phase === 'done') return null;

  const transform = animated
    ? `translate(${targetPos.x}px, ${targetPos.y}px) scale(${TARGET_SCALE})`
    : 'translate(0px, 0px) scale(1)';

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden"
      style={{
        backgroundColor: '#2c363e',
        opacity: phase === 'fading' ? 0 : 1,
        transition: phase === 'fading' ? 'opacity 0.85s cubic-bezier(0.4, 0, 0.2, 1)' : 'none',
      }}
    >
      <div
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
        {/* Transparent video — alpha channel eliminates any background */}
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          style={{
            position: 'absolute',
            inset: 0,
            width: `${INTRO_LOGO_SIZE}px`,
            height: `${INTRO_LOGO_SIZE}px`,
            objectFit: 'contain',
            pointerEvents: 'none',
            display: phase === 'video' ? 'block' : 'none',
          }}
        >
          <source src={VIDEO_SAFARI_URL} type='video/mp4; codecs="hvc1"' />
          <source src={VIDEO_MP4_URL} type="video/mp4" />
        </video>

        {/* PNG shown once video phase ends */}
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
            visibility: phase === 'video' ? 'hidden' : 'visible',
          }}
          className="select-none"
          draggable={false}
        />
      </div>
    </div>
  );
}
