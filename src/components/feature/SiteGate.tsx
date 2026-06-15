import { useState, ReactNode } from 'react';

const STORAGE_KEY = 'fsa_site_unlocked';
const SITE_PASSWORD = import.meta.env.VITE_SITE_PASSWORD ?? 'fs2026';

function isUnlocked() {
  try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch { return false; }
}

function unlock() {
  try { localStorage.setItem(STORAGE_KEY, '1'); } catch {}
}

export default function SiteGate({ children }: { children: ReactNode }) {
  const [authed, setAuthed] = useState(isUnlocked);
  const [input, setInput] = useState('');
  const [error, setError] = useState(false);
  const [shaking, setShaking] = useState(false);

  if (authed) return <>{children}</>;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input === SITE_PASSWORD) {
      unlock();
      setAuthed(true);
    } else {
      setError(true);
      setShaking(true);
      setInput('');
      setTimeout(() => setShaking(false), 500);
    }
  };

  return (
    <div className="min-h-screen bg-[#0d1b2a] flex items-center justify-center px-6">
      <div className={`w-full max-w-sm ${shaking ? 'animate-[shake_0.4s_ease]' : ''}`}>
        <div className="mb-8 text-center">
          <img
            src="/images/fs-architects-logo-white.png"
            alt="FS Architects"
            className="h-10 mx-auto mb-6 opacity-90"
          />
          <p className="text-sm text-[#a8b9c9]">This site is private. Enter the access code to continue.</p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <input
            type="password"
            value={input}
            onChange={e => { setInput(e.target.value); setError(false); }}
            placeholder="Access code"
            autoFocus
            className={`w-full bg-white/5 border rounded-xl px-4 py-3 text-white placeholder-white/30 text-sm focus:outline-none focus:ring-2 transition-colors ${
              error ? 'border-red-500/60 focus:ring-red-500/30' : 'border-white/10 focus:ring-white/20 focus:border-white/30'
            }`}
          />
          {error && <p className="text-xs text-red-400 text-center">Incorrect code. Try again.</p>}
          <button
            type="submit"
            className="w-full bg-white text-[#0d1b2a] font-semibold rounded-xl py-3 text-sm hover:bg-white/90 transition-colors cursor-pointer"
          >
            Enter
          </button>
        </form>

        <p className="text-center text-xs text-white/20 mt-8">FS Architects · Cebu City, Philippines</p>
      </div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-8px); }
          40% { transform: translateX(8px); }
          60% { transform: translateX(-5px); }
          80% { transform: translateX(5px); }
        }
      `}</style>
    </div>
  );
}
