import { useEffect, useState, useRef, useCallback } from 'react';

interface IntroSequenceProps {
  userInterrupted: boolean;
  onComplete: () => void;
}

const NAV_LOGO_SIZE = 43;
const INTRO_LOGO_SIZE = 96;
const TARGET_SCALE = NAV_LOGO_SIZE / INTRO_LOGO_SIZE;

const VIDEO_WEBM_URL = '/images/intro-video.webm';
const VIDEO_MP4_URL = '/images/intro-video.mp4';
const PNG_URL = '/images/intro-logo.png';

type Phase = 'video' | 'hold' | 'moving' | 'fading' | 'done';

export default function IntroSequence({ userInterrupted, onComplete }: IntroSequenceProps) {
  const [phase, setPhase] = useState<Phase>('video');
  const [targetPos, setTargetPos] = useState({ x: 0, y: 0 });
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearAll = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

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

  useEffect(() => {
    if (userInterrupted) {
      clearAll();
      cancelAnimationFrame(rafRef.current);
      if (videoRef.current) videoRef.current.pause();
      setPhase('done');
      onComplete();
    }
  }, [userInterrupted, clearAll, onComplete]);

  // Canvas luma-key: draw video frames with black keyed to transparent
  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const drawFrame = () => {
      if (video.readyState >= 2 && !video.paused && !video.ended) {
        ctx.clearRect(0, 0, INTRO_LOGO_SIZE, INTRO_LOGO_SIZE);
        ctx.drawImage(video, 0, 0, INTRO_LOGO_SIZE, INTRO_LOGO_SIZE);
        try {
          const imageData = ctx.getImageData(0, 0, INTRO_LOGO_SIZE, INTRO_LOGO_SIZE);
          const d = imageData.data;
          for (let i = 0; i < d.length; i += 4) {
            d[i + 3] = Math.round((d[i] + d[i + 1] + d[i + 2]) / 3);
          }
          ctx.putImageData(imageData, 0, 0);
        } catch {
          // not tainted — just skip alpha manipulation this frame
        }
      }
      rafRef.current = requestAnimationFrame(drawFrame);
    };

    const start = () => { rafRef.current = requestAnimationFrame(drawFrame); };
    video.addEventListener('play', start);
    if (!video.paused) start();

    return () => {
      video.removeEventListener('play', start);
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const advance = () => {
      cancelAnimationFrame(rafRef.current);
      setPhase('hold');
      const t1 = setTimeout(() => setPhase('moving'), 300);
      const t2 = setTimeout(() => setPhase('fading'), 1800);
      const t3 = setTimeout(() => { setPhase('done'); onComplete(); }, 2600);
      timersRef.current = [t1, t2, t3];
    };

    // 3s hard fallback — fires if video never ends (autoplay blocked, too long, etc.)
    const fallbackTimer = setTimeout(advance, 3000);
    const handleEnded = () => { clearTimeout(fallbackTimer); advance(); };
    const handleError = () => { clearTimeout(fallbackTimer); advance(); };

    video.addEventListener('ended', handleEnded);
    video.addEventListener('error', handleError);
    return () => {
      clearTimeout(fallbackTimer);
      video.removeEventListener('ended', handleEnded);
      video.removeEventListener('error', handleError);
    };
  }, [onComplete]);

  if (phase === 'done') return null;

  const isMovingOrFading = phase === 'moving' || phase === 'fading';

  const logoStyle: React.CSSProperties = {
    transform: isMovingOrFading
      ? `translate(${targetPos.x}px, ${targetPos.y}px) scale(${TARGET_SCALE})`
      : 'translate(0px, 0px) scale(1)',
    transition: phase === 'moving' ? 'transform 1.5s cubic-bezier(0.76, 0, 0.24, 1)' : 'none',
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
      style={{ backgroundColor: '#2c363e', ...overlayStyle }}
    >
      <div
        style={{
          ...logoStyle,
          position: 'relative',
          width: `${INTRO_LOGO_SIZE}px`,
          height: `${INTRO_LOGO_SIZE}px`,
          flexShrink: 0,
        }}
      >
        {/* Video at full size but invisible — opacity:0 lets it play; 0x0 was blocking playback */}
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
            opacity: 0,
            pointerEvents: 'none',
          }}
        >
          <source src={VIDEO_WEBM_URL} type="video/webm" />
          <source src={VIDEO_MP4_URL} type="video/mp4" />
        </video>

        {/* Canvas renders luma-keyed frames — black becomes transparent */}
        <canvas
          ref={canvasRef}
          width={INTRO_LOGO_SIZE}
          height={INTRO_LOGO_SIZE}
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            display: phase === 'video' ? 'block' : 'none',
          }}
        />

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
