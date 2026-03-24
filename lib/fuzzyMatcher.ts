/**
 * Fuzzy matcher for pairing production board recipe names against Line 7-8
 * scheduling entries.
 *
 * Matching uses two passes in priority order:
 *
 * PASS 1 — Parenthetical-code match (highest priority)
 *   Many board products carry a short production code in parentheses, e.g.
 *   "MEAT SAUCE EPP (EM)" or "BECHAMEL SAUCE EPP (EB)".  The Line 7-8 schedule
 *   often uses ONLY that abbreviation: "EM/EB".  Normal recall scoring fails
 *   here because "meat" / "sauce" / "bechamel" never appear in "EM/EB".
 *   Solution: extract the 2–4-character code from the parentheses and search
 *   every candidate's raw (un-filtered) words for an exact match.  If found,
 *   return that candidate immediately as a confident match.
 *
 * PASS 2 — Board-first RECALL (fallback)
 *   Score = (board tokens found in candidate) / (total board tokens)
 *   "Butter Chicken" scores 1.0 against "Coles Butter Chicken Sauce 500g".
 *   Tiebreaker: prefer the candidate that covers the board tokens with fewer
 *   extra words (higher precision = |intersection| / |candidate tokens|).
 */

// ── Stop words ──────────────────────────────────────────────────────────────
const STOP_WORDS = new Set([
  // Supermarket / retailer names
  'coles', 'woolworths', 'ww', 'aldi', 'iga', 'spar', 'harris', 'costco',
  'countdown', 'pak', 'pantry', 'butcher', 'fresh',
  // Brand & marketing qualifiers
  'kitchen', 'select', 'specially', 'finest', 'premium', 'classic', 'original',
  'homestyle', 'homemade', 'traditional', 'hearty', 'delicious', 'gourmet',
  'rich', 'chunky', 'thick', 'smooth', 'slow', 'cooked', 'roasted', 'baked',
  'australian', 'harvest',
  // Production-specific codes stripped from RECALL scoring only
  // NOTE: "eb" intentionally removed — it is an identifier in "EM/EB" entries
  'epp', 'fill', 'cqc',
  // English function words
  'the', 'and', 'with', 'for', 'in', 'on', 'at', 'of', 'a', 'an', 'by', 'to',
  'or', 'its', 'is',
]);

// ── Synonym map ─────────────────────────────────────────────────────────────
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
  'ctm':     'tikka',
  'lrj':     'rogan',
  'strog':   'stroganoff',
  'mush':    'mushroom',
  'tom':     'tomato',
  'pumpk':   'pumpkin',
  'lemon':   'lemongrass',
  'mince':   'bolognese',
  'tkk':     'tikka',
};

const YEAR_RE = /^20\d{2}$/;

function tokenise(name: string): Set<string> {
  const tokens = name
    .toLowerCase()
    .replace(/[()&\-/]/g, ' ')
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(token => {
      if (!token || token.length <= 1)  return false;
      if (/^\d/.test(token))            return false;
      if (YEAR_RE.test(token))          return false;
      if (STOP_WORDS.has(token))        return false;
      return true;
    })
    .map(t => SYNONYMS[t] ?? t);

  return new Set(tokens);
}

/**
 * Split a string into raw lowercase words — NO stop-word filtering.
 * Used exclusively for parenthetical-code matching so that abbreviations
 * like "EB" in "EM/EB" are never silently dropped.
 */
function rawWords(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[()&\-/,]/g, ' ')
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(t => t.length >= 2);
}

/**
 * Extract short production codes from parentheses in a board product name.
 *   "MEAT SAUCE EPP (EM)"      → ["em"]
 *   "BECHAMEL SAUCE EPP (EB)"  → ["eb"]
 *   "Butter Chicken"            → []
 * Only 2–4 character codes are considered (avoids matching "(Mixed)" etc.).
 */
function extractParenCodes(name: string): string[] {
  return [...name.matchAll(/\(([A-Za-z]{2,4})\)/g)]
    .map(m => m[1].toLowerCase());
}

// ── Confidence thresholds ────────────────────────────────────────────────────
const CONFIDENT_THRESHOLD = 0.60;
const LOW_CONF_THRESHOLD  = 0.30;

export interface MatchResult {
  matched:          string;
  score:            number;
  isLowConfidence:  boolean;
  noMatch:          boolean;
}

/**
 * Return the best-matching L7-8 product for a board recipe name.
 * Returns null only when `candidates` is empty.
 */
export function bestMatch(boardProduct: string, candidates: string[]): MatchResult | null {
  if (!candidates.length) return null;

  // ── PASS 1: parenthetical-code match ─────────────────────────────────────
  // "MEAT SAUCE EPP (EM)" → code "em" → search for candidate whose raw words
  // include "em" → "EM/EB" wins immediately without going through recall.
  const codes = extractParenCodes(boardProduct);
  if (codes.length > 0) {
    let bestCode: { candidate: string; score: number } | null = null;
    for (const candidate of candidates) {
      const cWords = rawWords(candidate);
      const hits   = codes.filter(code => cWords.includes(code)).length;
      if (hits > 0) {
        const score = hits / codes.length;
        if (!bestCode || score > bestCode.score) {
          bestCode = { candidate, score };
        }
      }
    }
    if (bestCode) {
      return {
        matched:         bestCode.candidate,
        score:           bestCode.score,
        isLowConfidence: false,
        noMatch:         false,
      };
    }
  }

  // ── PASS 2: board-first recall scoring ───────────────────────────────────
  const boardTokens = tokenise(boardProduct);
  if (!boardTokens.size) {
    return { matched: candidates[0], score: 0, isLowConfidence: true, noMatch: true };
  }

  let best: MatchResult | null = null;
  let bestPrecision = -1;

  for (const candidate of candidates) {
    const cTokens = tokenise(candidate);
    if (!cTokens.size) continue;

    const intersectionCount = [...boardTokens].filter(t => cTokens.has(t)).length;
    const recall    = intersectionCount / boardTokens.size;
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
