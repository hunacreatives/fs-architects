import { useEffect, useState, useRef, useCallback } from 'react';

interface IntroSequenceProps {
  userInterrupted: boolean;
  onComplete: () => void;
}

const NAV_LOGO_SIZE = 43;
const INTRO_LOGO_SIZE = 96;
const TARGET_SCALE = NAV_LOGO_SIZE / INTRO_LOGO_SIZE;

const VIDEO_URL =
  'https://storage.readdy-site.link/project_files/3530b75e-ff34-41a0-81d5-ae38e0742267/eb17e719-3fde-4be3-afcf-955813e797f8_FS-Architects-Intro.mp4?v=a3fa63b3b53412350ed0e09578ede230';
const PNG_URL =
  'https://storage.readdy-site.link/project_files/3530b75e-ff34-41a0-81d5-ae38e0742267/6ce6d8c4-7246-475e-9d31-1ffdfdafa22f_Fs-Architects---Transparent.png?v=3e7e7587bd400cb1da2e408fd26e86f6';

type Phase = 'video' | 'hold' | 'moving' | 'fading' | 'done';

export default function IntroSequence({ userInterrupted, onComplete }: IntroSequenceProps) {
  const [phase, setPhase] = useState<Phase>('video');
  const [targetPos, setTargetPos] = useState({ x: 0, y: 0 });
  const videoRef = useRef<HTMLVideoElement>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearAll = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

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
      setTargetPos({
        x: navLogoCenterX - vw / 2,
        y: navLogoCenterY - vh / 2,
      });
    };
    calc();
    window.addEventListener('resize', calc);
    return () => window.removeEventListener('resize', calc);
  }, []);

  // Skip everything if user interrupted
  useEffect(() => {
    if (userInterrupted) {
      clearAll();
      if (videoRef.current) videoRef.current.pause();
      setPhase('done');
      onComplete();
    }
  }, [userInterrupted, clearAll, onComplete]);

  // Watch video time to trigger crossfade near the end
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleEnded = () => {
      // Video ended — PNG is already underneath, just start moving
      setPhase('hold');
      const t1 = setTimeout(() => setPhase('moving'), 300);
      const t2 = setTimeout(() => setPhase('fading'), 1800);
      const t3 = setTimeout(() => {
        setPhase('done');
        onComplete();
      }, 2600);
      timersRef.current = [t1, t2, t3];
    };

    video.addEventListener('ended', handleEnded);
    return () => {
      video.removeEventListener('ended', handleEnded);
    };
  }, [onComplete]);

  if (phase === 'done') return null;

  const isMovingOrFading = phase === 'moving' || phase === 'fading';

  const logoStyle: React.CSSProperties = {
    transform: isMovingOrFading
      ? `translate(${targetPos.x}px, ${targetPos.y}px) scale(${TARGET_SCALE})`
      : 'translate(0px, 0px) scale(1)',
    transition: phase === 'moving'
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
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden"
      style={{ backgroundColor: '#33404a', ...overlayStyle }}
    >
      {/*
        PNG sits underneath as the base layer — always visible.
        Video plays on top and simply stops when done, revealing the PNG beneath.
        No opacity swap needed, no flicker.
      */}
      <div
        style={{
          ...logoStyle,
          position: 'relative',
          width: `${INTRO_LOGO_SIZE}px`,
          height: `${INTRO_LOGO_SIZE}px`,
          flexShrink: 0,
        }}
      >
        {/* Video — on top while playing */}
        <video
          ref={videoRef}
          src={VIDEO_URL}
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
            // Hide via visibility so layout is preserved; switch to none only after video phase
            display: phase === 'video' ? 'block' : 'none',
          }}
        />

        {/* PNG — hidden while video plays, shown the instant video phase ends */}
        <img
          src={PNG_URL}
          alt="FS Architects"
          style={{
            position: 'absolute',
            inset: 0,
            width: `${INTRO_LOGO_SIZE}px`,
            height: `${INTRO_LOGO_SIZE}px`,
            objectFit: 'contain',
            // Invisible during video, instantly visible after — no transition
            visibility: phase === 'video' ? 'hidden' : 'visible',
          }}
          className="select-none"
          draggable={false}
        />
      </div>
    </div>
  );
}
