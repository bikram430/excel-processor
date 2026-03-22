import { ExcelRow } from '@/types';

// ── CQC product lookup (cyclesPerRecipe = max cooking cycles in one recipe run) ──
interface CQCSpec {
  maxBatchSize: number;
  cyclesPerRecipe: number;
}

const CQC_PRODUCTS: Record<string, CQCSpec> = {
  'WGRNBEN1000':  { maxBatchSize: 40,  cyclesPerRecipe: 6 },
  'WCBS10000':    { maxBatchSize: 40,  cyclesPerRecipe: 8 },
  'WCCK10000':    { maxBatchSize: 40,  cyclesPerRecipe: 8 },
  'WGNCH10000':   { maxBatchSize: 112, cyclesPerRecipe: 8 },
  'WCSFP10000':   { maxBatchSize: 80,  cyclesPerRecipe: 6 },
  'WSHNVM10000':  { maxBatchSize: 50,  cyclesPerRecipe: 6 },
  'WLFTDM10000':  { maxBatchSize: 86,  cyclesPerRecipe: 6 },
  'WBRRGN90000':  { maxBatchSize: 120, cyclesPerRecipe: 6 },
  'WBARGN90000':  { maxBatchSize: 200, cyclesPerRecipe: 8 },
  'WJARGN90000':  { maxBatchSize: 115, cyclesPerRecipe: 8 },
  'WLGRCCD1000':  { maxBatchSize: 200, cyclesPerRecipe: 6 },
  'WCEPCI10000':  { maxBatchSize: 218, cyclesPerRecipe: 6 },
  'WPAFUBC1000':  { maxBatchSize: 218, cyclesPerRecipe: 6 },
  'WCSPCI10000':  { maxBatchSize: 140, cyclesPerRecipe: 6 },
  'WPBPCI10000':  { maxBatchSize: 210, cyclesPerRecipe: 6 },
  'WVHFTC10000':  { maxBatchSize: 50,  cyclesPerRecipe: 6 },
  'WPFEBCP1000':  { maxBatchSize: 88,  cyclesPerRecipe: 6 },
  'WPARIC10000':  { maxBatchSize: 40,  cyclesPerRecipe: 6 },
  'WCBCOMX1000':  { maxBatchSize: 40,  cyclesPerRecipe: 6 },
  'WSNVCA10000':  { maxBatchSize: 50,  cyclesPerRecipe: 6 }, // null cyclesPerRecipe → default 6
  'WRVVMM10000':  { maxBatchSize: 50,  cyclesPerRecipe: 6 },
  'WWBGBC10000':  { maxBatchSize: 40,  cyclesPerRecipe: 6 },
  'WBGPDM10000':  { maxBatchSize: 39,  cyclesPerRecipe: 8 },
};

// ── Special item codes ─────────────────────────────────────────────────────
const MEAT_SAUCE_EPP_CODE  = 'WMTSCP10000';
const BUTTER_CHICKEN_CODE  = 'WBSCCP1000';
const BECHAMEL_CODE        = 'WBLSCCP10000';

// Low-capacity product name fragments (general kettle lines)
const LOW_CAPACITY_PRODUCTS = ['VEGAN LASAGNE', 'MINESTRONE SOUP'];

const DEFAULT_CAP = 2000;

export interface BatchResult {
  batches: number;           // number of recipes required (Batch Numbers)
  batchBreakdown: string;
}

// ── CQC batch logic ────────────────────────────────────────────────────────
/**
 * CQC products have fixed maxBatchSize and a cyclesPerRecipe limit.
 *   requiredCycles = ⌈qty / maxBatchSize⌉
 *   Batch Numbers  = ⌈requiredCycles / cyclesPerRecipe⌉
 */
function cqcBatch(qty: number, spec: CQCSpec): BatchResult {
  const { maxBatchSize, cyclesPerRecipe } = spec;
  const requiredCycles  = Math.ceil(qty / maxBatchSize);
  const recipesNeeded   = Math.ceil(requiredCycles / cyclesPerRecipe);

  // Distribute cycles evenly so we can show a meaningful breakdown
  const totalCapacity   = recipesNeeded * cyclesPerRecipe * maxBatchSize;
  const perCycleQty     = maxBatchSize; // always run at max per cycle

  const breakdown =
    recipesNeeded === 1
      ? `${recipesNeeded} recipe × ${requiredCycles} cycle${requiredCycles !== 1 ? 's' : ''} × ${perCycleQty}kg`
      : `${recipesNeeded} recipes × up to ${cyclesPerRecipe} cycles × ${perCycleQty}kg`;

  void totalCapacity; // suppress unused
  return { batches: recipesNeeded, batchBreakdown: breakdown };
}

// ── Meat Sauce EPP logic ───────────────────────────────────────────────────
/**
 * Input per batch = 1900 kg → Output per batch = 2000 kg.
 * To achieve required output: batches = ⌈qty / 2000⌉
 */
function meatSauceBatch(qty: number): BatchResult {
  const outputPerBatch = 2000;
  const inputPerBatch  = 1900;
  const n = Math.ceil(qty / outputPerBatch);
  return {
    batches: n,
    batchBreakdown: `${inputPerBatch}×${n} (→${(n * outputPerBatch).toLocaleString()}kg out)`,
  };
}

// ── General batch logic ────────────────────────────────────────────────────
/**
 *  qty ≤ cap            → 1 batch:         "qty×1"
 *  cap < qty < cap×2    → 2 half-batches:  "⌈qty/2⌉×2"
 *  qty ≥ cap×2          → full batches until remainder fits in <cap×2,
 *                          then split remainder into 2 half-batches
 *  e.g. qty=5000,cap=2000 → 2000×1 / 1500×2   (3 batches total)
 *       qty=7000,cap=2000 → 2000×2 / 1500×2   (4 batches total)
 */
function generalBatch(qty: number, cap: number): BatchResult {
  if (qty <= cap) {
    return { batches: 1, batchBreakdown: `${qty}×1` };
  }
  if (qty < cap * 2) {
    const half = Math.ceil(qty / 2);
    return { batches: 2, batchBreakdown: `${half}×2` };
  }

  let remaining   = qty;
  let fullBatches = 0;
  while (remaining >= cap * 2) {
    remaining   -= cap;
    fullBatches += 1;
  }
  const half         = Math.ceil(remaining / 2);
  const totalBatches = fullBatches + 2;
  const breakdown    = fullBatches > 0
    ? `${cap}×${fullBatches} / ${half}×2`
    : `${half}×2`;
  return { batches: totalBatches, batchBreakdown: breakdown };
}

// ── Low-capacity batch logic ───────────────────────────────────────────────
function lowCapBatch(qty: number): BatchResult {
  const n       = Math.ceil(qty / 1000);
  const perBatch = Math.ceil(qty / n);
  return { batches: n, batchBreakdown: `${perBatch}×${n}` };
}

// ── Public API ─────────────────────────────────────────────────────────────

export function calculateBatch(
  product: string,
  itemCode: string,
  qty: number,
  butterChickenCap = DEFAULT_CAP
): BatchResult {
  if (qty <= 0) return { batches: 0, batchBreakdown: '—' };

  const codeUpper    = itemCode.toUpperCase().trim();
  const productUpper = product.toUpperCase();

  // ── CQC products (by item code) ──────────────────────────────────────
  const cqcSpec = CQC_PRODUCTS[codeUpper];
  if (cqcSpec) return cqcBatch(qty, cqcSpec);

  // ── Meat Sauce EPP ───────────────────────────────────────────────────
  if (codeUpper === MEAT_SAUCE_EPP_CODE) return meatSauceBatch(qty);

  // ── Bechamel Sauce (EB) ──────────────────────────────────────────────
  if (codeUpper === BECHAMEL_CODE) return generalBatch(qty, 1880);

  // ── Butter Chicken ───────────────────────────────────────────────────
  if (codeUpper === BUTTER_CHICKEN_CODE) return generalBatch(qty, butterChickenCap);

  // ── Low-capacity products ────────────────────────────────────────────
  if (LOW_CAPACITY_PRODUCTS.some((p) => productUpper.includes(p))) return lowCapBatch(qty);

  // ── General rule (cap 2000) ──────────────────────────────────────────
  return generalBatch(qty, DEFAULT_CAP);
}

export function hasButterChicken(rows: ExcelRow[]): boolean {
  return rows.some((r) => r.itemCode.toUpperCase().trim() === BUTTER_CHICKEN_CODE);
}

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
