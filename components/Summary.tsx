'use client';

import { ExcelRow } from '@/types';

interface SummaryProps {
  filteredData: ExcelRow[];
  overallTotal: number;
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

/** Download the summary view as an .xlsx file */
async function downloadSummaryExcel(data: ExcelRow[]) {
  const XLSX   = await import('xlsx');
  const grouped = groupByLine(data);
  const rows: Record<string, string | number>[] = [];

  for (const [line, lineRows] of grouped.entries()) {
    const sub = lineRows.reduce((s, r) => s + r.quantity, 0);
    for (const r of lineRows) {
      rows.push({ Line: r.line, Product: r.product, Quantity: r.quantity });
    }
    rows.push({ Line: '', Product: `${line} — Subtotal`, Quantity: sub });
    rows.push({ Line: '', Product: '', Quantity: '' });   // blank spacer
  }

  const grand = data.reduce((s, r) => s + r.quantity, 0);
  rows.push({ Line: '', Product: 'GRAND TOTAL', Quantity: grand });

  const ws  = XLSX.utils.json_to_sheet(rows);
  const wb  = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Summary');

  const raw  = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as number[];
  const blob = new Blob([Uint8Array.from(raw)], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  Object.assign(document.createElement('a'), { href: url, download: 'production-summary.xlsx' }).click();
  URL.revokeObjectURL(url);
}

// ── Component ─────────────────────────────────────────────────────────────────

export function Summary({ filteredData, overallTotal }: SummaryProps) {
  // Zero-quantity rows are excluded from the summary view
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

  return (
    <div>
      {/* ── Toolbar ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <p className="text-sm text-gray-500">
          Showing{' '}
          <span className="font-semibold text-gray-800">{activeRows.length}</span> products
          across{' '}
          <span className="font-semibold text-gray-800">{grouped.size}</span> line
          {grouped.size !== 1 ? 's' : ''}
          {filteredData.length - activeRows.length > 0 && (
            <span className="text-gray-400 ml-1">
              ({filteredData.length - activeRows.length} zero-qty rows hidden)
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

      {/* ── Live preview table ────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 overflow-hidden">

        {/* Column headers — styled like the Excel header row */}
        <div className="grid grid-cols-[180px_1fr_130px] bg-blue-600 text-white">
          <div className="px-4 py-3 text-xs font-bold uppercase tracking-wider">Line</div>
          <div className="px-4 py-3 text-xs font-bold uppercase tracking-wider border-l border-blue-500">Product</div>
          <div className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-right border-l border-blue-500">Quantity</div>
        </div>

        {/* One section per production line */}
        {[...grouped.entries()].map(([line, rows], lineIdx) => {
          const lineTotal = rows.reduce((s, r) => s + r.quantity, 0);

          return (
            <div key={line}>

              {/* Line group header */}
              <div className="grid grid-cols-[180px_1fr_130px] bg-slate-100 border-t border-gray-200">
                <div className="px-4 py-2.5 flex items-center gap-2 col-span-3">
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
                  className={`grid grid-cols-[180px_1fr_130px] border-t border-gray-100
                              hover:bg-blue-50/40 transition-colors
                              ${lineIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}`}
                >
                  {/* Line column — greyed out since it's visible in the section header */}
                  <div className="px-4 py-2.5 text-xs text-gray-300 truncate flex items-center">
                    {row.line}
                  </div>
                  {/* Product */}
                  <div className="px-4 py-2.5 text-sm text-gray-800 border-l border-gray-100 flex items-center">
                    {row.product}
                  </div>
                  {/* Quantity */}
                  <div className="px-4 py-2.5 text-sm font-mono font-semibold text-gray-900
                                  text-right border-l border-gray-100 flex items-center justify-end">
                    {row.quantity.toLocaleString()}
                  </div>
                </div>
              ))}

              {/* Line subtotal */}
              <div className="grid grid-cols-[180px_1fr_130px] bg-gray-100 border-t border-gray-200">
                <div className="px-4 py-2" />
                <div className="px-4 py-2 text-xs font-bold text-gray-500 uppercase tracking-wider
                                border-l border-gray-200 flex items-center">
                  {line} — Subtotal
                </div>
                <div className="px-4 py-2 text-sm font-mono font-bold text-gray-800
                                text-right border-l border-gray-200 flex items-center justify-end">
                  {lineTotal.toLocaleString()}
                </div>
              </div>

            </div>
          );
        })}

        {/* Grand total footer */}
        <div className="grid grid-cols-[180px_1fr_130px] bg-gray-800 text-white border-t-2 border-gray-600">
          <div className="px-4 py-4" />
          <div className="px-4 py-4 text-sm font-bold uppercase tracking-wider border-l border-gray-700">
            Grand Total
          </div>
          <div className="px-4 py-4 text-xl font-mono font-bold text-right tabular-nums border-l border-gray-700">
            {grandTotal.toLocaleString()}
          </div>
        </div>
      </div>
    </div>
  );
}
