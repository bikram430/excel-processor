'use client';

import { useEffect, useState } from 'react';
import { listRuns, startRun, RunSummary } from '@/lib/apiClient';

interface Props {
  onStartProcessing: (run: RunSummary) => void;
  onViewFiles: (runId: string) => void;
}

function isEmailRun(run: RunSummary): boolean {
  return (run.notes ?? '').toLowerCase().startsWith('[email]');
}

function label(notes: string): string {
  return notes.replace(/^\[email\]\s*/i, '');
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-NZ', {
    day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

export function RecentEmailRuns({ onStartProcessing, onViewFiles }: Props) {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [starting, setStarting] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const all = await listRuns(20);
        if (!cancelled) setRuns(all.filter(isEmailRun).slice(0, 5));
      } catch { /* silent */ }
    }
    load();
    const t = setInterval(load, 20_000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  if (runs.length === 0) return null;

  async function handleStart(run: RunSummary) {
    if (starting) return;
    setStarting(run.id);
    try {
      await startRun(run.id);
      setRuns(prev => prev.map(r => r.id === run.id ? { ...r, status: 'running' } : r));
      onStartProcessing(run);
    } catch { /* silent */ }
    finally { setStarting(null); }
  }

  return (
    <div className="mb-6">
      <p className="text-[10px] font-bold tracking-[0.15em] text-slate-400 uppercase mb-2">
        Recent Email Runs
      </p>
      <div className="space-y-2">
        {runs.map(run => {
          const isQueued  = run.status === 'queued';
          const isRunning = run.status === 'running';
          const isDone    = run.status === 'done';
          const isError   = run.status === 'error';

          return (
            <div key={run.id}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl border bg-white border-gray-100">
              {/* Status dot */}
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                isQueued  ? 'bg-amber-400' :
                isRunning ? 'bg-blue-500 animate-pulse' :
                isDone    ? 'bg-emerald-500' :
                            'bg-red-400'
              }`} />

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-gray-800 truncate">
                  {label(run.notes ?? '')}
                </p>
                <p className="text-[10px] text-slate-400">{formatDate(run.created_at)}</p>
              </div>

              {/* Status / action */}
              {isQueued && (
                <button
                  onClick={() => handleStart(run)}
                  disabled={!!starting}
                  className="flex-shrink-0 px-2.5 py-1 text-[11px] font-bold text-white bg-amber-500 rounded-lg hover:bg-amber-600 disabled:opacity-50 transition-colors"
                >
                  {starting === run.id ? 'Starting…' : 'Start →'}
                </button>
              )}
              {isRunning && (
                <span className="flex-shrink-0 text-[11px] font-semibold text-blue-600">Processing…</span>
              )}
              {isDone && (
                <button
                  onClick={() => onViewFiles(run.id)}
                  className="flex-shrink-0 px-2.5 py-1 text-[11px] font-bold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors"
                >
                  View →
                </button>
              )}
              {isError && (
                <span className="flex-shrink-0 text-[11px] text-red-400">Failed</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
