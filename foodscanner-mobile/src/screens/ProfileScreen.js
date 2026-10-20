import React, { useEffect, useState } from 'react';
import {
  Alert,
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

import { getUserProfile, updateUserProfile } from '../services/api';
import PrimaryButton from '../components/PrimaryButton';
import SectionHeader from '../components/SectionHeader';
import { colors, shadows, spacing, typography } from '../theme';
import { useAuth } from '../context/AuthContext';

const DIETS = [
  { key: null, label: 'None', icon: 'remove-circle-outline' },
  { key: 'diabetic', label: 'Diabetic', icon: 'water-outline' },
  { key: 'vegan', label: 'Vegan', icon: 'leaf-outline' },
  { key: 'vegetarian', label: 'Vegetarian', icon: 'nutrition-outline' },
  { key: 'low_sodium', label: 'Low sodium', icon: 'fitness-outline' },
];

const GOALS = [
  { key: 'lose_weight', label: 'Lose weight', icon: 'trending-down-outline' },
  { key: 'control_sugar', label: 'Control sugar', icon: 'shield-checkmark-outline' },
  { key: 'eat_clean', label: 'Eat clean', icon: 'sparkles-outline' },
  { key: 'build_muscle', label: 'Build muscle', icon: 'barbell-outline' },
  { key: 'reduce_sodium', label: 'Reduce sodium', icon: 'heart-outline' },
];

const CALORIE_PRESETS = ['1500', '1800', '2000', '2200', '2500'];

function Choice({ label, icon, active, onPress }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.choice, active && styles.choiceActive]}
    >
      {icon ? (
        <Ionicons
          name={icon}
          size={16}
          color={active ? colors.white : colors.textSecondary}
          style={{ marginRight: 6 }}
        />
      ) : null}
      <Text style={[styles.choiceText, active && styles.choiceTextActive]}>{label}</Text>
    </Pressable>
  );
}

export default function ProfileScreen({ navigation }) {
  const { logout } = useAuth();
  const [profile, setProfile] = useState(null);
  const [diet, setDiet] = useState(null);
  const [goal, setGoal] = useState(null);
  const [goalDays, setGoalDays] = useState('');
  const [dailyLimit, setDailyLimit] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const nextProfile = await getUserProfile();
        if (!active) return;
        setProfile(nextProfile);
        setDiet(nextProfile?.diet_type ?? null);
        setGoal(nextProfile?.goal_type ?? null);
        setGoalDays(nextProfile?.goal_target_days ? String(nextProfile.goal_target_days) : '');
        setDailyLimit(
          nextProfile?.daily_calorie_limit ? String(nextProfile.daily_calorie_limit) : '',
        );
      } catch (error) {
        if (active) {
          setLoadError(error?.response?.data?.detail || error?.message || 'Profile could not be loaded.');
        }
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const save = async () => {
    const calorieLimit = dailyLimit.trim() ? Number(dailyLimit) : null;
    const targetDays = goalDays.trim() ? Number(goalDays) : null;

    if (calorieLimit !== null && (!Number.isInteger(calorieLimit) || calorieLimit <= 0)) {
      Alert.alert('Check your goal', 'Enter a whole-number daily calorie target greater than zero.');
      return;
    }

    if (targetDays !== null && (!Number.isInteger(targetDays) || targetDays <= 0)) {
      Alert.alert('Check your goal', 'Enter a whole-number goal duration greater than zero.');
      return;
    }

    setSaving(true);
    try {
      const updated = await updateUserProfile({
        diet_type: diet,
        daily_calorie_limit: calorieLimit,
        goal_type: goal,
        goal_target_days: targetDays,
      });
      setProfile((current) => ({ ...current, ...updated }));
      Alert.alert('Profile Saved', 'Your nutrition context and targets have been updated successfully.');
    } catch (error) {
      const message = error?.response?.data?.detail || error?.message || 'Profile update failed.';
      Alert.alert('Unable to save', String(message));
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    Alert.alert('Log out', 'Are you sure you want to log out of NutriScale?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: logout },
    ]);
  };

  const initial = (profile?.name || profile?.email || 'U').trim().slice(0, 1).toUpperCase();

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.eyebrowRow}>
            <Ionicons name="person-outline" size={14} color={colors.emerald} style={{ marginRight: 6 }} />
            <Text style={styles.kicker}>PROFILE &amp; SETTINGS</Text>
          </View>
          <Text style={styles.title}>Nutrition Context</Text>
          <Text style={styles.intro}>
            Customize your calorie goals and dietary preferences to tailor NutriScale recommendations to you.
          </Text>
        </View>

        {/* Account Card */}
        <View style={styles.accountCard}>
          <View style={styles.initialCircle}>
            <Text style={styles.initialText}>{initial}</Text>
          </View>
          <View style={styles.accountCopy}>
            <Text style={styles.name}>{profile?.name || 'User Profile'}</Text>
            <Text style={styles.email}>{profile?.email || 'Active Account'}</Text>
          </View>
        </View>

        {loadError ? <Text style={styles.error}>{String(loadError)}</Text> : null}

        {/* Daily Calorie Target Card */}
        <SectionHeader>DAILY CALORIE TARGET</SectionHeader>
        <View style={styles.card}>
          <Text style={styles.cardSubtitle}>
            Choose a quick target preset or type your custom calorie limit:
          </Text>
          <View style={styles.presetRow}>
            {CALORIE_PRESETS.map((preset) => (
              <TouchableOpacity
                key={preset}
                style={[styles.presetChip, dailyLimit === preset && styles.presetChipActive]}
                onPress={() => setDailyLimit(preset)}
              >
                <Text style={[styles.presetText, dailyLimit === preset && styles.presetTextActive]}>
                  {preset}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.inputWrapper}>
            <Ionicons name="flame-outline" size={20} color={colors.muted} style={{ marginRight: 10 }} />
            <TextInput
              accessibilityLabel="Daily calorie target"
              style={styles.textInput}
              value={dailyLimit}
              onChangeText={setDailyLimit}
              keyboardType="numeric"
              placeholder="Custom limit (e.g. 2000)"
              placeholderTextColor={colors.muted}
            />
            <Text style={styles.unitText}>kcal / day</Text>
          </View>
        </View>

        {/* Dietary Preference Card */}
        <SectionHeader>DIETARY RESTRICTIONS</SectionHeader>
        <View style={styles.card}>
          <Text style={styles.cardSubtitle}>NutriScale will warn you about restricted ingredients:</Text>
          <View style={styles.choices}>
            {DIETS.map((item) => (
              <Choice
                key={String(item.key)}
                label={item.label}
                icon={item.icon}
                active={diet === item.key}
                onPress={() => setDiet(item.key)}
              />
            ))}
          </View>
        </View>

        {/* Health & Fitness Goal Card */}
        <SectionHeader>FITNESS GOAL &amp; TIMELINE</SectionHeader>
        <View style={styles.card}>
          <Text style={styles.cardSubtitle}>Select your primary nutritional objective:</Text>
          <View style={styles.choices}>
            {GOALS.map((item) => (
              <Choice
                key={item.key}
                label={item.label}
                icon={item.icon}
                active={goal === item.key}
                onPress={() => setGoal(item.key)}
              />
            ))}
          </View>

          <Text style={[styles.cardSubtitle, { marginTop: spacing.md }]}>Goal duration in days:</Text>
          <View style={styles.inputWrapper}>
            <Ionicons name="time-outline" size={20} color={colors.muted} style={{ marginRight: 10 }} />
            <TextInput
              accessibilityLabel="Goal duration"
              style={styles.textInput}
              value={goalDays}
              onChangeText={setGoalDays}
              keyboardType="numeric"
              placeholder="e.g. 30"
              placeholderTextColor={colors.muted}
            />
            <Text style={styles.unitText}>days</Text>
          </View>
        </View>

        {/* Devices Shortcut Card */}
        <SectionHeader>HARDWARE DEVICES</SectionHeader>
        <Pressable
          style={({ pressed }) => [styles.deviceLinkCard, pressed && styles.pressed]}
          onPress={() => navigation.navigate('Devices')}
        >
          <View style={styles.deviceIconCircle}>
            <Ionicons name="scale-outline" size={22} color={colors.emerald} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.deviceLinkTitle}>NutriScale Smart Scale</Text>
            <Text style={styles.deviceLinkSub}>Software simulated scale · Active</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.muted} />
        </Pressable>

        <PrimaryButton
          onPress={save}
          loading={saving}
          disabled={saving || loading}
          icon={<Ionicons name="checkmark-circle-outline" size={18} color={colors.white} />}
          style={{ marginTop: spacing.lg }}
        >
          SAVE PREFERENCES
        </PrimaryButton>

        {/* App Info & Logout */}
        <View style={styles.appCard}>
          <Text style={styles.appName}>NutriScale Mobile</Text>
          <Text style={styles.appDetail}>Nutrition intelligence engine &amp; portion tracking platform.</Text>
        </View>

        <Pressable accessibilityRole="button" onPress={handleLogout} style={styles.logoutBtn}>
          <Ionicons name="log-out-outline" size={18} color={colors.danger} style={{ marginRight: 6 }} />
          <Text style={styles.logoutText}>LOG OUT</Text>
        </Pressable>
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
  header: {
    marginBottom: spacing.sm,
  },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  kicker: {
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
  intro: {
    ...typography.subtitle,
    color: colors.muted,
    marginTop: 4,
  },
  accountCard: {
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
  initialCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.emerald,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initialText: {
    color: colors.white,
    fontSize: 22,
    fontWeight: '800',
  },
  accountCopy: {
    flex: 1,
    marginLeft: spacing.md,
  },
  name: {
    color: colors.charcoal,
    fontSize: 18,
    fontWeight: '800',
  },
  email: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 2,
  },
  error: {
    color: colors.danger,
    marginTop: spacing.sm,
    fontSize: 13,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.xs,
    ...shadows.sm,
  },
  cardSubtitle: {
    fontSize: 13,
    color: colors.muted,
    marginBottom: spacing.sm,
    lineHeight: 18,
  },
  presetRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: spacing.md,
  },
  presetChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  presetChipActive: {
    backgroundColor: colors.emeraldLight,
    borderColor: colors.emerald,
  },
  presetText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  presetTextActive: {
    color: colors.emerald,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    height: 50,
  },
  textInput: {
    flex: 1,
    height: '100%',
    fontSize: 15,
    fontWeight: '700',
    color: colors.charcoal,
  },
  unitText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.muted,
  },
  choices: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  choiceActive: {
    backgroundColor: colors.emerald,
    borderColor: colors.emerald,
  },
  choiceText: {
    color: colors.charcoal,
    fontSize: 13,
    fontWeight: '700',
  },
  choiceTextActive: {
    color: colors.white,
  },
  deviceLinkCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: 18,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  deviceIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.emeraldLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  deviceLinkTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.charcoal,
  },
  deviceLinkSub: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.99 }],
  },
  appCard: {
    marginTop: spacing.xl,
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  appName: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.charcoal,
  },
  appDetail: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 3,
    textAlign: 'center',
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderColor: colors.danger,
    borderRadius: 14,
    borderWidth: 1.5,
    backgroundColor: colors.white,
    marginTop: spacing.sm,
    minHeight: 48,
  },
  logoutText: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
});

