import { ExcelRow } from '@/types';

// ── Board line identifiers ─────────────────────────────────────────────────
const K1 = 'KETTLE 1 SOUP';
const K2 = 'KETTLE 2 DIRECT FILL';
const K3 = 'KETTLE 3 DIRECT FILL';
const K4 = 'KETTLE 4 KAPCOLD';
const BT = 'BLENDTECH';

export const ALL_BOARD_LINES = [K1, K2, K3, K4, BT];

/**
 * Historical frequency rules — FIRST MATCH WINS.
 *
 * Ordering rules:
 *   1. Most specific / longest keyword phrases before shorter generic ones.
 *   2. "Nearly exclusive" products (1-kettle) before shared products.
 *   3. More specific sub-types before the generic parent keyword
 *      (e.g. "creamy tomato sc" before "tomato sc").
 *
 * 'kettles' is the priority-ordered list of preferred lines.
 * Single entry  → exclusive; the product almost always goes there.
 * Multiple entries → shared; load is balanced across those lines.
 */
const RULES: Array<{ keywords: string[]; kettles: string[] }> = [

  // ══ KETTLE 3 ══════════════════════════════════════════════════════════════
  // Must come before generic "cheese", "chicken", "pesto", "tomato sc"
  { keywords: ['improved cheese'],                                    kettles: [K3]         },
  { keywords: ['mature cheese'],                                      kettles: [K3]         },
  { keywords: ['scallop sauce', 'scallop sc'],                        kettles: [K3]         },
  { keywords: ['creamy tomato sauce', 'creamy tomato sc',
                'creamy tomato'],                                      kettles: [K3]         },
  { keywords: ['cannelloni sauce', 'cannelloni sc', 'cannelloni'],    kettles: [K3]         },
  { keywords: ['chicken pasta bake', 'pasta bake'],                   kettles: [K3]         },
  { keywords: ['chicken pesto'],                                      kettles: [K3]         },
  { keywords: ['enchilada', 'eb sauce', 'enchil'],                    kettles: [K3]         },

  // ══ KETTLE 2 ══════════════════════════════════════════════════════════════
  // EM Meat Sauce — item code and name variants
  { keywords: ['wmtscp10000', 'meat sauce', 'meat sc'],               kettles: [K2]         },
  // Lasagne meat SC codes before generic "lasagne"
  { keywords: ['lasagne meat', 'lasagna meat', 'lsgh', 'lsgn',
                'lasagne sc', 'lasagna sc'],                           kettles: [K2]         },
  { keywords: ['finest beef lasagne', 'finest beef lasagna'],         kettles: [K2]         },
  { keywords: ['mixed meat lasagne', 'mixed meat lasagna'],           kettles: [K2]         },
  { keywords: ['vegan lasagne', 'vegan lasagna', 'veg lasagne'],      kettles: [K2]         },
  { keywords: ['lasagne', 'lasagna'],                                  kettles: [K2]         },
  { keywords: ['pepperoni'],                                           kettles: [K2]         },
  { keywords: ['korma'],                                               kettles: [K2]         },

  // ══ KETTLE 4 ══════════════════════════════════════════════════════════════
  // Specific masala variants before generic "masala"
  { keywords: ['dahl masala', 'dhal masala', 'dal masala'],           kettles: [K4]         },
  { keywords: ['chopped masala'],                                      kettles: [K4]         },
  { keywords: ['massaman'],                                            kettles: [K4]         },
  { keywords: ['chicken parmesan', 'chicken parmi', 'chk parmi'],     kettles: [K4]         },
  { keywords: ['bbq texan', 'bbq txn', 'texan bbq'],                  kettles: [K4]         },
  { keywords: ['kung pao'],                                            kettles: [K4]         },
  { keywords: ['tandoori'],                                            kettles: [K4]         },
  { keywords: ['thai basil pork', 'thai basil'],                      kettles: [K4]         },
  { keywords: ['beef bourguignon', 'bourguignon'],                    kettles: [K4]         },
  { keywords: ['mediterranean', 'med sauce'],                         kettles: [K4]         },
  { keywords: ['kale'],                                                kettles: [K4]         },

  // ══ BLENDTECH ════════════════════════════════════════════════════════════
  { keywords: ['cottage pie'],                                         kettles: [BT]         },
  { keywords: ['lamb rendang'],                                        kettles: [BT]         },
  { keywords: ['perform lemongrass', 'lemongrass'],                   kettles: [BT]         },
  { keywords: ['mash potato', 'mashed potato', 'potato mash'],        kettles: [BT]         },
  { keywords: ['mash'],                                                kettles: [BT]         },

  // ══ KETTLE 1 ══════════════════════════════════════════════════════════════
  // Must come AFTER "creamy tomato" (K3) and "tomato sc" will come later
  { keywords: ['tomato basil', 'tomato & basil', 'tomato and basil'], kettles: [K1]         },
  { keywords: ['pumpkin soup', 'pumpkin'],                             kettles: [K1]         },
  // Specific chicken variants before shared "butter chicken"
  { keywords: ['chicken veg soup', 'chicken & veg', 'chicken veg'],   kettles: [K1]         },
  { keywords: ['chicken corn soup', 'chicken & corn', 'chicken corn'],kettles: [K1]         },
  { keywords: ['chicken noodle'],                                      kettles: [K1]         },
  { keywords: ['thai green'],                                          kettles: [K1]         },
  { keywords: ['minestrone'],                                          kettles: [K1]         },
  { keywords: ['red masala'],                                          kettles: [K1]         },
  { keywords: ['rogan josh', 'lamb rogan'],                           kettles: [K1]         },
  { keywords: ['creamy mushroom'],                                     kettles: [K1]         },
  { keywords: ['bolognese sc', 'bolog sc'],                           kettles: [K1]         },

  // ══ SHARED — load balanced among preferred kettles ════════════════════════
  { keywords: ['butter chicken'],                                      kettles: [K1, K2, BT] },
  { keywords: ['spaghetti bolognese', 'spag bolo', 'spag bol'],       kettles: [K2, BT]     },
  { keywords: ['bolognese'],                                           kettles: [K1, K2]     },
  { keywords: ['carbonara'],                                           kettles: [K1, K2, K3] },
  { keywords: ['beef stroganoff', 'stroganoff'],                       kettles: [K1, K2, BT] },
  { keywords: ["shepherd's pie", 'shepherds pie', 'shepherd pie'],    kettles: [K4, BT]     },
  { keywords: ['singapore'],                                           kettles: [K3, K4]     },
  { keywords: ['risotto'],                                             kettles: [K3, K4]     },
  { keywords: ['teriyaki'],                                            kettles: [K2, K4]     },
  { keywords: ['chicken madras', 'madras'],                           kettles: [K2, K4]     },
  { keywords: ['beef & gravy', 'beef and gravy', 'beef gravy'],        kettles: [K2, K4]     },
  { keywords: ['pesto sundried', 'pesto sun dried',
                'sundried pesto', 'sun dried pesto'],                  kettles: [K1, K3]     },
  { keywords: ['leek pie', 'leek & potato', 'leek and potato'],       kettles: [K1, K3]     },
  { keywords: ['chicken tikka masala', 'tikka masala'],               kettles: [K2, BT]     },
  { keywords: ['ctm'],                                                 kettles: [K2, BT]     },
  { keywords: ['mongolian'],                                           kettles: [BT, K2]     },
  { keywords: ['l-r-j', 'lrj'],                                        kettles: [BT, K2]     },
  { keywords: ['tofu butter masala', 'tofu butter', 'tofu masala'],   kettles: [K4, BT]     },
  { keywords: ['tofu butter chicken'],                                  kettles: [K4, BT]     },
  { keywords: ['mexican beef', 'mexican soup'],                        kettles: [K1, K3, K4] },
  { keywords: ['mexican'],                                             kettles: [K1, K3, K4] },

  // ══ Generic fallbacks (after all specific rules) ══════════════════════════
  { keywords: ['dahl', 'dhal'],                                        kettles: [K4]         },
  { keywords: [' dal ', 'dal sauce'],                                  kettles: [K4]         },
  { keywords: ['rendang'],                                             kettles: [BT]         },
  { keywords: ['pesto'],                                               kettles: [K3, K1]     },
  { keywords: ['tomato sauce', 'tomato sc'],                           kettles: [K2]         },
  { keywords: ['texan', 'txn'],                                        kettles: [K4]         },
];

/**
 * Find the preferred kettles for a product using historical frequency rules.
 * Returns [] if no rule matches (caller will fall back to pure load balancing).
 */
export function getPreferredKettles(product: string, itemCode: string): string[] {
  // Item-code match is unambiguous — check first
  if ((itemCode ?? '').toUpperCase().trim() === 'WMTSCP10000') return [K2];

  const lower = product.toLowerCase();
  for (const rule of RULES) {
    if (rule.keywords.some(kw => lower.includes(kw.toLowerCase()))) {
      return rule.kettles;
    }
  }
  return [];
}

/**
 * Assign board rows to kettles based on historical frequency + load balancing.
 *
 * Algorithm (greedy, most-constrained-first):
 *  1. Resolve each row's preferred kettles via RULES.
 *  2. Sort rows so exclusive products (1 preferred kettle) are assigned first;
 *     shared products come after (they have more flexibility to absorb load).
 *  3. For each row, assign to whichever preferred kettle has the lowest kg load.
 *  4. Unknown products (no rule match) are distributed across all lines by load.
 *
 * The result updates each row's `line` field to the assigned kettle.
 */
export function smartAssignKettles(rows: ExcelRow[]): Record<string, ExcelRow[]> {
  const load: Record<string, number> = {};
  const result: Record<string, ExcelRow[]> = {};
  for (const line of ALL_BOARD_LINES) {
    load[line]   = 0;
    result[line] = [];
  }

  // Attach preferred kettles to each row
  const scored = rows.map(row => ({
    row,
    preferred: getPreferredKettles(row.product, row.itemCode),
  }));

  // Assign exclusive products first so load is accurate when shared products are placed
  scored.sort((a, b) => {
    const aOptions = a.preferred.length || ALL_BOARD_LINES.length;
    const bOptions = b.preferred.length || ALL_BOARD_LINES.length;
    return aOptions - bOptions;
  });

  for (const { row, preferred } of scored) {
    const options = preferred.length > 0 ? preferred : ALL_BOARD_LINES;

    // Pick the option with the least current kg load
    const target = options.reduce((best, line) =>
      load[line] < load[best] ? line : best
    );

    result[target].push({ ...row, line: target });
    load[target] += row.quantity;
  }

  return result;
}
