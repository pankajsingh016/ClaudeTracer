/** Dark outline between chart segments — used in both light and dark UI themes. */
export const CHART_SEGMENT_BORDER = "#0a0b0d";

export const HEAT_COLORS_DARK = [
  "#16181d",
  "#2a1814",
  "#5c3020",
  "#8a4530",
  "#c96a4a",
  "#e08a6b",
  "#f0a890",
];

export const HEAT_COLORS_LIGHT = [
  "#e8eaef",
  "#fdeee8",
  "#f8d4c4",
  "#f0b49a",
  "#e89474",
  "#d97757",
  "#c45a3a",
];

export function getNivoTheme(isDark: boolean) {
  const text = isDark ? "#94a3b8" : "#64748b";
  const textBright = isDark ? "#e2e8f0" : "#1e293b";
  const grid = isDark ? "#262a31" : "#e2e8f0";

  return {
    background: "transparent",
    text: { fill: text, fontSize: 11, fontFamily: "Inter, sans-serif" },
    axis: {
      domain: { line: { stroke: grid, strokeWidth: 1 } },
      ticks: {
        line: { stroke: grid, strokeWidth: 1 },
        text: { fill: text, fontSize: 10 },
      },
      legend: { text: { fill: textBright, fontSize: 11 } },
    },
    grid: { line: { stroke: grid, strokeWidth: 1, strokeDasharray: "4 4" } },
    crosshair: { line: { stroke: "#e08a6b", strokeWidth: 1, strokeOpacity: 0.6 } },
    tooltip: {
      container: {
        background: isDark ? "#191c21" : "#ffffff",
        color: textBright,
        fontSize: 12,
        borderRadius: 8,
        boxShadow: isDark ? "0 8px 32px rgba(0,0,0,0.5)" : "0 8px 24px rgba(0,0,0,0.12)",
        border: isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(0,0,0,0.08)",
        padding: "8px 12px",
      },
    },
    labels: { text: { fill: textBright, fontSize: 11 } },
  };
}
