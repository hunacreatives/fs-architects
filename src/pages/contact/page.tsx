
import { useEffect } from 'react';
import Navigation from '../../components/feature/Navigation';
import ContactForm from './components/ContactForm';
import ContactFooter from './components/ContactFooter';

export default function ContactPage() {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="relative w-full min-h-screen bg-white">
      <Navigation theme="dark" />
      <div className="pt-24">
        <ContactForm />
        <ContactFooter hideContactBar />
      </div>
    </div>
  );
}
