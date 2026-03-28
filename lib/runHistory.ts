/** Per-line stats saved for a single production run */
export interface RunLineStats {
  products: number;   // distinct products on this line
  totalQty: number;   // total kg
  batches: number;    // total batch count
}

/** Snapshot saved to localStorage each time a board is loaded */
export interface RunSnapshot {
  id: string;
  prodDate?: string;    // ISO date from the plan file
  savedAt: string;      // ISO datetime when this was saved
  fileHash?: string;    // SHA-256 of the source xlsx — used for deduplication
  recipeRunId?: string; // Supabase run_id for the recipe pipeline run
  lines: Record<string, RunLineStats>;
  totalProducts: number;
  totalBatches: number;
  totalQty: number;
}

/** Aggregated analytics for one line across all stored runs */
export interface LineAnalytics {
  line: string;
  avgProducts: number;
  avgBatches: number;
  avgQty: number;
  runCount: number;
  trend: 'up' | 'down' | 'stable'; // compared to prior runs
  lastBatches: number;              // most recent run's batch count (0 if absent)
}

const STORAGE_KEY = 'ep_run_history';
const MAX_RUNS = 15;

export function saveRunSnapshot(snapshot: RunSnapshot): void {
  try {
    const existing = getRunHistory();
    // Deduplicate by id — re-loading same run shouldn't add a second entry
    const filtered = existing.filter(r => r.id !== snapshot.id);
    const updated = [snapshot, ...filtered].slice(0, MAX_RUNS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch { /* ignore quota errors */ }
}

export function getRunHistory(): RunSnapshot[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as RunSnapshot[]) : [];
  } catch { return []; }
}

/** Return an existing snapshot whose file content matches this SHA-256 hash */
export function findByHash(hash: string): RunSnapshot | null {
  return getRunHistory().find(s => s.fileHash === hash) ?? null;
}

/** Compute per-line averages across all stored snapshots */
export function computeLineAnalytics(history: RunSnapshot[]): LineAnalytics[] {
  if (history.length === 0) return [];

  const lineSet = new Set<string>();
  history.forEach(r => Object.keys(r.lines).forEach(l => lineSet.add(l)));

  const results: LineAnalytics[] = Array.from(lineSet).map(line => {
    const runsWithLine = history.filter(r => line in r.lines);
    const count = runsWithLine.length;

    const avgProducts = runsWithLine.reduce((s, r) => s + r.lines[line].products, 0) / count;
    const avgBatches  = runsWithLine.reduce((s, r) => s + r.lines[line].batches,  0) / count;
    const avgQty      = runsWithLine.reduce((s, r) => s + r.lines[line].totalQty, 0) / count;
    const lastBatches = runsWithLine[0]?.lines[line]?.batches ?? 0;

    let trend: 'up' | 'down' | 'stable' = 'stable';
    if (runsWithLine.length >= 3) {
      const recent   = runsWithLine[0].lines[line].batches;
      const olderAvg = runsWithLine.slice(1)
        .reduce((s, r) => s + r.lines[line].batches, 0) / (runsWithLine.length - 1);
      if (recent > olderAvg * 1.2)      trend = 'up';
      else if (recent < olderAvg * 0.8) trend = 'down';
    }

    return {
      line,
      avgProducts: Math.round(avgProducts * 10) / 10,
      avgBatches:  Math.round(avgBatches  * 10) / 10,
      avgQty:      Math.round(avgQty),
      runCount: count,
      trend,
      lastBatches,
    };
  });

  // Sort by average qty descending (busiest first)
  return results.sort((a, b) => b.avgQty - a.avgQty);
}
