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

// ── Item-code lookup (primary source — most specific) ─────────────────────
// Multiple allergens per item are listed most-severe first.
// Severity order: FISH > DAIRY > WHEAT > SOY > SULPHITE
const ITEM_ALLERGENS: Record<string, AllergenKey[]> = {

  // ── DAIRY only ────────────────────────────────────────────────────────────
  WCPSD10000:  ['DAIRY'],
  WKCKR10000:  ['DAIRY'],
  WKSLP10000:  ['DAIRY'],
  WFMCS10000:  ['DAIRY'],
  WCCRCP10000: ['DAIRY'],
  WCRMBCK1000: ['DAIRY'],
  WICSXCD1000: ['DAIRY'],
  WICSXHT1000: ['DAIRY'],
  WCKPEST1000: ['DAIRY'],
  WPCSPCD1000: ['DAIRY'],
  WMACHSA1000: ['DAIRY'],
  WCCMSS10000: ['DAIRY'],
  WCMCCC10000: ['DAIRY'],
  WPCTSP10000: ['DAIRY'],
  WPPSPS10000: ['DAIRY'],
  WSAUC00002:  ['DAIRY'],
  WCARSAU1000: ['DAIRY'],
  WPEPASA1000: ['DAIRY'],
  WBPSOUP1000: ['DAIRY'],
  WCABSOU1000: ['DAIRY'],
  WPBLSOU1000: ['DAIRY'],
  WTRPSOU1000: ['DAIRY'],

  // ── DAIRY + SULPHITE ──────────────────────────────────────────────────────
  WPPRCI10000: ['DAIRY', 'SULPHITE'],
  WFICASA1000: ['DAIRY', 'SULPHITE'],

  // ── SULPHITE only ─────────────────────────────────────────────────────────
  WSPSCI10000: ['SULPHITE'],
  WBMSR10000:  ['SULPHITE'],
  WCCSCI10000: ['SULPHITE'],
  WBLSCI10000: ['SULPHITE'],
  WSBLS10000:  ['SULPHITE'],
  WGRS10000:   ['SULPHITE'],
  WEMCPS10000: ['SULPHITE'],
  WMTSCP10000: ['SULPHITE'],
  WFBRS10000:  ['SULPHITE'],
  WCLPSS10000: ['SULPHITE'],
  WHBRS10000:  ['SULPHITE'],
  WBRASBF1000: ['SULPHITE'],
  WCKSCI10000: ['SULPHITE'],
  WBCCCHF1000: ['SULPHITE'],
  WBCCCCD1000: ['SULPHITE'],
  WVEGRS10000: ['SULPHITE'],
  WBEBOSA1000: ['SULPHITE'],
  WFBLSAU1000: ['SULPHITE'],
  WFIBERA1000: ['SULPHITE'],
  WSHPISA1000: ['SULPHITE'],
  WMMLMSA1000: ['SULPHITE'],
  WBFBSS10000: ['SULPHITE'],
  WPPSSS10000: ['SULPHITE'],
  WBOLSAU1000: ['SULPHITE'],

  // ── SOY + SULPHITE ────────────────────────────────────────────────────────
  WMNGB10000:  ['SOY', 'SULPHITE'],
  WTSACC10000: ['SOY', 'SULPHITE'],
  WPLSPS10000: ['SOY', 'SULPHITE'],

  // ── SOY only ─────────────────────────────────────────────────────────────
  WCBBCI10000: ['SOY'],
  WKUPCS10000: ['SOY'],
  WCCSOUP1000: ['SOY'],

  // ── FISH only ────────────────────────────────────────────────────────────
  WTGSCA10000: ['FISH'],
  WETGCA10000: ['FISH'],
  WCLSSCD1000: ['FISH'],
  WTHRCC10000: ['FISH'],

  // ── WHEAT/GLUTEN only ────────────────────────────────────────────────────
  WBLSCCP10000: ['WHEAT'],

  // ── ALLERGEN FREE ─────────────────────────────────────────────────────────
  WBTEXSA1000:  [],
  WCPMGN10000:  [],
  WBMSCA10000:  [],
  WCBRSCP10000: [],
  WBCCCP10000:  [],
  WLRJCP10000:  [],
  WLBSCI10000:  [],
  WVLSCI10000:  [],
  WSRAS10000:   [],
  WVTMCI10000:  [],
  WBUFFSU1000:  [],
  WFCTS10000:   [],
  WHCCHS10000:  [],
  WRMPGN10000:  [],
  WTDPGN10000:  [],
  WTFBM10000:   [],
  WTSCNCD1000:  [],
  WSSCSCD1000:  [],
  WCFSFCD1000:  [],
  WDMDMCD1000:  [],
  WTAMAD10000:  [],
  WPETAS10000:  [],
  WPESSS10000:  [],
  WPECKS10000:  [],
  WEWELBS1000:  [],
  WSWSS10000:   [],
  WCKCTM10000:  [],
  WWIPSS10000:  [],
  WPBCSS10000:  [],
  WPSSPS10000:  [],
  WCVLSS10000:  [],
  WVLSCF10000:  [],
  WTBPSAU1000:  [],
  WMBS10000:    [],
  WCKMINE1000:  [],
  WCNSOUP1000:  [],
  WVMSOUP1000:  [],
  WVTBSOU1000:  [],
  WCAGSOU1000:  [],
};

// ── Keyword fallback (used when item code is unknown) ─────────────────────
const ALLERGEN_KEYWORDS: Record<AllergenKey, string[]> = {
  ALLERGEN_FREE: [],
  DAIRY:    ['butter', 'cream', 'cheese', 'milk', 'dairy', 'carbonara', 'parmesan', 'feta', 'ricotta', 'bechamel'],
  FISH:     ['fish', 'tuna', 'salmon', 'prawn', 'seafood', 'anchovy', 'sardine', 'scallop', 'mussel', 'crab', 'lobster', 'laksa'],
  SOY:      ['soy', 'tofu', 'miso', 'edamame', 'tempeh', 'mongolian', 'teriyaki', 'black bean', 'kung pao'],
  SULPHITE: ['wine', 'vinegar', 'sulphite', 'sulfite', 'ragu', 'bolognese', 'bolog', 'stroganoff', 'gravy', 'braised', 'lasagne', 'lasagna'],
  WHEAT:    ['pasta', 'noodle', 'wheat', 'bread', 'flour', 'barley', 'rye', 'bechamel', 'pesto'],
};

// Severity order — first match is the primary allergen
const DETECT_ORDER: AllergenKey[] = ['FISH', 'DAIRY', 'WHEAT', 'SOY', 'SULPHITE'];

/**
 * Returns the list of allergens for a product.
 * Item code is checked first (exact match); keyword detection is the fallback.
 * Returns [] for allergen-free items.
 */
export function getProductAllergens(product: string, itemCode = ''): string[] {
  const code = itemCode.trim().toUpperCase();
  if (code && code in ITEM_ALLERGENS) {
    return ITEM_ALLERGENS[code];
  }

  // Keyword fallback — collect all matching allergens
  const lower  = product.toLowerCase();
  const isVegan = lower.includes('vegan');
  const found: AllergenKey[] = [];
  for (const key of DETECT_ORDER) {
    if (isVegan && (key === 'DAIRY' || key === 'FISH')) continue;
    if (ALLERGEN_KEYWORDS[key].some(kw => lower.includes(kw))) found.push(key);
  }
  return found;
}

/** Returns true if a cleaning step is needed between prev → next.
 *  CIP is required if prev had any allergen that next does NOT share. */
export function needsCleaning(prev: BoardItem, next: BoardItem): boolean {
  if (!prev.allergens.length) return false; // prev allergen-free → no CIP needed
  return prev.allergens.some(a => !next.allergens.includes(a));
}

/**
 * Suggest run order: allergen-free first, then by increasing allergen severity.
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
