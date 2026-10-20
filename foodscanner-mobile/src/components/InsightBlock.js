import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, shadows, spacing } from '../theme';

export default function InsightBlock({ value, unit, children }) {
  return (
    <View style={styles.block}>
      <View style={styles.header}>
        <View style={styles.indicator} />
        {value ? (
          <View style={styles.valueRow}>
            <Text style={styles.value}>{value}</Text>
            <Text style={styles.unit}> {unit}</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.text}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    backgroundColor: colors.white,
    padding: spacing.md,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginVertical: spacing.xs,
    ...shadows.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  indicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.emerald,
    marginRight: 8,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  value: {
    color: colors.charcoal,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  unit: {
    color: colors.emerald,
    fontSize: 14,
    fontWeight: '700',
  },
  text: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '500',
  },
});

