import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

import { getDailyReport, getTodayFoods, getUserProfile, getWeeklyReport } from '../services/api';
import PrimaryButton from '../components/PrimaryButton';
import SectionHeader from '../components/SectionHeader';
import { colors, shadows, spacing, typography } from '../theme';

function formatValue(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return Number.isInteger(number) ? String(number) : number.toFixed(1).replace(/\.0$/, '');
}

function ModernStatCard({ icon, label, value, detail, color = colors.emerald }) {
  return (
    <View style={styles.statCard}>
      <View style={styles.statHeader}>
        <View style={[styles.statIconWrap, { backgroundColor: `${color}15` }]}>
          <Ionicons name={icon} size={16} color={color} />
        </View>
        <Text style={styles.statLabel}>{label}</Text>
      </View>
      <Text style={styles.statValue}>{value}</Text>
      {detail ? <Text style={styles.statDetail}>{detail}</Text> : null}
    </View>
  );
}

export default function InsightsScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [daily, setDaily] = useState(null);
  const [weekly, setWeekly] = useState(null);
  const [todayFoods, setTodayFoods] = useState([]);
  const [error, setError] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const [nextProfile, nextDaily, nextWeekly, nextToday] = await Promise.all([
        getUserProfile(),
        getDailyReport(),
        getWeeklyReport(),
        getTodayFoods(),
      ]);
      setProfile(nextProfile);
      setDaily(nextDaily);
      setWeekly(nextWeekly);
      setTodayFoods(Array.isArray(nextToday?.foods) ? nextToday.foods : []);
    } catch (_error) {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData])
  );

  const days = Array.isArray(weekly?.days) ? weekly.days : [];
  const totalPortions = days.reduce((total, day) => total + (Number(day?.total_products_scanned) || 0), 0);
  const periodCalories = days.reduce((total, day) => total + (Number(day?.total_calories) || 0), 0);
  const averageCalories = days.length ? periodCalories / days.length : 0;
  const targetCalories = Number(profile?.daily_calorie_limit || daily?.nutrition_breakdown?.calories?.limit);
  const hasTarget = Number.isFinite(targetCalories) && targetCalories > 0;
  const hasPeriodData = days.length > 0;
  const isEarlyData = days.length < 3;
  const recentHighest = useMemo(() => (
    todayFoods
      .filter((food) => Number.isFinite(Number(food?.calories)))
      .sort((left, right) => Number(right.calories) - Number(left.calories))[0]
  ), [todayFoods]);

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
        <Text style={styles.errorTitle}>Unable to load insights</Text>
        <Text style={styles.errorText}>Please check your network connection and try again.</Text>
        <PrimaryButton onPress={fetchData} style={{ marginTop: spacing.md }}>
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
            <Ionicons name="analytics-outline" size={14} color={colors.emerald} style={{ marginRight: 6 }} />
            <Text style={styles.eyebrow}>NUTRITION INTELLIGENCE</Text>
          </View>
          <Text style={styles.title}>Insights &amp; Trends</Text>
          <Text style={styles.subtitle}>Understand your eating habits and portion balance over time.</Text>
        </View>

        {!hasPeriodData ? (
          <View style={styles.earlyStateCard}>
            <View style={styles.earlyIconCircle}>
              <Ionicons name="sparkles-outline" size={32} color={colors.emerald} />
            </View>
            <Text style={styles.earlyTitle}>Building Your Insights</Text>
            <Text style={styles.earlyCopy}>
              As you scan and weigh more meals, NutriScale will uncover your weekly calorie patterns, average intake, and standout habits.
            </Text>
            <PrimaryButton
              onPress={() => navigation.navigate('Main', { screen: 'Scan' })}
              icon={<Ionicons name="scan-outline" size={18} color={colors.white} />}
              style={{ marginTop: spacing.lg }}
            >
              SCAN A MEAL
            </PrimaryButton>
          </View>
        ) : (
          <>
            {/* Period Summary Card */}
            <View style={styles.periodCard}>
              <View style={styles.periodHeader}>
                <View style={styles.periodBadge}>
                  <Ionicons name="calendar" size={12} color={colors.white} style={{ marginRight: 4 }} />
                  <Text style={styles.periodBadgeText}>
                    {isEarlyData ? 'EARLY INSIGHTS' : 'LAST 7 DAYS'}
                  </Text>
                </View>
                <Text style={styles.periodDaysText}>
                  {days.length} logged day{days.length === 1 ? '' : 's'}
                </Text>
              </View>

              <View style={styles.periodNumberRow}>
                <Text style={styles.periodCaloriesBig}>{formatValue(periodCalories)}</Text>
                <Text style={styles.periodKcal}>kcal total</Text>
              </View>

              <View style={styles.periodMetricsRow}>
                <View style={styles.periodMetricBox}>
                  <Text style={styles.periodMetricLabel}>AVERAGE / DAY</Text>
                  <Text style={styles.periodMetricVal}>{formatValue(averageCalories)} kcal</Text>
                </View>
                <View style={styles.periodMetricDivider} />
                <View style={styles.periodMetricBox}>
                  <Text style={styles.periodMetricLabel}>TOTAL PORTIONS</Text>
                  <Text style={styles.periodMetricVal}>{formatValue(totalPortions)} meals</Text>
                </View>
              </View>
            </View>

            {/* Nutrition Patterns */}
            <SectionHeader>NUTRITION PATTERNS</SectionHeader>
            <View style={styles.statsGrid}>
              <ModernStatCard
                icon="flame-outline"
                label="TOTAL CALORIES"
                value={`${formatValue(periodCalories)} kcal`}
                detail="logged in this period"
                color={colors.emerald}
              />
              <ModernStatCard
                icon="calendar-outline"
                label="ACTIVE DAYS"
                value={`${formatValue(days.length)} days`}
                detail="with meal recordings"
                color={colors.info}
              />
              <ModernStatCard
                icon="restaurant-outline"
                label="PORTIONS WEIGHED"
                value={`${formatValue(totalPortions)}`}
                detail="measured food entries"
                color={colors.carbs}
              />
              <ModernStatCard
                icon="speedometer-outline"
                label="AVG INTAKE"
                value={`${formatValue(averageCalories)} kcal`}
                detail="per logged day"
                color={colors.protein}
              />
            </View>
          </>
        )}

        {/* Calorie Target Context */}
        {hasTarget ? (
          <View style={styles.targetCard}>
            <View style={styles.targetHeader}>
              <Ionicons name="flag-outline" size={18} color={colors.emerald} style={{ marginRight: 6 }} />
              <Text style={styles.targetTitle}>DAILY TARGET ALIGNMENT</Text>
            </View>
            <View style={styles.targetValueRow}>
              <Text style={styles.targetBigNum}>{formatValue(targetCalories)}</Text>
              <Text style={styles.targetUnit}>kcal / day target</Text>
            </View>
            {hasPeriodData ? (
              <View style={styles.targetBarWrap}>
                <View style={styles.targetTrack}>
                  <View
                    style={[
                      styles.targetFill,
                      { width: `${Math.min(100, (averageCalories / targetCalories) * 100)}%` },
                    ]}
                  />
                </View>
                <Text style={styles.targetNote}>
                  Your daily average ({formatValue(averageCalories)} kcal) is{' '}
                  {Math.round((averageCalories / targetCalories) * 100)}% of your target.
                </Text>
              </View>
            ) : (
              <Text style={styles.targetNote}>
                Log your meals throughout the day to track your intake against this target.
              </Text>
            )}
          </View>
        ) : (
          <View style={styles.goalPromptCard}>
            <View style={styles.goalPromptContent}>
              <Ionicons name="flag-outline" size={24} color={colors.emerald} style={{ marginRight: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.goalPromptTitle}>Set Your Daily Calorie Goal</Text>
                <Text style={styles.goalPromptText}>
                  Add a personal target in your profile to see adherence and progress meters here.
                </Text>
              </View>
            </View>
            <Pressable
              style={styles.goalPromptBtn}
              onPress={() => navigation.navigate('Main', { screen: 'Profile' })}
            >
              <Text style={styles.goalPromptBtnText}>Set Target in Profile ›</Text>
            </Pressable>
          </View>
        )}

        {/* Notable Logs */}
        {recentHighest ? (
          <>
            <SectionHeader>TODAY&apos;S HIGHEST CALORIE MEAL</SectionHeader>
            <View style={styles.notableCard}>
              <View style={styles.notableIconCircle}>
                <Ionicons name="flame" size={22} color={colors.warning} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.notableName} numberOfLines={1}>
                  {recentHighest.product_name || recentHighest.name || 'Saved food'}
                </Text>
                <Text style={styles.notableCalories}>
                  {formatValue(recentHighest.calories)} kcal
                </Text>
                <Text style={styles.notableSub}>Portion logged today</Text>
              </View>
            </View>
          </>
        ) : null}
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
    marginBottom: spacing.md,
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
  periodCard: {
    backgroundColor: colors.white,
    borderRadius: 24,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    ...shadows.md,
  },
  periodHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  periodBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.emerald,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  periodBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.white,
    letterSpacing: 0.5,
  },
  periodDaysText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.muted,
  },
  periodNumberRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: spacing.sm,
  },
  periodCaloriesBig: {
    fontSize: 44,
    fontWeight: '900',
    color: colors.charcoal,
    letterSpacing: -1,
  },
  periodKcal: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.muted,
    marginLeft: 6,
  },
  periodMetricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  periodMetricBox: {
    flex: 1,
    alignItems: 'center',
  },
  periodMetricDivider: {
    width: 1,
    height: 32,
    backgroundColor: colors.border,
  },
  periodMetricLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: colors.muted,
    marginBottom: 4,
  },
  periodMetricVal: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.charcoal,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: spacing.xs,
  },
  statCard: {
    width: '48.5%',
    backgroundColor: colors.white,
    borderRadius: 18,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.xs,
    ...shadows.sm,
  },
  statHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  statIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
    color: colors.textSecondary,
    flex: 1,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.charcoal,
    letterSpacing: -0.2,
  },
  statDetail: {
    fontSize: 11,
    color: colors.muted,
    marginTop: 2,
  },
  targetCard: {
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: spacing.md,
    ...shadows.sm,
  },
  targetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  targetTitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    color: colors.textSecondary,
  },
  targetValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 4,
  },
  targetBigNum: {
    fontSize: 34,
    fontWeight: '900',
    color: colors.charcoal,
  },
  targetUnit: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.muted,
    marginLeft: 6,
  },
  targetBarWrap: {
    marginTop: spacing.md,
  },
  targetTrack: {
    height: 8,
    backgroundColor: colors.surface,
    borderRadius: 4,
    overflow: 'hidden',
  },
  targetFill: {
    height: '100%',
    backgroundColor: colors.emerald,
    borderRadius: 4,
  },
  targetNote: {
    fontSize: 13,
    color: colors.muted,
    marginTop: 6,
    lineHeight: 18,
  },
  goalPromptCard: {
    backgroundColor: colors.emeraldLight,
    borderRadius: 20,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    marginTop: spacing.md,
  },
  goalPromptContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  goalPromptTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.emeraldDark,
  },
  goalPromptText: {
    fontSize: 13,
    color: '#065F46',
    marginTop: 2,
    lineHeight: 18,
  },
  goalPromptBtn: {
    alignSelf: 'flex-start',
    marginTop: spacing.md,
    backgroundColor: colors.white,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
  },
  goalPromptBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.emerald,
  },
  notableCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: 18,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  notableIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  notableName: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.charcoal,
  },
  notableCalories: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.warning,
    marginTop: 2,
  },
  notableSub: {
    fontSize: 11,
    color: colors.muted,
    marginTop: 1,
  },
  earlyStateCard: {
    backgroundColor: colors.white,
    borderRadius: 24,
    padding: spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: spacing.md,
    ...shadows.sm,
  },
  earlyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.emeraldLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  earlyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.charcoal,
  },
  earlyCopy: {
    fontSize: 13,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 19,
    marginTop: 6,
    maxWidth: 280,
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

