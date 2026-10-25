import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

import { getDailyReport, getTodayFoods, getUserProfile } from '../services/api';
import { colors, shadows, typography } from '../theme';

function formatNumber(value, decimals = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '—';
  if (decimals === 0) return Math.round(num).toLocaleString();
  return num < 10 ? num.toFixed(decimals).replace(/\.0$/, '') : Math.round(num).toLocaleString();
}

// Sample verified NutriScale products for carousel fallback when no recent history exists
const DEFAULT_TOP_FOODS = [
  {
    id: 'cadbury',
    name: 'Cadbury Dairy Milk',
    weight: '42.0g',
    calories: '224 kcal',
    score: '1.6',
    scoreType: 'amber',
    icon: 'nutrition',
  },
  {
    id: 'storia',
    name: 'Storia Tender Coconut Water',
    weight: '250.0g',
    calories: '48 kcal',
    score: '3.4',
    scoreType: 'green',
    icon: 'water',
  },
  {
    id: 'kelloggs',
    name: "Kellogg's Corn Flakes",
    weight: '60.0g',
    calories: '228 kcal',
    score: '2.8',
    scoreType: 'amber',
    icon: 'leaf',
  },
  {
    id: 'dietcoke',
    name: 'Diet Coke Crisp Taste',
    weight: '330.0ml',
    calories: '1 kcal',
    score: 'NR',
    scoreType: 'gray',
    icon: 'cafe',
  },
];

export default function HomeScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [profile, setProfile] = useState(null);
  const [report, setReport] = useState(null);
  const [todayData, setTodayData] = useState(null);
  const [todayFoods, setTodayFoods] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const [nextProfile, nextReport, nextToday] = await Promise.all([
        getUserProfile().catch(() => null),
        getDailyReport().catch(() => null),
        getTodayFoods().catch(() => null),
      ]);
      setProfile(nextProfile);
      setReport(nextReport);
      setTodayData(nextToday);
      setTodayFoods(Array.isArray(nextToday?.foods) ? nextToday.foods : []);
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

  // Nutrition data calculations: derive calories and macros from saved intake records
  const nutrition = report?.nutrition_breakdown || {};
  const calories = nutrition.calories;
  const targetCalories = Number(profile?.daily_calorie_limit || todayData?.daily_calorie_limit || calories?.limit || 2250);
  const consumedCalories = Number(
    todayData?.calories_consumed_today != null
      ? todayData.calories_consumed_today
      : (todayFoods.length > 0
          ? todayFoods.reduce((acc, f) => acc + (Number(f.calories) || 0), 0)
          : (calories?.consumed ?? 0))
  );
  const remainingCalories = Math.max(0, targetCalories - consumedCalories);

  const consumedProtein = Number(
    todayData?.total_protein != null
      ? todayData.total_protein
      : (todayFoods.length > 0
          ? todayFoods.reduce((acc, f) => acc + (Number(f.protein) || 0), 0)
          : (nutrition.protein?.consumed || 0))
  );
  const consumedCarbs = Number(
    todayData?.total_carbs != null
      ? todayData.total_carbs
      : (todayFoods.length > 0
          ? todayFoods.reduce((acc, f) => acc + (Number(f.carbs) || 0), 0)
          : (nutrition.carbs?.consumed || 0))
  );
  const consumedFat = Number(
    todayData?.total_fat != null
      ? todayData.total_fat
      : (todayFoods.length > 0
          ? todayFoods.reduce((acc, f) => acc + (Number(f.fat) || 0), 0)
          : (nutrition.fat?.consumed || 0))
  );

  const userName = profile?.name?.trim();
  const userInitial = (userName || profile?.email || 'U').slice(0, 1).toUpperCase();

  // Filtered logged foods
  const filteredFoods = useMemo(() => {
    const raw = todayFoods.filter((f) => f?.product_name || f?.name);
    if (!searchQuery.trim()) return raw;
    const q = searchQuery.toLowerCase();
    return raw.filter((f) => (f.product_name || f.name || '').toLowerCase().includes(q));
  }, [todayFoods, searchQuery]);

  // Carousel items: real foods if available, merged with default reference products
  const carouselItems = useMemo(() => {
    if (todayFoods.length > 0) {
      return todayFoods.map((f, idx) => {
        const cal = Number(f.calories || 0);
        const sug = Number(f.sugar || 0);
        let score = '2.5';
        let scoreType = 'amber';
        if (sug < 5 && cal < 150) {
          score = '3.8';
          scoreType = 'green';
        } else if (sug > 25) {
          score = '1.6';
          scoreType = 'amber';
        }

        return {
          id: f.id || `${f.product_name}-${idx}`,
          name: f.product_name || 'Weighed Food',
          weight: f.weight_grams ? `${Math.round(f.weight_grams)}g` : '42.0g',
          calories: `${Math.round(cal)} kcal`,
          score,
          scoreType,
          icon: 'fast-food',
        };
      });
    }
    return DEFAULT_TOP_FOODS;
  }, [todayFoods]);

  if (loading && !refreshing && !report && !profile) {
    return (
      <SafeAreaView style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.primaryPurple} />
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.screenBg}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primaryPurple} />}
      >
        {/* ======================================================== */}
        {/* 1. PURPLE GRADIENT HEADER (Visual Reference: Image Header) */}
        {/* ======================================================== */}
        <View style={styles.headerHero}>
          <SafeAreaView>
            <View style={styles.headerHeroNav}>
              {/* Left Greeting */}
              <View style={styles.greetingLeft}>
                <Text style={styles.greetingTitle}>Hi There,</Text>
                <Text style={styles.greetingSubtitle}>Ready to make a smart choice?</Text>
              </View>

              {/* Right Avatar & Status Pill */}
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Go to Profile"
                onPress={() => navigation.navigate('Main', { screen: 'Profile' })}
                style={styles.avatarWrapper}
              >
                <View style={styles.trialPill}>
                  <Text style={styles.trialPillText}>{profile?.diet_type || 'Active'}</Text>
                </View>
                <View style={styles.avatarCircle}>
                  <Text style={styles.avatarInitialText}>{userInitial}</Text>
                </View>
                <View style={styles.budgetPill}>
                  <Text style={styles.budgetPillText}>{formatNumber(remainingCalories)} kcal</Text>
                </View>
              </TouchableOpacity>
            </View>

            {/* Prominent White Search Bar */}
            <View style={styles.searchBarWrapper}>
              <Ionicons name="search-outline" size={20} color={colors.muted} style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search to find what fits you"
                placeholderTextColor={colors.mutedLight}
                value={searchQuery}
                onChangeText={setSearchQuery}
                clearButtonMode="while-editing"
              />
              {searchQuery ? (
                <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearSearchBtn}>
                  <Ionicons name="close-circle" size={18} color={colors.muted} />
                </TouchableOpacity>
              ) : null}
            </View>
          </SafeAreaView>
        </View>

        {/* ======================================================== */}
        {/* 2. DAILY NUTRITION / PROGRESS BANNER                     */}
        {/* ======================================================== */}
        <View style={styles.announcementBannerWrap}>
          <Text style={styles.sparkleIcon}>✦</Text>
          <Text style={styles.announcementBannerText}>
            {remainingCalories > 0
              ? `Today's Budget: ${formatNumber(remainingCalories)} kcal Remaining`
              : 'Daily Calorie Target Achieved Today'}
          </Text>
          <Text style={styles.sparkleIcon}>✦</Text>
        </View>

        {/* ======================================================== */}
        {/* 3. TWO PROMINENT FEATURE CARDS (Image: Scan & Rewards)   */}
        {/* ======================================================== */}
        <View style={styles.featureCardsRow}>
          {/* Card 1: Scan a Product -> Scale / Weigh Workflow */}
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Scan and weigh product on scale"
            onPress={() => navigation.navigate('Main', { screen: 'Scale' })}
            activeOpacity={0.9}
            style={[styles.featureCard, styles.featureCardLilac]}
          >
            <Text style={styles.featureCardTitle}>Scan a Product</Text>
            <Text style={styles.featureCardSub}>Know what you&apos;re buying.</Text>
            <View style={styles.featureIconCorner}>
              <Ionicons name="barcode-outline" size={48} color="#9065D6" />
            </View>
          </TouchableOpacity>

          {/* Card 2: My Insights -> Daily Intelligence & Trends */}
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="View nutrition insights"
            onPress={() => navigation.navigate('Main', { screen: 'Insights' })}
            activeOpacity={0.9}
            style={[styles.featureCard, styles.featureCardCream]}
          >
            <Text style={styles.featureCardTitle}>Daily Insights</Text>
            <Text style={styles.featureCardSub}>Sugar, sodium &amp; trends.</Text>
            <View style={styles.featureIconCorner}>
              <Ionicons name="gift-outline" size={44} color="#D88A22" />
            </View>
          </TouchableOpacity>
        </View>

        {/* ======================================================== */}
        {/* 4. THREE SMALLER CATEGORY / SHORTCUT CARDS               */}
        {/* ======================================================== */}
        <View style={styles.categoryRow}>
          {/* Category 1: Food / Today's Log */}
          <TouchableOpacity
            onPress={() => navigation.navigate('Main', { screen: 'Report' })}
            style={[styles.categoryCard, styles.catCardPink]}
          >
            <View style={styles.catIconWrap}>
              <Ionicons name="fast-food-outline" size={24} color="#E11D48" />
            </View>
            <Text style={styles.catLabel}>Food Log</Text>
          </TouchableOpacity>

          {/* Category 2: Smart Scale Sync */}
          <TouchableOpacity
            onPress={() => navigation.navigate('Main', { screen: 'Scale' })}
            style={[styles.categoryCard, styles.catCardGreen]}
          >
            <View style={styles.catIconWrap}>
              <Ionicons name="scale-outline" size={24} color="#059669" />
            </View>
            <Text style={styles.catLabel}>Scale Sync</Text>
          </TouchableOpacity>

          {/* Category 3: Recent Scans */}
          <TouchableOpacity
            onPress={() => navigation.navigate('Main', { screen: 'Report' })}
            style={[styles.categoryCard, styles.catCardBlue]}
          >
            <View style={styles.catIconWrap}>
              <Ionicons name="time-outline" size={24} color="#2563EB" />
            </View>
            <Text style={styles.catLabel}>Recent Scans</Text>
          </TouchableOpacity>
        </View>

        {/* ======================================================== */}
        {/* 5. PRESERVED DAILY MACRO SUMMARY                         */}
        {/* ======================================================== */}
        <View style={styles.macroSummaryCard}>
          <View style={styles.macroSummaryHeader}>
            <Text style={styles.macroSummaryTitle}>TODAY&apos;S MACRO BREAKDOWN</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Main', { screen: 'Insights' })}>
              <Text style={styles.macroSummaryAction}>Details ›</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.macroPillsRow}>
            <View style={styles.macroPillItem}>
              <Text style={styles.macroPillLabel}>CALORIES</Text>
              <Text style={styles.macroPillValue}>{formatNumber(consumedCalories)} kcal</Text>
            </View>
            <View style={styles.macroPillItem}>
              <Text style={styles.macroPillLabel}>PROTEIN</Text>
              <Text style={styles.macroPillValue}>{formatNumber(consumedProtein, 0)} g</Text>
            </View>
            <View style={styles.macroPillItem}>
              <Text style={styles.macroPillLabel}>CARBS</Text>
              <Text style={styles.macroPillValue}>{formatNumber(consumedCarbs, 0)} g</Text>
            </View>
            <View style={styles.macroPillItem}>
              <Text style={styles.macroPillLabel}>FAT</Text>
              <Text style={styles.macroPillValue}>{formatNumber(consumedFat, 0)} g</Text>
            </View>
          </View>
        </View>

        {/* ======================================================== */}
        {/* 6. TOP SCANNED FOOD / RECENT CAROUSEL (Image Reference)  */}
        {/* ======================================================== */}
        <View style={styles.carouselSection}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionHeading}>Top Scanned Food</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Main', { screen: 'Report' })}>
              <Text style={styles.viewAllText}>View All</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.carouselScrollContent}
          >
            {carouselItems.map((item) => {
              const isGreen = item.scoreType === 'green';
              const isAmber = item.scoreType === 'amber';
              const badgeBg = isGreen ? '#10B981' : (isAmber ? '#F59E0B' : '#6B7280');

              return (
                <TouchableOpacity
                  key={item.id}
                  onPress={() => navigation.navigate('Main', { screen: 'Scale' })}
                  activeOpacity={0.85}
                  style={styles.carouselCard}
                >
                  {/* Top Right Score Badge */}
                  <View style={[styles.productScoreBadge, { backgroundColor: badgeBg }]}>
                    <Text style={styles.productScoreText}>{item.score}</Text>
                  </View>

                  {/* Thumbnail */}
                  <View style={styles.carouselImgBox}>
                    <Ionicons name={item.icon || 'nutrition'} size={32} color={colors.primaryPurple} />
                  </View>

                  {/* Name & Weight */}
                  <Text style={styles.carouselProductName} numberOfLines={2}>
                    {item.name}
                  </Text>
                  <Text style={styles.carouselProductMeta}>
                    {item.weight} · {item.calories}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* ======================================================== */}
        {/* 7. PRESERVED TODAY'S WEIGHED MEALS LIST                  */}
        {/* ======================================================== */}
        <View style={styles.loggedMealsSection}>
          <Text style={styles.sectionHeading}>Today&apos;s Weighed Meals</Text>

          {filteredFoods.length === 0 ? (
            <View style={styles.emptyMealsCard}>
              <Ionicons name="scale-outline" size={32} color={colors.mutedLight} style={{ marginBottom: 6 }} />
              <Text style={styles.emptyMealsTitle}>No meals weighed yet today</Text>
              <Text style={styles.emptyMealsSub}>
                Place any food item on your NutriScale to log verified portions and calories.
              </Text>
              <TouchableOpacity
                onPress={() => navigation.navigate('Main', { screen: 'Scale' })}
                style={styles.weighNowBtn}
              >
                <Text style={styles.weighNowBtnText}>Weigh Food on Scale ›</Text>
              </TouchableOpacity>
            </View>
          ) : (
            filteredFoods.slice(0, 5).map((food, idx) => {
              const pName = food.product_name || food.name || 'Weighed food';
              const cal = food.calories ? Math.round(Number(food.calories)) : null;
              const wGrams = food.weight_grams ? Math.round(Number(food.weight_grams)) : null;
              const timeStr = food.consumed_at
                ? new Date(food.consumed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : 'Today';

              return (
                <View key={`${pName}-${food.consumed_at || idx}`} style={styles.mealRowCard}>
                  <View style={styles.mealIconCircle}>
                    <Ionicons name="fast-food-outline" size={18} color={colors.primaryPurple} />
                  </View>
                  <View style={styles.mealInfo}>
                    <Text style={styles.mealName} numberOfLines={1}>{pName}</Text>
                    <Text style={styles.mealMeta}>
                      {wGrams ? `${wGrams} g · ` : ''}{timeStr}
                    </Text>
                  </View>
                  {cal !== null ? (
                    <View style={styles.mealCalPill}>
                      <Text style={styles.mealCalText}>{cal} kcal</Text>
                    </View>
                  ) : null}
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screenBg: {
    flex: 1,
    backgroundColor: '#F9F8FD',
  },
  centerContainer: {
    flex: 1,
    backgroundColor: '#F9F8FD',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingBottom: 40,
  },
  // Purple Gradient Hero Header (Visual Reference)
  headerHero: {
    backgroundColor: colors.primaryPurple,
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 24 : 10,
    paddingBottom: 24,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
  },
  headerHeroNav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 18,
  },
  greetingLeft: {
    flex: 1,
    paddingRight: 10,
  },
  greetingTitle: {
    fontSize: 32,
    fontFamily: typography.fraunces,
    fontWeight: '800',
    color: colors.white,
    letterSpacing: -0.5,
  },
  greetingSubtitle: {
    fontSize: 15,
    color: '#E9D5FF',
    fontWeight: '500',
    marginTop: 4,
  },
  avatarWrapper: {
    alignItems: 'center',
  },
  trialPill: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    marginBottom: -6,
    zIndex: 2,
  },
  trialPillText: {
    fontSize: 9,
    color: colors.white,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  avatarCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#E9D5FF',
    ...shadows.sm,
  },
  avatarInitialText: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.primaryPurple,
  },
  budgetPill: {
    marginTop: -6,
    backgroundColor: colors.purpleDeep,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  budgetPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#F4EFFD',
  },
  // Prominent Search Bar
  searchBarWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: 26,
    height: 50,
    paddingHorizontal: 16,
    ...shadows.sm,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: colors.charcoal,
    fontWeight: '500',
    height: '100%',
  },
  clearSearchBtn: {
    padding: 4,
  },
  // Announcement / Progress Banner
  announcementBannerWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    gap: 8,
  },
  sparkleIcon: {
    fontSize: 14,
    color: '#8B5CF6',
  },
  announcementBannerText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.purpleDeep,
    letterSpacing: -0.2,
  },
  // Two Prominent Feature Cards (Scan & Rewards)
  featureCardsRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 12,
    marginBottom: 16,
  },
  featureCard: {
    flex: 1,
    height: 160,
    borderRadius: 22,
    padding: 16,
    justifyContent: 'space-between',
    position: 'relative',
    overflow: 'hidden',
    ...shadows.sm,
  },
  featureCardLilac: {
    backgroundColor: '#F4EFFD',
    borderWidth: 1,
    borderColor: '#E9D5FF',
  },
  featureCardCream: {
    backgroundColor: '#FEF9E7',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  featureCardTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.charcoal,
  },
  featureCardSub: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '500',
    marginTop: 2,
    maxWidth: 120,
  },
  featureIconCorner: {
    position: 'absolute',
    right: 12,
    bottom: 12,
  },
  // Three Category Shortcut Cards
  categoryRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 10,
    marginBottom: 20,
  },
  categoryCard: {
    flex: 1,
    height: 78,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
    borderWidth: 1,
  },
  catCardPink: {
    backgroundColor: '#FFE4E6',
    borderColor: '#FECDD3',
  },
  catCardGreen: {
    backgroundColor: '#DCFCE7',
    borderColor: '#BBF7D0',
  },
  catCardBlue: {
    backgroundColor: '#DBEAFE',
    borderColor: '#BFDBFE',
  },
  catIconWrap: {
    marginBottom: 4,
  },
  catLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.charcoal,
  },
  // Macro Summary Card
  macroSummaryCard: {
    backgroundColor: colors.white,
    marginHorizontal: 20,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    marginBottom: 24,
    ...shadows.sm,
  },
  macroSummaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  macroSummaryTitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    color: colors.muted,
  },
  macroSummaryAction: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primaryPurple,
  },
  macroPillsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  macroPillItem: {
    alignItems: 'center',
    flex: 1,
  },
  macroPillLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.muted,
  },
  macroPillValue: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.charcoal,
    marginTop: 2,
  },
  // Carousel Section (Top Scanned Food)
  carouselSection: {
    marginBottom: 24,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 14,
  },
  sectionHeading: {
    fontSize: 20,
    fontFamily: typography.fraunces,
    fontWeight: '800',
    color: colors.charcoal,
    letterSpacing: -0.3,
  },
  viewAllText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primaryPurple,
  },
  carouselScrollContent: {
    paddingLeft: 20,
    paddingRight: 10,
    gap: 12,
  },
  carouselCard: {
    width: 142,
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: 12,
    position: 'relative',
    borderWidth: 1,
    borderColor: '#F3F0FA',
    ...shadows.sm,
  },
  productScoreBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    zIndex: 2,
  },
  productScoreText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.white,
  },
  carouselImgBox: {
    width: '100%',
    height: 90,
    borderRadius: 14,
    backgroundColor: '#F4EFFD',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  carouselProductName: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.charcoal,
    lineHeight: 17,
    minHeight: 34,
  },
  carouselProductMeta: {
    fontSize: 11,
    color: colors.muted,
    marginTop: 4,
    fontWeight: '500',
  },
  // Logged Meals Section
  loggedMealsSection: {
    paddingHorizontal: 20,
  },
  mealRowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#F3F0FA',
    ...shadows.sm,
  },
  mealIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F4EFFD',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  mealInfo: {
    flex: 1,
    paddingRight: 8,
  },
  mealName: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.charcoal,
  },
  mealMeta: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  mealCalPill: {
    backgroundColor: '#F4EFFD',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  mealCalText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.primaryPurple,
  },
  emptyMealsCard: {
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#F3F0FA',
    ...shadows.sm,
  },
  emptyMealsTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.charcoal,
  },
  emptyMealsSub: {
    fontSize: 13,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 4,
    maxWidth: 260,
  },
  weighNowBtn: {
    marginTop: 14,
    backgroundColor: '#F4EFFD',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
  },
  weighNowBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.primaryPurple,
  },
});
