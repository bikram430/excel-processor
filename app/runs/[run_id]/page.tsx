'use client';

import { useEffect, useState } from 'react';
import { useParams }           from 'next/navigation';
import { RecipeFilesTab }      from '@/components/RecipeFilesTab';
import { getRun, RunStatus }   from '@/lib/apiClient';

// ─── Tabs ─────────────────────────────────────────────────────────────────────

const TABS = ['Overview', 'Production Board', 'Recipes'] as const;
type Tab = (typeof TABS)[number];

// ─── Status pill ──────────────────────────────────────────────────────────────

function StatusPill({ status }: { status: RunStatus['status'] }) {
  const map: Record<RunStatus['status'], { label: string; cls: string }> = {
    received: { label: 'Received', cls: 'bg-amber-100 text-amber-700' },
    queued:  { label: 'Queued',  cls: 'bg-gray-100 text-gray-600' },
    running: { label: 'Running', cls: 'bg-blue-100 text-blue-700 animate-pulse' },
    done:    { label: 'Done',    cls: 'bg-green-100 text-green-700' },
    error:   { label: 'Error',   cls: 'bg-red-100 text-red-700' },
  };
  const { label, cls } = map[status] ?? { label: status, cls: 'bg-gray-100 text-gray-500' };
  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${cls}`}>
      {label}
    </span>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RunPage() {
  const params            = useParams<{ run_id: string }>();
  const runId             = params.run_id;

  const [run, setRun]     = useState<RunStatus | null>(null);
  const [tab, setTab]     = useState<Tab>('Overview');
  const [loadErr, setErr] = useState<string | null>(null);

  // Poll run status until done or error
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      try {
        const status = await getRun(runId);
        setRun(status);
        if (status.status === 'queued' || status.status === 'running') {
          timer = setTimeout(poll, 3_000);
        }
      } catch (e: unknown) {
        setErr((e as Error).message ?? 'Failed to load run.');
      }
    }

    poll();
    return () => clearTimeout(timer);
  }, [runId]);

  if (loadErr) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-700 text-sm max-w-md text-center">
          {loadErr}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50">
      {/* ── Header ── */}
      <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-20">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-3.5 flex items-center gap-3">
          <a href="/" className="text-gray-400 hover:text-blue-600 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </a>
          <div>
            <h1 className="text-sm font-bold text-gray-900 leading-tight">Run detail</h1>
            <p className="text-xs text-gray-400 font-mono">{runId}</p>
          </div>
          {run && (
            <div className="ml-auto">
              <StatusPill status={run.status} />
            </div>
          )}
        </div>
      </header>

      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-6">
        {/* ── Tab bar ── */}
        <div className="flex gap-1 border-b border-gray-200 mb-6">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors
                ${tab === t
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* ── Tab content ── */}
        {tab === 'Overview' && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
            {run ? (
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-1">Run ID</dt>
                  <dd className="font-mono text-gray-800 break-all">{runId}</dd>
                </div>
                <div>
                  <dt className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-1">Status</dt>
                  <dd><StatusPill status={run.status} /></dd>
                </div>
                {run.message && (
                  <div className="sm:col-span-2">
                    <dt className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-1">Message</dt>
                    <dd className="text-red-600">{run.message}</dd>
                  </div>
                )}
              </dl>
            ) : (
              <div className="animate-pulse space-y-3">
                <div className="h-4 bg-gray-100 rounded w-1/3" />
                <div className="h-4 bg-gray-100 rounded w-1/4" />
              </div>
            )}
          </div>
        )}

        {tab === 'Production Board' && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 text-sm text-gray-500">
            Production board coming soon.
          </div>
        )}

        {/* ── Tab 3: Recipes ── */}
        {tab === 'Recipes' && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 sm:p-6">
            <RecipeFilesTab runId={runId} />
          </div>
        )}
      </div>
    </main>
  );
}
