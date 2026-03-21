'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';

import { FileUpload } from '@/components/FileUpload';
import { DataTable }  from '@/components/DataTable';
import { Summary }    from '@/components/Summary';
import { ApiResponse, ProcessedData } from '@/types';

// Chart uses window APIs — load only on the client side
const Chart = dynamic(
  () => import('@/components/Chart').then((m) => m.Chart),
  {
    ssr: false,
    loading: () => (
      <div className="h-72 flex items-center justify-center text-gray-400 text-sm">
        Loading chart…
      </div>
    ),
  }
);

const VALID_LINES = [
  'BLENDTECH CQC 1',
  'CQC 2',
  'DD OVEN',
  'KETTLE 1 SOUP',
  'KETTLE 2 DIRECT FILL',
  'KETTLE 3 DIRECT FILL',
  'KETTLE 4 KAPCOLD',
  'RICE KETTLE',
  'WOK',
];

type Tab = 'summary' | 'table' | 'chart';

export default function HomePage() {
  const [data, setData]         = useState<ProcessedData | null>(null);
  const [isLoading, setLoading] = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [warning, setWarning]   = useState<string | null>(null);
  const [activeTab, setTab]     = useState<Tab>('summary');

  // Called by FileUpload component when a response is received from the API
  function handleData(response: ApiResponse) {
    if (response.success && response.data) {
      setData(response.data);
      setWarning(response.warning ?? null);
      setError(null);
    } else {
      setError(response.error ?? 'An error occurred.');
      setData(null);
    }
  }

  function handleReset() {
    setData(null);
    setError(null);
    setWarning(null);
    setTab('summary');
  }

  // Derive quick stats
  const activeLines   = data ? Object.keys(data.totalsByLine).length : 0;
  const totalRows     = data ? data.filteredData.length : 0;
  const overallTotal  = data ? data.overallTotal : 0;

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50/40">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Logo mark */}
            <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center shadow-sm">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5
                     a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414
                     A1 1 0 0121 9.414V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <h1 className="text-base font-bold text-gray-900 leading-tight">
                Production Line Analyser
              </h1>
              <p className="text-xs text-gray-400">Excel → instant production insights</p>
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
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9
                     m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              New Upload
            </button>
          )}
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">

        {/* ── Upload panel (shown until data is loaded) ────────────────────── */}
        {!data && !isLoading && (
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-gray-900">Upload Production Data</h2>
              <p className="mt-2 text-gray-500 text-sm leading-relaxed">
                Upload an Excel file containing{' '}
                <code className="bg-gray-100 px-1.5 py-0.5 rounded font-mono text-xs">line</code>,{' '}
                <code className="bg-gray-100 px-1.5 py-0.5 rounded font-mono text-xs">product</code>, and{' '}
                <code className="bg-gray-100 px-1.5 py-0.5 rounded font-mono text-xs">quantity</code>{' '}
                columns. Rows are filtered to the nine valid production lines below.
              </p>
            </div>

            {/* Upload card */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
              <FileUpload
                onData={handleData}
                onLoading={setLoading}
                onError={setError}
              />
            </div>

            {/* Error (pre-upload file-type errors) */}
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
                    className="px-2 py-0.5 bg-white border border-blue-200 text-blue-700 text-xs rounded-full font-mono"
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
            <p className="text-sm text-gray-400 mt-1">Filtering and aggregating data</p>
          </div>
        )}

        {/* ── Results ──────────────────────────────────────────────────────── */}
        {data && !isLoading && (
          <div className="space-y-6 animate-results">

            {/* Warning banner */}
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

            {/* KPI cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { label: 'Filtered Rows',     value: totalRows.toLocaleString(),    color: 'text-blue-600' },
                { label: 'Active Lines',       value: activeLines.toString(),        color: 'text-green-600' },
                { label: 'Total Quantity',     value: overallTotal.toLocaleString(), color: 'text-purple-600' },
              ].map(({ label, value, color }) => (
                <div
                  key={label}
                  className="bg-white rounded-xl border border-gray-200 p-5 text-center shadow-sm"
                >
                  <p className={`text-3xl font-bold tabular-nums ${color}`}>{value}</p>
                  <p className="text-xs text-gray-500 mt-1 uppercase tracking-wider font-medium">{label}</p>
                </div>
              ))}
            </div>

            {/* Tab panel */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              {/* Tab bar */}
              <div className="border-b border-gray-200 flex overflow-x-auto">
                {(['summary', 'table', 'chart'] as Tab[]).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setTab(tab)}
                    className={`
                      px-6 py-3.5 text-sm font-medium whitespace-nowrap transition-colors
                      border-b-2 -mb-px
                      ${activeTab === tab
                        ? 'border-blue-600 text-blue-600 bg-blue-50/30'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                      }
                    `}
                  >
                    {tab === 'table'   ? 'Raw Data'
                     : tab === 'chart' ? 'Chart'
                     : 'Summary'}
                  </button>
                ))}
              </div>

              {/* Tab content */}
              <div className="p-6">
                {activeTab === 'summary' && (
                  <Summary totalsByLine={data.totalsByLine} overallTotal={data.overallTotal} />
                )}
                {activeTab === 'table' && (
                  <DataTable data={data.filteredData} />
                )}
                {activeTab === 'chart' && (
                  <Chart totalsByLine={data.totalsByLine} />
                )}
              </div>
            </div>

            {/* Post-results error (e.g. API errors after upload) */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
                <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
