import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    // Always send users back to the origin they requested the reset from, so
    // staging/preview deploys don't bounce people to production.
    const redirectTo = `${window.location.origin}/hub/reset-password`;
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    setSent(true);
  };

  return (
    <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-8">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-[#1c2b3a] rounded-lg flex items-center justify-center">
            <img src="/s-logo.png" alt="S" className="w-5 h-5 object-contain" style={{ filter: 'invert(1)' }} />
          </div>
          <span className="text-[#111827] font-bold text-base tracking-wide">SENTRO <span className="text-[#1c2b3a]">OS</span></span>
        </div>

        {sent ? (
          <div className="bg-white border border-gray-100 rounded-2xl p-8 space-y-4 text-center">
            <div className="w-14 h-14 bg-green-50 rounded-full flex items-center justify-center mx-auto">
              <i className="ri-mail-check-line text-green-500 text-2xl"></i>
            </div>
            <div className="space-y-1">
              <h2 className="text-[#111827] text-lg font-semibold">Check your inbox</h2>
              <p className="text-gray-500 text-sm">
                We sent a password reset link to <strong>{email}</strong>. Check your email and follow the instructions.
              </p>
            </div>
            <button
              onClick={() => navigate('/hub/login')}
              className="w-full py-2.5 text-sm border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer whitespace-nowrap"
            >
              Back to sign in
            </button>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <h1 className="text-[#111827] text-2xl font-bold">Reset your password</h1>
              <p className="text-gray-500 text-sm">Enter your work email and we'll send a reset link.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-gray-700">Work email</label>
                <div className="relative">
                  <div className="w-10 h-full absolute left-0 top-0 flex items-center justify-center">
                    <i className="ri-mail-line text-gray-400 text-sm"></i>
                  </div>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@yourcompany.com"
                    required
                    className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c2b3a]/30 focus:border-[#1c2b3a] bg-white transition-all"
                  />
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-lg">
                  <i className="ri-error-warning-line text-red-500 text-sm"></i>
                  <p className="text-red-600 text-sm">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#1c2b3a] text-white py-2.5 rounded-lg text-sm font-medium hover:bg-[#0f1c28] transition-colors disabled:opacity-60 cursor-pointer whitespace-nowrap"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <i className="ri-loader-4-line animate-spin text-sm"></i>
                    Sending...
                  </span>
                ) : 'Send reset link'}
              </button>

              <button
                type="button"
                onClick={() => navigate('/hub/login')}
                className="w-full py-2.5 text-sm border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer whitespace-nowrap"
              >
                Back to sign in
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}