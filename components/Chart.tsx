'use client';

import { LineStats } from '@/types';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
} from 'recharts';

interface ChartProps {
  totalsByLine: Record<string, LineStats>;
}

/** Shorten long line labels for the X-axis tick */
function shortLabel(name: string): string {
  const abbr: Record<string, string> = {
    'BLENDTECH CQC 1':      'BT CQC 1',
    'KETTLE 2 DIRECT FILL': 'KT2 D/F',
    'KETTLE 3 DIRECT FILL': 'KT3 D/F',
    'KETTLE 4 KAPCOLD':     'KT4 KAP',
    'KETTLE 1 SOUP':        'KT1 SOUP',
  };
  return abbr[name] ?? name;
}

// Custom tooltip content for Recharts
function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-4 py-3 text-sm">
      <p className="font-semibold text-gray-800 mb-1">{label}</p>
      <p className="text-blue-600 font-bold">{payload[0].value.toLocaleString()} units</p>
    </div>
  );
}

export function Chart({ totalsByLine }: ChartProps) {
  const entries = Object.entries(totalsByLine);

  if (entries.length === 0) return null;

  const maxQty = Math.max(...entries.map(([, s]) => s.totalQuantity));

  // Sort descending for left-to-right visual clarity
  const chartData = [...entries]
    .sort(([, a], [, b]) => b.totalQuantity - a.totalQuantity)
    .map(([line, stats]) => ({
      name:      line,
      label:     shortLabel(line),
      quantity:  stats.totalQuantity,
      isTop:     stats.totalQuantity === maxQty,
    }));

  return (
    <div className="w-full">
      <ResponsiveContainer width="100%" height={360}>
        <BarChart
          data={chartData}
          margin={{ top: 28, right: 24, left: 16, bottom: 72 }}
          barCategoryGap="30%"
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />

          {/* X-axis uses the abbreviated label; tooltip uses the full name */}
          <XAxis
            dataKey="label"
            angle={-38}
            textAnchor="end"
            tick={{ fontSize: 11, fill: '#6b7280' }}
            interval={0}
            tickLine={false}
            axisLine={{ stroke: '#e5e7eb' }}
          />

          <YAxis
            tick={{ fontSize: 11, fill: '#6b7280' }}
            tickFormatter={(v: number) => v.toLocaleString()}
            tickLine={false}
            axisLine={false}
            width={64}
          />

          {/* Tooltip shows the full line name */}
          <Tooltip
            content={<CustomTooltip />}
            cursor={{ fill: 'rgba(59,130,246,0.05)' }}
          />

          <Bar dataKey="quantity" radius={[6, 6, 0, 0]} maxBarSize={60}>
            {/* Colour top bar amber, others blue */}
            {chartData.map((entry, idx) => (
              <Cell
                key={idx}
                fill={entry.isTop ? '#f59e0b' : '#3b82f6'}
                fillOpacity={0.9}
              />
            ))}
            {/* Value labels on top of each bar */}
            <LabelList
              dataKey="quantity"
              position="top"
              style={{ fontSize: 10, fill: '#374151', fontWeight: 600 }}
              formatter={(v: number) => v.toLocaleString()}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div className="flex items-center justify-center gap-5 mt-2 text-xs text-gray-500">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-sm bg-amber-400" />
          Highest production line
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-sm bg-blue-400" />
          Other lines
        </span>
      </div>
    </div>
  );
}
