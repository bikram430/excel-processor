'use client';

import { ExcelRow } from '@/types';

interface SummaryProps {
  filteredData: ExcelRow[];
  overallTotal: number;
}

function groupByLine(data: ExcelRow[]): Map<string, ExcelRow[]> {
  const map = new Map<string, ExcelRow[]>();
  for (const row of data) {
    const bucket = map.get(row.line);
    if (bucket) bucket.push(row);
    else map.set(row.line, [row]);
  }
  return map;
}

async function downloadSummaryExcel(data: ExcelRow[]) {
  const XLSX    = await import('xlsx');
  const grouped = groupByLine(data);
  const rows: Record<string, string | number>[] = [];

  for (const [line, lineRows] of grouped.entries()) {
    const sub = lineRows.reduce((s, r) => s + r.quantity, 0);
    for (const r of lineRows) {
      rows.push({ Line: r.line, Product: r.product, Quantity: r.quantity });
    }
    rows.push({ Line: '', Product: `${line} — Subtotal`, Quantity: sub });
    rows.push({ Line: '', Product: '', Quantity: '' });
  }

  const grand = data.reduce((s, r) => s + r.quantity, 0);
  rows.push({ Line: '', Product: 'GRAND TOTAL', Quantity: grand });

  const ws  = XLSX.utils.json_to_sheet(rows);
  const wb  = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Summary');

  const raw  = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as number[];
  const blob = new Blob([new Uint8Array(raw)], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = 'production-summary.xlsx';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function Summary({ filteredData, overallTotal }: SummaryProps) {
  const activeRows = filteredData.filter((r) => r.quantity > 0);

  if (activeRows.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        <p className="font-medium">No data to display.</p>
        <p className="text-sm mt-1">All rows have a quantity of 0 or the file is empty.</p>
      </div>
    );
  }

  const grouped    = groupByLine(activeRows);
  const grandTotal = activeRows.reduce((s, r) => s + r.quantity, 0);
  void overallTotal;

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <p className="text-sm text-gray-500">
          <span className="font-semibold text-gray-800">{activeRows.length}</span> products ·{' '}
          <span className="font-semibold text-gray-800">{grouped.size}</span> line{grouped.size !== 1 ? 's' : ''}
          {filteredData.length - activeRows.length > 0 && (
            <span className="text-gray-400 ml-1">
              ({filteredData.length - activeRows.length} zero-qty hidden)
            </span>
          )}
        </p>
        <button
          onClick={() => downloadSummaryExcel(activeRows)}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium
                     text-purple-700 bg-purple-50 border border-purple-200 rounded-lg
                     hover:bg-purple-100 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Download Summary (.xlsx)
        </button>
      </div>

      <div className="rounded-xl border border-gray-200 overflow-hidden">

        {/* Column headers
            Mobile:  [Product | Qty]         (Line hidden — shown in group header)
            Desktop: [Line | Product | Qty]                                       */}
        <div className="grid grid-cols-[1fr_auto] sm:grid-cols-[160px_1fr_120px] bg-blue-600 text-white">
          <div className="hidden sm:block px-4 py-3 text-xs font-bold uppercase tracking-wider">Line</div>
          <div className="px-3 sm:px-4 py-3 text-xs font-bold uppercase tracking-wider sm:border-l border-blue-500">Product</div>
          <div className="px-3 sm:px-4 py-3 text-xs font-bold uppercase tracking-wider text-right border-l border-blue-500">Qty</div>
        </div>

        {[...grouped.entries()].map(([line, rows], lineIdx) => {
          const lineTotal = rows.reduce((s, r) => s + r.quantity, 0);

          return (
            <div key={line}>
              {/* Group header — spans all columns */}
              <div className="grid grid-cols-[1fr_auto] sm:grid-cols-[160px_1fr_120px] bg-slate-100 border-t border-gray-200">
                <div className="px-3 sm:px-4 py-2.5 flex items-center gap-2 col-span-2 sm:col-span-3">
                  <span className="font-bold text-gray-800 text-sm">{line}</span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs
                                   font-semibold bg-blue-100 text-blue-700 border border-blue-200">
                    {rows.length} Recipe{rows.length !== 1 ? 's' : ''}
                  </span>
                </div>
              </div>

              {/* Product rows */}
              {rows.map((row, idx) => (
                <div
                  key={idx}
                  className={`grid grid-cols-[1fr_auto] sm:grid-cols-[160px_1fr_120px]
                              border-t border-gray-100 hover:bg-blue-50/40 transition-colors
                              ${lineIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}`}
                >
                  <div className="hidden sm:flex px-4 py-2.5 text-xs text-gray-300 truncate items-center">
                    {row.line}
                  </div>
                  <div className="px-3 sm:px-4 py-2.5 text-sm text-gray-800 sm:border-l border-gray-100 flex items-center">
                    {row.product}
                  </div>
                  <div className="px-3 sm:px-4 py-2.5 text-sm font-mono font-semibold text-gray-900
                                  text-right border-l border-gray-100 flex items-center justify-end tabular-nums">
                    {row.quantity.toLocaleString()}
                  </div>
                </div>
              ))}

              {/* Subtotal row */}
              <div className="grid grid-cols-[1fr_auto] sm:grid-cols-[160px_1fr_120px] bg-gray-100 border-t border-gray-200">
                <div className="hidden sm:block px-4 py-2" />
                <div className="px-3 sm:px-4 py-2 text-xs font-bold text-gray-500 uppercase tracking-wider
                                sm:border-l border-gray-200 flex items-center">
                  {line} — Subtotal
                </div>
                <div className="px-3 sm:px-4 py-2 text-sm font-mono font-bold text-gray-800
                                text-right border-l border-gray-200 flex items-center justify-end tabular-nums">
                  {lineTotal.toLocaleString()}
                </div>
              </div>
            </div>
          );
        })}

        {/* Grand total footer */}
        <div className="grid grid-cols-[1fr_auto] sm:grid-cols-[160px_1fr_120px] bg-gray-800 text-white border-t-2 border-gray-600">
          <div className="hidden sm:block px-4 py-4" />
          <div className="px-3 sm:px-4 py-4 text-sm font-bold uppercase tracking-wider sm:border-l border-gray-700">
            Grand Total
          </div>
          <div className="px-3 sm:px-4 py-4 text-lg sm:text-xl font-mono font-bold text-right tabular-nums border-l border-gray-700">
            {grandTotal.toLocaleString()}
          </div>
        </div>
      </div>
    </div>
  );
}
