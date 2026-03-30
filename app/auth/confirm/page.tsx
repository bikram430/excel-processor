'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getSupabaseClient } from '@/lib/supabase-client';

function ConfirmContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const token_hash = searchParams.get('token_hash');
    const type       = searchParams.get('type') ?? 'invite';
    const next       = searchParams.get('next') ?? '/';

    if (!token_hash) {
      setErrorMsg('Invalid confirmation link — missing token.');
      return;
    }

    async function confirm() {
      try {
        const sb = getSupabaseClient();

        // Exchange the invitation token for a live session
        const { data, error: verifyErr } = await sb.auth.verifyOtp({
          token_hash: token_hash!,
          type: type as 'invite' | 'email' | 'magiclink' | 'recovery',
        });
        if (verifyErr) throw verifyErr;

        const user  = data.user;
        const accessToken = data.session?.access_token;

        // Auto-register the invited user in approved_emails so future
        // OTP logins don't require manual admin approval.
        if (user?.email && accessToken) {
          await fetch(
            `/api/auth/check-approved?email=${encodeURIComponent(user.email)}`,
            { headers: { Authorization: `Bearer ${accessToken}` } },
          ).catch(() => { /* best-effort; don't block navigation */ });
        }

        router.replace(next.startsWith('/') ? next : '/');
      } catch (e: unknown) {
        setErrorMsg((e as Error).message ?? 'Confirmation failed. The link may have expired.');
      }
    }

    confirm();
  }, [searchParams, router]);

  if (errorMsg) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-900 px-4">
        <div className="bg-white rounded-2xl p-8 max-w-md w-full text-center shadow-xl">
          <p className="text-lg font-bold text-red-600 mb-2">Confirmation Failed</p>
          <p className="text-sm text-slate-600 mb-4">{errorMsg}</p>
          <a
            href="/login"
            className="inline-block text-sm text-blue-600 hover:underline"
          >
            ← Back to login
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-900">
      <div className="w-10 h-10 border-4 border-blue-900 border-t-blue-500 rounded-full animate-spin" />
    </main>
  );
}

export default function AuthConfirmPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen flex items-center justify-center bg-slate-900">
          <div className="w-10 h-10 border-4 border-blue-900 border-t-blue-500 rounded-full animate-spin" />
        </main>
      }
    >
      <ConfirmContent />
    </Suspense>
  );
}
