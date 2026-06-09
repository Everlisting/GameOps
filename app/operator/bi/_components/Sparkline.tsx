/**
 * KPI 单元右上角的迷你折线 — 内联 SVG,只示意趋势方向,不交互。
 */

export function Sparkline({
  points,
  color = "var(--chart-1)",
  width = 52,
  height = 18,
}: {
  points: number[];
  color?: string;
  width?: number;
  height?: number;
}) {
  if (points.length === 0) {
    return null;
  }
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const stepX = points.length > 1 ? (width - 4) / (points.length - 1) : 0;
  const d = points
    .map((v, i) => {
      const x = 2 + i * stepX;
      const y = height - 2 - ((v - min) / range) * (height - 4);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      className="opacity-80"
    >
      <path d={d} stroke={color} strokeWidth="1.5" fill="none" />
    </svg>
  );
}
