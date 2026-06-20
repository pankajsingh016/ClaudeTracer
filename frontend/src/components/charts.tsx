import { useMemo, useState, useRef, useEffect } from "react";
import { hierarchy, treemap, treemapSquarify } from "d3-hierarchy";
import { ResponsivePie } from "@nivo/pie";
import { ResponsiveStream } from "@nivo/stream";
import { ResponsiveLine } from "@nivo/line";
import { Flame, Calendar, TrendingUp } from "lucide-react";
import { PieCustomLayerProps, ComputedDatum as PieDatum } from "@nivo/pie";
import { Analytics, SunburstNode, TreeNode, fmtCost, modelColor, shortModel, formatProjectName } from "@/api";
import { ModelBadge } from "@/components/dashboard-ui";
import { cn } from "@/lib/utils";
import { useTheme } from "@/hooks/use-theme";
import {
  getNivoTheme,
  HEAT_COLORS_DARK,
  HEAT_COLORS_LIGHT,
  CHART_SEGMENT_BORDER,
} from "@/lib/chart-theme";

function useChartPalette() {
  const { theme: mode } = useTheme();
  const isDark = mode === "dark";
  return {
    isDark,
    nivo: getNivoTheme(isDark),
    heat: isDark ? HEAT_COLORS_DARK : HEAT_COLORS_LIGHT,
    segmentBorder: CHART_SEGMENT_BORDER,
  };
}

function ChartTooltip({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2.5 text-xs shadow-xl min-w-[140px]">
      <div className="font-medium text-foreground leading-snug">{label}</div>
      <div className="font-semibold text-primary mt-1 tabular-nums">{value}</div>
      {sub && <div className="text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

const PROJECT_PALETTE = [
  "#e08a6b",
  "#a78bfa",
  "#60a5fa",
  "#34d399",
  "#f59e0b",
  "#f472b6",
  "#38bdf8",
  "#818cf8",
  "#fb923c",
  "#4ade80",
];

type ProjectSlice = {
  id: string;
  label: string;
  value: number;
  color: string;
  models: { name: string; fullName: string; value: number }[];
};

function buildProjectSlices(data: SunburstNode): ProjectSlice[] {
  return (
    data.children
      ?.map((project, i) => {
        const models =
          project.children
            ?.filter((m) => (m.value ?? 0) > 0)
            .map((m) => ({
              name: shortModel(m.name),
              fullName: m.name,
              value: m.value ?? 0,
            }))
            .sort((a, b) => b.value - a.value) ?? [];
        const value = models.reduce((sum, m) => sum + m.value, 0);
        return {
          id: project.name,
          label: project.name,
          value,
          color: PROJECT_PALETTE[i % PROJECT_PALETTE.length],
          models,
        };
      })
      .filter((p) => p.value > 0)
      .sort((a, b) => b.value - a.value) ?? []
  );
}

function SpendCenterMetric({
  centerX,
  centerY,
  dataWithArc,
}: PieCustomLayerProps<{ id: string; value: number }>) {
  const { theme: mode } = useTheme();
  const isDark = mode === "dark";
  const total = dataWithArc.reduce((sum, d) => sum + d.value, 0);
  return (
    <g>
      <text
        x={centerX}
        y={centerY - 10}
        textAnchor="middle"
        dominantBaseline="central"
        fill={isDark ? "#64748b" : "#64748b"}
        style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.14em" }}
      >
        TOTAL
      </text>
      <text
        x={centerX}
        y={centerY + 12}
        textAnchor="middle"
        dominantBaseline="central"
        fill={isDark ? "#f1f5f9" : "#0f172a"}
        style={{ fontSize: 22, fontWeight: 700, fontFamily: "Inter, sans-serif" }}
      >
        {fmtCost(total)}
      </text>
    </g>
  );
}

function ProjectBreakdownRow({
  project,
  total,
  isActive,
  onHover,
}: {
  project: ProjectSlice;
  total: number;
  isActive: boolean;
  onHover: (id: string | null) => void;
}) {
  const pct = total > 0 ? (project.value / total) * 100 : 0;

  return (
    <div
      className={cn(
        "rounded-xl border p-4 transition-all duration-200",
        isActive
          ? "border-primary/40 bg-primary/[0.06] shadow-glow-sm"
          : "border-border/40 bg-card/40 hover:border-border/70 hover:bg-card/60"
      )}
      onMouseEnter={() => onHover(project.id)}
      onMouseLeave={() => onHover(null)}
    >
      <div className="flex items-start gap-3">
        <div
          className="mt-1 h-3 w-3 rounded-full shrink-0 ring-2 ring-background shadow-sm"
          style={{ background: project.color, boxShadow: `0 0 12px ${project.color}55` }}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h4
              className="text-sm font-semibold leading-snug break-words text-foreground"
              title={project.label}
            >
              {formatProjectName(project.label)}
            </h4>
            <div className="text-right shrink-0">
              <div className="text-base font-bold text-primary tabular-nums">
                {fmtCost(project.value)}
              </div>
              <div className="text-[11px] text-muted-foreground tabular-nums">
                {pct.toFixed(1)}% of spend
              </div>
            </div>
          </div>

          <div className="mt-3 h-1.5 rounded-full bg-background/80 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500 ease-out"
              style={{
                width: `${Math.max(pct, 1)}%`,
                background: `linear-gradient(90deg, ${project.color}, ${project.color}99)`,
              }}
            />
          </div>

          {project.models.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {project.models.map((model) => {
                const modelPct = project.value > 0 ? (model.value / project.value) * 100 : 0;
                return (
                  <div
                    key={model.fullName}
                    className="inline-flex items-center gap-2 rounded-lg border border-border/50 bg-background/50 px-2.5 py-1.5"
                    title={model.fullName}
                  >
                    <span
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{ background: modelColor(model.fullName) }}
                    />
                    <span className="text-xs font-medium">{model.name}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {fmtCost(model.value)}
                    </span>
                    <span className="text-[10px] text-muted-foreground/70 tabular-nums">
                      ({modelPct.toFixed(0)}%)
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function SunburstChart({ data }: { data: SunburstNode }) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const { nivo, segmentBorder } = useChartPalette();
  const projects = useMemo(() => buildProjectSlices(data), [data]);
  const total = useMemo(() => projects.reduce((s, p) => s + p.value, 0), [projects]);

  if (!projects.length) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-[minmax(200px,280px)_1fr] gap-6 items-start">
      {/* Clean donut — no external labels, no truncation */}
      <div className="flex flex-col items-center justify-center mx-auto w-full max-w-[280px]">
        <div className="relative w-full h-[240px] max-w-[280px] mx-auto">
          <ResponsivePie
            data={projects}
            id="id"
            value="value"
            innerRadius={0.62}
            padAngle={2}
            cornerRadius={6}
            activeId={activeId ?? undefined}
            activeInnerRadiusOffset={4}
            activeOuterRadiusOffset={10}
            colors={{ datum: "data.color" }}
            borderWidth={3}
            borderColor={segmentBorder}
            margin={{ top: 12, right: 12, bottom: 12, left: 12 }}
            enableArcLabels={false}
            enableArcLinkLabels={false}
            theme={nivo}
            motionConfig="gentle"
            layers={["arcs", SpendCenterMetric]}
            tooltip={({ datum }: { datum: PieDatum<{ id: string; value: number; color: string }> }) => {
              const pct = total > 0 ? ((datum.value / total) * 100).toFixed(1) : "0";
              return (
                <ChartTooltip
                  label={String(datum.id)}
                  value={`${fmtCost(datum.value)} · ${pct}%`}
                />
              );
            }}
            onMouseEnter={(d) => setActiveId(String(d.id))}
            onMouseLeave={() => setActiveId(null)}
          />
        </div>
        <p className="mt-2 text-center text-[11px] text-muted-foreground max-w-[220px]">
          Hover a slice or row below to highlight
        </p>
      </div>

      {/* Full-width project rows — names wrap, no truncation */}
      <div className="space-y-3 min-w-0">
        {projects.map((project) => (
          <ProjectBreakdownRow
            key={project.id}
            project={project}
            total={total}
            isActive={activeId === project.id}
            onHover={setActiveId}
          />
        ))}
      </div>
    </div>
  );
}

export function ModelCostBar({ data }: { data: Analytics["by_model"] }) {
  if (!data.length) return null;

  const sorted = [...data].sort((a, b) => b.cost - a.cost);
  const total = sorted.reduce((s, d) => s + d.cost, 0);
  const max = Math.max(...sorted.map((d) => d.cost), 0.0001);

  return (
    <div className="space-y-5">
      {sorted.map((item, rank) => {
        const share = total > 0 ? (item.cost / total) * 100 : 0;
        const barWidth = max > 0 ? (item.cost / max) * 100 : 0;
        const color = modelColor(item.model);
        const visibleBar = item.cost > 0 ? Math.max(barWidth, 3) : 0;

        return (
          <div key={item.model} className="group">
            <div className="flex items-center justify-between gap-3 mb-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted/50 text-[11px] font-bold text-muted-foreground tabular-nums">
                  {rank + 1}
                </span>
                <ModelBadge model={item.model} />
              </div>
              <div className="text-right shrink-0">
                <div className="text-sm font-bold text-foreground tabular-nums">
                  {fmtCost(item.cost)}
                </div>
                <div className="text-[11px] text-muted-foreground tabular-nums">
                  {share >= 0.1 ? `${share.toFixed(1)}%` : "<0.1%"} of total
                </div>
              </div>
            </div>
            <div className="relative h-2.5 rounded-full bg-muted/30 overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 rounded-full transition-all duration-700 ease-out group-hover:brightness-110"
                style={{
                  width: `${visibleBar}%`,
                  background: `linear-gradient(90deg, ${color}, ${color}88)`,
                  boxShadow: item.cost > 0 ? `0 0 16px ${color}33` : undefined,
                }}
              />
            </div>
          </div>
        );
      })}

      <div className="flex items-center justify-between pt-3 border-t border-border/40 text-xs text-muted-foreground">
        <span>{sorted.length} models tracked</span>
        <span className="font-medium text-foreground tabular-nums">
          Total {fmtCost(total)}
        </span>
      </div>
    </div>
  );
}

export function CalendarChart({ data }: { data: { day: string; value: number }[] }) {
  const [hovered, setHovered] = useState<{
    day: string;
    value: number;
    x: number;
    y: number;
  } | null>(null);
  const { heat: heatColors, isDark } = useChartPalette();

  const heat = useMemo(() => buildActivityHeatmap(data), [data]);

  if (!data.length || !heat) return null;

  const { cells, months, weekCount, maxValue, stats } = heat;
  const CELL = 13;
  const GAP = 3;

  return (
    <div className="space-y-4">
      {/* Stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { icon: Calendar, label: "Active days", value: String(stats.activeDays) },
          { icon: Flame, label: "Peak day", value: fmtCost(stats.peakValue) },
          { icon: TrendingUp, label: "Daily avg", value: fmtCost(stats.avgActive) },
          { icon: Calendar, label: "Period total", value: fmtCost(stats.total) },
        ].map(({ icon: Icon, label, value }) => (
          <div
            key={label}
            className="rounded-xl border border-border/40 bg-card/30 px-3 py-2.5 flex items-center gap-2.5"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon className="h-3.5 w-3.5" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
              <div className="text-sm font-bold tabular-nums truncate">{value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Heatmap grid */}
      <div className="relative rounded-xl border border-border/40 heatmap-panel p-4 overflow-x-auto">
        <div className="inline-flex flex-col min-w-min">
          {/* Month labels */}
          <div
            className="relative h-6 mb-2 ml-7"
            style={{ width: weekCount * (CELL + GAP) - GAP }}
          >
            {months.map((m, i) => {
              const nextCol = months[i + 1]?.colStart ?? weekCount;
              const span = nextCol - m.colStart;
              // Hide if columns overlap (too narrow to read)
              if (span < 1) return null;
              return (
                <span
                  key={`${m.label}-${m.colStart}-${m.year}`}
                  className="absolute text-[11px] font-semibold text-foreground uppercase tracking-wide whitespace-nowrap"
                  style={{
                    left: m.colStart * (CELL + GAP),
                    maxWidth: span * (CELL + GAP) - 2,
                  }}
                >
                  {m.label}
                </span>
              );
            })}
          </div>

          <div className="flex gap-0">
            {/* Weekday labels */}
            <div
              className="flex flex-col justify-between pr-2 text-[9px] font-medium text-muted-foreground select-none"
              style={{ height: 7 * CELL + 6 * GAP, paddingTop: CELL * 0.5, paddingBottom: CELL * 0.5 }}
            >
              <span>Mon</span>
              <span>Wed</span>
              <span>Fri</span>
            </div>

            {/* Cells — columns are weeks, rows are weekdays */}
            <div
              className="grid grid-flow-col grid-rows-7 gap-[2px] rounded-sm p-[2px]"
              style={{
                gridAutoColumns: `${CELL}px`,
                backgroundColor: CHART_SEGMENT_BORDER,
              }}
              onMouseLeave={() => setHovered(null)}
            >
              {cells.map((cell, i) => {
                if (!cell) {
                  return (
                    <div
                      key={`empty-${i}`}
                      className="rounded-[3px] bg-transparent"
                      style={{ width: CELL, height: CELL }}
                    />
                  );
                }

                const level = heatLevel(cell.value, maxValue);
                const isHot = level >= 4;
                const isHovered = hovered?.day === cell.day;
                const cellColor = levelColor(level, heatColors);

                return (
                  <button
                    key={cell.day}
                    type="button"
                    className={cn(
                      "rounded-[2px] transition-all duration-200 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
                      "ring-1 ring-[#0a0b0d]",
                      isHot && "heatmap-cell-glow",
                      isHovered
                        ? "scale-[1.35] z-20 brightness-125 ring-2 ring-[#0a0b0d]"
                        : "hover:scale-125 hover:z-10 hover:brightness-110"
                    )}
                    style={{
                      width: CELL,
                      height: CELL,
                      background: cellColor,
                      ["--heat-glow" as string]: cellColor,
                      boxShadow: isHot
                        ? `0 0 ${isHovered ? 14 : 8}px ${cellColor}${isDark ? "66" : "99"}`
                        : undefined,
                    }}
                    onMouseEnter={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      setHovered({
                        day: cell.day,
                        value: cell.value,
                        x: rect.left + rect.width / 2,
                        y: rect.top,
                      });
                    }}
                    aria-label={`${formatHeatDate(cell.day)}: ${fmtCost(cell.value)}`}
                  />
                );
              })}
            </div>
          </div>
        </div>

        {/* Floating tooltip */}
        {hovered && (
          <div
            className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-full"
            style={{ left: hovered.x, top: hovered.y - 10 }}
          >
            <div className="rounded-lg border border-primary/30 bg-popover/95 backdrop-blur-md px-3 py-2 shadow-xl shadow-primary/10">
              <div className="text-[11px] font-medium text-muted-foreground">
                {formatHeatDate(hovered.day)}
              </div>
              <div className="text-sm font-bold text-primary tabular-nums mt-0.5">
                {hovered.value > 0 ? fmtCost(hovered.value) : "No activity"}
              </div>
              {hovered.value > 0 && maxValue > 0 && (
                <div className="text-[10px] text-muted-foreground mt-0.5 tabular-nums">
                  {((hovered.value / maxValue) * 100).toFixed(0)}% of peak day
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Intensity legend */}
      <div className="flex items-center justify-end gap-2 text-[10px] text-muted-foreground">
        <span>Less</span>
        <div className="h-2.5 w-28 rounded-full heatmap-legend-track ring-1 ring-border/40" />
        <span>More</span>
      </div>
    </div>
  );
}

function heatLevel(value: number, max: number): number {
  if (value <= 0 || max <= 0) return 0;
  const t = value / max;
  if (t <= 0.08) return 1;
  if (t <= 0.22) return 2;
  if (t <= 0.45) return 3;
  if (t <= 0.68) return 4;
  if (t <= 0.88) return 5;
  return 6;
}

function levelColor(level: number, palette: string[]): string {
  return palette[Math.min(level, palette.length - 1)];
}

function parseDayKey(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatHeatDate(day: string): string {
  return parseDayKey(day).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

type HeatCell = { day: string; value: number; date: Date };

function buildActivityHeatmap(data: { day: string; value: number }[]) {
  if (!data.length) return null;

  const valueByDay = new Map(data.map((d) => [d.day, d.value]));
  const sorted = [...data].sort((a, b) => a.day.localeCompare(b.day));

  const firstDay = parseDayKey(sorted[0].day);
  const lastDay = parseDayKey(sorted[sorted.length - 1].day);

  // Span full calendar year(s) so month labels always have room to render
  const start = new Date(firstDay.getFullYear(), 0, 1);
  const end = new Date(lastDay.getFullYear(), 11, 31);
  start.setDate(start.getDate() - start.getDay());
  end.setDate(end.getDate() + (6 - end.getDay()));

  const cells: (HeatCell | null)[] = [];
  const months: { label: string; colStart: number; year: number }[] = [];
  let lastMonthKey = "";

  const cursor = new Date(start);
  while (cursor <= end) {
    const weekCol = Math.floor(cells.length / 7);
    const monthKey = `${cursor.getFullYear()}-${cursor.getMonth()}`;

    // Label the week column when the month first appears
    if (monthKey !== lastMonthKey) {
      const isJanuary = cursor.getMonth() === 0;
      const showYear = isJanuary || months.length === 0;
      months.push({
        label: cursor.toLocaleDateString(undefined, {
          month: "short",
          ...(showYear ? { year: "numeric" } : {}),
        }),
        colStart: weekCol,
        year: cursor.getFullYear(),
      });
      lastMonthKey = monthKey;
    }

    const key = dayKey(cursor);
    cells.push({
      day: key,
      value: valueByDay.get(key) ?? 0,
      date: new Date(cursor),
    });
    cursor.setDate(cursor.getDate() + 1);
  }

  while (cells.length % 7 !== 0) cells.push(null);

  const weekCount = cells.length / 7;
  const maxValue = Math.max(...data.map((d) => d.value), 0.0001);
  const activeDays = data.filter((d) => d.value > 0).length;
  const total = data.reduce((s, d) => s + d.value, 0);
  const peak = data.reduce((best, d) => (d.value > best.value ? d : best), data[0]);
  const avgActive = activeDays > 0 ? total / activeDays : 0;

  return {
    cells,
    months,
    weekCount,
    maxValue,
    stats: {
      activeDays,
      total,
      peakValue: peak.value,
      peakDay: peak.day,
      avgActive,
    },
  };
}

export function StreamChart({ data, keys }: { data: Analytics["stream"]; keys: string[] }) {
  const { nivo, segmentBorder } = useChartPalette();
  if (!data.length || !keys.length) return null;
  const dates = data.map((d) => String(d.date));
  return (
    <div className="h-[300px] w-full">
      <ResponsiveStream
        data={data as never}
        keys={keys}
        margin={{ top: 16, right: 16, bottom: 56, left: 56 }}
        offsetType="silhouette"
        curve="monotoneX"
        colors={keys.map(modelColor)}
        borderColor={segmentBorder}
        borderWidth={2}
        fillOpacity={0.88}
        axisBottom={{
          tickRotation: dates.length > 8 ? -35 : 0,
          format: (i: number) => dates[i]?.slice(5) ?? "",
          tickSize: 0,
          tickPadding: 8,
        }}
        axisLeft={{
          legend: "tokens",
          legendOffset: -48,
          legendPosition: "middle",
          tickSize: 0,
          tickPadding: 8,
        }}
        theme={nivo}
        enableGridX={false}
        enableGridY
      />
    </div>
  );
}

function useContainerSize(ref: React.RefObject<HTMLDivElement | null>) {
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const update = () => {
      setSize({ width: el.clientWidth, height: el.clientHeight });
    };
    update();

    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);

  return size;
}

type TreemapLeaf = { name: string; value: number; color: string; pct: number };

function ProjectMapTile({
  leaf,
  isActive,
  onEnter,
  onLeave,
  style,
  className,
  compact = false,
}: {
  leaf: TreemapLeaf;
  isActive: boolean;
  onEnter: () => void;
  onLeave: () => void;
  style?: React.CSSProperties;
  className?: string;
  compact?: boolean;
}) {
  const name = formatProjectName(leaf.name);

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg transition-all duration-200",
        "min-w-[72px] min-h-[72px]",
        "ring-1 ring-inset ring-[#0a0b0d]/90",
        isActive ? "ring-2 ring-primary/50 shadow-lg shadow-black/40 z-10 brightness-105" : "hover:brightness-105",
        className
      )}
      style={{
        ...style,
        background: `linear-gradient(155deg, ${leaf.color} 0%, ${leaf.color}aa 100%)`,
      }}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      title={`${name} · ${fmtCost(leaf.value)} (${leaf.pct.toFixed(1)}%)`}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-50"
        style={{
          background: `radial-gradient(ellipse 90% 80% at 20% 10%, rgba(255,255,255,0.18), transparent 55%)`,
        }}
      />

      {!compact && leaf.pct >= 12 && (
        <div className="pointer-events-none absolute top-2 right-2.5 select-none text-3xl font-bold tabular-nums text-white/20">
          {leaf.pct.toFixed(0)}%
        </div>
      )}

      {compact ? (
        <div className="flex h-full items-center justify-center p-2">
          <span className="text-center text-[11px] font-bold leading-tight text-white tabular-nums">
            {leaf.pct >= 6 ? `${leaf.pct.toFixed(0)}%` : fmtCost(leaf.value)}
          </span>
        </div>
      ) : (
        <div className="absolute inset-x-0 bottom-0 border-t border-white/10 bg-black/60 px-3 py-2.5 backdrop-blur-sm">
          <p className="line-clamp-2 text-xs font-semibold leading-snug text-white" title={leaf.name}>
            {name}
          </p>
          <div className="mt-1.5 flex items-baseline justify-between gap-2">
            <span className="text-base font-bold tabular-nums text-white">{fmtCost(leaf.value)}</span>
            <span className="shrink-0 text-[11px] font-medium tabular-nums text-white/70">
              {leaf.pct.toFixed(1)}%
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export function TreemapChart({ data }: { data: TreeNode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { width, height } = useContainerSize(containerRef);
  const [activeId, setActiveId] = useState<string | null>(null);

  const leaves = useMemo((): TreemapLeaf[] => {
    const items =
      data.children
        ?.filter((c) => (c.value ?? 0) > 0)
        .map((c) => ({ name: c.name, value: c.value ?? 0 }))
        .sort((a, b) => b.value - a.value) ?? [];
    const total = items.reduce((s, i) => s + i.value, 0);
    return items.map((item, i) => ({
      ...item,
      color: PROJECT_PALETTE[i % PROJECT_PALETTE.length],
      pct: total > 0 ? (item.value / total) * 100 : 0,
    }));
  }, [data]);

  const total = useMemo(() => leaves.reduce((s, l) => s + l.value, 0), [leaves]);

  const layout = useMemo(() => {
    if (!width || !height || !leaves.length) return [];

    type HierarchyDatum = { name: string; value?: number; children?: HierarchyDatum[] };
    const root = hierarchy<HierarchyDatum>({ name: "root", children: leaves })
      .sum((d) => d.value ?? 0)
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

    treemap<HierarchyDatum>()
      .tile(treemapSquarify.ratio(1.08))
      .size([width, height])
      .paddingInner(6)
      .paddingOuter(0)
      .round(true)(root);

    return root.leaves().map((node) => {
      const leaf = leaves.find((l) => l.name === node.data.name)!;
      return {
        ...leaf,
        x: node.x0,
        y: node.y0,
        w: node.x1 - node.x0,
        h: node.y1 - node.y0,
      };
    });
  }, [leaves, width, height]);

  if (!leaves.length) return null;

  const useStrip = leaves.length <= 5;

  return (
    <div className="space-y-3">
      {useStrip ? (
        /* Proportional strip — reads well with 2–5 projects in a card */
        <div
          className={cn(
            "flex gap-0.5 rounded-xl p-0.5",
            leaves.length <= 2 ? "min-h-[200px] flex-col sm:flex-row" : "min-h-[180px] flex-row flex-wrap"
          )}
          style={{ backgroundColor: CHART_SEGMENT_BORDER }}
        >
          {leaves.map((leaf) => (
            <ProjectMapTile
              key={leaf.name}
              leaf={leaf}
              isActive={activeId === leaf.name}
              onEnter={() => setActiveId(leaf.name)}
              onLeave={() => setActiveId(null)}
              style={{
                flex: leaves.length <= 2 ? `${leaf.value} 1 0%` : `${leaf.value} 1 1 140px`,
              }}
              className={leaves.length <= 2 ? "min-h-[120px] flex-1" : "h-[160px] flex-[1_1_140px]"}
            />
          ))}
        </div>
      ) : (
        /* Classic treemap for many projects */
        <div
          ref={containerRef}
          className="relative h-[280px] w-full overflow-hidden rounded-xl p-0.5 ring-1 ring-border/40"
          style={{ backgroundColor: CHART_SEGMENT_BORDER }}
        >
          {layout.map((tile) => {
            const compact = tile.w < 100 || tile.h < 88;
            return (
              <ProjectMapTile
                key={tile.name}
                leaf={tile}
                compact={compact}
                isActive={activeId === tile.name}
                onEnter={() => setActiveId(tile.name)}
                onLeave={() => setActiveId(null)}
                style={{
                  position: "absolute",
                  left: tile.x,
                  top: tile.y,
                  width: tile.w,
                  height: tile.h,
                }}
              />
            );
          })}
          {layout.length === 0 && (
            <div className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">
              Loading…
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-between border-t border-border/40 pt-2.5 text-xs text-muted-foreground">
        <span>{leaves.length} projects</span>
        <span className="font-medium tabular-nums text-foreground">{fmtCost(total)} total</span>
      </div>
    </div>
  );
}

export function CostLineChart({ data }: { data: Analytics["cost_over_time"] }) {
  const { nivo } = useChartPalette();
  if (!data.length) return null;
  const series = [
    {
      id: "cost",
      color: "#e08a6b",
      data: data.map((d) => ({ x: d.date.slice(5), y: d.cost })),
    },
  ];
  return (
    <div className="h-[260px] w-full">
      <ResponsiveLine
        data={series}
        margin={{ top: 16, right: 20, bottom: 48, left: 56 }}
        xScale={{ type: "point" }}
        yScale={{ type: "linear", min: "auto", max: "auto", stacked: false }}
        curve="monotoneX"
        axisBottom={{ tickSize: 0, tickPadding: 8, tickRotation: data.length > 10 ? -35 : 0 }}
        axisLeft={{
          tickSize: 0,
          tickPadding: 8,
          format: (v: number) => fmtCost(v),
          legend: "cost",
          legendOffset: -48,
          legendPosition: "middle",
        }}
        enableGridX={false}
        pointSize={6}
        pointColor={{ theme: "background" }}
        pointBorderWidth={2}
        pointBorderColor={{ from: "serieColor" }}
        enableArea
        areaOpacity={0.12}
        useMesh
        theme={nivo}
        colors={["#e08a6b"]}
        tooltip={({ point }) => (
          <ChartTooltip
            label={String(point.data.xFormatted)}
            value={fmtCost(Number(point.data.yFormatted))}
          />
        )}
        motionConfig="gentle"
      />
    </div>
  );
}
