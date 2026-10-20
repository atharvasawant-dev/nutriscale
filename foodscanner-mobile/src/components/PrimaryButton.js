import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, shadows, spacing } from '../theme';

export default function PrimaryButton({
  children,
  onPress,
  disabled = false,
  loading = false,
  variant = 'primary',
  icon = null,
  style,
}) {
  const isOutline = variant === 'outline';
  const isSecondary = variant === 'secondary';
  const isDanger = variant === 'danger';

  return (
    <Pressable
      style={({ pressed }) => [
        styles.button,
        isOutline && styles.outlineButton,
        isSecondary && styles.secondaryButton,
        isDanger && styles.dangerButton,
        disabled && styles.disabledButton,
        pressed && !disabled && styles.pressedButton,
        style,
      ]}
      onPress={onPress}
      disabled={disabled || loading}
    >
      {loading ? (
        <ActivityIndicator color={isOutline || isSecondary ? colors.emerald : colors.white} size="small" />
      ) : (
        <View style={styles.contentRow}>
          {icon ? <View style={styles.iconWrap}>{icon}</View> : null}
          <Text
            style={[
              styles.text,
              isOutline && styles.outlineText,
              isSecondary && styles.secondaryText,
              isDanger && styles.dangerText,
              disabled && styles.disabledText,
            ]}
          >
            {children}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: colors.emerald,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    marginTop: spacing.sm,
    flexDirection: 'row',
    ...shadows.md,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrap: {
    marginRight: 8,
  },
  pressedButton: {
    opacity: 0.9,
    transform: [{ scale: 0.985 }],
  },
  disabledButton: {
    backgroundColor: colors.border,
    shadowOpacity: 0,
    elevation: 0,
  },
  outlineButton: {
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.emerald,
    shadowOpacity: 0,
    elevation: 0,
  },
  secondaryButton: {
    backgroundColor: colors.surface,
    shadowOpacity: 0,
    elevation: 0,
  },
  dangerButton: {
    backgroundColor: colors.danger,
  },
  text: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  outlineText: {
    color: colors.emerald,
  },
  secondaryText: {
    color: colors.charcoal,
  },
  dangerText: {
    color: colors.white,
  },
  disabledText: {
    color: colors.muted,
  },
});

