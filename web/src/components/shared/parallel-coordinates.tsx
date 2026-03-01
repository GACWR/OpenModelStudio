"use client";

interface Run {
  id: string;
  name: string;
  metrics: Record<string, number>;
  color?: string;
}

interface ParallelCoordinatesProps {
  runs: Run[];
  dimensions: string[];
  height?: number;
}

export function ParallelCoordinates({
  runs,
  dimensions,
  height = 300,
}: ParallelCoordinatesProps) {
  const padding = { top: 30, bottom: 20, left: 60, right: 60 };
  const width = 800;
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const ranges = dimensions.map((dim) => {
    const vals = runs.map((r) => r.metrics[dim] ?? 0);
    return { min: Math.min(...vals), max: Math.max(...vals) };
  });

  const xScale = (i: number) =>
    padding.left + (i / (dimensions.length - 1)) * innerW;
  const yScale = (val: number, i: number) => {
    const { min, max } = ranges[i];
    if (max === min) return padding.top + innerH / 2;
    return padding.top + (1 - (val - min) / (max - min)) * innerH;
  };

  const defaultColors = ["#ffffff", "#d4d4d4", "#a3a3a3", "#737373", "#525252"];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full"
      style={{ maxHeight: height }}
    >
      {/* Axes */}
      {dimensions.map((dim, i) => (
        <g key={dim}>
          <line
            x1={xScale(i)}
            y1={padding.top}
            x2={xScale(i)}
            y2={padding.top + innerH}
            stroke="#404040"
            strokeWidth={1}
          />
          <text
            x={xScale(i)}
            y={padding.top - 10}
            textAnchor="middle"
            fill="#a3a3a3"
            fontSize={11}
          >
            {dim}
          </text>
        </g>
      ))}

      {/* Lines */}
      {runs.map((run, ri) => {
        const points = dimensions
          .map((dim, i) => `${xScale(i)},${yScale(run.metrics[dim] ?? 0, i)}`)
          .join(" ");
        return (
          <polyline
            key={run.id}
            points={points}
            fill="none"
            stroke={run.color || defaultColors[ri % defaultColors.length]}
            strokeWidth={2}
            strokeOpacity={0.7}
          />
        );
      })}
    </svg>
  );
}
