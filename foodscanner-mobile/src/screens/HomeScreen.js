import React, { useEffect, useMemo, useState } from 'react';
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

import { getDailyReport, getTodayFoods, getUserProfile } from '../services/api';
import PrimaryButton from '../components/PrimaryButton';
import SectionHeader from '../components/SectionHeader';
import { colors, shadows, spacing, typography } from '../theme';

function formatValue(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return Number.isInteger(number) ? String(number) : number.toFixed(1).replace(/\.0$/, '');
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function getGreetingIcon() {
  const hour = new Date().getHours();
  if (hour < 12) return 'sunny-outline';
  if (hour < 17) return 'partly-sunny-outline';
  return 'moon-outline';
}

function getTodayLabel() {
  return new Date().toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function getMacroConfig(key) {
  switch (key) {
    case 'protein':
      return { label: 'PROTEIN', color: colors.protein, unit: 'g', icon: 'barbell-outline' };
    case 'carbs':
      return { label: 'CARBS', color: colors.carbs, unit: 'g', icon: 'nutrition-outline' };
    case 'fat':
      return { label: 'FAT', color: colors.fat, unit: 'g', icon: 'water-outline' };
    case 'calories':
    default:
      return { label: 'CALORIES', color: colors.emerald, unit: 'kcal', icon: 'flame-outline' };
  }
}

function ModernMacroCard({ macroKey, data }) {
  const config = getMacroConfig(macroKey);
  const consumed = Number(data?.consumed);
  const limit = Number(data?.limit);
  const hasValues = Number.isFinite(consumed) && Number.isFinite(limit) && limit > 0;
  const progress = hasValues ? Math.min(1, Math.max(0, consumed / limit)) : 0;
  const percent = hasValues ? Math.round(progress * 100) : null;

  return (
    <View style={styles.macroCard}>
      <View style={styles.macroHeader}>
        <View style={[styles.macroIconWrap, { backgroundColor: `${config.color}15` }]}>
          <Ionicons name={config.icon} size={15} color={config.color} />
        </View>
        <Text style={styles.macroLabel}>{config.label}</Text>
        {percent !== null ? (
          <Text style={[styles.macroPercent, { color: config.color }]}>{percent}%</Text>
        ) : null}
      </View>
      <View style={styles.macroValueRow}>
        <Text style={styles.macroConsumed}>{formatValue(consumed)}</Text>
        <Text style={styles.macroLimit}>
          {hasValues ? ` / ${formatValue(limit)} ${config.unit}` : ` ${config.unit}`}
        </Text>
      </View>
      <View style={styles.macroTrack}>
        <View
          style={[
            styles.macroFill,
            {
              width: `${hasValues ? progress * 100 : 0}%`,
              backgroundColor: config.color,
            },
          ]}
        />
      </View>
    </View>
  );
}

export default function HomeScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [report, setReport] = useState(null);
  const [todayFoods, setTodayFoods] = useState([]);

  const fetchData = React.useCallback(async () => {
    setLoading(true);
    try {
      const [nextProfile, nextReport, nextToday] = await Promise.all([
        getUserProfile(),
        getDailyReport(),
        getTodayFoods(),
      ]);
      setProfile(nextProfile);
      setReport(nextReport);
      setTodayFoods(Array.isArray(nextToday?.foods) ? nextToday.foods : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useFocusEffect(
    React.useCallback(() => {
      fetchData();
    }, [fetchData])
  );

  const nutrition = report?.nutrition_breakdown || {};
  const calories = nutrition.calories;
  const hasNutrition = Object.keys(nutrition).length > 0;
  const foods = useMemo(() => (
    todayFoods.filter((food) => food?.product_name || food?.name || food?.product)
  ), [todayFoods]);
  const hasFoods = foods.length > 0;
  const userName = profile?.name?.trim();
  const targetCalories = Number(calories?.limit);
  const hasCalorieTarget = Number.isFinite(targetCalories) && targetCalories > 0;
  const consumedCalories = Number(calories?.consumed) || 0;
  const remainingCalories = hasCalorieTarget ? Math.max(0, targetCalories - consumedCalories) : null;
  const calorieProgress = hasCalorieTarget ? Math.min(1, consumedCalories / targetCalories) : 0;
  const userInitial = (userName || profile?.email || 'U').slice(0, 1).toUpperCase();

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color={colors.emerald} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Top Header */}
        <View style={styles.topBar}>
          <View>
            <View style={styles.greetingRow}>
              <Ionicons name={getGreetingIcon()} size={16} color={colors.emerald} style={{ marginRight: 5 }} />
              <Text style={styles.greetingText}>{getGreeting()}</Text>
            </View>
            <Text style={styles.titleText}>{userName || 'Welcome back'}</Text>
            <View style={styles.dateBadge}>
              <Ionicons name="calendar-outline" size={12} color={colors.muted} style={{ marginRight: 4 }} />
              <Text style={styles.dateText}>{getTodayLabel()}</Text>
            </View>
          </View>

          <Pressable
            style={styles.avatarPill}
            onPress={() => navigation.navigate('Main', { screen: 'Profile' })}
          >
            <Text style={styles.avatarInitial}>{userInitial}</Text>
          </Pressable>
        </View>

        {/* Hero Calorie Card */}
        <View style={styles.heroCard}>
          <View style={styles.heroHeader}>
            <View style={styles.heroHeaderLeft}>
              <View style={styles.flameCircle}>
                <Ionicons name="flame" size={20} color={colors.white} />
              </View>
              <Text style={styles.heroLabel}>TODAY&apos;S CALORIES</Text>
            </View>
            {hasCalorieTarget && (
              <View style={styles.targetBadge}>
                <Text style={styles.targetBadgeText}>Target: {formatValue(targetCalories)}</Text>
              </View>
            )}
          </View>

          {hasNutrition ? (
            <>
              <View style={styles.calorieNumberRow}>
                <Text style={styles.calorieBigNumber}>{formatValue(calories?.consumed)}</Text>
                <Text style={styles.calorieKcal}>kcal</Text>
              </View>

              <Text style={styles.heroSubtext}>
                {hasCalorieTarget
                  ? remainingCalories > 0
                    ? `${formatValue(remainingCalories)} kcal remaining for today`
                    : 'Daily calorie goal reached!'
                  : 'Log food portions to track progress against your goal'}
              </Text>

              {hasCalorieTarget ? (
                <View style={styles.heroBarTrack}>
                  <View
                    style={[
                      styles.heroBarFill,
                      { width: `${calorieProgress * 100}%` },
                    ]}
                  />
                </View>
              ) : null}
            </>
          ) : (
            <View style={styles.emptyHero}>
              <Text style={styles.emptyHeroTitle}>No food logged today</Text>
              <Text style={styles.emptyHeroCopy}>
                Scan barcodes or enter food manually to calculate measured portion calories.
              </Text>
            </View>
          )}
        </View>

        {/* Today's Macro Breakdown */}
        <SectionHeader rightAction={
          <Pressable onPress={() => navigation.navigate('Main', { screen: 'Report' })}>
            <Text style={styles.sectionActionText}>View history ›</Text>
          </Pressable>
        }>
          DAILY MACROS
        </SectionHeader>

        <View style={styles.macrosGrid}>
          {['protein', 'carbs', 'fat', 'calories']
            .filter((key) => nutrition[key])
            .map((key) => (
              <ModernMacroCard key={key} macroKey={key} data={nutrition[key]} />
            ))}
          {!hasNutrition ? (
            <View style={styles.emptyMacrosBox}>
              <Ionicons name="nutrition-outline" size={24} color={colors.muted} style={{ marginBottom: 6 }} />
              <Text style={styles.emptyMacrosText}>
                Macro breakdown appears as soon as you save your first measured portion today.
              </Text>
            </View>
          ) : null}
        </View>

        {/* Quick Action Banner */}
        <View style={styles.actionCard}>
          <View style={styles.actionCardCopy}>
            <Text style={styles.actionCardTitle}>Ready to log a meal?</Text>
            <Text style={styles.actionCardSubtitle}>
              Scan any package or barcode to calculate precise nutrition from scale weight.
            </Text>
          </View>
          <PrimaryButton
            onPress={() => navigation.navigate('Main', { screen: 'Scan' })}
            icon={<Ionicons name="barcode-outline" size={18} color={colors.white} />}
          >
            SCAN &amp; MEASURE
          </PrimaryButton>
        </View>

        {/* Recent Portions Section */}
        <SectionHeader>TODAY&apos;S LOGGED MEALS</SectionHeader>

        {!hasFoods ? (
          <View style={styles.emptyListCard}>
            <View style={styles.emptyIconCircle}>
              <Ionicons name="restaurant-outline" size={28} color={colors.muted} />
            </View>
            <Text style={styles.emptyListTitle}>Nothing logged yet</Text>
            <Text style={styles.emptyListCopy}>
              Your food portions and calories will be saved and recorded here throughout the day.
            </Text>
          </View>
        ) : (
          <View style={styles.portionsContainer}>
            {foods.slice(0, 5).map((food, index) => {
              const productName = food.product_name || food.name || food.product;
              const caloriesValue = Number(food.calories);
              return (
                <View key={`${productName}-${food.consumed_at || index}`} style={styles.portionCard}>
                  <View style={styles.portionIconCircle}>
                    <Ionicons name="fast-food-outline" size={20} color={colors.emerald} />
                  </View>
                  <View style={styles.portionInfo}>
                    <Text style={styles.portionName} numberOfLines={1}>{productName}</Text>
                    <Text style={styles.portionMeta}>
                      {Number.isFinite(Number(food.weight_grams)) ? `${formatValue(food.weight_grams)} g · ` : ''}
                      {food.consumed_at ? new Date(food.consumed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Logged today'}
                    </Text>
                  </View>
                  <View style={styles.portionCaloriePill}>
                    <Text style={styles.portionCalorieText}>
                      {Number.isFinite(caloriesValue) ? `${formatValue(caloriesValue)} kcal` : '—'}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Set Nutrition Goal Banner */}
        {!profile?.daily_calorie_limit ? (
          <View style={styles.goalBanner}>
            <View style={styles.goalBannerContent}>
              <View style={styles.goalIconCircle}>
                <Ionicons name="flag-outline" size={22} color={colors.emerald} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.goalBannerTitle}>Personalize Your Daily Target</Text>
                <Text style={styles.goalBannerText}>
                  Set your daily calorie &amp; macro targets in your profile to enable personalized nutrition context.
                </Text>
              </View>
            </View>
            <Pressable
              style={styles.goalBannerBtn}
              onPress={() => navigation.navigate('Main', { screen: 'Profile' })}
            >
              <Text style={styles.goalBannerBtnText}>Set Target in Profile ›</Text>
            </Pressable>
          </View>
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
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  greetingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  greetingText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.emerald,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  titleText: {
    ...typography.title,
    color: colors.charcoal,
    marginTop: 2,
  },
  dateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  dateText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.muted,
  },
  avatarPill: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.emerald,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.sm,
  },
  avatarInitial: {
    color: colors.white,
    fontSize: 18,
    fontWeight: '800',
  },
  heroCard: {
    backgroundColor: colors.white,
    borderRadius: 24,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
    ...shadows.md,
  },
  heroHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  heroHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  flameCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.emerald,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  heroLabel: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    color: colors.textSecondary,
  },
  targetBadge: {
    backgroundColor: colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  targetBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.charcoal,
  },
  calorieNumberRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: spacing.xs,
  },
  calorieBigNumber: {
    fontSize: 54,
    fontWeight: '900',
    color: colors.charcoal,
    letterSpacing: -1,
  },
  calorieKcal: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.muted,
    marginLeft: 6,
  },
  heroSubtext: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    marginTop: 4,
  },
  heroBarTrack: {
    height: 9,
    backgroundColor: colors.surface,
    borderRadius: 5,
    overflow: 'hidden',
    marginTop: spacing.md,
  },
  heroBarFill: {
    height: '100%',
    backgroundColor: colors.emerald,
    borderRadius: 5,
  },
  emptyHero: {
    paddingVertical: spacing.md,
  },
  emptyHeroTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.charcoal,
  },
  emptyHeroCopy: {
    fontSize: 14,
    color: colors.muted,
    lineHeight: 20,
    marginTop: 4,
  },
  sectionActionText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.emerald,
  },
  macrosGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  macroCard: {
    width: '48.5%',
    backgroundColor: colors.white,
    borderRadius: 18,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
    ...shadows.sm,
  },
  macroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  macroIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  macroLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
    color: colors.textSecondary,
    flex: 1,
  },
  macroPercent: {
    fontSize: 11,
    fontWeight: '800',
  },
  macroValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 8,
  },
  macroConsumed: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.charcoal,
  },
  macroLimit: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.muted,
    marginLeft: 3,
  },
  macroTrack: {
    height: 6,
    backgroundColor: colors.surface,
    borderRadius: 3,
    overflow: 'hidden',
  },
  macroFill: {
    height: '100%',
    borderRadius: 3,
  },
  emptyMacrosBox: {
    width: '100%',
    backgroundColor: colors.white,
    borderRadius: 18,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyMacrosText: {
    fontSize: 13,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 18,
  },
  actionCard: {
    backgroundColor: colors.white,
    borderRadius: 22,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
    ...shadows.sm,
  },
  actionCardCopy: {
    marginBottom: spacing.xs,
  },
  actionCardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.charcoal,
  },
  actionCardSubtitle: {
    fontSize: 13,
    color: colors.muted,
    marginTop: 2,
    lineHeight: 18,
  },
  portionsContainer: {
    gap: spacing.xs,
  },
  portionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.xs,
    ...shadows.sm,
  },
  portionIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.emeraldLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  portionInfo: {
    flex: 1,
  },
  portionName: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.charcoal,
  },
  portionMeta: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
    fontWeight: '500',
  },
  portionCaloriePill: {
    backgroundColor: colors.emeraldLight,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  portionCalorieText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.emerald,
  },
  emptyListCard: {
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  emptyListTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.charcoal,
  },
  emptyListCopy: {
    fontSize: 13,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 19,
    marginTop: 4,
    maxWidth: 260,
  },
  goalBanner: {
    backgroundColor: colors.emeraldLight,
    borderRadius: 20,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    marginTop: spacing.lg,
  },
  goalBannerContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  goalIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  goalBannerTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.emeraldDark,
  },
  goalBannerText: {
    fontSize: 13,
    color: '#065F46',
    marginTop: 2,
    lineHeight: 18,
  },
  goalBannerBtn: {
    alignSelf: 'flex-start',
    marginTop: spacing.sm,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: colors.white,
  },
  goalBannerBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.emerald,
  },
});

