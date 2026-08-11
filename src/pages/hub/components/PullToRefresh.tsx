import { ReactNode, RefObject, useEffect, useRef, useState } from 'react';

const THRESHOLD = 64;
const MAX_PULL = 100;
const RESISTANCE = 0.5;

// Pull-to-refresh gesture for the mobile app shell — drag down from the top
// of a scrolled-to-top container to trigger `onRefresh`, mirroring the
// social-media-app pattern. Touch-only: desktop pointer/mouse users are
// unaffected since mousedown never fires the touch listeners below.
export default function PullToRefresh({ scrollRef, onRefresh, children }: {
  scrollRef: RefObject<HTMLElement | null>;
  onRefresh: () => void | Promise<void>;
  children: ReactNode;
}) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const tracking = useRef(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const onTouchStart = (e: TouchEvent) => {
      if (el.scrollTop <= 0 && !refreshing) {
        startY.current = e.touches[0].clientY;
        tracking.current = true;
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!tracking.current || startY.current == null) return;
      const delta = e.touches[0].clientY - startY.current;
      if (delta <= 0) { setPull(0); return; }
      if (el.scrollTop > 0) { tracking.current = false; setPull(0); return; }
      e.preventDefault();
      setPull(Math.min(delta * RESISTANCE, MAX_PULL));
    };
    const onTouchEnd = async () => {
      if (!tracking.current) return;
      tracking.current = false;
      startY.current = null;
      setPull(prev => {
        if (prev >= THRESHOLD) {
          setRefreshing(true);
          Promise.resolve(onRefresh()).finally(() => { setRefreshing(false); setPull(0); });
          return THRESHOLD;
        }
        return 0;
      });
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
    };
  }, [scrollRef, onRefresh, refreshing]);

  const displayPull = refreshing ? THRESHOLD : pull;

  return (
    <div className="relative">
      <div
        className="absolute left-0 right-0 flex items-start justify-center overflow-hidden pointer-events-none"
        style={{ top: -40, height: 40 + displayPull, opacity: Math.min(displayPull / THRESHOLD, 1), transition: pull === 0 && !refreshing ? 'height 0.2s, opacity 0.2s' : undefined }}
      >
        <i className={`ri-loader-4-line text-lg text-gray-400 mt-1 ${refreshing || displayPull >= THRESHOLD ? 'animate-spin' : ''}`}
          style={{ transform: refreshing ? undefined : `rotate(${displayPull * 3}deg)` }}></i>
      </div>
      <div style={{ transform: `translateY(${displayPull}px)`, transition: pull === 0 && !refreshing ? 'transform 0.2s' : undefined }}>
        {children}
      </div>
    </div>
  );
}
