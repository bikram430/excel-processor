'use client';

import { useState, useRef, useLayoutEffect } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
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
  needsCleaning,
  ALLERGEN_OPTIONS,
} from '@/lib/allergenRules';
import { downloadBoardPDF } from '@/lib/pdfExport';
import { smartAssignKettles, getPreferredKettles } from '@/lib/kettlePreferences';

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
    allergens:         getProductAllergens(row.product, row.itemCode),
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

function parseBatchSizes(
  breakdown: string,
  batches: number,
  qty: number,
): { kg: number }[] {
  const cleaned = breakdown.replace(/\s*\(→[\d,]+kg out\)/g, '');
  const matches  = [...cleaned.matchAll(/(\d+)×(\d+)/g)];
  if (matches.length > 0) {
    const out: { kg: number }[] = [];
    for (const m of matches) {
      const kg = parseInt(m[1]);
      const n  = parseInt(m[2]);
      for (let i = 0; i < n; i++) out.push({ kg });
    }
    return out;
  }
  const n = Math.max(batches, 1);
  return Array.from({ length: n }, () => ({ kg: Math.ceil(qty / n) }));
}

function allergenKey(item: BoardItem): string {
  return item.allergens[0] ?? 'ALLERGEN_FREE';
}

/** Sort items: timed items first (earliest → latest), untimed at the bottom */
function sortByTime(items: BoardItem[]): BoardItem[] {
  return [...items].sort((a, b) => {
    if (!a.time && !b.time) return 0;
    if (!a.time) return 1;
    if (!b.time) return -1;
    return a.time.localeCompare(b.time);
  });
}


// ── Product card (visual only — drag handled by SortableCard wrapper) ──────
function ProductCard({
  item,
  position,
  needsCleanBefore = false,
  onTimeChange,
  onAllergenChange,
  activeLines = [],
  onMoveTo,
  isHolding = false,
  isDragging = false,
  dragHandleProps = {},
}: {
  item: BoardItem;
  position: number;
  needsCleanBefore?: boolean;
  onTimeChange?: (id: string, time: string) => void;
  onAllergenChange?: (id: string, allergen: string) => void;
  activeLines?: string[];
  onMoveTo?: (id: string, targetLine: string) => void;
  isHolding?: boolean;
  isDragging?: boolean;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement> & { style?: React.CSSProperties };
}) {
  const batchSizes = parseBatchSizes(item.batchBreakdown, item.batches, item.quantity);
  const otherLines = activeLines.filter(l => l !== item.line);
  const aKey       = allergenKey(item);
  const aColours   = ALLERGEN_COLOURS[aKey] ?? ALLERGEN_COLOURS.ALLERGEN_FREE;

  return (
    <div className={`bg-white rounded-xl overflow-hidden transition-all duration-150 ${
      isDragging ? 'opacity-30 scale-95' :
      isHolding  ? 'shadow-2xl scale-[1.03] ring-2 ring-indigo-400 border-indigo-200 border' :
                   'shadow-sm border border-gray-200'
    }`}>

      {/* ── Inline CIP indicator (no separate element — stays in row) ── */}
      {needsCleanBefore && (
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border-b border-amber-200">
          <svg className="w-3 h-3 flex-shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-[9px] font-bold text-amber-700 uppercase tracking-wider">CIP / Clean before this</span>
        </div>
      )}

      {/*
       * ── DRAG HANDLE (hold here to drag) ──────────────────────────────
       * Only this section has touch-action:none and the dnd listeners.
       * Touching anywhere below this area scrolls the page normally.
       */}
      <div
        {...dragHandleProps}
        className={`cursor-grab active:cursor-grabbing select-none ${dragHandleProps.className ?? ''}`}
      >
        {/* Drag pill */}
        <div className={`flex items-center justify-center pt-2 pb-1 transition-colors ${
          isHolding ? 'bg-indigo-50' : 'bg-gray-50'
        }`}>
          <div className={`w-9 h-1.5 rounded-full transition-colors ${
            isHolding ? 'bg-indigo-400' : 'bg-gray-300'
          }`} />
          {isHolding && (
            <span className="absolute text-[8px] text-indigo-500 font-bold tracking-widest mt-5">
              HOLD &amp; DRAG
            </span>
          )}
        </div>

        {/* Position badge + product name + batch sizes */}
        <div className="flex items-start px-3 pt-1 pb-2 gap-2">
          <div className="flex-shrink-0 w-5 h-5 mt-0.5 flex items-center justify-center
                          rounded-full bg-gray-100 text-[9px] font-bold text-gray-400">
            {position || '·'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-gray-900 text-sm leading-snug" title={item.product}>
              {item.product}
            </p>
            {(() => {
              const preferred = getPreferredKettles(item.product, '');
              if (preferred.length === 0) return null;
              const shorts     = preferred.map(k => LINE_SHORT[k] ?? k).join('/');
              const onPreferred = preferred.includes(item.line);
              return (
                <span className={`inline-block text-[9px] font-bold px-1.5 py-0.5 rounded-full mt-0.5 ${
                  onPreferred
                    ? 'bg-green-100 text-green-700'
                    : 'bg-amber-100 text-amber-700'
                }`}>
                  {onPreferred ? '✓' : '→'} {shorts}
                </span>
              );
            })()}
            <p className="text-[11px] text-gray-500 font-mono mt-0.5">
              <span className="font-bold text-gray-700">{item.quantity.toLocaleString()}</span> kg total
            </p>
            <div className="mt-2 space-y-1 bg-indigo-50 rounded-lg px-2 py-1.5">
              {batchSizes.map((b, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-indigo-400 font-mono w-5 flex-shrink-0">
                    *{i + 1}
                  </span>
                  <span className="text-[12px] font-mono font-bold text-indigo-700 tabular-nums">
                    {b.kg.toLocaleString()} kg
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      {/* ── END DRAG HANDLE ── */}

      {/* ── Allergen badge + selector (scrollable, not part of drag handle) ── */}
      <div className="px-3 pb-2">
        <span className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-bold border mb-1 ${aColours.badge}`}>
          {ALLERGEN_OPTIONS.find(o => o.value === aKey)?.label ?? aKey}
        </span>
        {onAllergenChange && (
          <select
            value={aKey}
            onChange={e => onAllergenChange(item.id, e.target.value)}
            className={`w-full text-[10px] border border-gray-200 rounded-lg px-2 py-1
                       focus:outline-none focus:ring-1 focus:ring-indigo-400 ${aColours.select}`}
          >
            {ALLERGEN_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        )}
      </div>

      {/* ── Start-time input ── */}
      {onTimeChange && (
        <div className="px-3 pb-2 flex items-center gap-2">
          <span className="text-[10px] text-gray-400 flex-shrink-0">Start:</span>
          <input
            type="time"
            value={item.time}
            onChange={e => onTimeChange(item.id, e.target.value)}
            className="flex-1 min-w-0 text-[11px] font-mono text-gray-700 border border-gray-200
                       rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400"
          />
        </div>
      )}

      {/* ── Move-to buttons ── */}
      {onMoveTo && otherLines.length > 0 && (
        <div className="px-3 pb-3 flex items-center gap-1.5 flex-wrap border-t border-gray-100 pt-2">
          <span className="text-[9px] text-gray-400 font-medium flex-shrink-0">Move→</span>
          {otherLines.map(targetLine => {
            const compat = isCompatible(item, targetLine);
            const cap    = LINE_CAPS[targetLine];
            return (
              <button
                key={targetLine}
                onClick={() => compat && onMoveTo(item.id, targetLine)}
                disabled={!compat}
                title={!compat ? `${targetLine}: max ${cap?.toLocaleString()} kg/batch` : `Move to ${targetLine}`}
                className={`text-[10px] px-2 py-1 rounded-lg border font-bold transition-colors ${
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

// ── Sortable card — drag handle is the name/batch area only ─────────────────
function SortableCard({
  item,
  position,
  needsCleanBefore,
  onTimeChange,
  onAllergenChange,
  activeLines,
  onMoveTo,
}: {
  item: BoardItem;
  position: number;
  needsCleanBefore: boolean;
  onTimeChange: (id: string, time: string) => void;
  onAllergenChange: (id: string, allergen: string) => void;
  activeLines: string[];
  onMoveTo: (id: string, targetLine: string) => void;
}) {
  const [isHolding, setIsHolding] = useState(false);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  /*
   * dragHandleProps is applied ONLY to the top section of the card
   * (pill + product name + batch sizes). The bottom section (allergen,
   * time, move-to) has no listeners, so touch there scrolls normally.
   *
   * touch-action:none prevents the browser claiming the touch for scroll
   * while the 250ms hold is counting down inside TouchSensor.
   */
  const dragHandleProps = {
    ...listeners,
    onPointerDown:  () => setIsHolding(true),
    onPointerUp:    () => setIsHolding(false),
    onPointerCancel:() => setIsHolding(false),
    onPointerLeave: () => setIsHolding(false),
    style: { touchAction: 'none', userSelect: 'none' } as React.CSSProperties,
  };

  return (
    <div
      ref={setNodeRef}
      data-row-pos={position}
      {...attributes}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <ProductCard
        item={item}
        position={position}
        needsCleanBefore={needsCleanBefore}
        onTimeChange={onTimeChange}
        onAllergenChange={onAllergenChange}
        activeLines={activeLines}
        onMoveTo={onMoveTo}
        dragHandleProps={dragHandleProps}
        isHolding={isHolding && !isDragging}
        isDragging={isDragging}
      />
    </div>
  );
}

// ── Whiteboard column ──────────────────────────────────────────────────────
function LineColumn({
  line, items, onTimeChange, onAllergenChange,
  isDropTarget, blockedItem, activeLines, onMoveTo,
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
  const totalKg     = items.reduce((s, i) => s + i.quantity, 0);
  const totalBatch  = items.reduce((s, i) => s + i.batches, 0);
  const highlighted = isDropTarget && !blockedItem;
  const blocked     = !!blockedItem;

  const positions: Record<string, number> = {};
  items.forEach((item, i) => { positions[item.id] = i + 1; });
  const cleanBefore = new Set<string>();
  for (let i = 1; i < items.length; i++) {
    if (needsCleaning(items[i - 1], items[i])) cleanBefore.add(items[i].id);
  }

  return (
    <div className={`flex-shrink-0 min-w-[88vw] sm:min-w-0 sm:flex-1 flex flex-col
                     border-r last:border-r-0 border-gray-200 transition-colors ${
      blocked ? 'bg-red-50/60' : highlighted ? 'bg-blue-50/20' : 'bg-gray-50'
    }`}>

      {/* ── Column header ── */}
      <div className={`px-3 py-3 border-b-2 ${
        blocked     ? 'bg-red-700   border-red-900'  :
        highlighted ? 'bg-blue-700  border-blue-900' :
                      'bg-slate-800 border-slate-900'
      }`}>
        <p className="font-bold text-white text-base leading-tight">
          {LINE_LABEL[line] ?? line}
        </p>
        <div className="mt-1.5 space-y-px">
          <p className="text-[11px] text-slate-300">
            {items.length} product{items.length !== 1 ? 's' : ''} · {totalBatch} batch{totalBatch !== 1 ? 'es' : ''}
          </p>
          <p className="text-sm font-mono font-bold text-white tabular-nums">
            {totalKg.toLocaleString()} kg
          </p>
        </div>
        {blocked && blockedItem && (
          <p className="mt-1.5 text-[10px] text-red-100 font-semibold">
            ✕ Incompatible — needs {blockedItem.physicalBatchSize.toLocaleString()} kg/batch
          </p>
        )}
      </div>

      {/* ── Products ── */}
      <div
        ref={setNodeRef}
        className={`flex-1 p-2.5 space-y-2.5 min-h-[80px] transition-colors ${
          isOver && !blocked ? 'bg-blue-50/60' : ''
        }`}
      >
        <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
          {items.map(item => (
            <SortableCard
              key={item.id}
              item={item}
              position={positions[item.id]}
              needsCleanBefore={cleanBefore.has(item.id)}
              onTimeChange={onTimeChange}
              onAllergenChange={onAllergenChange}
              activeLines={activeLines}
              onMoveTo={onMoveTo}
            />
          ))}
          {items.length === 0 && (
            <div className="flex items-center justify-center h-20 text-[11px] text-gray-300
                            border-2 border-dashed border-gray-200 rounded-xl">
              Drop items here
            </div>
          )}
        </SortableContext>
      </div>

      {/* ── Subtotal ── */}
      <div className="border-t-2 border-gray-200 bg-white px-3 py-2">
        <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Subtotal</p>
        <p className="text-base font-mono font-bold text-gray-900 tabular-nums">
          {totalKg.toLocaleString()} kg
        </p>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────
interface ProductionBoardProps { data: ExcelRow[]; }

export function ProductionBoard({ data }: ProductionBoardProps) {
  const boardRows = data.filter(r => r.quantity > 0 && BOARD_LINES.includes(r.line));

  const [allItems, setAllItems] = useState<Record<string, BoardItem[]>>(() => {
    const result: Record<string, BoardItem[]> = {};
    for (const line of BOARD_LINES) {
      const rows = boardRows.filter(r => r.line === line);
      result[line] = suggestOrder(rows.map((r, i) => rowToBoardItem(r, i)));
    }
    return result;
  });

  // Derived from live state so it updates after smart assign
  const activeLines = BOARD_LINES.filter(line => (allItems[line]?.length ?? 0) > 0);

  const [activeId,    setActiveId]    = useState<string | null>(null);
  const [overLine,    setOverLine]    = useState<string | null>(null);
  const [blockedLine, setBlockedLine] = useState<string | null>(null);
  const [pdfLoading,  setPdfLoading]  = useState(false);
  const snapshot     = useRef<Record<string, BoardItem[]> | null>(null);
  const lastOverRef  = useRef<string | null>(null);
  const boardRef     = useRef<HTMLDivElement>(null);

  // Equalise card heights across columns so cards at the same position
  // (row 1, row 2, …) are the same height regardless of batch count.
  useLayoutEffect(() => {
    if (activeId || !boardRef.current) return;
    const board = boardRef.current;
    const cards = board.querySelectorAll<HTMLElement>('[data-row-pos]');
    cards.forEach(el => { el.style.minHeight = ''; });
    const byPos: Record<string, HTMLElement[]> = {};
    cards.forEach(el => { const pos = el.dataset.rowPos; if (pos) (byPos[pos] ??= []).push(el); });
    for (const group of Object.values(byPos)) {
      const maxH = Math.max(...group.map(el => el.offsetHeight));
      group.forEach(el => { el.style.minHeight = `${maxH}px`; });
    }
  }, [allItems, activeId]);

  /*
   * SENSORS:
   * MouseSensor — desktop mouse: activates immediately after 5px movement
   * TouchSensor — mobile touch: 250ms hold + 8px tolerance before activating.
   *   TouchSensor (unlike PointerSensor) calls preventDefault() on touchmove
   *   when the delay elapses, which stops the browser from scrolling the page.
   */
  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

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

  function handleTimeChange(id: string, time: string) {
    setAllItems(prev => {
      const next = { ...prev };
      for (const line of Object.keys(next)) {
        if (next[line].some(i => i.id === id)) {
          next[line] = sortByTime(next[line].map(i => i.id === id ? { ...i, time } : i));
          break;
        }
      }
      return next;
    });
  }

  function handleDragStart({ active }: DragStartEvent) {
    setActiveId(String(active.id));
    snapshot.current    = JSON.parse(JSON.stringify(allItems));
    lastOverRef.current = null;
  }

  function handleDragOver({ active, over }: DragOverEvent) {
    if (!over || !activeId) return;
    const activeIdStr = String(active.id);
    const overId      = String(over.id);

    // Resolve the container the pointer is over.
    // IMPORTANT: only accept real board lines — never fall back to an item ID.
    // Falling back to overId (an item ID) creates bogus keys in allItems and
    // corrupts the dnd-kit registry, causing a crash.
    const overContainer = BOARD_LINES.includes(overId)
      ? overId
      : Object.keys(allItems).find(k => allItems[k].some(i => i.id === overId));
    if (!overContainer) return;

    const currentContainer = findContainer(activeIdStr, allItems);
    setOverLine(overContainer);

    if (!currentContainer || currentContainer === overContainer) {
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
      // Re-derive source container from prev (freshest state) to avoid
      // stale-closure mismatches when multiple drag events fire per render.
      const freshSrc = Object.keys(prev).find(k => prev[k].some(i => i.id === activeIdStr));
      if (!freshSrc || !(overContainer in prev)) return prev;

      const src  = [...prev[freshSrc]];
      const dest = [...prev[overContainer]];
      const idx  = src.findIndex(i => i.id === activeIdStr);
      if (idx === -1) return prev;
      const [item] = src.splice(idx, 1);
      const overIdx = dest.findIndex(i => i.id === overId);
      overIdx >= 0 ? dest.splice(overIdx, 0, item) : dest.push(item);
      return { ...prev, [freshSrc]: src, [overContainer]: dest };
    });
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    const activeIdStr = String(active.id);
    if (!over) {
      if (snapshot.current) setAllItems(snapshot.current);
    } else {
      const overId = String(over.id);
      const overContainer = BOARD_LINES.includes(overId)
        ? overId
        : Object.keys(allItems).find(k => allItems[k].some(i => i.id === overId));
      const currentContainer = findContainer(activeIdStr, allItems);

      if (blockedLine) {
        if (snapshot.current) setAllItems(snapshot.current);
      } else if (currentContainer && overContainer && currentContainer === overContainer) {
        setAllItems(prev => {
          // Use freshest state — item may have moved during drag events.
          const freshContainer = Object.keys(prev).find(k => prev[k].some(i => i.id === activeIdStr));
          if (!freshContainer) return prev;
          const items  = prev[freshContainer];
          const oldIdx = items.findIndex(i => i.id === activeIdStr);
          const newIdx = items.findIndex(i => i.id === overId);
          if (oldIdx === -1 || newIdx === -1 || oldIdx === newIdx) return prev;
          return { ...prev, [freshContainer]: arrayMove(items, oldIdx, newIdx) };
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

  function handleSmartAssign() {
    const assigned = smartAssignKettles(boardRows);
    setAllItems(() => {
      const next: Record<string, BoardItem[]> = {};
      for (const line of BOARD_LINES) {
        const rows = assigned[line] ?? [];
        next[line] = suggestOrder(rows.map((r, i) => rowToBoardItem(r, i)));
      }
      return next;
    });
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
      {/* ── Toolbar ── */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <p className="text-xs text-gray-400 flex-1">
          <strong>Hold 0.25s</strong> then drag to reorder ·
          <strong> Move→</strong> buttons to transfer between lines ·
          swipe horizontally to see all kettles
        </p>
        <button
          onClick={handleSmartAssign}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold
                     text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 active:scale-95
                     transition-all shadow-sm w-full sm:w-auto"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
          </svg>
          Smart Assign Kettles
        </button>
        <button
          disabled={pdfLoading}
          onClick={async () => {
            setPdfLoading(true);
            try {
              await downloadBoardPDF(
                Object.fromEntries(activeLines.map(l => [l, allItems[l] ?? []])),
                activeLines,
                'production-board.pdf',
              );
            } catch (err) {
              alert(`Could not generate PDF: ${err instanceof Error ? err.message : String(err)}`);
            } finally {
              setPdfLoading(false);
            }
          }}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold
                     text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 active:scale-95
                     transition-all shadow-sm w-full sm:w-auto disabled:opacity-60 disabled:cursor-wait"
        >
          {pdfLoading ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
              </svg>
              Generating PDF…
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download Board (PDF)
            </>
          )}
        </button>
      </div>

      {/* ── Board columns ── */}
      <div ref={boardRef} className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
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

      {/* ── Floating ghost while dragging ── */}
      <DragOverlay dropAnimation={{ duration: 150, easing: 'ease' }}>
        {activeItem && (
          <div className="rotate-2 shadow-2xl w-52 opacity-95 ring-2 ring-indigo-400 rounded-xl">
            <ProductCard item={activeItem} position={0} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
