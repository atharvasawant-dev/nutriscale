import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { getNetworkErrorMessage, login, register } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { colors, shadows, spacing, typography } from '../theme';
import PrimaryButton from '../components/PrimaryButton';

export default function LoginScreen() {
  const { login: authLogin } = useAuth();
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const onSubmit = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Required information', 'Please enter your email and password.');
      return;
    }

    setLoading(true);
    try {
      let data;
      if (mode === 'register') {
        data = await register(email.trim(), password, name.trim() || null);
      } else {
        data = await login(email.trim(), password);
      }

      const token = data?.access_token;
      if (!token) {
        Alert.alert('Authentication error', 'No token returned from server.');
        return;
      }
      await authLogin(token);
    } catch (e) {
      const msg = getNetworkErrorMessage(e) || 'Authentication failed. Please check your credentials.';
      Alert.alert('Unable to authenticate', String(msg));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.kb}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Brand Header */}
          <View style={styles.brandContainer}>
            <View style={styles.logoCircle}>
              <Ionicons name="nutrition" size={36} color={colors.white} />
            </View>
            <Text style={styles.heroTitle}>NutriScale</Text>
            <Text style={styles.heroSubtitle}>
              Smart food intelligence for measured portions
            </Text>
          </View>

          {/* Form Card */}
          <View style={styles.card}>
            {/* Segmented Switcher */}
            <View style={styles.toggleRow}>
              <TouchableOpacity
                style={[styles.toggleBtn, mode === 'login' && styles.toggleBtnActive]}
                onPress={() => setMode('login')}
                disabled={loading}
              >
                <Text style={[styles.toggleText, mode === 'login' && styles.toggleTextActive]}>
                  Sign In
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.toggleBtn, mode === 'register' && styles.toggleBtnActive]}
                onPress={() => setMode('register')}
                disabled={loading}
              >
                <Text style={[styles.toggleText, mode === 'register' && styles.toggleTextActive]}>
                  Register
                </Text>
              </TouchableOpacity>
            </View>

            {/* Name Input (Register mode) */}
            {mode === 'register' ? (
              <View style={styles.inputWrap}>
                <Ionicons name="person-outline" size={20} color={colors.muted} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Your Full Name"
                  placeholderTextColor={colors.muted}
                  value={name}
                  onChangeText={setName}
                  autoCapitalize="words"
                  editable={!loading}
                />
              </View>
            ) : null}

            {/* Email Input */}
            <View style={styles.inputWrap}>
              <Ionicons name="mail-outline" size={20} color={colors.muted} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Email address"
                placeholderTextColor={colors.muted}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                editable={!loading}
              />
            </View>

            {/* Password Input */}
            <View style={styles.inputWrap}>
              <Ionicons name="lock-closed-outline" size={20} color={colors.muted} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Password"
                placeholderTextColor={colors.muted}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                editable={!loading}
              />
              <TouchableOpacity onPress={() => setShowPassword((v) => !v)} style={styles.eyeBtn}>
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color={colors.muted}
                />
              </TouchableOpacity>
            </View>

            {/* Submit Button */}
            <PrimaryButton
              onPress={onSubmit}
              disabled={loading}
              loading={loading}
              icon={
                <Ionicons
                  name={mode === 'login' ? 'log-in-outline' : 'person-add-outline'}
                  size={18}
                  color={colors.white}
                />
              }
              style={{ marginTop: spacing.lg }}
            >
              {mode === 'login' ? 'SIGN IN' : 'CREATE ACCOUNT'}
            </PrimaryButton>

            <Text style={styles.note}>
              {mode === 'login'
                ? 'Sign in to access your scanned food history and smart goals.'
                : 'Create your account to start measuring and tracking food.'}
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    minHeight: Platform.OS === 'web' ? '100vh' : undefined,
  },
  kb: {
    flex: 1,
    minHeight: Platform.OS === 'web' ? '100vh' : undefined,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.lg,
    maxWidth: 440,
    width: '100%',
    alignSelf: 'center',
  },
  brandContainer: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  logoCircle: {
    width: 68,
    height: 68,
    borderRadius: 22,
    backgroundColor: colors.emerald,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
    ...shadows.md,
  },
  heroTitle: {
    ...typography.hero,
    color: colors.charcoal,
    textAlign: 'center',
  },
  heroSubtitle: {
    ...typography.subtitle,
    color: colors.muted,
    textAlign: 'center',
    marginTop: 4,
    maxWidth: 280,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: 24,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.lg,
  },
  toggleRow: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 4,
    marginBottom: spacing.md,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
  },
  toggleBtnActive: {
    backgroundColor: colors.white,
    ...shadows.sm,
  },
  toggleText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.muted,
  },
  toggleTextActive: {
    color: colors.emerald,
    fontWeight: '800',
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    height: 52,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    height: '100%',
    color: colors.charcoal,
    fontSize: 15,
    fontWeight: '600',
  },
  eyeBtn: {
    padding: 6,
  },
  note: {
    marginTop: spacing.md,
    color: colors.muted,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
});

