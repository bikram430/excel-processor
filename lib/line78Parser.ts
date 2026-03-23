import * as XLSX from 'xlsx';

export interface Line78Entry {
  product: string;
  startTime: string; // HH:MM, 24-hour format
}

function cellStr(val: unknown): string {
  return val != null ? String(val).trim() : '';
}

/**
 * Convert an Excel cell value to a 24-hour HH:MM string.
 * Handles three representations:
 *   1. JavaScript Date  — produced when XLSX.read is called with cellDates:true
 *   2. Decimal number   — Excel time serial (e.g. 0.27083 = 06:30)
 *   3. String           — already formatted as "6:30", "06:30", "06:30:00", etc.
 */
function parseTimeCell(val: unknown): string {
  if (val == null || val === '') return '';

  // Case 1: Date object
  if (val instanceof Date) {
    const h = val.getHours();
    const m = val.getMinutes();
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  // Case 2: Numeric Excel time serial (fraction of a day, 0–1)
  if (typeof val === 'number' && val >= 0 && val < 1) {
    const totalMin = Math.round(val * 24 * 60);
    const h = Math.floor(totalMin / 60) % 24;
    const m = totalMin % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  // Case 3: String — parse leading HH:MM (ignores seconds and AM/PM)
  const str = String(val).trim();
  const match = str.match(/^(\d{1,2}):(\d{2})/);
  if (match) {
    const h = parseInt(match[1], 10);
    const m = parseInt(match[2], 10);
    if (h >= 0 && h < 24 && m >= 0 && m < 60) {
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
  }

  return ''; // unparseable — treat as missing
}

/**
 * Parse a Line 7-8 scheduling Excel file in the browser.
 *
 * Rules:
 *   - Scan every row in the first sheet.
 *   - Include rows where Column A (index 0) contains "Line 7" or "Line 8"
 *     (case-insensitive, substring match).
 *   - Product name  → Column B (index 1)
 *   - Start time    → Column P (index 15), 24-hour HH:MM
 *
 * Throws if the file cannot be read or contains no sheets.
 */
export async function parseLine78File(file: File): Promise<Line78Entry[]> {
  const buffer = await file.arrayBuffer();

  const workbook = XLSX.read(new Uint8Array(buffer), {
    type: 'array',
    cellDates: true, // return Date objects for date/time cells
  });

  if (!workbook.SheetNames.length) {
    throw new Error('The uploaded file contains no sheets.');
  }

  const ws   = workbook.Sheets[workbook.SheetNames[0]];
  // raw:true (default) returns the cell's .v value — numbers stay numbers,
  // Date objects stay Date objects, text stays text.
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

  const entries: Line78Entry[] = [];

  for (const row of rows) {
    if (!Array.isArray(row) || row.length === 0) continue;

    const colA  = cellStr(row[0]).toUpperCase();
    if (!colA.includes('LINE 7') && !colA.includes('LINE 8')) continue;

    const product = cellStr(row[1]); // Column B
    if (!product) continue;

    const startTime = parseTimeCell(row[15]); // Column P
    entries.push({ product, startTime });
  }

  return entries;
}
