'use client';

import { useState } from 'react';
import { ExcelRow, BoardItem } from '@/types';
import { DraggableList } from './DraggableList';
import { getProductAllergens, suggestOrder } from '@/lib/allergenRules';

// ── Constants ──────────────────────────────────────────────────────────────
const KETTLE_LINES = [
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
    batchBreakdown: row.batchBreakdown ?? `${row.quantity}*1`,
    time:           '',
    allergens:      getProductAllergens(row.product),
  };
}

// ── Sub-components ─────────────────────────────────────────────────────────
function StatsBar({ items }: { items: BoardItem[] }) {
  const totalBatches = items.reduce((s, i) => s + i.batches, 0);
  const totalKg      = items.reduce((s, i) => s + i.quantity, 0);
  return (
    <div className="flex gap-4 flex-wrap mb-4">
      <div className="bg-white border border-gray-200 rounded-lg px-4 py-2 text-center">
        <p className="text-lg font-bold text-blue-600">{items.length}</p>
        <p className="text-xs text-gray-500 uppercase tracking-wide">Products</p>
      </div>
      <div className="bg-white border border-gray-200 rounded-lg px-4 py-2 text-center">
        <p className="text-lg font-bold text-indigo-600">{totalBatches}</p>
        <p className="text-xs text-gray-500 uppercase tracking-wide">Total Batches</p>
      </div>
      <div className="bg-white border border-gray-200 rounded-lg px-4 py-2 text-center">
        <p className="text-lg font-bold text-purple-600">{totalKg.toLocaleString()}</p>
        <p className="text-xs text-gray-500 uppercase tracking-wide">Total kg</p>
      </div>
    </div>
  );
}

function SequenceOutput({ items }: { items: BoardItem[] }) {
  const lines = items.map(
    (item, i) =>
      `${i + 1}. ${item.product} — ${item.batches} batch${item.batches !== 1 ? 'es' : ''} [${item.batchBreakdown}]${item.time ? ` @ ${item.time}` : ''}`
  );
  const text = lines.join('\n');

  function copy() {
    navigator.clipboard.writeText(text).catch(() => {});
  }

  return (
    <div className="mt-6 bg-gray-900 rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Final Sequence</p>
        <button
          onClick={copy}
          className="text-xs text-gray-400 hover:text-white transition-colors px-2 py-1 rounded border border-gray-700 hover:border-gray-500"
        >
          Copy
        </button>
      </div>
      <pre className="text-xs text-green-400 font-mono whitespace-pre-wrap leading-relaxed">
        {text}
      </pre>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────
interface ProductionBoardProps {
  data: ExcelRow[];
}

export function ProductionBoard({ data }: ProductionBoardProps) {
  // Filter to kettle lines only, qty > 0
  const kettleRows = data.filter(
    (r) => r.quantity > 0 && KETTLE_LINES.includes(r.line)
  );

  const kettleLines = KETTLE_LINES.filter((line) =>
    kettleRows.some((r) => r.line === line)
  );

  const [activeTab,    setActiveTab]    = useState<string>(kettleLines[0] ?? '');
  const [confirmed,    setConfirmed]    = useState<Record<string, boolean>>({});
  const [liveItems,    setLiveItems]    = useState<Record<string, BoardItem[]>>({});

  if (kettleLines.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        <p>No kettle line data found in the uploaded file.</p>
      </div>
    );
  }

  function getItemsForLine(line: string): BoardItem[] {
    const rows = kettleRows.filter((r) => r.line === line);
    return rows.map((r, i) => rowToBoardItem(r, i));
  }

  function getSuggestedOrder(line: string): BoardItem[] {
    return suggestOrder(getItemsForLine(line));
  }

  function confirmLine(line: string) {
    const suggested = getSuggestedOrder(line);
    setLiveItems((prev) => ({ ...prev, [line]: suggested }));
    setConfirmed((prev) => ({ ...prev, [line]: true }));
  }

  const isConfirmed = confirmed[activeTab] ?? false;
  const suggestedItems = getSuggestedOrder(activeTab);
  const currentItems = liveItems[activeTab] ?? suggestedItems;

  return (
    <div>
      {/* ── Kettle tabs ─────────────────────────────────────────────────── */}
      <div className="flex gap-2 flex-wrap mb-5">
        {kettleLines.map((line) => (
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
            {confirmed[line] && (
              <span className="ml-2 text-xs font-normal opacity-70">✓</span>
            )}
          </button>
        ))}
      </div>

      {/* ── Confirm step ────────────────────────────────────────────────── */}
      {!isConfirmed ? (
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h3 className="font-semibold text-gray-800 mb-1">
            Suggested sequence for <span className="text-blue-600">{activeTab}</span>
          </h3>
          <p className="text-xs text-gray-500 mb-4">
            Vegan / allergen-free products first, then allergen products. Drag to reorder after confirming.
          </p>

          <StatsBar items={suggestedItems} />

          <ol className="space-y-2 mb-5">
            {suggestedItems.map((item, i) => (
              <li
                key={item.id}
                className="flex items-start gap-3 py-2 px-3 bg-gray-50 rounded-lg border border-gray-100"
              >
                <span className="text-xs font-bold text-gray-400 w-5 flex-shrink-0 mt-0.5">
                  {i + 1}.
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{item.product}</p>
                  <p className="text-xs text-gray-500 font-mono">
                    {item.quantity.toLocaleString()} kg · {item.batches} batch{item.batches !== 1 ? 'es' : ''} [{item.batchBreakdown}]
                  </p>
                </div>
                {item.allergens.length > 0 && (
                  <div className="flex gap-1 flex-shrink-0">
                    {item.allergens.map((a) => (
                      <span
                        key={a}
                        className="px-1.5 py-0.5 bg-red-100 text-red-700 border border-red-200 rounded text-[10px] font-bold"
                      >
                        {a}
                      </span>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ol>

          <button
            onClick={() => confirmLine(activeTab)}
            className="w-full py-2.5 bg-blue-600 text-white font-semibold rounded-lg
                       hover:bg-blue-700 active:scale-95 transition-all text-sm"
          >
            Confirm & Open Board
          </button>
        </div>
      ) : (
        /* ── Interactive drag-and-drop board ─────────────────────────── */
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-gray-500">
              Drag to reorder · Set start times with the time picker
            </p>
            <button
              onClick={() => setConfirmed((prev) => ({ ...prev, [activeTab]: false }))}
              className="text-xs text-gray-400 hover:text-blue-600 transition-colors"
            >
              ← Reset sequence
            </button>
          </div>

          <StatsBar items={currentItems} />

          <DraggableList
            initialItems={currentItems}
            onChange={(updated) =>
              setLiveItems((prev) => ({ ...prev, [activeTab]: updated }))
            }
          />

          <SequenceOutput items={currentItems} />
        </div>
      )}
    </div>
  );
}
