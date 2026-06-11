import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDemo } from '@/contexts/DemoContext';

export default function HubDemoPage() {
  const { demoSignIn } = useDemo();
  const navigate = useNavigate();
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const ok = demoSignIn(passcode);
    if (ok) {
      navigate('/hub/admin/dashboard');
    } else {
      setError(true);
      setShake(true);
      setTimeout(() => setShake(false), 500);
      setPasscode('');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-50 via-white to-indigo-50 px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-3xl bg-[#FF6B35] text-white flex items-center justify-center shadow-lg shadow-orange-200 mb-4">
            <img src="/s-logo.png" alt="S" className="w-8 h-8 object-contain" style={{ filter: 'invert(1)' }} />
          </div>
          <p className="text-[11px] uppercase tracking-widest text-gray-400 font-semibold">FS Architects</p>
          <h1 className="text-2xl font-bold text-gray-800">Sentro</h1>
          <p className="text-sm text-gray-400 mt-1">Interactive Demo</p>
        </div>

        {/* Card */}
        <div
          className="rounded-3xl p-7"
          style={{
            background: 'rgba(255,255,255,0.8)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            border: '1px solid rgba(255,255,255,0.9)',
            boxShadow: '0 8px 40px rgba(99,120,200,0.12)',
          }}
        >
          <h2 className="text-lg font-semibold text-gray-800 mb-1">Enter demo passcode</h2>
          <p className="text-sm text-gray-400 mb-6">You're about to preview the Sentro admin hub with sample data.</p>

          <form onSubmit={handleSubmit} className={shake ? 'animate-[wiggle_0.4s_ease-in-out]' : ''}>
            <input
              type="password"
              value={passcode}
              onChange={e => { setPasscode(e.target.value); setError(false); }}
              placeholder="Passcode"
              autoFocus
              className={`w-full border rounded-xl px-4 py-3 text-sm outline-none transition-all mb-3 ${error ? 'border-red-300 bg-red-50 text-red-600' : 'border-gray-200 bg-white/60 text-gray-800 focus:border-[#FF6B35]/50 focus:ring-2 focus:ring-[#FF6B35]/10'}`}
            />
            {error && <p className="text-xs text-red-500 mb-3">Incorrect passcode. Try again.</p>}
            <button
              type="submit"
              className="w-full bg-[#FF6B35] hover:bg-[#e55a27] text-white font-semibold py-3 rounded-xl transition-colors text-sm cursor-pointer"
            >
              View Demo
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-gray-300 mt-6">Sentro by FS Architects · Demo Mode</p>
      </div>
    </div>
  );
}
