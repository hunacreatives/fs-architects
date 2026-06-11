import { useEffect, useState } from 'react';
import Navigation from '../../components/feature/Navigation';
import ContactFooter from '../contact/components/ContactFooter';

const SECTIONS = [
  {
    title: 'Information We Collect',
    body: `We collect personal information you voluntarily provide when you:

• Submit our contact or consultation form (name, email address, phone number, message)
• Apply for a position through our careers page (name, email address, resume, and application details)

We do not collect any information automatically beyond what your browser sends as part of a standard web request (e.g., IP address, browser type). We do not use cookies for tracking or advertising purposes.`,
  },
  {
    title: 'How We Use Your Information',
    body: `Information submitted through our contact or consultation forms is used solely to respond to your inquiry and discuss potential projects. Information submitted through our careers page is used solely to evaluate your application for employment or engagement with FS Architects.

We do not use your personal information for marketing purposes without your explicit consent.`,
  },
  {
    title: 'Data Sharing',
    body: `We do not sell, trade, or otherwise transfer your personal information to third parties. Your information may be shared only with members of the FS Architects team who need it to respond to your inquiry or process your application.`,
  },
  {
    title: 'Data Retention',
    body: `Contact and consultation inquiries are retained for as long as necessary to respond to and complete the relevant engagement. Career applications are retained for a reasonable period following the conclusion of the hiring process. You may request deletion of your data at any time by contacting us.`,
  },
  {
    title: 'Your Rights Under the Data Privacy Act of 2012',
    body: `Under Republic Act No. 10173 (Data Privacy Act of 2012), you have the right to:

• Be informed of how your personal data is being processed
• Access your personal data held by us
• Request correction of inaccurate or incomplete data
• Request deletion or blocking of your personal data
• Lodge a complaint with the National Privacy Commission

To exercise any of these rights, please contact us at the email address below.`,
  },
  {
    title: 'Data Security',
    body: `We take reasonable precautions to protect your personal information from unauthorized access, use, or disclosure. However, no method of transmission over the internet is completely secure, and we cannot guarantee absolute security.`,
  },
  {
    title: 'Contact',
    body: `If you have questions or concerns about this Privacy Notice, or wish to exercise your rights, please contact us at:\n\ninfo@fsarchitects.ph`,
  },
];

export default function PrivacyPage() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 80);
    return () => clearTimeout(timer);
  }, []);

  const fade = (delay: string) =>
    `transition-all duration-700 ease-out ${delay} ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'}`;

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Navigation theme="dark" />

      <main className="flex-1 w-full px-4 md:px-20 lg:px-28 pt-32 pb-24">
        {/* Header */}
        <div className={`mb-14 ${fade('delay-0')}`}>
          <p style={{ fontFamily: 'Geist, sans-serif', fontSize: '10px', letterSpacing: '0.28em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.35)', marginBottom: '12px' }}>
            Legal
          </p>
          <h1 style={{ fontFamily: 'Marcellus, serif', fontSize: 'clamp(28px, 4vw, 52px)', letterSpacing: '-0.02em', color: 'rgba(0,0,0,0.88)', lineHeight: 1.1, margin: 0 }}>
            Privacy Notice
          </h1>
          <p style={{ fontFamily: 'Geist, sans-serif', fontSize: '13px', color: 'rgba(0,0,0,0.4)', marginTop: '16px', lineHeight: 1.7 }}>
            Effective date: January 1, 2026 &nbsp;·&nbsp; FS Architects, Cebu City, Philippines
          </p>
        </div>

        {/* Divider */}
        <div className={`w-full h-px bg-black/10 mb-14 ${fade('delay-75')}`} />

        {/* Sections */}
        <div className="max-w-2xl flex flex-col gap-12">
          {SECTIONS.map((s, i) => (
            <div key={s.title} className={fade(`delay-${Math.min(i * 75, 300)}`)}>
              <h2 style={{ fontFamily: 'Marcellus, serif', fontSize: 'clamp(16px, 1.4vw, 20px)', letterSpacing: '-0.01em', color: 'rgba(0,0,0,0.82)', marginBottom: '12px' }}>
                {s.title}
              </h2>
              <p style={{ fontFamily: 'Geist, sans-serif', fontSize: '14px', lineHeight: 1.85, color: 'rgba(0,0,0,0.55)', whiteSpace: 'pre-line' }}>
                {s.body}
              </p>
            </div>
          ))}
        </div>
      </main>

      <ContactFooter hideContactBar />
    </div>
  );
}
