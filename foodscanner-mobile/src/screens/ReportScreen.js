import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

import { getHistory, getTodayFoods } from '../services/api';
import PrimaryButton from '../components/PrimaryButton';
import SectionHeader from '../components/SectionHeader';
import { colors, shadows, spacing, typography } from '../theme';

function formatValue(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return Number.isInteger(number) ? String(number) : number.toFixed(1).replace(/\.0$/, '');
}

function parseDate(value) {
  if (!value) return null;
  const normalized = String(value).replace(' ', 'T');
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateKey(value) {
  const date = parseDate(value);
  return date ? date.toISOString().slice(0, 10) : '';
}

function dayLabel(value) {
  const date = parseDate(value);
  if (!date) return 'OLDER DATES';
  const today = new Date();
  const todayKey = today.toISOString().slice(0, 10);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const yesterdayKey = yesterday.toISOString().slice(0, 10);
  const key = dateKey(value);

  if (key === todayKey) return 'TODAY';
  if (key === yesterdayKey) return 'YESTERDAY';
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase();
}

function PortionEntry({ item }) {
  const name = item.product_name || item.name || item.product || 'Saved food';
  const calories = Number(item.calories);
  const hasWeight = Number.isFinite(Number(item.weight_grams));
  const timestamp = parseDate(item.consumed_at);

  return (
    <View style={styles.entryCard}>
      <View style={styles.entryIconWrap}>
        <Ionicons name="restaurant-outline" size={20} color={colors.emerald} />
      </View>
      <View style={styles.entryBody}>
        <Text style={styles.entryName} numberOfLines={2}>{name}</Text>
        <View style={styles.entryMetaRow}>
          {hasWeight ? (
            <Text style={styles.entryWeightText}>{formatValue(item.weight_grams)} g</Text>
          ) : null}
          {timestamp ? (
            <View style={styles.timeWrap}>
              <Ionicons name="time-outline" size={12} color={colors.muted} style={{ marginRight: 3 }} />
              <Text style={styles.entryTime}>
                {timestamp.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
      <View style={styles.entryCalorieBadge}>
        <Text style={styles.entryCalorieText}>
          {Number.isFinite(calories) ? `${formatValue(calories)} kcal` : '—'}
        </Text>
      </View>
    </View>
  );
}

export default function ReportScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [todayFoods, setTodayFoods] = useState([]);
  const [legacyHistory, setLegacyHistory] = useState([]);
  const [error, setError] = useState(false);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const [todayResponse, historyResponse] = await Promise.all([getTodayFoods(), getHistory()]);
      setTodayFoods(Array.isArray(todayResponse?.foods) ? todayResponse.foods : []);
      setLegacyHistory(Array.isArray(historyResponse) ? historyResponse : []);
    } catch (_requestError) {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchHistory();
    }, [fetchHistory])
  );

  const groups = useMemo(() => {
    const savedFoods = todayFoods
      .filter((item) => item?.product_name || item?.name || item?.product)
      .sort((left, right) => String(right?.consumed_at || '').localeCompare(String(left?.consumed_at || '')));
    const grouped = new Map();
    savedFoods.forEach((item) => {
      const key = dateKey(item.consumed_at) || 'unknown';
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(item);
    });
    return Array.from(grouped.entries()).map(([key, items]) => {
      const totalDayCalories = items.reduce((sum, it) => sum + (Number(it.calories) || 0), 0);
      return {
        key,
        label: dayLabel(items[0]?.consumed_at),
        items,
        totalCalories: totalDayCalories,
      };
    });
  }, [todayFoods]);

  const hasSavedFoods = groups.length > 0;
  const hasLegacyHistory = legacyHistory.length > 0;

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color={colors.emerald} />
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.center}>
        <Ionicons name="cloud-offline-outline" size={48} color={colors.muted} style={{ marginBottom: 12 }} />
        <Text style={styles.errorTitle}>Unable to load history</Text>
        <Text style={styles.errorText}>Please check your connection and try again.</Text>
        <PrimaryButton onPress={fetchHistory} style={{ marginTop: spacing.md }}>
          TRY AGAIN
        </PrimaryButton>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.eyebrowRow}>
            <Ionicons name="calendar-outline" size={14} color={colors.emerald} style={{ marginRight: 6 }} />
            <Text style={styles.eyebrow}>NUTRITION LOG</Text>
          </View>
          <Text style={styles.title}>Food History</Text>
          <Text style={styles.subtitle}>A complete timeline of your measured portions and logged meals.</Text>
        </View>

        {!hasSavedFoods ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIconCircle}>
              <Ionicons name="fast-food-outline" size={32} color={colors.muted} />
            </View>
            <Text style={styles.emptyTitle}>No Meals Logged Yet</Text>
            <Text style={styles.emptyCopy}>
              Your saved portions and nutrition details will appear here after you scan and measure a food.
            </Text>
            <PrimaryButton
              onPress={() => navigation.navigate('Main', { screen: 'Scan' })}
              icon={<Ionicons name="scan-outline" size={18} color={colors.white} />}
              style={{ marginTop: spacing.lg }}
            >
              SCAN &amp; MEASURE FIRST MEAL
            </PrimaryButton>
          </View>
        ) : (
          groups.map((group) => (
            <View key={group.key} style={styles.groupContainer}>
              <SectionHeader
                rightAction={
                  <View style={styles.daySummaryBadge}>
                    <Text style={styles.daySummaryText}>
                      {group.items.length} items · {formatValue(group.totalCalories)} kcal
                    </Text>
                  </View>
                }
              >
                {group.label}
              </SectionHeader>

              <View style={styles.groupList}>
                {group.items.map((item, index) => (
                  <PortionEntry key={`${item.product_name}-${item.consumed_at || index}`} item={item} />
                ))}
              </View>
            </View>
          ))
        )}

        {hasLegacyHistory ? (
          <View style={styles.legacyCard}>
            <View style={styles.legacyHeader}>
              <Ionicons name="archive-outline" size={18} color={colors.muted} style={{ marginRight: 6 }} />
              <Text style={styles.legacyTitle}>Previous Scans</Text>
            </View>
            <Text style={styles.legacyText}>
              {legacyHistory.length} earlier item{legacyHistory.length === 1 ? '' : 's'} recorded in your historical scan archive.
            </Text>
          </View>
        ) : null}

        {hasSavedFoods && (
          <PrimaryButton
            onPress={() => navigation.navigate('Main', { screen: 'Scan' })}
            icon={<Ionicons name="scan-outline" size={18} color={colors.white} />}
            style={{ marginTop: spacing.md }}
          >
            SCAN &amp; MEASURE
          </PrimaryButton>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  center: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  content: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  header: {
    marginBottom: spacing.sm,
  },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: colors.emerald,
  },
  title: {
    ...typography.title,
    color: colors.charcoal,
    marginTop: 2,
  },
  subtitle: {
    ...typography.subtitle,
    color: colors.muted,
    marginTop: 4,
  },
  groupContainer: {
    marginBottom: spacing.md,
  },
  daySummaryBadge: {
    backgroundColor: colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  daySummaryText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  groupList: {
    gap: 8,
  },
  entryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: 18,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  entryIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: colors.emeraldLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  entryBody: {
    flex: 1,
  },
  entryName: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.charcoal,
  },
  entryMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 8,
  },
  entryWeightText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.emerald,
  },
  timeWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  entryTime: {
    fontSize: 12,
    color: colors.muted,
    fontWeight: '500',
  },
  entryCalorieBadge: {
    backgroundColor: colors.emeraldLight,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  entryCalorieText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.emerald,
  },
  emptyCard: {
    backgroundColor: colors.white,
    borderRadius: 24,
    padding: spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: spacing.lg,
    ...shadows.sm,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.charcoal,
  },
  emptyCopy: {
    fontSize: 13,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 19,
    marginTop: 4,
    maxWidth: 280,
  },
  legacyCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  legacyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  legacyTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textSecondary,
    textTransform: 'uppercase',
  },
  legacyText: {
    fontSize: 13,
    color: colors.muted,
    lineHeight: 18,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.charcoal,
  },
  errorText: {
    fontSize: 14,
    color: colors.muted,
    marginTop: 4,
    textAlign: 'center',
  },
});

