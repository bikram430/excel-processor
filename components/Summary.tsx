'use client';

import { LineStats } from '@/types';

interface SummaryProps {
  totalsByLine: Record<string, LineStats>;
  overallTotal: number;
}

/** Build a CSV for the summary table and trigger browser download */
function exportSummaryCSV(totalsByLine: Record<string, LineStats>, overallTotal: number) {
  const totalRows = Object.values(totalsByLine).reduce((s, v) => s + v.count, 0);
  const header = ['Line', 'Total Quantity', 'Entry Count'].join(',');
  const rows   = Object.entries(totalsByLine)
    .sort(([, a], [, b]) => b.totalQuantity - a.totalQuantity)
    .map(([line, stats]) =>
      [`"${line}"`, stats.totalQuantity, stats.count].join(',')
    );
  rows.push(['"OVERALL TOTAL"', overallTotal, totalRows].join(','));

  const csv  = [header, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement('a'), { href: url, download: 'production-summary.csv' });
  link.click();
  URL.revokeObjectURL(url);
}

export function Summary({ totalsByLine, overallTotal }: SummaryProps) {
  const entries = Object.entries(totalsByLine);

  if (entries.length === 0) {
    return (
      <div className="text-center py-10 text-gray-400">
        <p>No summary data available.</p>
      </div>
    );
  }

  // Sort descending by quantity; identify the top line
  const sorted = [...entries].sort(([, a], [, b]) => b.totalQuantity - a.totalQuantity);
  const topLine = sorted[0][0];

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <p className="text-sm text-gray-500">
          <span className="font-semibold text-gray-700">{entries.length}</span> active
          line{entries.length !== 1 ? 's' : ''}
        </p>
        <button
          onClick={() => exportSummaryCSV(totalsByLine, overallTotal)}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium
                     text-purple-700 bg-purple-50 border border-purple-200 rounded-lg
                     hover:bg-purple-100 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Export Summary CSV
        </button>
      </div>

      {/* Line cards */}
      <div className="grid gap-3">
        {sorted.map(([line, stats]) => {
          const isTop     = line === topLine;
          const pct       = overallTotal > 0 ? (stats.totalQuantity / overallTotal) * 100 : 0;

          return (
            <div
              key={line}
              className={`
                relative rounded-xl border p-4 transition-shadow
                ${isTop
                  ? 'border-amber-300 bg-amber-50 shadow-sm'
                  : 'border-gray-200 bg-white hover:shadow-sm'
                }
              `}
            >
              {/* Top-line badge */}
              {isTop && (
                <span className="absolute top-3 right-3 inline-flex items-center gap-1
                                 px-2 py-0.5 rounded-full text-xs font-semibold
                                 bg-amber-100 text-amber-700 border border-amber-200">
                  ★ Top Line
                </span>
              )}

              <div className="flex items-start justify-between pr-24">
                {/* Left: line name + count */}
                <div>
                  <p className={`font-semibold text-sm ${isTop ? 'text-amber-800' : 'text-gray-800'}`}>
                    {line}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {stats.count.toLocaleString()} entr{stats.count !== 1 ? 'ies' : 'y'}
                  </p>
                </div>
                {/* Right: total + percentage */}
                <div className="text-right">
                  <p className="text-2xl font-bold text-gray-900">
                    {stats.totalQuantity.toLocaleString()}
                  </p>
                  <p className="text-xs text-gray-400">{pct.toFixed(1)}% of total</p>
                </div>
              </div>

              {/* Progress bar */}
              <div className="mt-3 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${isTop ? 'bg-amber-400' : 'bg-blue-400'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Overall total footer */}
      <div className="mt-5 rounded-xl bg-gray-800 text-white p-5 flex items-center justify-between">
        <div>
          <p className="text-gray-400 text-xs uppercase tracking-wider font-semibold">Overall Total Quantity</p>
          <p className="text-4xl font-bold mt-1 tabular-nums">{overallTotal.toLocaleString()}</p>
        </div>
        <div className="w-12 h-12 bg-gray-700 rounded-full flex items-center justify-center">
          <svg className="w-6 h-6 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9
                 a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5
                 a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        </div>
      </div>
    </div>
  );
}
