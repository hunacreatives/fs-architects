
import { useState, useEffect, useCallback } from 'react';
import HeroSection from './components/HeroSection';
import IntroSequence from './components/IntroSequence';
import Footer from './components/Footer';

export default function Home() {
  const [introComplete, setIntroComplete] = useState(false);
  const [userInterrupted, setUserInterrupted] = useState(false);

  const handleComplete = useCallback(() => {
    setIntroComplete(true);
  }, []);

  useEffect(() => {
    const handleInterrupt = () => {
      if (!introComplete) {
        setUserInterrupted(true);
      }
    };

    window.addEventListener('scroll', handleInterrupt);
    window.addEventListener('keydown', handleInterrupt);

    return () => {
      window.removeEventListener('scroll', handleInterrupt);
      window.removeEventListener('keydown', handleInterrupt);
    };
  }, [introComplete]);

  return (
    <div className="relative w-full min-h-screen overflow-hidden" style={{ backgroundColor: '#33404a' }}>
      <HeroSection isVisible={introComplete} />
      {!introComplete && (
        <IntroSequence
          userInterrupted={userInterrupted}
          onComplete={handleComplete}
        />
      )}
      {introComplete && <Footer />}
    </div>
  );
}
