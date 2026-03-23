/**
 * Fuzzy matcher for pairing production board recipe names against commercial
 * product names from the Line 7-8 scheduling file.
 *
 * Board names are short and clean:   "Butter Chicken", "Tomato Basil Pasta Sauce"
 * L7-8 names are long and noisy:     "Coles Kitchen Butter Chicken 6x500g"
 *
 * Strategy — board-first RECALL:
 *   Score = (board tokens found in candidate) / (total board tokens)
 *
 *   A score of 1.0 means every keyword in the recipe name appears in the
 *   commercial name → perfect match regardless of how many extra words the
 *   commercial name has.
 *
 *   Tiebreaker: prefer the candidate that covers the board tokens with fewer
 *   extra words (higher precision = |intersection| / |candidate tokens|).
 */

// ── Stop words ──────────────────────────────────────────────────────────────
// Words that appear in commercial names but never in recipe names
const STOP_WORDS = new Set([
  // Supermarket / retailer names
  'coles', 'woolworths', 'ww', 'aldi', 'iga', 'spar', 'harris', 'costco',
  'countdown', 'pak', 'pantry', 'butcher', 'fresh',
  // Brand & marketing qualifiers
  'kitchen', 'select', 'specially', 'finest', 'premium', 'classic', 'original',
  'homestyle', 'homemade', 'traditional', 'hearty', 'delicious', 'gourmet',
  'rich', 'chunky', 'thick', 'smooth', 'slow', 'cooked', 'roasted', 'baked',
  'australian', 'harvest',
  // Production-specific codes that don't appear in commercial names
  'epp', 'eb', 'fill', 'cqc',
  // English function words
  'the', 'and', 'with', 'for', 'in', 'on', 'at', 'of', 'a', 'an', 'by', 'to',
  'or', 'its', 'is',
]);

// ── Synonym map ─────────────────────────────────────────────────────────────
// Normalise production abbreviations → commercial equivalents (and vice versa)
const SYNONYMS: Record<string, string> = {
  'sc':      'sauce',
  'sce':     'sauce',
  'sca':     'sauce',
  'bolog':   'bolognese',
  'bol':     'bolognese',
  'spag':    'spaghetti',
  'spgh':    'spaghetti',
  'veg':     'vegetable',
  'vegs':    'vegetable',
  'chk':     'chicken',
  'chkn':    'chicken',
  'ctm':     'tikka',      // chicken tikka masala abbreviation
  'lrj':     'rogan',      // lamb rogan josh
  'strog':   'stroganoff',
  'mush':    'mushroom',
  'tom':     'tomato',
  'pumpk':   'pumpkin',
  'lemon':   'lemongrass',
  'mince':   'bolognese',
  'tkk':     'tikka',
};

// Year-like tokens (e.g. "2025", "2024") — strip these
const YEAR_RE = /^20\d{2}$/;

function tokenise(name: string): Set<string> {
  const tokens = name
    .toLowerCase()
    .replace(/[()&\-/]/g, ' ')          // treat brackets, hyphens, slashes as spaces
    .replace(/[^a-z0-9\s]/g, '')        // drop remaining punctuation
    .split(/\s+/)
    .filter(token => {
      if (!token || token.length <= 1)  return false;
      if (/^\d/.test(token))            return false; // numbers / sizes (6x480g, 500g, …)
      if (YEAR_RE.test(token))          return false; // year numbers (2025 etc.)
      if (STOP_WORDS.has(token))        return false;
      return true;
    })
    .map(t => SYNONYMS[t] ?? t);

  return new Set(tokens);
}

// ── Confidence thresholds (recall-based) ────────────────────────────────────
const CONFIDENT_THRESHOLD    = 0.60; // ≥60 % of board keywords found → confident
const LOW_CONF_THRESHOLD     = 0.30; // 30–60 % → low confidence
// < 30 % → no match

export interface MatchResult {
  matched:          string;  // best candidate from the L7-8 list
  score:            number;  // recall score 0–1
  isLowConfidence:  boolean;
  noMatch:          boolean;
}

/**
 * Return the best-matching L7-8 product for a board recipe name.
 *
 * Scoring is board-first recall so that a short recipe name like
 * "Butter Chicken" scores 1.0 against "Coles Butter Chicken Sauce 500g"
 * rather than a low Jaccard score.
 *
 * Returns null only when `candidates` is empty.
 */
export function bestMatch(boardProduct: string, candidates: string[]): MatchResult | null {
  if (!candidates.length) return null;

  const boardTokens = tokenise(boardProduct);

  // No meaningful tokens after stripping — treat as no match
  if (!boardTokens.size) {
    return { matched: candidates[0], score: 0, isLowConfidence: true, noMatch: true };
  }

  let best: MatchResult | null = null;
  let bestPrecision = -1;

  for (const candidate of candidates) {
    const cTokens = tokenise(candidate);
    if (!cTokens.size) continue;

    const intersectionCount = [...boardTokens].filter(t => cTokens.has(t)).length;

    // Primary: recall — what fraction of board keywords appear in the candidate
    const recall    = intersectionCount / boardTokens.size;
    // Tiebreaker: precision — prefer candidates that don't have lots of extra tokens
    const precision = intersectionCount / cTokens.size;

    const isBetter =
      !best ||
      recall > best.score ||
      (recall === best.score && precision > bestPrecision);

    if (isBetter) {
      best          = {
        matched:         candidate,
        score:           recall,
        isLowConfidence: recall < CONFIDENT_THRESHOLD,
        noMatch:         recall < LOW_CONF_THRESHOLD,
      };
      bestPrecision = precision;
    }
  }

  return best ?? { matched: candidates[0], score: 0, isLowConfidence: true, noMatch: true };
}
