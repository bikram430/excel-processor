'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { RecipeFilesTab } from '@/components/RecipeFilesTab';
import { listRuns, getRun, uploadAndRun, createRunFromBatches, RunSummary, BatchEntry } from '@/lib/apiClient';

type Stage = 'idle' | 'uploading' | 'polling' | 'done' | 'error';

interface RecipesSectionProps {
  /** Batch data already computed from the Production tab upload — skips re-upload */
  currentBatches?: BatchEntry[];
  pendingRunId?: string | null;
}

export function RecipesSection({ currentBatches, pendingRunId }: RecipesSectionProps) {
  const [stage, setStage]         = useState<Stage>('idle');
  const [runId, setRunId]         = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState('');
  const [recentRuns, setRecentRuns] = useState<RunSummary[]>([]);
  const [loadingRuns, setLoadingRuns] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const hasBatches = currentBatches && currentBatches.length > 0;

  // ── If a run was started from the Production tab, begin polling it ────────
  useEffect(() => {
    if (pendingRunId && stage === 'idle') {
      setRunId(pendingRunId);
      setStage('done');
    }
  }, [pendingRunId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load recent runs on mount ─────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setLoadingRuns(true);
    listRuns(8)
      .then((runs) => { if (!cancelled) setRecentRuns(runs); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoadingRuns(false); });
    return () => { cancelled = true; };
  }, []);

  // ── Poll run status while running ─────────────────────────────────────────
  const startPolling = useCallback((id: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const s = await getRun(id);
        if (s.status === 'done') {
          clearInterval(pollRef.current!);
          setStage('done');
          setRecentRuns((prev) => {
            const updated = prev.map((r) => r.id === id ? { ...r, status: 'done' as const } : r);
            return updated.some((r) => r.id === id)
              ? updated
              : [{ id, status: 'done', created_at: new Date().toISOString() }, ...prev];
          });
        } else if (s.status === 'error') {
          clearInterval(pollRef.current!);
          setStage('error');
          setStatusMsg(s.message ?? 'Pipeline failed.');
        } else {
          setStatusMsg(s.status === 'running' ? 'Generating recipe files…' : 'Queued…');
        }
      } catch { /* keep polling */ }
    }, 3000);
  }, []);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  // ── Start a run from the already-calculated batch data ────────────────────
  async function handleGenerateFromBatches() {
    if (!currentBatches?.length) return;
    try {
      setStage('uploading');
      setStatusMsg('Sending batch data to backend…');
      const run = await createRunFromBatches(currentBatches);
      setRunId(run.run_id);
      setStage('polling');
      setStatusMsg('Queued…');
      setRecentRuns((prev) => [
        { id: run.run_id, status: 'queued', created_at: new Date().toISOString() },
        ...prev,
      ]);
      startPolling(run.run_id);
    } catch (e: unknown) {
      setStage('error');
      const msg = (e as Error).message ?? '';
      setStatusMsg(isConnectionError(msg)
        ? 'Backend is not running. Start it with:\n  cd backend\n  uvicorn main:app --reload'
        : msg || 'Failed to start recipe generation.');
    }
  }

  // ── Upload a file and start a run ─────────────────────────────────────────
  async function handleFile(file: File) {
    if (!file.name.endsWith('.xlsx')) {
      setStage('error');
      setStatusMsg('Please upload an Excel (.xlsx) file.');
      return;
    }
    try {
      setStage('uploading');
      setStatusMsg('Uploading…');
      const run = await uploadAndRun(file);
      setRunId(run.run_id);
      setStage('polling');
      setStatusMsg('Queued…');
      setRecentRuns((prev) => [
        { id: run.run_id, status: 'queued', created_at: new Date().toISOString() },
        ...prev,
      ]);
      startPolling(run.run_id);
    } catch (e: unknown) {
      setStage('error');
      const msg = (e as Error).message ?? '';
      setStatusMsg(isConnectionError(msg)
        ? 'Backend is not running. Start it with:\n  cd backend\n  uvicorn main:app --reload'
        : msg || 'Upload failed.');
    }
  }

  function onFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  function openRun(id: string) {
    if (pollRef.current) clearInterval(pollRef.current);
    setRunId(id);
    setStage('done');
  }

  function reset() {
    if (pollRef.current) clearInterval(pollRef.current);
    setStage('idle');
    setRunId(null);
    setStatusMsg('');
  }

  // ─────────────────────────────────────────────────────────────────────────

  if (stage === 'done' && runId) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Recipe Files</h2>
            <p className="text-xs text-gray-400 font-mono mt-0.5">{runId}</p>
          </div>
          <button onClick={reset}
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-blue-600 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0
                   0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Back
          </button>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 sm:p-6">
          <RecipeFilesTab runId={runId} />
        </div>
      </div>
    );
  }

  const isRunning = stage === 'uploading' || stage === 'polling';

  return (
    <div className="max-w-2xl mx-auto space-y-6">

      <div className="text-center">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Print Recipe Batches</h2>
        <p className="mt-2 text-sm text-gray-500">
          Generate scaled recipe batch files for every product in your production plan.
        </p>
      </div>

      {/* ── Running state ──────────────────────────────────────────────────── */}
      {isRunning && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-10 flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
          <p className="text-gray-600 font-medium">{statusMsg}</p>
          <p className="text-xs text-gray-400">This may take a minute while recipes are generated</p>
        </div>
      )}

      {/* ── Primary action — use existing production data (no re-upload) ───── */}
      {!isRunning && hasBatches && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="font-semibold text-gray-800">Production plan loaded</p>
              <p className="text-sm text-gray-500 mt-0.5">
                {currentBatches!.length} product{currentBatches!.length !== 1 ? 's' : ''} with calculated batch sizes
                — ready to generate recipe files.
              </p>
            </div>
          </div>
          <button
            onClick={handleGenerateFromBatches}
            className="mt-4 w-full inline-flex items-center justify-center gap-2 px-4 py-2.5
                       text-sm font-semibold text-white bg-emerald-600 rounded-xl
                       hover:bg-emerald-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0
                   002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2
                   0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Generate Recipe Files
          </button>
        </div>
      )}

      {/* ── Upload widget (fallback or when no production data) ─────────────── */}
      {!isRunning && (
        <div>
          {hasBatches && (
            <p className="text-xs text-gray-400 text-center mb-3">
              — or upload a different production file —
            </p>
          )}
          <label
            onDrop={onDrop}
            onDragOver={(e) => e.preventDefault()}
            className="bg-white rounded-2xl border-2 border-dashed border-gray-200
                       hover:border-blue-400 transition-colors p-8 flex flex-col items-center
                       gap-3 cursor-pointer group"
          >
            <input type="file" accept=".xlsx" className="sr-only" onChange={onFileInput} />
            <div className="w-12 h-12 rounded-xl bg-blue-50 group-hover:bg-blue-100 transition-colors
                            flex items-center justify-center">
              <svg className="w-6 h-6 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            <div className="text-center">
              <p className="font-semibold text-gray-700 group-hover:text-blue-600 transition-colors text-sm">
                Upload production plan
              </p>
              <p className="text-xs text-gray-400 mt-0.5">.xlsx files only</p>
            </div>
          </label>
        </div>
      )}

      {/* ── Error ──────────────────────────────────────────────────────────── */}
      {stage === 'error' && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p className="text-sm font-semibold text-red-700">Error</p>
            <pre className="text-sm text-red-600 mt-0.5 whitespace-pre-wrap font-sans">{statusMsg}</pre>
          </div>
        </div>
      )}

      {/* ── Recent runs ────────────────────────────────────────────────────── */}
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Recent Runs</p>
        {loadingRuns ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => <div key={i} className="animate-pulse h-12 bg-gray-100 rounded-xl" />)}
          </div>
        ) : recentRuns.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">No runs yet.</p>
        ) : (
          <div className="space-y-2">
            {recentRuns.map((run) => (
              <button
                key={run.id}
                onClick={() => run.status === 'done' ? openRun(run.id) : undefined}
                disabled={run.status !== 'done'}
                className="w-full flex items-center gap-3 px-4 py-3 bg-white border border-gray-200
                           rounded-xl text-left hover:border-blue-300 transition-colors
                           disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <StatusDot status={run.status} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-mono text-gray-700 truncate">{run.id}</p>
                  {run.notes && <p className="text-xs text-gray-400 truncate">{run.notes}</p>}
                </div>
                <span className="text-xs text-gray-400 whitespace-nowrap">
                  {new Date(run.created_at).toLocaleDateString()}
                </span>
                {run.status === 'done' && (
                  <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const cls = {
    done:    'bg-green-400',
    running: 'bg-blue-400 animate-pulse',
    queued:  'bg-amber-400 animate-pulse',
    error:   'bg-red-400',
  }[status] ?? 'bg-gray-300';
  return <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${cls}`} />;
}

function isConnectionError(msg: string): boolean {
  return /connection refused|failed to fetch|network|ECONNREFUSED/i.test(msg);
}
