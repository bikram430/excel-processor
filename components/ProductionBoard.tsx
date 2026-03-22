'use client';

import { useState, useRef } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragOverEvent,
  DragEndEvent,
  useDroppable,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  arrayMove,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ExcelRow, BoardItem } from '@/types';
import {
  getProductAllergens,
  suggestOrder,
  insertCleaningSteps,
  ALLERGEN_OPTIONS,
} from '@/lib/allergenRules';
import { downloadStyledExcel } from '@/lib/excelExport';

// ── Line config ────────────────────────────────────────────────────────────
const BOARD_LINES = [
  'KETTLE 1 SOUP',
  'KETTLE 2 DIRECT FILL',
  'KETTLE 3 DIRECT FILL',
  'KETTLE 4 KAPCOLD',
  'BLENDTECH',
];

const LINE_CAPS: Record<string, number> = {
  'KETTLE 1 SOUP':        2000,
  'KETTLE 2 DIRECT FILL': 2000,
  'KETTLE 3 DIRECT FILL': 2000,
  'KETTLE 4 KAPCOLD':     1000,
  'BLENDTECH':            2000,
};

const LINE_LABEL: Record<string, string> = {
  'KETTLE 1 SOUP':        'Kettle (K1)',
  'KETTLE 2 DIRECT FILL': 'Kettle (K2)',
  'KETTLE 3 DIRECT FILL': 'Kettle (K3)',
  'KETTLE 4 KAPCOLD':     'Kettle (K4)',
  'BLENDTECH':            'Blentech',
};

const LINE_SHORT: Record<string, string> = {
  'KETTLE 1 SOUP':        'K1',
  'KETTLE 2 DIRECT FILL': 'K2',
  'KETTLE 3 DIRECT FILL': 'K3',
  'KETTLE 4 KAPCOLD':     'K4',
  'BLENDTECH':            'BT',
};

// ── Allergen colours (new schema) ──────────────────────────────────────────
// dairy/eggs=red, fish=orange, soy=purple, sulphite=white/gray, wheat=blue, allergen-free=green
const ALLERGEN_COLOURS: Record<string, { badge: string; select: string }> = {
  DAIRY:        { badge: 'bg-red-100    text-red-700    border-red-300',    select: 'bg-red-50    text-red-700'    },
  FISH:         { badge: 'bg-orange-100 text-orange-700 border-orange-300', select: 'bg-orange-50 text-orange-700' },
  SOY:          { badge: 'bg-purple-100 text-purple-700 border-purple-300', select: 'bg-purple-50 text-purple-700' },
  SULPHITE:     { badge: 'bg-white      text-gray-600   border-gray-400',   select: 'bg-gray-50   text-gray-600'   },
  WHEAT:        { badge: 'bg-blue-100   text-blue-700   border-blue-300',   select: 'bg-blue-50   text-blue-700'   },
  ALLERGEN_FREE:{ badge: 'bg-green-100  text-green-700  border-green-300',  select: 'bg-green-50  text-green-700'  },
};

// ── Helpers ────────────────────────────────────────────────────────────────
function rowToBoardItem(row: ExcelRow, index: number): BoardItem {
  return {
    id:                `${row.line}-${row.itemCode || row.product}-${index}`,
    type:              'product',
    line:              row.line,
    product:           row.product,
    quantity:          row.quantity,
    batches:           row.batches ?? 1,
    batchBreakdown:    row.batchBreakdown ?? `${row.quantity}×1`,
    time:              '',
    allergens:         getProductAllergens(row.product),
    physicalBatchSize: row.physicalBatchSize ?? Math.ceil(row.quantity / (row.batches ?? 1)),
  };
}

function isCompatible(item: BoardItem, targetLine: string): boolean {
  const cap = LINE_CAPS[targetLine];
  return cap === undefined || item.physicalBatchSize <= cap;
}

function findContainer(id: string, allItems: Record<string, BoardItem[]>): string | null {
  if (id in allItems) return id;
  return Object.entries(allItems).find(([, items]) =>
    items.some(i => i.id === id)
  )?.[0] ?? null;
}

function findItem(id: string, allItems: Record<string, BoardItem[]>): BoardItem | null {
  for (const items of Object.values(allItems)) {
    const found = items.find(i => i.id === id);
    if (found) return found;
  }
  return null;
}

/** Parse "2000×2 / 950×1" into individual sizes */
function parseBatchSizes(
  breakdown: string,
  batches: number,
  qty: number,
): { kg: number; full: boolean }[] {
  const cleaned = breakdown.replace(/\s*\(→[\d,]+kg out\)/g, '');
  const matches  = [...cleaned.matchAll(/(\d+)×(\d+)/g)];
  if (matches.length > 0) {
    const maxKg = Math.max(...matches.map(m => parseInt(m[1])));
    const out: { kg: number; full: boolean }[] = [];
    for (const m of matches) {
      const kg = parseInt(m[1]);
      const n  = parseInt(m[2]);
      for (let i = 0; i < n; i++) out.push({ kg, full: kg === maxKg });
    }
    return out;
  }
  const n = Math.max(batches, 1);
  return Array.from({ length: n }, () => ({ kg: Math.ceil(qty / n), full: true }));
}

/** Get current allergen key for display (first in array or ALLERGEN_FREE) */
function allergenKey(item: BoardItem): string {
  return item.allergens[0] ?? 'ALLERGEN_FREE';
}

// ── Excel downloads ────────────────────────────────────────────────────────
async function downloadLineSequence(line: string, items: BoardItem[]) {
  await downloadStyledExcel(
    { [line]: items },
    [line],
    `sequence-${line.toLowerCase().replace(/\s+/g, '-')}.xlsx`,
  );
}

async function downloadWholeBoard(allItems: Record<string, BoardItem[]>, activeLines: string[]) {
  await downloadStyledExcel(
    Object.fromEntries(activeLines.map(l => [l, allItems[l] ?? []])),
    activeLines,
    'production-board.xlsx',
  );
}

// ── Product card ───────────────────────────────────────────────────────────
function ProductCard({
  item,
  position,
  onTimeChange,
  onAllergenChange,
  dragProps = {},
  activeLines = [],
  onMoveTo,
}: {
  item: BoardItem;
  position: number;
  onTimeChange?: (id: string, time: string) => void;
  onAllergenChange?: (id: string, allergen: string) => void;
  dragProps?: Record<string, unknown>;
  activeLines?: string[];
  onMoveTo?: (id: string, targetLine: string) => void;
}) {
  const batchSizes = parseBatchSizes(item.batchBreakdown, item.batches, item.quantity);
  const otherLines = activeLines.filter(l => l !== item.line);
  const aKey       = allergenKey(item);
  const aColours   = ALLERGEN_COLOURS[aKey] ?? ALLERGEN_COLOURS.ALLERGEN_FREE;

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden text-left">

      {/* ── Card body ── */}
      <div className="flex items-stretch">

        {/* Drag handle */}
        <div
          {...dragProps}
          className="flex items-center justify-center w-5 flex-shrink-0 bg-gray-50
                     border-r border-gray-200 cursor-grab active:cursor-grabbing
                     text-gray-300 hover:text-gray-500 select-none"
        >
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
            <path d="M7 2a2 2 0 11-4 0 2 2 0 014 0zM7 8a2 2 0 11-4 0 2 2 0 014 0zM7 14a2 2 0 11-4 0 2 2 0 014 0zM13 2a2 2 0 11-4 0 2 2 0 014 0zM13 8a2 2 0 11-4 0 2 2 0 014 0zM13 14a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
        </div>

        {/* Position badge */}
        <div className="flex items-start justify-center w-5 flex-shrink-0 pt-2
                        bg-gray-50 border-r border-gray-200 text-[9px] font-bold text-gray-300">
          {position || '·'}
        </div>

        {/* Content */}
        <div className="flex-1 p-2 min-w-0">

          {/* Product name */}
          <p className="font-bold text-gray-900 text-xs leading-snug" title={item.product}>
            {item.product}
          </p>

          {/* Total quantity */}
          <p className="text-[10px] text-gray-500 font-mono mt-0.5">
            <span className="font-semibold text-gray-700">{item.quantity.toLocaleString()}</span> kg total
          </p>

          {/* ── Individual batch sizes (* notation) ── */}
          <div className="mt-1.5 pt-1 border-t border-gray-100 space-y-0.5">
            {batchSizes.map((b, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <span className="text-[9px] text-indigo-400 font-mono font-bold w-5 flex-shrink-0 text-right tabular-nums">
                  *{i + 1}
                </span>
                <span className="text-[11px] font-mono font-bold tabular-nums text-indigo-700">
                  {b.kg.toLocaleString()} kg
                </span>
              </div>
            ))}
          </div>

          {/* ── Allergen badge + manual selector ── */}
          <div className="mt-1.5 pt-1 border-t border-gray-100">
            {/* Current allergen badge */}
            <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold border leading-none mb-1 ${aColours.badge}`}>
              {ALLERGEN_OPTIONS.find(o => o.value === aKey)?.label ?? aKey}
            </span>

            {/* Selector */}
            {onAllergenChange && (
              <select
                value={aKey}
                onChange={e => onAllergenChange(item.id, e.target.value)}
                className={`w-full text-[9px] border border-gray-200 rounded px-1 py-0.5
                           focus:outline-none focus:ring-1 focus:ring-indigo-400 ${aColours.select}`}
              >
                {ALLERGEN_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            )}
          </div>

          {/* Start-time input */}
          {onTimeChange && (
            <div className="mt-1.5 flex items-center gap-1">
              <span className="text-[9px] text-gray-400 flex-shrink-0">Start:</span>
              <input
                type="time"
                value={item.time}
                onChange={e => onTimeChange(item.id, e.target.value)}
                className="flex-1 min-w-0 text-[10px] font-mono text-gray-700 border border-gray-200
                           rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
            </div>
          )}
        </div>
      </div>

      {/* ── Move-to buttons ── */}
      {onMoveTo && otherLines.length > 0 && (
        <div className="px-2 pb-2 pt-1 border-t border-gray-100 flex items-center gap-1 flex-wrap">
          <span className="text-[9px] text-gray-400 font-medium flex-shrink-0">Move→</span>
          {otherLines.map(targetLine => {
            const compat = isCompatible(item, targetLine);
            const cap    = LINE_CAPS[targetLine];
            return (
              <button
                key={targetLine}
                onClick={() => compat && onMoveTo(item.id, targetLine)}
                disabled={!compat}
                title={
                  !compat
                    ? `${targetLine}: max ${cap?.toLocaleString()} kg/batch — incompatible`
                    : `Move to ${targetLine}`
                }
                className={`text-[9px] px-1.5 py-0.5 rounded border font-bold transition-colors ${
                  compat
                    ? 'border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100 active:scale-95'
                    : 'border-red-200 text-red-400 bg-red-50 cursor-not-allowed opacity-60'
                }`}
              >
                {LINE_SHORT[targetLine]}{!compat && ' ✕'}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Sortable card wrapper ──────────────────────────────────────────────────
function SortableCard({
  item,
  position,
  onTimeChange,
  onAllergenChange,
  activeLines,
  onMoveTo,
}: {
  item: BoardItem;
  position: number;
  onTimeChange: (id: string, time: string) => void;
  onAllergenChange: (id: string, allergen: string) => void;
  activeLines: string[];
  onMoveTo: (id: string, targetLine: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.2 : 1 }}
    >
      <ProductCard
        item={item}
        position={position}
        onTimeChange={onTimeChange}
        onAllergenChange={onAllergenChange}
        dragProps={{ ...attributes, ...listeners }}
        activeLines={activeLines}
        onMoveTo={onMoveTo}
      />
    </div>
  );
}

// ── Cleaning step banner ───────────────────────────────────────────────────
function CleaningStep() {
  return (
    <div className="flex items-center gap-1.5 px-2 py-1.5 bg-amber-50 border border-amber-200
                    rounded-lg text-amber-700 text-[10px] font-semibold pointer-events-none">
      <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      CIP / Cleaning
    </div>
  );
}

// ── Whiteboard column ──────────────────────────────────────────────────────
function LineColumn({
  line,
  items,
  onTimeChange,
  onAllergenChange,
  isDropTarget,
  blockedItem,
  activeLines,
  onMoveTo,
}: {
  line: string;
  items: BoardItem[];
  onTimeChange: (id: string, time: string) => void;
  onAllergenChange: (id: string, allergen: string) => void;
  isDropTarget: boolean;
  blockedItem: BoardItem | null;
  activeLines: string[];
  onMoveTo: (id: string, targetLine: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: line });
  const totalKg    = items.reduce((s, i) => s + i.quantity, 0);
  const totalBatch = items.reduce((s, i) => s + i.batches, 0);
  const highlighted = isDropTarget && !blockedItem;
  const blocked     = !!blockedItem;

  const displayItems = insertCleaningSteps(items);
  const positions: Record<string, number> = {};
  let pos = 0;
  for (const e of displayItems) {
    if (e.type !== 'cleaning') positions[e.id] = ++pos;
  }

  return (
    /*
     * min-w-[88vw] → on mobile (~375px) this is ~330px, showing ~1 kettle at a time.
     * sm:min-w-0 sm:flex-1 → on desktop, columns share space equally.
     */
    <div className={`flex-shrink-0 min-w-[88vw] sm:min-w-0 sm:flex-1 flex flex-col
                     border-r last:border-r-0 border-gray-200 transition-colors ${
      blocked ? 'bg-red-50/60' : highlighted ? 'bg-blue-50/20' : 'bg-white'
    }`}>

      {/* ── Column header ── */}
      <div className={`px-2.5 py-2 border-b-2 ${
        blocked     ? 'bg-red-700   border-red-900'  :
        highlighted ? 'bg-blue-700  border-blue-900' :
                      'bg-slate-800 border-slate-900'
      }`}>
        <p className="font-bold text-white text-sm leading-tight">
          {LINE_LABEL[line] ?? line}
        </p>
        <div className="mt-1.5 space-y-px">
          <p className="text-[10px] text-slate-300">
            {items.length} product{items.length !== 1 ? 's' : ''} · {totalBatch} batch{totalBatch !== 1 ? 'es' : ''}
          </p>
          <p className="text-xs font-mono font-bold text-white tabular-nums">
            {totalKg.toLocaleString()} kg
          </p>
        </div>

        {/* Incompatibility warning */}
        {blocked && blockedItem && (
          <p className="mt-1 text-[10px] text-red-100 font-semibold leading-snug">
            ✕ Needs {blockedItem.physicalBatchSize.toLocaleString()} kg/batch
          </p>
        )}

        {/* Per-line download */}
        <button
          onClick={() => downloadLineSequence(line, items)}
          className="mt-2 w-full flex items-center justify-center gap-1 px-2 py-1 text-[10px]
                     font-semibold text-slate-300 bg-white/10 border border-white/20 rounded
                     hover:bg-white/20 transition-colors"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Download
        </button>
      </div>

      {/* ── Products ── */}
      <div
        ref={setNodeRef}
        className={`flex-1 p-2 space-y-2 min-h-[80px] transition-colors ${
          isOver && !blocked ? 'bg-blue-50/40' : ''
        }`}
      >
        <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
          {displayItems.map(entry => {
            if (entry.type === 'cleaning') return <CleaningStep key={entry.id} />;
            const item = entry as BoardItem;
            return (
              <SortableCard
                key={item.id}
                item={item}
                position={positions[item.id]}
                onTimeChange={onTimeChange}
                onAllergenChange={onAllergenChange}
                activeLines={activeLines}
                onMoveTo={onMoveTo}
              />
            );
          })}
          {items.length === 0 && (
            <div className="flex items-center justify-center h-14 text-[10px] text-gray-300
                            border-2 border-dashed border-gray-200 rounded-lg">
              Drop here
            </div>
          )}
        </SortableContext>
      </div>

      {/* ── Column subtotal ── */}
      <div className="border-t-2 border-gray-200 bg-slate-50 px-2.5 py-2">
        <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Subtotal</p>
        <p className="text-sm font-mono font-bold text-gray-900 tabular-nums">
          {totalKg.toLocaleString()} kg
        </p>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────
interface ProductionBoardProps {
  data: ExcelRow[];
}

export function ProductionBoard({ data }: ProductionBoardProps) {
  const boardRows   = data.filter(r => r.quantity > 0 && BOARD_LINES.includes(r.line));
  const activeLines = BOARD_LINES.filter(line => boardRows.some(r => r.line === line));

  const [allItems, setAllItems] = useState<Record<string, BoardItem[]>>(() => {
    const result: Record<string, BoardItem[]> = {};
    for (const line of activeLines) {
      const rows = boardRows.filter(r => r.line === line);
      result[line] = suggestOrder(rows.map((r, i) => rowToBoardItem(r, i)));
    }
    return result;
  });

  const [activeId,    setActiveId]    = useState<string | null>(null);
  const [overLine,    setOverLine]    = useState<string | null>(null);
  const [blockedLine, setBlockedLine] = useState<string | null>(null);
  const snapshot     = useRef<Record<string, BoardItem[]> | null>(null);
  const lastOverRef  = useRef<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // ── Allergen change ──────────────────────────────────────────────────────
  function handleAllergenChange(id: string, allergenValue: string) {
    setAllItems(prev => {
      const next = { ...prev };
      for (const line of Object.keys(next)) {
        if (next[line].some(i => i.id === id)) {
          next[line] = next[line].map(i =>
            i.id === id
              ? { ...i, allergens: allergenValue === 'ALLERGEN_FREE' ? [] : [allergenValue] }
              : i
          );
          break;
        }
      }
      return next;
    });
  }

  // ── Move-to (button) ────────────────────────────────────────────────────
  function moveItem(itemId: string, targetLine: string) {
    const src = findContainer(itemId, allItems);
    if (!src || src === targetLine) return;
    const item = findItem(itemId, allItems);
    if (!item || !isCompatible(item, targetLine)) return;
    setAllItems(prev => {
      const srcArr  = [...prev[src]];
      const destArr = [...(prev[targetLine] ?? [])];
      const idx     = srcArr.findIndex(i => i.id === itemId);
      if (idx === -1) return prev;
      const [moved] = srcArr.splice(idx, 1);
      destArr.push({ ...moved, line: targetLine });
      return { ...prev, [src]: srcArr, [targetLine]: destArr };
    });
  }

  // ── Time change ─────────────────────────────────────────────────────────
  function handleTimeChange(id: string, time: string) {
    setAllItems(prev => {
      const next = { ...prev };
      for (const line of Object.keys(next)) {
        if (next[line].some(i => i.id === id)) {
          next[line] = next[line].map(i => i.id === id ? { ...i, time } : i);
          break;
        }
      }
      return next;
    });
  }

  // ── Drag handlers ────────────────────────────────────────────────────────
  function handleDragStart({ active }: DragStartEvent) {
    setActiveId(String(active.id));
    snapshot.current    = JSON.parse(JSON.stringify(allItems));
    lastOverRef.current = null;
  }

  function handleDragOver({ active, over }: DragOverEvent) {
    if (!over || !activeId) return;
    const activeIdStr      = String(active.id);
    const overId           = String(over.id);
    const currentContainer = findContainer(activeIdStr, allItems);
    const overContainer    = findContainer(overId, allItems) ?? overId;
    setOverLine(overContainer);

    if (!currentContainer || !overContainer || currentContainer === overContainer) {
      setBlockedLine(null);
      lastOverRef.current = overContainer;
      return;
    }
    if (lastOverRef.current === overContainer) return;
    lastOverRef.current = overContainer;

    const movingItem = findItem(activeIdStr, allItems);
    if (!movingItem) return;

    if (!isCompatible(movingItem, overContainer)) {
      setBlockedLine(overContainer);
      return;
    }
    setBlockedLine(null);

    setAllItems(prev => {
      const src  = [...prev[currentContainer]];
      const dest = [...(prev[overContainer] ?? [])];
      const idx  = src.findIndex(i => i.id === activeIdStr);
      if (idx === -1) return prev;
      const [item] = src.splice(idx, 1);
      const overIdx = dest.findIndex(i => i.id === overId);
      overIdx >= 0 ? dest.splice(overIdx, 0, item) : dest.push(item);
      return { ...prev, [currentContainer]: src, [overContainer]: dest };
    });
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    const activeIdStr = String(active.id);
    if (!over) {
      if (snapshot.current) setAllItems(snapshot.current);
    } else {
      const overId           = String(over.id);
      const currentContainer = findContainer(activeIdStr, allItems);
      const overContainer    = findContainer(overId, allItems) ?? overId;

      if (blockedLine) {
        if (snapshot.current) setAllItems(snapshot.current);
      } else if (currentContainer && overContainer && currentContainer === overContainer) {
        setAllItems(prev => {
          const items  = prev[currentContainer];
          const oldIdx = items.findIndex(i => i.id === activeIdStr);
          const newIdx = items.findIndex(i => i.id === overId);
          if (oldIdx === -1 || newIdx === -1 || oldIdx === newIdx) return prev;
          return { ...prev, [currentContainer]: arrayMove(items, oldIdx, newIdx) };
        });
      }
    }
    setActiveId(null); setOverLine(null); setBlockedLine(null);
    snapshot.current = null; lastOverRef.current = null;
  }

  function handleDragCancel() {
    if (snapshot.current) setAllItems(snapshot.current);
    setActiveId(null); setOverLine(null); setBlockedLine(null);
    snapshot.current = null; lastOverRef.current = null;
  }

  const activeItem = activeId ? findItem(activeId, allItems) : null;

  if (activeLines.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        <p>No board line data found in the uploaded file.</p>
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <p className="text-xs text-gray-400 flex-1">
          Drag grip to reorder · <strong>Move→</strong> to transfer between lines ·
          Swipe right on mobile to see all kettles
        </p>
        <button
          onClick={() => downloadWholeBoard(allItems, activeLines)}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold
                     text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 active:scale-95
                     transition-all shadow-sm w-full sm:w-auto"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Download Whole Board (.xlsx)
        </button>
      </div>

      {/* ── Whiteboard columns ───────────────────────────────────────────── */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
        <div className="flex divide-x divide-gray-200">
          {activeLines.map(line => {
            const items    = allItems[line] ?? [];
            const isTarget = overLine === line && activeId !== null;
            const blocked  = blockedLine === line ? (activeItem ?? null) : null;
            return (
              <LineColumn
                key={line}
                line={line}
                items={items}
                onTimeChange={handleTimeChange}
                onAllergenChange={handleAllergenChange}
                isDropTarget={isTarget}
                blockedItem={blocked}
                activeLines={activeLines}
                onMoveTo={moveItem}
              />
            );
          })}
        </div>
      </div>

      {/* Ghost during drag */}
      <DragOverlay dropAnimation={null}>
        {activeItem && (
          <div className="rotate-1 opacity-90 shadow-2xl w-44">
            <ProductCard item={activeItem} position={0} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
