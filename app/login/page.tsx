'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseClient } from '@/lib/supabase-client';

type Step = 'email' | 'otp';

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep]       = useState<Step>('email');
  const [email, setEmail]     = useState('');
  const [otp, setOtp]         = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [info, setInfo]       = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Redirect if already logged in
  useEffect(() => {
    getSupabaseClient().auth.getSession().then(({ data }) => {
      if (data.session) router.replace('/');
    });
  }, [router]);

  // Clear timer on unmount
  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  function startCooldown() {
    setCooldown(60);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) { clearInterval(timerRef.current!); return 0; }
        return prev - 1;
      });
    }, 1000);
  }

  async function doSendOtp(emailAddr: string) {
    const { error: err } = await getSupabaseClient().auth.signInWithOtp({
      email: emailAddr,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: window.location.origin,
      },
    });
    if (err) throw err;
  }

  async function sendOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await doSendOtp(email.trim().toLowerCase());
      setStep('otp');
      setInfo(`A 6-digit code has been sent to ${email}. Check your inbox.`);
      startCooldown();
    } catch (e: unknown) {
      setError((e as Error).message ?? 'Failed to send code.');
    } finally {
      setLoading(false);
    }
  }

  async function resendOtp() {
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      await doSendOtp(email.trim().toLowerCase());
      setInfo(`A new code has been sent to ${email}.`);
      setOtp('');
      startCooldown();
    } catch (e: unknown) {
      setError((e as Error).message ?? 'Failed to resend code.');
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const sb = getSupabaseClient();
      const { data, error: err } = await sb.auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token: otp.trim(),
        type: 'email',
      });
      if (err) throw err;
      if (!data.user) throw new Error('Verification failed.');

      // Check if email is approved by admin
      const { data: approved } = await sb
        .from('approved_emails')
        .select('email')
        .eq('email', data.user.email)
        .maybeSingle();

      if (!approved) {
        await sb.auth.signOut();
        setError('Your account is pending admin approval. Contact Bikram to get access.');
        setStep('email');
        setOtp('');
        return;
      }

      router.replace('/');
    } catch (e: unknown) {
      setError((e as Error).message ?? 'Invalid code. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  function backToEmail() {
    if (timerRef.current) clearInterval(timerRef.current);
    setCooldown(0);
    setStep('email');
    setOtp('');
    setError(null);
    setInfo(null);
  }

  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-blue-600 flex items-center justify-center shadow-lg mx-auto mb-4">
            <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2
                   h5.586a1 1 0 01.707.293l5.414 5.414A1 1 0 0121 9.414V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Production System</h1>
          <p className="text-sm text-gray-500 mt-1">Sign in to access the dashboard</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">

          {/* Info banner */}
          {info && (
            <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-700">
              {info}
            </div>
          )}

          {/* Error banner */}
          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Step 1: Email */}
          {step === 'email' && (
            <form onSubmit={sendOtp} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email address
                </label>
                <input
                  type="email"
                  required
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm
                             focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
              <button
                type="submit"
                disabled={loading || !email}
                className="w-full py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-lg
                           hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {loading ? 'Sending…' : 'Send Login Code'}
              </button>
            </form>
          )}

          {/* Step 2: OTP */}
          {step === 'otp' && (
            <form onSubmit={verifyOtp} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Login code
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  inputMode="numeric"
                  maxLength={8}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••••••"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm
                             font-mono tracking-widest text-center focus:outline-none
                             focus:ring-2 focus:ring-blue-400"
                />
              </div>

              <button
                type="submit"
                disabled={loading || otp.length < 6}
                className="w-full py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-lg
                           hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {loading ? 'Verifying…' : 'Verify Code'}
              </button>

              {/* Resend */}
              <button
                type="button"
                onClick={resendOtp}
                disabled={cooldown > 0 || loading}
                className="w-full py-2 text-sm text-blue-600 hover:text-blue-700
                           disabled:text-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
              </button>

              <button
                type="button"
                onClick={backToEmail}
                className="w-full text-sm text-gray-400 hover:text-gray-600 transition-colors"
              >
                ← Use a different email
              </button>
            </form>
          )}

        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          Access is by invitation only. Contact the administrator for access.
        </p>
      </div>
    </main>
  );
}
