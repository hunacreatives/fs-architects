import { useState, FormEvent, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { getHubHomePath } from '@/lib/hubAuth';

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [showPass, setShowPass] = useState(false);
  useEffect(() => {
    // Listen for PASSWORD_RECOVERY event fired when Supabase parses the hash tokens
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) return;
    });

    // Fallback for already-active sessions
    supabase.auth.getSession().then(() => {});

    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setLoading(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (err) { setError(err.message); return; }
    setDone(true);
    // Session is already active — check role and redirect to the right dashboard
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: hubUser } = await supabase.from('hub_users').select('role').eq('id', user.id).maybeSingle();
      setTimeout(() => navigate(getHubHomePath(hubUser?.role)), 2000);
    } else {
      setTimeout(() => navigate('/hub/login'), 2000);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-8">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-[#FF6B35] rounded-lg flex items-center justify-center">
            <img src="/s-logo.png" alt="S" className="w-5 h-5 object-contain" style={{ filter: 'invert(1)' }} />
          </div>
          <span className="text-[#111827] font-bold text-base tracking-wide">SENTRO <span className="text-[#FF6B35]">OS</span></span>
        </div>

        {done ? (
          <div className="bg-white border border-gray-100 rounded-2xl p-8 space-y-4 text-center">
            <div className="w-14 h-14 bg-emerald-50 rounded-full flex items-center justify-center mx-auto">
              <i className="ri-checkbox-circle-line text-emerald-500 text-2xl"></i>
            </div>
            <div className="space-y-1">
              <h2 className="text-[#111827] text-lg font-semibold">Password updated</h2>
              <p className="text-gray-500 text-sm">Taking you to your hub…</p>
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <h1 className="text-[#111827] text-2xl font-bold">Set a new password</h1>
              <p className="text-gray-500 text-sm">Choose a strong password for your account.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-gray-700">New password</label>
                <div className="relative">
                  <div className="w-10 h-full absolute left-0 top-0 flex items-center justify-center">
                    <i className="ri-lock-line text-gray-400 text-sm"></i>
                  </div>
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min. 8 characters"
                    required
                    className="w-full pl-9 pr-10 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/30 focus:border-[#FF6B35] bg-white"
                  />
                  <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer">
                    <i className={showPass ? 'ri-eye-off-line text-sm' : 'ri-eye-line text-sm'}></i>
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-gray-700">Confirm password</label>
                <div className="relative">
                  <div className="w-10 h-full absolute left-0 top-0 flex items-center justify-center">
                    <i className="ri-lock-line text-gray-400 text-sm"></i>
                  </div>
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Re-enter password"
                    required
                    className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/30 focus:border-[#FF6B35] bg-white"
                  />
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-lg">
                  <i className="ri-error-warning-line text-red-500 text-sm flex-shrink-0"></i>
                  <p className="text-red-600 text-sm">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#FF6B35] text-white py-2.5 rounded-lg text-sm font-medium hover:bg-[#e55a27] transition-colors disabled:opacity-60 cursor-pointer whitespace-nowrap"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <i className="ri-loader-4-line animate-spin text-sm"></i>
                    Updating…
                  </span>
                ) : 'Update password'}
              </button>

              <button type="button" onClick={() => navigate('/hub/login')} className="w-full py-2.5 text-sm border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer whitespace-nowrap">
                Back to sign in
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
