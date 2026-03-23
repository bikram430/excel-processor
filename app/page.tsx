'use client';

import { useState } from 'react';
import { FileUpload }       from '@/components/FileUpload';
import { DataTable }        from '@/components/DataTable';
import { Summary }          from '@/components/Summary';
import { ProductionBoard }  from '@/components/ProductionBoard';
import { ApiResponse, ExcelRow, ProcessedData } from '@/types';
import { calculateBatches, hasButterChicken }   from '@/lib/batchCalculator';

const VALID_LINES = [
  'BLENDTECH',
  'CQC 1',
  'CQC 2',
  'DD OVEN',
  'KETTLE 1 SOUP',
  'KETTLE 2 DIRECT FILL',
  'KETTLE 3 DIRECT FILL',
  'KETTLE 4 KAPCOLD',
  'RICE KETTLE',
  'WOK',
];

export default function HomePage() {
  const [data, setData]                     = useState<ProcessedData | null>(null);
  const [enrichedRows, setEnrichedRows]     = useState<ExcelRow[]>([]);
  const [isLoading, setLoading]             = useState(false);
  const [error, setError]                   = useState<string | null>(null);
  const [warning, setWarning]               = useState<string | null>(null);
  const [showAnalytics, setShowAnalytics]   = useState(false);
  const [showBoard, setShowBoard]           = useState(false);

  // Butter Chicken batch size confirmation
  const [showBCModal, setShowBCModal]       = useState(false);
  const [pendingRows, setPendingRows]       = useState<ExcelRow[]>([]);
  const [bcBatchSize, setBcBatchSize]       = useState(1800);
  const [bcInput, setBcInput]               = useState('1800');

  function enrichAndStore(rows: ExcelRow[], bcCap: number) {
    const enriched = calculateBatches(rows, bcCap);
    setEnrichedRows(enriched);
  }

  function handleData(response: ApiResponse) {
    if (response.success && response.data) {
      const rawRows = response.data.filteredData;
      setData(response.data);
      setWarning(response.warning ?? null);
      setError(null);

      if (hasButterChicken(rawRows)) {
        // Ask user to confirm Butter Chicken batch cap before enriching
        setPendingRows(rawRows);
        setBcBatchSize(1800);
        setBcInput('1800');
        setShowBCModal(true);
      } else {
        enrichAndStore(rawRows, 1800);
      }
    } else {
      setError(response.error ?? 'An error occurred.');
      setData(null);
      setEnrichedRows([]);
    }
  }

  function handleBCConfirm() {
    const cap = parseInt(bcInput, 10);
    const safeCap = isNaN(cap) || cap <= 0 ? 1800 : Math.min(cap, 2000);
    setBcBatchSize(safeCap);
    enrichAndStore(pendingRows, safeCap);
    setShowBCModal(false);
    setPendingRows([]);
  }

  function handleReset() {
    setData(null);
    setEnrichedRows([]);
    setError(null);
    setWarning(null);
    setShowAnalytics(false);
    setShowBoard(false);
    setShowBCModal(false);
  }

  return (
    <main className="min-h-screen bg-slate-50">

      {/* ── Sticky header ───────────────────────────────────────────────── */}
      <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-20">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shadow-sm">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2
                     h5.586a1 1 0 01.707.293l5.414 5.414A1 1 0 0121 9.414V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <h1 className="text-sm font-bold text-gray-900 leading-tight">
                Production Line Analyser
              </h1>
              <p className="text-xs text-gray-400 hidden sm:block">
                Upload → filter → batch → board
              </p>
            </div>
          </div>

          {data && (
            <button
              onClick={handleReset}
              className="inline-flex items-center gap-1.5 text-sm text-gray-500
                         hover:text-blue-600 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0
                     0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              New Upload
            </button>
          )}
        </div>
      </header>

      {/* ── Butter Chicken modal ─────────────────────────────────────────── */}
      {showBCModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-6 w-full max-w-sm mx-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center">
                <svg className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667
                       1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h2 className="font-bold text-gray-900">Butter Chicken — Batch Size</h2>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              <strong>Butter Chicken</strong> has a variable batch capacity. The default is{' '}
              <span className="font-mono font-semibold">1800 kg</span>. Enter the confirmed capacity
              for this run:
            </p>
            <input
              type="number"
              value={bcInput}
              onChange={(e) => setBcInput(e.target.value)}
              min={500}
              max={2000}
              step={50}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono
                         focus:outline-none focus:ring-2 focus:ring-blue-400 mb-4"
            />
            <div className="flex gap-2">
              <button
                onClick={() => { setBcInput('1800'); handleBCConfirm(); }}
                className="flex-1 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg
                           hover:bg-gray-50 transition-colors"
              >
                Use Default (1800)
              </button>
              <button
                onClick={handleBCConfirm}
                className="flex-1 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg
                           hover:bg-blue-700 transition-colors"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-screen-xl mx-auto px-3 sm:px-6 py-5 sm:py-8">

        {/* ── Upload panel ─────────────────────────────────────────────────── */}
        {!data && !isLoading && (
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-6">
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Upload Production Data</h2>
              <p className="mt-2 text-sm text-gray-500 leading-relaxed">
                Upload your Excel file. Rows matching valid production lines will be extracted and made available to download.
              </p>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 sm:p-6">
              <FileUpload onData={handleData} onLoading={setLoading} onError={setError} />
            </div>

            {error && (
              <div className="mt-4 bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
                <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <p className="text-sm font-semibold text-red-700">Error</p>
                  <p className="text-sm text-red-600 mt-0.5">{error}</p>
                </div>
              </div>
            )}

            {/* Valid lines reference */}
            <div className="mt-5 bg-blue-50 border border-blue-100 rounded-xl p-4">
              <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider mb-2">
                Valid Production Lines
              </p>
              <div className="flex flex-wrap gap-1.5">
                {VALID_LINES.map((line) => (
                  <span
                    key={line}
                    className="px-2 py-0.5 bg-white border border-blue-200 text-blue-700
                               text-xs rounded-full font-mono"
                  >
                    {line}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Loading spinner ──────────────────────────────────────────────── */}
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-24">
            <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
            <p className="mt-5 text-gray-600 font-medium">Processing your Excel file…</p>
            <p className="text-sm text-gray-400 mt-1">Filtering and grouping production lines</p>
          </div>
        )}

        {/* ── Results ──────────────────────────────────────────────────────── */}
        {data && !isLoading && (
          <div className="space-y-6">

            {/* Warning */}
            {warning && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
                <svg className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667
                       1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0
                       L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <p className="text-sm text-amber-700">{warning}</p>
              </div>
            )}

            {/* ── Production Board (top) ────────────────────────────────────── */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <button
                onClick={() => setShowBoard((v) => !v)}
                className="w-full flex items-center justify-between px-4 sm:px-6 py-4
                           text-left hover:bg-gray-50 transition-colors min-h-[52px]"
              >
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                  </svg>
                  <span className="font-semibold text-gray-700">Production Board</span>
                  <span className="text-xs text-gray-400">(Blendtech &amp; Kettles)</span>
                </div>
                <svg
                  className={`w-5 h-5 text-gray-400 transition-transform duration-200
                              ${showBoard ? 'rotate-180' : ''}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {showBoard && (
                <div className="border-t border-gray-200 p-3 sm:p-6">
                  <ProductionBoard data={enrichedRows.length > 0 ? enrichedRows : data.filteredData} />
                </div>
              )}
            </div>

            {/* ── Filtered production line tables ────────────────────────────── */}
            <DataTable data={enrichedRows.length > 0 ? enrichedRows : data.filteredData} />

            {/* ── Analytics accordion (Summary) ─────────────────────────────── */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <button
                onClick={() => setShowAnalytics((v) => !v)}
                className="w-full flex items-center justify-between px-4 sm:px-6 py-4
                           text-left hover:bg-gray-50 transition-colors min-h-[52px]"
              >
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0
                         002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2
                         2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2
                         2 0 01-2-2z" />
                  </svg>
                  <span className="font-semibold text-gray-700">Analytics</span>
                  <span className="text-xs text-gray-400">(Summary)</span>
                </div>
                <svg
                  className={`w-5 h-5 text-gray-400 transition-transform duration-200
                              ${showAnalytics ? 'rotate-180' : ''}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {showAnalytics && (
                <div className="border-t border-gray-200 p-3 sm:p-6">
                  <Summary
                    filteredData={data.filteredData}
                    overallTotal={data.overallTotal}
                  />
                </div>
              )}
            </div>

          </div>
        )}
      </div>
    </main>
  );
}
