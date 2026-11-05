import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useDemo } from '@/contexts/DemoContext';
import { supabase } from '@/lib/supabase';
import { CURRENT_APP_VERSION } from '@/lib/appVersion';

// The walkthrough for this version, and who sees it (owner/admin: it's about running the website).
const AUDIENCE = ['owner', 'admin'];
const SLIDES: { icon: string; title: string; body: string; link?: string }[] = [
  {
    icon: 'ri-sparkling-2-line',
    title: "What's new in the hub",
    body: 'This update puts the FS Architects website in your hands. Here is a quick look.',
  },
  {
    icon: 'ri-global-line',
    title: 'Edit the website from here',
    body: 'Projects, the team, the homepage slides, contact details and job posts are now under Website in the sidebar. Changes go live on fsarchitects.ph as soon as you save.',
    link: '/hub/admin/website',
  },
  {
    icon: 'ri-download-2-line',
    title: 'One step before you start',
    body: 'On each Website tab, click "Import from the live website" once. It copies what is on the site today, in English, Spanish and Chinese, so you edit from exactly what visitors see.',
    link: '/hub/admin/website',
  },
  {
    icon: 'ri-briefcase-line',
    title: 'Open and close job posts',
    body: 'Post a role, close it when it is filled, or reopen it later. You can see how many people applied to each post, and every application shows which post it came from.',
    link: '/hub/admin/website?tab=careers',
  },
  {
    icon: 'ri-notification-3-line',
    title: 'Every applicant and inquiry, everywhere',
    body: 'New job applications and contact form messages now notify you here and on your phone, and arrive at info@fsarchitects.ph. Applications come with the résumé attached.',
  },
  {
    icon: 'ri-check-double-line',
    title: "You're all set",
    body: "That's everything in this update. Head to Website to import your content and start editing.",
    link: '/hub/admin/website',
  },
];

export default function WhatsNewModal() {
  const { hubUser, refreshHubUser } = useAuth();
  const { isDemo } = useDemo();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [hidden, setHidden] = useState(false);

  const shouldShow =
    !isDemo &&
    !!hubUser &&
    hubUser.onboarding_completed !== false &&
    AUDIENCE.includes(hubUser.role) &&
    hubUser.last_seen_app_version !== CURRENT_APP_VERSION;

  if (!shouldShow || hidden) return null;

  const isLast = step === SLIDES.length - 1;
  const slide = SLIDES[step];

  const dismiss = async () => {
    setHidden(true);
    if (!hubUser) return;
    const { error } = await supabase
      .from('hub_users')
      .update({ last_seen_app_version: CURRENT_APP_VERSION })
      .eq('id', hubUser.id);
    if (error) console.error('Failed to save last_seen_app_version:', error);
    await refreshHubUser();
  };

  const goTo = async (path: string) => {
    await dismiss();
    navigate(path);
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden">
        <div className="px-6 pt-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-1.5 flex-1 mr-4">
              {SLIDES.map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 flex-1 rounded-full transition-all ${
                    i < step ? 'bg-[#1c2b3a]' : i === step ? 'bg-[#1c2b3a]/40' : 'bg-gray-200'
                  }`}
                />
              ))}
            </div>
            <button
              onClick={dismiss}
              title="Skip"
              className="w-7 h-7 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 cursor-pointer flex-shrink-0"
            >
              <i className="ri-close-line text-base"></i>
            </button>
          </div>
        </div>

        <div className="px-6 pb-6 text-center space-y-4">
          <div className="w-16 h-16 bg-[#1c2b3a]/10 rounded-2xl flex items-center justify-center mx-auto">
            <i className={`${slide.icon} text-3xl text-[#1c2b3a]`}></i>
          </div>
          <div>
            <h2 className="text-lg font-bold text-[#111827]">{slide.title}</h2>
            <p className="text-sm text-gray-500 mt-2 leading-relaxed">{slide.body}</p>
          </div>
          {slide.link && (
            <button
              onClick={() => goTo(slide.link!)}
              className="text-sm font-semibold text-[#1c2b3a] hover:underline cursor-pointer inline-flex items-center gap-1"
            >
              Take me there <i className="ri-arrow-right-line"></i>
            </button>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 px-6 pb-6">
          <button
            onClick={() => setStep(s => Math.max(0, s - 1))}
            disabled={step === 0}
            className="px-4 py-2 rounded-xl text-sm font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-0 disabled:pointer-events-none cursor-pointer transition-colors"
          >
            Back
          </button>
          <button
            onClick={() => (isLast ? dismiss() : setStep(s => Math.min(SLIDES.length - 1, s + 1)))}
            className="px-5 py-2 rounded-xl text-sm font-semibold text-white bg-[#1c2b3a] hover:bg-[#111827] cursor-pointer transition-colors"
          >
            {isLast ? 'Got it, thanks!' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
