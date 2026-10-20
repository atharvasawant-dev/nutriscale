import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, shadows, spacing } from '../theme';

function getNutrientAccent(label) {
  const l = String(label || '').toLowerCase();
  if (l.includes('protein')) return { bg: '#EFF6FF', text: '#2563EB', dot: '#3B82F6' };
  if (l.includes('carb')) return { bg: '#FEF3C7', text: '#D97706', dot: '#F59E0B' };
  if (l.includes('fat')) return { bg: '#FDF2F8', text: '#DB2777', dot: '#EC4899' };
  if (l.includes('sugar')) return { bg: '#FEF2F2', text: '#DC2626', dot: '#EF4444' };
  if (l.includes('fiber')) return { bg: '#F0FDF4', text: '#16A34A', dot: '#22C55E' };
  if (l.includes('salt')) return { bg: '#F1F5F9', text: '#475569', dot: '#64748B' };
  return { bg: colors.surface, text: colors.emerald, dot: colors.emerald };
}

export default function NutritionMetric({ label, value, unit, prominent = false }) {
  const accent = getNutrientAccent(label);

  if (prominent) {
    return (
      <View style={styles.prominentCard}>
        <View style={styles.prominentHeader}>
          <View style={styles.pulseDot} />
          <Text style={styles.prominentLabel}>{label}</Text>
        </View>
        <View style={styles.prominentValueRow}>
          <Text style={styles.prominentNumber}>{value}</Text>
          <Text style={styles.prominentUnit}>{unit}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.metricCard}>
      <View style={styles.metricHeader}>
        <View style={[styles.nutrientDot, { backgroundColor: accent.dot }]} />
        <Text style={styles.label}>{label}</Text>
      </View>
      <View style={styles.valueRow}>
        <Text style={styles.value}>{value}</Text>
        <Text style={styles.unit}>{unit}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  metricCard: {
    width: '48%',
    backgroundColor: colors.white,
    padding: spacing.md,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
    ...shadows.sm,
  },
  metricHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  nutrientDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginRight: 6,
  },
  label: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  value: {
    color: colors.charcoal,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  unit: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 3,
  },
  prominentCard: {
    width: '100%',
    backgroundColor: colors.emerald,
    borderRadius: 20,
    padding: spacing.lg,
    marginVertical: spacing.sm,
    ...shadows.md,
  },
  prominentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#6EE7B7',
    marginRight: 8,
  },
  prominentLabel: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
  },
  prominentValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  prominentNumber: {
    color: colors.white,
    fontSize: 48,
    fontWeight: '900',
    letterSpacing: -1,
  },
  prominentUnit: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 20,
    fontWeight: '700',
    marginLeft: 6,
  },
});

