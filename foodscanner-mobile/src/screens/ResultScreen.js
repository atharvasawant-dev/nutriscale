import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { explainProduct, logFoodManual, savePortion } from '../services/api';
import { Alert } from 'react-native';
import { colors, shadows, spacing } from '../theme';
import PrimaryButton from '../components/PrimaryButton';
import SectionHeader from '../components/SectionHeader';

function _decisionMeta(decision) {
  const d = String(decision || '').toUpperCase();
  if (d === 'SAFE') return { text: 'HEALTHY / SAFE', bg: '#ECFDF5', fg: '#065F46', border: '#A7F3D0', icon: 'checkmark-circle' };
  if (d === 'MODERATE') return { text: 'MODERATE CONSUMPTION', bg: '#FEF3C7', fg: '#92400E', border: '#FDE68A', icon: 'alert-circle' };
  return { text: d || 'LIMIT / AVOID', bg: '#FEE2E2', fg: '#991B1B', border: '#FECACA', icon: 'close-circle' };
}

function _riskBadge(level) {
  const l = String(level || '').toUpperCase();
  if (l.includes('LOW')) return { text: 'LOW RISK', bg: '#ECFDF5', fg: '#065F46', icon: 'checkmark-circle-outline' };
  if (l.includes('MED')) return { text: 'MEDIUM RISK', bg: '#FEF3C7', fg: '#92400E', icon: 'alert-circle-outline' };
  if (l.includes('HIGH')) return { text: 'HIGH RISK', bg: '#FEE2E2', fg: '#991B1B', icon: 'warning-outline' };
  return { text: l || 'N/A', bg: colors.surface, fg: colors.muted, icon: 'help-circle-outline' };
}

function NutrientBar({ label, value, max, color, unit = 'g' }) {
  const v = Number(value) || 0;
  const m = Number(max) || 100;
  const pct = Math.max(0, Math.min(1, m ? v / m : 0));
  return (
    <View style={styles.nRow}>
      <View style={styles.nRowTop}>
        <Text style={styles.nLabel}>{label}</Text>
        <Text style={styles.nValue}>{v} <Text style={styles.nUnit}>{unit}</Text></Text>
      </View>
      <View style={styles.nBarBg}>
        <View style={[styles.nBarFill, { width: `${pct * 100}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

function _friendlyAdviceFromText(text) {
  const raw = String(text || '').trim();
  if (!raw) return '';

  const normalized = raw
    .replace(/\s*;\s*/g, '. ')
    .replace(/\s*\|\s*/g, '. ')
    .replace(/\s{2,}/g, ' ')
    .replace(/\.+/g, '.')
    .trim();

  if (!normalized) return '';

  const sentences = normalized
    .split('.')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => (/[!?]$/.test(s) ? s : `${s}.`));

  return sentences.join(' ');
}

function _friendlyDietNote(dietNote) {
  const raw = String(dietNote || '').trim();
  if (!raw) return '';

  if (/Sugar\s*>\s*5g/i.test(raw) && /diabetic/i.test(raw)) {
    return 'High sugar detected — not recommended for diabetic nutrition.';
  }

  return _friendlyAdviceFromText(raw);
}

function _extractExplainSteps(explain) {
  const steps = explain?.steps;
  return Array.isArray(steps) ? steps : [];
}

function _extractFallbackReasons(result) {
  const a = Array.isArray(result?.reasons) ? result.reasons : [];
  const b = Array.isArray(result?.analysis?.reasons) ? result.analysis.reasons : [];
  return [...a, ...b].filter(Boolean);
}

export default function ResultScreen({ route, navigation }) {
  const result = route?.params?.result;
  const barcode = result?.product?.barcode || result?.barcode;

  const decision = result?.decision?.final_decision || result?.final_decision;
  const healthScore = result?.analysis?.health_score ?? result?.health_score;
  const productName = result?.product?.name || result?.product_name;
  const nutrition = useMemo(() => (
    result?.product?.nutrition || result?.nutrition || {}
  ), [result]);

  const ingredientAnalysis = result?.analysis?.ingredient_analysis || result?.ingredient_analysis;
  const additiveAnalysis = result?.analysis?.additive_analysis || result?.additive_analysis;
  const dietNote = result?.diet_note;

  const initialServing = route?.params?.result?.measured_weight
    ? String(Math.round(route.params.result.measured_weight))
    : '100';

  const [servingGrams, setServingGrams] = useState(initialServing);
  const [loadingExplain, setLoadingExplain] = useState(false);
  const [explain, setExplain] = useState(null);
  const [explainError, setExplainError] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [savedPortion, setSavedPortion] = useState(Boolean(route?.params?.savedPortion));
  const [savingPortion, setSavingPortion] = useState(false);

  useEffect(() => {
    setServingGrams(
      route?.params?.result?.measured_weight
        ? String(Math.round(route.params.result.measured_weight))
        : '100'
    );
    setSavedPortion(Boolean(route?.params?.savedPortion));
    setExplain(null);
    setExplainError(false);
    setShowBreakdown(false);
    setLoadingExplain(false);
  }, [route?.params?.timestamp, route?.params?.savedPortion, route?.params?.result?.measured_weight]);

  const handleLogFromDetails = async () => {
    if (savedPortion || savingPortion) return;
    setSavingPortion(true);
    try {
      const sId = result?.scan_session_id;
      if (sId) {
        await savePortion(sId);
      } else {
        await logFoodManual(productName || 'Weighed Food', perServing.calories);
      }
      setSavedPortion(true);
      Alert.alert(
        'Portion Logged to Today',
        `${productName || 'Food item'} (${servingSizeNum} g) has been recorded to today's intake.`
      );
    } catch (err) {
      const msg = err?.response?.data?.detail || err?.message || "Could not record portion to today's intake. Please try again.";
      Alert.alert('Logging Failed', msg);
    } finally {
      setSavingPortion(false);
    }
  };

  useEffect(() => {
    setServingGrams('100');
  }, [barcode]);

  const decisionMeta = useMemo(() => _decisionMeta(decision), [decision]);
  const ingredientRisk = useMemo(() => _riskBadge(ingredientAnalysis?.risk_level), [ingredientAnalysis]);

  const loadExplain = async () => {
    if (!barcode) return;
    if (String(barcode) === '00000000') return;
    setLoadingExplain(true);
    setExplainError(false);
    try {
      const data = await explainProduct(barcode);
      setExplain(data);
    } catch (_e) {
      setExplainError(true);
    } finally {
      setLoadingExplain(false);
    }
  };

  const additiveList = additiveAnalysis?.additives || [];
  const brand = result?.product?.brand || result?.brand || '';

  const verdictReason =
    (Array.isArray(result?.reasons) && result.reasons.length > 0 ? result.reasons[0] : null) ||
    (Array.isArray(result?.analysis?.reasons) && result.analysis.reasons.length > 0 ? result.analysis.reasons[0] : null) ||
    result?.diet_note ||
    '';

  const reasonsJoined = useMemo(() => _extractFallbackReasons(result).join('; '), [result]);
  const friendlyDietNote = useMemo(() => _friendlyDietNote(dietNote), [dietNote]);
  const adviceText = useMemo(() => {
    const base = reasonsJoined || dietNote || 'Keep an eye on portion size and daily balance.';
    return _friendlyAdviceFromText(base);
  }, [reasonsJoined, dietNote]);

  const breakdownSteps = useMemo(() => {
    if (explainError || String(barcode) === '00000000') return [];
    return _extractExplainSteps(explain);
  }, [explain, explainError, barcode]);

  const servingSizeNum = useMemo(() => {
    const n = Number(String(servingGrams || '').trim());
    if (!Number.isFinite(n) || n <= 0) return 100;
    return n;
  }, [servingGrams]);

  const servingRatio = useMemo(() => servingSizeNum / 100, [servingSizeNum]);

  const perServing = useMemo(() => {
    const scale = (v) => {
      const num = Number(v);
      if (!Number.isFinite(num)) return 0;
      return Math.round(num * servingRatio * 10) / 10;
    };

    return {
      calories: scale(nutrition?.calories ?? 0),
      sugar: scale(nutrition?.sugar ?? 0),
      salt: scale(nutrition?.salt ?? 0),
      fat: scale(nutrition?.fat ?? 0),
      protein: scale(nutrition?.protein ?? 0),
      fiber: scale(nutrition?.fiber ?? 0),
      carbs: scale(nutrition?.carbs ?? 0),
    };
  }, [nutrition, servingRatio]);

  const dailyCalorieLimit = useMemo(() => {
    const consumed = result?.daily_intake?.consumed;
    const remaining = result?.daily_intake?.remaining;
    const c = Number(consumed);
    const r = Number(remaining);
    if (Number.isFinite(c) && Number.isFinite(r) && c >= 0 && r >= 0) return c + r;
    return 2000;
  }, [result?.daily_intake?.consumed, result?.daily_intake?.remaining]);

  const servingPctOfDaily = useMemo(() => {
    const lim = Number(dailyCalorieLimit);
    if (!Number.isFinite(lim) || lim <= 0) return null;
    return Math.round((Number(perServing.calories || 0) / lim) * 100);
  }, [dailyCalorieLimit, perServing]);

  const fallbackReasons = useMemo(() => {
    if (!explainError && String(barcode) !== '00000000') return [];
    return _extractFallbackReasons(result);
  }, [result, explainError, barcode]);

  if (!result) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Text style={styles.emptyText}>No result to show.</Text>
          <PrimaryButton onPress={() => navigation.navigate('Main', { screen: 'Scale' })}>
            SCAN FOOD
          </PrimaryButton>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Navigation Bar */}
        <View style={styles.topNav}>
          <Pressable style={styles.navBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={20} color={colors.charcoal} />
          </Pressable>
          <Text style={styles.navTitle}>Nutrition Scorecard</Text>
          <Pressable style={styles.navBtn} onPress={() => navigation.navigate('Main', { screen: 'Home' })}>
            <Ionicons name="home-outline" size={20} color={colors.charcoal} />
          </Pressable>
        </View>

        {/* Product Card */}
        <View style={styles.productCard}>
          <View style={styles.productIconCircle}>
            <Ionicons name="nutrition" size={28} color={colors.emerald} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.productName} numberOfLines={2}>{productName || 'Unknown product'}</Text>
            {brand ? <Text style={styles.productBrand} numberOfLines={1}>{brand}</Text> : null}
            {barcode && barcode !== '00000000' ? (
              <Text style={styles.barcodeText}>Barcode: {barcode}</Text>
            ) : null}
          </View>
        </View>

        {/* Verdict Banner */}
        <View style={[styles.verdictBanner, { backgroundColor: decisionMeta.bg, borderColor: decisionMeta.border }]}>
          <View style={styles.verdictHeader}>
            <Ionicons name={decisionMeta.icon} size={22} color={decisionMeta.fg} style={{ marginRight: 6 }} />
            <Text style={[styles.verdictTitle, { color: decisionMeta.fg }]}>{decisionMeta.text}</Text>
            {healthScore !== undefined && healthScore !== null ? (
              <View style={styles.scoreBadge}>
                <Text style={styles.scoreBadgeText}>Score: {healthScore}/100</Text>
              </View>
            ) : null}
          </View>
          <Text style={[styles.verdictReason, { color: decisionMeta.fg }]}>
            {verdictReason || 'Verdict calculated from ingredient profiles and macro balance.'}
          </Text>
        </View>

        {/* Serving Portion Calculator */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Ionicons name="calculator-outline" size={18} color={colors.emerald} style={{ marginRight: 6 }} />
            <Text style={styles.cardTitle}>PORTION CALCULATOR</Text>
          </View>
          <Text style={styles.cardSubtitle}>Select or type your planned serving size:</Text>

          {/* Quick Serving Chips */}
          <View style={styles.portionChipsRow}>
            {['50', '100', '150', '200', '250'].map((val) => (
              <TouchableOpacity
                key={val}
                style={[styles.portionChip, servingGrams === val && styles.portionChipActive]}
                onPress={() => setServingGrams(val)}
              >
                <Text style={[styles.portionChipText, servingGrams === val && styles.portionChipTextActive]}>
                  {val}g
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.customInputRow}>
            <Text style={styles.customInputLabel}>Custom (g):</Text>
            <TextInput
              style={styles.servingInput}
              value={servingGrams}
              onChangeText={setServingGrams}
              keyboardType="numeric"
              placeholder="100"
              placeholderTextColor={colors.muted}
            />
          </View>

          {/* Serving Output Highlight */}
          <View style={styles.servingHighlightCard}>
            <View style={styles.servingCalorieRow}>
              <Text style={styles.servingCalorieNumber}>{perServing.calories}</Text>
              <Text style={styles.servingCalorieUnit}>kcal in {servingSizeNum}g portion</Text>
            </View>

            <View style={styles.servingMacroRow}>
              <Text style={styles.servingMacroText}>
                {perServing.protein}g protein · {perServing.carbs}g carbs · {perServing.fat}g fat
              </Text>
              <Text style={styles.servingMinorText}>
                {perServing.sugar}g sugar · {perServing.fiber}g fiber · {perServing.salt}g salt
              </Text>
            </View>

            {servingPctOfDaily !== null ? (
              <View style={styles.dailyPercentPill}>
                <Ionicons name="pie-chart-outline" size={14} color={colors.emerald} style={{ marginRight: 4 }} />
                <Text style={styles.dailyPercentText}>
                  {servingPctOfDaily}% of your 2,000 kcal daily budget
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Nutrition per 100g Progress Bars */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Ionicons name="stats-chart-outline" size={18} color={colors.emerald} style={{ marginRight: 6 }} />
            <Text style={styles.cardTitle}>NUTRITION FACTS (PER 100g)</Text>
          </View>
          <NutrientBar label="Calories" value={nutrition.calories ?? 0} max={600} color={colors.emerald} unit="kcal" />
          <NutrientBar label="Protein" value={nutrition.protein ?? 0} max={50} color={colors.protein} unit="g" />
          <NutrientBar label="Carbohydrates" value={nutrition.carbs ?? 0} max={100} color={colors.carbs} unit="g" />
          <NutrientBar label="Fat" value={nutrition.fat ?? 0} max={70} color={colors.fat} unit="g" />
          <NutrientBar label="Sugar" value={nutrition.sugar ?? 0} max={50} color={colors.sugar} unit="g" />
          <NutrientBar label="Fiber" value={nutrition.fiber ?? 0} max={30} color={colors.fiber} unit="g" />
          <NutrientBar label="Salt" value={nutrition.salt ?? 0} max={10} color={colors.salt} unit="g" />
        </View>

        {/* Safety & Additives Badges */}
        <SectionHeader>INGREDIENTS &amp; ADDITIVES</SectionHeader>
        <View style={styles.flagsRow}>
          <View style={[styles.flagPill, { backgroundColor: ingredientRisk.bg }]}>
            <Ionicons name={ingredientRisk.icon} size={16} color={ingredientRisk.fg} style={{ marginRight: 4 }} />
            <Text style={[styles.flagText, { color: ingredientRisk.fg }]}>
              Ingredients: {ingredientRisk.text}
            </Text>
          </View>
          <View style={[styles.flagPill, { backgroundColor: additiveList.length ? '#FEF3C7' : '#ECFDF5' }]}>
            <Ionicons
              name={additiveList.length ? 'alert-circle-outline' : 'checkmark-circle-outline'}
              size={16}
              color={additiveList.length ? '#92400E' : '#065F46'}
              style={{ marginRight: 4 }}
            />
            <Text style={[styles.flagText, { color: additiveList.length ? '#92400E' : '#065F46' }]}>
              Additives: {additiveList.length} detected
            </Text>
          </View>
        </View>

        {/* Personalized Nutrition Advice */}
        <View style={styles.adviceBox}>
          <View style={styles.adviceHeader}>
            <Ionicons name="sparkles" size={16} color="#065F46" style={{ marginRight: 6 }} />
            <Text style={styles.adviceKicker}>PERSONALIZED RECOMMENDATION</Text>
          </View>
          {friendlyDietNote ? (
            <Text style={styles.dietNoteText}>{friendlyDietNote}</Text>
          ) : null}
          <Text style={styles.adviceText}>{adviceText}</Text>
        </View>

        {/* Score Breakdown Accordion */}
        <View style={styles.card}>
          <TouchableOpacity
            style={styles.accordionHeader}
            onPress={() => {
              if (!explain && barcode && String(barcode) !== '00000000') loadExplain();
              setShowBreakdown((v) => !v);
            }}
          >
            <View style={styles.cardHeaderRow}>
              <Ionicons name="help-buoy-outline" size={18} color={colors.emerald} style={{ marginRight: 6 }} />
              <Text style={styles.cardTitle}>HOW THE SCORE WAS CALCULATED</Text>
            </View>
            <Ionicons
              name={showBreakdown ? 'chevron-up' : 'chevron-down'}
              size={20}
              color={colors.charcoal}
            />
          </TouchableOpacity>

          {loadingExplain ? (
            <View style={styles.loadingExplainWrap}>
              <ActivityIndicator color={colors.emerald} />
              <Text style={styles.loadingExplainText}>Loading calculation steps...</Text>
            </View>
          ) : null}

          {showBreakdown ? (
            <View style={styles.breakdownContent}>
              {explain && explain.score_calculation ? (
                <Text style={styles.calcFormulaText}>Calculation: {explain.score_calculation}</Text>
              ) : null}

              {breakdownSteps.length > 0
                ? breakdownSteps.map((s, idx) => {
                    const impact = Number(s?.impact) || 0;
                    const isPositive = impact >= 0;
                    const value = s?.value ?? s?.val;
                    return (
                      <View key={idx} style={styles.stepCard}>
                        <View style={styles.stepTopRow}>
                          <Text style={styles.stepFactor}>{String(s?.factor || 'Factor')}</Text>
                          <View style={[styles.impactBadge, { backgroundColor: isPositive ? '#ECFDF5' : '#FEE2E2' }]}>
                            <Text style={[styles.impactText, { color: isPositive ? '#065F46' : '#991B1B' }]}>
                              {isPositive ? '+' : ''}{impact}
                            </Text>
                          </View>
                        </View>
                        {value !== undefined && value !== null && String(value).length ? (
                          <Text style={styles.stepValue}>Measured: {String(value)}</Text>
                        ) : null}
                        {s?.reason ? <Text style={styles.stepText}>{String(s.reason)}</Text> : null}
                      </View>
                    );
                  })
                : null}

              {breakdownSteps.length === 0 && fallbackReasons.length > 0
                ? fallbackReasons.map((r, idx) => (
                    <View key={idx} style={styles.stepCard}>
                      <Text style={styles.stepFactor}>Reason {idx + 1}</Text>
                      <Text style={styles.stepText}>{String(r)}</Text>
                    </View>
                  ))
                : null}

              {breakdownSteps.length === 0 && fallbackReasons.length === 0 && !loadingExplain ? (
                <Text style={styles.cardText}>No extra breakdown steps available for this product.</Text>
              ) : null}
            </View>
          ) : null}
        </View>

        {/* Log to Today's Intake Button */}
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Log to Today's Intake"
          onPress={handleLogFromDetails}
          disabled={savedPortion || savingPortion}
          style={[styles.resultLogButton, savedPortion && styles.resultLogButtonDone]}
        >
          {savingPortion ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons
                name={savedPortion ? "checkmark-circle" : "add-circle-outline"}
                size={18}
                color={colors.white}
                style={{ marginRight: 8 }}
              />
              <Text style={styles.resultLogButtonText}>
                {savedPortion ? "Logged to Today's Intake ✓" : "Log to Today's Intake"}
              </Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Scan Another Button */}
        <PrimaryButton
          onPress={() => {
            navigation.reset({
              index: 0,
              routes: [{ name: 'Main' }],
            });
          }}
          icon={<Ionicons name="barcode-outline" size={18} color={colors.white} />}
          style={{ marginTop: spacing.lg }}
        >
          SCAN ANOTHER FOOD
        </PrimaryButton>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    backgroundColor: colors.background,
  },
  emptyText: {
    fontSize: 16,
    color: colors.muted,
    marginBottom: spacing.md,
  },
  topNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  navBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.sm,
  },
  navTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.charcoal,
  },
  productCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
    ...shadows.sm,
  },
  productIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: colors.emeraldLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  productName: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.charcoal,
  },
  productBrand: {
    fontSize: 13,
    color: colors.muted,
    marginTop: 2,
    fontWeight: '600',
  },
  barcodeText: {
    fontSize: 11,
    color: colors.muted,
    marginTop: 2,
  },
  verdictBanner: {
    borderRadius: 20,
    borderWidth: 1,
    padding: spacing.md,
    marginVertical: spacing.sm,
    ...shadows.sm,
  },
  verdictHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  verdictTitle: {
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.5,
    flex: 1,
  },
  scoreBadge: {
    backgroundColor: colors.white,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  scoreBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.charcoal,
  },
  verdictReason: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600',
    marginTop: 6,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
    ...shadows.sm,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    color: colors.textSecondary,
  },
  cardSubtitle: {
    fontSize: 13,
    color: colors.muted,
    marginTop: 4,
    marginBottom: spacing.sm,
  },
  portionChipsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: spacing.sm,
  },
  portionChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  portionChipActive: {
    backgroundColor: colors.emeraldLight,
    borderColor: colors.emerald,
  },
  portionChipText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  portionChipTextActive: {
    color: colors.emerald,
  },
  customInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  customInputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.muted,
    marginRight: 8,
  },
  servingInput: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 6,
    paddingHorizontal: 12,
    fontSize: 14,
    fontWeight: '700',
    color: colors.charcoal,
    width: 80,
  },
  servingHighlightCard: {
    backgroundColor: colors.emeraldLight,
    borderRadius: 16,
    padding: spacing.md,
    marginTop: 4,
  },
  servingCalorieRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  servingCalorieNumber: {
    fontSize: 32,
    fontWeight: '900',
    color: colors.emerald,
  },
  servingCalorieUnit: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.emeraldDark,
    marginLeft: 6,
  },
  servingMacroRow: {
    marginTop: 6,
  },
  servingMacroText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.charcoal,
  },
  servingMinorText: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  dailyPercentPill: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    backgroundColor: colors.white,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  dailyPercentText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.emerald,
  },
  nRow: {
    marginTop: 10,
  },
  nRowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  nLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.charcoal,
  },
  nValue: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.charcoal,
  },
  nUnit: {
    fontSize: 11,
    color: colors.muted,
  },
  nBarBg: {
    height: 7,
    backgroundColor: colors.surface,
    borderRadius: 4,
    overflow: 'hidden',
    marginTop: 5,
  },
  nBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  flagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: spacing.xs,
  },
  flagPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
  },
  flagText: {
    fontSize: 12,
    fontWeight: '800',
  },
  adviceBox: {
    backgroundColor: colors.emeraldLight,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    padding: spacing.md,
    marginVertical: spacing.sm,
  },
  adviceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  adviceKicker: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
    color: colors.emeraldDark,
  },
  dietNoteText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#065F46',
    marginTop: 4,
  },
  adviceText: {
    fontSize: 13,
    lineHeight: 19,
    color: '#065F46',
    marginTop: 4,
    fontWeight: '500',
  },
  accordionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  loadingExplainWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
    gap: 8,
  },
  loadingExplainText: {
    fontSize: 13,
    color: colors.muted,
  },
  breakdownContent: {
    marginTop: spacing.md,
  },
  calcFormulaText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.muted,
    marginBottom: 8,
  },
  stepCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 10,
    marginBottom: 8,
  },
  stepTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stepFactor: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.charcoal,
    flex: 1,
  },
  impactBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  impactText: {
    fontSize: 12,
    fontWeight: '900',
  },
  stepValue: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 4,
    fontWeight: '600',
  },
  stepText: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 17,
    marginTop: 4,
  },
  cardText: {
    fontSize: 13,
    color: colors.muted,
    marginTop: 6,
  },
  resultLogButton: {
    height: 52,
    borderRadius: 16,
    backgroundColor: colors.primaryPurple,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.lg,
    ...shadows.sm,
  },
  resultLogButtonDone: {
    backgroundColor: '#10B981',
  },
  resultLogButtonText: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.white,
  },
});

