import { useMemo, useState } from "react";
import { PanResponder, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Line, Polyline } from "react-native-svg";
import { makeUseStyles, useTheme } from "../../theme/ThemeContext";
import { radii, spacing } from "../../theme/spacing";
import { formatMediumDate } from "../../utils/date";
import { formatNumber } from "../../utils/derive";
import type { BodyAnalysisWeightPoint } from "../../api/types";

const PAD = 12;
const TOOLTIP_WIDTH = 132;

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function trailingAverage(points: BodyAnalysisWeightPoint[], index: number): number | null {
  const cutoff = new Date(`${points[index].date}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - 6);
  const values = points
    .slice(0, index + 1)
    .filter((point) => new Date(`${point.date}T00:00:00Z`) >= cutoff)
    .map((point) => point.kg);
  return average(values);
}

/**
 * Weight sparkline with point inspection: tap or drag across the plot to read
 * the date, that weigh-in, and its trailing 7-day average. Touch is the mobile
 * equivalent of hover; the selected point stays visible until another is picked.
 */
export function WeightChart({
  points,
  width,
  height = 140,
  color,
}: {
  points: BodyAnalysisWeightPoint[];
  width: number;
  height?: number;
  color?: string;
}) {
  const { colors, typography } = useTheme();
  const styles = useStyles();
  const [active, setActive] = useState<number | null>(null);
  const stroke = color ?? colors.primary;

  const geometry = useMemo(() => {
    if (points.length === 0) return null;
    const values = points.map((point) => point.kg);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const flat = min === max;
    const step = points.length > 1 ? (width - PAD * 2) / (points.length - 1) : 0;
    const coordinates = points.map((point, index) => ({
      x: PAD + index * step,
      y: flat ? height / 2 : PAD + (height - PAD * 2) * (1 - (point.kg - min) / span),
    }));
    return { min, max, step, coordinates };
  }, [height, points, width]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (event) => {
          if (!geometry) return;
          const index = Math.max(
            0,
            Math.min(
              points.length - 1,
              Math.round((event.nativeEvent.locationX - PAD) / (geometry.step || 1)),
            ),
          );
          setActive(index);
        },
        onPanResponderMove: (event) => {
          if (!geometry) return;
          const index = Math.max(
            0,
            Math.min(
              points.length - 1,
              Math.round((event.nativeEvent.locationX - PAD) / (geometry.step || 1)),
            ),
          );
          setActive(index);
        },
      }),
    [geometry, points.length],
  );

  if (!geometry || points.length === 0) return null;

  const selected = active != null ? points[active] : null;
  const selectedPoint = active != null ? geometry.coordinates[active] : null;
  const selectedAverage = active != null ? trailingAverage(points, active) : null;
  const tooltipLeft =
    selectedPoint != null
      ? Math.max(0, Math.min(width - TOOLTIP_WIDTH, selectedPoint.x - TOOLTIP_WIDTH / 2))
      : 0;
  const tooltipTop =
    selectedPoint != null
      ? selectedPoint.y < 80
        ? Math.min(height - 84, selectedPoint.y + 12)
        : selectedPoint.y - 84
      : 0;

  return (
    <View style={{ width, height }} {...panResponder.panHandlers}>
      <Svg width={width} height={height}>
        <Polyline
          points={geometry.coordinates.map((point) => `${point.x},${point.y}`).join(" ")}
          fill="none"
          stroke={stroke}
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {points.map((point, index) => (
          <Circle
            key={`${point.date}-${index}`}
            cx={geometry.coordinates[index].x}
            cy={geometry.coordinates[index].y}
            r={active === index ? 5 : 2.5}
            fill={stroke}
          />
        ))}
        {selectedPoint ? (
          <>
            <Line
              x1={selectedPoint.x}
              y1={PAD}
              x2={selectedPoint.x}
              y2={height - PAD}
              stroke={colors.borderStrong}
              strokeDasharray="3 3"
            />
            <Circle
              cx={selectedPoint.x}
              cy={selectedPoint.y}
              r={7}
              fill={stroke}
              opacity={0.18}
            />
            <Circle cx={selectedPoint.x} cy={selectedPoint.y} r={4.5} fill={stroke} />
          </>
        ) : null}
      </Svg>

      {selected ? (
        <View
          pointerEvents="none"
          style={[styles.tooltip, { left: tooltipLeft, top: tooltipTop }]}
        >
          <Text style={styles.tooltipDate}>{formatMediumDate(selected.date)}</Text>
          <Text style={styles.tooltipValue}>{selected.kg.toFixed(1)} kg</Text>
          {selectedAverage != null ? (
            <Text style={[typography.caption, styles.tooltipAverage]}>
              7-day avg {selectedAverage.toFixed(1)} kg
            </Text>
          ) : null}
          {selected.calories != null || selected.protein_g != null ? (
            <Text style={[typography.caption, styles.tooltipAverage]}>
              {selected.calories != null ? `${formatNumber(selected.calories)} kcal` : ""}
              {selected.calories != null && selected.protein_g != null ? " · " : ""}
              {selected.protein_g != null ? `${formatNumber(selected.protein_g)} g protein` : ""}
            </Text>
          ) : null}
        </View>
      ) : null}

      <View style={styles.rangeRow} pointerEvents="none">
        <Text style={[typography.caption, styles.rangeLabel]}>{geometry.max.toFixed(1)} kg</Text>
        <Text style={[typography.caption, styles.rangeLabel]}>{geometry.min.toFixed(1)} kg</Text>
      </View>
    </View>
  );
}

const useStyles = makeUseStyles((t) =>
  StyleSheet.create({
    tooltip: {
      position: "absolute",
      width: TOOLTIP_WIDTH,
      paddingHorizontal: spacing.sm,
      paddingVertical: 6,
      borderRadius: radii.sm,
      backgroundColor: t.colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.colors.borderStrong,
      gap: 1,
    },
    tooltipDate: { ...t.typography.caption, color: t.colors.textDim },
    tooltipValue: { fontSize: 15, fontWeight: "700", color: t.colors.text },
    tooltipAverage: { color: t.colors.textMuted },
    rangeRow: {
      position: "absolute",
      bottom: 0,
      left: 0,
      right: 0,
      flexDirection: "row",
      justifyContent: "space-between",
      paddingHorizontal: 2,
    },
    rangeLabel: { color: t.colors.textMuted },
  }),
);
