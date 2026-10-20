import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { measurePortion, savePortion } from '../services/api';
import { colors, shadows, spacing, typography } from '../theme';
import PrimaryButton from '../components/PrimaryButton';
import SectionHeader from '../components/SectionHeader';
import NutritionMetric from '../components/NutritionMetric';
import InsightBlock from '../components/InsightBlock';
import ProductHeader from '../components/ProductHeader';
import StatusIndicator from '../components/StatusIndicator';

const NUTRIENTS = [
  ['protein', 'Protein', 'g'],
  ['carbs', 'Carbs', 'g'],
  ['fat', 'Fat', 'g'],
  ['sugar', 'Sugar', 'g'],
  ['fiber', 'Fiber', 'g'],
  ['salt', 'Salt', 'g'],
];

function formatValue(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return number < 10 ? number.toFixed(1).replace(/\.0$/, '') : Math.round(number).toString();
}

function StepIndicator({ currentStage }) {
  const steps = [
    { key: 'measuring', label: 'Weigh' },
    { key: 'nutrition', label: 'Nutrition' },
    { key: 'saved', label: 'Saved' },
  ];

  const getStepIndex = (stage) => {
    if (stage === 'measuring') return 0;
    if (stage === 'nutrition' || stage === 'intelligence') return 1;
    if (stage === 'saved') return 2;
    return 0;
  };

  const currentIndex = getStepIndex(currentStage);

  return (
    <View style={styles.stepContainer}>
      {steps.map((step, idx) => {
        const isDone = idx < currentIndex;
        const isActive = idx === currentIndex;
        return (
          <React.Fragment key={step.key}>
            <View style={styles.stepItem}>
              <View
                style={[
                  styles.stepCircle,
                  isActive && styles.stepCircleActive,
                  isDone && styles.stepCircleDone,
                ]}
              >
                {isDone ? (
                  <Ionicons name="checkmark" size={12} color={colors.white} />
                ) : (
                  <Text style={[styles.stepNum, (isActive || isDone) && styles.stepNumActive]}>
                    {idx + 1}
                  </Text>
                )}
              </View>
              <Text
                style={[
                  styles.stepLabel,
                  isActive && styles.stepLabelActive,
                  isDone && styles.stepLabelDone,
                ]}
              >
                {step.label}
              </Text>
            </View>
            {idx < steps.length - 1 && (
              <View
                style={[
                  styles.stepLine,
                  idx < currentIndex && styles.stepLineDone,
                ]}
              />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}

function Header({ onBack, eyebrow, title }) {
  return (
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={onBack} style={styles.back}>
        <Ionicons name="chevron-back" size={22} color={colors.charcoal} />
      </Pressable>
      <View style={styles.headerCopy}>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Text style={styles.title}>{title}</Text>
      </View>
    </View>
  );
}

export default function NutriScaleFlowScreen({ route, navigation }) {
  const result = route?.params?.result;
  const product = result?.product || {};
  const sessionId = result?.scan_session_id;
  const productName = product.name || 'Scanned food';
  const [stage, setStage] = useState('measuring');
  const [weight, setWeight] = useState(0);
  const [portion, setPortion] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const nutrition = portion?.portion_nutrition || {};
  const intelligence = portion?.nutrition_intelligence;
  const decisionSummary = useMemo(() => {
    if (!intelligence) return null;
    const standouts = intelligence.standout_nutrients || [];
    const primaryStandout = standouts[0];
    const standoutNames = standouts
      .slice(0, 2)
      .map((item) => `${formatValue(item.value)} ${item.unit} ${item.label.toLowerCase()}`)
      .join(' and ');
    const status = intelligence.suitability?.status;
    if (status && status !== 'GENERAL VIEW') {
      return {
        label: status,
        text: standoutNames
          ? `This portion stands out for ${standoutNames}. ${primaryStandout?.reason || 'Review the detailed nutrition below before deciding.'}`
          : 'This assessment uses your profile and the measured portion. Review the detailed nutrition below before deciding.',
      };
    }
    return {
      label: primaryStandout ? `${primaryStandout.label} contribution` : 'GENERAL VIEW',
      text: standoutNames
        ? `Your measured portion contains ${standoutNames}. ${primaryStandout?.reason || 'Review the detailed nutrition below to understand what stands out.'}`
        : 'This is an objective view of the measured portion based on the available product nutrition.',
    };
  }, [intelligence]);

  const insights = useMemo(() => {
    const reasons = result?.decision?.reasons;
    if (Array.isArray(reasons) && reasons.length) return reasons.slice(0, 3);
    const analysis = result?.analysis || {};
    if (analysis.additive_analysis?.summary) return [analysis.additive_analysis.summary];
    if (analysis.ingredient_analysis?.summary) return [analysis.ingredient_analysis.summary];
    return ['Your portion nutrition is calculated from the measured weight.'];
  }, [result]);

  const submitMeasurement = useCallback(async () => {
    if (!sessionId) {
      setError('This scan did not return a session. Please scan again.');
      return;
    }
    setError('');
    setStage('measuring');
    try {
      const measured = await measurePortion(sessionId, 126);
      setPortion(measured);
      setWeight(Number(measured.weight_grams) || 126);
      setStage('nutrition');
    } catch (e) {
      setStage('measuring');
      setError(e?.response?.data?.detail || e?.message || 'Unable to measure this portion.');
    }
  }, [sessionId]);

  useEffect(() => {
    submitMeasurement();
  }, [submitMeasurement]);

  const handleSave = async () => {
    if (!sessionId || saved) return;
    setSaving(true);
    setError('');
    try {
      await savePortion(sessionId);
      setSaved(true);
      setStage('saved');
    } catch (e) {
      setError(e?.response?.data?.detail || e?.message || 'Unable to save this portion.');
    } finally {
      setSaving(false);
    }
  };

  const goHome = () => navigation.navigate('Main', { screen: 'Home' });

  if (!result) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Text style={styles.errorText}>No scan result to show.</Text>
          <PrimaryButton onPress={() => navigation.navigate('Main', { screen: 'Scan' })}>
            SCAN AGAIN
          </PrimaryButton>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Header
          onBack={() => navigation.goBack()}
          eyebrow="NUTRISCALE FLOW"
          title={stage === 'saved' ? 'Portion Logged' : 'Portion Intelligence'}
        />

        {/* Step Flow Indicator */}
        <StepIndicator currentStage={stage} />

        <StatusIndicator>NutriScale · Smart Scale Sync Active</StatusIndicator>
        <ProductHeader name={productName} meta="Product verified · Measured weight applied" />

        {stage === 'measuring' && (
          <View style={styles.measuringCard}>
            <View style={styles.scaleGraphic}>
              <Ionicons name="scale-outline" size={48} color={colors.emerald} />
              <ActivityIndicator color={colors.emerald} style={{ marginTop: 12 }} />
            </View>
            <Text style={styles.hero}>Measuring Portion...</Text>
            <Text style={styles.body}>Place your food on the NutriScale. Weight will stabilize automatically.</Text>
            <View style={styles.weightDisplay}>
              <Text style={styles.weightNumber}>{weight}</Text>
              <Text style={styles.weightUnit}>g</Text>
            </View>
            <Text style={styles.stableText}>Simulated Scale Active · Reading stable</Text>
          </View>
        )}

        {(stage === 'nutrition' || stage === 'intelligence' || stage === 'saved') && (
          <>
            {/* Calorie & Weight Hero */}
            <View style={styles.portionSummaryCard}>
              <View style={styles.portionSummaryHeader}>
                <View style={styles.scalePill}>
                  <Ionicons name="scale-outline" size={14} color={colors.emerald} style={{ marginRight: 4 }} />
                  <Text style={styles.scalePillText}>{formatValue(weight)} g measured</Text>
                </View>
                <View style={styles.confirmedPill}>
                  <Ionicons name="checkmark-circle" size={14} color="#10B981" style={{ marginRight: 4 }} />
                  <Text style={styles.confirmedText}>Confirmed</Text>
                </View>
              </View>

              <View style={styles.portionCalorieRow}>
                <View>
                  <Text style={styles.portionCalorieLabel}>PORTION CALORIES</Text>
                  <View style={styles.portionCalorieValues}>
                    <Text style={styles.portionCalorieBig}>{formatValue(nutrition.calories)}</Text>
                    <Text style={styles.portionCalorieUnit}>kcal</Text>
                  </View>
                </View>
                <View style={styles.portionFlameCircle}>
                  <Ionicons name="flame" size={32} color={colors.emerald} />
                </View>
              </View>

              <Text style={styles.calculatedNote}>
                Calculated directly from your measured {formatValue(weight)} g portion.
              </Text>
            </View>

            {/* Nutrients Grid */}
            <SectionHeader>PORTION NUTRITION (IN {formatValue(weight)} g)</SectionHeader>
            <View style={styles.nutrientGrid}>
              {NUTRIENTS.map(([key, label, unit]) => (
                <NutritionMetric key={key} label={label} value={formatValue(nutrition[key])} unit={unit} />
              ))}
            </View>

            {/* Decision / Takeaway Card */}
            {decisionSummary ? (
              <View style={styles.decisionCard}>
                <View style={styles.decisionHeader}>
                  <Ionicons name="bulb-outline" size={20} color={colors.emerald} style={{ marginRight: 6 }} />
                  <Text style={styles.decisionLabel}>{decisionSummary.label}</Text>
                </View>
                <Text style={styles.decisionText}>{decisionSummary.text}</Text>
              </View>
            ) : null}

            {/* AI Intelligence Insights */}
            <View style={styles.intelligenceCard}>
              <SectionHeader>STANDOUT NUTRIENTS</SectionHeader>
              {(intelligence?.standout_nutrients || []).map((item) => (
                <InsightBlock key={item.nutrient} value={formatValue(item.value)} unit={item.unit}>
                  {item.reason}
                </InsightBlock>
              ))}

              <SectionHeader>WHAT THIS MEANS</SectionHeader>
              {(intelligence?.nutrient_explanations || []).map((item) => (
                <View style={styles.explanationCard} key={item.nutrient}>
                  <View style={styles.explanationHeader}>
                    <Ionicons name="information-circle-outline" size={16} color={colors.emerald} style={{ marginRight: 6 }} />
                    <Text style={styles.explanationLabel}>{item.nutrient}</Text>
                  </View>
                  <Text style={styles.explanationText}>{item.explanation}</Text>
                </View>
              ))}

              <SectionHeader>FIT FOR YOUR DIET</SectionHeader>
              <View style={styles.suitabilityCard}>
                <View style={styles.suitabilityBadge}>
                  <Text style={styles.suitabilityBadgeText}>
                    {intelligence?.suitability?.status || 'GENERAL VIEW'}
                  </Text>
                </View>
                <Text style={styles.suitabilityExpl}>{intelligence?.suitability?.explanation}</Text>
                {(intelligence?.suitability_reasons || insights).map((reason, index) => (
                  <View key={`${reason}-${index}`} style={styles.reasonRow}>
                    <Text style={styles.reasonBullet}>•</Text>
                    <Text style={styles.reasonText}>{reason}</Text>
                  </View>
                ))}
              </View>

              <SectionHeader>INGREDIENT ANALYSIS</SectionHeader>
              <View style={styles.ingredientCard}>
                <Ionicons name="leaf-outline" size={18} color={colors.emerald} style={{ marginRight: 8, marginTop: 2 }} />
                <Text style={styles.ingredientText}>
                  {intelligence?.ingredient_insights?.available
                    ? (intelligence.ingredient_insights.findings || []).join(' · ') || 'No flagged additives or concerns in available analysis.'
                    : "Ingredient list not published in open database. Portion analysis is calculated strictly from measured grams."}
                </Text>
              </View>

              {intelligence?.alternative ? (
                <>
                  <SectionHeader>HEALTHIER ALTERNATIVE</SectionHeader>
                  <View style={styles.altCard}>
                    <View style={styles.altHeader}>
                      <Ionicons name="swap-horizontal" size={18} color={colors.emerald} style={{ marginRight: 6 }} />
                      <Text style={styles.altTitle}>{intelligence.alternative.product_name}</Text>
                    </View>
                    <Text style={styles.altText}>
                      {intelligence.alternative.comparison_reasons?.length
                        ? `Compared with this: ${intelligence.alternative.comparison_reasons.join(' ')}`
                        : intelligence.alternative.reason}
                    </Text>
                    {(intelligence.alternative.comparison_reasons || []).map((reason, index) => (
                      <View key={`${reason}-${index}`} style={styles.reasonRow}>
                        <Text style={styles.reasonBullet}>•</Text>
                        <Text style={styles.reasonText}>{reason}</Text>
                      </View>
                    ))}
                  </View>
                </>
              ) : null}

              {intelligence?.smaller_portion ? (
                <>
                  <SectionHeader>PORTION CONTROL TIP</SectionHeader>
                  <View style={styles.tipCard}>
                    <Ionicons name="sparkles-outline" size={18} color={colors.warning} style={{ marginRight: 8 }} />
                    <Text style={styles.tipText}>
                      A smaller {formatValue(intelligence.smaller_portion.suggested_weight_grams)} g portion would only have ~{formatValue(intelligence.smaller_portion.nutrition.calories)} kcal.
                    </Text>
                  </View>
                </>
              ) : null}

              {intelligence?.daily_context ? (
                <>
                  <SectionHeader>DAILY CONTEXT</SectionHeader>
                  <View style={styles.contextCard}>
                    <View style={styles.contextHeader}>
                      <Ionicons name="pie-chart-outline" size={18} color={colors.info} style={{ marginRight: 6 }} />
                      <Text style={styles.contextTitle}>Daily Budget Impact</Text>
                    </View>
                    {intelligence.daily_context.remaining_calories >= 0 ? (
                      <Text style={styles.contextText}>
                        This meal is {formatValue(intelligence.daily_context.portion_percent_of_target)}% of your {formatValue(intelligence.daily_context.target_calories)} kcal daily target. You have {formatValue(intelligence.daily_context.remaining_calories)} kcal remaining today.
                      </Text>
                    ) : (
                      <Text style={styles.contextText}>
                        This meal is {formatValue(intelligence.daily_context.portion_percent_of_target)}% of your {formatValue(intelligence.daily_context.target_calories)} kcal daily target ({formatValue(Math.abs(intelligence.daily_context.remaining_calories))} kcal over target).
                      </Text>
                    )}
                  </View>
                </>
              ) : null}
            </View>

            {stage !== 'saved' && (
              <PrimaryButton
                onPress={handleSave}
                disabled={saving}
                loading={saving}
                icon={<Ionicons name="save-outline" size={18} color={colors.white} />}
                style={{ marginTop: spacing.md }}
              >
                LOG THIS PORTION
              </PrimaryButton>
            )}
          </>
        )}

        {stage === 'saved' && (
          <View style={styles.savedCard}>
            <View style={styles.savedCheckCircle}>
              <Ionicons name="checkmark" size={36} color={colors.white} />
            </View>
            <Text style={styles.savedTitle}>Portion Logged!</Text>
            <Text style={styles.savedProduct}>{productName}</Text>
            <View style={styles.savedStatsPill}>
              <Text style={styles.savedNutrition}>{formatValue(weight)} g · {formatValue(nutrition.calories)} kcal</Text>
            </View>
            <Text style={styles.savedCopy}>
              Your portion has been logged to today&apos;s nutritional history.
            </Text>
            <PrimaryButton
              onPress={goHome}
              icon={<Ionicons name="scan-outline" size={18} color={colors.white} />}
              style={{ width: '100%', marginTop: spacing.md }}
            >
              LOG ANOTHER FOOD
            </PrimaryButton>
            <Pressable
              style={styles.historyBtn}
              onPress={() => navigation.navigate('Main', { screen: 'Report' })}
            >
              <Text style={styles.historyBtnText}>VIEW TODAY&apos;S HISTORY ›</Text>
            </Pressable>
          </View>
        )}

        {error ? (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle" size={18} color={colors.danger} style={{ marginRight: 6 }} />
            <Text style={styles.errorText}>{error}</Text>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
    ...shadows.sm,
  },
  headerCopy: {
    flex: 1,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: colors.emerald,
  },
  title: {
    ...typography.cardTitle,
    fontSize: 22,
    color: colors.charcoal,
    marginTop: 2,
  },
  stepContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.white,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  stepCircleActive: {
    backgroundColor: colors.emerald,
  },
  stepCircleDone: {
    backgroundColor: colors.emerald,
  },
  stepNum: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.muted,
  },
  stepNumActive: {
    color: colors.white,
  },
  stepLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.muted,
  },
  stepLabelActive: {
    color: colors.emerald,
  },
  stepLabelDone: {
    color: colors.charcoal,
  },
  stepLine: {
    flex: 1,
    height: 2,
    backgroundColor: colors.surface,
    marginHorizontal: 8,
  },
  stepLineDone: {
    backgroundColor: colors.emerald,
  },
  measuringCard: {
    backgroundColor: colors.white,
    borderRadius: 24,
    padding: spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    marginVertical: spacing.md,
    ...shadows.md,
  },
  scaleGraphic: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: colors.emeraldLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  hero: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.charcoal,
    marginBottom: 4,
  },
  body: {
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 280,
  },
  weightDisplay: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
  weightNumber: {
    fontSize: 64,
    fontWeight: '900',
    color: colors.emerald,
    letterSpacing: -1,
  },
  weightUnit: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.muted,
    marginLeft: 6,
  },
  stableText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.emerald,
    marginTop: 4,
  },
  portionSummaryCard: {
    backgroundColor: colors.white,
    borderRadius: 22,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    ...shadows.md,
  },
  portionSummaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  scalePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.emeraldLight,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  scalePillText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.emerald,
  },
  confirmedPill: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  confirmedText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#10B981',
  },
  portionCalorieRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  portionCalorieLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    color: colors.muted,
  },
  portionCalorieValues: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 2,
  },
  portionCalorieBig: {
    fontSize: 48,
    fontWeight: '900',
    color: colors.charcoal,
    letterSpacing: -1,
  },
  portionCalorieUnit: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.muted,
    marginLeft: 6,
  },
  portionFlameCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.emeraldLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calculatedNote: {
    fontSize: 12,
    color: colors.muted,
    marginTop: spacing.sm,
  },
  nutrientGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  decisionCard: {
    backgroundColor: colors.white,
    borderRadius: 18,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginVertical: spacing.sm,
    ...shadows.sm,
  },
  decisionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  decisionLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.emerald,
    textTransform: 'uppercase',
  },
  decisionText: {
    fontSize: 14,
    color: colors.charcoal,
    lineHeight: 21,
    fontWeight: '500',
  },
  intelligenceCard: {
    marginTop: spacing.xs,
  },
  explanationCard: {
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.xs,
    ...shadows.sm,
  },
  explanationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  explanationLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.emerald,
    textTransform: 'uppercase',
  },
  explanationText: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 19,
  },
  suitabilityCard: {
    backgroundColor: colors.white,
    borderRadius: 18,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
    ...shadows.sm,
  },
  suitabilityBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.emeraldLight,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    marginBottom: 8,
  },
  suitabilityBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.emerald,
  },
  suitabilityExpl: {
    fontSize: 14,
    color: colors.charcoal,
    lineHeight: 20,
    fontWeight: '600',
    marginBottom: 8,
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 4,
  },
  reasonBullet: {
    fontSize: 14,
    color: colors.emerald,
    marginRight: 6,
    lineHeight: 19,
  },
  reasonText: {
    flex: 1,
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 19,
  },
  ingredientCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
    ...shadows.sm,
  },
  ingredientText: {
    flex: 1,
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 19,
  },
  altCard: {
    backgroundColor: colors.white,
    borderRadius: 18,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
    ...shadows.sm,
  },
  altHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  altTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.charcoal,
  },
  altText: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 19,
    marginBottom: 6,
  },
  tipCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    borderRadius: 16,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: '#FDE68A',
    marginBottom: spacing.sm,
  },
  tipText: {
    flex: 1,
    fontSize: 13,
    color: '#92400E',
    fontWeight: '600',
    lineHeight: 19,
  },
  contextCard: {
    backgroundColor: colors.white,
    borderRadius: 18,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
    ...shadows.sm,
  },
  contextHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  contextTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.info,
  },
  contextText: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 19,
  },
  savedCard: {
    backgroundColor: colors.white,
    borderRadius: 24,
    padding: spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    marginVertical: spacing.md,
    ...shadows.md,
  },
  savedCheckCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: colors.emerald,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  savedTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: colors.charcoal,
  },
  savedProduct: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.muted,
    marginTop: 4,
    textAlign: 'center',
  },
  savedStatsPill: {
    backgroundColor: colors.emeraldLight,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 14,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  savedNutrition: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.emerald,
  },
  savedCopy: {
    fontSize: 13,
    color: colors.muted,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  historyBtn: {
    marginTop: spacing.md,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  historyBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.emerald,
    letterSpacing: 0.5,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    borderRadius: 14,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  errorText: {
    fontSize: 13,
    color: colors.danger,
    fontWeight: '600',
  },
});

