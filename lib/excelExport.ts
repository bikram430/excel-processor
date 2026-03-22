/**
 * Vibrant styled Excel export for the Production Board.
 * Uses xlsx-js-style for full cell formatting (colours, fonts, borders).
 */

import { BoardItem } from '@/types';
import { insertCleaningSteps } from './allergenRules';

// ── Colour palette (hex without #, matching the website) ──────────────────
const C = {
  SLATE_900:  '0F172A',
  SLATE_800:  '1E293B',
  SLATE_600:  '475569',
  SLATE_200:  'E2E8F0',
  SLATE_100:  'F1F5F9',
  WHITE:      'FFFFFF',
  INDIGO_700: '4338CA',
  INDIGO_600: '4F46E5',
  INDIGO_100: 'E0E7FF',
  INDIGO_50:  'EEF2FF',
  AMBER_700:  'B45309',
  AMBER_50:   'FFFBEB',
  AMBER_200:  'FDE68A',
  GREEN_800:  '166534',
  GREEN_100:  'DCFCE7',
  GRAY_50:    'F9FAFB',
  GRAY_100:   'F3F4F6',
  GRAY_400:   '9CA3AF',
  GRAY_700:   '374151',
  // Allergen fills / text
  DAIRY_F:    'FEF9C3', DAIRY_T:   '92400E',
  MEAT_F:     'FEE2E2', MEAT_T:    '991B1B',
  EGG_F:      'FFEDD5', EGG_T:     '9A3412',
  GLUTEN_F:   'FEF3C7', GLUTEN_T:  '92400E',
  NUT_F:      'ECFCCB', NUT_T:     '365314',
};

const LINE_LABEL: Record<string, string> = {
  'KETTLE 1 SOUP':        'Kettle (K1)',
  'KETTLE 2 DIRECT FILL': 'Kettle (K2)',
  'KETTLE 3 DIRECT FILL': 'Kettle (K3)',
  'KETTLE 4 KAPCOLD':     'Kettle (K4)',
  'BLENDTECH':            'Blentech',
};

const LINE_CAPS: Record<string, number> = {
  'KETTLE 1 SOUP':        2000,
  'KETTLE 2 DIRECT FILL': 2000,
  'KETTLE 3 DIRECT FILL': 2000,
  'KETTLE 4 KAPCOLD':     1000,
  'BLENDTECH':            2000,
};

// ── Small helpers ──────────────────────────────────────────────────────────

/** Convert (row, col) zero-indexed to Excel cell ref e.g. enc(0,0)="A1" */
function enc(r: number, c: number): string {
  return `${col26(c)}${r + 1}`;
}

function col26(c: number): string {
  let s = '';
  for (c++; c > 0; c = Math.floor((c - 1) / 26)) {
    s = String.fromCharCode(65 + ((c - 1) % 26)) + s;
  }
  return s;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mkCell(v: unknown, s?: object): any {
  return s ? { v, t: typeof v === 'number' ? 'n' : 's', s } : { v, t: typeof v === 'number' ? 'n' : 's' };
}

/** Parse "2000×2 / 950×1" breakdown into individual batch sizes */
function parseBatchSizes(
  breakdown: string,
  batches: number,
  qty: number,
): { kg: number; full: boolean }[] {
  const cleaned = breakdown.replace(/\s*\(→[\d,]+kg out\)/g, '');
  const matches  = [...cleaned.matchAll(/(\d+)×(\d+)/g)];
  if (matches.length > 0) {
    const maxKg = Math.max(...matches.map(m => parseInt(m[1])));
    const out: { kg: number; full: boolean }[] = [];
    for (const m of matches) {
      const kg = parseInt(m[1]);
      const n  = parseInt(m[2]);
      for (let i = 0; i < n; i++) out.push({ kg, full: kg === maxKg });
    }
    return out;
  }
  const n = Math.max(batches, 1);
  const pb = Math.ceil(qty / n);
  return Array.from({ length: n }, () => ({ kg: pb, full: true }));
}

// ── Style factories ────────────────────────────────────────────────────────
type BorderSide = { style: string; color: { rgb: string } };
type Border     = { top?: BorderSide; bottom?: BorderSide; left?: BorderSide; right?: BorderSide };

function border(rgb = 'E5E7EB', style = 'thin'): Border {
  const side: BorderSide = { style, color: { rgb } };
  return { top: side, bottom: side, left: side, right: side };
}

function sHeader(bg = C.SLATE_800, fg = C.WHITE, sz = 12) {
  return {
    font: { bold: true, color: { rgb: fg }, sz, name: 'Calibri' },
    fill: { patternType: 'solid', fgColor: { rgb: bg } },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: false },
    border: border(C.SLATE_600, 'medium'),
  };
}

function sSubHeader() {
  return {
    font: { bold: true, color: { rgb: C.SLATE_800 }, sz: 9, name: 'Calibri' },
    fill: { patternType: 'solid', fgColor: { rgb: C.SLATE_100 } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: border('CBD5E1'),
  };
}

function sProduct(shade: boolean) {
  return {
    font: { bold: true, color: { rgb: C.SLATE_800 }, sz: 10, name: 'Calibri' },
    fill: { patternType: 'solid', fgColor: { rgb: shade ? C.GRAY_50 : C.WHITE } },
    alignment: { horizontal: 'left', vertical: 'center', wrapText: false },
    border: border('E5E7EB'),
  };
}

function sTotal(shade: boolean) {
  return {
    font: { bold: true, color: { rgb: C.GRAY_700 }, sz: 10, name: 'Calibri' },
    fill: { patternType: 'solid', fgColor: { rgb: shade ? C.GRAY_50 : C.WHITE } },
    alignment: { horizontal: 'right', vertical: 'center' },
    border: border('E5E7EB'),
    numFmt: '#,##0',
  };
}

function sSeq(shade: boolean) {
  return {
    font: { color: { rgb: C.GRAY_400 }, sz: 9, name: 'Calibri' },
    fill: { patternType: 'solid', fgColor: { rgb: shade ? C.GRAY_50 : C.WHITE } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: border('E5E7EB'),
  };
}

function sBatchFull() {
  return {
    font: { bold: true, color: { rgb: C.WHITE }, sz: 10, name: 'Calibri' },
    fill: { patternType: 'solid', fgColor: { rgb: C.INDIGO_600 } },
    alignment: { horizontal: 'right', vertical: 'center' },
    border: border(C.INDIGO_700),
    numFmt: '#,##0',
  };
}

function sBatchPartial() {
  return {
    font: { bold: false, color: { rgb: C.INDIGO_700 }, sz: 10, name: 'Calibri' },
    fill: { patternType: 'solid', fgColor: { rgb: C.INDIGO_50 } },
    alignment: { horizontal: 'right', vertical: 'center' },
    border: border(C.INDIGO_100),
    numFmt: '#,##0',
  };
}

function sRBadgeFull() {
  return {
    font: { bold: true, color: { rgb: C.WHITE }, sz: 9, name: 'Calibri' },
    fill: { patternType: 'solid', fgColor: { rgb: C.INDIGO_600 } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: border(C.INDIGO_700),
  };
}

function sRBadgeEmpty(shade: boolean) {
  return {
    fill: { patternType: 'solid', fgColor: { rgb: shade ? C.GRAY_50 : C.WHITE } },
    border: border('E5E7EB'),
  };
}

function sCleaning() {
  return {
    font: { bold: true, italic: true, color: { rgb: C.AMBER_700 }, sz: 9, name: 'Calibri' },
    fill: { patternType: 'solid', fgColor: { rgb: C.AMBER_50 } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: border(C.AMBER_200),
  };
}

function sSubtotalLabel() {
  return {
    font: { bold: true, color: { rgb: C.GREEN_800 }, sz: 11, name: 'Calibri' },
    fill: { patternType: 'solid', fgColor: { rgb: C.GREEN_100 } },
    alignment: { horizontal: 'left', vertical: 'center' },
    border: border('86EFAC', 'medium'),
  };
}

function sSubtotalValue() {
  return {
    font: { bold: true, color: { rgb: C.GREEN_800 }, sz: 11, name: 'Calibri' },
    fill: { patternType: 'solid', fgColor: { rgb: C.GREEN_100 } },
    alignment: { horizontal: 'right', vertical: 'center' },
    border: border('86EFAC', 'medium'),
    numFmt: '#,##0',
  };
}

function sAllergen(allergens: string[]) {
  const bgMap: Record<string, string> = { DAIRY: C.DAIRY_F, MEAT: C.MEAT_F, EGG: C.EGG_F, GLUTEN: C.GLUTEN_F, NUT: C.NUT_F };
  const fgMap: Record<string, string> = { DAIRY: C.DAIRY_T, MEAT: C.MEAT_T, EGG: C.EGG_T, GLUTEN: C.GLUTEN_T, NUT: C.NUT_T };
  const p = allergens[0];
  return {
    font: { bold: !!p, color: { rgb: p ? fgMap[p] : C.GRAY_400 }, sz: 8, name: 'Calibri' },
    fill: { patternType: 'solid', fgColor: { rgb: p ? bgMap[p] : C.WHITE } },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    border: border('E5E7EB'),
  };
}

function sEmpty(shade = false) {
  return {
    fill: { patternType: 'solid', fgColor: { rgb: shade ? C.GRAY_50 : C.WHITE } },
    border: border('E5E7EB'),
  };
}

// ── Build one line sheet ───────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildLineSheet(line: string, items: BoardItem[]): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ws: any = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const merges: any[] = [];

  // Columns: Seq | Product | Total kg | Batch# | Batch kg | R | Time | Allergens
  const W = { SEQ: 0, PROD: 1, TOTAL: 2, BNUM: 3, BKG: 4, R: 5, TIME: 6, ALG: 7, NCOLS: 8 };

  let row = 0;
  const cap   = LINE_CAPS[line];
  const label = LINE_LABEL[line] ?? line;

  // ── Header ──
  ws[enc(row, 0)] = mkCell(`${label}   ·   max ${cap?.toLocaleString() ?? '—'} kg/batch`, sHeader());
  for (let c = 1; c < W.NCOLS; c++) ws[enc(row, c)] = mkCell('', sHeader());
  merges.push({ s: { r: row, c: 0 }, e: { r: row, c: W.NCOLS - 1 } });
  row++;

  // ── Stats ──
  const totalKg     = items.reduce((s, i) => s + i.quantity, 0);
  const totalBatches = items.reduce((s, i) => s + i.batches, 0);
  const statStyle = {
    font: { bold: false, color: { rgb: C.SLATE_600 }, sz: 10, name: 'Calibri' },
    fill: { patternType: 'solid', fgColor: { rgb: C.SLATE_200 } },
    alignment: { horizontal: 'left', vertical: 'center' },
    border: border('CBD5E1'),
  };
  ws[enc(row, 0)] = mkCell(
    `${items.length} product${items.length !== 1 ? 's' : ''}   ·   ${totalBatches} batch${totalBatches !== 1 ? 'es' : ''}   ·   ${totalKg.toLocaleString()} kg total`,
    statStyle,
  );
  for (let c = 1; c < W.NCOLS; c++) ws[enc(row, c)] = mkCell('', { fill: { patternType: 'solid', fgColor: { rgb: C.SLATE_200 } }, border: border('CBD5E1') });
  merges.push({ s: { r: row, c: 0 }, e: { r: row, c: W.NCOLS - 1 } });
  row++;

  // ── Column sub-headers ──
  ['#', 'Product Name', 'Total (kg)', 'Batch', 'Size (kg)', 'R', 'Start', 'Allergens'].forEach(
    (h, c) => { ws[enc(row, c)] = mkCell(h, sSubHeader()); },
  );
  row++;

  // ── Products ──
  let pos = 0;
  const displayItems = insertCleaningSteps(items);

  for (const entry of displayItems) {
    if (entry.type === 'cleaning') {
      ws[enc(row, 0)] = mkCell('⚠   CIP / Cleaning Required Before Next Product', sCleaning());
      for (let c = 1; c < W.NCOLS; c++) ws[enc(row, c)] = mkCell('', sCleaning());
      merges.push({ s: { r: row, c: 0 }, e: { r: row, c: W.NCOLS - 1 } });
      row++;
      continue;
    }

    const item  = entry as BoardItem;
    pos++;
    const shade = pos % 2 === 0;
    const sizes = parseBatchSizes(item.batchBreakdown, item.batches, item.quantity);

    // First row: product name + total + first batch
    ws[enc(row, W.SEQ)]   = mkCell(pos, sSeq(shade));
    ws[enc(row, W.PROD)]  = mkCell(item.product, sProduct(shade));
    ws[enc(row, W.TOTAL)] = mkCell(item.quantity, sTotal(shade));
    if (sizes[0]) {
      ws[enc(row, W.BNUM)] = mkCell(1, sSeq(shade));
      ws[enc(row, W.BKG)]  = mkCell(sizes[0].kg, sizes[0].full ? sBatchFull() : sBatchPartial());
      ws[enc(row, W.R)]    = mkCell(sizes[0].full ? 'R' : '', sizes[0].full ? sRBadgeFull() : sRBadgeEmpty(shade));
    } else {
      ws[enc(row, W.BNUM)] = mkCell('', sEmpty(shade));
      ws[enc(row, W.BKG)]  = mkCell('', sEmpty(shade));
      ws[enc(row, W.R)]    = mkCell('', sEmpty(shade));
    }
    ws[enc(row, W.TIME)] = mkCell(item.time || '—', { font: { color: { rgb: C.GRAY_700 }, sz: 9, name: 'Calibri' }, fill: { patternType: 'solid', fgColor: { rgb: shade ? C.GRAY_50 : C.WHITE } }, alignment: { horizontal: 'center', vertical: 'center' }, border: border('E5E7EB') });
    ws[enc(row, W.ALG)]  = mkCell(item.allergens.join(', ') || '—', sAllergen(item.allergens));
    row++;

    // Additional batch rows
    for (let bi = 1; bi < sizes.length; bi++) {
      const b = sizes[bi];
      ws[enc(row, W.SEQ)]   = mkCell('', sEmpty(shade));
      ws[enc(row, W.PROD)]  = mkCell('', sEmpty(shade));
      ws[enc(row, W.TOTAL)] = mkCell('', sEmpty(shade));
      ws[enc(row, W.BNUM)]  = mkCell(bi + 1, { font: { color: { rgb: C.GRAY_400 }, sz: 8, name: 'Calibri' }, fill: { patternType: 'solid', fgColor: { rgb: shade ? C.GRAY_50 : C.WHITE } }, alignment: { horizontal: 'center', vertical: 'center' }, border: border('E5E7EB') });
      ws[enc(row, W.BKG)]   = mkCell(b.kg, b.full ? sBatchFull() : sBatchPartial());
      ws[enc(row, W.R)]     = mkCell(b.full ? 'R' : '', b.full ? sRBadgeFull() : sRBadgeEmpty(shade));
      ws[enc(row, W.TIME)]  = mkCell('', sEmpty(shade));
      ws[enc(row, W.ALG)]   = mkCell('', sEmpty(shade));
      row++;
    }
  }

  // ── Subtotal row ──
  ws[enc(row, 0)]        = mkCell('SUBTOTAL', sSubtotalLabel());
  ws[enc(row, W.PROD)]   = mkCell('', sSubtotalLabel());
  ws[enc(row, W.TOTAL)]  = mkCell(totalKg, sSubtotalValue());
  for (let c = W.TOTAL + 1; c < W.NCOLS; c++) {
    ws[enc(row, c)] = mkCell('', { fill: { patternType: 'solid', fgColor: { rgb: C.GREEN_100 } }, border: border('86EFAC', 'medium') });
  }
  merges.push({ s: { r: row, c: 0 }, e: { r: row, c: W.PROD } });
  row++;

  ws['!ref']    = `A1:${col26(W.NCOLS - 1)}${row}`;
  ws['!merges'] = merges;
  ws['!cols']   = [
    { wch: 5  },  // Seq#
    { wch: 30 },  // Product
    { wch: 12 },  // Total kg
    { wch: 7  },  // Batch#
    { wch: 12 },  // Batch kg
    { wch: 5  },  // R
    { wch: 10 },  // Time
    { wch: 22 },  // Allergens
  ];
  ws['!rows'] = [{ hpt: 28 }, { hpt: 20 }, { hpt: 18 }];

  return ws;
}

// ── Build overview sheet (whiteboard side-by-side) ────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildOverviewSheet(lineMap: Record<string, BoardItem[]>, activeLines: string[]): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ws: any = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const merges: any[] = [];

  // 5 columns per line: #  |  Product  |  Total kg  |  Batches  |  [spacer]
  const DC = 4;  // data cols per line
  const SC = 1;  // spacer cols

  const totalSpan = activeLines.length * (DC + SC) - SC; // no trailing spacer

  // ── Title ──
  ws[enc(0, 0)] = mkCell('PRODUCTION BOARD', sHeader(C.SLATE_900, C.WHITE, 16));
  for (let c = 1; c <= totalSpan; c++) ws[enc(0, c)] = mkCell('', { fill: { patternType: 'solid', fgColor: { rgb: C.SLATE_900 } }, border: border(C.SLATE_800) });
  merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: totalSpan } });

  // ── Date ──
  const dateStr = new Date().toLocaleDateString('en-AU', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const dateSt = { font: { italic: true, color: { rgb: C.SLATE_600 }, sz: 9, name: 'Calibri' }, fill: { patternType: 'solid', fgColor: { rgb: C.SLATE_100 } }, alignment: { horizontal: 'center', vertical: 'center' } };
  ws[enc(1, 0)] = mkCell(`Generated: ${dateStr}`, dateSt);
  for (let c = 1; c <= totalSpan; c++) ws[enc(1, c)] = mkCell('', dateSt);
  merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: totalSpan } });

  const BASE = 3; // data starts at row index 3 (leaving row 2 blank)

  // ── Pre-build per-line row lists ──
  type LRow =
    | { k: 'hdr' }
    | { k: 'stat'; prods: number; batches: number; totalKg: number }
    | { k: 'subhdr' }
    | { k: 'prod'; pos: number; name: string; totalKg: number; sizes: { kg: number; full: boolean }[]; allergens: string[] }
    | { k: 'clean' }
    | { k: 'sub'; totalKg: number }
    | { k: 'empty' };

  const lineLists: LRow[][] = activeLines.map(line => {
    const items = lineMap[line] ?? [];
    const rows: LRow[] = [];
    rows.push({ k: 'hdr' });
    rows.push({ k: 'stat', prods: items.length, batches: items.reduce((s, i) => s + i.batches, 0), totalKg: items.reduce((s, i) => s + i.quantity, 0) });
    rows.push({ k: 'subhdr' });

    let pos = 0;
    for (const entry of insertCleaningSteps(items)) {
      if (entry.type === 'cleaning') { rows.push({ k: 'clean' }); continue; }
      const item = entry as BoardItem;
      pos++;
      rows.push({ k: 'prod', pos, name: item.product, totalKg: item.quantity, sizes: parseBatchSizes(item.batchBreakdown, item.batches, item.quantity), allergens: item.allergens });
    }
    rows.push({ k: 'sub', totalKg: items.reduce((s, i) => s + i.quantity, 0) });
    return rows;
  });

  const maxLen = Math.max(...lineLists.map(l => l.length));
  for (const lst of lineLists) {
    while (lst.length < maxLen) lst.push({ k: 'empty' });
  }

  // ── Write each line's rows into its column group ──
  for (let li = 0; li < activeLines.length; li++) {
    const line     = activeLines[li];
    const colStart = li * (DC + SC);
    const rows     = lineLists[li];
    const isLast   = li === activeLines.length - 1;

    for (let ri = 0; ri < rows.length; ri++) {
      const r   = BASE + ri;
      const row = rows[ri];
      const c0  = colStart;

      const writeRow = (cells: unknown[]) =>
        cells.forEach((cv, dc) => {
          if (dc < DC) ws[enc(r, c0 + dc)] = cv;
        });

      if (row.k === 'hdr') {
        const lbl = LINE_LABEL[line] ?? line;
        const cap = LINE_CAPS[line];
        ws[enc(r, c0)] = mkCell(`${lbl}  ·  max ${cap?.toLocaleString() ?? '—'} kg`, sHeader());
        for (let dc = 1; dc < DC; dc++) ws[enc(r, c0 + dc)] = mkCell('', sHeader());
        merges.push({ s: { r, c: c0 }, e: { r, c: c0 + DC - 1 } });

      } else if (row.k === 'stat') {
        const bg = { patternType: 'solid', fgColor: { rgb: C.SLATE_200 } };
        ws[enc(r, c0)]     = mkCell(`${row.prods} prods · ${row.batches} batches`, { font: { sz: 9, color: { rgb: C.SLATE_600 }, name: 'Calibri' }, fill: bg, alignment: { horizontal: 'left', vertical: 'center' }, border: border('CBD5E1') });
        ws[enc(r, c0 + 1)] = mkCell('', { fill: bg, border: border('CBD5E1') });
        ws[enc(r, c0 + 2)] = mkCell(row.totalKg, { font: { bold: true, sz: 10, color: { rgb: C.SLATE_800 }, name: 'Calibri' }, fill: bg, alignment: { horizontal: 'right', vertical: 'center' }, border: border('CBD5E1'), numFmt: '#,##0' });
        ws[enc(r, c0 + 3)] = mkCell('kg', { font: { sz: 9, color: { rgb: C.SLATE_600 }, name: 'Calibri' }, fill: bg, alignment: { horizontal: 'left', vertical: 'center' }, border: border('CBD5E1') });

      } else if (row.k === 'subhdr') {
        writeRow(['#', 'Product', 'Total kg', 'Batches'].map(h => mkCell(h, sSubHeader())));

      } else if (row.k === 'prod') {
        const shade = row.pos % 2 === 0;
        const batchText = row.sizes.map(b => `${b.kg.toLocaleString()}${b.full ? 'R' : ''}`).join(' / ');
        ws[enc(r, c0)]     = mkCell(row.pos, sSeq(shade));
        ws[enc(r, c0 + 1)] = mkCell(row.name, { ...sProduct(shade), font: { bold: true, color: { rgb: C.SLATE_800 }, sz: 9, name: 'Calibri' } });
        ws[enc(r, c0 + 2)] = mkCell(row.totalKg, sTotal(shade));
        ws[enc(r, c0 + 3)] = mkCell(batchText, { font: { bold: true, color: { rgb: C.INDIGO_600 }, sz: 8, name: 'Calibri' }, fill: { patternType: 'solid', fgColor: { rgb: shade ? C.INDIGO_50 : C.WHITE } }, alignment: { horizontal: 'left', vertical: 'center', wrapText: true }, border: border('E5E7EB') });

      } else if (row.k === 'clean') {
        ws[enc(r, c0)] = mkCell('⚠  CIP / Cleaning', sCleaning());
        for (let dc = 1; dc < DC; dc++) ws[enc(r, c0 + dc)] = mkCell('', sCleaning());
        merges.push({ s: { r, c: c0 }, e: { r, c: c0 + DC - 1 } });

      } else if (row.k === 'sub') {
        ws[enc(r, c0)]     = mkCell('TOTAL', sSubtotalLabel());
        ws[enc(r, c0 + 1)] = mkCell('', { fill: { patternType: 'solid', fgColor: { rgb: C.GREEN_100 } }, border: border('86EFAC', 'medium') });
        ws[enc(r, c0 + 2)] = mkCell(row.totalKg, sSubtotalValue());
        ws[enc(r, c0 + 3)] = mkCell('kg', { font: { bold: true, color: { rgb: C.GREEN_800 }, sz: 10 }, fill: { patternType: 'solid', fgColor: { rgb: C.GREEN_100 } }, border: border('86EFAC', 'medium'), alignment: { horizontal: 'left', vertical: 'center' } });

      } else { // empty
        for (let dc = 0; dc < DC; dc++) ws[enc(r, c0 + dc)] = mkCell('', { fill: { patternType: 'solid', fgColor: { rgb: 'FAFAFA' } }, border: border('F3F4F6') });
      }

      // Spacer column
      if (!isLast) ws[enc(r, c0 + DC)] = mkCell('', { fill: { patternType: 'solid', fgColor: { rgb: C.SLATE_100 } } });
    }
  }

  // Set blank row 2
  for (let c = 0; c <= totalSpan; c++) ws[enc(2, c)] = mkCell('', { fill: { patternType: 'solid', fgColor: { rgb: C.WHITE } } });

  ws['!ref']    = `A1:${col26(totalSpan)}${BASE + maxLen}`;
  ws['!merges'] = merges;
  ws['!rows']   = [{ hpt: 36 }, { hpt: 16 }, { hpt: 8 }];

  // Column widths: 4 data + 1 spacer per line
  const colWidths: { wch: number }[] = [];
  for (let li = 0; li < activeLines.length; li++) {
    colWidths.push({ wch: 5 }, { wch: 22 }, { wch: 10 }, { wch: 20 });
    if (li < activeLines.length - 1) colWidths.push({ wch: 2 });
  }
  ws['!cols'] = colWidths;

  return ws;
}

// ── Public API ─────────────────────────────────────────────────────────────
export async function downloadStyledExcel(
  lineMap: Record<string, BoardItem[]>,
  activeLines: string[],
  filename: string,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const XLSX = await import('xlsx-js-style') as any;
  const wb   = XLSX.utils.book_new();

  // ── Overview sheet first ──
  if (activeLines.filter(l => (lineMap[l] ?? []).length > 0).length > 0) {
    const filtered = activeLines.filter(l => (lineMap[l] ?? []).length > 0);
    const overviewWs = buildOverviewSheet(lineMap, filtered);
    XLSX.utils.book_append_sheet(wb, overviewWs, 'Production Board');
  }

  // ── One sheet per active line ──
  for (const line of activeLines) {
    const items = lineMap[line] ?? [];
    if (!items.length) continue;
    const sheetName = (LINE_LABEL[line] ?? line).slice(0, 31);
    XLSX.utils.book_append_sheet(wb, buildLineSheet(line, items), sheetName);
  }

  const raw  = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as number[];
  const blob = new Blob([new Uint8Array(raw)], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
