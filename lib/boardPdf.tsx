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

export type PdfMode = 'simple' | 'meat' | 'full';

export interface NonKettleItemForPdf {
  product: string;
  itemCode: string;
  line: string;
  quantity: number;
}

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
  return t;
}

function itemHasMeat(item: BoardItem): boolean {
  const sizes = parseBatchSizes(item.batchBreakdown, item.batches, item.quantity);
  return sizes.some(b => calculateMeat(item.itemCode, b.kg, recipesMap, subRecipesMap).length > 0);
}

// ── Styles ─────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  // ── Normal (simple / meat) page ──────────────────────────────────────────
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
  pageSubtitle: {
    fontSize: 8,
    fontFamily: 'Helvetica',
    color: '#94A3B8',
    marginTop: 2,
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
  // Non-kettle section styles
  nonKettleSection: {
    marginTop: 12,
    borderTopWidth: 2,
    borderTopColor: '#E2E8F0',
    borderTopStyle: 'solid',
    paddingTop: 8,
  },
  nonKettleTitle: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: '#374151',
    marginBottom: 6,
  },
  nonKettleTable: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderStyle: 'solid',
    borderRadius: 4,
    overflow: 'hidden',
  },
  nonKettleHeader: {
    flexDirection: 'row',
    backgroundColor: '#1E293B',
    paddingTop: 5,
    paddingBottom: 5,
    paddingLeft: 6,
    paddingRight: 6,
  },
  nonKettleHeaderCell: {
    fontSize: 6.5,
    fontFamily: 'Helvetica-Bold',
    color: '#94A3B8',
  },
  nonKettleRow: {
    flexDirection: 'row',
    paddingTop: 4,
    paddingBottom: 4,
    paddingLeft: 6,
    paddingRight: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    borderBottomStyle: 'solid',
  },
  nonKettleCell: {
    fontSize: 7,
    fontFamily: 'Helvetica',
    color: '#374151',
  },
  nonKettleCellBold: {
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    color: '#1E293B',
  },

  // ── Compact full-board (single-page) styles ───────────────────────────────
  pageFull: {
    flexDirection: 'column',
    backgroundColor: '#F8FAFC',
    paddingTop: 7,
    paddingBottom: 7,
    paddingLeft: 7,
    paddingRight: 7,
  },
  pageHeaderFull: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0F172A',
    borderRadius: 4,
    paddingTop: 5,
    paddingBottom: 5,
    paddingLeft: 10,
    paddingRight: 10,
    marginBottom: 5,
  },
  pageTitleFull: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: '#FFFFFF',
  },
  pageDateFull: {
    fontSize: 6,
    fontFamily: 'Helvetica',
    color: '#94A3B8',
  },
  columnsRowFull: {
    flexDirection: 'row',
    flex: 1,
    gap: 4,
  },
  columnFull: {
    flex: 1,
    flexDirection: 'column',
  },
  colHeaderFull: {
    backgroundColor: '#1E293B',
    borderRadius: 4,
    paddingTop: 4,
    paddingBottom: 4,
    paddingLeft: 6,
    paddingRight: 6,
    marginBottom: 3,
  },
  colTitleFull: {
    fontSize: 7.5,
    fontFamily: 'Helvetica-Bold',
    color: '#FFFFFF',
  },
  colStatsFull: {
    fontSize: 5,
    fontFamily: 'Helvetica',
    color: '#94A3B8',
    marginTop: 1,
  },
  colKgFull: {
    fontSize: 8.5,
    fontFamily: 'Helvetica-Bold',
    color: '#FFFFFF',
    marginTop: 2,
  },
  cardFull: {
    backgroundColor: '#FFFFFF',
    borderRadius: 3,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderStyle: 'solid',
    marginBottom: 2,
  },
  cipStripFull: {
    backgroundColor: '#FFFBEB',
    borderBottomWidth: 1,
    borderBottomColor: '#FDE68A',
    borderBottomStyle: 'solid',
    paddingTop: 2,
    paddingBottom: 2,
    paddingLeft: 5,
    paddingRight: 5,
    flexDirection: 'row',
    alignItems: 'center',
  },
  cipDotFull: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#F59E0B',
    marginRight: 4,
  },
  cipTextFull: {
    fontSize: 5,
    fontFamily: 'Helvetica-Bold',
    color: '#B45309',
  },
  cardBodyFull: {
    paddingTop: 3,
    paddingBottom: 3,
    paddingLeft: 4,
    paddingRight: 4,
  },
  titleRowFull: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 1,
  },
  posBadgeFull: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 3,
    flexShrink: 0,
  },
  posNumFull: {
    fontSize: 5,
    fontFamily: 'Helvetica-Bold',
    color: '#94A3B8',
  },
  productNameFull: {
    fontSize: 6.5,
    fontFamily: 'Helvetica-Bold',
    color: '#0F172A',
    flex: 1,
    lineHeight: 1.25,
  },
  totalKgFull: {
    fontSize: 5,
    fontFamily: 'Helvetica',
    color: '#475569',
    marginBottom: 2,
    marginLeft: 13,
  },
  batchBoxFull: {
    backgroundColor: '#EEF2FF',
    borderRadius: 2,
    paddingTop: 2,
    paddingBottom: 2,
    paddingLeft: 4,
    paddingRight: 4,
    marginBottom: 2,
    marginLeft: 13,
  },
  batchRowFull: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 1,
  },
  batchNumFull: {
    fontSize: 5,
    fontFamily: 'Helvetica-Bold',
    color: '#818CF8',
    width: 11,
  },
  batchKgFull: {
    fontSize: 6,
    fontFamily: 'Helvetica-Bold',
    color: '#4338CA',
    flex: 1,
  },
  meatRowFull: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 1,
    marginLeft: 11,
  },
  meatTypeFull: {
    fontSize: 6,
    width: 10,
    flexShrink: 0,
  },
  meatDescFull: {
    fontSize: 4.5,
    fontFamily: 'Helvetica',
    color: '#6B7280',
    flex: 1,
  },
  meatQtyFull: {
    fontSize: 5,
    fontFamily: 'Helvetica-Bold',
    color: '#374151',
    width: 28,
    textAlign: 'right',
  },
  allergenTimeFull: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 13,
    marginTop: 2,
  },
  allergenPillFull: {
    borderRadius: 8,
    paddingTop: 1,
    paddingBottom: 1,
    paddingLeft: 4,
    paddingRight: 4,
    marginRight: 5,
  },
  allergenTextFull: {
    fontSize: 5,
    fontFamily: 'Helvetica-Bold',
  },
  timeLabelFull: {
    fontSize: 5,
    fontFamily: 'Helvetica',
    color: '#94A3B8',
    marginRight: 2,
  },
  timeValueFull: {
    fontSize: 5.5,
    fontFamily: 'Helvetica-Bold',
    color: '#1E293B',
  },
  subtotalFull: {
    backgroundColor: '#DCFCE7',
    borderRadius: 3,
    borderWidth: 1,
    borderColor: '#86EFAC',
    borderStyle: 'solid',
    paddingTop: 3,
    paddingBottom: 3,
    paddingLeft: 5,
    paddingRight: 5,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 1,
  },
  subtotalLabelFull: {
    fontSize: 5.5,
    fontFamily: 'Helvetica-Bold',
    color: '#166534',
  },
  subtotalKgFull: {
    fontSize: 7.5,
    fontFamily: 'Helvetica-Bold',
    color: '#166534',
  },
});

// ── Simple Card (Mode 1) ───────────────────────────────────────────────────

function SimpleCardView({ item, position, hasCIP }: {
  item: BoardItem;
  position: number;
  hasCIP: boolean;
}) {
  const allergenKey = item.allergens[0] ?? 'ALLERGEN_FREE';
  const alg         = ALLERGEN_INFO[allergenKey] ?? ALLERGEN_INFO.ALLERGEN_FREE;

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

        <Text style={S.totalKg}>
          {item.quantity.toLocaleString()} kg total · {item.batches} batch{item.batches !== 1 ? 'es' : ''}
        </Text>

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

// ── Full Card (Mode 2 & 3) ─────────────────────────────────────────────────

function FullCardView({ item, position, hasCIP, showMeat }: {
  item: BoardItem;
  position: number;
  hasCIP: boolean;
  showMeat: boolean;
}) {
  const allergenKey = item.allergens[0] ?? 'ALLERGEN_FREE';
  const alg         = ALLERGEN_INFO[allergenKey] ?? ALLERGEN_INFO.ALLERGEN_FREE;
  const sizes       = parseBatchSizes(item.batchBreakdown, item.batches, item.quantity);

  const allBatchMeat = showMeat
    ? sizes.map(b => calculateMeat(item.itemCode, b.kg, recipesMap, subRecipesMap))
    : sizes.map(() => []);
  const hasMeat       = allBatchMeat.some(r => r.length > 0);
  const totalCardMeat = allBatchMeat.reduce(
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
                {showMeat && meatForBatch.map((m, mi) => (
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

        {showMeat && hasMeat && (
          <View style={S.meatTotalStrip}>
            <Text style={S.meatTotalLabel}>Total meat this card</Text>
            <Text style={S.meatTotalKg}>{totalCardMeat.toFixed(2)} kg</Text>
          </View>
        )}

        <View style={[S.allergenPill, { backgroundColor: alg.bg, marginTop: 5 }]}>
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

// ── Compact Full Card (single-page mode) ──────────────────────────────────

function CompactFullCard({ item, position, hasCIP }: {
  item: BoardItem;
  position: number;
  hasCIP: boolean;
}) {
  const allergenKey = item.allergens[0] ?? 'ALLERGEN_FREE';
  const alg         = ALLERGEN_INFO[allergenKey] ?? ALLERGEN_INFO.ALLERGEN_FREE;
  const sizes       = parseBatchSizes(item.batchBreakdown, item.batches, item.quantity);
  const allBatchMeat = sizes.map(b =>
    calculateMeat(item.itemCode, b.kg, recipesMap, subRecipesMap)
  );

  return (
    <View style={S.cardFull}>
      {hasCIP && (
        <View style={S.cipStripFull}>
          <View style={S.cipDotFull} />
          <Text style={S.cipTextFull}>CIP / CLEAN BEFORE THIS</Text>
        </View>
      )}
      <View style={S.cardBodyFull}>
        {/* Title */}
        <View style={S.titleRowFull}>
          <View style={S.posBadgeFull}>
            <Text style={S.posNumFull}>{position}</Text>
          </View>
          <Text style={S.productNameFull}>{item.product}</Text>
        </View>

        {/* Total */}
        <Text style={S.totalKgFull}>
          {item.quantity.toLocaleString()} kg · {item.batches} batch{item.batches !== 1 ? 'es' : ''}
        </Text>

        {/* Batch breakdown with per-batch meat */}
        <View style={S.batchBoxFull}>
          {sizes.map((b, i) => {
            const meat = allBatchMeat[i] ?? [];
            return (
              <View key={i}>
                <View style={S.batchRowFull}>
                  <Text style={S.batchNumFull}>*{i + 1}</Text>
                  <Text style={S.batchKgFull}>{b.kg.toLocaleString()} kg</Text>
                </View>
                {meat.map((m, mi) => (
                  <View key={mi} style={S.meatRowFull}>
                    <Text style={S.meatTypeFull}>{MEAT_ABBR[m.meat_type]}</Text>
                    <Text style={S.meatDescFull}>{m.ingredient_description}</Text>
                    <Text style={S.meatQtyFull}>{m.qty_kg.toFixed(2)} kg</Text>
                  </View>
                ))}
              </View>
            );
          })}
        </View>

        {/* Allergen + time on one row */}
        <View style={S.allergenTimeFull}>
          <View style={[S.allergenPillFull, { backgroundColor: alg.bg }]}>
            <Text style={[S.allergenTextFull, { color: alg.fg }]}>{alg.label}</Text>
          </View>
          {!!item.time && (
            <>
              <Text style={S.timeLabelFull}>Start:</Text>
              <Text style={S.timeValueFull}>{item.time}</Text>
            </>
          )}
        </View>
      </View>
    </View>
  );
}

// ── Column ─────────────────────────────────────────────────────────────────

function ColumnView({
  line, items, mode,
}: {
  line: string;
  items: BoardItem[];
  mode: PdfMode;
}) {
  // For 'meat' mode filter to only items that have meat
  const displayItems = mode === 'meat'
    ? items.filter(itemHasMeat)
    : items;

  if (displayItems.length === 0) return null;

  const label        = LINE_LABEL[line] ?? line;
  const totalKg      = displayItems.reduce((s, i) => s + i.quantity, 0);
  const totalBatches = displayItems.reduce((s, i) => s + i.batches, 0);

  const cleanBefore = new Set<string>();
  for (let i = 1; i < items.length; i++) {
    if (needsCleaning(items[i - 1], items[i])) cleanBefore.add(items[i].id);
  }

  return (
    <View style={S.column}>
      <View style={S.colHeader}>
        <Text style={S.colTitle}>{label}</Text>
        <Text style={S.colStats}>
          {displayItems.length} product{displayItems.length !== 1 ? 's' : ''} · {totalBatches} batch{totalBatches !== 1 ? 'es' : ''}
        </Text>
        <Text style={S.colKg}>{totalKg.toLocaleString()} kg</Text>
      </View>

      {displayItems.map((item, i) =>
        mode === 'simple' ? (
          <SimpleCardView
            key={item.id}
            item={item}
            position={i + 1}
            hasCIP={cleanBefore.has(item.id)}
          />
        ) : (
          <FullCardView
            key={item.id}
            item={item}
            position={i + 1}
            hasCIP={cleanBefore.has(item.id)}
            showMeat={mode === 'meat' || mode === 'full'}
          />
        )
      )}

      <View style={S.subtotal}>
        <Text style={S.subtotalLabel}>SUBTOTAL</Text>
        <Text style={S.subtotalKg}>{totalKg.toLocaleString()} kg</Text>
      </View>
    </View>
  );
}

// ── Non-Kettle Meat Section (Mode 2) ───────────────────────────────────────

function NonKettleMeatSection({ items }: { items: NonKettleItemForPdf[] }) {
  // Filter to only items with meat
  const meatItems = items.map(item => ({
    item,
    meatResults: calculateMeat(item.itemCode, item.quantity, recipesMap, subRecipesMap),
  })).filter(d => d.meatResults.length > 0);

  if (meatItems.length === 0) return null;

  const totalMeat = meatItems.reduce(
    (sum, d) => sum + d.meatResults.reduce((s, m) => s + m.qty_kg, 0), 0
  );

  return (
    <View style={S.nonKettleSection}>
      <Text style={S.nonKettleTitle}>Non-Kettle Items (Meat)</Text>
      <View style={S.nonKettleTable}>
        <View style={S.nonKettleHeader}>
          <Text style={[S.nonKettleHeaderCell, { flex: 3 }]}>Product</Text>
          <Text style={[S.nonKettleHeaderCell, { flex: 1.5 }]}>WIP Code</Text>
          <Text style={[S.nonKettleHeaderCell, { flex: 1 }]}>Line</Text>
          <Text style={[S.nonKettleHeaderCell, { flex: 1, textAlign: 'right' }]}>Qty (kg)</Text>
          <Text style={[S.nonKettleHeaderCell, { flex: 2.5 }]}>Meat Ingredient</Text>
          <Text style={[S.nonKettleHeaderCell, { flex: 1, textAlign: 'right' }]}>Meat (kg)</Text>
        </View>
        {meatItems.flatMap(({ item, meatResults }, idx) =>
          meatResults.map((m, mi) => (
            <View
              key={`${idx}-${mi}`}
              style={[S.nonKettleRow, { backgroundColor: idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC' }]}
            >
              {mi === 0 ? (
                <>
                  <Text style={[S.nonKettleCellBold, { flex: 3 }]}>{item.product}</Text>
                  <Text style={[S.nonKettleCell, { flex: 1.5 }]}>{item.itemCode || '—'}</Text>
                  <Text style={[S.nonKettleCell, { flex: 1 }]}>{item.line}</Text>
                  <Text style={[S.nonKettleCell, { flex: 1, textAlign: 'right' }]}>
                    {item.quantity.toLocaleString()}
                  </Text>
                </>
              ) : (
                <>
                  <Text style={[S.nonKettleCell, { flex: 3 }]} />
                  <Text style={[S.nonKettleCell, { flex: 1.5 }]} />
                  <Text style={[S.nonKettleCell, { flex: 1 }]} />
                  <Text style={[S.nonKettleCell, { flex: 1 }]} />
                </>
              )}
              <Text style={[S.nonKettleCell, { flex: 2.5 }]}>
                {MEAT_ABBR[m.meat_type]} {m.ingredient_description}
              </Text>
              <Text style={[S.nonKettleCellBold, { flex: 1, textAlign: 'right' }]}>
                {m.qty_kg.toFixed(2)}
              </Text>
            </View>
          ))
        )}
        <View style={[S.nonKettleRow, { backgroundColor: '#DCFCE7' }]}>
          <Text style={[S.nonKettleCellBold, { flex: 9, color: '#166534' }]}>Total meat (non-kettle)</Text>
          <Text style={[S.nonKettleCellBold, { flex: 1, textAlign: 'right', color: '#166534' }]}>
            {totalMeat.toFixed(2)}
          </Text>
        </View>
      </View>
    </View>
  );
}

// ── Compact column (full single-page mode) ─────────────────────────────────

function CompactColumnView({ line, items }: { line: string; items: BoardItem[] }) {
  if (items.length === 0) return null;

  const label        = LINE_LABEL[line] ?? line;
  const totalKg      = items.reduce((s, i) => s + i.quantity, 0);
  const totalBatches = items.reduce((s, i) => s + i.batches, 0);

  const cleanBefore = new Set<string>();
  for (let i = 1; i < items.length; i++) {
    if (needsCleaning(items[i - 1], items[i])) cleanBefore.add(items[i].id);
  }

  return (
    <View style={S.columnFull}>
      <View style={S.colHeaderFull}>
        <Text style={S.colTitleFull}>{label}</Text>
        <Text style={S.colStatsFull}>
          {items.length} products · {totalBatches} batches
        </Text>
        <Text style={S.colKgFull}>{totalKg.toLocaleString()} kg</Text>
      </View>
      {items.map((item, i) => (
        <CompactFullCard
          key={item.id}
          item={item}
          position={i + 1}
          hasCIP={cleanBefore.has(item.id)}
        />
      ))}
      <View style={S.subtotalFull}>
        <Text style={S.subtotalLabelFull}>SUBTOTAL</Text>
        <Text style={S.subtotalKgFull}>{totalKg.toLocaleString()} kg</Text>
      </View>
    </View>
  );
}

// ── Mode title helper ───────────────────────────────────────────────────────

function modeLabel(mode: PdfMode): string {
  if (mode === 'simple') return 'Summary View (Name · Time · Allergen · Batch)';
  if (mode === 'meat')   return 'Meat View (Meat items only + Non-Kettle meat)';
  return 'Full View (All details)';
}

// ── Document (exported) ────────────────────────────────────────────────────

export function BoardPdfDocument({
  lineMap,
  activeLines,
  mode = 'full',
  nonKettleItems,
}: {
  lineMap: Record<string, BoardItem[]>;
  activeLines: string[];
  mode?: PdfMode;
  nonKettleItems?: NonKettleItemForPdf[];
}) {
  const dateStr = new Date().toLocaleDateString('en-AU', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  // For 'meat' mode, only show columns that have meat items
  const visibleLines = mode === 'meat'
    ? activeLines.filter(l => (lineMap[l] ?? []).some(itemHasMeat))
    : activeLines;

  // ── Full mode: compact single-page layout ──
  if (mode === 'full') {
    return (
      <Document>
        <Page size="A3" orientation="landscape" style={S.pageFull}>
          <View style={S.pageHeaderFull}>
            <Text style={S.pageTitleFull}>PRODUCTION BOARD — Full View</Text>
            <Text style={S.pageDateFull}>Generated: {dateStr}</Text>
          </View>
          <View style={S.columnsRowFull}>
            {visibleLines.map(line => (
              <CompactColumnView
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

  // ── Simple / Meat modes: standard multi-page layout ──
  return (
    <Document>
      <Page size="A3" orientation="landscape" style={S.page}>
        <View style={S.pageHeader}>
          <View>
            <Text style={S.pageTitle}>PRODUCTION BOARD</Text>
            <Text style={S.pageSubtitle}>{modeLabel(mode)}</Text>
          </View>
          <Text style={S.pageDate}>Generated: {dateStr}</Text>
        </View>
        <View style={S.columnsRow}>
          {visibleLines.map(line => (
            <ColumnView
              key={line}
              line={line}
              items={lineMap[line] ?? []}
              mode={mode}
            />
          ))}
        </View>
        {mode === 'meat' && nonKettleItems && nonKettleItems.length > 0 && (
          <NonKettleMeatSection items={nonKettleItems} />
        )}
      </Page>
    </Document>
  );
}
