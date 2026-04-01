import { useEffect } from 'react';
import Navigation from '../../components/feature/Navigation';
import ConsultationForm from './components/ConsultationForm';
import ContactFooter from '../contact/components/ContactFooter';

export default function ConsultationPage() {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="relative w-full min-h-screen bg-white">
      <Navigation theme="dark" />
      <div className="pt-24">
        <ConsultationForm />
        <ContactFooter hideContactBar />
      </div>
    </div>
  );
}
