import { format, parseISO } from "date-fns";
import type { LucideIcon } from "lucide-react";

const CHART_WIDTH = 600;
const CHART_HEIGHT = 120;
const PAD_X = 6;
const PAD_Y = 10;
const MAX_DOTS = 21;

export type TrendPoint = { day: string; value: number };

export function TrendlineChart({
  icon: Icon,
  title,
  points,
  formatValue,
  averageLabel,
  noDataLabel,
}: {
  icon: LucideIcon;
  title: string;
  points: TrendPoint[];
  formatValue: (value: number) => string;
  averageLabel: string;
  noDataLabel: string;
}) {
  const values = points.map((p) => p.value);
  const hasData = values.some((v) => v > 0);
  const maxValue = Math.max(...values, 1);
  const average = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;

  const stepX = points.length > 1 ? (CHART_WIDTH - PAD_X * 2) / (points.length - 1) : 0;
  const coords = points.map((p, i) => ({
    x: PAD_X + i * stepX,
    y: CHART_HEIGHT - PAD_Y - (p.value / maxValue) * (CHART_HEIGHT - PAD_Y * 2),
  }));
  const linePath = coords
    .map((c, i) => `${i === 0 ? "M" : "L"} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
    .join(" ");
  const areaPath =
    coords.length > 0
      ? `${linePath} L ${coords[coords.length - 1].x.toFixed(1)} ${CHART_HEIGHT - PAD_Y} L ${coords[0].x.toFixed(1)} ${CHART_HEIGHT - PAD_Y} Z`
      : "";

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-neutral-500">
          <Icon className="h-4 w-4" strokeWidth={2} />
          {title}
        </h3>
        {hasData && (
          <span className="text-sm font-medium text-neutral-400">
            {averageLabel} {formatValue(average)}
          </span>
        )}
      </div>

      {hasData ? (
        <>
          <svg
            viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
            preserveAspectRatio="none"
            className="h-28 w-full"
          >
            <path d={areaPath} className="fill-accent/10" />
            <path
              d={linePath}
              className="fill-none stroke-accent"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {coords.length <= MAX_DOTS &&
              coords.map((c, i) => <circle key={i} cx={c.x} cy={c.y} r={2.5} className="fill-accent" />)}
          </svg>
          <div className="mt-1 flex justify-between text-[10px] text-neutral-400">
            <span>{format(parseISO(points[0].day), "MMM d")}</span>
            <span>{format(parseISO(points[points.length - 1].day), "MMM d")}</span>
          </div>
        </>
      ) : (
        <p className="py-6 text-center text-sm text-neutral-400">{noDataLabel}</p>
      )}
    </div>
  );
}
