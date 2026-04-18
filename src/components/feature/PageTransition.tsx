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
        @keyframes pageLineIn {
          from { transform: scaleX(0); opacity: 1; }
          80%  { transform: scaleX(1); opacity: 1; }
          to   { transform: scaleX(1); opacity: 0; }
        }
        .page-enter {
          animation: pageFadeIn 200ms cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        .page-enter::before {
          content: '';
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          height: 1px;
          background: rgba(255, 255, 255, 0.5);
          transform-origin: left center;
          animation: pageLineIn 350ms cubic-bezier(0.16, 1, 0.3, 1) both;
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
