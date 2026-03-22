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
import { getProductAllergens, suggestOrder, insertCleaningSteps } from '@/lib/allergenRules';

// ── Line config ────────────────────────────────────────────────────────────
const BOARD_LINES = [
  'BLENDTECH',
  'KETTLE 1 SOUP',
  'KETTLE 2 DIRECT FILL',
  'KETTLE 3 DIRECT FILL',
  'KETTLE 4 KAPCOLD',
];

/** Max single physical batch size (kg) per line */
const LINE_CAPS: Record<string, number> = {
  'BLENDTECH':            2000,
  'KETTLE 1 SOUP':        2000,
  'KETTLE 2 DIRECT FILL': 2000,
  'KETTLE 3 DIRECT FILL': 2000,
  'KETTLE 4 KAPCOLD':     1000,
};

const ALLERGEN_COLOURS: Record<string, string> = {
  DAIRY:  'bg-yellow-100 text-yellow-800 border-yellow-200',
  MEAT:   'bg-red-100   text-red-800   border-red-200',
  EGG:    'bg-orange-100 text-orange-800 border-orange-200',
  GLUTEN: 'bg-amber-100  text-amber-800  border-amber-200',
  NUT:    'bg-lime-100   text-lime-800   border-lime-200',
};

// ── Helpers ────────────────────────────────────────────────────────────────
function rowToBoardItem(row: ExcelRow, index: number): BoardItem {
  return {
    id:               `${row.line}-${row.itemCode || row.product}-${index}`,
    type:             'product',
    line:             row.line,
    product:          row.product,
    quantity:         row.quantity,
    batches:          row.batches ?? 1,
    batchBreakdown:   row.batchBreakdown ?? `${row.quantity}×1`,
    time:             '',
    allergens:        getProductAllergens(row.product),
    physicalBatchSize: row.physicalBatchSize ?? Math.ceil(row.quantity / (row.batches ?? 1)),
  };
}

function isCompatible(item: BoardItem, targetLine: string): boolean {
  const cap = LINE_CAPS[targetLine];
  if (cap === undefined) return true;
  return item.physicalBatchSize <= cap;
}

function findContainer(id: string, allItems: Record<string, BoardItem[]>): string | null {
  if (id in allItems) return id;
  return Object.entries(allItems).find(([, items]) =>
    items.some(item => item.id === id)
  )?.[0] ?? null;
}

function findItem(id: string, allItems: Record<string, BoardItem[]>): BoardItem | null {
  for (const items of Object.values(allItems)) {
    const found = items.find(i => i.id === id);
    if (found) return found;
  }
  return null;
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
  const ws  = XLSX.utils.json_to_sheet(rows);
  const wb  = XLSX.utils.book_new();
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

// ── Card content (shared between sortable cards and drag overlay) ──────────
function CardContent({
  item,
  position,
  onTimeChange,
  dragProps = {},
}: {
  item: BoardItem;
  position: number;
  onTimeChange?: (id: string, time: string) => void;
  dragProps?: Record<string, unknown>;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      <div className="flex items-stretch">
        {/* Drag handle */}
        <div
          {...dragProps}
          className="flex items-center px-3 bg-gray-50 border-r border-gray-200
                     cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 select-none"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path d="M7 2a2 2 0 11-4 0 2 2 0 014 0zM7 8a2 2 0 11-4 0 2 2 0 014 0zM7 14a2 2 0 11-4 0 2 2 0 014 0zM13 2a2 2 0 11-4 0 2 2 0 014 0zM13 8a2 2 0 11-4 0 2 2 0 014 0zM13 14a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
        </div>

        {/* Position badge */}
        <div className="flex items-center justify-center w-8 text-xs font-bold text-gray-400 bg-gray-50 border-r border-gray-200 flex-shrink-0">
          {position || '·'}
        </div>

        {/* Main info */}
        <div className="flex-1 px-4 py-3 min-w-0">
          <p className="font-semibold text-gray-900 text-sm truncate">{item.product}</p>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <span className="text-xs text-gray-500 font-mono">{item.quantity.toLocaleString()} kg</span>
            <span className="text-xs text-indigo-700 font-mono font-semibold">
              {item.batches} batch{item.batches !== 1 ? 'es' : ''}
            </span>
            <span className="text-xs text-indigo-500 font-mono">[{item.batchBreakdown}]</span>
          </div>
          {item.allergens.length > 0 && (
            <div className="flex gap-1 mt-1.5 flex-wrap">
              {item.allergens.map(a => (
                <span key={a}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${ALLERGEN_COLOURS[a] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                  {a}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Time input */}
        {onTimeChange && (
          <div className="flex items-center px-3 border-l border-gray-100">
            <input
              type="time"
              value={item.time}
              onChange={e => onTimeChange(item.id, e.target.value)}
              className="text-xs font-mono text-gray-700 border border-gray-200 rounded
                         px-1.5 py-1 w-24 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sortable card ──────────────────────────────────────────────────────────
function SortableCard({
  item,
  position,
  onTimeChange,
}: {
  item: BoardItem;
  position: number;
  onTimeChange: (id: string, time: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.25 : 1,
      }}
    >
      <CardContent
        item={item}
        position={position}
        onTimeChange={onTimeChange}
        dragProps={{ ...attributes, ...listeners }}
      />
    </div>
  );
}

// ── Cleaning step banner ───────────────────────────────────────────────────
function CleaningStep() {
  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border border-amber-200
                    rounded-lg text-amber-700 text-xs font-semibold pointer-events-none">
      <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      Cleaning / CIP required before next product
    </div>
  );
}

// ── One line section (droppable container) ────────────────────────────────
function LineSection({
  line,
  items,
  onTimeChange,
  isDropTarget,
  blockedItem,
}: {
  line: string;
  items: BoardItem[];
  onTimeChange: (id: string, time: string) => void;
  isDropTarget: boolean;
  blockedItem: BoardItem | null;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: line });
  const cap         = LINE_CAPS[line];
  const totalKg     = items.reduce((s, i) => s + i.quantity, 0);
  const totalBatch  = items.reduce((s, i) => s + i.batches, 0);

  // Build display list with cleaning step banners
  const displayItems = insertCleaningSteps(items);
  const positions: Record<string, number> = {};
  let pos = 0;
  for (const entry of displayItems) {
    if (entry.type !== 'cleaning') positions[entry.id] = ++pos;
  }

  const highlighted = isDropTarget && !blockedItem;
  const blocked     = !!blockedItem;

  return (
    <div className={`rounded-xl border-2 transition-colors duration-150 ${
      blocked     ? 'border-red-400 bg-red-50/40' :
      highlighted ? 'border-blue-400 bg-blue-50/20' :
                    'border-gray-200 bg-white'
    }`}>

      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-bold text-gray-900 text-sm">{line}</span>
          {cap && (
            <span className="text-xs text-gray-400 font-mono bg-gray-100 px-1.5 py-0.5 rounded">
              max {cap.toLocaleString()} kg/batch
            </span>
          )}
          <span className="text-xs text-gray-400">
            {items.length} product{items.length !== 1 ? 's' : ''} · {totalBatch} batch{totalBatch !== 1 ? 'es' : ''} · {totalKg.toLocaleString()} kg
          </span>
        </div>

        <button
          onClick={() => downloadSequence(line, items)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold
                     text-green-700 bg-green-50 border border-green-200 rounded-lg
                     hover:bg-green-100 transition-colors flex-shrink-0"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Download
        </button>
      </div>

      {/* Incompatibility warning */}
      {blocked && blockedItem && (
        <div className="mx-3 mt-3 flex items-center gap-2 px-3 py-2 bg-red-100 border border-red-300
                        rounded-lg text-red-800 text-xs font-semibold">
          <svg className="w-4 h-4 flex-shrink-0 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Kettle incompatible — {line} max {cap?.toLocaleString()} kg/batch · {blockedItem.product} needs {blockedItem.physicalBatchSize.toLocaleString()} kg/batch
        </div>
      )}

      {/* Droppable items area */}
      <div ref={setNodeRef} className={`p-3 space-y-2 min-h-[64px] transition-colors ${isOver && !blocked ? 'bg-blue-50/30' : ''}`}>
        <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
          {displayItems.map(entry => {
            if (entry.type === 'cleaning') {
              return <CleaningStep key={entry.id} />;
            }
            const item = entry as BoardItem;
            return (
              <SortableCard
                key={item.id}
                item={item}
                position={positions[item.id]}
                onTimeChange={onTimeChange}
              />
            );
          })}
          {items.length === 0 && (
            <div className="flex items-center justify-center h-14 text-gray-300 text-sm
                            border-2 border-dashed border-gray-200 rounded-lg">
              Drop items here
            </div>
          )}
        </SortableContext>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────
interface ProductionBoardProps {
  data: ExcelRow[];
}

export function ProductionBoard({ data }: ProductionBoardProps) {
  const boardRows  = data.filter(r => r.quantity > 0 && BOARD_LINES.includes(r.line));
  const activeLines = BOARD_LINES.filter(line => boardRows.some(r => r.line === line));

  // All items keyed by line
  const [allItems, setAllItems] = useState<Record<string, BoardItem[]>>(() => {
    const result: Record<string, BoardItem[]> = {};
    for (const line of activeLines) {
      const rows = boardRows.filter(r => r.line === line);
      result[line] = suggestOrder(rows.map((r, i) => rowToBoardItem(r, i)));
    }
    return result;
  });

  const [activeId,   setActiveId]   = useState<string | null>(null);
  const [overLine,   setOverLine]   = useState<string | null>(null);
  const [blockedLine, setBlockedLine] = useState<string | null>(null);

  // Save snapshot at drag start so we can revert on cancel / incompatible drop
  const snapshot = useRef<Record<string, BoardItem[]> | null>(null);
  // Track last processed over-container to avoid redundant state updates
  const lastOverRef = useRef<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

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

  function handleDragStart({ active }: DragStartEvent) {
    setActiveId(String(active.id));
    snapshot.current = JSON.parse(JSON.stringify(allItems));
    lastOverRef.current = null;
  }

  function handleDragOver({ active, over }: DragOverEvent) {
    if (!over || !activeId) return;

    const activeIdStr    = String(active.id);
    const overId         = String(over.id);
    const currentContainer = findContainer(activeIdStr, allItems);
    const overContainer    = findContainer(overId, allItems) ?? overId;

    setOverLine(overContainer);

    if (!currentContainer || !overContainer) return;

    // Same container — sortable strategy handles visual reorder automatically
    if (currentContainer === overContainer) {
      setBlockedLine(null);
      lastOverRef.current = overContainer;
      return;
    }

    // Skip if we already processed this exact over-container transition
    if (lastOverRef.current === overContainer) return;
    lastOverRef.current = overContainer;

    // Cross-container: check compatibility
    const movingItem = findItem(activeIdStr, allItems);
    if (!movingItem) return;

    if (!isCompatible(movingItem, overContainer)) {
      setBlockedLine(overContainer);
      return; // Block the move — do NOT update allItems
    }

    setBlockedLine(null);

    // Move item to new container (live preview)
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
      // Dropped outside — revert
      if (snapshot.current) setAllItems(snapshot.current);
    } else {
      const overId           = String(over.id);
      const currentContainer = findContainer(activeIdStr, allItems);
      const overContainer    = findContainer(overId, allItems) ?? overId;

      if (blockedLine) {
        // Incompatible drop — revert to snapshot
        if (snapshot.current) setAllItems(snapshot.current);
      } else if (currentContainer && overContainer && currentContainer === overContainer) {
        // Same container: finalise sort
        setAllItems(prev => {
          const items  = prev[currentContainer];
          const oldIdx = items.findIndex(i => i.id === activeIdStr);
          const newIdx = items.findIndex(i => i.id === overId);
          if (oldIdx === -1 || newIdx === -1 || oldIdx === newIdx) return prev;
          return { ...prev, [currentContainer]: arrayMove(items, oldIdx, newIdx) };
        });
      }
      // Cross-container compatible: already done in onDragOver
    }

    setActiveId(null);
    setOverLine(null);
    setBlockedLine(null);
    snapshot.current  = null;
    lastOverRef.current = null;
  }

  function handleDragCancel() {
    if (snapshot.current) setAllItems(snapshot.current);
    setActiveId(null);
    setOverLine(null);
    setBlockedLine(null);
    snapshot.current    = null;
    lastOverRef.current = null;
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
      <p className="text-xs text-gray-400 mb-3">
        Drag between sections to move items · Red border = incompatible line
      </p>

      <div className="space-y-4">
        {activeLines.map(line => {
          const items       = allItems[line] ?? [];
          const isTarget    = overLine === line && activeId !== null;
          const blocked     = blockedLine === line ? (activeItem ?? null) : null;

          return (
            <LineSection
              key={line}
              line={line}
              items={items}
              onTimeChange={handleTimeChange}
              isDropTarget={isTarget}
              blockedItem={blocked}
            />
          );
        })}
      </div>

      {/* Ghost card that follows the cursor during drag */}
      <DragOverlay dropAnimation={null}>
        {activeItem && (
          <div className="rotate-1 opacity-95 shadow-2xl">
            <CardContent item={activeItem} position={0} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
