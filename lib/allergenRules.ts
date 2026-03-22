import { BoardItem } from '@/types';

// ── Allergen types (official food safety categories) ───────────────────────
export const ALLERGEN_OPTIONS = [
  { value: 'ALLERGEN_FREE', label: 'Allergen Free' },
  { value: 'DAIRY',         label: 'Dairy/Milk'    },
  { value: 'FISH',          label: 'Fish'           },
  { value: 'SOY',           label: 'Soy'            },
  { value: 'SULPHITE',      label: 'Sulphite'       },
  { value: 'WHEAT',         label: 'Wheat/Gluten'   },
] as const;

export type AllergenKey = typeof ALLERGEN_OPTIONS[number]['value'];

// ── Auto-detection keywords ───────────────────────────────────────────────
const ALLERGEN_KEYWORDS: Record<AllergenKey, string[]> = {
  ALLERGEN_FREE: [],
  DAIRY:    ['butter', 'cream', 'cheese', 'milk', 'dairy', 'bechamel', 'egg', 'carbonara', 'parmesan', 'feta', 'ricotta'],
  FISH:     ['fish', 'tuna', 'salmon', 'prawn', 'seafood', 'anchovy', 'sardine', 'scallop', 'mussel', 'crab', 'lobster'],
  SOY:      ['soy', 'tofu', 'miso', 'edamame', 'tempeh'],
  SULPHITE: ['wine', 'vinegar', 'sulphite', 'sulfite'],
  WHEAT:    ['pasta', 'lasagne', 'lasagna', 'noodle', 'wheat', 'bread', 'flour', 'barley', 'rye', 'bolognese', 'bolog', 'pesto'],
};

// Detection order — first match wins (most severe first so labelling is conservative)
const DETECT_ORDER: AllergenKey[] = ['FISH', 'DAIRY', 'WHEAT', 'SOY', 'SULPHITE'];

/** Auto-detect allergen from product name; returns a single AllergenKey */
export function detectAllergen(product: string): AllergenKey {
  const lower = product.toLowerCase();
  const isVegan = lower.includes('vegan');

  for (const key of DETECT_ORDER) {
    if (isVegan && (key === 'DAIRY' || key === 'FISH')) continue;
    if (ALLERGEN_KEYWORDS[key].some(kw => lower.includes(kw))) return key;
  }
  return 'ALLERGEN_FREE';
}

/** Returns allergens as a 1-element array for backward compatibility */
export function getProductAllergens(product: string): string[] {
  const key = detectAllergen(product);
  return key === 'ALLERGEN_FREE' ? [] : [key];
}

/** Returns true if a cleaning step is needed between prev → next */
export function needsCleaning(prev: BoardItem, next: BoardItem): boolean {
  const prevKey = prev.allergens[0] ?? 'ALLERGEN_FREE';
  const nextKey = next.allergens[0] ?? 'ALLERGEN_FREE';
  if (prevKey === 'ALLERGEN_FREE') return false;     // no allergen → no clean
  if (prevKey === nextKey)         return false;     // same allergen → no clean
  return true;                                       // allergen change → clean
}

/**
 * Suggest run order: allergen-free first, then by increasing allergen severity.
 * Standard food-safe practice: process allergen-free batches before introducing allergens.
 */
export function suggestOrder(items: BoardItem[]): BoardItem[] {
  const score: Record<AllergenKey, number> = {
    ALLERGEN_FREE: 0,
    WHEAT:         1,
    SOY:           2,
    SULPHITE:      3,
    FISH:          4,
    DAIRY:         5,
  };
  return [...items].sort((a, b) => {
    const aKey = (a.allergens[0] ?? 'ALLERGEN_FREE') as AllergenKey;
    const bKey = (b.allergens[0] ?? 'ALLERGEN_FREE') as AllergenKey;
    return (score[aKey] ?? 0) - (score[bKey] ?? 0);
  });
}

/** Insert cleaning-step markers between items that need a clean */
export function insertCleaningSteps(items: BoardItem[]): (BoardItem | { type: 'cleaning'; id: string })[] {
  const result: (BoardItem | { type: 'cleaning'; id: string })[] = [];
  for (let i = 0; i < items.length; i++) {
    result.push(items[i]);
    if (i < items.length - 1 && needsCleaning(items[i], items[i + 1])) {
      result.push({ type: 'cleaning', id: `clean-${i}` });
    }
  }
  return result;
}
