'use client';

import { useState } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { BoardItem } from '@/types';
import { insertCleaningSteps } from '@/lib/allergenRules';

// ── Allergen badge colours ─────────────────────────────────────────────────
const ALLERGEN_COLOURS: Record<string, string> = {
  DAIRY:  'bg-yellow-100 text-yellow-800 border-yellow-200',
  MEAT:   'bg-red-100   text-red-800   border-red-200',
  EGG:    'bg-orange-100 text-orange-800 border-orange-200',
  GLUTEN: 'bg-amber-100  text-amber-800  border-amber-200',
  NUT:    'bg-lime-100   text-lime-800   border-lime-200',
};

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
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden"
    >
      <div className="flex items-stretch">
        {/* Drag handle */}
        <div
          {...attributes}
          {...listeners}
          className="flex items-center px-3 bg-gray-50 border-r border-gray-200
                     cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path d="M7 2a2 2 0 11-4 0 2 2 0 014 0zM7 8a2 2 0 11-4 0 2 2 0 014 0zM7 14a2 2 0 11-4 0 2 2 0 014 0zM13 2a2 2 0 11-4 0 2 2 0 014 0zM13 8a2 2 0 11-4 0 2 2 0 014 0zM13 14a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
        </div>

        {/* Position badge */}
        <div className="flex items-center justify-center w-8 text-xs font-bold text-gray-400 bg-gray-50 border-r border-gray-200">
          {position}
        </div>

        {/* Main content */}
        <div className="flex-1 px-4 py-3 min-w-0">
          <p className="font-semibold text-gray-900 text-sm truncate">{item.product}</p>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <span className="text-xs text-gray-500 font-mono">
              {item.quantity.toLocaleString()} kg
            </span>
            <span className="text-xs text-indigo-700 font-mono font-semibold">
              {item.batches} batch{item.batches !== 1 ? 'es' : ''}
            </span>
            <span className="text-xs text-indigo-500 font-mono">
              [{item.batchBreakdown}]
            </span>
          </div>
          {/* Allergen badges */}
          {item.allergens.length > 0 && (
            <div className="flex gap-1 mt-1.5 flex-wrap">
              {item.allergens.map((a) => (
                <span
                  key={a}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${ALLERGEN_COLOURS[a] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}
                >
                  {a}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Time input — plain text HH:MM (24h) */}
        <div className="flex items-center px-3 border-l border-gray-100">
          <input
            type="text"
            value={item.time}
            placeholder="HH:MM"
            maxLength={5}
            onChange={(e) => onTimeChange(item.id, e.target.value)}
            onBlur={(e) => {
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
            className="text-xs font-mono text-gray-700 border border-gray-200 rounded
                       px-1.5 py-1 w-16 focus:outline-none focus:ring-1 focus:ring-indigo-400"
          />
        </div>
      </div>
    </div>
  );
}

// ── Cleaning step banner ───────────────────────────────────────────────────
function CleaningStep() {
  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-xs font-semibold">
      <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      Cleaning / CIP required before next product
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────
interface DraggableListProps {
  initialItems: BoardItem[];
  onChange?: (items: BoardItem[]) => void;
}

export function DraggableList({ initialItems, onChange }: DraggableListProps) {
  const [items, setItems] = useState<BoardItem[]>(initialItems);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIdx = items.findIndex((i) => i.id === active.id);
      const newIdx = items.findIndex((i) => i.id === over.id);
      const next = arrayMove(items, oldIdx, newIdx);
      setItems(next);
      onChange?.(next);
    }
  }

  function handleTimeChange(id: string, time: string) {
    const next = items.map((i) => (i.id === id ? { ...i, time } : i));
    setItems(next);
    onChange?.(next);
  }

  // Compute display list with auto-inserted cleaning steps
  const displayItems = insertCleaningSteps(items);
  let productIndex = 0;

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-2">
          {displayItems.map((item) => {
            if (item.type === 'cleaning') {
              return <CleaningStep key={item.id} />;
            }
            productIndex += 1;
            return (
              <SortableCard
                key={item.id}
                item={item as BoardItem}
                position={productIndex}
                onTimeChange={handleTimeChange}
              />
            );
          })}
        </div>
      </SortableContext>
    </DndContext>
  );
}
