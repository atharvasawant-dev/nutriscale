import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '../theme';

export default function SectionHeader({ children, rightAction = null }) {
  return (
    <View style={styles.container}>
      <View style={styles.titleRow}>
        <View style={styles.indicator} />
        <Text style={styles.label}>{children}</Text>
      </View>
      {rightAction}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  indicator: {
    width: 3.5,
    height: 14,
    borderRadius: 2,
    backgroundColor: colors.emerald,
    marginRight: 8,
  },
  label: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: colors.textSecondary,
    textTransform: 'uppercase',
  },
});

