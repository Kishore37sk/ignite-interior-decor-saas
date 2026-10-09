"use client";

import Link from "next/link";
import { useId, useSyncExternalStore, type ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCompactNumber, formatINR, formatNumber, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/* Palette & formatting                                                       */
/* -------------------------------------------------------------------------- */

/** Ignite/TeamHub chart ramp: deep → primary → lime → soft → grey, then status colours. */
export const CHART_COLORS = {
  deep: "#0F4A3C",
  primary: "#2BB58F",
  lime: "#9BD35A",
  softStrong: "#CDEBC0",
  soft: "#E6F4DD",
  grey: "#C9CFCB",
  warning: "#E9A23B",
  danger: "#E5484D",
  info: "#3B82C4",
} as const;

export const CHART_SERIES_COLORS = [
  CHART_COLORS.deep,
  CHART_COLORS.primary,
  CHART_COLORS.lime,
  CHART_COLORS.softStrong,
  CHART_COLORS.grey,
  CHART_COLORS.warning,
  CHART_COLORS.danger,
  CHART_COLORS.info,
] as const;

const AXIS_TICK = { fill: "#5E6D66", fontSize: 12 } as const; // mirrors --color-muted
const GRID_STROKE = "#ECEEEA";

/**
 * Value formats are names (not functions) so server components can pass them to
 * these client charts.
 */
export type ChartValueFormat = "number" | "inr" | "inr_compact" | "percent" | "days";

export function formatChartValue(value: unknown, format: ChartValueFormat = "number"): string {
  const n = typeof value === "number" ? value : Number(value);
  if (value === null || value === undefined || !Number.isFinite(n)) return "—";
  switch (format) {
    case "inr":
      return formatINR(n);
    case "inr_compact":
      return formatINR(n, { compact: true });
    case "percent":
      return formatPercent(n, n % 1 === 0 ? 0 : 1);
    case "days":
      return `${formatNumber(n, 1)} ${n === 1 ? "day" : "days"}`;
    case "number":
      return formatNumber(n, 2);
  }
}

function axisTick(value: unknown, format: ChartValueFormat): string {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return "";
  if (format === "inr" || format === "inr_compact") return formatINR(n, { compact: true });
  if (format === "percent") return `${formatNumber(n, 0)}%`;
  return formatCompactNumber(n);
}

/** White or deep text depending on the fill's luminance. */
function readableOn(hex: string): string {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!match?.[1]) return "#FFFFFF";
  const int = parseInt(match[1], 16);
  const [r, g, b] = [(int >> 16) & 255, (int >> 8) & 255, int & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.4 ? CHART_COLORS.deep : "#FFFFFF";
}

function subscribeReducedMotion(callback: () => void): () => void {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

/** True when the user prefers reduced motion (false during SSR). */
function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
}

/* -------------------------------------------------------------------------- */
/* Shared pieces                                                              */
/* -------------------------------------------------------------------------- */

type TooltipEntry = {
  name?: string | number;
  value?: unknown;
  color?: string;
  fill?: string;
  stroke?: string;
  dataKey?: unknown;
};

export type ChartTooltipProps = {
  active?: boolean;
  payload?: ReadonlyArray<TooltipEntry>;
  label?: string | number;
  format?: ChartValueFormat;
  /** Hide the heading (e.g. for donuts, where the entry name is enough). */
  hideLabel?: boolean;
};

/** White card tooltip (TeamHub). */
export function ChartTooltip({ active, payload, label, format = "number", hideLabel = false }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="min-w-36 rounded-xl border border-border-soft bg-surface px-3 py-2.5 text-xs shadow-pop">
      {!hideLabel && label !== undefined && label !== "" ? (
        <p className="mb-1.5 font-medium text-muted">{label}</p>
      ) : null}
      <ul className="flex flex-col gap-1">
        {payload.map((entry, index) => {
          const color = entry.color ?? entry.fill ?? entry.stroke ?? CHART_COLORS.primary;
          return (
            <li key={`${String(entry.dataKey ?? entry.name)}-${index}`} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-muted">
                <span aria-hidden="true" className="size-2 rounded-full" style={{ backgroundColor: color }} />
                {entry.name}
              </span>
              <span className="font-semibold tabular-nums text-text">{formatChartValue(entry.value, format)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export type ChartSeries = {
  /** Key in each datum. */
  key: string;
  /** Legend/tooltip label. */
  name: string;
  color?: string;
};

export type ChartDatum = Record<string, string | number | null>;

function seriesColor(series: ChartSeries, index: number): string {
  return series.color ?? CHART_SERIES_COLORS[index % CHART_SERIES_COLORS.length] ?? CHART_COLORS.primary;
}

function SeriesLegend({ series }: { series: readonly ChartSeries[] }) {
  if (series.length < 2) return null;
  return (
    <ul className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm text-muted" aria-hidden="true">
      {series.map((item, index) => (
        <li key={item.key} className="flex items-center gap-2">
          <span className="h-1 w-4 rounded-full" style={{ backgroundColor: seriesColor(item, index) }} />
          {item.name}
        </li>
      ))}
    </ul>
  );
}

/** Screen-reader data table mirroring the chart. */
function DataTableFallback({
  caption,
  data,
  categoryKey,
  series,
  format,
}: {
  caption: string;
  data: readonly ChartDatum[];
  categoryKey: string;
  series: readonly ChartSeries[];
  format: ChartValueFormat;
}) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th scope="col">Category</th>
          {series.map((item) => (
            <th key={item.key} scope="col">
              {item.name}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.map((datum, index) => (
          <tr key={`${String(datum[categoryKey])}-${index}`}>
            <th scope="row">{String(datum[categoryKey] ?? "")}</th>
            {series.map((item) => (
              <td key={item.key}>{formatChartValue(datum[item.key], format)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ChartFrame({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <figure role="group" aria-label={label} className={cn("m-0 w-full min-w-0", className)}>
      {children}
    </figure>
  );
}

function NoData({ height, message }: { height: number; message: string }) {
  return (
    <div
      className="flex items-center justify-center rounded-xl bg-surface-muted text-sm text-muted"
      style={{ height }}
    >
      {message}
    </div>
  );
}

function hasValues(data: readonly ChartDatum[], series: readonly ChartSeries[]): boolean {
  return data.some((datum) => series.some((item) => typeof datum[item.key] === "number" && datum[item.key] !== 0));
}

/* -------------------------------------------------------------------------- */
/* Donut                                                                      */
/* -------------------------------------------------------------------------- */

export type DonutSlice = {
  name: string;
  value: number;
  color?: string;
  /** Drill-down link for the legend row. */
  href?: string;
};

export type DonutChartProps = {
  data: readonly DonutSlice[];
  /** Big number in the hole (defaults to the total). */
  centerValue?: ReactNode;
  centerLabel?: ReactNode;
  format?: ChartValueFormat;
  /** Chart diameter in px. */
  size?: number;
  showLegend?: boolean;
  ariaLabel: string;
  className?: string;
};

/** Ring chart with centred total and a legend list of value + share (TeamHub "Leave Types"). */
export function DonutChart({
  data,
  centerValue,
  centerLabel,
  format = "number",
  size = 220,
  showLegend = true,
  ariaLabel,
  className,
}: DonutChartProps) {
  const reducedMotion = usePrefersReducedMotion();
  const total = data.reduce((sum, slice) => sum + (Number.isFinite(slice.value) ? slice.value : 0), 0);
  const slices = data.map((slice, index) => ({
    ...slice,
    color: slice.color ?? CHART_SERIES_COLORS[index % CHART_SERIES_COLORS.length] ?? CHART_COLORS.primary,
  }));
  const ring = total > 0 ? slices.filter((slice) => slice.value > 0) : [{ name: "No data", value: 1, color: "#ECEEEA" }];

  return (
    <ChartFrame label={ariaLabel} className={cn("flex flex-col items-center gap-5", className)}>
      <div className="relative mx-auto aspect-square w-full" style={{ maxWidth: size }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={ring}
              dataKey="value"
              nameKey="name"
              innerRadius="74%"
              outerRadius="100%"
              startAngle={90}
              endAngle={-270}
              paddingAngle={total > 0 && ring.length > 1 ? 1.5 : 0}
              stroke="none"
              isAnimationActive={!reducedMotion}
            >
              {ring.map((slice) => (
                <Cell key={slice.name} fill={slice.color} />
              ))}
            </Pie>
            {total > 0 ? (
              <Tooltip
                content={(props) => (
                  <ChartTooltip active={props.active} payload={props.payload} format={format} hideLabel />
                )}
              />
            ) : null}
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-3xl font-semibold leading-none tracking-tight tabular-nums text-text sm:text-4xl">
            {centerValue ?? formatChartValue(total, format === "inr" ? "inr_compact" : format)}
          </span>
          {centerLabel ? <span className="mt-1.5 text-xs text-muted">{centerLabel}</span> : null}
        </div>
      </div>

      {showLegend ? (
        <ul className="flex w-full flex-col gap-2.5">
          {slices.map((slice) => {
            const share = total > 0 ? (slice.value / total) * 100 : 0;
            const row = (
              <>
                <span
                  className="inline-flex h-7 min-w-14 items-center justify-center rounded-md px-2 text-xs font-semibold tabular-nums"
                  style={{ backgroundColor: slice.color, color: readableOn(slice.color) }}
                >
                  {formatPercent(share, share > 0 && share < 10 ? 1 : 0)}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-text">{slice.name}</span>
                <span className="shrink-0 text-sm tabular-nums text-muted">{formatChartValue(slice.value, format)}</span>
              </>
            );
            return (
              <li key={slice.name}>
                {slice.href ? (
                  <Link
                    href={slice.href}
                    className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-0.5 transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    {row}
                  </Link>
                ) : (
                  <div className="flex items-center gap-3">{row}</div>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}
    </ChartFrame>
  );
}

/* -------------------------------------------------------------------------- */
/* Cartesian charts                                                           */
/* -------------------------------------------------------------------------- */

type CartesianProps = {
  data: readonly ChartDatum[];
  /** Key holding the x-axis category (e.g. `month`). */
  categoryKey: string;
  series: readonly ChartSeries[];
  format?: ChartValueFormat;
  height?: number;
  ariaLabel: string;
  emptyMessage?: string;
  className?: string;
};

export type SimpleBarChartProps = CartesianProps & {
  /** Horizontal bars (categories on the y-axis), good for long labels. */
  horizontal?: boolean;
};

/** Rounded bar chart (single or grouped series). */
export function SimpleBarChart({
  data,
  categoryKey,
  series,
  format = "number",
  height = 260,
  horizontal = false,
  ariaLabel,
  emptyMessage = "No data for this period",
  className,
}: SimpleBarChartProps) {
  const reducedMotion = usePrefersReducedMotion();
  if (!hasValues(data, series)) {
    return (
      <ChartFrame label={ariaLabel} className={className}>
        <NoData height={height} message={emptyMessage} />
      </ChartFrame>
    );
  }
  const rows = [...data];

  return (
    <ChartFrame label={ariaLabel} className={className}>
      <SeriesLegend series={series} />
      <div style={{ height }} aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={rows}
            layout={horizontal ? "vertical" : "horizontal"}
            margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
            barCategoryGap="28%"
          >
            <CartesianGrid stroke={GRID_STROKE} strokeDasharray="4 4" vertical={horizontal} horizontal={!horizontal} />
            {horizontal ? (
              <>
                <XAxis type="number" tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={(v) => axisTick(v, format)} />
                <YAxis type="category" dataKey={categoryKey} tick={AXIS_TICK} axisLine={false} tickLine={false} width={110} />
              </>
            ) : (
              <>
                <XAxis dataKey={categoryKey} tick={AXIS_TICK} axisLine={false} tickLine={false} tickMargin={8} />
                <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={56} tickFormatter={(v) => axisTick(v, format)} />
              </>
            )}
            <Tooltip
              cursor={{ fill: "rgba(43,181,143,0.06)" }}
              content={(props) => (
                <ChartTooltip active={props.active} payload={props.payload} label={props.label} format={format} />
              )}
            />
            {series.map((item, index) => (
              <Bar
                key={item.key}
                dataKey={item.key}
                name={item.name}
                fill={seriesColor(item, index)}
                radius={horizontal ? [0, 8, 8, 0] : [8, 8, 0, 0]}
                maxBarSize={36}
                isAnimationActive={!reducedMotion}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <DataTableFallback caption={ariaLabel} data={data} categoryKey={categoryKey} series={series} format={format} />
    </ChartFrame>
  );
}

/** Smooth area/line trend with gradient fill and dashed hover guide (TeamHub "Team Performance"). */
export function AreaTrendChart({
  data,
  categoryKey,
  series,
  format = "number",
  height = 260,
  ariaLabel,
  emptyMessage = "No data for this period",
  className,
}: CartesianProps) {
  const reducedMotion = usePrefersReducedMotion();
  const gradientBase = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  if (!hasValues(data, series)) {
    return (
      <ChartFrame label={ariaLabel} className={className}>
        <NoData height={height} message={emptyMessage} />
      </ChartFrame>
    );
  }
  const rows = [...data];
  const colors = series.map((item, index) =>
    series.length === 1 && !item.color ? CHART_COLORS.primary : seriesColor(item, index),
  );

  return (
    <ChartFrame label={ariaLabel} className={className}>
      <SeriesLegend series={series.map((item, index) => ({ ...item, color: colors[index] }))} />
      <div style={{ height }} aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <defs>
              {series.map((item, index) => (
                <linearGradient key={item.key} id={`${gradientBase}-${index}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={colors[index]} stopOpacity={0.22} />
                  <stop offset="100%" stopColor={colors[index]} stopOpacity={0.02} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid stroke={GRID_STROKE} strokeDasharray="4 4" vertical={false} />
            <XAxis dataKey={categoryKey} tick={AXIS_TICK} axisLine={false} tickLine={false} tickMargin={8} />
            <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={56} tickFormatter={(v) => axisTick(v, format)} />
            <Tooltip
              cursor={{ stroke: CHART_COLORS.primary, strokeDasharray: "4 4", strokeWidth: 1 }}
              content={(props) => (
                <ChartTooltip active={props.active} payload={props.payload} label={props.label} format={format} />
              )}
            />
            {series.map((item, index) => (
              <Area
                key={item.key}
                type="monotone"
                dataKey={item.key}
                name={item.name}
                stroke={colors[index]}
                strokeWidth={2.5}
                fill={`url(#${gradientBase}-${index})`}
                dot={false}
                activeDot={{ r: 5, fill: colors[index], stroke: "#FFFFFF", strokeWidth: 2 }}
                connectNulls
                isAnimationActive={!reducedMotion}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <DataTableFallback caption={ariaLabel} data={data} categoryKey={categoryKey} series={series} format={format} />
    </ChartFrame>
  );
}

export type StackedBarProps = CartesianProps & {
  horizontal?: boolean;
};

/** Stacked bars (e.g. projects by status per site manager, cost estimated vs actual parts). */
export function StackedBar({
  data,
  categoryKey,
  series,
  format = "number",
  height = 280,
  horizontal = false,
  ariaLabel,
  emptyMessage = "No data for this period",
  className,
}: StackedBarProps) {
  const reducedMotion = usePrefersReducedMotion();
  if (!hasValues(data, series)) {
    return (
      <ChartFrame label={ariaLabel} className={className}>
        <NoData height={height} message={emptyMessage} />
      </ChartFrame>
    );
  }
  const rows = [...data];
  const lastIndex = series.length - 1;

  return (
    <ChartFrame label={ariaLabel} className={className}>
      <SeriesLegend series={series.map((item, index) => ({ ...item, color: seriesColor(item, index) }))} />
      <div style={{ height }} aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={rows}
            layout={horizontal ? "vertical" : "horizontal"}
            margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
            barCategoryGap="30%"
          >
            <CartesianGrid stroke={GRID_STROKE} strokeDasharray="4 4" vertical={horizontal} horizontal={!horizontal} />
            {horizontal ? (
              <>
                <XAxis type="number" tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={(v) => axisTick(v, format)} />
                <YAxis type="category" dataKey={categoryKey} tick={AXIS_TICK} axisLine={false} tickLine={false} width={110} />
              </>
            ) : (
              <>
                <XAxis dataKey={categoryKey} tick={AXIS_TICK} axisLine={false} tickLine={false} tickMargin={8} />
                <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={56} tickFormatter={(v) => axisTick(v, format)} />
              </>
            )}
            <Tooltip
              cursor={{ fill: "rgba(43,181,143,0.06)" }}
              content={(props) => (
                <ChartTooltip active={props.active} payload={props.payload} label={props.label} format={format} />
              )}
            />
            {series.map((item, index) => (
              <Bar
                key={item.key}
                dataKey={item.key}
                name={item.name}
                stackId="stack"
                fill={seriesColor(item, index)}
                radius={index === lastIndex ? (horizontal ? [0, 8, 8, 0] : [8, 8, 0, 0]) : 0}
                maxBarSize={40}
                isAnimationActive={!reducedMotion}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <DataTableFallback caption={ariaLabel} data={data} categoryKey={categoryKey} series={series} format={format} />
    </ChartFrame>
  );
}

/* -------------------------------------------------------------------------- */
/* Segmented bar (TeamHub "Employment Status")                                */
/* -------------------------------------------------------------------------- */

export type SegmentedBarProps = {
  segments: readonly DonutSlice[];
  format?: ChartValueFormat;
  ariaLabel: string;
  showLegend?: boolean;
  className?: string;
};

/** Single horizontal bar split into proportional segments, with a two-column legend. */
export function SegmentedBar({ segments, format = "number", ariaLabel, showLegend = true, className }: SegmentedBarProps) {
  const total = segments.reduce((sum, segment) => sum + Math.max(0, segment.value), 0);
  const colored = segments.map((segment, index) => ({
    ...segment,
    color: segment.color ?? CHART_SERIES_COLORS[index % CHART_SERIES_COLORS.length] ?? CHART_COLORS.primary,
  }));

  return (
    <ChartFrame label={ariaLabel} className={cn("flex flex-col gap-4", className)}>
      <div className="flex h-4 w-full gap-1 overflow-hidden rounded-full bg-surface-sunken" aria-hidden="true">
        {total > 0
          ? colored
              .filter((segment) => segment.value > 0)
              .map((segment) => (
                <div
                  key={segment.name}
                  className="h-full first:rounded-l-full last:rounded-r-full"
                  style={{ width: `${(segment.value / total) * 100}%`, backgroundColor: segment.color }}
                />
              ))
          : null}
      </div>
      {showLegend ? (
        <ul className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          {colored.map((segment) => {
            const share = total > 0 ? (segment.value / total) * 100 : 0;
            const content = (
              <>
                <span className="flex items-center gap-2 text-sm font-medium text-text">
                  <span aria-hidden="true" className="h-3.5 w-1.5 rounded-full" style={{ backgroundColor: segment.color }} />
                  {segment.name}
                </span>
                <span className="pl-3.5 text-xs text-muted">
                  <span className="font-semibold tabular-nums text-text">{formatPercent(share, 0)}</span>
                  {" — "}
                  <span className="tabular-nums">{formatChartValue(segment.value, format)}</span>
                </span>
              </>
            );
            return (
              <li key={segment.name}>
                {segment.href ? (
                  <Link
                    href={segment.href}
                    className="-m-1 flex flex-col gap-0.5 rounded-lg p-1 transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    {content}
                  </Link>
                ) : (
                  <div className="flex flex-col gap-0.5">{content}</div>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}
    </ChartFrame>
  );
}
