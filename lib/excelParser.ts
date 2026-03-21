import * as XLSX from 'xlsx';
import { ExcelRow, LineStats, ProcessedData } from '@/types';

/**
 * Valid production line names.
 * Matched after .trim().toUpperCase() on the "Line" column value.
 * BLENDTECH and CQC 1 are separate lines as confirmed by the Excel file.
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

/** Coerce any cell value to a trimmed string; returns '' for null/undefined/holes. */
function cellStr(val: unknown): string {
  return val != null ? String(val).trim() : '';
}

/**
 * Case-insensitive column search that accepts multiple aliases.
 * Also guards against sparse-array holes (undefined values) reaching .toLowerCase().
 */
function findColIndex(headers: string[], ...aliases: string[]): number {
  const targets = new Set(aliases.map((a) => a.toLowerCase()));
  return headers.findIndex((h) => h != null && targets.has(h.toLowerCase()));
}

/**
 * Scan the first 20 rows to find the actual header row.
 * The real Excel file has metadata rows 1-3 before the headers appear on row 4.
 * We look for the row that contains BOTH "line" and "product".
 */
function findHeaderRowIndex(raw: unknown[][]): number {
  for (let i = 0; i < Math.min(raw.length, 20); i++) {
    const row = raw[i] as unknown[];
    if (!row?.length) continue;

    const cells = Array.from(
      { length: row.length },
      (_, j) => cellStr(row[j]).toLowerCase()
    );

    if (cells.includes('line') && cells.includes('product')) return i;
  }
  return -1;
}

export function parseExcel(buffer: Buffer): ProcessedData {
  // ── 1. Read workbook ───────────────────────────────────────────────────────
  const workbook = XLSX.read(buffer, { type: 'buffer' });

  if (!workbook.SheetNames.length) {
    throw new Error('The Excel file contains no sheets.');
  }

  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  const raw: unknown[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

  if (!raw.length) {
    throw new Error('The Excel file is empty.');
  }

  // ── 2. Locate real header row (skips metadata rows at the top) ─────────────
  const headerRowIdx = findHeaderRowIndex(raw);
  if (headerRowIdx === -1) {
    throw new Error(
      'Could not find a header row containing "Line" and "Product". ' +
      'Please ensure the Excel file has not been restructured.'
    );
  }

  // ── 3. Build a dense, trimmed headers array ────────────────────────────────
  // Array.from() converts sparse xlsx arrays to dense so .findIndex() never
  // receives a hole (which would pass `undefined` to h.toLowerCase() → crash).
  const rawHeaderRow = raw[headerRowIdx] as unknown[];
  const headers: string[] = Array.from(
    { length: rawHeaderRow.length },
    (_, i) => cellStr(rawHeaderRow[i])
  );

  // ── 4. Map required + optional column indices ──────────────────────────────
  const lineIdx         = findColIndex(headers, 'line');
  const productIdx      = findColIndex(headers, 'product');
  const quantityIdx     = findColIndex(headers, 'qty', 'quantity');        // file uses "Qty"
  const itemCodeIdx     = findColIndex(headers, 'item code', 'itemcode', 'item_code');
  const uomIdx          = findColIndex(headers, 'uom', 'unit');
  const typeIdx         = findColIndex(headers, 'type');
  const planningGrpIdx  = findColIndex(headers, 'planning group', 'planning grp', 'planninggroup');
  const sequenceIdx     = findColIndex(headers, 'sequence', 'seq');
  const commentsIdx     = findColIndex(headers, 'comments', 'comment');

  // Only line, product and qty are mandatory
  const missing: string[] = [];
  if (lineIdx     === -1) missing.push('"Line"');
  if (productIdx  === -1) missing.push('"Product"');
  if (quantityIdx === -1) missing.push('"Qty" / "Quantity"');

  if (missing.length) {
    throw new Error(
      `Missing required column(s): ${missing.join(', ')}. ` +
      `Columns detected: ${headers.filter(Boolean).map((h) => `"${h}"`).join(', ')}`
    );
  }

  // ── 5. Process every data row that follows the header ──────────────────────
  const filteredData: ExcelRow[] = [];

  for (let i = headerRowIdx + 1; i < raw.length; i++) {
    const row = raw[i] as unknown[];
    if (!row?.length) continue;

    const rawLine = cellStr(row[lineIdx]).toUpperCase();
    const product = cellStr(row[productIdx]);
    const rawQty  = row[quantityIdx];

    if (!rawLine || !product) continue;

    // STRICT filter — must exactly match one of the 10 valid lines
    if (!VALID_LINES.has(rawLine)) continue;

    const quantity = parseFloat(String(rawQty ?? '0').replace(/,/g, ''));
    if (isNaN(quantity)) continue;

    filteredData.push({
      line:         rawLine,
      product,
      quantity,
      itemCode:     itemCodeIdx    !== -1 ? cellStr(row[itemCodeIdx])    : '',
      uom:          uomIdx         !== -1 ? cellStr(row[uomIdx])         : '',
      type:         typeIdx        !== -1 ? cellStr(row[typeIdx])        : '',
      planningGroup: planningGrpIdx !== -1 ? cellStr(row[planningGrpIdx]) : '',
      sequence:     sequenceIdx    !== -1 ? cellStr(row[sequenceIdx])    : '',
      comments:     commentsIdx    !== -1 ? cellStr(row[commentsIdx])    : '',
    });
  }

  // ── 6. Aggregate totals ────────────────────────────────────────────────────
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
