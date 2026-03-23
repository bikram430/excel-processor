import * as XLSX from 'xlsx';

export interface Line78Entry {
  product: string;
  startTime: string; // HH:MM, 24-hour format
}

/**
 * Parsed result split by line.
 *   line7 — rows where Col A contains "Line 7"; product name from Col B (index 1)
 *   line8 — rows where Col A contains "Line 8"; product name from Col R (index 17)
 *   Both use Col P (index 15) for the start time.
 */
export interface Line78ParseResult {
  line7: Line78Entry[];
  line8: Line78Entry[];
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

  if (val instanceof Date) {
    const h = val.getHours();
    const m = val.getMinutes();
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  if (typeof val === 'number' && val >= 0 && val < 1) {
    const totalMin = Math.round(val * 24 * 60);
    const h = Math.floor(totalMin / 60) % 24;
    const m = totalMin % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  const str = String(val).trim();
  const match = str.match(/^(\d{1,2}):(\d{2})/);
  if (match) {
    const h = parseInt(match[1], 10);
    const m = parseInt(match[2], 10);
    if (h >= 0 && h < 24 && m >= 0 && m < 60) {
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
  }

  return '';
}

/**
 * Parse a Line 7-8 scheduling Excel file in the browser.
 *
 * Column mapping:
 *   Col A  (index  0) — line identifier; must contain "Line 7" or "Line 8"
 *   Col B  (index  1) — product name for Line 7 (Kettle 1)
 *   Col P  (index 15) — start time (24h HH:MM) — same column for both lines
 *   Col R  (index 17) — product name for Line 8 (Kettle 2)
 */
export async function parseLine78File(file: File): Promise<Line78ParseResult> {
  const buffer = await file.arrayBuffer();

  const workbook = XLSX.read(new Uint8Array(buffer), {
    type: 'array',
    cellDates: true,
  });

  if (!workbook.SheetNames.length) {
    throw new Error('The uploaded file contains no sheets.');
  }

  const ws   = workbook.Sheets[workbook.SheetNames[0]];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

  const line7: Line78Entry[] = [];
  const line8: Line78Entry[] = [];

  for (const row of rows) {
    if (!Array.isArray(row) || row.length === 0) continue;

    const colA  = cellStr(row[0]).toUpperCase();
    const isL7  = colA.includes('LINE 7');
    const isL8  = colA.includes('LINE 8');
    if (!isL7 && !isL8) continue;

    const startTime = parseTimeCell(row[15]); // Column P — start time for both lines

    if (isL7) {
      const product = cellStr(row[1]); // Column B — Line 7 product name
      if (product) line7.push({ product, startTime });
    }

    if (isL8) {
      const product = cellStr(row[17]); // Column R — Line 8 product name
      if (product) line8.push({ product, startTime });
    }
  }

  return { line7, line8 };
}
