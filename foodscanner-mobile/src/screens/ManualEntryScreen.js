import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Pressable,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { analyzeManualProduct } from '../services/api';
import { logFoodEntry } from '../services/foodLog';
import { colors, spacing, typography } from '../theme';

const C = colors;

function NumInput({ label, unit, icon, color, value, onChangeText }) {
  return (
    <View style={styles.gridItem}>
      <View style={styles.inputHeader}>
        <View style={styles.inputLabelRow}>
          <View style={[styles.inputDot, { backgroundColor: color || C.emerald }]} />
          <Text style={styles.inputLabel}>{label}</Text>
        </View>
        <Text style={styles.unitBadge}>{unit}</Text>
      </View>
      <View style={styles.inputWrapper}>
        <TextInput
          style={styles.numInput}
          value={value}
          onChangeText={onChangeText}
          keyboardType="numeric"
          placeholder="0"
          placeholderTextColor={C.muted}
        />
      </View>
    </View>
  );
}

function _toNum(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export default function ManualEntryScreen({ navigation, route }) {
  const prefillName = route?.params?.productName;
  const prefillNutrition = route?.params?.nutrition;
  const prefillCalories = route?.params?.calories;

  const [productName, setProductName] = useState(String(prefillName || ''));
  const [loading, setLoading] = useState(false);

  const [calories, setCalories] = useState(
    prefillNutrition?.calories != null
      ? String(prefillNutrition.calories)
      : prefillCalories != null
        ? String(prefillCalories)
        : ''
  );
  const [fat, setFat] = useState(prefillNutrition?.fat != null ? String(prefillNutrition.fat) : '');
  const [sugar, setSugar] = useState(prefillNutrition?.sugar != null ? String(prefillNutrition.sugar) : '');
  const [salt, setSalt] = useState(prefillNutrition?.salt != null ? String(prefillNutrition.salt) : '');
  const [protein, setProtein] = useState(prefillNutrition?.protein != null ? String(prefillNutrition.protein) : '');
  const [fiber, setFiber] = useState(prefillNutrition?.fiber != null ? String(prefillNutrition.fiber) : '');
  const [carbs, setCarbs] = useState(prefillNutrition?.carbs != null ? String(prefillNutrition.carbs) : '');

  const payload = useMemo(
    () => ({
      product_name: String(productName || '').trim(),
      calories: _toNum(calories),
      fat: _toNum(fat),
      sugar: _toNum(sugar),
      salt: _toNum(salt),
      protein: _toNum(protein),
      fiber: _toNum(fiber),
      carbs: _toNum(carbs),
    }),
    [productName, calories, fat, sugar, salt, protein, fiber, carbs]
  );

  const onSubmit = async () => {
    if (!payload.product_name) {
      Alert.alert('Missing product name', 'Please provide a product name before analyzing.');
      return;
    }

    setLoading(true);
    try {
      const analyzed = await analyzeManualProduct(payload);

      // Ensure ResultScreen can render it like a /scan response
      const result = {
        product: {
          name: analyzed?.product?.name || payload.product_name,
          nutrition: analyzed?.product?.nutrition || analyzed?.nutrition || {
            calories: payload.calories,
            fat: payload.fat,
            sugar: payload.sugar,
            salt: payload.salt,
            protein: payload.protein,
            fiber: payload.fiber,
            carbs: payload.carbs,
          },
          barcode: '00000000',
        },
        analysis: analyzed?.analysis || {
          ingredient_analysis: null,
          additive_analysis: null,
          health_score: analyzed?.health_score,
        },
        decision: analyzed?.decision || {
          final_decision: analyzed?.final_decision,
          reasons: analyzed?.reasons,
        },
        diet_note: analyzed?.diet_note,
        recommendations: analyzed?.recommendations || [],
        final_decision: analyzed?.final_decision,
        health_score: analyzed?.health_score,
        reasons: analyzed?.reasons,
      };

      try {
        await logFoodEntry(
          productName || 'Manual Entry',
          parseFloat(result?.product?.nutrition?.calories || calories) || 0
        ).catch(() => {});
      } catch (_e) {
        // ignore
      }

      navigation.replace('Result', { result, timestamp: Date.now() });
    } catch (e) {
      const msg = e?.response?.data?.detail || e?.message || 'Analysis failed';
      Alert.alert('Error', String(msg));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Navigation Bar */}
        <View style={styles.navBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={20} color={C.charcoal} />
          </Pressable>
          <View style={styles.badgePill}>
            <Ionicons name="create-outline" size={14} color={C.emerald} />
            <Text style={styles.badgePillText}>MANUAL ENTRY</Text>
          </View>
        </View>

        <Text style={styles.title}>Nutrition Details</Text>
        <Text style={styles.subtitle}>
          Enter the values from your food label or packaging per serving / 100g.
        </Text>

        {/* Form Container */}
        <View style={styles.formCard}>
          {/* Product Name Input */}
          <View style={styles.fieldSection}>
            <Text style={styles.fieldLabel}>FOOD OR PRODUCT NAME</Text>
            <View style={styles.nameInputContainer}>
              <Ionicons name="fast-food-outline" size={18} color={C.muted} style={styles.nameIcon} />
              <TextInput
                style={styles.nameInput}
                value={productName}
                onChangeText={setProductName}
                placeholder="e.g. Greek Yogurt, Sprite, Oat Milk"
                placeholderTextColor={C.muted}
              />
              {productName.length > 0 && (
                <Pressable onPress={() => setProductName('')}>
                  <Ionicons name="close-circle" size={18} color={C.muted} />
                </Pressable>
              )}
            </View>
          </View>

          {/* Calorie Spotlight */}
          <View style={styles.calorieSection}>
            <View style={styles.calorieHeader}>
              <View style={styles.inputLabelRow}>
                <Ionicons name="flame" size={18} color={C.macroCalories || '#F97316'} />
                <Text style={styles.calorieLabel}>ENERGY / CALORIES</Text>
              </View>
              <Text style={styles.unitBadge}>kcal</Text>
            </View>
            <TextInput
              style={styles.calorieInput}
              value={calories}
              onChangeText={setCalories}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor={C.muted}
            />
          </View>

          {/* Macro Grid */}
          <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>MACRONUTRIENTS</Text>
          <View style={styles.grid}>
            <NumInput
              label="Protein"
              unit="g"
              color={C.macroProtein || '#3B82F6'}
              value={protein}
              onChangeText={setProtein}
            />
            <NumInput
              label="Carbohydrates"
              unit="g"
              color={C.macroCarbs || '#F59E0B'}
              value={carbs}
              onChangeText={setCarbs}
            />
            <NumInput
              label="Total Fat"
              unit="g"
              color={C.macroFat || '#EF4444'}
              value={fat}
              onChangeText={setFat}
            />
            <NumInput
              label="Dietary Fiber"
              unit="g"
              color={C.macroFiber || '#10B981'}
              value={fiber}
              onChangeText={setFiber}
            />
            <NumInput
              label="Sugars"
              unit="g"
              color={C.macroSugar || '#EC4899'}
              value={sugar}
              onChangeText={setSugar}
            />
            <NumInput
              label="Sodium / Salt"
              unit="g"
              color={C.macroSalt || '#6B7280'}
              value={salt}
              onChangeText={setSalt}
            />
          </View>

          {/* Action Buttons */}
          <TouchableOpacity
            style={[styles.primaryBtn, loading && styles.primaryBtnDisabled]}
            onPress={onSubmit}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color={C.white} size="small" />
                <Text style={styles.primaryBtnText}>Analyzing Nutrition…</Text>
              </View>
            ) : (
              <View style={styles.btnContentRow}>
                <Ionicons name="sparkles-outline" size={18} color={C.white} />
                <Text style={styles.primaryBtnText}>ANALYZE NUTRITION</Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={() => navigation.goBack()}
            disabled={loading}
            activeOpacity={0.7}
          >
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.background,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.surfaceCard,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: C.borderLight,
    shadowColor: C.shadows.sm.shadowColor,
    shadowOffset: C.shadows.sm.shadowOffset,
    shadowOpacity: C.shadows.sm.shadowOpacity,
    shadowRadius: C.shadows.sm.shadowRadius,
    elevation: 2,
  },
  backBtnPressed: {
    backgroundColor: C.surfaceSelected,
  },
  badgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: C.emeraldSoft,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
  },
  badgePillText: {
    color: C.emerald,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  title: {
    ...typography.hero,
    fontSize: 28,
    color: C.charcoal,
    marginTop: spacing.xs,
  },
  subtitle: {
    color: C.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },

  // Form Container
  formCard: {
    backgroundColor: C.surfaceCard,
    borderRadius: 20,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: C.borderLight,
    shadowColor: C.shadows.sm.shadowColor,
    shadowOffset: C.shadows.sm.shadowOffset,
    shadowOpacity: C.shadows.sm.shadowOpacity,
    shadowRadius: C.shadows.sm.shadowRadius,
    elevation: 2,
  },

  fieldSection: {
    marginBottom: spacing.md,
  },
  fieldLabel: {
    color: C.muted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: spacing.xs,
  },
  nameInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.background,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: C.borderLight,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
  },
  nameIcon: {
    marginRight: 8,
  },
  nameInput: {
    flex: 1,
    paddingVertical: 10,
    color: C.charcoal,
    fontSize: 15,
    fontWeight: '700',
  },

  // Calorie Highlight Box
  calorieSection: {
    backgroundColor: C.amberSoft || '#FEF3C7',
    borderRadius: 14,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.25)',
  },
  calorieHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  calorieLabel: {
    color: '#B45309',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
    marginLeft: 6,
  },
  calorieInput: {
    backgroundColor: C.surfaceCard,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
    paddingVertical: 10,
    paddingHorizontal: 14,
    fontSize: 20,
    fontWeight: '900',
    color: C.charcoal,
  },

  // Nutrient Grid
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: spacing.xs,
  },
  gridItem: {
    width: '48%',
    backgroundColor: C.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.borderLight,
    padding: spacing.sm,
  },
  inputHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  inputLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  inputDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  inputLabel: {
    color: C.charcoal,
    fontSize: 12,
    fontWeight: '700',
  },
  unitBadge: {
    color: C.muted,
    fontSize: 11,
    fontWeight: '800',
  },
  inputWrapper: {},
  numInput: {
    backgroundColor: C.surfaceCard,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.borderLight,
    paddingVertical: 7,
    paddingHorizontal: 10,
    fontSize: 15,
    fontWeight: '800',
    color: C.charcoal,
  },

  // Action Buttons
  primaryBtn: {
    marginTop: spacing.xl,
    backgroundColor: C.emerald,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: C.emerald,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  primaryBtnDisabled: {
    opacity: 0.6,
  },
  btnContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  primaryBtnText: {
    color: C.white,
    fontWeight: '800',
    fontSize: 15,
    letterSpacing: 0.6,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  cancelBtn: {
    marginTop: spacing.sm,
    backgroundColor: 'transparent',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.borderLight,
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelBtnText: {
    color: C.textSecondary,
    fontWeight: '700',
    fontSize: 14,
  },
});
