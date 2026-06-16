import { useState, FormEvent, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { getHubHomePath } from '@/lib/hubAuth';

export default function HubLoginPage() {
  const { signIn, hubUser, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const justSignedUp = searchParams.get('welcome') === '1';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);

  // Typewriter
  const WORDS = ['Operations.', 'Team.', 'Payroll.', 'Projects.', 'Attendance.', 'Contracts.', 'Workflow.', 'Time Off.', 'Invoices.', 'People.'];
  const [wordIdx, setWordIdx] = useState(0);
  const [displayed, setDisplayed] = useState('');
  const [deleting, setDeleting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const current = WORDS[wordIdx];
    if (!deleting && displayed.length < current.length) {
      timerRef.current = setTimeout(() => setDisplayed(current.slice(0, displayed.length + 1)), 80);
    } else if (!deleting && displayed.length === current.length) {
      timerRef.current = setTimeout(() => setDeleting(true), 1800);
    } else if (deleting && displayed.length > 0) {
      timerRef.current = setTimeout(() => setDisplayed(displayed.slice(0, -1)), 45);
    } else if (deleting && displayed.length === 0) {
      setDeleting(false);
      setWordIdx(i => (i + 1) % WORDS.length);
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [displayed, deleting, wordIdx]);

  useEffect(() => {
    if (!hubUser) return;
    setLoading(false);
    navigate(getHubHomePath(hubUser.role), { replace: true });
  }, [hubUser, navigate]);

  useEffect(() => {
    if (!loading) return;
    if (!authLoading && !hubUser) {
      setLoading(false);
    }
  }, [loading, authLoading, hubUser]);

  // Prevent flashing the login form while auth is still rehydrating from localStorage
  // Skip during active submission — authLoading briefly toggles and would flash the screen
  if (!loading && (authLoading || hubUser)) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0a0608]">
        <i className="ri-loader-4-line animate-spin text-2xl text-gray-300"></i>
      </div>
    );
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { error: err, hubUser: nextHubUser } = await signIn(email, password);
      if (err) {
        setError(err.message || 'Invalid email or password. Please try again.');
        setLoading(false);
        return;
      }
      if (nextHubUser) {
        navigate(getHubHomePath(nextHubUser.role), { replace: true });
        return;
      }
      setError('Sign-in completed, but your workspace profile could not be loaded.');
      setLoading(false);
    } catch {
      setError('Something went wrong. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen min-h-dvh flex bg-[#0a0608]">
      <style>{`
        @keyframes logo-glow {
          0%, 100% { opacity: 0.6; filter: invert(1) opacity(0.6) drop-shadow(0 0 0px rgba(255,255,255,0)); }
          50%       { opacity: 1;   filter: invert(1) opacity(0.95) drop-shadow(0 0 40px rgba(255,255,255,0.4)) drop-shadow(0 0 80px rgba(255,200,150,0.2)); }
        }
        @keyframes orb-a {
          0%   { transform: translate(0, 0) scale(1);       filter: hue-rotate(0deg) brightness(1); }
          30%  { transform: translate(60px, -40px) scale(1.12); filter: hue-rotate(20deg) brightness(1.2); }
          60%  { transform: translate(-30px, 25px) scale(0.9);  filter: hue-rotate(-15deg) brightness(0.85); }
          100% { transform: translate(0, 0) scale(1);       filter: hue-rotate(0deg) brightness(1); }
        }
        @keyframes orb-b {
          0%   { transform: translate(0, 0) scale(1);        filter: hue-rotate(0deg) brightness(1); }
          35%  { transform: translate(-55px, 50px) scale(1.1);  filter: hue-rotate(-25deg) brightness(1.15); }
          70%  { transform: translate(30px, -25px) scale(0.93); filter: hue-rotate(30deg) brightness(0.9); }
          100% { transform: translate(0, 0) scale(1);        filter: hue-rotate(0deg) brightness(1); }
        }
        @keyframes orb-c {
          0%   { transform: translate(0, 0) scale(1);       filter: hue-rotate(0deg) brightness(1); }
          50%  { transform: translate(45px, 45px) scale(1.08); filter: hue-rotate(40deg) brightness(1.25); }
          100% { transform: translate(0, 0) scale(1);       filter: hue-rotate(0deg) brightness(1); }
        }
        @keyframes orb-d {
          0%   { transform: translate(0, 0) scale(1);        filter: hue-rotate(0deg) brightness(1); }
          40%  { transform: translate(-40px, -50px) scale(1.15); filter: hue-rotate(-30deg) brightness(1.3); }
          75%  { transform: translate(25px, 35px) scale(0.88);   filter: hue-rotate(20deg) brightness(0.8); }
          100% { transform: translate(0, 0) scale(1);        filter: hue-rotate(0deg) brightness(1); }
        }
        @keyframes orb-e {
          0%   { transform: translate(0, 0) scale(1);       filter: hue-rotate(0deg) brightness(1); }
          45%  { transform: translate(50px, -30px) scale(1.1); filter: hue-rotate(35deg) brightness(1.2); }
          80%  { transform: translate(-20px, 40px) scale(0.92); filter: hue-rotate(-20deg) brightness(0.88); }
          100% { transform: translate(0, 0) scale(1);       filter: hue-rotate(0deg) brightness(1); }
        }
        @keyframes shimmer {
          0%   { transform: translateX(-180%) skewX(-20deg); }
          100% { transform: translateX(400%) skewX(-20deg); }
        }
        @keyframes morph {
          0%, 100% { border-radius: 48px; }
          25%       { border-radius: 52px 44px 50px 46px / 46px 50px 44px 52px; }
          50%       { border-radius: 44px 52px 46px 50px / 52px 44px 50px 46px; }
          75%       { border-radius: 50px 46px 52px 44px / 44px 52px 46px 50px; }
        }
        @keyframes form-in {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes logo-in {
          from { opacity: 0; transform: translateY(40px) scale(0.9); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        .logo-glow     { animation: logo-glow 4s ease-in-out infinite; }
        .glass-morph   { animation: morph 12s ease-in-out infinite; }
        .orb-a-anim    { animation: orb-a 18s ease-in-out infinite; }
        .orb-b-anim    { animation: orb-b 24s ease-in-out infinite; }
        .orb-c-anim    { animation: orb-c 15s ease-in-out infinite; }
        .orb-d-anim    { animation: orb-d 20s ease-in-out infinite 3s; }
        .orb-e-anim    { animation: orb-e 22s ease-in-out infinite 1s; }
        .shimmer     { animation: shimmer 5s ease-in-out infinite 2s; }
        .orb-a       { animation: orb-a 20s ease-in-out infinite; }
        .orb-b       { animation: orb-b 26s ease-in-out infinite; }
        .orb-c       { animation: orb-c 18s ease-in-out infinite; }
        .form-in     { animation: form-in 0.6s cubic-bezier(0.22,1,0.36,1) both; }
        .logo-in     { animation: logo-in 0.8s cubic-bezier(0.22,1,0.36,1) 0.2s both; }
        input:-webkit-autofill {
          -webkit-box-shadow: 0 0 0 100px rgba(15,10,8,0.98) inset !important;
          -webkit-text-fill-color: rgba(255,255,255,0.85) !important;
        }
        .btn-glow {
          background: linear-gradient(135deg, #FF6B35, #e53a00);
          transition: all 0.3s ease;
        }
        .btn-glow:hover {
          background: linear-gradient(135deg, #ff7f4d, #c73000);
          box-shadow: 0 8px 32px rgba(255,107,53,0.55) !important;
          transform: translateY(-1px);
        }
        .btn-glow:active { transform: scale(0.98); }
        .input-dark {
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.1);
          color: rgba(255,255,255,0.85);
          transition: border 0.2s, background 0.2s, box-shadow 0.2s;
          font-size: 16px;
        }
        .input-dark::placeholder { color: rgba(255,255,255,0.2); }
        .input-dark:focus {
          background: rgba(255,255,255,0.08);
          border-color: rgba(255,107,53,0.6);
          box-shadow: 0 0 0 3px rgba(255,107,53,0.12);
          outline: none;
        }
      `}</style>

      {/* ── Left panel — dark glass form ──────────────────────────────────── */}
      <div className="flex-1 relative flex flex-col min-h-screen min-h-dvh overflow-hidden"
        style={{ background: '#0a0608' }}>

        {/* Subtle ambient behind form */}
        <div className="absolute top-[-20%] left-[-10%] w-[400px] h-[400px] rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(255,107,53,0.07) 0%, transparent 65%)' }} />
        <div className="absolute bottom-[-10%] right-[-10%] w-[350px] h-[350px] rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(255,160,0,0.05) 0%, transparent 65%)' }} />

        {/* Logo */}
        <div className="relative z-10 p-8 md:p-10 flex items-center gap-2.5 form-in">
          <div className="w-8 h-8 rounded-xl bg-[#FF6B35] flex items-center justify-center flex-shrink-0"
            style={{ boxShadow: '0 4px 14px rgba(255,107,53,0.4)' }}>
            <img src="/s-logo.png" alt="S" className="w-[18px] h-[18px] object-contain" style={{ filter: 'invert(1)' }} />
          </div>
          <span className="font-bold tracking-widest text-sm text-white/90">SENTRO <span className="text-[#FF6B35]">OS</span></span>
          <span className="text-white/20 text-xs font-light tracking-widest ml-1">× FS Architects</span>
        </div>

        {/* Form */}
        <div className="relative z-10 flex-1 flex items-center justify-center px-8 md:px-14">
          <div className="w-full max-w-[380px] form-in" style={{ animationDelay: '0.1s' }}>

            <div className="mb-10">
              <p className="text-[#FF6B35] text-[11px] font-semibold tracking-[0.25em] uppercase mb-3">Welcome back</p>
              <h1 className="text-white font-bold leading-tight" style={{ fontSize: '2.6rem', letterSpacing: '-0.02em' }}>
                Sign in to<br />your workspace.
              </h1>
              <p className="text-white/30 text-sm mt-3">For FS Architects team members only</p>
            </div>

            {justSignedUp && (
              <div className="flex items-center gap-2 p-3.5 rounded-2xl mb-6"
                style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)' }}>
                <i className="ri-checkbox-circle-line text-emerald-400 text-sm flex-shrink-0"></i>
                <p className="text-emerald-400 text-sm">Account created! Sign in to continue.</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-[11px] font-semibold text-white/40 tracking-widest uppercase">Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="Enter your email" required
                  className="input-dark w-full px-4 py-3.5 text-sm rounded-xl" />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-[11px] font-semibold text-white/40 tracking-widest uppercase">Password</label>
                  <button type="button" onClick={() => navigate('/hub/forgot-password')}
                    className="text-xs text-[#FF6B35] hover:text-[#ff8255] transition-colors cursor-pointer font-medium">
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <input type={showPass ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                    placeholder="Enter your password" required
                    className="input-dark w-full px-4 pr-10 py-3.5 text-sm rounded-xl" />
                  <button type="button" onClick={() => setShowPass(!showPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/20 hover:text-white/50 cursor-pointer transition-colors">
                    <i className={showPass ? 'ri-eye-off-line text-sm' : 'ri-eye-line text-sm'}></i>
                  </button>
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 p-3.5 rounded-2xl"
                  style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
                  <i className="ri-error-warning-line text-red-400 text-sm flex-shrink-0"></i>
                  <p className="text-red-400 text-sm">{error}</p>
                </div>
              )}

              <button type="submit" disabled={loading}
                className="btn-glow w-full text-white py-3.5 rounded-xl text-sm font-semibold disabled:opacity-50 cursor-pointer mt-2"
                style={{ boxShadow: '0 4px 24px rgba(255,107,53,0.4)' }}>
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <i className="ri-loader-4-line animate-spin text-sm"></i>Signing in…
                  </span>
                ) : 'Sign in →'}
              </button>
            </form>
          </div>
        </div>

        {/* Footer */}
        <div className="relative z-10 p-8 md:p-10 form-in" style={{ animationDelay: '0.2s' }}>
          <p className="text-xs text-white/15">
            © Sentro OS {new Date().getFullYear()} by{' '}
            <a href="https://www.hunacreatives.com/sentro" target="_blank" rel="noopener noreferrer" className="hover:text-white/40 transition-colors">
              Huna Creatives
            </a>
          </p>
        </div>
      </div>

      {/* ── Right panel — frosted glass with colored circles ─────────────── */}
      <div className="hidden lg:flex w-[52%] relative overflow-hidden"
        style={{ background: '#0a0608' }}>

        {/* Layer 1 — vivid color circles (show through frost) */}
        <div className="orb-a-anim absolute top-[-8%] right-[-8%] w-[520px] h-[520px] rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(255,107,53,0.90) 0%, rgba(255,60,0,0.4) 45%, transparent 70%)' }} />
        <div className="orb-b-anim absolute bottom-[-10%] left-[-8%] w-[480px] h-[480px] rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(255,170,0,0.80) 0%, rgba(255,100,0,0.35) 45%, transparent 70%)' }} />
        <div className="orb-c-anim absolute top-[30%] left-[18%] w-[380px] h-[380px] rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(255,50,10,0.65) 0%, rgba(200,30,0,0.25) 50%, transparent 70%)' }} />
        <div className="orb-d-anim absolute top-[5%] left-[5%] w-[280px] h-[280px] rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(255,200,50,0.55) 0%, transparent 65%)' }} />
        <div className="orb-e-anim absolute bottom-[20%] right-[5%] w-[300px] h-[300px] rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(255,80,30,0.50) 0%, transparent 65%)' }} />

        {/* Layer 2 — frosted glass overlay */}
        <div className="absolute inset-0 pointer-events-none" style={{
          zIndex: 2,
          backdropFilter: 'blur(60px) saturate(180%) brightness(1.1)',
          WebkitBackdropFilter: 'blur(60px) saturate(180%) brightness(1.1)',
          background: 'rgba(255,255,255,0.06)',
        }}>
          {/* Top specular */}
          <div className="absolute top-0 left-0 right-0" style={{
            height: '50%',
            background: 'linear-gradient(to bottom, rgba(255,255,255,0.09) 0%, transparent 100%)',
          }} />
          {/* Bottom shadow */}
          <div className="absolute bottom-0 left-0 right-0" style={{
            height: '30%',
            background: 'linear-gradient(to top, rgba(0,0,0,0.15) 0%, transparent 100%)',
          }} />
        </div>

        {/* Layer 3 — S logo + tagline grouped */}
        <div className="logo-in absolute inset-0 flex items-center justify-center" style={{ zIndex: 3 }}>
          <div className="flex flex-col items-center gap-6">
            <img src="/s-logo.png" alt="S"
              style={{ width: '200px', height: '200px', objectFit: 'contain', filter: 'invert(1)', opacity: 0.95 }} />
            <div className="text-center">
              <p className="text-white/40 text-[10px] tracking-[0.35em] uppercase mb-2">Sentro OS</p>
              <p className="text-white/80 text-base font-medium" style={{ minWidth: '240px', minHeight: '28px' }}>
                Centralize your{' '}
                <span className="text-[#FF6B35]">
                  {displayed}
                  <span className="inline-block w-[2px] h-[1em] bg-[#1c2b3a] ml-[1px] align-middle"
                    style={{ animation: 'blink 1s step-end infinite' }} />
                </span>
              </p>
            </div>
          </div>
        </div>
        <style>{`@keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }`}</style>
      </div>
    </div>
  );
}
