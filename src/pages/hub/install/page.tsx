import { useEffect, useState } from 'react';

const HUB_URL = 'https://fsarchitects.ph/hub/login';

function detectPlatform(): 'ios' | 'android' | 'desktop' {
  const ua = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/.test(ua) ||
    // iPadOS Safari reports as "MacIntel" but has multi-touch, unlike a real Mac.
    (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
  if (isIOS) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'desktop';
}

function isInAppBrowser(): boolean {
  return /FBAN|FBAV|Instagram|Line\/|Slack|GSA\/|Gmail|Messenger/i.test(navigator.userAgent);
}

function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;
}

interface Step {
  icon: string;
  title: string;
  body: string;
}

export default function HubInstallPage() {
  const [redirecting] = useState(isStandalone);
  const [platform] = useState(detectPlatform);
  const [inApp] = useState(isInAppBrowser);
  const [activeStep, setActiveStep] = useState(0);
  const [copied, setCopied] = useState(false);
  const [installEvent, setInstallEvent] = useState<any>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    if (isStandalone()) {
      window.location.replace('/hub/login');
      return;
    }
    const handler = (e: Event) => { e.preventDefault(); setInstallEvent(e); };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  if (redirecting) return null;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(HUB_URL);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard unavailable — link is still visible on the page */ }
  };

  const installNow = async () => {
    if (!installEvent) return;
    installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome === 'accepted') setInstalled(true);
    setInstallEvent(null);
  };

  const iosSteps: Step[] = [
    ...(inApp ? [{
      icon: 'ri-safari-line',
      title: 'Open this page in Safari',
      body: "The install option only exists in Safari. If you're reading this inside another app (Gmail, Slack, Chrome), copy the link below and paste it into Safari first.",
    }] : []),
    {
      icon: 'ri-share-box-line',
      title: 'Tap the Share button',
      body: "It's the square with an arrow pointing up, at the bottom center of Safari (or top right on iPad).",
    },
    {
      icon: 'ri-add-box-line',
      title: 'Tap "Add to Home Screen"',
      body: "Scroll down the share menu a little if you don't see it right away.",
    },
    {
      icon: 'ri-checkbox-circle-line',
      title: 'Tap "Add"',
      body: 'The FS Architects hub appears on your home screen like a regular app — with push notifications and full-screen mode.',
    },
  ];

  const androidSteps: Step[] = [
    ...(inApp ? [{
      icon: 'ri-chrome-line',
      title: 'Open this page in Chrome',
      body: "If you're inside another app's browser, copy the link below and open it in Chrome.",
    }] : []),
    {
      icon: 'ri-more-2-fill',
      title: 'Tap the ⋮ menu',
      body: 'Top right corner of Chrome.',
    },
    {
      icon: 'ri-download-2-line',
      title: 'Tap "Install app" (or "Add to Home screen")',
      body: 'Confirm, and the hub installs like a regular app.',
    },
  ];

  const steps = platform === 'ios' ? iosSteps : androidSteps;

  return (
    <div className="min-h-screen bg-[#FAFAFA] flex flex-col items-center px-5 py-10">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-16 h-16 rounded-3xl bg-[#1c2b3a] flex items-center justify-center mb-4">
            <img src="/s-logo.png" alt="FS Architects" className="w-8 h-8" style={{ filter: 'invert(1)' }} />
          </div>
          <h1 className="text-xl font-semibold text-[#111827]">Install the FS Architects Hub on your phone</h1>
          <p className="text-sm text-gray-500 mt-2">
            Get full-screen mode, a home screen icon, and push notifications — just like a regular app.
          </p>
        </div>

        {inApp && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5 flex items-start gap-3">
            <i className="ri-alert-line text-amber-500 text-lg flex-shrink-0 mt-0.5"></i>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-amber-800">You're in an in-app browser</p>
              <p className="text-xs text-amber-700 mt-0.5">
                Apps like Gmail, Slack, or Messenger can't install apps to your home screen. Copy this link and open it in {platform === 'ios' ? 'Safari' : 'Chrome'}.
              </p>
              <button onClick={copyLink} className="mt-2 flex items-center gap-1.5 text-xs font-medium text-amber-800 bg-amber-100 hover:bg-amber-200 px-3 py-1.5 rounded-lg cursor-pointer transition-colors">
                <i className={copied ? 'ri-check-line' : 'ri-file-copy-line'}></i>
                {copied ? 'Copied!' : 'Copy link'}
              </button>
            </div>
          </div>
        )}

        {platform === 'android' && installEvent && !installed && (
          <button onClick={installNow} className="w-full mb-5 flex items-center justify-center gap-2 bg-[#1c2b3a] hover:bg-[#0f1c28] text-white text-sm font-semibold py-3.5 rounded-xl cursor-pointer transition-colors">
            <i className="ri-download-2-line"></i>
            Install Hub Now
          </button>
        )}

        {installed ? (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6 text-center">
            <i className="ri-checkbox-circle-fill text-emerald-500 text-3xl mb-2 block"></i>
            <p className="text-sm font-semibold text-emerald-800">That's it!</p>
            <p className="text-xs text-emerald-700 mt-1">Open the app from your home screen and log in.</p>
          </div>
        ) : platform === 'desktop' ? (
          <div className="bg-white border border-gray-100 rounded-xl p-5 text-center">
            <i className="ri-smartphone-line text-2xl text-gray-300 mb-2 block"></i>
            <p className="text-sm font-medium text-gray-600">This guide is for your phone</p>
            <p className="text-xs text-gray-400 mt-1 mb-3">Open this link on your phone to install the hub there.</p>
            <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 mb-3">
              <span className="text-xs text-gray-500 truncate flex-1 text-left">{HUB_URL}</span>
              <button onClick={copyLink} className="text-xs font-medium text-[#1c2b3a] hover:text-[#0f1c28] cursor-pointer flex-shrink-0">
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <p className="text-[11px] text-gray-400">
              On this computer, look for the install icon in your browser's address bar.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {steps.map((step, i) => {
              const status = i < activeStep ? 'done' : i === activeStep ? 'active' : 'pending';
              return (
                <div key={i} className={`bg-white border rounded-xl overflow-hidden transition-colors ${status === 'active' ? 'border-[#1c2b3a]' : 'border-gray-100'}`}>
                  <button onClick={() => setActiveStep(i)} className="w-full flex items-center gap-3 px-4 py-3.5 text-left cursor-pointer">
                    <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                      status === 'done' ? 'bg-emerald-500 text-white' : status === 'active' ? 'bg-[#1c2b3a] text-white' : 'bg-gray-100 text-gray-400'
                    }`}>
                      {status === 'done' ? <i className="ri-check-line"></i> : i + 1}
                    </span>
                    <i className={`${step.icon} text-lg ${status === 'pending' ? 'text-gray-300' : 'text-[#1c2b3a]'}`}></i>
                    <span className={`text-sm font-medium flex-1 ${status === 'pending' ? 'text-gray-400' : 'text-[#111827]'}`}>{step.title}</span>
                  </button>
                  {status === 'active' && (
                    <div className="px-4 pb-4 pl-[3.75rem]">
                      <p className="text-xs text-gray-500">{step.body}</p>
                      {inApp && i === 0 && (
                        <button onClick={copyLink} className="mt-2.5 flex items-center gap-1.5 text-xs font-medium text-[#1c2b3a] bg-slate-50 hover:bg-slate-100 px-3 py-1.5 rounded-lg cursor-pointer transition-colors">
                          <i className={copied ? 'ri-check-line' : 'ri-file-copy-line'}></i>
                          {copied ? 'Copied!' : 'Copy link'}
                        </button>
                      )}
                      <button
                        onClick={() => setActiveStep(s => Math.min(s + 1, steps.length))}
                        className="mt-3 flex items-center gap-1 text-xs font-semibold text-[#1c2b3a] cursor-pointer"
                      >
                        {i === steps.length - 1 ? 'Done' : 'Done, next step'} <i className="ri-arrow-right-line"></i>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
            {activeStep >= steps.length && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 text-center">
                <i className="ri-checkbox-circle-fill text-emerald-500 text-2xl mb-1.5 block"></i>
                <p className="text-sm font-semibold text-emerald-800">That's it!</p>
              </div>
            )}
            <p className="text-center text-xs text-gray-400 pt-1">Step {Math.min(activeStep + 1, steps.length)} of {steps.length}</p>
          </div>
        )}

        <p className="text-center text-[11px] text-gray-400 mt-8">
          FS Architects Hub · Once installed, log in with your hub account
        </p>
      </div>
    </div>
  );
}
