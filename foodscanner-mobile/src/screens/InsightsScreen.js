import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { getTodayFoods, getUserProfile } from '../services/api';
import { Ionicons } from '@expo/vector-icons';
import { colors, shadows, typography } from '../theme';

function formatNumber(value, decimals = 1) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '—';
  if (decimals === 0) return Math.round(num).toLocaleString();
  return num < 10 ? num.toFixed(decimals).replace(/\.0$/, '') : Math.round(num).toLocaleString();
}

export default function InsightsScreen({ navigation: _navigation }) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [profile, setProfile] = useState(null);
  const [todayData, setTodayData] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const [nextProfile, nextToday] = await Promise.all([
        getUserProfile().catch(() => null),
        getTodayFoods().catch(() => null),
      ]);
      setProfile(nextProfile);
      setTodayData(nextToday);
    } catch (_e) {
      // ignore
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  // Intake Calculations: derived directly from today's saved intake records
  const calorieAllowance = Number(profile?.daily_calorie_limit || todayData?.daily_calorie_limit || 2250);
  const consumedCalories = Number(
    todayData?.calories_consumed_today != null
      ? todayData.calories_consumed_today
      : (todayData?.foods?.length
          ? todayData.foods.reduce((acc, f) => acc + (Number(f.calories) || 0), 0)
          : 0)
  );
  const remainingCalories = Math.max(0, calorieAllowance - consumedCalories);
  const calorieRatio = Math.min(1.0, consumedCalories / (calorieAllowance || 2250));

  // Progress metrics: Sugar and Sodium
  const consumedSugar = Number(
    todayData?.total_sugar != null
      ? todayData.total_sugar
      : (todayData?.foods?.length
          ? todayData.foods.reduce((acc, f) => acc + (Number(f.sugar) || 0), 0)
          : 0)
  );
  const targetSugar = Number(todayData?.target_sugar ?? 50.0);
  const sugarProgress = Math.min(1.0, consumedSugar / (targetSugar || 50.0));

  const consumedSodium = Number(
    todayData?.total_sodium != null
      ? todayData.total_sodium
      : (todayData?.total_salt != null
          ? Math.round((todayData.total_salt / 2.5) * 100) / 100
          : (todayData?.foods?.length
              ? Math.round((todayData.foods.reduce((acc, f) => acc + (Number(f.salt) || 0), 0) / 2.5) * 100) / 100
              : 0))
  );
  const targetSodium = Number(todayData?.target_sodium ?? 2.0);
  const sodiumProgress = Math.min(1.0, consumedSodium / (targetSodium || 2.0));

  // Recent weighed items derived from the shared saved records
  const recentWeighs = useMemo(() => {
    const apiFoods = Array.isArray(todayData?.foods) ? todayData.foods : [];
    return apiFoods.map((f, idx) => {
      let verdict = f.verdict || 'Safe';
      if (!f.verdict) {
        const cal = Number(f.calories || 0);
        const sug = Number(f.sugar || 0);
        if (sug > 20 || cal > 200) verdict = 'Moderate';
        if (sug > 35) verdict = 'Avoid';
      }
      return {
        id: f.id || `${f.product_name}-${f.consumed_at || idx}`,
        name: f.product_name || 'Weighed food',
        weight: f.weight_grams ? Math.round(f.weight_grams) : 0,
        calories: f.calories ? Math.round(f.calories) : 0,
        verdict,
      };
    });
  }, [todayData]);

  // Dynamic suggestion based on intake
  const nutritionSuggestion = useMemo(() => {
    if (consumedSugar > 25) {
      return "Smaller portions of sweet snacks would keep you under today's sugar allowance.";
    }
    if (consumedCalories > calorieAllowance * 0.8) {
      return "You're close to your calorie target. Light greens or water-rich snacks are ideal for dinner.";
    }
    return "Great job maintaining balanced portion sizes across your logged meals today.";
  }, [consumedSugar, consumedCalories, calorieAllowance]);

  if (loading && !refreshing && !todayData) {
    return (
      <SafeAreaView style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.primaryPurple} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screenBg}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primaryPurple} />}
      >
        {/* Header (PDF Page 3) */}
        <View style={styles.header}>
          <Text style={styles.headerEyebrow}>Today</Text>
          <Text style={styles.headerTitle}>Your intake</Text>
        </View>

        {/* Circular Calorie Intake Ring Card */}
        <View style={styles.calorieRingCard}>
          {/* Ring graphic */}
          <View style={styles.ringContainer}>
            <View style={styles.outerRing}>
              {/* Active purple stroke arc */}
              <View
                style={[
                  styles.activeRingArc,
                  {
                    height: `${Math.round(calorieRatio * 100)}%`,
                  },
                ]}
              />
              <View style={styles.innerRingHole} />
            </View>
          </View>

          {/* Numbers beside ring */}
          <View style={styles.calorieDetails}>
            <Text style={styles.caloriesBigNum}>{formatNumber(consumedCalories, 0)}</Text>
            <Text style={styles.calorieAllowanceLabel}>
              of {formatNumber(calorieAllowance, 0)} kcal allowance
            </Text>
            <Text style={styles.calorieLeftHighlight}>
              {formatNumber(remainingCalories, 0)} kcal left
            </Text>
          </View>
        </View>

        {/* Two Progress Cards (Sugar & Sodium) */}
        <View style={styles.progressCardsRow}>
          {/* Total Sugar Card */}
          <View style={styles.progressCard}>
            <Text style={styles.progressCardLabel}>Sugar</Text>
            <Text style={styles.progressCardValues}>
              {formatNumber(consumedSugar, 0)} / {formatNumber(targetSugar, 0)} g
            </Text>
            <View style={styles.progressBarTrack}>
              <View
                style={[
                  styles.progressBarFill,
                  styles.sugarBarFill,
                  { width: `${Math.min(100, sugarProgress * 100)}%` },
                ]}
              />
            </View>
          </View>

          {/* Sodium Card (converted from Salt: salt / 2.5) */}
          <View style={styles.progressCard}>
            <Text style={styles.progressCardLabel}>Sodium</Text>
            <Text style={styles.progressCardValues}>
              {formatNumber(consumedSodium, 1)} / {formatNumber(targetSodium, 0)} g
            </Text>
            <View style={styles.progressBarTrack}>
              <View
                style={[
                  styles.progressBarFill,
                  styles.sodiumBarFill,
                  { width: `${Math.min(100, sodiumProgress * 100)}%` },
                ]}
              />
            </View>
          </View>
        </View>

        {/* Recent Weighs Section */}
        <View style={styles.recentWeighsSection}>
          <Text style={styles.recentWeighsTitle}>Recent weighs</Text>

          {recentWeighs.length === 0 ? (
            <View style={styles.emptyRecentCard}>
              <Ionicons name="scale-outline" size={26} color={colors.mutedLight} style={{ marginBottom: 6 }} />
              <Text style={styles.emptyRecentTitle}>No meals weighed yet today</Text>
              <Text style={styles.emptyRecentSub}>
                Weigh food on NutriScale to log verified portions and track intake.
              </Text>
            </View>
          ) : (
            recentWeighs.map((item) => {
            const isSafe = item.verdict === 'Safe';
            const isAvoid = item.verdict === 'Avoid';
            const badgeBg = isSafe ? '#DCFCE7' : (isAvoid ? '#FEE2E2' : '#FEF3C7');
            const badgeColor = isSafe ? '#166534' : (isAvoid ? '#B91C1C' : '#B45309');

            return (
              <View key={item.id} style={styles.weighRowCard}>
                <View style={styles.weighInfo}>
                  <Text style={styles.weighProductName}>{item.name}</Text>
                  <Text style={styles.weighPortionMeta}>
                    {item.weight} g · {item.calories} kcal
                  </Text>
                </View>

                {/* Verdict Badge */}
                <View style={[styles.verdictPill, { backgroundColor: badgeBg }]}>
                  <Text style={[styles.verdictPillText, { color: badgeColor }]}>
                    {item.verdict}
                  </Text>
                </View>
              </View>
            );
          }))}
        </View>

        {/* Daily Nutrition Suggestion Card (PDF Page 3) */}
        <View style={styles.suggestionCard}>
          <Text style={styles.suggestionText}>{nutritionSuggestion}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screenBg: {
    flex: 1,
    backgroundColor: '#FAFAFD',
  },
  centerContainer: {
    flex: 1,
    backgroundColor: '#FAFAFD',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 24 : 12,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 16,
  },
  headerEyebrow: {
    fontSize: 14,
    color: colors.muted,
    fontWeight: '500',
    marginBottom: 2,
  },
  headerTitle: {
    fontSize: 32,
    fontFamily: typography.fraunces,
    fontWeight: '800',
    color: colors.purpleDeep,
    letterSpacing: -0.5,
  },
  // Calorie Ring Card
  calorieRingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: 24,
    padding: 20,
    marginBottom: 16,
    ...shadows.sm,
    borderWidth: 1,
    borderColor: '#F3F0FA',
  },
  ringContainer: {
    width: 110,
    height: 110,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 20,
  },
  outerRing: {
    width: 104,
    height: 104,
    borderRadius: 52,
    borderWidth: 10,
    borderColor: colors.lilacBorder,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  activeRingArc: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 104,
    backgroundColor: colors.primaryPurple,
    opacity: 0.95,
  },
  innerRingHole: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: colors.white,
  },
  calorieDetails: {
    flex: 1,
  },
  caloriesBigNum: {
    fontSize: 36,
    fontFamily: typography.fraunces,
    fontWeight: '800',
    color: colors.purpleDeep,
    letterSpacing: -0.5,
  },
  calorieAllowanceLabel: {
    fontSize: 13,
    color: colors.muted,
    fontWeight: '500',
    marginTop: 2,
  },
  calorieLeftHighlight: {
    fontSize: 14,
    color: colors.primaryPurple,
    fontWeight: '700',
    marginTop: 4,
  },
  // Progress Cards (Sugar & Sodium)
  progressCardsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  progressCard: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#F3F0FA',
    ...shadows.sm,
  },
  progressCardLabel: {
    fontSize: 13,
    color: colors.muted,
    fontWeight: '600',
  },
  progressCardValues: {
    fontSize: 18,
    fontFamily: typography.fraunces,
    fontWeight: '800',
    color: colors.purpleDeep,
    marginTop: 4,
    marginBottom: 10,
  },
  progressBarTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#F3E8FF',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  sugarBarFill: {
    backgroundColor: '#F59E0B',
  },
  sodiumBarFill: {
    backgroundColor: '#10B981',
  },
  // Recent Weighs Section
  recentWeighsSection: {
    marginBottom: 20,
  },
  recentWeighsTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.purpleDeep,
    marginBottom: 12,
  },
  emptyRecentCard: {
    backgroundColor: colors.white,
    borderRadius: 18,
    padding: 22,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#F3F0FA',
    ...shadows.sm,
  },
  emptyRecentTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.charcoal,
  },
  emptyRecentSub: {
    fontSize: 13,
    color: colors.muted,
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 18,
  },
  weighRowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.white,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#F3F0FA',
    ...shadows.sm,
  },
  weighInfo: {
    flex: 1,
    paddingRight: 10,
  },
  weighProductName: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.charcoal,
  },
  weighPortionMeta: {
    fontSize: 13,
    color: colors.muted,
    marginTop: 3,
  },
  verdictPill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
  },
  verdictPillText: {
    fontSize: 12,
    fontWeight: '800',
  },
  // Suggestion Card (PDF Page 3)
  suggestionCard: {
    backgroundColor: colors.lilac,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.lilacBorder,
  },
  suggestionText: {
    fontSize: 14,
    color: colors.primaryPurple,
    fontWeight: '600',
    lineHeight: 20,
  },
});
