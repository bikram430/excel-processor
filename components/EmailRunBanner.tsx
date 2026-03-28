'use client';

import { useEffect, useState } from 'react';
import { listRuns, RunSummary } from '@/lib/apiClient';

interface Props {
  /** Called when user clicks "View Files" — receives the run id */
  onView: (runId: string) => void;
}

// Only show banner for runs created within the last 4 hours
const MAX_AGE_MS = 4 * 60 * 60 * 1000;
// sessionStorage key — banner stays dismissed across page navigation but resets on tab close
const DISMISSED_KEY = 'ep_dismissed_run';

export function EmailRunBanner({ onView }: Props) {
  const [run, setRun] = useState<RunSummary | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const runs = await listRuns(1);
        if (cancelled || runs.length === 0) return;
        const latest = runs[0];

        // Must be recent
        const age = Date.now() - new Date(latest.created_at).getTime();
        if (age > MAX_AGE_MS) return;

        // Must not be dismissed
        const dismissed = sessionStorage.getItem(DISMISSED_KEY);
        if (dismissed === latest.id) return;

        // Only show if notes suggest it came from the email automation
        const fromEmail = latest.notes?.toLowerCase().includes('email') ||
                          latest.notes?.toLowerCase().includes('auto');

        // Show if from email automation, OR if queued/running (user should know)
        if (fromEmail || latest.status === 'queued' || latest.status === 'running') {
          if (!cancelled) setRun(latest);
        }
      } catch { /* silent — don't break the page if backend is down */ }
    }

    check();
    const timer = setInterval(check, 60_000);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);

  if (!run) return null;

  function dismiss() {
    sessionStorage.setItem(DISMISSED_KEY, run!.id);
    setRun(null);
  }

  const isReady   = run.status === 'done';
  const isWorking = run.status === 'queued' || run.status === 'running';

  return (
    <div className={`mb-5 flex items-center gap-3 px-4 py-3 rounded-xl border ${
      isReady   ? 'bg-emerald-50 border-emerald-200' :
      isWorking ? 'bg-blue-50 border-blue-200' :
                  'bg-red-50 border-red-200'
    }`}>
      {/* Status dot */}
      <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
        isReady   ? 'bg-emerald-500' :
        isWorking ? 'bg-blue-500 animate-pulse' :
                    'bg-red-500'
      }`} />

      {/* Text */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold ${
          isReady ? 'text-emerald-900' : isWorking ? 'text-blue-900' : 'text-red-900'
        }`}>
          {isReady   ? 'Production plan ready' :
           isWorking ? 'Production plan processing…' :
                       'Production plan failed'}
        </p>
        <p className={`text-xs mt-0.5 truncate ${
          isReady ? 'text-emerald-700' : isWorking ? 'text-blue-600' : 'text-red-600'
        }`}>
          {run.notes ?? 'Auto-uploaded from email'} · {formatDate(run.created_at)}
        </p>
      </div>

      {/* Action */}
      {isReady && (
        <button
          onClick={() => { onView(run.id); dismiss(); }}
          className="flex-shrink-0 px-3 py-1.5 text-xs font-bold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors"
        >
          View Files →
        </button>
      )}

      {/* Dismiss */}
      <button
        onClick={dismiss}
        aria-label="Dismiss"
        className={`flex-shrink-0 p-1 rounded transition-colors ${
          isReady   ? 'text-emerald-400 hover:text-emerald-700' :
          isWorking ? 'text-blue-400 hover:text-blue-700' :
                      'text-red-400 hover:text-red-700'
        }`}
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-NZ', {
    day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
}
