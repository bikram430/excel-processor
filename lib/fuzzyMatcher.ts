/**
 * Keyword-based fuzzy matcher for comparing production recipe names against
 * commercial product names from the Line 7-8 scheduling file.
 *
 * Commercial names contain retailer prefixes, brand qualifiers, and pack-size
 * suffixes that do not appear in recipe names (e.g. "Coles Kitchen Tomato
 * Basil Pasta Sauce 6x480g" vs "Tomato Basil Pasta Sauce").
 *
 * Algorithm:
 *   1. Lowercase and split on whitespace/punctuation.
 *   2. Remove stop words (retailer names, filler adjectives).
 *   3. Remove tokens that are purely numeric or look like pack sizes.
 *   4. Remove single-character tokens.
 *   5. Compute Jaccard similarity: |A ∩ B| / |A ∪ B|.
 *   6. Classify confidence based on the score.
 */

/** Words that frequently appear in commercial names but never in recipe names. */
const STOP_WORDS = new Set([
  // Retailers / supermarket brands
  'coles', 'woolworths', 'ww', 'aldi', 'iga', 'spar', 'harris', 'costco',
  'countdown', 'pak', 'save', 'pantry',
  // Brand qualifiers / marketing words
  'kitchen', 'select', 'specially', 'finest', 'premium', 'classic', 'original',
  'fresh', 'homestyle', 'homemade', 'traditional', 'hearty', 'delicious',
  'australian', 'gourmet', 'rich', 'creamy', 'chunky', 'thick', 'smooth',
  'slow', 'cooked', 'roasted', 'grilled', 'baked', 'steamed',
  // Common English function words
  'the', 'and', 'with', 'for', 'in', 'on', 'at', 'of', 'a', 'an', 'by', 'to',
]);

/** Patterns that identify pack-size / numeric tokens to discard. */
const SIZE_PATTERN = /^\d|^[xX]\d|\d[gGmMlLkK]$/;

function tokenise(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')   // drop punctuation, keep alphanumeric
    .split(/\s+/)
    .filter(token => {
      if (!token)                       return false;
      if (token.length <= 1)            return false; // single chars ('g', 'x', …)
      if (SIZE_PATTERN.test(token))     return false; // numbers, pack sizes
      if (STOP_WORDS.has(token))        return false;
      return true;
    });
}

export interface MatchResult {
  /** The best-matching candidate string from the Line 7-8 file. */
  matched: string;
  /** Jaccard similarity score, 0–1. */
  score: number;
  /** True when score is below the low-confidence threshold. */
  isLowConfidence: boolean;
  /** True when no keyword overlap was found (score === 0). */
  noMatch: boolean;
}

const CONFIDENCE_THRESHOLD = 0.35;
const NO_MATCH_THRESHOLD   = 0.10;

/**
 * Find the best matching candidate for `boardProduct` from a list of
 * Line 7-8 product names.
 *
 * Returns `null` only when `candidates` is empty.
 * Otherwise always returns the best available match, even if confidence is low.
 */
export function bestMatch(boardProduct: string, candidates: string[]): MatchResult | null {
  if (!candidates.length) return null;

  const boardTokens = new Set(tokenise(boardProduct));
  if (!boardTokens.size) {
    // No meaningful tokens — return first candidate as a no-match
    return { matched: candidates[0], score: 0, isLowConfidence: true, noMatch: true };
  }

  let bestResult: MatchResult | null = null;

  for (const candidate of candidates) {
    const cTokens = new Set(tokenise(candidate));
    if (!cTokens.size) continue;

    const intersection = [...boardTokens].filter(t => cTokens.has(t)).length;
    const union        = new Set([...boardTokens, ...cTokens]).size;
    const score        = intersection / union;

    if (!bestResult || score > bestResult.score) {
      bestResult = {
        matched:          candidate,
        score,
        isLowConfidence:  score < CONFIDENCE_THRESHOLD,
        noMatch:          score < NO_MATCH_THRESHOLD,
      };
    }
  }

  return bestResult ?? { matched: candidates[0], score: 0, isLowConfidence: true, noMatch: true };
}
