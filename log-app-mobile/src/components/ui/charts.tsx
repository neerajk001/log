import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, G, Polyline } from "react-native-svg";
import { makeUseStyles, useTheme } from "../../theme/ThemeContext";
import { radii, spacing } from "../../theme/spacing";
import type { VolumeBar } from "../../utils/derive";
import { formatNumber } from "../../utils/derive";

/* --------------------------------------------------------------- BarChart */

function formatAxisValue(n: number): string {
  if (n >= 1000) {
    const k = n / 1000;
    return `${Number.isInteger(k) ? k : k.toFixed(1)}K`;
  }
  return String(Math.round(n));
}

/** Rounds a raw step up to 1/2/5 × 10^k so axis ticks read cleanly. */
function niceStep(raw: number): number {
  if (raw <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const mult = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return mult * mag;
}

export function BarChart({
  data,
  height = 160,
  axis = false,
  color,
  target,
  unit = "kg",
}: {
  data: VolumeBar[];
  height?: number;
  axis?: boolean;
  /** Bar fill; defaults to the chart palette. */
  color?: string;
  /** Optional reference line (e.g. a nutrition target) drawn across the plot. */
  target?: number | null;
  /** Suffix for the highlighted bar's tooltip. */
  unit?: string;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const dataMax = Math.max(1, ...data.map((d) => d.value));
  const showTarget = axis && target != null && target > 0;
  const max = showTarget ? Math.max(dataMax, target as number) : dataMax;
  const maxIndex = data.reduce((best, d, i) => (d.value > data[best].value ? i : best), 0);
  const barArea = height - 44;
  const tipZone = axis ? 20 : 0;

  const step = axis ? niceStep(max / 4) : 0;
  const top = axis ? Math.ceil(max / step) * step : max;
  const scale = axis ? top : max;
  const targetTop = showTarget ? tipZone + (1 - (target as number) / scale) * barArea : null;

  const fill = color ?? colors.chartBar;
  const activeFill = color ?? colors.chartBarActive;

  // Long series (e.g. 52 weekly bars) need tighter gaps and thinned labels so
  // nothing overflows or collides.
  const barGap = data.length > 24 ? 1 : data.length > 14 ? 3 : spacing.sm;
  const labelEvery = data.length > 14 ? Math.ceil(data.length / 7) : 1;

  const bars = data.map((d, i) => {
    const isMax = i === maxIndex && d.value > 0;
    const h = d.value > 0 ? Math.max(6, (d.value / scale) * barArea) : 4;
    return (
      <View key={d.iso} style={styles.barCol}>
        {isMax ? (
          <View style={styles.barTooltip}>
            <Text style={styles.barTooltipText}>
              {formatNumber(d.value)} {unit}
            </Text>
          </View>
        ) : null}
        <View style={[styles.bar, { height: h, backgroundColor: isMax ? activeFill : fill }]} />
        {axis ? null : <Text style={styles.barLabel}>{d.label}</Text>}
      </View>
    );
  });

  if (!axis) {
    return <View style={[styles.barWrap, { gap: barGap, height: height + 12 }]}>{bars}</View>;
  }

  const tickValues: number[] = [];
  for (let v = 0; v <= top + step / 2; v += step) tickValues.push(v);
  tickValues.reverse();
  const tickCount = Math.max(1, tickValues.length - 1);

  return (
    <View style={styles.axisRow}>
      <View style={[styles.axisLabels, { height: barArea, marginTop: tipZone }]}>
        {tickValues.map((t) => (
          <Text key={t} style={styles.axisTick} numberOfLines={1}>
            {formatAxisValue(t)}
          </Text>
        ))}
      </View>
      <View style={styles.axisPlot}>
        <View style={[styles.plot, { height: barArea + tipZone }]}>
          {tickValues.map((t, i) => (
            <View key={t} style={[styles.gridline, { top: tipZone + (i / tickCount) * barArea }]} />
          ))}
          {targetTop != null ? <View style={[styles.targetLine, { top: targetTop }]} /> : null}
          <View style={[styles.barsLayer, { gap: barGap, height: barArea }]}>{bars}</View>
        </View>
        <View style={[styles.labelRow, { gap: barGap }]}>
          {data.map((d, i) =>
            i % labelEvery === 0 ? (
              <Text key={d.iso} style={[styles.barLabel, styles.labelCell]}>
                {d.label}
              </Text>
            ) : (
              <View key={d.iso} style={styles.labelCell} />
            ),
          )}
        </View>
      </View>
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
  dots = true,
}: {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
  /** Set false for dense series so the markers don't merge into a thick line. */
  dots?: boolean;
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
  // A single value has no span to plot, so mirror it: a flat line reads better
  // than one lone dot (e.g. a one-week window).
  const series = values.length === 1 ? [values[0], values[0]] : values;
  const min = Math.min(...series);
  const max = Math.max(...series);
  const span = max - min || 1;
  const flat = min === max;
  const step = series.length > 1 ? (width - pad * 2) / (series.length - 1) : 0;

  const points = series.map((v, i) => ({
    x: pad + i * step,
    y: flat ? height / 2 : pad + (height - pad * 2) * (1 - (v - min) / span),
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
      {dots
        ? points.map((p, i) => (
            <Circle key={i} cx={p.x} cy={p.y} r={i === points.length - 1 ? 4 : 2.5} fill={stroke} />
          ))
        : null}
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

    axisRow: { flexDirection: "row", gap: spacing.sm },
    axisLabels: { width: 30, justifyContent: "space-between", alignItems: "flex-end" },
    axisTick: { ...t.typography.caption, color: t.colors.textMuted, fontSize: 10, lineHeight: 12 },
    axisPlot: { flex: 1 },
    plot: { position: "relative" },
    gridline: {
      position: "absolute",
      left: 0,
      right: 0,
      height: StyleSheet.hairlineWidth,
      backgroundColor: t.colors.border,
    },
    targetLine: {
      position: "absolute",
      left: 0,
      right: 0,
      height: 0,
      borderTopWidth: 1,
      borderStyle: "dashed",
      borderColor: t.colors.textMuted,
    },
    barsLayer: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      flexDirection: "row",
      alignItems: "flex-end",
      gap: spacing.sm,
    },
    labelRow: { flexDirection: "row", gap: spacing.sm, marginTop: 6 },
    labelCell: { flex: 1, textAlign: "center" },

    donutCenter: { alignItems: "center", justifyContent: "center" },
    donutTop: { ...t.typography.h2, fontSize: 22 },
    donutBottom: { ...t.typography.caption, color: t.colors.textDim },

    sparkEmpty: { alignItems: "center", justifyContent: "center" },
  }),
);
