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

  const sheetData = rows.map((r) => {
    const obj: Record<string, string | number> = {};
    if (includeLineCol)   obj['Line']           = r.line;
    obj['Product']        = r.product;
    obj['Item Code']      = r.itemCode;
    obj['Qty']            = r.quantity;
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

  // Write to a number[] then convert to Uint8Array (browser-safe, no fs involved)
  const raw  = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as number[];
  const blob = new Blob([Uint8Array.from(raw)], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
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
  // All sections start expanded; clicking the header collapses them
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggle = (line: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(line) ? next.delete(line) : next.add(line);
      return next;
    });

  // Hide rows where quantity is 0 — same behaviour as the Summary view
  const data = rawData.filter((r) => r.quantity > 0);

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

  const grouped = groupByLine(data);

  return (
    <div className="space-y-5">

      {/* ── Global toolbar ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
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
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm
                     font-semibold text-white bg-blue-600 hover:bg-blue-700
                     active:scale-95 transition-all shadow-sm"
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
            <div className="flex items-center gap-3 px-5 py-3.5 bg-slate-50 border-b border-gray-200">

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

            {/* Table — hidden when collapsed */}
            {!isCollapsed && (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="bg-white border-b border-gray-100">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider w-8">
                        #
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">
                        Product
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">
                        Item Code
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">
                        Qty
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">
                        UOM
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">
                        Type
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">
                        Planning Group
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">
                        Sequence
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                        Comments
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-gray-50">
                    {rows.map((row, idx) => (
                      <tr key={idx} className="hover:bg-blue-50/30 transition-colors">
                        <td className="px-4 py-3 text-xs text-gray-300">{idx + 1}</td>
                        <td className="px-4 py-3 font-medium text-gray-800 whitespace-nowrap">
                          {row.product}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-500 whitespace-nowrap">
                          {row.itemCode}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-gray-900">
                          {row.quantity.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-gray-500">{row.uom}</td>
                        <td className="px-4 py-3">
                          {row.type && (
                            <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs font-medium">
                              {row.type}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-500">{row.planningGroup}</td>
                        <td className="px-4 py-3 text-center text-gray-500">{row.sequence}</td>
                        <td className="px-4 py-3 text-gray-500 max-w-xs">{row.comments}</td>
                      </tr>
                    ))}
                  </tbody>

                  {/* Subtotal row */}
                  <tfoot>
                    <tr className="bg-slate-50 border-t-2 border-gray-200">
                      <td className="px-4 py-3" />
                      <td className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">
                        Subtotal
                      </td>
                      <td className="px-4 py-3" />
                      <td className="px-4 py-3 text-right font-mono font-bold text-gray-900">
                        {lineTotal.toLocaleString()}
                      </td>
                      <td colSpan={5} className="px-4 py-3" />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
