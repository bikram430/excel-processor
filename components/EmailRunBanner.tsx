'use client';

import { useEffect, useState } from 'react';
import { listRuns, startRun, RunSummary } from '@/lib/apiClient';
export type { RunSummary };

interface Props {
  onView: (run: RunSummary) => void;
  onStartProcessing?: (run: RunSummary) => void;
  activeBoardRunId?: string;
}

const MAX_AGE_MS = 4 * 60 * 60 * 1000;
const DISMISSED_KEY = 'ep_dismissed_run';

function isEmailRun(run: RunSummary): boolean {
  const n = (run.notes ?? '').toLowerCase();
  return n.startsWith('[email]') || n.includes('auto-uploaded') || n.includes('fwd');
}

export function EmailRunBanner({ onView, onStartProcessing, activeBoardRunId }: Props) {
  const [run, setRun] = useState<RunSummary | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const runs = await listRuns(10);
        if (cancelled || runs.length === 0) return;

        const dismissed = sessionStorage.getItem(DISMISSED_KEY);

        // Only show email runs — prefer done > queued > running, all newest-first
        const emailRuns = runs.filter(r =>
          r.status !== 'error' &&
          r.id !== dismissed &&
          isEmailRun(r) &&
          (Date.now() - new Date(r.created_at).getTime()) <= MAX_AGE_MS
        );

        // Pick the most recent done first, then queued, then running
        const match =
          emailRuns.find(r => r.status === 'done') ??
          emailRuns.find(r => r.status === 'queued') ??
          emailRuns.find(r => r.status === 'running') ??
          null;

        if (!cancelled) setRun(match);
      } catch { /* silent */ }
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
      setRun({ ...run, status: 'running' });
      onStartProcessing?.(run);
    } catch {
      // ignore — banner re-polls
    } finally {
      setStarting(false);
    }
  }

  const awaitingStart = run.status === 'queued';
  const isReady       = run.status === 'done';
  const isWorking     = run.status === 'running';

  const colors = awaitingStart
    ? { bg: 'bg-amber-50',   border: 'border-amber-200',   dot: 'bg-amber-500',   title: 'text-amber-900',   sub: 'text-amber-700',   dismiss: 'text-amber-400 hover:text-amber-700' }
    : isReady
    ? { bg: 'bg-emerald-50', border: 'border-emerald-200', dot: 'bg-emerald-500', title: 'text-emerald-900', sub: 'text-emerald-700', dismiss: 'text-emerald-400 hover:text-emerald-700' }
    : isWorking
    ? { bg: 'bg-blue-50',    border: 'border-blue-200',    dot: 'bg-blue-500',    title: 'text-blue-900',   sub: 'text-blue-600',    dismiss: 'text-blue-400 hover:text-blue-700' }
    : { bg: 'bg-red-50',     border: 'border-red-200',     dot: 'bg-red-500',     title: 'text-red-900',    sub: 'text-red-600',     dismiss: 'text-red-400 hover:text-red-700' };

  // Strip [email] prefix and [sha256:...] suffix from display
  const displayNotes = (run.notes ?? '')
    .replace(/^\[email\]\s*/i, '')
    .replace(/\s*\[sha256:[a-f0-9]+\]/i, '');

  return (
    <div className={`mb-5 flex items-center gap-3 px-4 py-3 rounded-xl border ${colors.bg} ${colors.border}`}>
      <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${colors.dot} ${isWorking ? 'animate-pulse' : ''}`} />

      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold ${colors.title}`}>
          {awaitingStart ? 'Production plan received — ready to process' :
           isReady       ? 'Production plan ready — click to load board' :
           isWorking     ? 'Production plan processing…' :
                           'Production plan failed'}
        </p>
        <p className={`text-xs mt-0.5 truncate ${colors.sub}`}>
          {displayNotes} · {formatDate(run.created_at)}
        </p>
      </div>

      {awaitingStart && (
        <button
          onClick={handleStart}
          disabled={starting}
          className="flex-shrink-0 px-3 py-1.5 text-xs font-bold text-white bg-amber-500 rounded-lg hover:bg-amber-600 disabled:opacity-60 transition-colors"
        >
          {starting ? 'Starting…' : 'Start Processing →'}
        </button>
      )}

      {isReady && (
        activeBoardRunId === run.id
          ? <span className="flex-shrink-0 text-xs font-semibold text-emerald-700">Board loaded ✓</span>
          : <button
              onClick={() => onView(run)}
              className="flex-shrink-0 px-3 py-1.5 text-xs font-bold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors"
            >
              Load Board →
            </button>
      )}

      <button onClick={dismiss} aria-label="Dismiss"
        className={`flex-shrink-0 p-1 rounded transition-colors ${colors.dismiss}`}>
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
