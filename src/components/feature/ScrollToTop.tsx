import { useState, useEffect } from 'react';

export default function ScrollToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setVisible(window.scrollY > 400);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <button
      onClick={scrollToTop}
      aria-label="Scroll to top"
      className={`fixed bottom-24 right-8 z-40 w-11 h-11 rounded-full flex items-center justify-center cursor-pointer transition-all duration-300 shadow-lg hover:scale-110 ${
        visible ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 translate-y-4 pointer-events-none'
      }`}
      style={{
        background: 'linear-gradient(135deg, #ef4444, #f97316, #fb7185)',
        boxShadow: '0 8px 24px rgba(239, 68, 68, 0.45)',
      }}
    >
      <i className="ri-arrow-up-line text-white text-lg" />
    </button>
  );
}
