import { useState, useEffect, FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { getHubHomePath } from '@/lib/hubAuth';

export default function HubSignupPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const bootstrapInvite = async () => {
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const type = searchParams.get('type') ?? hash.get('type');
      const tokenHash = searchParams.get('token_hash') ?? hash.get('token_hash');
      const code = searchParams.get('code');
      const explicitInvite = searchParams.get('invite') === '1';
      const isInviteFlow = explicitInvite || type === 'invite' || type === 'recovery' || Boolean(tokenHash) || Boolean(code);

      try {
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else if (tokenHash && type) {
          const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type as 'invite' | 'recovery' | 'email' });
          if (error) throw error;
        }

        const { data } = await supabase.auth.getSession();
        if (cancelled) return;

        if (data.session) {
          setReady(true);
          return;
        }

        if (!isInviteFlow) {
          navigate('/hub/login', { replace: true });
          return;
        }

        const retryTimer = window.setTimeout(async () => {
          const { data: retryData } = await supabase.auth.getSession();
          if (cancelled) return;
          if (retryData.session) setReady(true);
          else navigate('/hub/login', { replace: true });
        }, 1000);

        return () => window.clearTimeout(retryTimer);
      } catch {
        if (!cancelled) navigate('/hub/login', { replace: true });
      }
    };

    const cleanupPromise = bootstrapInvite();

    return () => {
      cancelled = true;
      Promise.resolve(cleanupPromise).then((cleanup) => {
        if (typeof cleanup === 'function') cleanup();
      });
    };
  }, [navigate, searchParams]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    setError('');
    setLoading(true);

    const { error: updateErr } = await supabase.auth.updateUser({ password });
    if (updateErr) { setError(updateErr.message); setLoading(false); return; }

    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: hubUser } = await supabase.from('hub_users').select('role').eq('id', user.id).maybeSingle();
      navigate(getHubHomePath(hubUser?.role), { replace: true });
    } else {
      navigate('/hub/login', { replace: true });
    }
  };

  if (!ready) {
    return (
      <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center">
        <i className="ri-loader-4-line animate-spin text-2xl text-gray-400"></i>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFAFA] flex">
      <div className="hidden lg:flex lg:w-1/2 bg-[#080c14] flex-col justify-between p-12">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg overflow-hidden flex-shrink-0">
            <img src="/images/fs-architects-logo.jpg" alt="FS Architects" className="w-full h-full object-cover" />
          </div>
          <span className="text-white font-bold text-base tracking-wide">FS Architects</span>
        </div>
        <div className="space-y-4">
          <h2 className="text-white text-3xl font-bold leading-tight">Welcome to the team.</h2>
          <p className="text-gray-400 text-base leading-relaxed">
            Set your password to access your Sentro workspace — attendance, payouts, announcements, SOPs, and more.
          </p>
        </div>
        <p className="text-gray-600 text-xs">Private portal — authorized team members only.</p>
      </div>

      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md space-y-8">
          <div className="flex items-center gap-2 lg:hidden">
            <div className="w-8 h-8 rounded-lg overflow-hidden flex-shrink-0">
              <img src="/images/fs-architects-logo.jpg" alt="FS Architects" className="w-full h-full object-cover" />
            </div>
            <span className="text-[#111827] font-bold text-base tracking-wide">FS Architects</span>
          </div>

          <div className="space-y-1">
            <h1 className="text-[#111827] text-2xl font-bold">Set your password</h1>
            <p className="text-gray-500 text-sm">Choose a password to secure your account.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700">Password</label>
              <div className="relative">
                <div className="w-10 h-full absolute left-0 top-0 flex items-center justify-center">
                  <i className="ri-lock-line text-gray-400 text-sm"></i>
                </div>
                <input type={showPass ? 'text' : 'password'} required value={password}
                  onChange={e => setPassword(e.target.value)} placeholder="Min. 8 characters"
                  className="w-full pl-9 pr-10 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a] bg-white transition-all" />
                <button type="button" onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer">
                  <i className={showPass ? 'ri-eye-off-line text-sm' : 'ri-eye-line text-sm'}></i>
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700">Confirm Password</label>
              <div className="relative">
                <div className="w-10 h-full absolute left-0 top-0 flex items-center justify-center">
                  <i className="ri-lock-line text-gray-400 text-sm"></i>
                </div>
                <input type={showPass ? 'text' : 'password'} required value={confirm}
                  onChange={e => setConfirm(e.target.value)} placeholder="Re-enter password"
                  className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a] bg-white transition-all" />
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-lg">
                <i className="ri-error-warning-line text-red-500 text-sm flex-shrink-0"></i>
                <p className="text-red-600 text-sm">{error}</p>
              </div>
            )}

            <button type="submit" disabled={loading}
              className="w-full bg-[#1c2b3a] text-white py-2.5 rounded-lg text-sm font-medium hover:bg-[#0f1c28] transition-colors disabled:opacity-60 cursor-pointer">
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <i className="ri-loader-4-line animate-spin text-sm"></i>
                  Setting password...
                </span>
              ) : 'Set Password & Continue'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
