import * as XLSX from 'xlsx';
import { ExcelRow, LineStats, ProcessedData } from '@/types';

/**
 * The exact (uppercase) production line names that are accepted.
 * Anything else is discarded silently.
 */
const VALID_LINES = new Set<string>([
  'BLENDTECH CQC 1',
  'CQC 2',
  'DD OVEN',
  'KETTLE 1 SOUP',
  'KETTLE 2 DIRECT FILL',
  'KETTLE 3 DIRECT FILL',
  'KETTLE 4 KAPCOLD',
  'RICE KETTLE',
  'WOK',
]);

/**
 * Safely convert any cell value to a trimmed string.
 * Returns '' for null / undefined / sparse-array holes.
 */
function cellStr(val: unknown): string {
  return val != null ? String(val).trim() : '';
}

/**
 * Case-insensitive column search.
 * Guards against undefined (sparse array holes reach findIndex even though
 * they were skipped by the earlier .map() call).
 */
function findColIndex(headers: string[], target: string): number {
  const t = target.toLowerCase();
  return headers.findIndex((h) => h != null && h.toLowerCase() === t);
}

/**
 * Parse an Excel Buffer and return filtered + aggregated production data.
 * All processing is in-memory; nothing is persisted.
 */
export function parseExcel(buffer: Buffer): ProcessedData {
  // ── 1. Read workbook ───────────────────────────────────────────────────────
  const workbook = XLSX.read(buffer, { type: 'buffer' });

  if (!workbook.SheetNames.length) {
    throw new Error('The Excel file contains no sheets.');
  }

  const worksheet = workbook.Sheets[workbook.SheetNames[0]];

  // ── 2. Convert sheet → 2-D array ──────────────────────────────────────────
  const raw: unknown[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

  if (!raw.length) {
    throw new Error('The Excel file is empty.');
  }

  // ── 3. Extract headers ─────────────────────────────────────────────────────
  // IMPORTANT: use Array.from() so that sparse holes in the xlsx output become
  // explicit undefined entries — otherwise .map() skips them but .findIndex()
  // later visits them and calls .trim() on undefined → crash.
  const rawHeaderRow = raw[0] as unknown[];
  const headers: string[] = Array.from(
    { length: rawHeaderRow.length },
    (_, i) => cellStr(rawHeaderRow[i])
  );

  // ── 4. Locate required columns ─────────────────────────────────────────────
  const lineIdx     = findColIndex(headers, 'line');
  const productIdx  = findColIndex(headers, 'product');
  const quantityIdx = findColIndex(headers, 'quantity');

  const missing: string[] = [];
  if (lineIdx     === -1) missing.push('"line"');
  if (productIdx  === -1) missing.push('"product"');
  if (quantityIdx === -1) missing.push('"quantity"');

  if (missing.length) {
    throw new Error(
      `Missing required column(s): ${missing.join(', ')}. ` +
      `Columns found: ${headers.map((h) => `"${h}"`).join(', ')}`
    );
  }

  // ── 5. Process data rows ───────────────────────────────────────────────────
  const filteredData: ExcelRow[] = [];

  for (let i = 1; i < raw.length; i++) {
    const row = raw[i] as unknown[];
    if (!row?.length) continue;

    const rawLine = cellStr(row[lineIdx]).toUpperCase();
    const product = cellStr(row[productIdx]);
    const rawQty  = row[quantityIdx];

    // Skip blank rows
    if (!rawLine || !product) continue;

    // STRICT filter — exact match against the 9 valid lines
    if (!VALID_LINES.has(rawLine)) continue;

    // Strip thousands separators then parse
    const quantity = parseFloat(String(rawQty ?? '0').replace(/,/g, ''));
    if (isNaN(quantity)) continue;

    filteredData.push({ line: rawLine, product, quantity });
  }

  // ── 6. Aggregate ──────────────────────────────────────────────────────────
  const totalsByLine: Record<string, LineStats> = {};
  let overallTotal = 0;

  for (const row of filteredData) {
    if (!totalsByLine[row.line]) {
      totalsByLine[row.line] = { totalQuantity: 0, count: 0 };
    }
    totalsByLine[row.line].totalQuantity += row.quantity;
    totalsByLine[row.line].count += 1;
    overallTotal += row.quantity;
  }

  return { filteredData, totalsByLine, overallTotal };
}
