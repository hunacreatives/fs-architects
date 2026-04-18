import { useLocation } from 'react-router-dom';

export default function PageTransition({ children }: { children: React.ReactNode }) {
  const { key } = useLocation();

  return (
    <>
      <style>{`
        @keyframes overlayOut {
          0%   { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes contentIn {
          0%   { opacity: 0; }
          40%  { opacity: 0; }
          100% { opacity: 1; }
        }
        .page-enter {
          animation: contentIn 380ms cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        .page-enter::before {
          content: '';
          position: fixed;
          inset: 0;
          background: #1a1916;
          animation: overlayOut 380ms cubic-bezier(0.4, 0, 0.2, 1) both;
          z-index: 9999;
          pointer-events: none;
        }
      `}</style>
      <div key={key} className="page-enter">
        {children}
      </div>
    </>
  );
}
