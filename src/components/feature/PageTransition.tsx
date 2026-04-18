import { useLocation } from 'react-router-dom';

export default function PageTransition({ children }: { children: React.ReactNode }) {
  const { key } = useLocation();

  return (
    <>
      <style>{`
        @keyframes pageFadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        .page-enter {
          animation: pageFadeIn 180ms ease-out both;
        }
      `}</style>
      <div key={key} className="page-enter">
        {children}
      </div>
    </>
  );
}
