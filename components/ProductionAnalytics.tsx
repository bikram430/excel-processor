'use client';

import { useEffect, useState } from 'react';
import { ExcelRow } from '@/types';
import {
  getRunHistory,
  computeLineAnalytics,
  LineAnalytics,
  RunSnapshot,
} from '@/lib/runHistory';

interface Props {
  enrichedRows: ExcelRow[];
  productionDate?: string;
}

/** Per-line stats derived from the currently-loaded enrichedRows */
function currentLineStats(rows: ExcelRow[]): Record<string, { products: number; batches: number; totalQty: number }> {
  const map: Record<string, { products: number; batches: number; totalQty: number }> = {};
  rows.forEach(row => {
    if (!row.line) return;
    if (!map[row.line]) map[row.line] = { products: 0, batches: 0, totalQty: 0 };
    map[row.line].products++;
    map[row.line].totalQty  += row.quantity;
    map[row.line].batches   += row.batchSizes?.length ?? (row.batches ?? 1);
  });
  return map;
}

function fmt(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}t` : `${n}kg`;
}

export function ProductionAnalytics({ enrichedRows, productionDate }: Props) {
  const [analytics, setAnalytics]   = useState<LineAnalytics[]>([]);
  const [history,   setHistory]     = useState<RunSnapshot[]>([]);
  const hasHistory = history.length > 0;
  const hasCurrentData = enrichedRows.length > 0;

  useEffect(() => {
    const h = getRunHistory();
    setHistory(h);
    setAnalytics(computeLineAnalytics(h));
  }, [enrichedRows]); // re-compute whenever a new run is loaded

  const current = hasCurrentData ? currentLineStats(enrichedRows) : {};
  const maxAvgQty = analytics.reduce((m, a) => Math.max(m, a.avgQty), 0) || 1;

  // Insights (generated from data, not hard-coded)
  const insights: string[] = [];
  if (hasHistory && analytics.length > 0) {
    const busiest = analytics[0];
    insights.push(`${busiest.line} carries the highest average load — ${busiest.avgBatches.toFixed(1)} batches/run (${fmt(busiest.avgQty)} avg).`);

    if (hasCurrentData) {
      const overloaded = analytics.filter(a => {
        const cur = current[a.line];
        return cur && cur.batches > a.avgBatches * 1.15;
      });
      const underloaded = analytics.filter(a => {
        const cur = current[a.line];
        return cur && cur.batches < a.avgBatches * 0.75;
      });
      if (overloaded.length > 0)
        insights.push(`${overloaded.map(a => a.line).join(', ')} ${overloaded.length === 1 ? 'is' : 'are'} running above average — more batches than usual.`);
      if (underloaded.length > 0)
        insights.push(`${underloaded.map(a => a.line).join(', ')} ${underloaded.length === 1 ? 'is' : 'are'} lighter than usual — spare capacity available.`);
    }

    const trending = analytics.filter(a => a.trend === 'up');
    if (trending.length > 0)
      insights.push(`Workload trending up on ${trending.map(a => a.line).join(', ')}.`);
  }

  // When no history yet, show a placeholder inside the same card structure
  if (!hasHistory) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <p className="text-[10px] font-bold tracking-[0.15em] text-slate-400 uppercase mb-4">
          Production Analytics
        </p>
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mb-3">
            <svg className="w-5 h-5 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <p className="text-xs font-semibold text-slate-400">No history yet</p>
          <p className="text-[11px] text-slate-300 mt-1">
            Analytics will appear after your first production plan is loaded.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold tracking-[0.15em] text-slate-400 uppercase">
          Line Utilisation Analytics
        </p>
        <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-blue-100 text-blue-700">
          {history.length} RUN{history.length !== 1 ? 'S' : ''}
        </span>
      </div>

      {/* Per-line rows */}
      <div className="space-y-3">
        {analytics.map(a => {
          const cur = current[a.line];
          const pct = Math.round((a.avgQty / maxAvgQty) * 100);

          // Compare current batches to historical average
          let badge: { label: string; color: string } | null = null;
          if (cur) {
            const diff = cur.batches - a.avgBatches;
            if (diff > 1)       badge = { label: `+${Math.round(diff)} vs avg`, color: 'bg-red-100 text-red-700' };
            else if (diff < -1) badge = { label: `${Math.round(diff)} vs avg`, color: 'bg-emerald-100 text-emerald-700' };
            else                badge = { label: 'On track', color: 'bg-slate-100 text-slate-500' };
          }

          const trendIcon =
            a.trend === 'up'   ? '↑' :
            a.trend === 'down' ? '↓' : null;

          return (
            <div key={a.line}>
              <div className="flex items-center justify-between mb-1 gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-xs font-semibold text-gray-700 truncate">{a.line}</span>
                  {trendIcon && (
                    <span className={`text-[10px] font-bold ${a.trend === 'up' ? 'text-red-500' : 'text-emerald-500'}`}>
                      {trendIcon}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {badge && (
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${badge.color}`}>
                      {badge.label}
                    </span>
                  )}
                  <span className="text-[10px] text-slate-400 font-mono whitespace-nowrap">
                    avg {a.avgBatches.toFixed(1)} batch{a.avgBatches !== 1 ? 'es' : ''}
                  </span>
                </div>
              </div>

              {/* Stacked bar: historical avg (blue) + current overage (red) if higher */}
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden relative">
                {/* Historical average bar */}
                <div
                  className="absolute inset-y-0 left-0 bg-blue-400 rounded-full transition-all duration-500"
                  style={{ width: `${pct}%` }}
                />
                {/* Current run overlay — only shown if loaded and different */}
                {cur && (() => {
                  const curPct = Math.round((cur.totalQty / maxAvgQty) * 100);
                  if (curPct > pct)
                    return <div className="absolute inset-y-0 left-0 bg-red-400 rounded-full" style={{ width: `${Math.min(curPct, 100)}%`, opacity: 0.6 }} />;
                  if (curPct < pct - 5)
                    return <div className="absolute inset-y-0 left-0 bg-emerald-400 rounded-full" style={{ width: `${curPct}%`, opacity: 0.8 }} />;
                  return null;
                })()}
              </div>

              {/* Sub-line: current run detail */}
              {cur && (
                <p className="text-[10px] text-slate-400 mt-0.5">
                  Today: {cur.products} product{cur.products !== 1 ? 's' : ''} · {cur.batches} batch{cur.batches !== 1 ? 'es' : ''} · {fmt(cur.totalQty)}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 pt-1 border-t border-gray-100">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-2 rounded-full bg-blue-400" />
          <span className="text-[10px] text-slate-400">Historical avg</span>
        </div>
        {hasCurrentData && (
          <>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-2 rounded-full bg-red-400 opacity-60" />
              <span className="text-[10px] text-slate-400">Above avg today</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-2 rounded-full bg-emerald-400 opacity-80" />
              <span className="text-[10px] text-slate-400">Below avg today</span>
            </div>
          </>
        )}
      </div>

      {/* Insights */}
      {insights.length > 0 && (
        <div className="pt-2 border-t border-gray-100 space-y-1.5">
          <p className="text-[10px] font-bold tracking-[0.12em] text-slate-400 uppercase">AI Insights</p>
          {insights.map((ins, i) => (
            <p key={i} className="text-[11px] text-slate-500 leading-relaxed flex items-start gap-1.5">
              <span className="text-blue-400 flex-shrink-0 mt-px">›</span>
              {ins}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
