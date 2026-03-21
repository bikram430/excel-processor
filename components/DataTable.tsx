'use client';

import { ExcelRow } from '@/types';

interface DataTableProps {
  data: ExcelRow[];
}

/** Download a CSV string as a file in the browser */
function downloadCSV(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement('a'), { href: url, download: filename });
  link.click();
  URL.revokeObjectURL(url);
}

/** Build a CSV from the filtered rows */
function buildCSV(data: ExcelRow[]): string {
  const header = ['Line', 'Product', 'Quantity'].join(',');
  const rows   = data.map(({ line, product, quantity }) =>
    [`"${line}"`, `"${product.replace(/"/g, '""')}"`, quantity].join(',')
  );
  return [header, ...rows].join('\n');
}

export function DataTable({ data }: DataTableProps) {
  // ── Empty state ────────────────────────────────────────────────────────────
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
          Upload a file with a valid <code className="bg-gray-100 px-1 rounded text-xs">line</code> column.
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <p className="text-sm text-gray-500">
          Showing{' '}
          <span className="font-semibold text-gray-700">{data.length.toLocaleString()}</span>{' '}
          filtered row{data.length !== 1 ? 's' : ''}
        </p>
        <button
          onClick={() => downloadCSV(buildCSV(data), 'filtered-production-data.csv')}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium
                     text-green-700 bg-green-50 border border-green-200 rounded-lg
                     hover:bg-green-100 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Export CSV
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead>
            <tr className="bg-gray-50">
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-10">#</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Line</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Product</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Quantity</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {data.map((row, idx) => (
              <tr key={idx} className="hover:bg-blue-50/40 transition-colors">
                <td className="px-4 py-3 text-xs text-gray-400">{idx + 1}</td>
                <td className="px-4 py-3">
                  <span className="inline-block px-2 py-0.5 rounded bg-blue-50 text-blue-700 text-xs font-medium border border-blue-100 whitespace-nowrap">
                    {row.line}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-700">{row.product}</td>
                <td className="px-4 py-3 text-right font-mono font-semibold text-gray-900">
                  {row.quantity.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
