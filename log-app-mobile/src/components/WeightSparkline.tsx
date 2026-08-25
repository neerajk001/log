import { View, Text, StyleSheet } from "react-native";
import Svg, { Polyline, Circle, Line, Text as SvgText } from "react-native-svg";
import { colors } from "../theme/colors";
import { typography } from "../theme/typography";
import type { WeightPoint } from "../api/types";

interface WeightSparklineProps {
  data: WeightPoint[];
  height?: number;
}

export function WeightSparkline({ data, height = 140 }: WeightSparklineProps) {
  const width = 320;
  const padX = 24;
  const padY = 16;

  const values = data.map((d) => d.avg_kg).filter((v): v is number => v != null);
  if (values.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={typography.bodySmall}>No weight data yet</Text>
      </View>
    );
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;

  const points = data.map((d, i) => {
    const x = padX + (i * (width - padX * 2)) / Math.max(1, data.length - 1);
    if (d.avg_kg == null) return null;
    const y = padY + (height - padY * 2) * (1 - (d.avg_kg - min) / span);
    return { x, y, value: d.avg_kg };
  });

  const polyline = points
    .filter((p): p is { x: number; y: number; value: number } => p != null)
    .map((p) => `${p.x},${p.y}`)
    .join(" ");

  return (
    <View style={styles.container}>
      <Svg width={width} height={height}>
        <Line
          x1={padX}
          y1={height - padY}
          x2={width - padX}
          y2={height - padY}
          stroke={colors.hairline}
          strokeWidth={1}
        />
        {points.map((p, i) =>
          p == null ? null : (
            <Circle key={i} cx={p.x} cy={p.y} r={3} fill={colors.chalk} />
          ),
        )}
        {polyline ? (
          <Polyline
            points={polyline}
            fill="none"
            stroke={colors.rust}
            strokeWidth={2}
          />
        ) : null}
        <SvgText
          x={padX}
          y={padY - 4}
          fill={colors.chalkDim}
          fontFamily="JetBrainsMono"
          fontSize={10}
        >
          {max.toFixed(1)}
        </SvgText>
        <SvgText
          x={padX}
          y={height - 2}
          fill={colors.chalkDim}
          fontFamily="JetBrainsMono"
          fontSize={10}
        >
          {min.toFixed(1)}
        </SvgText>
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
  },
  empty: {
    height: 120,
    alignItems: "center",
    justifyContent: "center",
  },
});