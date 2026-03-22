'use client';

import { useState } from 'react';
import { ExcelRow, BoardItem } from '@/types';
import { DraggableList } from './DraggableList';
import { getProductAllergens, suggestOrder } from '@/lib/allergenRules';

// ── Lines shown on the board ───────────────────────────────────────────────
const BOARD_LINES = [
  'BLENDTECH',
  'KETTLE 1 SOUP',
  'KETTLE 2 DIRECT FILL',
  'KETTLE 3 DIRECT FILL',
  'KETTLE 4 KAPCOLD',
];

// ── Helpers ────────────────────────────────────────────────────────────────
function rowToBoardItem(row: ExcelRow, index: number): BoardItem {
  return {
    id:             `${row.line}-${row.itemCode || row.product}-${index}`,
    type:           'product',
    line:           row.line,
    product:        row.product,
    quantity:       row.quantity,
    batches:        row.batches ?? 1,
    batchBreakdown: row.batchBreakdown ?? `${row.quantity}×1`,
    time:           '',
    allergens:      getProductAllergens(row.product),
  };
}

async function downloadSequence(line: string, items: BoardItem[]) {
  const XLSX = await import('xlsx');
  const rows = items.map((item, i) => ({
    'Position':   i + 1,
    'Product':    item.product,
    'Qty (kg)':   item.quantity,
    'Batches':    item.batches,
    'Breakdown':  item.batchBreakdown,
    'Start Time': item.time || '—',
    'Allergens':  item.allergens.join(', ') || 'None',
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  // Sheet name max 31 chars
  XLSX.utils.book_append_sheet(wb, ws, line.substring(0, 31));

  const raw  = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as number[];
  const blob = new Blob([new Uint8Array(raw)], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = `sequence-${line.toLowerCase().replace(/\s+/g, '-')}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// ── Sub-components ─────────────────────────────────────────────────────────
function StatsBar({ items }: { items: BoardItem[] }) {
  const totalBatches = items.reduce((s, i) => s + i.batches, 0);
  const totalKg      = items.reduce((s, i) => s + i.quantity, 0);
  return (
    <div className="flex gap-3 flex-wrap mb-4">
      <div className="bg-slate-50 border border-gray-200 rounded-lg px-4 py-2 text-center">
        <p className="text-lg font-bold text-blue-600">{items.length}</p>
        <p className="text-xs text-gray-500 uppercase tracking-wide">Products</p>
      </div>
      <div className="bg-slate-50 border border-gray-200 rounded-lg px-4 py-2 text-center">
        <p className="text-lg font-bold text-indigo-600">{totalBatches}</p>
        <p className="text-xs text-gray-500 uppercase tracking-wide">Total Batches</p>
      </div>
      <div className="bg-slate-50 border border-gray-200 rounded-lg px-4 py-2 text-center">
        <p className="text-lg font-bold text-purple-600">{totalKg.toLocaleString()}</p>
        <p className="text-xs text-gray-500 uppercase tracking-wide">Total kg</p>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────
interface ProductionBoardProps {
  data: ExcelRow[];
}

export function ProductionBoard({ data }: ProductionBoardProps) {
  const boardRows = data.filter(
    (r) => r.quantity > 0 && BOARD_LINES.includes(r.line)
  );
  const activeLines = BOARD_LINES.filter((line) =>
    boardRows.some((r) => r.line === line)
  );

  const [activeTab,  setActiveTab]  = useState<string>(activeLines[0] ?? '');
  const [liveItems,  setLiveItems]  = useState<Record<string, BoardItem[]>>({});

  if (activeLines.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        <p>No board line data found in the uploaded file.</p>
      </div>
    );
  }

  function getInitialItems(line: string): BoardItem[] {
    const rows = boardRows.filter((r) => r.line === line);
    return suggestOrder(rows.map((r, i) => rowToBoardItem(r, i)));
  }

  function currentItems(line: string): BoardItem[] {
    return liveItems[line] ?? getInitialItems(line);
  }

  const items = currentItems(activeTab);

  return (
    <div>
      {/* ── Line tabs ───────────────────────────────────────────────────── */}
      <div className="flex gap-2 flex-wrap mb-5">
        {activeLines.map((line) => (
          <button
            key={line}
            onClick={() => setActiveTab(line)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all
              ${activeTab === line
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
          >
            {line}
          </button>
        ))}
      </div>

      {/* ── Stats + drag board ──────────────────────────────────────────── */}
      <StatsBar items={items} />

      <p className="text-xs text-gray-400 mb-3">
        Drag to reorder · Set start times · Cleaning steps auto-inserted between allergen transitions
      </p>

      <DraggableList
        key={activeTab}
        initialItems={items}
        onChange={(updated) =>
          setLiveItems((prev) => ({ ...prev, [activeTab]: updated }))
        }
      />

      {/* ── Confirm & Download ──────────────────────────────────────────── */}
      <button
        onClick={() => downloadSequence(activeTab, currentItems(activeTab))}
        className="mt-5 w-full flex items-center justify-center gap-2 py-3
                   bg-green-600 text-white font-semibold rounded-xl text-sm
                   hover:bg-green-700 active:scale-95 transition-all shadow-sm"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        Confirm &amp; Download Sequence (.xlsx)
      </button>
    </div>
  );
}
