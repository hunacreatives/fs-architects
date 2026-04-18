import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

export default function PageTransition({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const [displayChildren, setDisplayChildren] = useState(children);
  const [opacity, setOpacity] = useState(1);
  const prevKey = useRef(location.key);

  useEffect(() => {
    if (location.key === prevKey.current) return;
    prevKey.current = location.key;

    setOpacity(0);
    const t = setTimeout(() => {
      setDisplayChildren(children);
      setOpacity(1);
    }, 220);
    return () => clearTimeout(t);
  }, [location.key, children]);

  return (
    <div
      style={{
        opacity,
        transition: opacity === 0
          ? 'opacity 200ms ease'
          : 'opacity 380ms cubic-bezier(0.22,1,0.36,1)',
      }}
    >
      {displayChildren}
    </div>
  );
}
