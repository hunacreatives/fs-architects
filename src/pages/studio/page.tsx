import { useState, useEffect, useRef } from 'react';
import Navigation from '../../components/feature/Navigation';
import AboutUs from './components/AboutUs';
import MeetTheTeam from './components/MeetTheTeam';
import DesignProcessAccordion from './components/DesignProcessAccordion';
import StudioCTA from './components/StudioCTA';
import ContactFooter from '../contact/components/ContactFooter';

export default function StudioPage() {
  const [navTheme, setNavTheme] = useState<'light' | 'dark'>('light');
  const [selectedMemberKey, setSelectedMemberKey] = useState<string | null>(null);
  const accordionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const update = () => {
      const scrollY = window.scrollY;
      const vh = window.innerHeight;
      const navMidY = scrollY + 28; // vertical midpoint of the fixed nav bar

      // Hero dark zone: covers viewport until the white content scrolls over the nav
      const heroEnd = vh;

      // Accordion dark zone (#33404a)
      const el = accordionRef.current;
      const accordionTop = el ? el.getBoundingClientRect().top + scrollY : Infinity;
      const accordionBottom = el ? el.getBoundingClientRect().bottom + scrollY : Infinity;

      const inDark = navMidY < heroEnd || (navMidY >= accordionTop && navMidY < accordionBottom);
      setNavTheme(inDark ? 'light' : 'dark');
    };

    window.addEventListener('scroll', update, { passive: true });
    update();
    return () => window.removeEventListener('scroll', update);
  }, []);

  return (
    <div className="w-full min-h-screen bg-white">
      <Navigation theme={navTheme} />
      <AboutUs />
      <div style={{ position: 'relative', zIndex: selectedMemberKey ? 3 : 1, transition: 'z-index 0s' }}>
        <MeetTheTeam selectedKey={selectedMemberKey} onSelect={setSelectedMemberKey} />
      </div>
      <div ref={accordionRef} style={{ position: 'relative', zIndex: 2 }}>
        <DesignProcessAccordion bioOpen={!!selectedMemberKey} />
      </div>
      <div className="py-16 md:py-24">
        <StudioCTA />
      </div>
      <ContactFooter hideContactBar />
    </div>
  );
}
