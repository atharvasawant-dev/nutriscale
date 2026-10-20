import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';

import { scanNutritionLabel } from '../services/api';
import { colors, spacing, typography } from '../theme';

const C = colors;

export default function OCRScanScreen({ navigation, route }) {
  const prefillName = route?.params?.productName;

  const [loading, setLoading] = useState(false);
  const [lastOcr, setLastOcr] = useState(null);

  const goManual = (prefill) => {
    navigation.replace('ManualEntry', {
      productName: prefill?.product_name || prefillName || '',
      calories: prefill?.calories ?? null,
      nutrition: {
        calories: prefill?.calories ?? null,
        fat: prefill?.fat ?? null,
        sugar: prefill?.sugar ?? null,
        salt: prefill?.salt ?? null,
        protein: prefill?.protein ?? null,
        fiber: prefill?.fiber ?? null,
        carbs: prefill?.carbs ?? null,
      },
      ocr: prefill || null,
    });
  };

  const processAsset = async (asset) => {
    if (!asset?.base64) {
      Alert.alert('Error', 'Could not read image data. Please try again.');
      goManual(null);
      return;
    }

    setLoading(true);
    try {
      const res = await scanNutritionLabel(asset.base64);
      setLastOcr(res);

      if (res?.raw_text) {
        Alert.alert('OCR Raw Text', String(res.raw_text).slice(0, 1200));
      }
      goManual(res);
    } catch (_e) {
      Alert.alert('Could not read label', 'Unable to recognize table. Please enter manually.');
      goManual(null);
    } finally {
      setLoading(false);
    }
  };

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm?.granted) {
      Alert.alert('Permission required', 'Camera permission is required to take a photo.');
      return;
    }

    const res = await ImagePicker.launchCameraAsync({
      base64: true,
      quality: 0.8,
      allowsEditing: false,
    });

    if (res?.canceled) return;
    const asset = res?.assets?.[0];
    await processAsset(asset);
  };

  const chooseFromGallery = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm?.granted) {
      Alert.alert('Permission required', 'Gallery permission is required to pick a photo.');
      return;
    }

    const res = await ImagePicker.launchImageLibraryAsync({
      base64: true,
      quality: 0.8,
      allowsEditing: false,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
    });

    if (res?.canceled) return;
    const asset = res?.assets?.[0];
    await processAsset(asset);
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
            <Ionicons name="sparkles-outline" size={14} color={C.emerald} />
            <Text style={styles.badgePillText}>AI OCR SCANNER</Text>
          </View>
        </View>

        <Text style={styles.title}>Scan Nutrition Label</Text>
        <Text style={styles.subtitle}>
          Point your camera at the printed nutritional facts table on the back of the package.
        </Text>

        {/* Viewfinder Graphic Card */}
        <View style={styles.viewfinderCard}>
          <View style={styles.viewfinderFrame}>
            {/* Viewfinder corner brackets */}
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />

            <View style={styles.iconCircle}>
              <Ionicons name="document-text-outline" size={38} color={C.emerald} />
            </View>
            <Text style={styles.viewfinderTitle}>Nutrition Facts Table</Text>
            <Text style={styles.viewfinderHint}>Align table within frame</Text>
          </View>

          {/* Tips List */}
          <View style={styles.tipsList}>
            <View style={styles.tipItem}>
              <Ionicons name="sunny-outline" size={16} color={C.emerald} />
              <Text style={styles.tipText}>Use bright, even lighting to reduce glare</Text>
            </View>
            <View style={styles.tipItem}>
              <Ionicons name="scan-outline" size={16} color={C.emerald} />
              <Text style={styles.tipText}>Keep text sharp and parallel to camera</Text>
            </View>
            <View style={styles.tipItem}>
              <Ionicons name="checkmark-circle-outline" size={16} color={C.emerald} />
              <Text style={styles.tipText}>AI automatically extracts Calories, Protein & Carbs</Text>
            </View>
          </View>
        </View>

        {/* Action Controls */}
        <View style={styles.actionsCard}>
          <TouchableOpacity
            style={[styles.primaryBtn, loading && styles.btnDisabled]}
            onPress={takePhoto}
            disabled={loading}
            activeOpacity={0.85}
          >
            <Ionicons name="camera" size={20} color={C.white} />
            <Text style={styles.primaryBtnText}>Take Photo</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.secondaryBtn, loading && styles.btnDisabled]}
            onPress={chooseFromGallery}
            disabled={loading}
            activeOpacity={0.8}
          >
            <Ionicons name="images-outline" size={20} color={C.charcoal} />
            <Text style={styles.secondaryBtnText}>Choose from Gallery</Text>
          </TouchableOpacity>

          {loading && (
            <View style={styles.loadingBox}>
              <ActivityIndicator color={C.emerald} size="small" />
              <Text style={styles.loadingText}>Reading label with AI OCR...</Text>
            </View>
          )}

          {!loading && lastOcr?.raw_text ? (
            <View style={styles.rawBox}>
              <View style={styles.rawHeader}>
                <Ionicons name="code-slash-outline" size={14} color={C.muted} />
                <Text style={styles.rawTitle}>Raw OCR Result (Debug)</Text>
              </View>
              <Text style={styles.rawText} numberOfLines={8}>
                {String(lastOcr.raw_text)}
              </Text>
            </View>
          ) : null}

          {Platform.OS === 'web' && (
            <View style={styles.webNoteBox}>
              <Ionicons name="information-circle-outline" size={16} color={C.muted} />
              <Text style={styles.webNote}>
                On web browsers, photo upload from gallery is recommended.
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={styles.manualFallbackBtn}
            onPress={() => goManual(null)}
            disabled={loading}
            activeOpacity={0.7}
          >
            <Ionicons name="create-outline" size={16} color={C.emerald} />
            <Text style={styles.manualFallbackText}>Enter Manually Instead</Text>
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

  // Viewfinder Card
  viewfinderCard: {
    backgroundColor: C.surfaceCard,
    borderRadius: 20,
    padding: spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.borderLight,
    shadowColor: C.shadows.sm.shadowColor,
    shadowOffset: C.shadows.sm.shadowOffset,
    shadowOpacity: C.shadows.sm.shadowOpacity,
    shadowRadius: C.shadows.sm.shadowRadius,
    elevation: 2,
    marginBottom: spacing.lg,
  },
  viewfinderFrame: {
    width: '100%',
    height: 180,
    borderRadius: 16,
    backgroundColor: C.background,
    borderWidth: 1,
    borderColor: C.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    marginBottom: spacing.lg,
  },
  corner: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderColor: C.emerald,
  },
  cornerTL: {
    top: 12,
    left: 12,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderTopLeftRadius: 6,
  },
  cornerTR: {
    top: 12,
    right: 12,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderTopRightRadius: 6,
  },
  cornerBL: {
    bottom: 12,
    left: 12,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderBottomLeftRadius: 6,
  },
  cornerBR: {
    bottom: 12,
    right: 12,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderBottomRightRadius: 6,
  },
  iconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: C.emeraldSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  viewfinderTitle: {
    color: C.charcoal,
    fontSize: 15,
    fontWeight: '800',
  },
  viewfinderHint: {
    color: C.muted,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },

  // Tips List
  tipsList: {
    width: '100%',
    gap: 10,
  },
  tipItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tipText: {
    color: C.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },

  // Actions Card
  actionsCard: {
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
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: C.emerald,
    paddingVertical: 14,
    borderRadius: 14,
    shadowColor: C.emerald,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  primaryBtnText: {
    color: C.white,
    fontWeight: '800',
    fontSize: 15,
    letterSpacing: 0.4,
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: C.background,
    borderWidth: 1,
    borderColor: C.borderLight,
    paddingVertical: 13,
    borderRadius: 14,
    marginTop: spacing.md,
  },
  secondaryBtnText: {
    color: C.charcoal,
    fontWeight: '700',
    fontSize: 14,
  },
  btnDisabled: {
    opacity: 0.6,
  },

  loadingBox: {
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  loadingText: {
    color: C.emeraldDark,
    fontSize: 13,
    fontWeight: '700',
  },

  rawBox: {
    marginTop: spacing.md,
    backgroundColor: C.background,
    borderRadius: 12,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: C.borderLight,
  },
  rawHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  rawTitle: {
    color: C.muted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  rawText: {
    color: C.charcoal,
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    lineHeight: 18,
  },

  webNoteBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.md,
    paddingHorizontal: 8,
  },
  webNote: {
    flex: 1,
    color: C.muted,
    fontSize: 12,
    fontWeight: '600',
  },

  manualFallbackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: spacing.lg,
    paddingVertical: 8,
  },
  manualFallbackText: {
    color: C.emerald,
    fontSize: 13,
    fontWeight: '800',
  },
});
