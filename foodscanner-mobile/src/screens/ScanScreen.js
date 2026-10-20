import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';

import { scanProduct } from '../services/api';
import { colors, shadows, spacing, typography } from '../theme';
import PrimaryButton from '../components/PrimaryButton';
import SectionHeader from '../components/SectionHeader';

const QUICK = [
  { name: 'Maggi', icon: '🍜' },
  { name: 'Parle-G', icon: '🍪' },
  { name: 'Kurkure', icon: '🥨' },
  { name: "Lay's", icon: '🥔' },
  { name: 'Amul Butter', icon: '🧈' },
];

export default function ScanScreen({ navigation }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [barcode, setBarcode] = useState('');
  const [productName, setProductName] = useState('');
  const [loading, setLoading] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const productNameRef = useRef(null);

  const mainValue = barcode;
  const setMainValue = setBarcode;

  const barcodePlaceholder = useMemo(() => 'e.g. 8901058000256', []);
  const namePlaceholder = useMemo(() => 'e.g. Dairy Milk, Maggi Noodles', []);

  useEffect(() => {
    if (!permission) return;
    if (permission.granted) return;
    if (!showCamera) return;
    if (!permission.canAskAgain) return;
    requestPermission();
  }, [permission, showCamera, requestPermission]);

  const analyze = async (code) => {
    const raw = String(code ?? barcode).trim();
    const hint = String(productName || '').trim();

    const hasLetters = /[A-Za-z]/.test(raw);
    if (hasLetters) {
      Alert.alert(
        'Barcode format',
        'Barcodes only contain numbers. To search by name, please use the product name field below.'
      );
      return;
    }

    if (!raw && !hint) {
      Alert.alert('Product details needed', 'Please enter a barcode number or type a product name to analyze.');
      return;
    }

    const isDigits = /^\d+$/.test(raw);
    if (raw && !isDigits) {
      Alert.alert('Invalid barcode', 'Enter a numeric barcode or select one of the quick items below.');
      return;
    }

    const scanPayload = raw
      ? { barcode: raw, product_name: hint || null }
      : { barcode: '00000000', product_name: hint };

    setLoading(true);
    try {
      setNotFound(false);
      const result = await scanProduct(scanPayload.barcode, scanPayload.product_name);
      navigation.replace('NutriScaleFlow', { result, timestamp: Date.now() });
    } catch (e) {
      const status = e?.response?.status;
      if (status === 404) {
        setNotFound(true);
        setShowCamera(false);
        setTimeout(() => {
          productNameRef?.current?.focus?.();
        }, 50);
      } else {
        const msg = e?.response?.data?.detail || e?.message || 'Scan failed';
        Alert.alert('Unable to analyze', String(msg));
      }
    } finally {
      setLoading(false);
    }
  };

  const onBarcodeScanned = ({ data }) => {
    if (scanned) return;
    setScanned(true);
    setBarcode(String(data));
    setShowCamera(false);
    analyze(String(data));
    setTimeout(() => setScanned(false), 1500);
  };

  const handleCameraToggle = async () => {
    if (permission?.granted) {
      setScanned(false);
      setShowCamera(true);
      return;
    }

    if (permission?.canAskAgain) {
      const p = await requestPermission();
      if (p?.granted) {
        setScanned(false);
        setShowCamera(true);
      }
      return;
    }

    Alert.alert('Camera permission', 'Camera permission is required to scan barcodes with your device camera.');
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.eyebrowRow}>
            <Ionicons name="scan-outline" size={14} color={colors.emerald} style={{ marginRight: 6 }} />
            <Text style={styles.eyebrow}>NUTRISCALE SCANNER</Text>
          </View>
          <Text style={styles.title}>Scan Your Food</Text>
          <Text style={styles.subtitle}>
            Identify any food item to automatically calculate its nutritional values based on portion weight.
          </Text>
        </View>

        {/* Camera Scanner View / Toggle Card */}
        {showCamera && permission?.granted ? (
          <View style={styles.cameraWrap}>
            <CameraView
              style={StyleSheet.absoluteFill}
              onBarcodeScanned={scanned ? undefined : onBarcodeScanned}
            />
            {/* Viewfinder Target Graphic */}
            <View style={styles.viewfinderContainer}>
              <View style={styles.viewfinderCornerTopLeft} />
              <View style={styles.viewfinderCornerTopRight} />
              <View style={styles.viewfinderCornerBottomLeft} />
              <View style={styles.viewfinderCornerBottomRight} />
              <View style={styles.scanLaser} />
            </View>

            <View style={styles.cameraOverlay}>
              <View style={styles.cameraHintPill}>
                <Ionicons name="barcode-outline" size={16} color={colors.white} style={{ marginRight: 6 }} />
                <Text style={styles.cameraHint}>Align barcode within the frame</Text>
              </View>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => {
                  setShowCamera(false);
                  setScanned(false);
                }}
              >
                <Ionicons name="close" size={16} color={colors.charcoal} style={{ marginRight: 4 }} />
                <Text style={styles.cancelBtnText}>Close Camera</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <Pressable
            style={({ pressed }) => [styles.cameraCard, pressed && styles.pressed]}
            onPress={handleCameraToggle}
            disabled={loading}
          >
            <View style={styles.cameraCardIconWrap}>
              <Ionicons name="camera-outline" size={28} color={colors.emerald} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cameraCardTitle}>Open Camera Barcode Scanner</Text>
              <Text style={styles.cameraCardSubtitle}>Tap to scan barcode with instant camera detection</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.muted} />
          </Pressable>
        )}

        {/* Input Card Container */}
        <View style={styles.inputCard}>
          <Text style={styles.inputSectionLabel}>ENTER DETAILS MANUALLY</Text>

          {/* Barcode Input */}
          <Text style={styles.fieldLabel}>BARCODE NUMBER</Text>
          <View style={styles.inputWrapper}>
            <Ionicons name="barcode-outline" size={20} color={colors.muted} style={styles.inputIcon} />
            <TextInput
              style={styles.textInput}
              placeholder={barcodePlaceholder}
              placeholderTextColor={colors.muted}
              value={mainValue}
              onChangeText={setMainValue}
              keyboardType="numeric"
              returnKeyType="search"
              onSubmitEditing={() => analyze()}
            />
            {mainValue.length > 0 && (
              <TouchableOpacity onPress={() => setMainValue('')} style={styles.clearBtn}>
                <Ionicons name="close-circle" size={18} color={colors.muted} />
              </TouchableOpacity>
            )}
          </View>

          {/* Not Found Banner */}
          {notFound ? (
            <View style={styles.notFoundBanner}>
              <Ionicons name="alert-circle-outline" size={18} color="#D97706" style={{ marginRight: 6 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.notFoundText}>
                  Barcode not found in database. Type the product name below or enter nutrition directly:
                </Text>
                <TouchableOpacity
                  style={styles.manualEntryLink}
                  onPress={() => navigation.navigate('ManualEntry', { productName: productName.trim() || '' })}
                  disabled={loading}
                >
                  <Text style={styles.manualEntryLinkText}>Enter Nutrition Manually ›</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

          {/* Product Name Input */}
          <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>OR SEARCH BY PRODUCT NAME</Text>
          <View style={[styles.inputWrapper, notFound && styles.inputNotFound]}>
            <Ionicons name="search-outline" size={20} color={colors.muted} style={styles.inputIcon} />
            <TextInput
              ref={productNameRef}
              style={styles.textInput}
              placeholder={namePlaceholder}
              placeholderTextColor={colors.muted}
              value={productName}
              onChangeText={(t) => {
                setProductName(t);
                if (notFound) setNotFound(false);
              }}
              returnKeyType="search"
              onSubmitEditing={() => analyze()}
            />
            {productName.length > 0 && (
              <TouchableOpacity onPress={() => setProductName('')} style={styles.clearBtn}>
                <Ionicons name="close-circle" size={18} color={colors.muted} />
              </TouchableOpacity>
            )}
          </View>

          {/* Quick Item Chips */}
          <View style={styles.chipsSection}>
            <Text style={styles.chipsSectionLabel}>QUICK SUGGESTIONS</Text>
            <View style={styles.chipsRow}>
              {QUICK.map((item) => (
                <TouchableOpacity
                  key={item.name}
                  style={styles.chip}
                  onPress={() => {
                    setBarcode('');
                    setProductName(item.name);
                  }}
                  disabled={loading}
                >
                  <Text style={styles.chipIcon}>{item.icon}</Text>
                  <Text style={styles.chipText}>{item.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <PrimaryButton
            onPress={() => analyze()}
            disabled={loading}
            loading={loading}
            icon={<Ionicons name="sparkles" size={18} color={colors.white} />}
            style={{ marginTop: spacing.lg }}
          >
            ANALYZE PRODUCT
          </PrimaryButton>
        </View>

        {/* Alternative Methods Cards */}
        <SectionHeader>ALTERNATIVE WAYS TO LOG</SectionHeader>

        <View style={styles.altRow}>
          <Pressable
            style={({ pressed }) => [styles.altCard, pressed && styles.pressed]}
            onPress={() => navigation.navigate('ManualEntry', { productName: productName.trim() || '' })}
            disabled={loading}
          >
            <View style={styles.altIconCircle}>
              <Ionicons name="create-outline" size={22} color={colors.emerald} />
            </View>
            <Text style={styles.altTitle}>Manual Entry</Text>
            <Text style={styles.altCopy}>Type nutrition facts manually</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.altCard, pressed && styles.pressed]}
            onPress={() => navigation.navigate('OCRScan', { productName: productName.trim() || '' })}
            disabled={loading}
          >
            <View style={styles.altIconCircle}>
              <Ionicons name="document-text-outline" size={22} color={colors.info} />
            </View>
            <Text style={styles.altTitle}>Scan Label OCR</Text>
            <Text style={styles.altCopy}>Snap photo of nutrition table</Text>
          </Pressable>
        </View>

        {/* Web Notice Card */}
        {Platform.OS === 'web' && (
          <View style={styles.hintCard}>
            <Ionicons name="information-circle-outline" size={20} color={colors.muted} style={{ marginRight: 8 }} />
            <Text style={styles.hintText}>
              Testing in browser? Use product name search or quick suggestion chips for the best experience.
            </Text>
          </View>
        )}
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
  cameraCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  cameraCardIconWrap: {
    width: 50,
    height: 50,
    borderRadius: 16,
    backgroundColor: colors.emeraldLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  cameraCardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.charcoal,
  },
  cameraCardSubtitle: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.99 }],
  },
  cameraWrap: {
    height: 280,
    borderRadius: 22,
    overflow: 'hidden',
    marginBottom: spacing.md,
    backgroundColor: '#000',
    position: 'relative',
    ...shadows.md,
  },
  viewfinderContainer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewfinderCornerTopLeft: {
    position: 'absolute',
    top: 40,
    left: 40,
    width: 28,
    height: 28,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderColor: colors.emerald,
    borderRadius: 4,
  },
  viewfinderCornerTopRight: {
    position: 'absolute',
    top: 40,
    right: 40,
    width: 28,
    height: 28,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderColor: colors.emerald,
    borderRadius: 4,
  },
  viewfinderCornerBottomLeft: {
    position: 'absolute',
    bottom: 60,
    left: 40,
    width: 28,
    height: 28,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderColor: colors.emerald,
    borderRadius: 4,
  },
  viewfinderCornerBottomRight: {
    position: 'absolute',
    bottom: 60,
    right: 40,
    width: 28,
    height: 28,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderColor: colors.emerald,
    borderRadius: 4,
  },
  scanLaser: {
    width: '70%',
    height: 2,
    backgroundColor: 'rgba(16, 185, 129, 0.7)',
  },
  cameraOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  cameraHintPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  cameraHint: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '700',
  },
  cancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
  },
  cancelBtnText: {
    color: colors.charcoal,
    fontSize: 12,
    fontWeight: '800',
  },
  inputCard: {
    backgroundColor: colors.white,
    borderRadius: 24,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  inputSectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: colors.muted,
    marginBottom: spacing.md,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: colors.textSecondary,
    marginBottom: 6,
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
  inputIcon: {
    marginRight: 10,
  },
  textInput: {
    flex: 1,
    height: '100%',
    fontSize: 15,
    fontWeight: '600',
    color: colors.charcoal,
  },
  clearBtn: {
    padding: 4,
  },
  notFoundBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FEF3C7',
    borderRadius: 14,
    padding: spacing.md,
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  notFoundText: {
    fontSize: 13,
    color: '#92400E',
    fontWeight: '600',
    lineHeight: 18,
  },
  manualEntryLink: {
    marginTop: 6,
  },
  manualEntryLinkText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.emerald,
  },
  inputNotFound: {
    borderColor: colors.warning,
  },
  chipsSection: {
    marginTop: spacing.md,
  },
  chipsSectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: colors.muted,
    marginBottom: 8,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.charcoal,
  },
  altRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  altCard: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: 18,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'flex-start',
    ...shadows.sm,
  },
  altIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  altTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.charcoal,
  },
  altCopy: {
    fontSize: 11,
    color: colors.muted,
    marginTop: 2,
  },
  hintCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  hintText: {
    flex: 1,
    fontSize: 12,
    color: colors.muted,
    lineHeight: 17,
  },
});

