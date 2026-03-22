/**
 * PDF export for the Production Board.
 * Uses @react-pdf/renderer for vector, text-selectable output.
 * The entire build happens inside a dynamic import so SSR is never touched.
 */

import { BoardItem } from '@/types';
import { needsCleaning } from '@/lib/allergenRules';

// ── Static data (no react-pdf types needed here) ──────────────────────────

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

function parseBatchSizes(breakdown: string, batches: number, qty: number): { kg: number }[] {
  const cleaned = breakdown.replace(/\s*\(→[\d,]+kg out\)/g, '');
  const matches  = [...cleaned.matchAll(/(\d+)×(\d+)/g)];
  if (matches.length > 0) {
    const out: { kg: number }[] = [];
    for (const m of matches) {
      const count = parseInt(m[2]);
      const kg    = parseInt(m[1]);
      for (let i = 0; i < count; i++) out.push({ kg });
    }
    return out;
  }
  const n = Math.max(batches, 1);
  return Array.from({ length: n }, () => ({ kg: Math.ceil(qty / n) }));
}

function fmt12h(t: string): string {
  if (!t) return '';
  const [h, m] = t.split(':');
  const hour = parseInt(h);
  return `${hour % 12 || 12}:${m} ${hour >= 12 ? 'PM' : 'AM'}`;
}

// ── Main export ───────────────────────────────────────────────────────────

export async function downloadBoardPDF(
  lineMap: Record<string, BoardItem[]>,
  activeLines: string[],
  filename: string,
) {
  // Dynamic import keeps this entirely out of SSR
  const { pdf, Document, Page, View, Text, StyleSheet } =
    await import('@react-pdf/renderer');

  // ── Styles ──────────────────────────────────────────────────────────────
  const S = StyleSheet.create({
    page: {
      flexDirection: 'column',
      backgroundColor: '#F8FAFC',
      paddingTop: 14,
      paddingBottom: 14,
      paddingLeft: 14,
      paddingRight: 14,
    },

    // ── Page header ─────────────────────────────────────────────────────
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
      letterSpacing: 1.5,
    },
    pageDate: {
      fontSize: 8,
      fontFamily: 'Helvetica',
      color: '#94A3B8',
    },

    // ── Columns row ──────────────────────────────────────────────────────
    columnsRow: {
      flexDirection: 'row',
      flex: 1,
      gap: 5,
    },
    column: {
      flex: 1,
      flexDirection: 'column',
    },

    // ── Column header ────────────────────────────────────────────────────
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

    // ── Card ─────────────────────────────────────────────────────────────
    card: {
      backgroundColor: '#FFFFFF',
      borderRadius: 5,
      borderWidth: 1,
      borderColor: '#E2E8F0',
      borderStyle: 'solid',
      marginBottom: 4,
    },

    // CIP strip
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

    // Card body
    cardBody: {
      paddingTop: 6,
      paddingBottom: 6,
      paddingLeft: 7,
      paddingRight: 7,
    },

    // Position + name
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

    // kg total
    totalKg: {
      fontSize: 7.5,
      fontFamily: 'Helvetica-Bold',
      color: '#475569',
      marginBottom: 4,
    },

    // Batch box
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

    // Allergen badge
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

    // Start time
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

    // Subtotal
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

  // ── Components (no hooks — react-pdf reconciler) ─────────────────────────

  const CardView = ({
    item, position, hasCIP,
  }: { item: BoardItem; position: number; hasCIP: boolean }) => {
    const allergenKey = item.allergens[0] ?? 'ALLERGEN_FREE';
    const alg  = ALLERGEN_INFO[allergenKey] ?? ALLERGEN_INFO.ALLERGEN_FREE;
    const sizes = parseBatchSizes(item.batchBreakdown, item.batches, item.quantity);

    return (
      <View style={S.card}>
        {hasCIP && (
          <View style={S.cipStrip}>
            <View style={S.cipDot} />
            <Text style={S.cipText}>⚠  CIP / CLEAN BEFORE THIS</Text>
          </View>
        )}
        <View style={S.cardBody}>
          {/* Name row */}
          <View style={S.titleRow}>
            <View style={S.posBadge}>
              <Text style={S.posNum}>{position}</Text>
            </View>
            <Text style={S.productName}>{item.product}</Text>
          </View>

          {/* Total */}
          <Text style={S.totalKg}>{item.quantity.toLocaleString()} kg total</Text>

          {/* Batches */}
          <View style={S.batchBox}>
            {sizes.map((b, i) => (
              <View key={i} style={i === sizes.length - 1 ? S.batchRowLast : S.batchRow}>
                <Text style={S.batchNum}>*{i + 1}</Text>
                <Text style={S.batchKg}>{b.kg.toLocaleString()} kg</Text>
              </View>
            ))}
          </View>

          {/* Allergen pill */}
          <View style={[S.allergenPill, { backgroundColor: alg.bg }]}>
            <Text style={[S.allergenText, { color: alg.fg }]}>{alg.label}</Text>
          </View>

          {/* Start time (only if set) */}
          {!!item.time && (
            <View style={S.timeRow}>
              <Text style={S.timeLabel}>Start:</Text>
              <Text style={S.timeValue}>{fmt12h(item.time)}</Text>
            </View>
          )}
        </View>
      </View>
    );
  };

  const ColumnView = ({ line, items }: { line: string; items: BoardItem[] }) => {
    const label       = LINE_LABEL[line] ?? line;
    const totalKg     = items.reduce((s, i) => s + i.quantity, 0);
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
  };

  // ── Document ─────────────────────────────────────────────────────────────

  const dateStr = new Date().toLocaleDateString('en-AU', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  const BoardDoc = () => (
    <Document>
      <Page
        size="A3"
        orientation="landscape"
        style={S.page}
      >
        {/* Title bar */}
        <View style={S.pageHeader}>
          <Text style={S.pageTitle}>PRODUCTION BOARD</Text>
          <Text style={S.pageDate}>Generated: {dateStr}</Text>
        </View>

        {/* Kettle columns */}
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

  // ── Render + download ─────────────────────────────────────────────────────

  const blob = await pdf(<BoardDoc />).toBlob();
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
