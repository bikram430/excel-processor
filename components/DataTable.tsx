'use client';

import { useState } from 'react';
import { ExcelRow } from '@/types';

interface DataTableProps {
  data: ExcelRow[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function groupByLine(data: ExcelRow[]): Map<string, ExcelRow[]> {
  const map = new Map<string, ExcelRow[]>();
  for (const row of data) {
    const bucket = map.get(row.line);
    if (bucket) bucket.push(row);
    else map.set(row.line, [row]);
  }
  return map;
}

function safeFilename(line: string): string {
  return line.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
}

/**
 * Build an Excel workbook in-memory and trigger a browser download.
 * Uses xlsx dynamically to avoid bundling issues; type: 'array' avoids
 * any fs dependency so it works purely in the browser.
 */
async function downloadAsExcel(rows: ExcelRow[], filename: string, includeLineCol: boolean) {
  const XLSX = await import('xlsx');
  const hasBatches = rows.some((r) => r.batches !== undefined);

  const sheetData = rows.map((r) => {
    const obj: Record<string, string | number> = {};
    if (includeLineCol)   obj['Line']            = r.line;
    obj['Product']        = r.product;
    obj['Item Code']      = r.itemCode;
    obj['Qty']            = r.quantity;
    if (hasBatches) {
      obj['Batches']          = r.batches ?? 0;
      obj['Batch Breakdown']  = r.batchBreakdown ?? '—';
    }
    obj['UOM']            = r.uom;
    obj['Type']           = r.type;
    obj['Planning Group'] = r.planningGroup;
    obj['Sequence']       = r.sequence;
    obj['Comments']       = r.comments;
    return obj;
  });

  const ws = XLSX.utils.json_to_sheet(sheetData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Production Data');

  const raw  = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as number[];
  const blob = new Blob([new Uint8Array(raw)], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// ── Icon ──────────────────────────────────────────────────────────────────────

function DownloadIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
    </svg>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function DataTable({ data: rawData }: DataTableProps) {
  const hasBatches = rawData.some((r) => r.batches !== undefined);

  // Hide rows where quantity is 0
  const data = rawData.filter((r) => r.quantity > 0);
  const grouped = groupByLine(data);

  // All sections start collapsed — click header to expand
  const [collapsed, setCollapsed] = useState<Set<string>>(
    () => new Set(grouped.keys())
  );

  const toggle = (line: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(line) ? next.delete(line) : next.add(line);
      return next;
    });

  if (data.length === 0) {
    return (
      <div className="text-center py-20 text-gray-400">
        <p className="font-medium text-gray-500">No matching rows found.</p>
        <p className="text-sm mt-1">
          Upload a file where the <code className="bg-gray-100 px-1 rounded">Line</code>{' '}
          column matches one of the valid production lines.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">

      {/* ── Global toolbar ─────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-sm text-gray-500">
          <span className="font-semibold text-gray-800">{data.length.toLocaleString()}</span> rows
          filtered across{' '}
          <span className="font-semibold text-gray-800">{grouped.size}</span> production
          line{grouped.size !== 1 ? 's' : ''}
        </p>

        <button
          onClick={() =>
            downloadAsExcel(data, 'all-filtered-production-data.xlsx', true)
          }
          className="inline-flex items-center justify-center gap-2 px-5 py-3 sm:py-2.5 rounded-lg text-sm
                     font-semibold text-white bg-blue-600 hover:bg-blue-700
                     active:scale-95 transition-all shadow-sm w-full sm:w-auto"
        >
          <DownloadIcon />
          Download All Lines (.xlsx)
        </button>
      </div>

      {/* ── One card per production line ────────────────────────────────────── */}
      {[...grouped.entries()].map(([line, rows]) => {
        const isCollapsed = collapsed.has(line);
        const lineTotal   = rows.reduce((s, r) => s + r.quantity, 0);

        return (
          <div
            key={line}
            className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden"
          >
            {/* Card header */}
            <div className="flex items-center gap-2 px-3 sm:px-5 py-3 sm:py-3.5 bg-slate-50 border-b border-gray-200">

              {/* Expand / collapse toggle */}
              <button
                onClick={() => toggle(line)}
                className="flex items-center gap-2.5 flex-1 text-left min-w-0"
              >
                <svg
                  className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform duration-200
                              ${isCollapsed ? '' : 'rotate-90'}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>

                {/* Line name */}
                <span className="font-bold text-gray-900 text-sm">{line}</span>

                {/* Row count + total */}
                <span className="text-sm text-gray-400 truncate">
                  {rows.length} product{rows.length !== 1 ? 's' : ''}
                  {' · '}
                  Total:{' '}
                  <span className="font-semibold text-gray-600">
                    {lineTotal.toLocaleString()}
                  </span>
                </span>
              </button>

              {/* Per-line download */}
              <button
                onClick={() =>
                  downloadAsExcel(
                    rows,
                    `${safeFilename(line)}.xlsx`,
                    false
                  )
                }
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs
                           font-semibold text-green-700 bg-green-50 border border-green-200
                           hover:bg-green-100 active:scale-95 transition-all flex-shrink-0"
              >
                <DownloadIcon className="w-3.5 h-3.5" />
                Download .xlsx
              </button>
            </div>

            {/* Expanded content */}
            {!isCollapsed && (
              <>
                {/* ── Mobile: card list ─────────────────────────────────── */}
                <div className="sm:hidden divide-y divide-gray-100">
                  {rows.map((row, idx) => (
                    <div key={idx} className="px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-800 text-sm leading-snug">{row.product}</p>
                          {row.itemCode && (
                            <p className="text-xs text-gray-400 font-mono mt-0.5">{row.itemCode}</p>
                          )}
                          {(row.uom || row.type) && (
                            <div className="flex gap-1.5 mt-1 flex-wrap">
                              {row.uom && (
                                <span className="px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded text-[10px] font-medium">
                                  {row.uom}
                                </span>
                              )}
                              {row.type && (
                                <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-[10px] font-medium">
                                  {row.type}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="font-bold text-gray-900 font-mono tabular-nums">
                            {row.quantity.toLocaleString()}
                          </p>
                          {hasBatches && row.batches !== undefined && (
                            <p className="text-xs text-indigo-600 font-mono font-semibold">
                              {row.batches} batch{row.batches !== 1 ? 'es' : ''}
                            </p>
                          )}
                        </div>
                      </div>
                      {hasBatches && row.batchBreakdown && row.batchBreakdown !== '—' && (
                        <p className="text-xs text-indigo-400 font-mono mt-1">[{row.batchBreakdown}]</p>
                      )}
                      {row.comments && (
                        <p className="text-xs text-gray-400 mt-1 italic">{row.comments}</p>
                      )}
                    </div>
                  ))}
                  {/* Mobile subtotal */}
                  <div className="px-4 py-3 bg-slate-50 border-t-2 border-gray-200 flex justify-between items-center">
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Subtotal</span>
                    <span className="font-bold font-mono text-gray-900 tabular-nums">{lineTotal.toLocaleString()}</span>
                  </div>
                </div>

                {/* ── Desktop: full table ───────────────────────────────── */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="bg-white border-b border-gray-100">
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider w-8">#</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">Product</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">Item Code</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">Qty</th>
                        {hasBatches && (
                          <th className="px-4 py-3 text-right text-xs font-semibold text-indigo-600 uppercase tracking-wider whitespace-nowrap">Batches</th>
                        )}
                        {hasBatches && (
                          <th className="px-4 py-3 text-left text-xs font-semibold text-indigo-600 uppercase tracking-wider whitespace-nowrap">Breakdown</th>
                        )}
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">UOM</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">Type</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">Planning Group</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">Sequence</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Comments</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {rows.map((row, idx) => (
                        <tr key={idx} className="hover:bg-blue-50/30 transition-colors">
                          <td className="px-4 py-3 text-xs text-gray-300">{idx + 1}</td>
                          <td className="px-4 py-3 font-medium text-gray-800 whitespace-nowrap">{row.product}</td>
                          <td className="px-4 py-3 font-mono text-xs text-gray-500 whitespace-nowrap">{row.itemCode}</td>
                          <td className="px-4 py-3 text-right font-mono font-bold text-gray-900 tabular-nums">{row.quantity.toLocaleString()}</td>
                          {hasBatches && (
                            <td className="px-4 py-3 text-right font-mono font-bold text-indigo-700 tabular-nums">{row.batches ?? 0}</td>
                          )}
                          {hasBatches && (
                            <td className="px-4 py-3 font-mono text-xs text-indigo-600 whitespace-nowrap">{row.batchBreakdown ?? '—'}</td>
                          )}
                          <td className="px-4 py-3 text-gray-500">{row.uom}</td>
                          <td className="px-4 py-3">
                            {row.type && (
                              <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs font-medium">{row.type}</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-gray-500">{row.planningGroup}</td>
                          <td className="px-4 py-3 text-center text-gray-500">{row.sequence}</td>
                          <td className="px-4 py-3 text-gray-500 max-w-xs">{row.comments}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-50 border-t-2 border-gray-200">
                        <td className="px-4 py-3" />
                        <td className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Subtotal</td>
                        <td className="px-4 py-3" />
                        <td className="px-4 py-3 text-right font-mono font-bold text-gray-900 tabular-nums">{lineTotal.toLocaleString()}</td>
                        <td colSpan={hasBatches ? 7 : 5} className="px-4 py-3" />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
