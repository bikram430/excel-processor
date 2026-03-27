'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseClient } from '@/lib/supabase-client';

type Step = 'email' | 'otp';

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep]         = useState<Step>('email');
  const [email, setEmail]       = useState('');
  const [otp, setOtp]           = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [info, setInfo]         = useState<string | null>(null);
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
    <main
      className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden"
      style={{
        backgroundColor: '#0a0a14',
        backgroundImage:
          'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
        backgroundSize: '48px 48px',
      }}
    >
      {/* Industrial silhouette — right side decoration */}
      <div
        className="absolute right-0 bottom-0 w-96 h-full pointer-events-none select-none"
        style={{ opacity: 0.04 }}
        aria-hidden="true"
      >
        <svg viewBox="0 0 400 600" fill="white" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
          {/* Factory building base */}
          <rect x="60" y="300" width="280" height="300" />
          {/* Chimney stacks */}
          <rect x="80" y="180" width="40" height="130" />
          <rect x="150" y="200" width="35" height="110" />
          <rect x="270" y="160" width="45" height="150" />
          {/* Chimney tops */}
          <rect x="74" y="170" width="52" height="18" />
          <rect x="144" y="192" width="47" height="16" />
          <rect x="264" y="150" width="57" height="18" />
          {/* Roof detail */}
          <rect x="60" y="288" width="280" height="20" />
          {/* Windows */}
          <rect x="90" y="330" width="35" height="45" />
          <rect x="145" y="330" width="35" height="45" />
          <rect x="200" y="330" width="35" height="45" />
          <rect x="255" y="330" width="35" height="45" />
          <rect x="90" y="400" width="35" height="45" />
          <rect x="145" y="400" width="35" height="45" />
          <rect x="200" y="400" width="35" height="45" />
          <rect x="255" y="400" width="35" height="45" />
          {/* Door */}
          <rect x="165" y="480" width="70" height="120" />
          {/* Conveyor arm top */}
          <rect x="290" y="250" width="100" height="16" />
          <rect x="290" y="240" width="16" height="60" />
          {/* Gear circle */}
          <circle cx="330" cy="240" r="28" />
          <circle cx="330" cy="240" r="16" fill="#0a0a14" />
          {/* Pipe details */}
          <rect x="60" y="460" width="20" height="140" />
          <rect x="320" y="460" width="20" height="140" />
        </svg>
      </div>

      {/* Centered container */}
      <div className="max-w-[360px] w-full mx-auto relative z-10">

        {/* Logo area */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-blue-600 flex items-center justify-center shadow-lg mx-auto mb-4">
            <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414A1 1 0 0121 9.414V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h1 className="text-xl font-black tracking-[0.2em] text-white uppercase">
            PRODUCTION SYSTEM
          </h1>
          <div className="flex items-center justify-center gap-1.5 mt-2">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-[10px] tracking-[0.15em] text-slate-400 uppercase">
              SYSTEM STATUS: OPERATIONAL
            </span>
          </div>
        </div>

        {/* White card */}
        <div className="bg-white rounded-2xl shadow-2xl p-6 mb-4">
          {/* Card heading */}
          <div className="border-b border-gray-100 pb-4">
            <h2 className="text-base font-bold text-gray-900">Industrial OS Login</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Enter your corporate credentials to access the production line analyzer.
            </p>
          </div>

          {/* Info banner */}
          {info && (
            <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700">
              {info}
            </div>
          )}

          {/* Error banner */}
          {error && (
            <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700">
              {error}
            </div>
          )}

          {/* Step 1: Email */}
          {step === 'email' && (
            <form onSubmit={sendOtp} className="mt-4 space-y-4">
              <div>
                <label className="block text-[10px] font-bold tracking-[0.12em] text-slate-500 uppercase mb-1.5">
                  CORPORATE EMAIL ADDRESS
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-mono">
                    @
                  </span>
                  <input
                    type="email"
                    required
                    autoFocus
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@company-industrial.com"
                    className="w-full border border-gray-200 rounded-lg pl-8 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-slate-50 text-gray-900 placeholder-slate-400"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={loading || !email}
                className="w-full py-2.5 text-sm font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                {loading ? 'Sending…' : 'Send Login Code →'}
              </button>
            </form>
          )}

          {/* Step 2: OTP */}
          {step === 'otp' && (
            <form onSubmit={verifyOtp} className="mt-4 space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[10px] font-bold tracking-[0.12em] text-slate-500 uppercase">
                    LOGIN CODE
                  </label>
                  {cooldown > 0 && (
                    <span className="text-[10px] text-slate-400 font-mono">{cooldown}s remaining</span>
                  )}
                </div>
                <input
                  type="text"
                  required
                  autoFocus
                  inputMode="numeric"
                  maxLength={8}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••••••"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-base font-mono tracking-[0.5em] text-center focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-slate-50"
                />
              </div>

              <button
                type="submit"
                disabled={loading || otp.length < 6}
                className="w-full py-2.5 text-sm font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                {loading ? 'Verifying…' : 'Verify Code'}
              </button>

              <button
                type="button"
                onClick={resendOtp}
                disabled={cooldown > 0 || loading}
                className="w-full py-2 text-xs text-blue-600 hover:text-blue-700 disabled:text-slate-400 disabled:cursor-not-allowed transition-colors"
              >
                {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
              </button>

              <button
                type="button"
                onClick={backToEmail}
                className="w-full text-xs text-slate-400 hover:text-slate-600 transition-colors"
              >
                ← Use a different email
              </button>
            </form>
          )}
        </div>

        {/* Warning box */}
        <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 flex items-center gap-2">
          <svg className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 15v2m0 0v1m0-1h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          <span className="text-[10px] font-bold tracking-[0.1em] text-amber-400 uppercase">
            Access is by Invitation Only
          </span>
        </div>

        {/* Sub text */}
        <p className="text-center text-[11px] text-slate-500 mb-6">
          Contact the administrator if you do not have an active industrial account.
        </p>

        {/* Footer badges */}
        <div className="flex items-center justify-center gap-4">
          <span className="text-[10px] text-slate-600 font-medium tracking-wide">© ISO 27001</span>
          <span className="text-[10px] text-slate-600 font-medium tracking-wide">≡ FSMA COMPLIANT</span>
          <span className="text-[10px] text-slate-600 font-medium tracking-wide">⊕ TLS 1.3 SECURE</span>
        </div>

      </div>
    </main>
  );
}
