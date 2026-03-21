import * as XLSX from 'xlsx';
import { ExcelRow, LineStats, ProcessedData } from '@/types';

/**
 * The exact (uppercase) production line names that are allowed.
 * Rows with any other value in the "line" column are discarded.
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
 * Case-insensitive search for a header column name.
 * Returns -1 when not found.
 */
function findColIndex(headers: string[], target: string): number {
  return headers.findIndex(
    (h) => h.trim().toLowerCase() === target.toLowerCase()
  );
}

/**
 * Parse an Excel Buffer (from an uploaded .xlsx / .xls file) and return:
 *  - filteredData  : rows that match a valid production line
 *  - totalsByLine  : quantity totals + entry count per line
 *  - overallTotal  : sum of all quantities in filteredData
 *
 * Throws a descriptive Error on validation failures so the API route
 * can surface a meaningful message to the UI.
 */
export function parseExcel(buffer: Buffer): ProcessedData {
  // ── 1. Read workbook ───────────────────────────────────────────────────────
  const workbook = XLSX.read(buffer, { type: 'buffer' });

  if (!workbook.SheetNames.length) {
    throw new Error('The Excel file contains no sheets.');
  }

  const worksheet = workbook.Sheets[workbook.SheetNames[0]];

  // ── 2. Convert to a 2-D array (header: 1 keeps row 0 as the header row) ──
  const raw: unknown[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

  if (raw.length === 0) {
    throw new Error('The Excel file is empty.');
  }

  // ── 3. Locate required columns ─────────────────────────────────────────────
  const headers: string[] = (raw[0] as unknown[]).map((h) => String(h ?? ''));

  const lineIdx = findColIndex(headers, 'line');
  const productIdx = findColIndex(headers, 'product');
  const quantityIdx = findColIndex(headers, 'quantity');

  const missing: string[] = [];
  if (lineIdx === -1) missing.push('"line"');
  if (productIdx === -1) missing.push('"product"');
  if (quantityIdx === -1) missing.push('"quantity"');

  if (missing.length > 0) {
    throw new Error(
      `Missing required column(s): ${missing.join(', ')}. ` +
        `Columns found: ${headers.map((h) => `"${h}"`).join(', ')}`
    );
  }

  // ── 4. Iterate data rows (skip header at index 0) ─────────────────────────
  const filteredData: ExcelRow[] = [];

  for (let i = 1; i < raw.length; i++) {
    const row = raw[i] as unknown[];
    if (!row || row.length === 0) continue;

    // Normalise: trim + uppercase for exact comparison
    const rawLine = String(row[lineIdx] ?? '').trim().toUpperCase();
    const product = String(row[productIdx] ?? '').trim();
    const rawQty = row[quantityIdx];

    // Skip rows that are missing a line or product value
    if (!rawLine || !product) continue;

    // STRICT filter – must exactly match one of the 9 valid lines
    if (!VALID_LINES.has(rawLine)) continue;

    // Parse quantity; strip thousands separators (e.g. "1,250")
    const quantity = parseFloat(String(rawQty ?? '0').replace(/,/g, ''));
    if (isNaN(quantity)) continue;

    filteredData.push({ line: rawLine, product, quantity });
  }

  // ── 5. Aggregate totals ────────────────────────────────────────────────────
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
