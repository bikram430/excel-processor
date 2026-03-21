'use client';

import { useState } from 'react';
import { ExcelRow } from '@/types';

interface DataTableProps {
  data: ExcelRow[];
}

// ── CSV helpers ───────────────────────────────────────────────────────────────

function downloadCSV(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement('a'), { href: url, download: filename });
  link.click();
  URL.revokeObjectURL(url);
}

/** Rows → CSV string. When includeLinCol is false, the Line column is omitted
 *  (useful for per-line files where the line name is already in the filename). */
function rowsToCSV(rows: ExcelRow[], includeLineCol: boolean): string {
  const header = includeLineCol ? 'Line,Product,Quantity' : 'Product,Quantity';
  const body   = rows.map(({ line, product, quantity }) => {
    const safeProd = `"${product.replace(/"/g, '""')}"`;
    return includeLineCol
      ? `"${line}",${safeProd},${quantity}`
      : `${safeProd},${quantity}`;
  });
  return [header, ...body].join('\n');
}

/** Convert a line name to a safe filename: "KETTLE 2 DIRECT FILL" → "kettle_2_direct_fill.csv" */
function lineFilename(line: string): string {
  return line.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') + '.csv';
}

// ── Group helper ─────────────────────────────────────────────────────────────

function groupByLine(data: ExcelRow[]): Map<string, ExcelRow[]> {
  const map = new Map<string, ExcelRow[]>();
  for (const row of data) {
    const existing = map.get(row.line);
    if (existing) existing.push(row);
    else map.set(row.line, [row]);
  }
  return map;
}

// ── Download icon (reusable) ─────────────────────────────────────────────────

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg className={className ?? 'w-4 h-4'} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
    </svg>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function DataTable({ data }: DataTableProps) {
  // Track which line sections are collapsed (none by default — all open)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggle = (line: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(line) ? next.delete(line) : next.add(line);
      return next;
    });

  // ── Empty state ─────────────────────────────────────────────────────────────
  if (data.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <svg className="mx-auto w-12 h-12 text-gray-200 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2
               h5.586a1 1 0 01.707.293l5.414 5.414A1 1 0 0121 9.414V19a2 2 0 01-2 2z" />
        </svg>
        <p className="font-medium text-gray-500">No matching rows found</p>
        <p className="text-sm mt-1">
          Upload a file with a valid{' '}
          <code className="bg-gray-100 px-1 rounded text-xs">line</code> column.
        </p>
      </div>
    );
  }

  const grouped = groupByLine(data);

  return (
    <div>
      {/* ── Top bar ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <p className="text-sm text-gray-500">
          <span className="font-semibold text-gray-800">{data.length.toLocaleString()}</span> rows
          across{' '}
          <span className="font-semibold text-gray-800">{grouped.size}</span> line
          {grouped.size !== 1 ? 's' : ''}
        </p>

        {/* Download everything in one CSV */}
        <button
          onClick={() => downloadCSV(rowsToCSV(data, true), 'all-production-data.csv')}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium
                     text-blue-700 bg-blue-50 border border-blue-200 rounded-lg
                     hover:bg-blue-100 transition-colors"
        >
          <DownloadIcon />
          Download All Lines (CSV)
        </button>
      </div>

      {/* ── Per-line sections ─────────────────────────────────────────────────── */}
      <div className="space-y-4">
        {[...grouped.entries()].map(([line, rows]) => {
          const isCollapsed = collapsed.has(line);
          const lineTotal   = rows.reduce((sum, r) => sum + r.quantity, 0);

          return (
            <div key={line} className="border border-gray-200 rounded-xl overflow-hidden shadow-sm">

              {/* Section header */}
              <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 border-b border-gray-200">

                {/* Collapse toggle */}
                <button
                  onClick={() => toggle(line)}
                  className="flex items-center gap-2 flex-1 text-left min-w-0"
                >
                  <svg
                    className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform duration-200 ${isCollapsed ? '' : 'rotate-90'}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>

                  {/* Line name badge */}
                  <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold
                                   bg-blue-100 text-blue-800 border border-blue-200 whitespace-nowrap">
                    {line}
                  </span>

                  {/* Row count + subtotal */}
                  <span className="text-xs text-gray-400 truncate">
                    {rows.length.toLocaleString()} row{rows.length !== 1 ? 's' : ''}
                    {' · '}
                    Total: <span className="font-semibold text-gray-600">{lineTotal.toLocaleString()}</span>
                  </span>
                </button>

                {/* Per-line download button */}
                <button
                  onClick={() => downloadCSV(rowsToCSV(rows, false), lineFilename(line))}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold
                             text-green-700 bg-green-50 border border-green-200 rounded-lg
                             hover:bg-green-100 active:scale-95 transition-all whitespace-nowrap flex-shrink-0"
                  title={`Download ${line} as CSV`}
                >
                  <DownloadIcon className="w-3.5 h-3.5" />
                  Download CSV
                </button>
              </div>

              {/* Collapsible table */}
              {!isCollapsed && (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="bg-white border-b border-gray-100">
                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider w-10">#</th>
                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Product</th>
                        <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Quantity</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {rows.map((row, idx) => (
                        <tr key={idx} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-2.5 text-xs text-gray-300">{idx + 1}</td>
                          <td className="px-4 py-2.5 text-gray-700">{row.product}</td>
                          <td className="px-4 py-2.5 text-right font-mono font-semibold text-gray-900">
                            {row.quantity.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>

                    {/* Subtotal footer row */}
                    <tfoot>
                      <tr className="bg-gray-50 border-t-2 border-gray-200">
                        <td className="px-4 py-2.5" />
                        <td className="px-4 py-2.5 text-xs font-bold text-gray-500 uppercase tracking-wider">
                          Subtotal
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono font-bold text-gray-900">
                          {lineTotal.toLocaleString()}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
