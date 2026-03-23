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
  'WSNVCA10000':  { maxBatchSize: 50,  cyclesPerRecipe: 6 },
  'WRVVMM10000':  { maxBatchSize: 50,  cyclesPerRecipe: 6 },
  'WWBGBC10000':  { maxBatchSize: 40,  cyclesPerRecipe: 6 },
  'WBGPDM10000':  { maxBatchSize: 39,  cyclesPerRecipe: 8 },
};

const MEAT_SAUCE_EPP_CODE = 'WMTSCP10000';
const BUTTER_CHICKEN_CODE = 'WBSCCP1000';
const BECHAMEL_CODE       = 'WBLSCCP10000';
const LOW_CAPACITY_PRODUCTS = ['VEGAN LASAGNE', 'MINESTRONE SOUP'];
const DEFAULT_CAP = 2000;

export interface BatchResult {
  batches: number;
  batchBreakdown: string;
  /** Max kg loaded into the kettle/equipment for a single physical batch or cycle */
  physicalBatchSize: number;
}

// ── CQC ───────────────────────────────────────────────────────────────────
function cqcBatch(qty: number, spec: CQCSpec): BatchResult {
  const { maxBatchSize, cyclesPerRecipe } = spec;
  const requiredCycles = Math.ceil(qty / maxBatchSize);
  const recipesNeeded  = Math.ceil(requiredCycles / cyclesPerRecipe);
  const breakdown =
    recipesNeeded === 1
      ? `${recipesNeeded} recipe × ${requiredCycles} cycle${requiredCycles !== 1 ? 's' : ''} × ${maxBatchSize}kg`
      : `${recipesNeeded} recipes × up to ${cyclesPerRecipe} cycles × ${maxBatchSize}kg`;
  return { batches: recipesNeeded, batchBreakdown: breakdown, physicalBatchSize: maxBatchSize };
}

// ── Meat Sauce EPP (input 1900 → output 2000 per batch) ───────────────────
// Ratio: 0.95 kg input = 1 kg output (1900 in / 2000 out).
// Full batches use 1900 kg input each. Partial batches scale by 0.95.
function meatSauceBatch(qty: number): BatchResult {
  const INPUT_PER_BATCH  = 1900;
  const OUTPUT_PER_BATCH = 2000;
  const RATIO            = INPUT_PER_BATCH / OUTPUT_PER_BATCH; // 0.95

  const fullBatches  = Math.floor(qty / OUTPUT_PER_BATCH);
  const remainingOut = qty % OUTPUT_PER_BATCH;
  const hasPartial   = remainingOut > 0;
  const totalBatches = fullBatches + (hasPartial ? 1 : 0);

  let breakdown: string;
  if (!hasPartial) {
    breakdown = `${INPUT_PER_BATCH}×${fullBatches}`;
  } else {
    const partialInput = Math.ceil(remainingOut * RATIO);
    breakdown = fullBatches === 0
      ? `${partialInput}×1`
      : `${INPUT_PER_BATCH}×${fullBatches} / ${partialInput}×1`;
  }

  return {
    batches:           totalBatches,
    batchBreakdown:    breakdown,
    physicalBatchSize: INPUT_PER_BATCH,
  };
}

// ── General batch (configurable cap) ──────────────────────────────────────
function generalBatch(qty: number, cap: number): BatchResult {
  if (qty <= cap) {
    return { batches: 1, batchBreakdown: `${qty}×1`, physicalBatchSize: qty };
  }
  if (qty < cap * 2) {
    const half = Math.ceil(qty / 2);
    return { batches: 2, batchBreakdown: `${half}×2`, physicalBatchSize: half };
  }
  let remaining   = qty;
  let fullBatches = 0;
  while (remaining >= cap * 2) {
    remaining   -= cap;
    fullBatches += 1;
  }
  const half         = Math.ceil(remaining / 2);
  const totalBatches = fullBatches + 2;
  const breakdown    = fullBatches > 0 ? `${cap}×${fullBatches} / ${half}×2` : `${half}×2`;
  // The full-size batches are `cap` kg each — that is the physical max
  return { batches: totalBatches, batchBreakdown: breakdown, physicalBatchSize: cap };
}

// ── Low-capacity (Vegan Lasagne, Minestrone Soup) ─────────────────────────
function lowCapBatch(qty: number): BatchResult {
  const n        = Math.max(Math.ceil(qty / 1000), 1);
  const perBatch = Math.ceil(qty / n);
  return { batches: n, batchBreakdown: `${perBatch}×${n}`, physicalBatchSize: perBatch };
}

// ── Public API ─────────────────────────────────────────────────────────────
export function calculateBatch(
  product: string,
  itemCode: string,
  qty: number,
  butterChickenCap = DEFAULT_CAP
): BatchResult {
  if (qty <= 0) return { batches: 0, batchBreakdown: '—', physicalBatchSize: 0 };

  const codeUpper    = (itemCode  ?? '').toUpperCase().trim();
  const productUpper = (product   ?? '').toUpperCase();

  const cqcSpec = CQC_PRODUCTS[codeUpper];
  if (cqcSpec)                                              return cqcBatch(qty, cqcSpec);
  if (codeUpper === MEAT_SAUCE_EPP_CODE)                    return meatSauceBatch(qty);
  if (codeUpper === BECHAMEL_CODE)                          return generalBatch(qty, 1880);
  if (codeUpper === BUTTER_CHICKEN_CODE)                    return generalBatch(qty, butterChickenCap);
  if (LOW_CAPACITY_PRODUCTS.some(p => productUpper.includes(p))) return lowCapBatch(qty);

  return generalBatch(qty, DEFAULT_CAP);
}

export function hasButterChicken(rows: ExcelRow[]): boolean {
  return rows.some(r => (r.itemCode ?? '').toUpperCase().trim() === BUTTER_CHICKEN_CODE);
}

export function calculateBatches(rows: ExcelRow[], butterChickenCap = DEFAULT_CAP): ExcelRow[] {
  return rows.map(r => {
    const { batches, batchBreakdown, physicalBatchSize } = calculateBatch(
      r.product, r.itemCode, r.quantity, butterChickenCap
    );
    return { ...r, batches, batchBreakdown, physicalBatchSize };
  });
}
