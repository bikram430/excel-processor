import { ExcelRow } from '@/types';

// ── Special product item codes ─────────────────────────────────────────────
const MEAT_SAUCE_EPP_CODE = 'WMTSCP10000';
const BUTTER_CHICKEN_CODE = 'WBSCCP1000';

// Products matching these fragments use low-capacity rules (cap 1000, max 1100)
const LOW_CAPACITY_PRODUCTS = ['VEGAN LASAGNE', 'MINESTRONE SOUP'];

const DEFAULT_CAP = 2000;

export interface BatchResult {
  batches: number;
  batchBreakdown: string;
}

// ── General batch logic (cap = 2000 by default) ───────────────────────────
/**
 * General rules:
 *   qty <= cap            → 1 batch: "qty*1"
 *   cap < qty < cap*2     → 2 batches: "ceil(qty/2)*2"
 *   qty >= cap*2          → keep subtracting cap (full batches) until remainder < cap*2,
 *                           then split remainder into 2 half-batches
 *   e.g. qty=5000,cap=2000 → 2000*1 + (1500*2)   = 2+1 = 3 batches
 *        qty=7000,cap=2000 → 2000*2 + (1500*2)   = 2+2 = 4 batches
 */
function generalBatch(qty: number, cap: number): BatchResult {
  if (qty <= cap) {
    return { batches: 1, batchBreakdown: `${qty}*1` };
  }
  if (qty < cap * 2) {
    const half = Math.ceil(qty / 2);
    return { batches: 2, batchBreakdown: `${half}*2` };
  }

  // Count full cap-sized batches until remainder fits in < cap*2
  let remaining = qty;
  let fullBatches = 0;
  while (remaining >= cap * 2) {
    remaining -= cap;
    fullBatches += 1;
  }
  // Remaining is now in (cap, cap*2) — split into 2
  const half = Math.ceil(remaining / 2);
  const totalBatches = fullBatches + 2;
  const breakdown =
    fullBatches > 0
      ? `${cap}*${fullBatches} / ${half}*2`
      : `${half}*2`;
  return { batches: totalBatches, batchBreakdown: breakdown };
}

// ── Low-capacity batch logic ───────────────────────────────────────────────
function lowCapBatch(qty: number): BatchResult {
  const n = Math.ceil(qty / 1000);
  const perBatch = Math.ceil(qty / n);
  return { batches: n, batchBreakdown: `${perBatch}*${n}` };
}

// ── Meat Sauce EPP logic (cap 1900) ───────────────────────────────────────
function meatSauceBatch(qty: number): BatchResult {
  const cap = 1900;
  const n = Math.round(qty / cap) || 1;
  const perBatch = Math.round(qty / n);
  return { batches: n, batchBreakdown: `${perBatch}*${n}` };
}

// ── Public API ─────────────────────────────────────────────────────────────

export function calculateBatch(
  product: string,
  itemCode: string,
  qty: number,
  butterChickenCap = DEFAULT_CAP
): BatchResult {
  if (qty <= 0) return { batches: 0, batchBreakdown: '—' };

  const productUpper = product.toUpperCase();
  const codeUpper    = itemCode.toUpperCase();

  // MEAT SAUCE EPP
  if (codeUpper === MEAT_SAUCE_EPP_CODE) {
    return meatSauceBatch(qty);
  }

  // BUTTER CHICKEN
  if (codeUpper === BUTTER_CHICKEN_CODE) {
    return generalBatch(qty, butterChickenCap);
  }

  // LOW CAPACITY products
  if (LOW_CAPACITY_PRODUCTS.some((p) => productUpper.includes(p))) {
    return lowCapBatch(qty);
  }

  // General rule
  return generalBatch(qty, DEFAULT_CAP);
}

/** Return true if any row is a BUTTER CHICKEN product */
export function hasButterChicken(rows: ExcelRow[]): boolean {
  return rows.some((r) => r.itemCode.toUpperCase() === BUTTER_CHICKEN_CODE);
}

/** Enrich all rows with batch info */
export function calculateBatches(
  rows: ExcelRow[],
  butterChickenCap = DEFAULT_CAP
): ExcelRow[] {
  return rows.map((r) => {
    const { batches, batchBreakdown } = calculateBatch(
      r.product,
      r.itemCode,
      r.quantity,
      butterChickenCap
    );
    return { ...r, batches, batchBreakdown };
  });
}
