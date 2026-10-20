import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, shadows, spacing } from '../theme';

export default function ProductHeader({ name, meta }) {
  return (
    <View style={styles.card}>
      <View style={styles.mark}>
        <Ionicons name="nutrition" size={24} color={colors.white} />
      </View>
      <View style={styles.copy}>
        <Text style={styles.name} numberOfLines={2}>{name}</Text>
        {meta ? <Text style={styles.meta}>{meta}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
    ...shadows.sm,
  },
  mark: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.emerald,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  copy: {
    flex: 1,
  },
  name: {
    color: colors.charcoal,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  meta: {
    color: colors.muted,
    marginTop: 3,
    fontSize: 13,
    fontWeight: '500',
  },
});

