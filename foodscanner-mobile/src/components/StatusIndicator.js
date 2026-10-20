import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '../theme';

export default function StatusIndicator({ children, variant = 'active' }) {
  const isWarning = variant === 'warning';
  return (
    <View style={[styles.status, isWarning && styles.statusWarning]}>
      <View style={[styles.dot, isWarning && styles.dotWarning]} />
      <Text style={[styles.text, isWarning && styles.textWarning]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  status: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    marginBottom: spacing.md,
  },
  statusWarning: {
    backgroundColor: '#FEF3C7',
    borderColor: '#FDE68A',
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.emerald,
    marginRight: spacing.sm,
  },
  dotWarning: {
    backgroundColor: colors.warning,
  },
  text: {
    color: colors.emeraldDark,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  textWarning: {
    color: '#92400E',
  },
});

