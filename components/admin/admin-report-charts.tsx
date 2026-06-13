'use client';

import { memo } from 'react';
import { Bar, BarChart, Cell, Pie, PieChart, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';

export type PieSlice = { name: string; value: number; label: string };
export type BarRow = {
  label: string;
  shortLabel: string;
  value: number;
  secondary?: number;
  hint?: string;
  bandKey?: string;
};

const DEFAULT_PIE = ['#10b981', '#94a3b8', '#f59e0b', '#6366f1', '#0ea5e9'];

export const ReportDonutCard = memo(function ReportDonutCard({
  title,
  hint,
  data,
  colors = DEFAULT_PIE,
  onSliceClick,
}: {
  title: string;
  hint: string;
  data: PieSlice[];
  colors?: string[];
  onSliceClick?: (slice: PieSlice) => void;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const config = Object.fromEntries(
    data.map((d, i) => [d.name, { label: d.label, color: colors[i % colors.length] }]),
  );

  return (
    <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm w-full">
      <h3 className="text-sm font-bold text-[#0c2340] mb-1">{title}</h3>
      <p className="text-xs text-slate-500 mb-3">{hint}</p>
      {total === 0 ? (
        <p className="text-sm text-slate-500 py-12 text-center">No data for this chart.</p>
      ) : (
        <>
          <ChartContainer config={config} className="mx-auto h-[220px] max-w-[280px]">
            <PieChart>
              <ChartTooltip content={<ChartTooltipContent hideLabel />} />
              <Pie
                data={data}
                dataKey="value"
                nameKey="label"
                innerRadius={56}
                outerRadius={80}
                paddingAngle={2}
                strokeWidth={2}
                stroke="#fff"
                isAnimationActive={false}
                className={onSliceClick ? 'cursor-pointer' : undefined}
              >
                {data.map((slice, i) => (
                  <Cell
                    key={i}
                    fill={colors[i % colors.length]}
                    className={onSliceClick ? 'cursor-pointer' : undefined}
                    onClick={
                      onSliceClick
                        ? () => {
                            if (slice.value > 0) onSliceClick(slice);
                          }
                        : undefined
                    }
                  />
                ))}
              </Pie>
            </PieChart>
          </ChartContainer>
          <div className="flex flex-wrap justify-center gap-4 mt-2 text-xs font-medium">
            {data.map((d, i) => (
              <span key={d.name} className="flex items-center gap-1.5">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: colors[i % colors.length] }}
                />
                {d.label} {d.value}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
});

export const ReportBarCard = memo(function ReportBarCard({
  title,
  hint,
  data,
  layout = 'vertical',
  stacked = false,
  primaryColor = '#1e3a5f',
  secondaryColor = '#e2e8f0',
  onBarClick,
}: {
  title: string;
  hint: string;
  data: BarRow[];
  layout?: 'vertical' | 'horizontal';
  stacked?: boolean;
  primaryColor?: string;
  secondaryColor?: string;
  onBarClick?: (row: BarRow) => void;
}) {
  const config = {
    value: { label: 'Count', color: primaryColor },
    secondary: { label: 'Other', color: secondaryColor },
  };

  return (
    <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm w-full">
      <h3 className="text-sm font-bold text-[#0c2340] mb-1">{title}</h3>
      <p className="text-xs text-slate-500 mb-3">{hint}</p>
      {data.length === 0 ? (
        <p className="text-sm text-slate-500 py-12 text-center">No data for this chart.</p>
      ) : layout === 'vertical' ? (
        <ChartContainer config={config} className="h-[220px] min-h-[220px] w-full">
          <BarChart data={data} margin={{ bottom: 8, left: 4, right: 8 }}>
            <XAxis dataKey="shortLabel" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
            <YAxis hide />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value, name, item) => {
                    const row = item.payload as BarRow;
                    return [value, row.hint || row.label || String(name)];
                  }}
                />
              }
            />
            <Bar
              dataKey="value"
              fill={primaryColor}
              radius={[4, 4, 0, 0]}
              stackId={stacked ? 's' : undefined}
              isAnimationActive={false}
              className={onBarClick ? 'cursor-pointer' : undefined}
              onClick={
                onBarClick
                  ? (state) => {
                      const row = state?.payload as BarRow | undefined;
                      if (row && row.value > 0) onBarClick(row);
                    }
                  : undefined
              }
            />
            {stacked ? (
              <Bar
                dataKey="secondary"
                fill={secondaryColor}
                radius={[4, 4, 0, 0]}
                stackId="s"
                isAnimationActive={false}
              />
            ) : null}
          </BarChart>
        </ChartContainer>
      ) : (
        <ChartContainer config={config} className="h-[min(280px,40vh)] min-h-[220px] w-full">
          <BarChart data={data} layout="vertical" margin={{ left: 4, right: 12 }}>
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="shortLabel"
              width={100}
              tick={{ fontSize: 10 }}
              tickLine={false}
              axisLine={false}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value, name, item) => {
                    const row = item.payload as BarRow;
                    return [value, row.hint || row.label || String(name)];
                  }}
                />
              }
            />
            <Bar
              dataKey="value"
              fill={primaryColor}
              radius={[0, 4, 4, 0]}
              stackId={stacked ? 's' : undefined}
              isAnimationActive={false}
              className={onBarClick ? 'cursor-pointer' : undefined}
              onClick={
                onBarClick
                  ? (state) => {
                      const row = state?.payload as BarRow | undefined;
                      if (row && row.value > 0) onBarClick(row);
                    }
                  : undefined
              }
            />
            {stacked ? (
              <Bar
                dataKey="secondary"
                fill={secondaryColor}
                radius={[0, 4, 4, 0]}
                stackId="s"
                isAnimationActive={false}
              />
            ) : null}
          </BarChart>
        </ChartContainer>
      )}
    </div>
  );
});

export function ReportChartGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid lg:grid-cols-2 gap-4 items-stretch">{children}</div>;
}
