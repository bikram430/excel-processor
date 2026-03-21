import * as XLSX from 'xlsx';
import { ExcelRow, LineStats, ProcessedData } from '@/types';

/**
 * Valid production line names — matched after trim + toUpperCase().
 *
 * Confirmed from the actual Excel file:
 *  - "BLENDTECH" is its own line (column A literally says "BLENDTECH")
 *  - "CQC 1"     is its own separate line
 *  Both were previously incorrectly merged as "BLENDTECH CQC 1".
 */
const VALID_LINES = new Set<string>([
  'BLENDTECH',
  'CQC 1',
  'CQC 2',
  'DD OVEN',
  'KETTLE 1 SOUP',
  'KETTLE 2 DIRECT FILL',
  'KETTLE 3 DIRECT FILL',
  'KETTLE 4 KAPCOLD',
  'RICE KETTLE',
  'WOK',
]);

/** Safely coerce any cell value to a trimmed string. */
function cellStr(val: unknown): string {
  return val != null ? String(val).trim() : '';
}

/**
 * Find the first column index whose header matches ANY of the supplied names
 * (case-insensitive). Returns -1 when not found.
 * Accepts multiple aliases so we can handle e.g. "Qty" OR "Quantity".
 */
function findColIndex(headers: string[], ...aliases: string[]): number {
  const targets = new Set(aliases.map((a) => a.toLowerCase()));
  return headers.findIndex((h) => h != null && targets.has(h.toLowerCase()));
}

/**
 * Scan the first 20 rows to find the actual header row.
 *
 * The Excel file has metadata in rows 1-3:
 *   Row 1 → "Document Version: …", "Cooking Date", date
 *   Row 2 → "Issue Date: …"
 *   Row 3 → (empty)
 *   Row 4 → real headers: Line | Product | Item Code | Qty | …
 *
 * By searching for the row that contains both "line" and "product" we handle
 * this layout without hardcoding a row number.
 */
function findHeaderRowIndex(raw: unknown[][]): number {
  for (let i = 0; i < Math.min(raw.length, 20); i++) {
    const row = raw[i] as unknown[];
    if (!row?.length) continue;

    const cells = Array.from(
      { length: row.length },
      (_, j) => cellStr(row[j]).toLowerCase()
    );

    // Must contain both "line" and "product" to be the header row
    if (cells.includes('line') && cells.includes('product')) return i;
  }
  return -1;
}

/**
 * Parse an Excel Buffer and return filtered + aggregated production data.
 * All processing is in-memory — nothing is persisted between requests.
 */
export function parseExcel(buffer: Buffer): ProcessedData {
  // ── 1. Read workbook ───────────────────────────────────────────────────────
  const workbook = XLSX.read(buffer, { type: 'buffer' });

  if (!workbook.SheetNames.length) {
    throw new Error('The Excel file contains no sheets.');
  }

  const worksheet = workbook.Sheets[workbook.SheetNames[0]];

  // ── 2. Convert sheet → 2-D array (every row, every cell) ──────────────────
  const raw: unknown[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

  if (!raw.length) {
    throw new Error('The Excel file is empty.');
  }

  // ── 3. Locate the real header row ──────────────────────────────────────────
  // The file starts with metadata rows; headers are on Excel row 4 (index 3).
  const headerRowIdx = findHeaderRowIndex(raw);

  if (headerRowIdx === -1) {
    throw new Error(
      'Could not find a header row with "Line" and "Product" columns. ' +
      'Make sure the Excel file has not been restructured.'
    );
  }

  // ── 4. Build a dense, trimmed headers array ────────────────────────────────
  // Array.from() converts sparse xlsx arrays to dense so no holes reach
  // findIndex() as undefined (which would crash on .toLowerCase()).
  const rawHeaderRow = raw[headerRowIdx] as unknown[];
  const headers: string[] = Array.from(
    { length: rawHeaderRow.length },
    (_, i) => cellStr(rawHeaderRow[i])
  );

  // ── 5. Find required column indices ───────────────────────────────────────
  const lineIdx     = findColIndex(headers, 'line');
  const productIdx  = findColIndex(headers, 'product');
  // The file uses "Qty" — also accept "Quantity" for robustness
  const quantityIdx = findColIndex(headers, 'qty', 'quantity');

  const missing: string[] = [];
  if (lineIdx     === -1) missing.push('"Line"');
  if (productIdx  === -1) missing.push('"Product"');
  if (quantityIdx === -1) missing.push('"Qty" or "Quantity"');

  if (missing.length) {
    throw new Error(
      `Missing required column(s): ${missing.join(', ')}. ` +
      `Columns detected: ${headers.filter(Boolean).map((h) => `"${h}"`).join(', ')}`
    );
  }

  // ── 6. Process every data row after the header ─────────────────────────────
  const filteredData: ExcelRow[] = [];

  for (let i = headerRowIdx + 1; i < raw.length; i++) {
    const row = raw[i] as unknown[];
    if (!row?.length) continue;

    const rawLine = cellStr(row[lineIdx]).toUpperCase();
    const product = cellStr(row[productIdx]);
    const rawQty  = row[quantityIdx];

    // Skip blank or partially-empty rows
    if (!rawLine || !product) continue;

    // STRICT filter — must exactly match one of the 10 valid lines
    if (!VALID_LINES.has(rawLine)) continue;

    // Strip thousands separators then parse to number
    const quantity = parseFloat(String(rawQty ?? '0').replace(/,/g, ''));
    if (isNaN(quantity)) continue;

    filteredData.push({ line: rawLine, product, quantity });
  }

  // ── 7. Aggregate totals ────────────────────────────────────────────────────
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
