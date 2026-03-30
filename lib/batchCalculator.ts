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
  // WOK/Oven — recipe-sheet products (1 sheet = 24 batches/cycles)
  'WSRCCP10000':  { maxBatchSize: 82,  cyclesPerRecipe: 24 }, // Spinach Ricotta Filling (1968 kg/sheet)
  'WRSMPM10000':  { maxBatchSize: 34,  cyclesPerRecipe: 24 }, // Roasted Sliced Mushroom & Parsley Mix (814 kg/sheet)
};

const MEAT_SAUCE_EPP_CODE = 'WMTSCP10000';
const BUTTER_CHICKEN_CODE = 'WBSCCP1000';
const BECHAMEL_CODE       = 'WBLSCCP10000';
const LOW_CAPACITY_PRODUCTS = ['VEGAN LASAGNE', 'MINESTRONE SOUP', 'CHICKEN NOODLE SOUP'];
const DEFAULT_CAP = 2000;
const MIN_BATCH   = 1000; // No physical batch printed below this size

// ── WOK / Oven / Misc per-product max batch sizes ──────────────────────────
// Items not in this map use the default generalBatch cap.
// Use 9999 for products with no practical batch-size limit (single batch regardless of qty).
const WOK_BATCH_CAPS: Record<string, number> = {
  'WCFRCA10000':  180,  // Chinese Fried Rice
  'WDPSR10000':   170,  // Diced Potato Seasoned Roasted
  'WEFRCI10000':  170,  // Egg Fried Rice (updated from 160)
  'WRHALFCP1000': 180,  // Roasted Half Chat Potatoes
  'WSAPMIX1000':  100,  // Spinach and Peas Mix
  'WFRVGMX1000':  100,  // Stir Fry Veg Mix
  'WSCEGPL1000':   86,  // Scrambled Eggs Plain (updated from 70)
  'WDIPCR10000':  150,  // Roasted Bombay Potatoes
  'WRMCARO1000':  120,  // Roasted Mixed Capsicum and Red Onion (updated from 100)
  'WCOMOC10000':   50,  // Couscous Medium Cooked
  'WSPPAR10000':  110,  // Spinach Parsley Roast (updated from 120)
  'WSPDSOR1000': 9999,  // Sweet Potato Diced 25mm Roasted — no max size
  'WRCBCSC1000': 9999,  // Red Capsicum Bowl Chopped Sous Vide Cooked — no max size
  'WCSPT10000':  9999,  // Cooked Sliced Potatoes — combine all, single batch
  'WOCSPI10000': 9999,  // Wok Cooked Spinach — no max size
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
// Converts output qty → total input qty (×0.95), then uses generalBatch so
// the same MIN_BATCH / equal-split rules apply (no tiny leftover batches).
function meatSauceBatch(qty: number): BatchResult {
  const INPUT_PER_BATCH = 1900;
  const totalInput = Math.ceil(qty * (INPUT_PER_BATCH / 2000));
  return generalBatch(totalInput, INPUT_PER_BATCH);
}

// ── General batch (configurable cap, hard min = MIN_BATCH) ────────────────
// Splits qty into the fewest equal batches each ≤ cap.
// If the last (smallest) batch would be < MIN_BATCH, removes one batch so
// each batch is slightly larger — preserving the minimum even if it slightly
// exceeds cap (e.g. Butter Chicken 1900 kg → 1 batch, not 2 × 950 kg).
function generalBatch(qty: number, cap: number): BatchResult {
  let n        = Math.max(Math.ceil(qty / cap), 1);
  let perBatch = Math.ceil(qty / n);
  let lastBatch = qty - perBatch * (n - 1);

  // If the last batch is below the minimum and reducing batch count still keeps
  // each batch ≥ MIN_BATCH, use n-1 batches (may slightly exceed cap).
  if (lastBatch < MIN_BATCH && n > 1) {
    const nAlt       = n - 1;
    const perAlt     = Math.ceil(qty / nAlt);
    const lastAlt    = qty - perAlt * (nAlt - 1);
    if (lastAlt >= MIN_BATCH) {
      n = nAlt; perBatch = perAlt; lastBatch = lastAlt;
    }
  }

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
