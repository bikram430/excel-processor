/**
 * Vibrant styled Excel export for the Production Board.
 * Uses xlsx-js-style for full cell formatting (colours, fonts, borders).
 */

import { BoardItem } from '@/types';
import { insertCleaningSteps, ALLERGEN_OPTIONS } from './allergenRules';

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
  GRAY_400:   '9CA3AF',
  GRAY_700:   '374151',
};

// ── Allergen colours matching the website (dairy/eggs=red, fish=orange, etc.)
const ALLERGEN_EXCEL: Record<string, { bg: string; fg: string; label: string }> = {
  DAIRY:         { bg: 'FEE2E2', fg: '991B1B', label: 'Dairy/Milk'   },
  FISH:          { bg: 'FFEDD5', fg: '9A3412', label: 'Fish'          },
  SOY:           { bg: 'F3E8FF', fg: '6B21A8', label: 'Soy'           },
  SULPHITE:      { bg: 'F9FAFB', fg: '374151', label: 'Sulphite'      },
  WHEAT:         { bg: 'DBEAFE', fg: '1E40AF', label: 'Wheat/Gluten'  },
  ALLERGEN_FREE: { bg: 'DCFCE7', fg: '166534', label: 'Allergen Free' },
};

const LINE_LABEL: Record<string, string> = {
  'KETTLE 1 SOUP':        'Kettle (K1)',
  'KETTLE 2 DIRECT FILL': 'Kettle (K2)',
  'KETTLE 3 DIRECT FILL': 'Kettle (K3)',
  'KETTLE 4 KAPCOLD':     'Kettle (K4)',
  'BLENDTECH':            'Blentech',
};

// ── Small helpers ──────────────────────────────────────────────────────────

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
  return s
    ? { v, t: typeof v === 'number' ? 'n' : 's', s }
    : { v, t: typeof v === 'number' ? 'n' : 's' };
}

function parseBatchSizes(
  breakdown: string,
  batches: number,
  qty: number,
): { kg: number }[] {
  const cleaned = breakdown.replace(/\s*\(→[\d,]+kg out\)/g, '');
  const matches  = [...cleaned.matchAll(/(\d+)×(\d+)/g)];
  if (matches.length > 0) {
    const out: { kg: number }[] = [];
    for (const m of matches) {
      const kg = parseInt(m[1]);
      const n  = parseInt(m[2]);
      for (let i = 0; i < n; i++) out.push({ kg });
    }
    return out;
  }
  const n = Math.max(batches, 1);
  return Array.from({ length: n }, () => ({ kg: Math.ceil(qty / n) }));
}

function allergenDisplay(allergens: string[]): { label: string; bg: string; fg: string } {
  const key = allergens[0] ?? 'ALLERGEN_FREE';
  return ALLERGEN_EXCEL[key] ?? ALLERGEN_EXCEL.ALLERGEN_FREE;
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

/** Batch number cell — styled as *N */
function sBatchNum(shade: boolean) {
  return {
    font: { bold: true, color: { rgb: C.INDIGO_700 }, sz: 9, name: 'Calibri' },
    fill: { patternType: 'solid', fgColor: { rgb: shade ? C.INDIGO_50 : C.WHITE } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: border(C.INDIGO_100),
  };
}

function sBatchKg() {
  return {
    font: { bold: true, color: { rgb: C.WHITE }, sz: 10, name: 'Calibri' },
    fill: { patternType: 'solid', fgColor: { rgb: C.INDIGO_600 } },
    alignment: { horizontal: 'right', vertical: 'center' },
    border: border(C.INDIGO_700),
    numFmt: '#,##0',
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
  const a = allergenDisplay(allergens);
  return {
    font: { bold: true, color: { rgb: a.fg }, sz: 9, name: 'Calibri' },
    fill: { patternType: 'solid', fgColor: { rgb: a.bg } },
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
  const ws: any  = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const merges: any[] = [];

  // Columns: # | Product | Total kg | *Batch | Size (kg) | Start | Allergen
  //            0    1         2          3         4          5        6
  const W = { SEQ: 0, PROD: 1, TOTAL: 2, BNUM: 3, BKG: 4, TIME: 5, ALG: 6, NCOLS: 7 };

  let row  = 0;
  const label = LINE_LABEL[line] ?? line;

  // ── Header (line name only, no max cap) ──
  ws[enc(row, 0)] = mkCell(label, sHeader());
  for (let c = 1; c < W.NCOLS; c++) ws[enc(row, c)] = mkCell('', sHeader());
  merges.push({ s: { r: row, c: 0 }, e: { r: row, c: W.NCOLS - 1 } });
  row++;

  // ── Stats row ──
  const totalKg      = items.reduce((s, i) => s + i.quantity, 0);
  const totalBatches = items.reduce((s, i) => s + i.batches, 0);
  const statSt = {
    font:      { color: { rgb: C.SLATE_600 }, sz: 10, name: 'Calibri' },
    fill:      { patternType: 'solid', fgColor: { rgb: C.SLATE_200 } },
    alignment: { horizontal: 'left', vertical: 'center' },
    border:    border('CBD5E1'),
  };
  ws[enc(row, 0)] = mkCell(
    `${items.length} product${items.length !== 1 ? 's' : ''}   ·   ${totalBatches} batch${totalBatches !== 1 ? 'es' : ''}   ·   ${totalKg.toLocaleString()} kg total`,
    statSt,
  );
  for (let c = 1; c < W.NCOLS; c++) ws[enc(row, c)] = mkCell('', { fill: { patternType: 'solid', fgColor: { rgb: C.SLATE_200 } }, border: border('CBD5E1') });
  merges.push({ s: { r: row, c: 0 }, e: { r: row, c: W.NCOLS - 1 } });
  row++;

  // ── Column sub-headers ──
  ['#', 'Product Name', 'Total (kg)', '* Batch', 'Size (kg)', 'Start', 'Allergen'].forEach(
    (h, c) => { ws[enc(row, c)] = mkCell(h, sSubHeader()); },
  );
  row++;

  // ── Products ──
  let pos = 0;
  let lastWasCleaning = false;
  const rowBreaks: { r: number }[] = [];

  for (const entry of insertCleaningSteps(items)) {
    if (entry.type === 'cleaning') {
      // Break before the CIP banner so it lands at the top of the next page
      // (together with the product that follows it)
      if (pos > 0) rowBreaks.push({ r: row - 1 });
      ws[enc(row, 0)] = mkCell('⚠   CIP / Cleaning Required Before Next Product', sCleaning());
      for (let c = 1; c < W.NCOLS; c++) ws[enc(row, c)] = mkCell('', sCleaning());
      merges.push({ s: { r: row, c: 0 }, e: { r: row, c: W.NCOLS - 1 } });
      row++;
      lastWasCleaning = true;
      continue;
    }

    const item  = entry as BoardItem;
    pos++;
    // If no preceding CIP, still break between products to keep batches together
    if (pos > 1 && !lastWasCleaning) rowBreaks.push({ r: row - 1 });
    lastWasCleaning = false;
    const shade = pos % 2 === 0;
    const sizes = parseBatchSizes(item.batchBreakdown, item.batches, item.quantity);
    const algDisp = allergenDisplay(item.allergens);

    // First row: product info + first batch
    ws[enc(row, W.SEQ)]   = mkCell(pos, sSeq(shade));
    ws[enc(row, W.PROD)]  = mkCell(item.product, sProduct(shade));
    ws[enc(row, W.TOTAL)] = mkCell(item.quantity, sTotal(shade));
    ws[enc(row, W.BNUM)]  = mkCell(`*1`, sBatchNum(shade));
    ws[enc(row, W.BKG)]   = sizes[0] ? mkCell(sizes[0].kg, sBatchKg()) : mkCell('', sEmpty(shade));
    ws[enc(row, W.TIME)]  = mkCell(item.time || '—', { font: { color: { rgb: C.GRAY_700 }, sz: 9, name: 'Calibri' }, fill: { patternType: 'solid', fgColor: { rgb: shade ? C.GRAY_50 : C.WHITE } }, alignment: { horizontal: 'center', vertical: 'center' }, border: border('E5E7EB') });
    ws[enc(row, W.ALG)]   = mkCell(algDisp.label, sAllergen(item.allergens));
    row++;

    // Additional batch rows
    for (let bi = 1; bi < sizes.length; bi++) {
      ws[enc(row, W.SEQ)]   = mkCell('', sEmpty(shade));
      ws[enc(row, W.PROD)]  = mkCell('', sEmpty(shade));
      ws[enc(row, W.TOTAL)] = mkCell('', sEmpty(shade));
      ws[enc(row, W.BNUM)]  = mkCell(`*${bi + 1}`, sBatchNum(shade));
      ws[enc(row, W.BKG)]   = mkCell(sizes[bi].kg, sBatchKg());
      ws[enc(row, W.TIME)]  = mkCell('', sEmpty(shade));
      ws[enc(row, W.ALG)]   = mkCell('', { fill: { patternType: 'solid', fgColor: { rgb: algDisp.bg } }, border: border('E5E7EB') });
      row++;
    }
  }

  // ── Subtotal ──
  ws[enc(row, 0)]       = mkCell('SUBTOTAL', sSubtotalLabel());
  ws[enc(row, W.PROD)]  = mkCell('', sSubtotalLabel());
  ws[enc(row, W.TOTAL)] = mkCell(totalKg, sSubtotalValue());
  for (let c = W.TOTAL + 1; c < W.NCOLS; c++) {
    ws[enc(row, c)] = mkCell('', { fill: { patternType: 'solid', fgColor: { rgb: C.GREEN_100 } }, border: border('86EFAC', 'medium') });
  }
  merges.push({ s: { r: row, c: 0 }, e: { r: row, c: W.PROD } });
  row++;

  ws['!ref']    = `A1:${col26(W.NCOLS - 1)}${row}`;
  ws['!merges'] = merges;
  ws['!cols']   = [
    { wch: 5  },  // #
    { wch: 30 },  // Product
    { wch: 12 },  // Total kg
    { wch: 8  },  // *Batch
    { wch: 12 },  // Size kg
    { wch: 10 },  // Start
    { wch: 16 },  // Allergen
  ];
  ws['!rows'] = [{ hpt: 28 }, { hpt: 20 }, { hpt: 18 }];

  // ── Print / page setup ──
  // A3 landscape, fit to one page wide; manual breaks keep every product's
  // batch rows together, and print_titles repeats the kettle header on each page.
  ws['!pageSetup'] = {
    paperSize:   8,            // 8 = A3
    orientation: 'landscape',
    fitToPage:   true,
    fitToWidth:  1,            // fit all columns on one page wide
    fitToHeight: 0,            // unlimited pages tall
  };
  ws['!margins']   = { left: 0.5, right: 0.5, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 };
  ws['!rowBreaks'] = rowBreaks;

  return ws;
}

// ── Build overview sheet (whiteboard side-by-side) ────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildOverviewSheet(lineMap: Record<string, BoardItem[]>, activeLines: string[]): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ws: any     = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const merges: any[] = [];

  const DC = 5;  // data cols per line: # | Product | Total kg | * Batches | Start
  const SC = 1;  // spacer col between lines
  const totalSpan = activeLines.length * (DC + SC) - SC;

  // ── Title ──
  ws[enc(0, 0)] = mkCell('PRODUCTION BOARD', sHeader(C.SLATE_900, C.WHITE, 16));
  for (let c = 1; c <= totalSpan; c++) ws[enc(0, c)] = mkCell('', { fill: { patternType: 'solid', fgColor: { rgb: C.SLATE_900 } }, border: border(C.SLATE_800) });
  merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: totalSpan } });

  // ── Date ──
  const dateStr = new Date().toLocaleDateString('en-AU', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const dateSt  = { font: { italic: true, color: { rgb: C.SLATE_600 }, sz: 9, name: 'Calibri' }, fill: { patternType: 'solid', fgColor: { rgb: C.SLATE_100 } }, alignment: { horizontal: 'center', vertical: 'center' } };
  ws[enc(1, 0)] = mkCell(`Generated: ${dateStr}`, dateSt);
  for (let c = 1; c <= totalSpan; c++) ws[enc(1, c)] = mkCell('', dateSt);
  merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: totalSpan } });

  const BASE = 3;

  // ── Per-line row lists ──
  type LRow =
    | { k: 'hdr' }
    | { k: 'stat'; prods: number; batches: number; totalKg: number }
    | { k: 'subhdr' }
    | { k: 'prod'; pos: number; name: string; totalKg: number; sizes: { kg: number }[]; allergens: string[]; time: string }
    | { k: 'clean' }
    | { k: 'sub'; totalKg: number }
    | { k: 'empty' };

  const lineLists: LRow[][] = activeLines.map(line => {
    const items = lineMap[line] ?? [];
    const rows: LRow[] = [
      { k: 'hdr' },
      { k: 'stat', prods: items.length, batches: items.reduce((s, i) => s + i.batches, 0), totalKg: items.reduce((s, i) => s + i.quantity, 0) },
      { k: 'subhdr' },
    ];
    let pos = 0;
    for (const entry of insertCleaningSteps(items)) {
      if (entry.type === 'cleaning') { rows.push({ k: 'clean' }); continue; }
      const item = entry as BoardItem;
      pos++;
      rows.push({ k: 'prod', pos, name: item.product, totalKg: item.quantity, sizes: parseBatchSizes(item.batchBreakdown, item.batches, item.quantity), allergens: item.allergens, time: item.time });
    }
    rows.push({ k: 'sub', totalKg: items.reduce((s, i) => s + i.quantity, 0) });
    return rows;
  });

  const maxLen = lineLists.length > 0 ? Math.max(...lineLists.map(l => l.length)) : 0;
  for (const lst of lineLists) {
    while (lst.length < maxLen) lst.push({ k: 'empty' });
  }

  // ── Write columns ──
  for (let li = 0; li < activeLines.length; li++) {
    const line     = activeLines[li];
    const c0       = li * (DC + SC);
    const rows     = lineLists[li];
    const isLast   = li === activeLines.length - 1;

    for (let ri = 0; ri < rows.length; ri++) {
      const r   = BASE + ri;
      const row = rows[ri];

      if (row.k === 'hdr') {
        // Line name only — no max cap
        ws[enc(r, c0)] = mkCell(LINE_LABEL[line] ?? line, sHeader());
        for (let dc = 1; dc < DC; dc++) ws[enc(r, c0 + dc)] = mkCell('', sHeader());
        merges.push({ s: { r, c: c0 }, e: { r, c: c0 + DC - 1 } });

      } else if (row.k === 'stat') {
        const bg = { patternType: 'solid', fgColor: { rgb: C.SLATE_200 } };
        ws[enc(r, c0)]     = mkCell(`${row.prods} prods · ${row.batches} batches`, { font: { sz: 9, color: { rgb: C.SLATE_600 }, name: 'Calibri' }, fill: bg, alignment: { horizontal: 'left', vertical: 'center' }, border: border('CBD5E1') });
        ws[enc(r, c0 + 1)] = mkCell('', { fill: bg, border: border('CBD5E1') });
        ws[enc(r, c0 + 2)] = mkCell(row.totalKg, { font: { bold: true, sz: 10, color: { rgb: C.SLATE_800 }, name: 'Calibri' }, fill: bg, alignment: { horizontal: 'right', vertical: 'center' }, border: border('CBD5E1'), numFmt: '#,##0' });
        ws[enc(r, c0 + 3)] = mkCell('kg', { font: { sz: 9, color: { rgb: C.SLATE_600 }, name: 'Calibri' }, fill: bg, alignment: { horizontal: 'left', vertical: 'center' }, border: border('CBD5E1') });
        ws[enc(r, c0 + 4)] = mkCell('', { fill: bg, border: border('CBD5E1') });

      } else if (row.k === 'subhdr') {
        ['#', 'Product', 'Total kg', '* Batches', 'Start'].forEach((h, dc) => {
          ws[enc(r, c0 + dc)] = mkCell(h, sSubHeader());
        });

      } else if (row.k === 'prod') {
        const shade = row.pos % 2 === 0;
        // Batch sizes as *1=1900 / *2=1900 / *3=950 format
        const batchText = row.sizes.map((b, i) => `*${i + 1} = ${b.kg.toLocaleString()}`).join(' / ');
        const algDisp   = allergenDisplay(row.allergens);
        ws[enc(r, c0)]     = mkCell(row.pos, sSeq(shade));
        ws[enc(r, c0 + 1)] = mkCell(row.name, { ...sProduct(shade), font: { bold: true, color: { rgb: C.SLATE_800 }, sz: 9, name: 'Calibri' } });
        ws[enc(r, c0 + 2)] = mkCell(row.totalKg, sTotal(shade));
        ws[enc(r, c0 + 3)] = mkCell(batchText, {
          font:      { bold: true, color: { rgb: algDisp.fg }, sz: 8, name: 'Calibri' },
          fill:      { patternType: 'solid', fgColor: { rgb: algDisp.bg } },
          alignment: { horizontal: 'left', vertical: 'center', wrapText: true },
          border:    border('E5E7EB'),
        });
        ws[enc(r, c0 + 4)] = mkCell(row.time || '—', {
          font:      { color: { rgb: C.GRAY_700 }, sz: 9, name: 'Calibri' },
          fill:      { patternType: 'solid', fgColor: { rgb: shade ? C.GRAY_50 : C.WHITE } },
          alignment: { horizontal: 'center', vertical: 'center' },
          border:    border('E5E7EB'),
        });

      } else if (row.k === 'clean') {
        ws[enc(r, c0)] = mkCell('⚠  CIP / Cleaning', sCleaning());
        for (let dc = 1; dc < DC; dc++) ws[enc(r, c0 + dc)] = mkCell('', sCleaning());
        merges.push({ s: { r, c: c0 }, e: { r, c: c0 + DC - 1 } });

      } else if (row.k === 'sub') {
        ws[enc(r, c0)]     = mkCell('TOTAL', sSubtotalLabel());
        ws[enc(r, c0 + 1)] = mkCell('', { fill: { patternType: 'solid', fgColor: { rgb: C.GREEN_100 } }, border: border('86EFAC', 'medium') });
        ws[enc(r, c0 + 2)] = mkCell(row.totalKg, sSubtotalValue());
        ws[enc(r, c0 + 3)] = mkCell('kg', { font: { bold: true, color: { rgb: C.GREEN_800 }, sz: 10 }, fill: { patternType: 'solid', fgColor: { rgb: C.GREEN_100 } }, border: border('86EFAC', 'medium'), alignment: { horizontal: 'left', vertical: 'center' } });
        ws[enc(r, c0 + 4)] = mkCell('', { fill: { patternType: 'solid', fgColor: { rgb: C.GREEN_100 } }, border: border('86EFAC', 'medium') });

      } else { // empty
        for (let dc = 0; dc < DC; dc++) ws[enc(r, c0 + dc)] = mkCell('', { fill: { patternType: 'solid', fgColor: { rgb: 'FAFAFA' } }, border: border('F3F4F6') });
      }

      // Spacer column
      if (!isLast) ws[enc(r, c0 + DC)] = mkCell('', { fill: { patternType: 'solid', fgColor: { rgb: C.SLATE_100 } } });
    }
  }

  // Blank gap row
  for (let c = 0; c <= totalSpan; c++) ws[enc(2, c)] = mkCell('', { fill: { patternType: 'solid', fgColor: { rgb: C.WHITE } } });

  ws['!ref']    = `A1:${col26(totalSpan)}${BASE + maxLen}`;
  ws['!merges'] = merges;
  ws['!rows']   = [{ hpt: 36 }, { hpt: 16 }, { hpt: 8 }];

  const colWidths: { wch: number }[] = [];
  for (let li = 0; li < activeLines.length; li++) {
    colWidths.push({ wch: 5 }, { wch: 22 }, { wch: 10 }, { wch: 28 }, { wch: 10 });
    if (li < activeLines.length - 1) colWidths.push({ wch: 2 });
  }
  ws['!cols'] = colWidths;

  // A3 landscape — try to fit all lines side-by-side on one page wide
  ws['!pageSetup'] = {
    paperSize:   8,
    orientation: 'landscape',
    fitToPage:   true,
    fitToWidth:  1,
    fitToHeight: 0,
  };
  ws['!margins'] = { left: 0.5, right: 0.5, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 };

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

  const active = activeLines.filter(l => (lineMap[l] ?? []).length > 0);

  // Ensure workbook Names array exists (used for print-title repeat rows)
  if (!wb.Workbook)       wb.Workbook = {};
  if (!wb.Workbook.Names) wb.Workbook.Names = [];

  // Overview first
  if (active.length > 0) {
    XLSX.utils.book_append_sheet(wb, buildOverviewSheet(lineMap, active), 'Production Board');
    // Repeat the title + date rows on every printed page of the overview
    wb.Workbook.Names.push({
      Name:  '_xlnm.Print_Titles',
      Ref:   `'Production Board'!$1:$2`,
      Sheet: wb.SheetNames.indexOf('Production Board'),
    });
  }

  // Detailed sheet per line
  for (const line of active) {
    const sheetName = (LINE_LABEL[line] ?? line).slice(0, 31);
    XLSX.utils.book_append_sheet(wb, buildLineSheet(line, lineMap[line]), sheetName);
    // Repeat the kettle header + stats + column-header rows on every printed page
    wb.Workbook.Names.push({
      Name:  '_xlnm.Print_Titles',
      Ref:   `'${sheetName}'!$1:$3`,
      Sheet: wb.SheetNames.indexOf(sheetName),
    });
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

// Re-export allergen options so other modules can use them
export { ALLERGEN_OPTIONS };
