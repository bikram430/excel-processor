/**
 * Meat Quantity Calculator
 * Pure functions for calculating meat quantities from recipes.json.
 * No side effects — fully unit-testable.
 */
import recipesData from './recipes.json';

// ── Types ──────────────────────────────────────────────────────────────────

export type MeatType = 'Beef' | 'Chicken' | 'Lamb' | 'Pork' | 'Other';

export interface MeatResult {
  ingredient_code: string;
  ingredient_description: string;
  meat_type: MeatType;
  /** Raw meat qty for this batch, rounded to 2dp */
  qty_kg: number;
  /** True when the ingredient is a sub-recipe reference */
  is_sub_recipe: boolean;
  /** Human-readable sub-recipe ingredient name (null for direct ingredients) */
  sub_recipe_label: string | null;
  /** Intermediate sub-recipe qty before converting to raw meat (null if not sub-recipe) */
  sub_qty_kg: number | null;
}

// Internal shapes for recipes.json
interface RecipeIngredient {
  ingredient_code: string | null;
  ingredient_description: string;
  base_meat_qty: number;
  meat_percentage: number;
}

interface SubRecipeInfo {
  sub_recipe_code: string;
  sub_recipe_name: string;
  raw_meat_code: string;
  raw_meat_description: string;
}

interface Recipe {
  product: string;
  product_code: string;
  meat_ingredients: RecipeIngredient[];
  recipe_base: {
    finished_yield: number;
    finished_yield_percentage: number;
  };
  sub_recipe: boolean;
  uses_sub_recipe?: SubRecipeInfo;
}

// ── Module-level lookup maps (built synchronously at import time) ───────────

let _loadError = false;
const _recipesMap  = new Map<string, Recipe>();
const _subRecipesMap = new Map<string, Recipe>();

try {
  const data = recipesData as unknown as { recipes: Recipe[] };
  for (const recipe of data.recipes) {
    const key = recipe.product_code.toLowerCase().trim();
    _recipesMap.set(key, recipe);
    if (recipe.sub_recipe) _subRecipesMap.set(key, recipe);
  }
} catch {
  _loadError = true;
}

export const recipesMap:    ReadonlyMap<string, Recipe> = _recipesMap;
export const subRecipesMap: ReadonlyMap<string, Recipe> = _subRecipesMap;
export const meatDataLoadError: boolean = _loadError;

// ── Helpers ────────────────────────────────────────────────────────────────

/** Detect meat type from ingredient description (case-insensitive). */
export function detectMeatType(description: string): MeatType {
  const d = description.toLowerCase();
  if (d.includes('chicken') || d.includes('poultry')) return 'Chicken';
  if (d.includes('lamb'))                             return 'Lamb';
  if (d.includes('pork'))                             return 'Pork';
  if (d.includes('beef') || d.includes('knuckle') || d.includes('primal') || d.includes('mince')) return 'Beef';
  return 'Other';
}

/** Animal emoji icon per meat type. */
export const MEAT_ICON: Record<MeatType, string> = {
  Beef:    '🐄',
  Chicken: '🐔',
  Lamb:    '🐑',
  Pork:    '🐷',
  Other:   '🥩',
};

/** Pill badge colours per meat type (inline style values). */
export const MEAT_COLORS: Record<MeatType, { bg: string; text: string }> = {
  Beef:    { bg: '#FEE2E2', text: '#991B1B' },
  Chicken: { bg: '#DBEAFE', text: '#1E40AF' },
  Lamb:    { bg: '#D1FAE5', text: '#065F46' },
  Pork:    { bg: '#FEF3C7', text: '#92400E' },
  Other:   { bg: '#F3F4F6', text: '#374151' },
};

// ── Core calculation ───────────────────────────────────────────────────────

/**
 * Calculate meat requirements for one physical batch of a product.
 *
 * Formula: meat_qty = (batchSizeKg / finished_yield) * base_meat_qty
 * For sub-recipe chains, the intermediate sub-recipe qty is also returned.
 *
 * Returns [] when productCode is not in the map or has no meat ingredients.
 * Never throws — all errors return [].
 */
export function calculateMeat(
  productCode: string,
  batchSizeKg: number,
  rMap: ReadonlyMap<string, Recipe>,
  srMap: ReadonlyMap<string, Recipe>,
): MeatResult[] {
  try {
    const key    = (productCode ?? '').toLowerCase().trim();
    const recipe = rMap.get(key);
    if (!recipe || !recipe.meat_ingredients?.length) return [];

    const finishedYield = recipe.recipe_base?.finished_yield ?? 0;
    if (finishedYield === 0) return [];                  // guard div/0

    const safeBatch = batchSizeKg > 0 ? batchSizeKg : 0;
    const subInfo   = recipe.uses_sub_recipe;
    const results: MeatResult[] = [];

    for (const ing of recipe.meat_ingredients) {
      const ingCodeNorm  = (ing.ingredient_code ?? '').toLowerCase().trim();
      const subCodeNorm  = subInfo ? subInfo.sub_recipe_code.toLowerCase().trim() : '';
      const isSubIngredient = !!subInfo && ingCodeNorm === subCodeNorm;

      if (isSubIngredient && subInfo) {
        // ── Sub-recipe chain ──────────────────────────────────────────────
        const subQty    = (safeBatch / finishedYield) * ing.base_meat_qty;
        const subRecipe = srMap.get(subCodeNorm);

        if (subRecipe && subRecipe.recipe_base.finished_yield > 0 && subRecipe.meat_ingredients.length > 0) {
          const rawIng = subRecipe.meat_ingredients[0];
          const rawQty = (subQty / subRecipe.recipe_base.finished_yield) * rawIng.base_meat_qty;
          results.push({
            ingredient_code:       subInfo.raw_meat_code ?? '',
            ingredient_description: subInfo.raw_meat_description,
            meat_type:             detectMeatType(subInfo.raw_meat_description),
            qty_kg:                Math.round(rawQty * 100) / 100,
            is_sub_recipe:         true,
            sub_recipe_label:      ing.ingredient_description,
            sub_qty_kg:            Math.round(subQty * 100) / 100,
          });
        } else {
          // Sub-recipe referenced but not found
          const qty = (safeBatch / finishedYield) * ing.base_meat_qty;
          results.push({
            ingredient_code:       ing.ingredient_code ?? '',
            ingredient_description: ing.ingredient_description + ' (sub-recipe data missing)',
            meat_type:             detectMeatType(ing.ingredient_description),
            qty_kg:                Math.round(qty * 100) / 100,
            is_sub_recipe:         true,
            sub_recipe_label:      ing.ingredient_description,
            sub_qty_kg:            null,
          });
        }
      } else if (ingCodeNorm && ingCodeNorm !== key && rMap.has(ingCodeNorm)) {
        // ── Dynamic sub-recipe chain ──────────────────────────────────────
        // Ingredient code is itself a recipe entry (e.g. Char Sui Pork/Chicken
        // inside Chinese Fried Rice) — follow the chain without uses_sub_recipe.
        const subQty       = (safeBatch / finishedYield) * ing.base_meat_qty;
        const dynSubRecipe = rMap.get(ingCodeNorm)!;
        const subYield     = dynSubRecipe.recipe_base?.finished_yield ?? 0;

        if (subYield > 0 && dynSubRecipe.meat_ingredients?.length > 0) {
          for (const rawIng of dynSubRecipe.meat_ingredients) {
            const rawQty = (subQty / subYield) * rawIng.base_meat_qty;
            results.push({
              ingredient_code:        rawIng.ingredient_code ?? '',
              ingredient_description: rawIng.ingredient_description,
              meat_type:              detectMeatType(rawIng.ingredient_description),
              qty_kg:                 Math.round(rawQty * 100) / 100,
              is_sub_recipe:          true,
              sub_recipe_label:       ing.ingredient_description,
              sub_qty_kg:             Math.round(subQty * 100) / 100,
            });
          }
        } else {
          // Sub-recipe exists but has no meat data — show intermediate qty
          results.push({
            ingredient_code:        ing.ingredient_code ?? '',
            ingredient_description: ing.ingredient_description,
            meat_type:              detectMeatType(ing.ingredient_description),
            qty_kg:                 Math.round(subQty * 100) / 100,
            is_sub_recipe:          true,
            sub_recipe_label:       ing.ingredient_description,
            sub_qty_kg:             null,
          });
        }
      } else {
        // ── Direct ingredient ─────────────────────────────────────────────
        const qty = (safeBatch / finishedYield) * ing.base_meat_qty;
        results.push({
          ingredient_code:       ing.ingredient_code ?? '',
          ingredient_description: ing.ingredient_description,
          meat_type:             detectMeatType(ing.ingredient_description),
          qty_kg:                Math.round(qty * 100) / 100,
          is_sub_recipe:         false,
          sub_recipe_label:      null,
          sub_qty_kg:            null,
        });
      }
    }

    return results;
  } catch {
    return [];
  }
}
