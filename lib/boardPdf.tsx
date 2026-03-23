/**
 * SERVER-ONLY: PDF document components for the Production Board.
 * Imported only by app/api/pdf/route.ts — never bundled on the client.
 */
import React from 'react';
import { Document, Page, View, Text, StyleSheet, Font } from '@react-pdf/renderer';
import type { BoardItem } from '@/types';
import { needsCleaning } from '@/lib/allergenRules';
import { calculateMeat, recipesMap, subRecipesMap } from '@/lib/meatCalculator';
import type { MeatType } from '@/lib/meatCalculator';

// ── Emoji support — register Twemoji so emoji glyphs render in the PDF ─────
Font.registerEmojiSource({
  format: 'png',
  url: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/',
});

// ── Static maps ────────────────────────────────────────────────────────────

const MEAT_ABBR: Record<MeatType, string> = {
  Beef:    '🐄',
  Chicken: '🐔',
  Lamb:    '🐑',
  Pork:    '🐷',
  Other:   '🥩',
};


const LINE_LABEL: Record<string, string> = {
  'KETTLE 1 SOUP':        'Kettle (K1)',
  'KETTLE 2 DIRECT FILL': 'Kettle (K2)',
  'KETTLE 3 DIRECT FILL': 'Kettle (K3)',
  'KETTLE 4 KAPCOLD':     'Kettle (K4)',
  'BLENDTECH':            'Blentech',
};

const ALLERGEN_INFO: Record<string, { label: string; bg: string; fg: string }> = {
  DAIRY:         { label: 'Dairy / Milk',   bg: '#FEE2E2', fg: '#991B1B' },
  FISH:          { label: 'Fish',           bg: '#FFEDD5', fg: '#9A3412' },
  SOY:           { label: 'Soy',            bg: '#F3E8FF', fg: '#6B21A8' },
  SULPHITE:      { label: 'Sulphite',       bg: '#F1F5F9', fg: '#374151' },
  WHEAT:         { label: 'Wheat / Gluten', bg: '#DBEAFE', fg: '#1E40AF' },
  ALLERGEN_FREE: { label: 'Allergen Free',  bg: '#DCFCE7', fg: '#166534' },
};

// ── Helpers ────────────────────────────────────────────────────────────────

function parseBatchSizes(breakdown: string, batches: number, qty: number): { kg: number }[] {
  const cleaned = breakdown.replace(/\s*\(→[\d,]+kg out\)/g, '');
  const matches  = [...cleaned.matchAll(/(\d+)×(\d+)/g)];
  if (matches.length > 0) {
    const out: { kg: number }[] = [];
    for (const m of matches) {
      const count = parseInt(m[2], 10);
      const kg    = parseInt(m[1], 10);
      if (!count || !kg) continue;
      for (let i = 0; i < count; i++) out.push({ kg });
    }
    return out;
  }
  const n = Math.max(batches, 1);
  return Array.from({ length: n }, () => ({ kg: Math.ceil(qty / n) }));
}

function fmtTime(t: string): string {
  if (!t) return '';
  return t; // stored as HH:MM in 24-hour format — display as-is
}

// ── Styles ─────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  page: {
    flexDirection: 'column',
    backgroundColor: '#F8FAFC',
    paddingTop: 14,
    paddingBottom: 14,
    paddingLeft: 14,
    paddingRight: 14,
  },
  pageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0F172A',
    borderRadius: 6,
    paddingTop: 10,
    paddingBottom: 10,
    paddingLeft: 14,
    paddingRight: 14,
    marginBottom: 10,
  },
  pageTitle: {
    fontSize: 15,
    fontFamily: 'Helvetica-Bold',
    color: '#FFFFFF',
  },
  pageDate: {
    fontSize: 8,
    fontFamily: 'Helvetica',
    color: '#94A3B8',
  },
  columnsRow: {
    flexDirection: 'row',
    flex: 1,
    gap: 5,
  },
  column: {
    flex: 1,
    flexDirection: 'column',
  },
  colHeader: {
    backgroundColor: '#1E293B',
    borderRadius: 5,
    paddingTop: 8,
    paddingBottom: 8,
    paddingLeft: 9,
    paddingRight: 9,
    marginBottom: 5,
  },
  colTitle: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: '#FFFFFF',
  },
  colStats: {
    fontSize: 6.5,
    fontFamily: 'Helvetica',
    color: '#94A3B8',
    marginTop: 2,
  },
  colKg: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    color: '#FFFFFF',
    marginTop: 3,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderStyle: 'solid',
    marginBottom: 4,
  },
  cipStrip: {
    backgroundColor: '#FFFBEB',
    borderBottomWidth: 1,
    borderBottomColor: '#FDE68A',
    borderBottomStyle: 'solid',
    paddingTop: 4,
    paddingBottom: 4,
    paddingLeft: 7,
    paddingRight: 7,
    flexDirection: 'row',
    alignItems: 'center',
  },
  cipDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#F59E0B',
    marginRight: 5,
  },
  cipText: {
    fontSize: 6.5,
    fontFamily: 'Helvetica-Bold',
    color: '#B45309',
  },
  cardBody: {
    paddingTop: 6,
    paddingBottom: 6,
    paddingLeft: 7,
    paddingRight: 7,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 3,
  },
  posBadge: {
    width: 13,
    height: 13,
    borderRadius: 6.5,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
    flexShrink: 0,
    marginTop: 1,
  },
  posNum: {
    fontSize: 6.5,
    fontFamily: 'Helvetica-Bold',
    color: '#94A3B8',
  },
  productName: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: '#0F172A',
    flex: 1,
    lineHeight: 1.35,
  },
  totalKg: {
    fontSize: 7.5,
    fontFamily: 'Helvetica-Bold',
    color: '#475569',
    marginBottom: 4,
  },
  batchBox: {
    backgroundColor: '#EEF2FF',
    borderRadius: 4,
    paddingTop: 4,
    paddingBottom: 4,
    paddingLeft: 6,
    paddingRight: 6,
    marginBottom: 5,
  },
  batchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  batchRowLast: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  batchNum: {
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    color: '#818CF8',
    width: 14,
  },
  batchKg: {
    fontSize: 8.5,
    fontFamily: 'Helvetica-Bold',
    color: '#4338CA',
  },
  meatRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 2,
  },
  meatType: {
    fontSize: 8,
    width: 14,
    flexShrink: 0,
  },
  meatDesc: {
    fontSize: 5.5,
    fontFamily: 'Helvetica',
    color: '#6B7280',
    flex: 1,
  },
  meatQty: {
    fontSize: 5.5,
    fontFamily: 'Helvetica-Bold',
    color: '#374151',
    width: 34,
    textAlign: 'right',
  },
  meatTotalStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderRadius: 3,
    paddingTop: 3,
    paddingBottom: 3,
    paddingLeft: 5,
    paddingRight: 5,
    marginTop: 3,
  },
  meatTotalLabel: {
    fontSize: 6,
    fontFamily: 'Helvetica-Bold',
    color: '#9F1239',
  },
  meatTotalKg: {
    fontSize: 6.5,
    fontFamily: 'Helvetica-Bold',
    color: '#9F1239',
  },
  allergenPill: {
    borderRadius: 20,
    paddingTop: 2,
    paddingBottom: 2,
    paddingLeft: 6,
    paddingRight: 6,
    alignSelf: 'flex-start',
    marginBottom: 4,
  },
  allergenText: {
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timeLabel: {
    fontSize: 7,
    fontFamily: 'Helvetica',
    color: '#94A3B8',
    marginRight: 3,
  },
  timeValue: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: '#1E293B',
  },
  subtotal: {
    backgroundColor: '#DCFCE7',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#86EFAC',
    borderStyle: 'solid',
    paddingTop: 6,
    paddingBottom: 6,
    paddingLeft: 8,
    paddingRight: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
  },
  subtotalLabel: {
    fontSize: 7.5,
    fontFamily: 'Helvetica-Bold',
    color: '#166534',
  },
  subtotalKg: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: '#166534',
  },
});

// ── Card ───────────────────────────────────────────────────────────────────

function CardView({ item, position, hasCIP }: {
  item: BoardItem;
  position: number;
  hasCIP: boolean;
}) {
  const allergenKey = item.allergens[0] ?? 'ALLERGEN_FREE';
  const alg         = ALLERGEN_INFO[allergenKey] ?? ALLERGEN_INFO.ALLERGEN_FREE;
  const sizes       = parseBatchSizes(item.batchBreakdown, item.batches, item.quantity);

  // Per-batch meat calculations
  const allBatchMeat = sizes.map(b =>
    calculateMeat(item.itemCode, b.kg, recipesMap, subRecipesMap)
  );
  const hasMeat        = allBatchMeat.some(r => r.length > 0);
  const totalCardMeat  = allBatchMeat.reduce(
    (sum, results) => sum + results.reduce((s, r) => s + r.qty_kg, 0), 0
  );

  return (
    <View style={S.card}>
      {hasCIP && (
        <View style={S.cipStrip}>
          <View style={S.cipDot} />
          <Text style={S.cipText}>CIP / CLEAN BEFORE THIS</Text>
        </View>
      )}
      <View style={S.cardBody}>
        <View style={S.titleRow}>
          <View style={S.posBadge}>
            <Text style={S.posNum}>{position}</Text>
          </View>
          <Text style={S.productName}>{item.product}</Text>
        </View>

        <Text style={S.totalKg}>{item.quantity.toLocaleString()} kg total</Text>

        <View style={S.batchBox}>
          {sizes.map((b, i) => {
            const meatForBatch = allBatchMeat[i] ?? [];
            return (
              <View key={i}>
                <View style={i === sizes.length - 1 ? S.batchRowLast : S.batchRow}>
                  <Text style={S.batchNum}>*{i + 1}</Text>
                  <Text style={S.batchKg}>{b.kg.toLocaleString()} kg</Text>
                </View>
                {meatForBatch.map((m, mi) => (
                  <View key={mi} style={S.meatRow}>
                    <Text style={S.meatType}>{MEAT_ABBR[m.meat_type]}</Text>
                    <Text style={S.meatDesc}>{m.ingredient_description}</Text>
                    <Text style={S.meatQty}>{m.qty_kg.toFixed(2)} kg</Text>
                  </View>
                ))}
              </View>
            );
          })}
        </View>

        {hasMeat && (
          <View style={S.meatTotalStrip}>
            <Text style={S.meatTotalLabel}>Total meat this card</Text>
            <Text style={S.meatTotalKg}>{totalCardMeat.toFixed(2)} kg</Text>
          </View>
        )}

        <View style={[S.allergenPill, { backgroundColor: alg.bg }]}>
          <Text style={[S.allergenText, { color: alg.fg }]}>{alg.label}</Text>
        </View>

        {!!item.time && (
          <View style={S.timeRow}>
            <Text style={S.timeLabel}>Start:</Text>
            <Text style={S.timeValue}>{fmtTime(item.time)}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

// ── Column ─────────────────────────────────────────────────────────────────

function ColumnView({ line, items }: { line: string; items: BoardItem[] }) {
  const label        = LINE_LABEL[line] ?? line;
  const totalKg      = items.reduce((s, i) => s + i.quantity, 0);
  const totalBatches = items.reduce((s, i) => s + i.batches, 0);

  const cleanBefore = new Set<string>();
  for (let i = 1; i < items.length; i++) {
    if (needsCleaning(items[i - 1], items[i])) cleanBefore.add(items[i].id);
  }

  return (
    <View style={S.column}>
      <View style={S.colHeader}>
        <Text style={S.colTitle}>{label}</Text>
        <Text style={S.colStats}>
          {items.length} product{items.length !== 1 ? 's' : ''} · {totalBatches} batch{totalBatches !== 1 ? 'es' : ''}
        </Text>
        <Text style={S.colKg}>{totalKg.toLocaleString()} kg</Text>
      </View>

      {items.map((item, i) => (
        <CardView
          key={item.id}
          item={item}
          position={i + 1}
          hasCIP={cleanBefore.has(item.id)}
        />
      ))}

      <View style={S.subtotal}>
        <Text style={S.subtotalLabel}>SUBTOTAL</Text>
        <Text style={S.subtotalKg}>{totalKg.toLocaleString()} kg</Text>
      </View>
    </View>
  );
}

// ── Document (exported) ────────────────────────────────────────────────────

export function BoardPdfDocument({ lineMap, activeLines }: {
  lineMap: Record<string, BoardItem[]>;
  activeLines: string[];
}) {
  const dateStr = new Date().toLocaleDateString('en-AU', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  return (
    <Document>
      <Page size="A3" orientation="landscape" style={S.page}>
        <View style={S.pageHeader}>
          <Text style={S.pageTitle}>PRODUCTION BOARD</Text>
          <Text style={S.pageDate}>Generated: {dateStr}</Text>
        </View>
        <View style={S.columnsRow}>
          {activeLines.map(line => (
            <ColumnView
              key={line}
              line={line}
              items={lineMap[line] ?? []}
            />
          ))}
        </View>
      </Page>
    </Document>
  );
}
