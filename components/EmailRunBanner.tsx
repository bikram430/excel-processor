'use client';

import { useEffect, useState } from 'react';
import { listRuns, startRun, RunSummary } from '@/lib/apiClient';

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
  const [starting, setStarting] = useState(false);

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

        // Only show if notes suggest it came from email automation
        const fromEmail = latest.notes?.toLowerCase().includes('email') ||
                          latest.notes?.toLowerCase().includes('auto');

        // Show if from email (any status) or if still in-progress
        if (fromEmail || latest.status === 'received' || latest.status === 'queued' || latest.status === 'running') {
          if (!cancelled) setRun(latest);
        }
      } catch { /* silent — don't break the page if backend is down */ }
    }

    check();
    const timer = setInterval(check, 15_000);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);

  if (!run) return null;

  function dismiss() {
    sessionStorage.setItem(DISMISSED_KEY, run!.id);
    setRun(null);
  }

  async function handleStart() {
    if (!run || starting) return;
    setStarting(true);
    try {
      await startRun(run.id);
      setRun({ ...run, status: 'queued' });
    } catch {
      // ignore — banner will re-poll
    } finally {
      setStarting(false);
    }
  }

  const isReceived = run.status === 'received';
  const isReady    = run.status === 'done';
  const isWorking  = run.status === 'queued' || run.status === 'running';

  const colors = isReceived
    ? { bg: 'bg-amber-50', border: 'border-amber-200', dot: 'bg-amber-500', title: 'text-amber-900', sub: 'text-amber-700', dismiss: 'text-amber-400 hover:text-amber-700' }
    : isReady
    ? { bg: 'bg-emerald-50', border: 'border-emerald-200', dot: 'bg-emerald-500', title: 'text-emerald-900', sub: 'text-emerald-700', dismiss: 'text-emerald-400 hover:text-emerald-700' }
    : isWorking
    ? { bg: 'bg-blue-50', border: 'border-blue-200', dot: 'bg-blue-500', title: 'text-blue-900', sub: 'text-blue-600', dismiss: 'text-blue-400 hover:text-blue-700' }
    : { bg: 'bg-red-50', border: 'border-red-200', dot: 'bg-red-500', title: 'text-red-900', sub: 'text-red-600', dismiss: 'text-red-400 hover:text-red-700' };

  return (
    <div className={`mb-5 flex items-center gap-3 px-4 py-3 rounded-xl border ${colors.bg} ${colors.border}`}>
      {/* Status dot */}
      <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${colors.dot} ${isWorking ? 'animate-pulse' : ''}`} />

      {/* Text */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold ${colors.title}`}>
          {isReceived ? 'Production plan received — ready to process' :
           isReady    ? 'Production plan ready' :
           isWorking  ? 'Production plan processing…' :
                        'Production plan failed'}
        </p>
        <p className={`text-xs mt-0.5 truncate ${colors.sub}`}>
          {run.notes ?? 'Auto-uploaded from email'} · {formatDate(run.created_at)}
        </p>
      </div>

      {/* Action buttons */}
      {isReceived && (
        <button
          onClick={handleStart}
          disabled={starting}
          className="flex-shrink-0 px-3 py-1.5 text-xs font-bold text-white bg-amber-500 rounded-lg hover:bg-amber-600 disabled:opacity-60 transition-colors"
        >
          {starting ? 'Starting…' : 'Start Processing →'}
        </button>
      )}

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
        className={`flex-shrink-0 p-1 rounded transition-colors ${colors.dismiss}`}
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
