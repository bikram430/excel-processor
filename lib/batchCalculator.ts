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
const LOW_CAPACITY_PRODUCTS = ['VEGAN LASAGNE', 'MINESTRONE SOUP', 'CHICKEN NOODLE SOUP'];
const DEFAULT_CAP = 2000;

// ── WOK / Oven / Misc per-product max batch sizes ──────────────────────────
// Items not in this map use the default generalBatch cap.
const WOK_BATCH_CAPS: Record<string, number> = {
  'WCFRCA10000':  180,  // Chinese Fried Rice
  'WDPSR10000':   170,  // Diced Potato Seasoned Roasted
  'WEFRCI10000':  160,  // Egg Fried Rice
  'WRHALFCP1000': 180,  // Roasted Half Chat Potatoes
  'WSAPMIX1000':  100,  // Spinach and Peas Mix
  'WSCEGPL1000':   70,  // Scrambled Eggs Plain
  'WDIPCR10000':  150,  // Roasted Bombay Potatoes
  'WRMCARO1000':  100,  // Roasted Mixed Capsicum and Red Onion
  'WCOMOC10000':   50,  // Couscous Medium Cooked
  'WSPPAR10000':  120,  // Spinach Parsley Roast
  'WSPDSOR1000':  160,  // Sweet Potato Diced 25mm Roasted
  'WRCBCSC1000':  100,  // Red Capsicum Bowl Chopped Sous Vide Cooked
};

// ── Rice products — max 220 kg/batch, batch size rounded up to nearest 5 ──
const RICE_MAX = 220;
const RICE_PRODUCTS = new Set([
  'WPIRGN90000',  // Rice Pilau Cooked
  'WBRCXCD1000',  // Biryani Rice Cooked
  'WJWRICE1000',  // Jewelled Rice
  'WDRDRCD1000',  // Dirty Rice
]);

function roundTo5(n: number): number {
  return Math.ceil(n / 5) * 5;
}

export interface BatchResult {
  batches: number;
  batchBreakdown: string;
  /** Max kg loaded into the kettle/equipment for a single physical batch or cycle */
  physicalBatchSize: number;
  /** Individual batch sizes in kg (used for recipe file generation) */
  batchSizes: number[];
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
  return { batches: recipesNeeded, batchBreakdown: breakdown, physicalBatchSize: maxBatchSize, batchSizes: [] };
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

  const batchSizes = fullBatches > 0
    ? [...Array(fullBatches).fill(INPUT_PER_BATCH), ...(hasPartial ? [Math.ceil(remainingOut * RATIO)] : [])]
    : [Math.ceil(remainingOut * RATIO)];
  return {
    batches:           totalBatches,
    batchBreakdown:    breakdown,
    physicalBatchSize: INPUT_PER_BATCH,
    batchSizes,
  };
}

// ── General batch (configurable cap, min = cap/2) ─────────────────────────
// Splits qty into the fewest equal-sized batches that each fit within `cap`.
// Equal splitting ensures no batch falls below cap/2 (e.g. min 1000 when cap=2000).
// Example: 4500 kg, cap 2000 → 3 batches of 1500 kg each (NOT 2000+2000+500).
function generalBatch(qty: number, cap: number): BatchResult {
  const n        = Math.max(Math.ceil(qty / cap), 1);
  const perBatch = Math.ceil(qty / n);
  const lastBatch = qty - perBatch * (n - 1);
  const batchSizes: number[] = [...Array(n - 1).fill(perBatch), lastBatch];
  const breakdown = lastBatch === perBatch
    ? `${perBatch}×${n}`
    : `${perBatch}×${n - 1} / ${lastBatch}×1`;
  return { batches: n, batchBreakdown: breakdown, physicalBatchSize: perBatch, batchSizes };
}

// ── Low-capacity (Vegan Lasagne, Minestrone Soup) ─────────────────────────
function lowCapBatch(qty: number): BatchResult {
  const n        = Math.max(Math.ceil(qty / 1000), 1);
  const perBatch = Math.ceil(qty / n);
  return { batches: n, batchBreakdown: `${perBatch}×${n}`, physicalBatchSize: perBatch, batchSizes: Array(n).fill(perBatch) };
}

// ── Rice batch — max 220 kg, size rounded up to nearest 5 ─────────────────
function riceBatch(qty: number): BatchResult {
  const n        = Math.max(Math.ceil(qty / RICE_MAX), 1);
  const perBatch = roundTo5(Math.ceil(qty / n));
  return { batches: n, batchBreakdown: `${perBatch}×${n}`, physicalBatchSize: perBatch, batchSizes: Array(n).fill(perBatch) };
}

// ── Public API ─────────────────────────────────────────────────────────────
export function calculateBatch(
  product: string,
  itemCode: string,
  qty: number,
  butterChickenCap = DEFAULT_CAP
): BatchResult {
  if (qty <= 0) return { batches: 0, batchBreakdown: '—', physicalBatchSize: 0, batchSizes: [] };

  const codeUpper    = (itemCode  ?? '').toUpperCase().trim();
  const productUpper = (product   ?? '').toUpperCase();

  const cqcSpec = CQC_PRODUCTS[codeUpper];
  if (cqcSpec)                                              return cqcBatch(qty, cqcSpec);
  if (codeUpper === MEAT_SAUCE_EPP_CODE)                    return meatSauceBatch(qty);
  if (codeUpper === BECHAMEL_CODE)                          return generalBatch(qty, 1880);
  if (codeUpper === BUTTER_CHICKEN_CODE)                    return generalBatch(qty, butterChickenCap);
  if (LOW_CAPACITY_PRODUCTS.some(p => productUpper.includes(p))) return lowCapBatch(qty);
  if (productUpper.includes('IMPROVED CHEESE'))               return generalBatch(qty, 1800);
  if (RICE_PRODUCTS.has(codeUpper))                           return riceBatch(qty);
  const wokCap = WOK_BATCH_CAPS[codeUpper];
  if (wokCap)                                               return generalBatch(qty, wokCap);

  return generalBatch(qty, DEFAULT_CAP);
}

export function hasButterChicken(rows: ExcelRow[]): boolean {
  return rows.some(r => (r.itemCode ?? '').toUpperCase().trim() === BUTTER_CHICKEN_CODE);
}

export function calculateBatches(rows: ExcelRow[], butterChickenCap = DEFAULT_CAP): ExcelRow[] {
  return rows.map(r => {
    const { batches, batchBreakdown, physicalBatchSize, batchSizes } = calculateBatch(
      r.product, r.itemCode, r.quantity, butterChickenCap
    );
    return { ...r, batches, batchBreakdown, physicalBatchSize, batchSizes };
  });
}
