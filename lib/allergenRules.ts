import { BoardItem } from '@/types';

// ── Allergen keyword detection ─────────────────────────────────────────────
const ALLERGEN_KEYWORDS: Record<string, string[]> = {
  DAIRY:  ['butter', 'cream', 'cheese', 'milk', 'dairy', 'bechamel'],
  MEAT:   ['meat', 'beef', 'chicken', 'pork', 'lamb', 'mince', 'bacon', 'ham', 'prawn', 'seafood', 'fish', 'tuna'],
  EGG:    ['egg'],
  GLUTEN: ['pasta', 'lasagne', 'lasagna', 'noodle', 'wheat', 'barley', 'rye', 'bread', 'flour'],
  NUT:    ['nut', 'peanut', 'almond', 'cashew', 'walnut', 'pistachio'],
};

const VEGAN_KEYWORDS = ['vegan', 'plant', 'tofu', 'lentil', 'chickpea', 'minestrone', 'tomato', 'vegetable'];
// Items that look like they might have meat/dairy but are actually vegan
const VEGAN_OVERRIDE = ['vegan'];

export function getProductAllergens(product: string): string[] {
  const lower = product.toLowerCase();
  // If product contains "vegan" override, skip animal allergen detection
  const isVeganItem = VEGAN_OVERRIDE.some((kw) => lower.includes(kw));
  const allergens: string[] = [];
  for (const [allergen, keywords] of Object.entries(ALLERGEN_KEYWORDS)) {
    if (isVeganItem && (allergen === 'DAIRY' || allergen === 'MEAT' || allergen === 'EGG')) continue;
    if (keywords.some((kw) => lower.includes(kw))) {
      allergens.push(allergen);
    }
  }
  return allergens;
}

export function isVegan(product: string): boolean {
  const lower = product.toLowerCase();
  return (
    VEGAN_KEYWORDS.some((kw) => lower.includes(kw)) ||
    VEGAN_OVERRIDE.some((kw) => lower.includes(kw))
  ) && !['meat', 'beef', 'chicken', 'pork', 'bacon', 'ham'].some((kw) => lower.includes(kw));
}

/** Returns true if a cleaning step is needed between prev → next */
export function needsCleaning(prev: BoardItem, next: BoardItem): boolean {
  if (prev.allergens.length === 0) return false;
  if (next.allergens.length === 0) return true; // allergen → clean product
  // Also clean if next is vegan but prev had animal allergens
  if (isVegan(next.product) && prev.allergens.some((a) => ['DAIRY', 'MEAT', 'EGG'].includes(a))) return true;
  return false;
}

/**
 * Suggest a run order:
 *   1. Vegan / non-allergen products first
 *   2. Low-allergen products
 *   3. High-allergen (DAIRY, MEAT, EGG) last
 */
export function suggestOrder(items: BoardItem[]): BoardItem[] {
  return [...items].sort((a, b) => {
    const scoreA = allergenScore(a);
    const scoreB = allergenScore(b);
    return scoreA - scoreB;
  });
}

function allergenScore(item: BoardItem): number {
  const allergens = item.allergens;
  if (allergens.length === 0) return 0;
  if (allergens.some((a) => ['MEAT', 'DAIRY', 'EGG'].includes(a))) return 2;
  return 1;
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
