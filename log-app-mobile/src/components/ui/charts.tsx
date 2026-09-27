import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, G, Polyline } from "react-native-svg";
import { makeUseStyles, useTheme } from "../../theme/ThemeContext";
import { radii, spacing } from "../../theme/spacing";
import type { VolumeBar } from "../../utils/derive";
import { formatNumber } from "../../utils/derive";

/* --------------------------------------------------------------- BarChart */

export function BarChart({ data, height = 160 }: { data: VolumeBar[]; height?: number }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const max = Math.max(1, ...data.map((d) => d.value));
  const maxIndex = data.reduce((best, d, i) => (d.value > data[best].value ? i : best), 0);
  const barArea = height - 44;

  return (
    <View style={[styles.barWrap, { height: height + 12 }]}>
      {data.map((d, i) => {
        const isMax = i === maxIndex && d.value > 0;
        const h = d.value > 0 ? Math.max(6, (d.value / max) * barArea) : 4;
        return (
          <View key={d.iso} style={styles.barCol}>
            {isMax ? (
              <View style={styles.barTooltip}>
                <Text style={styles.barTooltipText}>{formatNumber(d.value)} kg</Text>
              </View>
            ) : null}
            <View
              style={[
                styles.bar,
                { height: h, backgroundColor: isMax ? colors.chartBarActive : colors.chartBar },
              ]}
            />
            <Text style={styles.barLabel}>{d.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

/* ------------------------------------------------------------- DonutChart */

export interface DonutSlice {
  label: string;
  value: number;
  color: string;
}

export function DonutChart({
  slices,
  size = 132,
  thickness = 18,
  centerTop,
  centerBottom,
}: {
  slices: DonutSlice[];
  size?: number;
  thickness?: number;
  centerTop?: string;
  centerBottom?: string;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  const lengths = slices.map((s) => (total > 0 ? (s.value / total) * circumference : 0));
  const offsets = lengths.map((_, i) =>
    lengths.slice(0, i).reduce((sum, l) => sum + l, 0),
  );

  const arcs = slices.map((s, i) => (
    <Circle
      key={s.label}
      cx={center}
      cy={center}
      r={radius}
      stroke={s.color}
      strokeWidth={thickness}
      fill="none"
      strokeDasharray={[lengths[i], circumference - lengths[i]]}
      strokeDashoffset={-offsets[i]}
      strokeLinecap="butt"
    />
  ));

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <G rotation={-90} origin={`${center}, ${center}`}>
          <Circle cx={center} cy={center} r={radius} stroke={colors.chartTrack} strokeWidth={thickness} fill="none" />
          {arcs}
        </G>
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.donutCenter]}>
        {centerTop ? <Text style={styles.donutTop}>{centerTop}</Text> : null}
        {centerBottom ? <Text style={styles.donutBottom}>{centerBottom}</Text> : null}
      </View>
    </View>
  );
}

/* -------------------------------------------------------------- Sparkline */

export function Sparkline({
  values,
  width = 300,
  height = 120,
  color,
}: {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
}) {
  const { colors, typography } = useTheme();
  const styles = useStyles();
  const stroke = color ?? colors.primary;
  if (values.length === 0) {
    return (
      <View style={[styles.sparkEmpty, { height }]}>
        <Text style={typography.small}>No data yet</Text>
      </View>
    );
  }

  const pad = 12;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = values.length > 1 ? (width - pad * 2) / (values.length - 1) : 0;

  const points = values.map((v, i) => ({
    x: pad + i * step,
    y: pad + (height - pad * 2) * (1 - (v - min) / span),
  }));

  const last = points[points.length - 1];

  return (
    <Svg width={width} height={height}>
      <Polyline
        points={points.map((p) => `${p.x},${p.y}`).join(" ")}
        fill="none"
        stroke={stroke}
        strokeWidth={2.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {points.map((p, i) => (
        <Circle key={i} cx={p.x} cy={p.y} r={i === points.length - 1 ? 4 : 2.5} fill={stroke} />
      ))}
      <Circle cx={last.x} cy={last.y} r={7} fill={stroke} opacity={0.15} />
    </Svg>
  );
}

const useStyles = makeUseStyles((t) =>
  StyleSheet.create({
    barWrap: {
      flexDirection: "row",
      alignItems: "flex-end",
      gap: spacing.sm,
    },
    barCol: { flex: 1, alignItems: "center", justifyContent: "flex-end", gap: 6 },
    bar: { width: "62%", borderRadius: 6 },
    barLabel: { ...t.typography.caption, color: t.colors.textDim },
    barTooltip: {
      backgroundColor: t.colors.chartBarActive,
      paddingHorizontal: spacing.sm,
      paddingVertical: 3,
      borderRadius: radii.sm,
      marginBottom: 2,
    },
    barTooltipText: { color: t.colors.onPrimary, fontSize: 10, fontWeight: "700" },

    donutCenter: { alignItems: "center", justifyContent: "center" },
    donutTop: { ...t.typography.h2, fontSize: 22 },
    donutBottom: { ...t.typography.caption, color: t.colors.textDim },

    sparkEmpty: { alignItems: "center", justifyContent: "center" },
  }),
);
