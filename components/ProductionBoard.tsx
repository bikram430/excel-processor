'use client';

import { useState, useRef, useLayoutEffect, useEffect, useMemo } from 'react';
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
import { parseLine78File } from '@/lib/line78Parser';
import { bestMatch } from '@/lib/fuzzyMatcher';
import {
  calculateMeat, recipesMap, subRecipesMap, meatDataLoadError,
  MEAT_ICON, MEAT_COLORS, type MeatResult,
} from '@/lib/meatCalculator';

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

// ── Per-product batch size overrides ───────────────────────────────────────
const PRODUCT_BATCH_CAPS: Record<string, number> = {
  'butter chicken':               1800,
  'finest creamy butter chicken': 1800,
};

function applyProductBatchCap(
  row: ExcelRow,
): { batches: number; batchBreakdown: string; physicalBatchSize: number } {
  const cap    = PRODUCT_BATCH_CAPS[row.product.toLowerCase().trim()];
  const physSz = row.physicalBatchSize ?? Math.ceil(row.quantity / Math.max(row.batches ?? 1, 1));
  if (!cap || physSz <= cap) {
    return {
      batches:          row.batches ?? 1,
      batchBreakdown:   row.batchBreakdown ?? `${row.quantity}×1`,
      physicalBatchSize: physSz,
    };
  }
  const n        = Math.max(Math.ceil(row.quantity / cap), 1);
  const perBatch = Math.ceil(row.quantity / n);
  return { batches: n, batchBreakdown: `${perBatch}×${n}`, physicalBatchSize: perBatch };
}

// K1 = Line 7 (Col B), K2 = Line 8 (Col R), K3 = Line 8 (Col R, same run as K2)
const LINE78_TARGET_LINES = new Set([
  'KETTLE 1 SOUP',
  'KETTLE 2 DIRECT FILL',
  'KETTLE 3 DIRECT FILL',
]);

// K4 and Blendtech use CIP-minimising order (not plain sequence)
const K4_BT_LINES = new Set(['KETTLE 4 KAPCOLD', 'BLENDTECH']);

// Meat type sort priority (group same meats together)
const MEAT_TYPE_ORDER: Record<string, number> = {
  Beef: 1, Chicken: 2, Lamb: 3, Pork: 4, Other: 5,
};

// Allergen sort priority (group same allergens together within a meat group)
const ALLERGEN_SORT_ORDER: Record<string, number> = {
  DAIRY: 1, WHEAT: 2, SOY: 3, FISH: 4, SULPHITE: 5, ALLERGEN_FREE: 6,
};

// ── Helpers ────────────────────────────────────────────────────────────────

/** Sort rows by the Sequence column from the production plan (ascending). */
function sortRowsBySequence(rows: ExcelRow[]): ExcelRow[] {
  return [...rows].sort((a, b) => {
    const aSeq = parseInt(a.sequence || '9999', 10);
    const bSeq = parseInt(b.sequence || '9999', 10);
    return (isNaN(aSeq) ? 9999 : aSeq) - (isNaN(bSeq) ? 9999 : bSeq);
  });
}

/**
 * Sort K4 / Blendtech items to minimise CIP frequency:
 *   1. Vegan first  (no meat + allergen-free)
 *   2. Then group by meat type  (Beef → Chicken → Lamb → Pork → Other)
 *   3. Within each meat group, sub-sort by allergen
 *   4. Non-vegan / no-meat items come after all meat groups
 */
function sortK4BT(items: BoardItem[]): BoardItem[] {
  if (items.length === 0) return items;

  const withMeta = items.map(item => {
    let meatType = '';
    try {
      const results = calculateMeat(item.itemCode, item.quantity, recipesMap, subRecipesMap);
      meatType = results[0]?.meat_type ?? '';
    } catch { /* no meat data — treat as no meat */ }
    const allergen = item.allergens[0] ?? 'ALLERGEN_FREE';
    const isVegan  = !meatType && allergen === 'ALLERGEN_FREE';
    return { item, meatType, allergen, isVegan };
  });

  return withMeta.sort((a, b) => {
    // 1. Vegan first
    if (a.isVegan !== b.isVegan) return a.isVegan ? -1 : 1;
    if (a.isVegan && b.isVegan)  return 0;

    // 2. Group by meat type (items without meat sort after all meat groups)
    const aMO = a.meatType ? (MEAT_TYPE_ORDER[a.meatType] ?? 6) : 7;
    const bMO = b.meatType ? (MEAT_TYPE_ORDER[b.meatType] ?? 6) : 7;
    if (aMO !== bMO) return aMO - bMO;

    // 3. Within same meat type, group by allergen
    const aAO = ALLERGEN_SORT_ORDER[a.allergen] ?? 7;
    const bAO = ALLERGEN_SORT_ORDER[b.allergen] ?? 7;
    return aAO - bAO;
  }).map(x => x.item);
}

function rowToBoardItem(row: ExcelRow, index: number): BoardItem {
  const capped = applyProductBatchCap(row);
  return {
    id:                `${row.line}-${row.itemCode || row.product}-${index}`,
    type:              'product',
    line:              row.line,
    product:           row.product,
    itemCode:          row.itemCode ?? '',
    quantity:          row.quantity,
    batches:           capped.batches,
    batchBreakdown:    capped.batchBreakdown,
    time:              '',
    allergens:         getProductAllergens(row.product, row.itemCode),
    physicalBatchSize: capped.physicalBatchSize,
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
      const kg = parseInt(m[1], 10);
      const n  = parseInt(m[2], 10);
      if (!kg || !n) continue;
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
  showMeat = true,
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
  showMeat?: boolean;
}) {
  const batchSizes = parseBatchSizes(item.batchBreakdown, item.batches, item.quantity);
  const otherLines = activeLines.filter(l => l !== item.line);
  const aKey       = allergenKey(item);
  const aColours   = ALLERGEN_COLOURS[aKey] ?? ALLERGEN_COLOURS.ALLERGEN_FREE;

  // Meat calculations — computed per batch, wrapped in try/catch per spec
  const allBatchMeat: MeatResult[][] = showMeat
    ? batchSizes.map(b => calculateMeat(item.itemCode, b.kg, recipesMap, subRecipesMap))
    : batchSizes.map(() => []);

  const hasMeat = allBatchMeat.some(r => r.length > 0);
  const totalCardMeatKg = allBatchMeat.reduce(
    (sum, results) => sum + results.reduce((s, r) => s + r.qty_kg, 0), 0
  );
  // Badges from first batch (structure same for all batches; qty varies)
  const meatBadges = (allBatchMeat[0] ?? []).map(r => ({
    icon:   MEAT_ICON[r.meat_type],
    colors: MEAT_COLORS[r.meat_type],
    label:  r.meat_type,
    key:    r.ingredient_code || r.ingredient_description,
  }));

  return (
    <div className={`bg-white rounded-xl overflow-hidden transition-all duration-150 ${
      isDragging ? 'opacity-30 scale-95' :
      isHolding  ? 'shadow-2xl scale-[1.03] ring-2 ring-indigo-400 border-indigo-200 border' :
                   'shadow-sm border border-gray-200'
    }`}>

      {/* ── Inline CIP indicator ── */}
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
       * ── DRAG HANDLE ──────────────────────────────────────────────────
       * Only this section has touch-action:none and the dnd listeners.
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

        {/* Position badge + product name + meat badges + batch sizes */}
        <div className="flex items-start px-3 pt-1 pb-2 gap-2">
          <div className="flex-shrink-0 w-5 h-5 mt-0.5 flex items-center justify-center
                          rounded-full bg-gray-100 text-[9px] font-bold text-gray-400">
            {position || '·'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-gray-900 text-sm leading-snug" title={item.product}>
              {item.product}
            </p>

            {/* Meat type badges */}
            {showMeat && meatBadges.length > 0 && (
              <div className="flex flex-wrap gap-0.5 mt-0.5">
                {meatBadges.map((badge, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-0.5 text-[8px] font-bold px-1.5 py-0.5 rounded-full"
                    style={{ backgroundColor: badge.colors.bg, color: badge.colors.text }}
                  >
                    <span>{badge.icon}</span>
                    <span>{badge.label}</span>
                  </span>
                ))}
              </div>
            )}

            {/* Kettle preference badge */}
            {(() => {
              const preferred   = getPreferredKettles(item.product, '');
              if (preferred.length === 0) return null;
              const shorts      = preferred.map(k => LINE_SHORT[k] ?? k).join('/');
              const onPreferred = preferred.includes(item.line);
              return (
                <span className={`inline-block text-[9px] font-bold px-1.5 py-0.5 rounded-full mt-0.5 ${
                  onPreferred ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                }`}>
                  {onPreferred ? '✓' : '→'} {shorts}
                </span>
              );
            })()}

            <p className="text-[11px] text-gray-500 font-mono mt-0.5">
              <span className="font-bold text-gray-700">{item.quantity.toLocaleString()}</span> kg total
            </p>

            {/* Batch rows with per-batch meat breakdown */}
            <div className="mt-2 space-y-1.5 bg-indigo-50 rounded-lg px-2 py-1.5">
              {batchSizes.map((b, i) => {
                const meatForBatch = allBatchMeat[i] ?? [];
                return (
                  <div key={i}>
                    {/* Batch number + kg */}
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-indigo-400 font-mono w-5 flex-shrink-0">
                        *{i + 1}
                      </span>
                      <span className="text-[12px] font-mono font-bold text-indigo-700 tabular-nums">
                        {b.kg.toLocaleString()} kg
                      </span>
                    </div>
                    {/* Meat breakdown below the kg */}
                    {showMeat && meatForBatch.length > 0 && (
                      <div className="mt-1 space-y-0.5">
                        {meatForBatch[0].is_sub_recipe ? (
                          // Sub-recipe chain display
                          <>
                            <div className="flex items-start gap-1">
                              <span className="text-[9px] leading-none flex-shrink-0 mt-px">{MEAT_ICON[meatForBatch[0].meat_type]}</span>
                              <span className="text-[9px] text-indigo-600 leading-tight flex-1">
                                {meatForBatch[0].sub_recipe_label}{' '}
                                <span className="text-indigo-400">(sub)</span>
                              </span>
                            </div>
                            {meatForBatch[0].sub_qty_kg !== null && (
                              <div className="flex items-center gap-1 pl-1">
                                <span className="text-[9px] text-gray-400">→</span>
                                <span className="text-[9px] font-mono font-bold text-indigo-600 tabular-nums">
                                  {meatForBatch[0].sub_qty_kg.toFixed(2)} kg
                                </span>
                              </div>
                            )}
                            <div className="flex items-start gap-1">
                              <span className="text-[9px] text-gray-400 flex-shrink-0">Raw:</span>
                              <span className="text-[9px] text-gray-600 leading-tight flex-1">
                                {meatForBatch[0].ingredient_description}
                              </span>
                            </div>
                            <div className="flex items-center gap-1 pl-1">
                              <span className="text-[9px] text-gray-400">→</span>
                              <span className="text-[9px] font-mono font-bold text-rose-700 tabular-nums">
                                {meatForBatch[0].qty_kg.toFixed(2)} kg
                              </span>
                            </div>
                          </>
                        ) : meatForBatch.length > 1 ? (
                          // Multi-meat display
                          <>
                            {meatForBatch.map((m, mi) => (
                              <div key={mi} className="flex items-start gap-1">
                                <span className="text-[9px] leading-none flex-shrink-0 mt-px">{MEAT_ICON[m.meat_type]}</span>
                                <span className="text-[9px] text-gray-600 flex-1 leading-tight min-w-0">
                                  {m.ingredient_description}
                                </span>
                                <span className="text-[9px] font-mono font-bold text-gray-700 tabular-nums flex-shrink-0">
                                  {m.qty_kg.toFixed(2)} kg
                                </span>
                              </div>
                            ))}
                            <div className="flex items-center pt-px border-t border-indigo-100 gap-1">
                              <span className="text-[9px] font-semibold text-gray-500 flex-1">Total meat:</span>
                              <span className="text-[9px] font-mono font-bold text-gray-700 tabular-nums">
                                {meatForBatch.reduce((s, m) => s + m.qty_kg, 0).toFixed(2)} kg
                              </span>
                            </div>
                          </>
                        ) : (
                          // Single direct meat
                          <>
                            <div className="flex items-start gap-1">
                              <span className="text-[9px] leading-none flex-shrink-0 mt-px">{MEAT_ICON[meatForBatch[0].meat_type]}</span>
                              <span className="text-[9px] text-gray-600 leading-tight flex-1">
                                {meatForBatch[0].ingredient_description}
                              </span>
                            </div>
                            <div className="flex items-center gap-1 pl-1">
                              <span className="text-[9px] text-gray-400">→</span>
                              <span className="text-[9px] font-mono font-bold text-gray-700 tabular-nums">
                                {meatForBatch[0].qty_kg.toFixed(2)} kg
                              </span>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      {/* ── END DRAG HANDLE ── */}

      {/* ── Total meat this card ── */}
      {showMeat && hasMeat && (
        <div className="px-3 pb-1.5">
          <div className="flex items-center justify-between bg-rose-50 rounded-lg px-2 py-1 border border-rose-100">
            <span className="text-[9px] font-semibold text-rose-600">Total meat this card</span>
            <span className="text-[10px] font-mono font-bold text-rose-700 tabular-nums">
              {totalCardMeatKg.toFixed(2)} kg
            </span>
          </div>
        </div>
      )}

      {/* ── Allergen badge + selector ── */}
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

      {/* ── Start-time input (24h text) ── */}
      {onTimeChange && (
        <div className="px-3 pb-2 flex items-center gap-2">
          <span className="text-[10px] text-gray-400 flex-shrink-0">Start:</span>
          <input
            type="text"
            value={item.time}
            placeholder="HH:MM"
            maxLength={5}
            onChange={e => onTimeChange(item.id, e.target.value)}
            onBlur={e => {
              const v = e.target.value.trim();
              const m = v.match(/^(\d{1,2}):(\d{2})$/);
              if (m) {
                const h = parseInt(m[1], 10), min = parseInt(m[2], 10);
                if (h < 24 && min < 60)
                  onTimeChange(item.id, `${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}`);
              } else if (!v) {
                onTimeChange(item.id, '');
              }
            }}
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
  showMeat,
}: {
  item: BoardItem;
  position: number;
  needsCleanBefore: boolean;
  onTimeChange: (id: string, time: string) => void;
  onAllergenChange: (id: string, allergen: string) => void;
  activeLines: string[];
  onMoveTo: (id: string, targetLine: string) => void;
  showMeat: boolean;
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
        showMeat={showMeat}
      />
    </div>
  );
}

// ── Whiteboard column ──────────────────────────────────────────────────────
function LineColumn({
  line, items, onTimeChange, onAllergenChange,
  isDropTarget, blockedItem, activeLines, onMoveTo, showMeat,
}: {
  line: string;
  items: BoardItem[];
  onTimeChange: (id: string, time: string) => void;
  onAllergenChange: (id: string, allergen: string) => void;
  isDropTarget: boolean;
  blockedItem: BoardItem | null;
  activeLines: string[];
  onMoveTo: (id: string, targetLine: string) => void;
  showMeat: boolean;
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
              showMeat={showMeat}
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

// ── Line 7-8 match types ────────────────────────────────────────────────────
interface Line78MatchItem {
  itemId: string;
  itemProduct: string;
  line: string;
  matchedProduct: string; // '' when no match found
  time: string;           // editable HH:MM 24-hour
  isLowConfidence: boolean;
  noMatch: boolean;
}

// ── Main component ─────────────────────────────────────────────────────────
interface ProductionBoardProps { data: ExcelRow[]; }

export function ProductionBoard({ data }: ProductionBoardProps) {
  const boardRows     = data.filter(r => r.quantity > 0 && BOARD_LINES.includes(r.line));
  const nonKettleRows = useMemo(
    () => data.filter(r => r.quantity > 0 && !BOARD_LINES.includes(r.line)),
    [data],
  );

  const [allItems, setAllItems] = useState<Record<string, BoardItem[]>>(() => {
    const result: Record<string, BoardItem[]> = {};
    for (const line of BOARD_LINES) {
      const rows  = sortRowsBySequence(boardRows.filter(r => r.line === line));
      const items = rows.map((r, i) => rowToBoardItem(r, i));
      // K4 and Blendtech: vegan-first + meat-type grouping + allergen grouping
      // All other lines: plain production-plan sequence order
      result[line] = K4_BT_LINES.has(line) ? sortK4BT(items) : items;
    }
    return result;
  });

  // Derived from live state so it updates after smart assign
  const activeLines = BOARD_LINES.filter(line => (allItems[line]?.length ?? 0) > 0);

  const [activeId,        setActiveId]        = useState<string | null>(null);
  const [overLine,        setOverLine]         = useState<string | null>(null);
  const [blockedLine,     setBlockedLine]      = useState<string | null>(null);
  const [pdfLoading,      setPdfLoading]       = useState(false);
  const [showMeat,        setShowMeat]         = useState(true);
  const [meatSummaryOpen, setMeatSummaryOpen]  = useState(false);

  // Line 7-8 upload state
  const [line78Modal,    setLine78Modal]    = useState(false);
  const [line78Matches,  setLine78Matches]  = useState<Line78MatchItem[]>([]);
  const [line78Loading,  setLine78Loading]  = useState(false);
  const [line78Toast,    setLine78Toast]    = useState<{ msg: string; ok: boolean } | null>(null);

  const snapshot    = useRef<Record<string, BoardItem[]> | null>(null);
  const lastOverRef = useRef<string | null>(null);
  const boardRef    = useRef<HTMLDivElement>(null);
  const line78Ref   = useRef<HTMLInputElement>(null);

  // Sync showMeat with localStorage (client-only)
  useEffect(() => {
    try {
      const stored = localStorage.getItem('showMeat');
      if (stored !== null) setShowMeat(stored === 'true');
    } catch { /* ignore SSR/private-mode */ }
  }, []);

  function toggleMeat() {
    setShowMeat(prev => {
      const next = !prev;
      try { localStorage.setItem('showMeat', String(next)); } catch { /* ignore */ }
      return next;
    });
  }

  // Aggregate meat across all items for the summary panel
  const meatSummary = useMemo(() => {
    const agg = new Map<string, { desc: string; total: number; meat_type: MeatResult['meat_type'] }>();
    const addResult = (r: MeatResult) => {
      const key = r.ingredient_code || r.ingredient_description;
      const ex  = agg.get(key);
      agg.set(key, { desc: r.ingredient_description, total: (ex?.total ?? 0) + r.qty_kg, meat_type: r.meat_type });
    };
    // Kettle items — per physical batch
    for (const line of BOARD_LINES) {
      for (const item of (allItems[line] ?? [])) {
        try {
          for (const batch of parseBatchSizes(item.batchBreakdown, item.batches, item.quantity)) {
            for (const r of calculateMeat(item.itemCode, batch.kg, recipesMap, subRecipesMap)) addResult(r);
          }
        } catch { /* skip */ }
      }
    }
    // Non-kettle items — by total quantity
    for (const row of nonKettleRows) {
      try {
        for (const r of calculateMeat(row.itemCode ?? '', row.quantity, recipesMap, subRecipesMap)) addResult(r);
      } catch { /* skip */ }
    }
    return [...agg.entries()]
      .map(([code, v]) => ({ code, desc: v.desc, total: Math.round(v.total * 100) / 100, meat_type: v.meat_type }))
      .sort((a, b) => b.total - a.total);
  }, [allItems, nonKettleRows]);

  // Pre-compute meat data for non-kettle table — only rows that have meat
  const nonKettleMeatData = useMemo(
    () => nonKettleRows
      .map(row => ({
        row,
        meatResults: calculateMeat(row.itemCode ?? '', row.quantity, recipesMap, subRecipesMap),
        inJson:      recipesMap.has((row.itemCode ?? '').toLowerCase().trim()),
      }))
      .filter(d => d.meatResults.length > 0),
    [nonKettleRows],
  );
  const nonKettleTotalMeat = useMemo(
    () => nonKettleMeatData.reduce((sum, d) => sum + d.meatResults.reduce((s, m) => s + m.qty_kg, 0), 0),
    [nonKettleMeatData],
  );

  // Equalise card heights across columns so cards at the same position
  // (row 1, row 2, …) are the same height regardless of batch count.
  // Re-runs when showMeat changes because meat rows alter card height.
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
  }, [allItems, activeId, showMeat]);

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

  function showToast(msg: string, ok: boolean) {
    setLine78Toast({ msg, ok });
    setTimeout(() => setLine78Toast(null), 3500);
  }

  async function handleLine78Upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ''; // allow re-upload of the same file

    setLine78Loading(true);
    try {
      const { line7, line8 } = await parseLine78File(file);

      if (line7.length === 0 && line8.length === 0) {
        showToast('No "Line 7" or "Line 8" rows found in the uploaded file.', false);
        return;
      }

      // K1          → Line 7 entries (product names from Col B)
      // K2 and K3   → Line 8 entries (product names from Col R)
      //   K3 runs in parallel with K2 — same production line (Line 8)
      const entriesByLine: Record<string, typeof line7> = {
        'KETTLE 1 SOUP':         line7,
        'KETTLE 2 DIRECT FILL':  line8,
        'KETTLE 3 DIRECT FILL':  line8,
      };

      const pending: Line78MatchItem[] = [];

      const targetLines = activeLines.filter(l => LINE78_TARGET_LINES.has(l));
      for (const line of targetLines) {
        const entries     = entriesByLine[line] ?? [];
        const products    = entries.map(en => en.product);
        const entryByName = new Map(entries.map(en => [en.product, en]));

        for (const item of (allItems[line] ?? [])) {
          const result  = bestMatch(item.product, products);
          const matched = result && !result.noMatch ? result.matched : '';
          const entry   = matched ? entryByName.get(matched) : undefined;
          pending.push({
            itemId:          item.id,
            itemProduct:     item.product,
            line,
            matchedProduct:  matched,
            time:            entry?.startTime ?? item.time,
            isLowConfidence: result?.isLowConfidence ?? true,
            noMatch:         !matched,
          });
        }
      }

      setLine78Matches(pending);
      setLine78Modal(true);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to parse the file.', false);
    } finally {
      setLine78Loading(false);
    }
  }

  function updateMatchTime(itemId: string, time: string) {
    setLine78Matches(prev => prev.map(m => m.itemId === itemId ? { ...m, time } : m));
  }

  function handleLine78Confirm() {
    setAllItems(prev => {
      const next = { ...prev };
      for (const line of Object.keys(next)) {
        next[line] = sortByTime(next[line].map(item => {
          const match = line78Matches.find(m => m.itemId === item.id);
          return match && match.time ? { ...item, time: match.time } : item;
        }));
      }
      return next;
    });
    setLine78Modal(false);
    setLine78Matches([]);
    showToast('Start times applied successfully!', true);
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
    <>
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      {/* ── Meat data load error banner ── */}
      {meatDataLoadError && (
        <div className="mb-3 flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
          <span className="text-amber-600 text-sm">⚠</span>
          <span className="text-xs text-amber-700">
            Meat data unavailable — recipes.json could not be loaded.
          </span>
        </div>
      )}

      {/* ── Meat Requirements Summary panel ── */}
      <div className="mb-4 rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <button
          onClick={() => setMeatSummaryOpen(v => !v)}
          aria-expanded={meatSummaryOpen}
          className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="text-base">🥩</span>
            <span className="font-semibold text-gray-700 text-sm">Meat Requirements Summary</span>
            {meatSummary.length > 0 && (
              <span className="text-xs text-gray-400">
                ({meatSummary.length} ingredient{meatSummary.length !== 1 ? 's' : ''})
              </span>
            )}
          </div>
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${meatSummaryOpen ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {meatSummaryOpen && (
          <div className="border-t border-gray-200 p-4">
            {meatSummary.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-2">No meat ingredients found.</p>
            ) : (
              <>
                {/* Desktop table */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left pb-2 pr-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Meat Ingredient</th>
                        <th className="text-left pb-2 pr-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Code</th>
                        <th className="text-right pb-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Total Qty (kg)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {meatSummary.map((entry, i) => (
                        <tr key={i} className={`border-b border-gray-100 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                          <td className="py-2 pr-4">
                            <div className="flex items-center gap-1.5">
                              <span
                                className="text-[9px] font-bold px-1.5 py-0.5 rounded-full inline-flex items-center gap-0.5"
                                style={{ backgroundColor: MEAT_COLORS[entry.meat_type].bg, color: MEAT_COLORS[entry.meat_type].text }}
                              >
                                {MEAT_ICON[entry.meat_type]} {entry.meat_type}
                              </span>
                              <span className="text-sm text-gray-700">{entry.desc}</span>
                            </div>
                          </td>
                          <td className="py-2 pr-4 font-mono text-xs text-gray-500">{entry.code || '—'}</td>
                          <td className="py-2 text-right font-mono font-bold text-gray-800 tabular-nums">
                            {entry.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-gray-300 bg-green-50">
                        <td colSpan={2} className="py-2 pr-4 font-bold text-green-800 text-sm">Grand Total</td>
                        <td className="py-2 text-right font-mono font-bold text-green-800 tabular-nums">
                          {meatSummary.reduce((s, e) => s + e.total, 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                {/* Mobile cards */}
                <div className="sm:hidden space-y-2">
                  {meatSummary.map((entry, i) => (
                    <div key={i} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                      <div className="flex-1 min-w-0 mr-3">
                        <span
                          className="text-[8px] font-bold px-1.5 py-0.5 rounded-full inline-flex items-center gap-0.5 mb-0.5"
                          style={{ backgroundColor: MEAT_COLORS[entry.meat_type].bg, color: MEAT_COLORS[entry.meat_type].text }}
                        >
                          {MEAT_ICON[entry.meat_type]} {entry.meat_type}
                        </span>
                        <p className="text-sm font-semibold text-gray-700 truncate">{entry.desc}</p>
                        <p className="text-xs text-gray-400 font-mono">{entry.code || '—'}</p>
                      </div>
                      <span className="font-mono font-bold text-gray-800 tabular-nums text-sm flex-shrink-0">
                        {entry.total.toFixed(2)} kg
                      </span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between bg-green-50 rounded-lg px-3 py-2 border border-green-200">
                    <span className="font-bold text-green-800 text-sm">Grand Total</span>
                    <span className="font-mono font-bold text-green-800 tabular-nums">
                      {meatSummary.reduce((s, e) => s + e.total, 0).toFixed(2)} kg
                    </span>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Toolbar ── */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <p className="text-xs text-gray-400 flex-1">
          <strong>Hold 0.25s</strong> then drag to reorder ·
          <strong> Move→</strong> buttons to transfer between lines ·
          swipe horizontally to see all kettles
        </p>
        <button
          onClick={toggleMeat}
          aria-label={showMeat ? 'Hide meat quantities' : 'Show meat quantities'}
          className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold
                     rounded-xl transition-all shadow-sm w-full sm:w-auto ${
            showMeat
              ? 'text-white bg-rose-500 hover:bg-rose-600 active:scale-95'
              : 'text-rose-700 bg-rose-50 border border-rose-200 hover:bg-rose-100 active:scale-95'
          }`}
        >
          🥩 {showMeat ? 'Hide Meat' : 'Show Meat'}
        </button>
        {/* Hidden file input for Line 7-8 upload */}
        <input
          ref={line78Ref}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={handleLine78Upload}
        />
        <button
          onClick={() => line78Ref.current?.click()}
          disabled={line78Loading}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold
                     text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 active:scale-95
                     transition-all shadow-sm w-full sm:w-auto disabled:opacity-60 disabled:cursor-wait"
        >
          {line78Loading ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
              </svg>
              Parsing…
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Upload Line 7-8
            </>
          )}
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
                showMeat={showMeat}
              />
            );
          })}
        </div>
      </div>

      {/* ── Floating ghost while dragging ── */}
      <DragOverlay dropAnimation={{ duration: 150, easing: 'ease' }}>
        {activeItem && (
          <div className="rotate-2 shadow-2xl w-52 opacity-95 ring-2 ring-indigo-400 rounded-xl">
            <ProductCard item={activeItem} position={0} showMeat={false} />
          </div>
        )}
      </DragOverlay>
    </DndContext>

    {/* ── Non-Kettle Items section ── */}

    {nonKettleMeatData.length > 0 && (
      <div className="mt-6">
        <h3 className="text-base font-bold text-gray-700 mb-3 flex items-center gap-2">
          Non-Kettle Items (Meat)
          <span className="text-sm font-normal text-gray-400">
            ({nonKettleMeatData.length} item{nonKettleMeatData.length !== 1 ? 's' : ''} with meat)
          </span>
        </h3>
        <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
          <table className="w-full min-w-[580px] text-sm">
            <thead>
              <tr className="bg-slate-800 text-white">
                <th className="text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wider w-8">#</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wider">Product Name</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wider">WIP Code</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wider">Line</th>
                <th className="text-right px-3 py-2.5 text-xs font-semibold uppercase tracking-wider">Qty (kg)</th>
                {showMeat && <th className="text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wider">Meat Type</th>}
                {showMeat && <th className="text-right px-3 py-2.5 text-xs font-semibold uppercase tracking-wider">Meat Qty (kg)</th>}
              </tr>
            </thead>
            <tbody>
              {nonKettleMeatData.flatMap(({ row, meatResults, inJson }, idx) => {
                const shade = idx % 2 === 0;
                const bg    = shade ? 'bg-white' : 'bg-gray-50';
                // No meat found
                if (!showMeat || meatResults.length === 0) {
                  return [(
                    <tr key={idx} className={`${bg} border-b border-gray-100`}>
                      <td className="px-3 py-2 text-xs text-gray-400">{idx + 1}</td>
                      <td className="px-3 py-2 font-medium text-gray-800">{row.product}</td>
                      <td className="px-3 py-2 font-mono text-xs text-gray-500">{row.itemCode || '—'}</td>
                      <td className="px-3 py-2 text-xs text-gray-500">{row.line}</td>
                      <td className="px-3 py-2 text-right font-mono font-bold text-gray-700 tabular-nums">{row.quantity.toLocaleString()}</td>
                      {showMeat && <td className="px-3 py-2 text-xs text-gray-400 italic">{inJson ? '—' : 'No recipe data'}</td>}
                      {showMeat && <td className="px-3 py-2 text-right text-gray-400">—</td>}
                    </tr>
                  )];
                }
                // One row per meat ingredient
                return meatResults.map((m, mi) => (
                  <tr key={`${idx}-${mi}`} className={`${bg} border-b border-gray-100`}>
                    {mi === 0 ? (
                      <>
                        <td className="px-3 py-2 text-xs text-gray-400 align-top">{idx + 1}</td>
                        <td className="px-3 py-2 font-medium text-gray-800 align-top">{row.product}</td>
                        <td className="px-3 py-2 font-mono text-xs text-gray-500 align-top">{row.itemCode || '—'}</td>
                        <td className="px-3 py-2 text-xs text-gray-500 align-top">{row.line}</td>
                        <td className="px-3 py-2 text-right font-mono font-bold text-gray-700 tabular-nums align-top">{row.quantity.toLocaleString()}</td>
                      </>
                    ) : (
                      <>
                        <td className="px-3 py-1" />
                        <td className="px-3 py-1 text-xs text-gray-400 pl-5 italic">↳</td>
                        <td className="px-3 py-1" />
                        <td className="px-3 py-1" />
                        <td className="px-3 py-1" />
                      </>
                    )}
                    <td className="px-3 py-2">
                      <div className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: MEAT_COLORS[m.meat_type].bg, color: MEAT_COLORS[m.meat_type].text }}>
                        {MEAT_ICON[m.meat_type]} {m.meat_type}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5 truncate max-w-[180px]">{m.ingredient_description}</div>
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-bold text-gray-700 tabular-nums align-middle">
                      {m.qty_kg.toFixed(2)}
                    </td>
                  </tr>
                ));
              })}
            </tbody>
            {showMeat && (
              <tfoot>
                <tr className="bg-green-50 border-t-2 border-green-200">
                  <td colSpan={5} className="px-3 py-2 font-bold text-green-800 text-sm">
                    Total meat (non-kettle)
                  </td>
                  <td colSpan={2} className="px-3 py-2 text-right font-mono font-bold text-green-800 tabular-nums">
                    {nonKettleTotalMeat.toFixed(2)} kg
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    )}

    {/* ── Line 7-8 Confirmation Modal ─────────────────────────────────────── */}
    {line78Modal && (() => {
      const unmatched    = line78Matches.filter(m => m.noMatch).length;
      const lowConf      = line78Matches.filter(m => m.isLowConfidence && !m.noMatch).length;
      const linesInModal = BOARD_LINES.filter(l => line78Matches.some(m => m.line === l));
      return (
        <div className="fixed inset-0 z-50 flex items-start justify-center
                        bg-black/40 backdrop-blur-sm overflow-y-auto py-6 px-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200
                          w-full max-w-2xl mx-auto my-auto">

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xl">📅</span>
                <h2 className="font-bold text-gray-900 text-lg">Line 7-8 Start Times</h2>
                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-semibold flex-shrink-0">
                  K1 · K2 · K3
                </span>
                {lowConf > 0 && (
                  <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold">
                    ⚠ {lowConf} low confidence
                  </span>
                )}
                {unmatched > 0 && (
                  <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-semibold">
                    ✕ {unmatched} unmatched
                  </span>
                )}
              </div>
              <button
                onClick={() => { setLine78Modal(false); setLine78Matches([]); }}
                className="text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0 ml-2"
                aria-label="Close"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Body */}
            <div className="max-h-[60vh] overflow-y-auto p-5 space-y-5">
              {linesInModal.map(line => (
                <div key={line}>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                    {LINE_LABEL[line] ?? line}
                  </p>
                  <div className="space-y-2">
                    {line78Matches.filter(m => m.line === line).map(match => (
                      <div
                        key={match.itemId}
                        className={`rounded-xl p-3 border ${
                          match.noMatch
                            ? 'bg-red-50 border-red-200'
                            : match.isLowConfidence
                            ? 'bg-amber-50 border-amber-200'
                            : 'bg-green-50 border-green-200'
                        }`}
                      >
                        {/* Product name */}
                        <p className="font-semibold text-gray-900 text-sm leading-tight truncate">
                          {match.itemProduct}
                        </p>

                        {/* Match badge + matched name */}
                        <div className="flex flex-wrap items-center gap-1.5 mt-1">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                            match.noMatch
                              ? 'bg-red-100 text-red-700'
                              : match.isLowConfidence
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-green-100 text-green-700'
                          }`}>
                            {match.noMatch ? '✕ No match found' : match.isLowConfidence ? '⚠ Low confidence' : '✓ Matched'}
                          </span>
                          {!match.noMatch && (
                            <span className="text-[10px] text-gray-500 truncate max-w-full sm:max-w-xs">
                              ← {match.matchedProduct}
                            </span>
                          )}
                        </div>

                        {/* Time input */}
                        <div className="flex flex-wrap items-center gap-2 mt-2">
                          <span className="text-[11px] text-gray-500 flex-shrink-0">Start time (24h):</span>
                          <input
                            type="text"
                            placeholder="HH:MM"
                            maxLength={5}
                            value={match.time}
                            onChange={e => updateMatchTime(match.itemId, e.target.value)}
                            onBlur={e => {
                              const v = e.target.value.trim();
                              const m = v.match(/^(\d{1,2}):(\d{2})$/);
                              if (m) {
                                const h = parseInt(m[1], 10), min = parseInt(m[2], 10);
                                if (h < 24 && min < 60)
                                  updateMatchTime(match.itemId, `${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}`);
                              }
                            }}
                            className={`text-sm font-mono border rounded-lg px-2 py-1 w-20
                                        focus:outline-none focus:ring-2 focus:ring-indigo-400 ${
                              match.noMatch
                                ? 'border-red-200 bg-white'
                                : match.isLowConfidence
                                ? 'border-amber-200 bg-white'
                                : 'border-green-200 bg-white'
                            }`}
                          />
                          {match.noMatch && !match.time && (
                            <span className="text-[10px] text-red-400 italic">
                              Enter manually or leave blank to skip
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between
                            gap-3 px-5 py-4 border-t border-gray-200 bg-gray-50 rounded-b-2xl">
              <p className="text-xs text-gray-400">
                Edit any time before applying. Blank times will be skipped.
              </p>
              <div className="flex gap-2 w-full sm:w-auto">
                <button
                  onClick={() => { setLine78Modal(false); setLine78Matches([]); }}
                  className="flex-1 sm:flex-none px-4 py-2 text-sm text-gray-600
                             border border-gray-200 rounded-xl hover:bg-gray-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleLine78Confirm}
                  className="flex-1 sm:flex-none px-5 py-2 text-sm font-semibold text-white
                             bg-indigo-600 rounded-xl hover:bg-indigo-700 active:scale-95 transition-all"
                >
                  Confirm &amp; Apply
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    })()}

    {/* ── Toast notification ─────────────────────────────────────────────── */}
    {line78Toast && (
      <div className={`fixed bottom-5 right-5 z-50 flex items-center gap-2 px-4 py-3
                       rounded-xl shadow-lg text-white text-sm font-semibold
                       transition-all duration-300 max-w-xs ${
        line78Toast.ok ? 'bg-green-600' : 'bg-red-600'
      }`}>
        <span>{line78Toast.ok ? '✓' : '✕'}</span>
        <span>{line78Toast.msg}</span>
      </div>
    )}
    </>
  );
}
