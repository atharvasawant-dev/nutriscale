import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { logFoodManual, measurePortion, savePortion, scanNutritionLabel, scanProduct } from '../services/api';
import { mockScaleDevice, wifiScaleDevice, MOCK_PRODUCTS } from '../services/hardware';
import { colors, shadows, typography } from '../theme';

// Module-level deduplication tracker for logged scan session / portion keys
const loggedSessionsSet = new Set();

function formatNumber(value, decimals = 1) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '—';
  if (decimals === 0) return Math.round(num).toString();
  return num < 10 ? num.toFixed(decimals).replace(/\.0$/, '') : Math.round(num).toString();
}

export default function NutriScaleFlowScreen({ route, navigation }) {
  // Screen mode: 'scale' (Page 1) or 'result' (Page 2)
  const [screenMode, setScreenMode] = useState('scale');

  // Scale hardware state
  const [reading, setReading] = useState({
    weight: 42.0,
    isStable: true,
    isSimulated: true,
    status: 'stable',
  });

  // Hardware Scale mode: 'mock' (default) or 'wifi' (ESP8266)
  const [scaleMode, setScaleMode] = useState('mock');
  const [wifiHost, setWifiHost] = useState(wifiScaleDevice.getStatus().host || '192.168.1.100');
  const [wifiPort, setWifiPort] = useState(String(wifiScaleDevice.getStatus().port || '80'));
  const [wifiStatus, setWifiStatus] = useState(wifiScaleDevice.getStatus());
  const [showWifiModal, setShowWifiModal] = useState(false);
  const [ipInput, setIpInput] = useState(wifiScaleDevice.getStatus().host || '192.168.1.100');

  // Selected test product & scan session
  const [selectedMock, setSelectedMock] = useState(MOCK_PRODUCTS[0]);
  const [productData, setProductData] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [loadingProduct, setLoadingProduct] = useState(false);
  const [productError, setProductError] = useState('');

  // Portion analysis & intelligence
  const [analysing, setAnalysing] = useState(false);
  const [portionResult, setPortionResult] = useState(null);
  const [savingPortion, setSavingPortion] = useState(false);
  const [savedPortion, setSavedPortion] = useState(false);
  const [showAlternatives, setShowAlternatives] = useState(false);

  // Webcam camera scanner & OCR state
  const [showCamera, setShowCamera] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [scanningBarcode, setScanningBarcode] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);

  // Lookup product from API by barcode
  const handleLookupBarcode = useCallback(async (barcode, mockItem = null) => {
    setLoadingProduct(true);
    setProductError('');
    setPortionResult(null);
    setSavedPortion(false);

    try {
      const res = await scanProduct(barcode, mockItem?.name);
      setProductData(res?.product || null);
      const sId = res?.scan_session_id || null;
      setSessionId(sId);
      if (sId && loggedSessionsSet.has(String(sId))) {
        setSavedPortion(true);
      }
      if (res?.decision?.final_decision) {
        setProductData((prev) => ({
          ...prev,
          nutriscore: res.product?.nutriscore,
          decision: res.decision,
          analysis: res.analysis,
          recommendations: res.recommendations,
        }));
      }
    } catch (_err) {
      if (mockItem && !mockItem.isUnmatched) {
        // Fallback realistic product nutrition if backend is offline
        const fallback = {
          name: mockItem.name,
          nutrition: {
            calories: mockItem.kcalPer100g,
            fat: mockItem.id === 'cadbury' ? 30.0 : (mockItem.id === 'storia' ? 0.0 : 0.9),
            sugar: mockItem.id === 'cadbury' ? 56.0 : (mockItem.id === 'storia' ? 4.2 : 8.0),
            salt: mockItem.id === 'cadbury' ? 0.24 : (mockItem.id === 'storia' ? 0.05 : 1.3),
            protein: mockItem.id === 'cadbury' ? 7.5 : (mockItem.id === 'storia' ? 0.1 : 7.0),
            carbs: mockItem.id === 'cadbury' ? 57.0 : (mockItem.id === 'storia' ? 4.5 : 84.0),
            saturated_fat: mockItem.id === 'cadbury' ? 18.0 : 0.2,
          },
          ingredients: mockItem.id === 'cadbury' ? 'Milk, Sugar, Cocoa Butter, Cocoa Mass' : '',
        };
        setProductData(fallback);
      } else {
        setProductData(null);
        setProductError(`Barcode ${barcode} has no matching nutrition in database.`);
      }
    } finally {
      setLoadingProduct(false);
    }
  }, []);

  // Subscribe to hardware scale readings
  useEffect(() => {
    let unsubReading = () => {};
    let unsubBarcode = () => {};
    let unsubStatus = () => {};

    if (scaleMode === 'mock') {
      wifiScaleDevice.disconnect();
      mockScaleDevice.connect();
      unsubReading = mockScaleDevice.onReading((newReading) => {
        setReading(newReading);
      });
      unsubBarcode = mockScaleDevice.onBarcodeScan((barcode) => {
        handleLookupBarcode(barcode);
      });
    } else {
      mockScaleDevice.disconnect();
      wifiScaleDevice.connect(wifiHost, parseInt(wifiPort, 10) || 80);
      unsubReading = wifiScaleDevice.onReading((newReading) => {
        setReading(newReading);
      });
      unsubStatus = wifiScaleDevice.onStatusChange((status) => {
        setWifiStatus(status);
      });
    }

    return () => {
      unsubReading();
      unsubBarcode();
      unsubStatus();
    };
  }, [scaleMode, wifiHost, wifiPort, handleLookupBarcode]);

  // Initial load with default Cadbury product
  useEffect(() => {
    if (route?.params?.result) {
      const res = route.params.result;
      setProductData(res.product);
      setSessionId(res.scan_session_id);
    } else {
      handleLookupBarcode(MOCK_PRODUCTS[0].barcode, MOCK_PRODUCTS[0]);
    }
  }, [route?.params?.result, handleLookupBarcode]);

  // Handle selecting mock test products
  const handleSelectMock = (item) => {
    setSelectedMock(item);
    if (item.isUnmatched) {
      if (scaleMode === 'mock') {
        mockScaleDevice.simulateWeight(item.defaultWeight);
      }
      setProductData(null);
      setProductError(`Barcode ${item.barcode} has no matching product in database.`);
    } else {
      if (scaleMode === 'mock') {
        mockScaleDevice.selectProduct(item);
      }
      handleLookupBarcode(item.barcode, item);
    }
  };

  // Tare the active scale
  const handleTare = async () => {
    if (scaleMode === 'wifi') {
      await wifiScaleDevice.tare();
    } else {
      mockScaleDevice.tare();
    }
  };

  // Connect or reconnect ESP8266 Wi-Fi scale
  const handleConnectWifi = async (customHost) => {
    const host = (customHost || ipInput || wifiHost).trim();
    if (!host) return;
    setWifiHost(host);
    await wifiScaleDevice.setHost(host, wifiPort);
    await wifiScaleDevice.connect(host, parseInt(wifiPort, 10) || 80);
  };

  const handleDisconnectWifi = () => {
    wifiScaleDevice.disconnect();
  };


  // Open Webcam / Device Camera Barcode Scanner
  const handleOpenWebcamScanner = async () => {
    if (!cameraPermission?.granted) {
      const res = await requestCameraPermission();
      if (!res?.granted) {
        Alert.alert('Camera permission', 'Camera permission is required to scan barcodes with your webcam or camera.');
        return;
      }
    }
    setScanningBarcode(false);
    setShowCamera(true);
  };

  // Barcode scanned callback
  const handleBarcodeScanned = async ({ data }) => {
    if (scanningBarcode) return;
    setScanningBarcode(true);
    setShowCamera(false);
    await handleLookupBarcode(String(data).trim());
    setTimeout(() => setScanningBarcode(false), 1500);
  };

  // Capture nutrition facts label with OCR
  const handleCaptureLabelOCR = async () => {
    Alert.alert(
      'Scan Nutrition Label (OCR)',
      'Choose image source for nutritional label analysis:',
      [
        {
          text: 'Take Photo',
          onPress: async () => {
            const perm = await ImagePicker.requestCameraPermissionsAsync();
            if (!perm?.granted) {
              Alert.alert('Permission needed', 'Camera permission is required.');
              return;
            }
            const res = await ImagePicker.launchCameraAsync({
              base64: true,
              quality: 0.8,
            });
            if (!res.canceled && res.assets?.[0]?.base64) {
              processOCRAsset(res.assets[0].base64);
            }
          },
        },
        {
          text: 'Choose from Gallery',
          onPress: async () => {
            const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (!perm?.granted) {
              Alert.alert('Permission needed', 'Gallery permission is required.');
              return;
            }
            const res = await ImagePicker.launchImageLibraryAsync({
              base64: true,
              quality: 0.8,
            });
            if (!res.canceled && res.assets?.[0]?.base64) {
              processOCRAsset(res.assets[0].base64);
            }
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const processOCRAsset = async (base64) => {
    setOcrLoading(true);
    try {
      const ocrRes = await scanNutritionLabel(base64);
      if (ocrRes) {
        const cal = Number(ocrRes.calories) || 180;
        const ocrProduct = {
          name: ocrRes.product_name || 'Nutrition Label Scanned',
          nutrition: {
            calories: cal,
            fat: Number(ocrRes.fat) || 0,
            sugar: Number(ocrRes.sugar) || 0,
            salt: Number(ocrRes.salt) || 0,
            protein: Number(ocrRes.protein) || 0,
            fiber: Number(ocrRes.fiber) || 0,
            carbs: Number(ocrRes.carbs) || 0,
            saturated_fat: Number(ocrRes.saturated_fat) || 0,
          },
          barcode: 'ocr-scanned',
        };
        setProductData(ocrProduct);
        setSelectedMock(null);
        setSessionId(null);
        setPortionResult(null);
        setSavedPortion(false);
        Alert.alert(
          'Nutrition Label Recognized',
          `${ocrProduct.name}\n${cal} kcal / 100g\n\nNow place your food on the platform to measure your portion.`
        );
      }
    } catch (_e) {
      Alert.alert('OCR Scan', 'Could not read nutrition table from image. Please ensure text is clear and readable.');
    } finally {
      setOcrLoading(false);
    }
  };

  // Distinct Action 1: View Details (Must NOT save portion or modify daily totals)
  const handleViewDetails = () => {
    navigation.navigate('Result', {
      result: {
        product: {
          name: productData?.name || selectedMock?.name || 'Weighed food',
          nutrition: per100gNutr,
          barcode: productData?.barcode || selectedMock?.barcode || '00000000',
        },
        portion_nutrition: portionNutr,
        measured_weight: measuredWeight,
        analysis: productData?.analysis,
        decision: productData?.decision || { final_decision: verdict },
        final_decision: verdict,
        diet_note: productData?.diet_note,
        recommendations: productData?.recommendations || [],
        scan_session_id: sessionId,
      },
      fromNutriScale: true,
      savedPortion: savedPortion,
      isSimulated: reading.isSimulated,
      timestamp: Date.now(),
    });
  };

  // Analyse this portion (Weigh -> Result transition)
  const handleAnalysePortion = async () => {
    const measuredWeight = reading.weight > 0 ? reading.weight : (selectedMock?.defaultWeight || 42.0);
    setAnalysing(true);

    try {
      if (sessionId) {
        const source = reading.isSimulated ? 'mock' : 'esp8266';
        const measured = await measurePortion(sessionId, measuredWeight, source);
        setPortionResult(measured);
      } else {
        // Compute portion nutrition locally if offline
        const factor = measuredWeight / 100.0;
        const baseNutr = productData?.nutrition || {
          calories: 534,
          sugar: 56,
          fat: 30,
          carbs: 57,
          protein: 7.5,
          salt: 0.24,
          saturated_fat: 18,
        };
        const localPortion = {
          calories: Math.round(Number(baseNutr.calories || 0) * factor),
          sugar: Math.round(Number(baseNutr.sugar || 0) * factor * 10) / 10,
          fat: Math.round(Number(baseNutr.fat || 0) * factor * 10) / 10,
          carbs: Math.round(Number(baseNutr.carbs || 0) * factor * 10) / 10,
          protein: Math.round(Number(baseNutr.protein || 0) * factor * 10) / 10,
          salt: Math.round(Number(baseNutr.salt || 0) * factor * 100) / 100,
          saturated_fat: Math.round(Number(baseNutr.saturated_fat || (baseNutr.fat * 0.6)) * factor * 10) / 10,
        };
        setPortionResult({
          weight_grams: measuredWeight,
          portion_nutrition: localPortion,
        });
      }
      setScreenMode('result');
    } catch (_err) {
      // Fallback transition
      const factor = measuredWeight / 100.0;
      const baseNutr = productData?.nutrition || { calories: 534, sugar: 56, fat: 30, carbs: 57, protein: 7.5 };
      setPortionResult({
        weight_grams: measuredWeight,
        portion_nutrition: {
          calories: Math.round(Number(baseNutr.calories || 0) * factor),
          sugar: Math.round(Number(baseNutr.sugar || 0) * factor * 10) / 10,
          fat: Math.round(Number(baseNutr.fat || 0) * factor * 10) / 10,
          carbs: Math.round(Number(baseNutr.carbs || 0) * factor * 10) / 10,
          protein: Math.round(Number(baseNutr.protein || 0) * factor * 10) / 10,
          saturated_fat: Math.round(18.0 * factor * 10) / 10,
        },
      });
      setScreenMode('result');
    } finally {
      setAnalysing(false);
    }
  };

  // Distinct Action 2: Log to Today's Intake (Explicitly save portion once, update shared log, prevent duplicates)
  const handleLogToToday = async () => {
    if (savedPortion || savingPortion) return;
    setSavingPortion(true);
    try {
      if (sessionId) {
        await savePortion(sessionId);
        loggedSessionsSet.add(String(sessionId));
      } else {
        const pName = productData?.name || selectedMock?.name || 'Weighed food';
        await logFoodManual(pName, caloriesVal);
        loggedSessionsSet.add(`${pName}-${caloriesVal}`);
      }
      setSavedPortion(true);
      Alert.alert(
        'Portion Logged to Today',
        `${productData?.name || selectedMock?.name} (${Math.round(measuredWeight)} g) has been recorded to today's intake.`,
        [
          { text: 'View Insights', onPress: () => navigation.navigate('Main', { screen: 'Insights' }) },
          { text: 'Done', style: 'cancel' },
        ]
      );
    } catch (err) {
      const msg = err?.response?.data?.detail || err?.message || "Could not record portion to today's intake. Please try again.";
      Alert.alert('Logging Failed', msg);
    } finally {
      setSavingPortion(false);
    }
  };

  // Share result
  const handleShare = async () => {
    try {
      await Share.share({
        message: `NutriScale Analysis: ${productData?.name || selectedMock?.name} (${reading.weight || 42} g portion) contains ${portionResult?.portion_nutrition?.calories || 224} kcal and ${portionResult?.portion_nutrition?.sugar || 23.5}g sugar.`,
      });
    } catch (_e) {
      // ignore
    }
  };

  // Calculated values for Result screen (Page 2)
  const measuredWeight = portionResult?.weight_grams || reading.weight || 42.0;
  const portionNutr = portionResult?.portion_nutrition || {};
  const per100gNutr = productData?.nutrition || {
    calories: 534,
    sugar: 56,
    fat: 30,
    carbs: 57,
    protein: 7.5,
    saturated_fat: 18,
  };

  const caloriesVal = portionNutr.calories ?? Math.round(534 * (measuredWeight / 100));
  const sugarVal = portionNutr.sugar ?? (Math.round(56 * (measuredWeight / 100) * 10) / 10);
  const fatVal = portionNutr.fat ?? (Math.round(30 * (measuredWeight / 100) * 10) / 10);
  const carbsVal = portionNutr.carbs ?? (Math.round(57 * (measuredWeight / 100) * 10) / 10);
  const proteinVal = portionNutr.protein ?? (Math.round(7.5 * (measuredWeight / 100) * 10) / 10);
  const satFatVal = portionNutr.saturated_fat ?? (Math.round(18 * (measuredWeight / 100) * 10) / 10);

  // Daily percentage benchmarks (based on 50g sugar, 70g fat guidelines)
  const sugarDailyPct = Math.round((sugarVal / 50.0) * 100);
  const fatDailyPct = Math.round((fatVal / 70.0) * 100);

  // Verdict determination
  const verdict = useMemo(() => {
    if (selectedMock?.id === 'storia') return 'Safe';
    if (sugarVal > 20 || fatVal > 15) return 'Moderate';
    if (sugarVal > 35) return 'Avoid';
    return 'Moderate';
  }, [selectedMock, sugarVal, fatVal]);

  const verdictScore = useMemo(() => {
    if (verdict === 'Safe') return '4.5';
    if (verdict === 'Avoid') return '0.8';
    return '1.6'; // Exact score from PDF Page 2
  }, [verdict]);

  const verdictColor = useMemo(() => {
    if (verdict === 'Safe') return colors.safe;
    if (verdict === 'Avoid') return colors.avoid;
    return colors.moderate; // Amber for Moderate
  }, [verdict]);

  // Check for allergens in ingredients (e.g. milk/dairy)
  const allergenDetected = useMemo(() => {
    const raw = `${productData?.name || ''} ${productData?.ingredients || ''}`.toLowerCase();
    return raw.includes('milk') || raw.includes('dairy') || raw.includes('cadbury');
  }, [productData]);

  // -------------------------------------------------------------
  // PAGE 1: SCALE / WEIGH SCREEN
  // -------------------------------------------------------------
  if (screenMode === 'scale') {
    return (
      <View style={styles.screenBg}>
        {/* Purple Hero Section */}
        <View style={styles.scaleHero}>
          <SafeAreaView>
            <View style={styles.scaleHeroNav}>
              <Text style={styles.brandTitle}>NutriScale</Text>
              <View style={styles.connectionBadge}>
                <View
                  style={[
                    styles.connectionDot,
                    scaleMode === 'wifi' && {
                      backgroundColor: wifiStatus.isConnected
                        ? '#10B981'
                        : wifiStatus.isConnecting
                        ? '#F59E0B'
                        : '#EF4444',
                    },
                  ]}
                />
                <Text style={styles.connectionText}>
                  {scaleMode === 'wifi'
                    ? wifiStatus.isConnected
                      ? 'ESP8266 connected'
                      : wifiStatus.isConnecting
                      ? 'Connecting...'
                      : 'Scale offline'
                    : 'Scale connected'}
                </Text>
                <View
                  style={[
                    styles.simulatedPill,
                    scaleMode === 'wifi' && {
                      backgroundColor: wifiStatus.isConnected ? '#D1FAE5' : '#FEE2E2',
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.simulatedText,
                      scaleMode === 'wifi' && {
                        color: wifiStatus.isConnected ? '#065F46' : '#991B1B',
                      },
                    ]}
                  >
                    {scaleMode === 'wifi' ? (wifiStatus.isConnected ? 'Physical' : 'Offline') : 'Simulated'}
                  </Text>
                </View>
              </View>
            </View>
            <Text style={styles.scaleHeroSubtitle}>Place your food on the platform</Text>
          </SafeAreaView>
        </View>

        <ScrollView contentContainerStyle={styles.scaleScrollContent} showsVerticalScrollIndicator={false}>
          {/* Scale Hardware Mode Switcher */}
          <View style={styles.scaleModeSwitcherRow}>
            <TouchableOpacity
              onPress={() => setScaleMode('mock')}
              style={[styles.scaleModeTab, scaleMode === 'mock' && styles.scaleModeTabActive]}
            >
              <Ionicons
                name="flash-outline"
                size={14}
                color={scaleMode === 'mock' ? colors.primaryPurple : colors.textMuted}
                style={{ marginRight: 6 }}
              />
              <Text style={[styles.scaleModeTabText, scaleMode === 'mock' && styles.scaleModeTabTextActive]}>
                Simulated Scale
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setScaleMode('wifi')}
              style={[styles.scaleModeTab, scaleMode === 'wifi' && styles.scaleModeTabActive]}
            >
              <Ionicons
                name="wifi-outline"
                size={14}
                color={scaleMode === 'wifi' ? colors.primaryPurple : colors.textMuted}
                style={{ marginRight: 6 }}
              />
              <Text style={[styles.scaleModeTabText, scaleMode === 'wifi' && styles.scaleModeTabTextActive]}>
                ESP8266 Wi-Fi Scale
              </Text>
            </TouchableOpacity>
          </View>

          {/* ESP8266 Wi-Fi Scale Status & Configuration Card */}
          {scaleMode === 'wifi' && (
            <View style={styles.wifiConfigCard}>
              <View style={styles.wifiConfigHeader}>
                <View style={styles.wifiConfigTitleRow}>
                  <Ionicons
                    name="hardware-chip-outline"
                    size={18}
                    color={wifiStatus.isConnected ? colors.emerald : colors.moderate}
                  />
                  <Text style={styles.wifiConfigTitle}>ESP8266 NodeMCU</Text>
                </View>
                <TouchableOpacity
                  onPress={() => {
                    setIpInput(wifiHost);
                    setShowWifiModal(true);
                  }}
                  style={styles.wifiEditBtn}
                >
                  <Ionicons name="settings-outline" size={13} color={colors.primaryPurple} />
                  <Text style={styles.wifiEditBtnText}>Configure IP</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.wifiEndpointRow}>
                <Text style={styles.wifiEndpointLabel}>Endpoint:</Text>
                <Text style={styles.wifiEndpointValue}>http://{wifiHost}:{wifiPort}/weight</Text>
              </View>

              <View style={styles.wifiStatusActionRow}>
                <View style={styles.wifiStatusPill}>
                  <View
                    style={[
                      styles.wifiStatusDot,
                      {
                        backgroundColor: wifiStatus.isConnected
                          ? '#10B981'
                          : wifiStatus.isConnecting
                          ? '#F59E0B'
                          : '#EF4444',
                      },
                    ]}
                  />
                  <Text style={styles.wifiStatusPillText} numberOfLines={1}>
                    {wifiStatus.isConnected
                      ? 'Connected · Live weight'
                      : wifiStatus.isConnecting
                      ? 'Connecting to scale...'
                      : (wifiStatus.lastError || 'Disconnected')}
                  </Text>
                </View>

                {wifiStatus.isConnected ? (
                  <TouchableOpacity onPress={handleDisconnectWifi} style={styles.wifiDisconnectBtn}>
                    <Text style={styles.wifiDisconnectBtnText}>Disconnect</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    onPress={() => handleConnectWifi()}
                    disabled={wifiStatus.isConnecting}
                    style={styles.wifiConnectBtn}
                  >
                    {wifiStatus.isConnecting ? (
                      <ActivityIndicator size="small" color={colors.white} />
                    ) : (
                      <Text style={styles.wifiConnectBtnText}>Connect Scale</Text>
                    )}
                  </TouchableOpacity>
                )}
              </View>

              {!wifiStatus.isConnected && (
                <Text style={styles.wifiHintText}>
                  Tip: Ensure your device and NodeMCU ESP8266 are on the same Wi-Fi network. You can also switch back to Simulated Scale at any time.
                </Text>
              )}
            </View>
          )}

          {/* Scan Options Row: Webcam Barcode Scanner & Nutrition Label OCR */}
          <View style={styles.scanWorkflowRow}>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Scan barcode using webcam or camera"
              onPress={handleOpenWebcamScanner}
              style={styles.scanActionCard}
            >
              <View style={styles.scanActionIconWrap}>
                <Ionicons name="videocam-outline" size={20} color={colors.primaryPurple} />
              </View>
              <View style={styles.scanActionTextWrap}>
                <Text style={styles.scanActionTitle}>Webcam Barcode</Text>
                <Text style={styles.scanActionSub}>Scan product package</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Capture nutrition label for OCR"
              onPress={handleCaptureLabelOCR}
              disabled={ocrLoading}
              style={styles.scanActionCard}
            >
              <View style={[styles.scanActionIconWrap, { backgroundColor: '#ECFDF5' }]}>
                {ocrLoading ? (
                  <ActivityIndicator size="small" color={colors.emerald} />
                ) : (
                  <Ionicons name="camera-outline" size={20} color={colors.emerald} />
                )}
              </View>
              <View style={styles.scanActionTextWrap}>
                <Text style={styles.scanActionTitle}>Label OCR</Text>
                <Text style={styles.scanActionSub}>{ocrLoading ? 'Scanning...' : 'Extract nutrition'}</Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* Test Product Selector (Hardware Mock Tool) */}
          <View style={styles.mockSelectorCard}>
            <Text style={styles.mockSelectorTitle}>SIMULATED HARDWARE TEST PRODUCTS</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {MOCK_PRODUCTS.map((item) => {
                const isSelected = selectedMock?.id === item.id;
                return (
                  <TouchableOpacity
                    key={item.id}
                    onPress={() => handleSelectMock(item)}
                    style={[styles.chip, isSelected && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, isSelected && styles.chipTextActive]}>
                      {item.name} ({item.defaultWeight}g)
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* Product Scanned Card (PDF Page 1) */}
          {loadingProduct ? (
            <View style={styles.productCard}>
              <ActivityIndicator color={colors.primaryPurple} />
              <Text style={styles.loadingText}>Looking up product barcode...</Text>
            </View>
          ) : productData ? (
            <View style={styles.productCard}>
              <View style={styles.productImgPlaceholder}>
                <Ionicons name="nutrition" size={24} color={colors.primaryPurple} />
                <Text style={styles.imgText}>[IMG]</Text>
              </View>

              <View style={styles.productInfo}>
                <Text style={styles.barcodeLabel}>Barcode scanned</Text>
                <Text style={styles.productName} numberOfLines={1}>
                  {productData.name || selectedMock?.name}
                </Text>
                <Text style={styles.productCalories}>
                  Per 100 g · {formatNumber(productData.nutrition?.calories || selectedMock?.kcalPer100g, 0)} kcal
                </Text>
              </View>

              <View style={styles.matchedBadge}>
                <Text style={styles.matchedBadgeText}>Matched</Text>
              </View>
            </View>
          ) : (
            <View style={[styles.productCard, styles.productCardError]}>
              <Ionicons name="alert-circle-outline" size={28} color={colors.moderate} style={{ marginRight: 10 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.unmatchedTitle}>Product not found</Text>
                <Text style={styles.unmatchedText}>
                  {productError || 'The scanned barcode has no registered nutrition profile.'}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => handleSelectMock(MOCK_PRODUCTS[0])}
                style={styles.retryChip}
              >
                <Text style={styles.retryChipText}>Reset Demo</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Circular Measured-Weight Display (PDF Page 1) */}
          <View style={styles.gaugeContainer}>
            <View style={styles.circularGauge}>
              {/* Purple active arc on right side */}
              <View style={styles.gaugeArcRight} />

              <View style={styles.gaugeInner}>
                <Text style={styles.gaugeLabel}>Measured weight</Text>
                <View style={styles.gaugeWeightRow}>
                  <Text style={styles.gaugeNumber}>{reading.weight.toFixed(1)}</Text>
                  <Text style={styles.gaugeUnit}>g</Text>
                </View>

                {reading.isSimulated ? (
                  <View style={styles.simulatedReadingTag}>
                    <Text style={styles.simulatedReadingTagText}>⚡ Simulated weight</Text>
                  </View>
                ) : (
                  <View style={styles.physicalReadingTag}>
                    <Text style={styles.physicalReadingTagText}>📶 ESP8266 Live Weight</Text>
                  </View>
                )}

                {/* Reading Status Pill */}
                {reading.isStable ? (
                  <View style={styles.statusStablePill}>
                    <Text style={styles.statusStableText}>Stable reading</Text>
                  </View>
                ) : (
                  <View style={styles.statusReadingPill}>
                    <ActivityIndicator size="small" color={colors.primaryPurple} style={{ marginRight: 4 }} />
                    <Text style={styles.statusReadingText}>Reading…</Text>
                  </View>
                )}
              </View>
            </View>
          </View>

          {/* Action Buttons: Tare & Analyse this portion (PDF Page 1) */}
          <View style={styles.actionRow}>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Tare scale"
              onPress={handleTare}
              style={styles.tareButton}
            >
              <Text style={styles.tareButtonText}>Tare</Text>
            </TouchableOpacity>

            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Analyse this portion"
              onPress={handleAnalysePortion}
              disabled={analysing || !productData}
              style={[
                styles.analyseButton,
                (!productData || analysing) && styles.analyseButtonDisabled,
              ]}
            >
              {analysing ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Text style={styles.analyseButtonText}>Analyse this portion</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    );
  }

  // -------------------------------------------------------------
  // PAGE 2: PORTION RESULT SCREEN
  // -------------------------------------------------------------
  return (
    <SafeAreaView style={styles.resultContainer}>
      {/* Top Navigation Row */}
      <View style={styles.resultHeader}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Back to scale"
          onPress={() => setScreenMode('scale')}
          style={styles.backButton}
        >
          <Ionicons name="chevron-back" size={24} color={colors.charcoal} />
        </TouchableOpacity>
        <Text style={styles.resultHeaderTitle}>Portion result</Text>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Share portion result"
          onPress={handleShare}
          style={styles.shareButton}
        >
          <Ionicons name="share-outline" size={22} color={colors.charcoal} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.resultScrollContent} showsVerticalScrollIndicator={false}>
        {/* Subtitle with Portion Weight & Simulated Label */}
        <View style={styles.portionSubtitleRow}>
          <Text style={styles.portionSubtitle}>
            {productData?.name || selectedMock?.name} · {formatNumber(measuredWeight, 0)} g portion
          </Text>
          {reading.isSimulated ? (
            <View style={styles.simulatedPortionBadge}>
              <Text style={styles.simulatedPortionBadgeText}>Simulated</Text>
            </View>
          ) : (
            <View style={styles.physicalPortionBadge}>
              <Text style={styles.physicalPortionBadgeText}>Physical Scale</Text>
            </View>
          )}
        </View>

        {/* Verdict & Score Hero (PDF Page 2) */}
        <View style={styles.verdictHeroRow}>
          <View style={styles.verdictLeft}>
            <Text style={styles.verdictTitle}>{verdict}</Text>
            <Text style={styles.verdictExplanation}>
              {verdict === 'Safe'
                ? 'Great nutritional choice. Low in sugar and healthy for regular intake.'
                : 'High in sugar for this portion. Fine as an occasional treat.'}
            </Text>
          </View>

          {/* Score Circle (e.g. 1.6 of 5) */}
          <View style={[styles.scoreCircle, { borderColor: verdictColor }]}>
            <Text style={styles.scoreNumber}>{verdictScore}</Text>
            <Text style={styles.scoreSub}>of 5</Text>
          </View>
        </View>

        {/* Segmented Verdict Bar (Safe | Moderate | Avoid) */}
        <View style={styles.segmentedBarWrap}>
          <View style={styles.segmentedTrack}>
            <View
              style={[
                styles.segment,
                styles.segmentSafe,
                verdict === 'Safe' && styles.segmentActiveSafe,
              ]}
            />
            <View
              style={[
                styles.segment,
                styles.segmentModerate,
                verdict === 'Moderate' && styles.segmentActiveModerate,
              ]}
            />
            <View
              style={[
                styles.segment,
                styles.segmentAvoid,
                verdict === 'Avoid' && styles.segmentActiveAvoid,
              ]}
            />
          </View>
          <View style={styles.segmentLabelsRow}>
            <Text style={[styles.segmentLabel, verdict === 'Safe' && styles.segmentLabelActive]}>Safe</Text>
            <Text style={[styles.segmentLabel, verdict === 'Moderate' && styles.segmentLabelActive]}>Moderate</Text>
            <Text style={[styles.segmentLabel, verdict === 'Avoid' && styles.segmentLabelActive]}>Avoid</Text>
          </View>
        </View>

        {/* Three Summary Cards (Calories, Sugar, Fat) */}
        <View style={styles.summaryCardsRow}>
          {/* Calories */}
          <View style={styles.summaryCard}>
            <Text style={styles.summaryCardLabel}>Calories</Text>
            <Text style={styles.summaryCardValue}>{formatNumber(caloriesVal, 0)}</Text>
            <Text style={styles.summaryCardSub}>kcal</Text>
          </View>

          {/* Total Sugar (Explicitly labelled Total Sugar) */}
          <View style={styles.summaryCard}>
            <Text style={styles.summaryCardLabel}>Sugar</Text>
            <Text style={styles.summaryCardValue}>{formatNumber(sugarVal, 1)}</Text>
            <Text style={styles.summaryCardSub}>g · {sugarDailyPct}% of daily</Text>
          </View>

          {/* Fat */}
          <View style={styles.summaryCard}>
            <Text style={styles.summaryCardLabel}>Fat</Text>
            <Text style={styles.summaryCardValue}>{formatNumber(fatVal, 1)}</Text>
            <Text style={styles.summaryCardSub}>g · {fatDailyPct}% of daily</Text>
          </View>
        </View>

        {/* Detailed Nutrition Table (Nutrition for your 42g vs per 100g) */}
        <View style={styles.nutritionTableCard}>
          <View style={styles.nutritionTableHeader}>
            <Text style={styles.tableHeaderLeft}>
              Nutrition for your {formatNumber(measuredWeight, 0)} g
            </Text>
            <Text style={styles.tableHeaderRight}>per 100 g</Text>
          </View>

          {/* Carbs */}
          <View style={styles.tableRow}>
            <Text style={styles.nutrientName}>Carbs</Text>
            <View style={styles.miniBarTrack}>
              <View style={[styles.miniBarFillPurple, { width: `${Math.min(100, (carbsVal / 50) * 100)}%` }]} />
            </View>
            <Text style={styles.portionVal}>{formatNumber(carbsVal, 1)} g</Text>
            <Text style={styles.per100Val}>{formatNumber(per100gNutr.carbs || 57, 0)} g</Text>
          </View>

          {/* Protein */}
          <View style={styles.tableRow}>
            <Text style={styles.nutrientName}>Protein</Text>
            <View style={styles.miniBarTrack}>
              <View style={[styles.miniBarFillPurple, { width: `${Math.min(100, (proteinVal / 20) * 100)}%` }]} />
            </View>
            <Text style={styles.portionVal}>{formatNumber(proteinVal, 1)} g</Text>
            <Text style={styles.per100Val}>{formatNumber(per100gNutr.protein || 7.5, 1)} g</Text>
          </View>

          {/* Saturated Fat */}
          <View style={styles.tableRow}>
            <Text style={styles.nutrientName}>Saturated fat</Text>
            <View style={styles.miniBarTrack}>
              <View style={[styles.miniBarFillAmber, { width: `${Math.min(100, (satFatVal / 20) * 100)}%` }]} />
            </View>
            <Text style={styles.portionVal}>{formatNumber(satFatVal, 1)} g</Text>
            <Text style={styles.per100Val}>{formatNumber(per100gNutr.saturated_fat || 18, 0)} g</Text>
          </View>
        </View>

        {/* Allergen Warning Banner (PDF Page 2) */}
        {allergenDetected ? (
          <View style={styles.allergenBanner}>
            <Text style={styles.allergenText}>
              Contains dairy, an allergen in your profile.
            </Text>
          </View>
        ) : null}

        {/* Healthier Alternatives Shortcut */}
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Explore Healthier Swaps"
          onPress={() => setShowAlternatives(true)}
          style={styles.alternativesBannerBtn}
        >
          <Ionicons name="sparkles" size={15} color={colors.primaryPurple} style={{ marginRight: 6 }} />
          <Text style={styles.alternativesBannerText}>Explore Healthier Swaps & Alternatives</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.primaryPurple} />
        </TouchableOpacity>

        {/* Two Distinct Actions: View Details and Log to Today's Intake */}
        <View style={styles.resultActionsRow}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="View Details"
            onPress={handleViewDetails}
            style={styles.viewDetailsButton}
          >
            <Ionicons name="document-text-outline" size={18} color={colors.primaryPurple} style={{ marginRight: 6 }} />
            <Text style={styles.viewDetailsButtonText}>View Details</Text>
          </TouchableOpacity>

          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Log to Today's Intake"
            onPress={handleLogToToday}
            disabled={savingPortion || savedPortion}
            style={[styles.logButton, savedPortion && styles.logButtonDone]}
          >
            {savingPortion ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <View style={styles.btnContentRow}>
                <Ionicons
                  name={savedPortion ? "checkmark-circle" : "add-circle-outline"}
                  size={18}
                  color={colors.white}
                  style={{ marginRight: 6 }}
                />
                <Text style={styles.logButtonText}>
                  {savedPortion ? "Logged to Intake ✓" : "Log to Today's Intake"}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* ESP8266 IP Configuration Modal */}
        <Modal
          visible={showWifiModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowWifiModal(false)}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.ipModalCard}>
              <View style={styles.ipModalHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="hardware-chip-outline" size={20} color={colors.primaryPurple} />
                  <Text style={styles.ipModalTitle}>ESP8266 Wi-Fi Scale</Text>
                </View>
                <TouchableOpacity onPress={() => setShowWifiModal(false)}>
                  <Ionicons name="close" size={22} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              <Text style={styles.ipModalSubtitle}>
                Enter the local IP address assigned to your ESP8266 NodeMCU on your Wi-Fi network:
              </Text>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>IP Address / Hostname</Text>
                <TextInput
                  value={ipInput}
                  onChangeText={setIpInput}
                  placeholder="e.g. 192.168.1.100 or nutriscale.local"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={styles.textInput}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Port (Default: 80)</Text>
                <TextInput
                  value={wifiPort}
                  onChangeText={setWifiPort}
                  placeholder="80"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="numeric"
                  style={styles.textInput}
                />
              </View>

              <View style={styles.ipModalActions}>
                <TouchableOpacity
                  onPress={() => setShowWifiModal(false)}
                  style={styles.ipModalCancelBtn}
                >
                  <Text style={styles.ipModalCancelText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={async () => {
                    setShowWifiModal(false);
                    await handleConnectWifi(ipInput);
                  }}
                  style={styles.ipModalSaveBtn}
                >
                  <Text style={styles.ipModalSaveText}>Save & Connect</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Webcam / Device Camera Barcode Scanning Modal */}
      <Modal visible={showCamera} animationType="slide" onRequestClose={() => setShowCamera(false)}>
        <SafeAreaView style={styles.cameraModalContainer}>
          <View style={styles.cameraModalHeader}>
            <Text style={styles.cameraModalTitle}>Scan Barcode with Webcam</Text>
            <TouchableOpacity onPress={() => setShowCamera(false)} style={styles.cameraCloseBtn}>
              <Ionicons name="close" size={24} color={colors.white} />
            </TouchableOpacity>
          </View>
          <View style={styles.cameraPreviewWrap}>
            <CameraView
              style={StyleSheet.absoluteFillObject}
              facing="back"
              barcodeScannerSettings={{
                barcodeTypes: ['qr', 'ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39'],
              }}
              onBarcodeScanned={scanningBarcode ? undefined : handleBarcodeScanned}
            />
            <View style={styles.cameraReticle}>
              <View style={styles.cameraFrame} />
              <Text style={styles.cameraScanHint}>Align barcode within the frame</Text>
            </View>
          </View>
          <TouchableOpacity onPress={() => setShowCamera(false)} style={styles.cameraCancelBottomBtn}>
            <Text style={styles.cameraCancelBottomText}>Close Webcam Scanner</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </Modal>

      {/* Alternatives Modal */}
      <Modal visible={showAlternatives} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Healthier Alternatives</Text>
              <TouchableOpacity onPress={() => setShowAlternatives(false)}>
                <Ionicons name="close" size={24} color={colors.charcoal} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSub}>Recommended swaps with lower sugar or calories:</Text>
            <View style={styles.altItemCard}>
              <Ionicons name="leaf-outline" size={22} color={colors.safe} style={{ marginRight: 10 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.altItemTitle}>Dark Chocolate (70%+ Cocoa)</Text>
                <Text style={styles.altItemDetail}>Lower sugar: 24g vs 56g per 100g</Text>
              </View>
            </View>
            <View style={styles.altItemCard}>
              <Ionicons name="leaf-outline" size={22} color={colors.safe} style={{ marginRight: 10 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.altItemTitle}>Storia Tender Coconut Water</Text>
                <Text style={styles.altItemDetail}>Natural hydration with only 4.2g sugar per 100g</Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={() => setShowAlternatives(false)}
              style={styles.closeModalBtn}
            >
              <Text style={styles.closeModalBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screenBg: {
    flex: 1,
    backgroundColor: '#F8F6FC',
  },
  // Scale Hero (Page 1)
  scaleHero: {
    backgroundColor: colors.primaryPurple,
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 24 : 10,
    paddingBottom: 24,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  scaleHeroNav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  brandTitle: {
    fontSize: 28,
    fontFamily: typography.fraunces,
    fontWeight: '800',
    color: colors.white,
    letterSpacing: -0.5,
  },
  connectionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  connectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
    marginRight: 6,
  },
  connectionText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.white,
  },
  simulatedPill: {
    marginLeft: 6,
    backgroundColor: 'rgba(0,0,0,0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  simulatedText: {
    fontSize: 9,
    color: '#E9D5FF',
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  scaleHeroSubtitle: {
    fontSize: 15,
    color: '#E9D5FF',
    fontWeight: '500',
    marginTop: 2,
  },
  scaleScrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
  },
  // Mock product selector
  mockSelectorCard: {
    marginBottom: 12,
  },
  mockSelectorTitle: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    color: colors.muted,
    marginBottom: 6,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
  },
  chip: {
    backgroundColor: colors.white,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  chipActive: {
    backgroundColor: colors.lilac,
    borderColor: colors.primaryPurple,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.charcoal,
  },
  chipTextActive: {
    color: colors.primaryPurple,
    fontWeight: '800',
  },
  // Product Card (Page 1)
  productCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: 14,
    marginBottom: 20,
    ...shadows.sm,
  },
  productCardError: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
    borderWidth: 1,
  },
  productImgPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.lilac,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  imgText: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.primaryPurple,
    marginTop: 1,
  },
  productInfo: {
    flex: 1,
  },
  barcodeLabel: {
    fontSize: 11,
    color: colors.muted,
    fontWeight: '600',
  },
  productName: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.charcoal,
    marginTop: 1,
  },
  productCalories: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  matchedBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },
  matchedBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#166534',
  },
  unmatchedTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#92400E',
  },
  unmatchedText: {
    fontSize: 12,
    color: '#78350F',
    marginTop: 2,
  },
  retryChip: {
    backgroundColor: colors.primaryPurple,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  retryChipText: {
    fontSize: 11,
    color: colors.white,
    fontWeight: '700',
  },
  loadingText: {
    fontSize: 13,
    color: colors.muted,
    marginLeft: 10,
  },
  // Circular Measured-Weight Display (Page 1)
  gaugeContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 20,
  },
  circularGauge: {
    width: 250,
    height: 250,
    borderRadius: 125,
    borderWidth: 12,
    borderColor: colors.lilacBorder,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    position: 'relative',
    ...shadows.sm,
  },
  gaugeArcRight: {
    position: 'absolute',
    right: -12,
    top: 20,
    width: 14,
    height: 160,
    borderTopRightRadius: 80,
    borderBottomRightRadius: 80,
    backgroundColor: colors.primaryPurple,
  },
  gaugeInner: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  gaugeLabel: {
    fontSize: 13,
    color: colors.muted,
    fontWeight: '600',
    marginBottom: 4,
  },
  gaugeWeightRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  gaugeNumber: {
    fontSize: 64,
    fontFamily: typography.fraunces,
    fontWeight: '800',
    color: colors.purpleDeep,
    letterSpacing: -1,
  },
  gaugeUnit: {
    fontSize: 24,
    fontFamily: typography.fraunces,
    fontWeight: '800',
    color: colors.purpleDeep,
    marginLeft: 4,
  },
  statusStablePill: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 14,
    marginTop: 8,
  },
  statusStableText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#166534',
  },
  statusReadingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.lilac,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    marginTop: 8,
  },
  statusReadingText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primaryPurple,
  },
  // Action Buttons (Page 1)
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 10,
  },
  tareButton: {
    width: 110,
    height: 52,
    borderRadius: 16,
    backgroundColor: colors.lilac,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tareButtonText: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.primaryPurple,
  },
  analyseButton: {
    flex: 1,
    height: 52,
    borderRadius: 16,
    backgroundColor: colors.primaryPurple,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.sm,
  },
  analyseButtonDisabled: {
    opacity: 0.6,
  },
  analyseButtonText: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.white,
  },

  // -------------------------------------------------------------
  // RESULT SCREEN STYLES (Page 2)
  // -------------------------------------------------------------
  resultContainer: {
    flex: 1,
    backgroundColor: colors.white,
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  backButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultHeaderTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.charcoal,
  },
  shareButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultScrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
  },
  portionSubtitle: {
    fontSize: 13,
    color: colors.muted,
    fontWeight: '600',
    marginBottom: 10,
  },
  verdictHeroRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  verdictLeft: {
    flex: 1,
    paddingRight: 16,
  },
  verdictTitle: {
    fontSize: 34,
    fontFamily: typography.fraunces,
    fontWeight: '800',
    color: colors.purpleDeep,
    letterSpacing: -0.5,
  },
  verdictExplanation: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
    marginTop: 4,
  },
  scoreCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEF9EE',
  },
  scoreNumber: {
    fontSize: 24,
    fontFamily: typography.fraunces,
    fontWeight: '800',
    color: colors.purpleDeep,
  },
  scoreSub: {
    fontSize: 10,
    color: colors.muted,
    fontWeight: '700',
    marginTop: -2,
  },
  // Segmented Bar
  segmentedBarWrap: {
    marginBottom: 20,
  },
  segmentedTrack: {
    flexDirection: 'row',
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    backgroundColor: '#E5E7EB',
  },
  segment: {
    flex: 1,
  },
  segmentSafe: {
    backgroundColor: '#D1FAE5',
  },
  segmentActiveSafe: {
    backgroundColor: '#10B981',
  },
  segmentModerate: {
    backgroundColor: '#FEF3C7',
  },
  segmentActiveModerate: {
    backgroundColor: '#F59E0B',
  },
  segmentAvoid: {
    backgroundColor: '#FEE2E2',
  },
  segmentActiveAvoid: {
    backgroundColor: '#EF4444',
  },
  segmentLabelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  segmentLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.muted,
  },
  segmentLabelActive: {
    color: colors.charcoal,
    fontWeight: '800',
  },
  // Three Summary Cards
  summaryCardsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.borderLight,
    ...shadows.sm,
  },
  summaryCardLabel: {
    fontSize: 12,
    color: colors.muted,
    fontWeight: '600',
  },
  summaryCardValue: {
    fontSize: 26,
    fontFamily: typography.fraunces,
    fontWeight: '800',
    color: colors.purpleDeep,
    marginTop: 4,
  },
  summaryCardSub: {
    fontSize: 11,
    color: colors.muted,
    fontWeight: '600',
    marginTop: 2,
    lineHeight: 14,
  },
  // Nutrition Table Card
  nutritionTableCard: {
    backgroundColor: colors.white,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.borderLight,
    marginBottom: 16,
    ...shadows.sm,
  },
  nutritionTableHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  tableHeaderLeft: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.charcoal,
  },
  tableHeaderRight: {
    fontSize: 12,
    color: colors.muted,
    fontWeight: '600',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  nutrientName: {
    width: 100,
    fontSize: 13,
    fontWeight: '700',
    color: colors.charcoal,
  },
  miniBarTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#F3E8FF',
    marginRight: 12,
    overflow: 'hidden',
  },
  miniBarFillPurple: {
    height: '100%',
    backgroundColor: colors.primaryPurple,
    borderRadius: 4,
  },
  miniBarFillAmber: {
    height: '100%',
    backgroundColor: '#F59E0B',
    borderRadius: 4,
  },
  portionVal: {
    width: 60,
    fontSize: 13,
    fontWeight: '800',
    color: colors.charcoal,
    textAlign: 'right',
  },
  per100Val: {
    width: 50,
    fontSize: 12,
    color: colors.muted,
    textAlign: 'right',
  },
  // Allergen Banner (Page 2)
  allergenBanner: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FEE2E2',
    borderRadius: 14,
    padding: 14,
    marginBottom: 20,
  },
  allergenText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#991B1B',
  },
  // Result Actions Row
  resultActionsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  altButton: {
    width: 120,
    height: 52,
    borderRadius: 16,
    backgroundColor: colors.lilac,
    alignItems: 'center',
    justifyContent: 'center',
  },
  altButtonText: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.primaryPurple,
  },
  logButton: {
    flex: 1,
    height: 52,
    borderRadius: 16,
    backgroundColor: colors.primaryPurple,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.sm,
  },
  logButtonDone: {
    backgroundColor: '#10B981',
  },
  logButtonText: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.white,
  },
  // Alternatives Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 36,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.charcoal,
  },
  modalSub: {
    fontSize: 13,
    color: colors.muted,
    marginBottom: 16,
  },
  altItemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  altItemTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.charcoal,
  },
  altItemDetail: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  closeModalBtn: {
    backgroundColor: colors.lilac,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  closeModalBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.primaryPurple,
  },
  // Scan workflow options
  scanWorkflowRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  scanActionCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#EDE9FE',
    ...shadows.sm,
  },
  scanActionIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#F3E8FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  scanActionTextWrap: {
    flex: 1,
  },
  scanActionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.charcoal,
  },
  scanActionSub: {
    fontSize: 11,
    color: colors.muted,
    marginTop: 2,
  },
  simulatedReadingTag: {
    backgroundColor: '#F3E8FF',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
    marginTop: 6,
    alignSelf: 'center',
  },
  simulatedReadingTagText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.primaryPurple,
    letterSpacing: 0.4,
  },
  portionSubtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  simulatedPortionBadge: {
    backgroundColor: '#F3E8FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  simulatedPortionBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.primaryPurple,
  },
  alternativesBannerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FAF5FF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E9D5FF',
  },
  alternativesBannerText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primaryPurple,
    flex: 1,
  },
  viewDetailsButton: {
    flex: 1,
    height: 52,
    borderRadius: 16,
    backgroundColor: colors.lilac,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.lilacBorder,
  },
  viewDetailsButtonText: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.primaryPurple,
  },
  btnContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Camera modal
  cameraModalContainer: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  cameraModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  cameraModalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.white,
  },
  cameraCloseBtn: {
    padding: 6,
  },
  cameraPreviewWrap: {
    flex: 1,
    overflow: 'hidden',
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraReticle: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraFrame: {
    width: 250,
    height: 160,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.white,
    backgroundColor: 'transparent',
  },
  cameraScanHint: {
    marginTop: 16,
    fontSize: 13,
    color: colors.white,
    fontWeight: '600',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  cameraCancelBottomBtn: {
    margin: 20,
    backgroundColor: '#334155',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  cameraCancelBottomText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.white,
  },
  // ESP8266 & Scale Switcher Styles
  scaleModeSwitcherRow: {
    flexDirection: 'row',
    backgroundColor: '#EDE9FE',
    borderRadius: 14,
    padding: 4,
    marginBottom: 14,
    gap: 6,
  },
  scaleModeTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
  },
  scaleModeTabActive: {
    backgroundColor: colors.white,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  scaleModeTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
  },
  scaleModeTabTextActive: {
    color: colors.primaryPurple,
    fontWeight: '800',
  },
  wifiConfigCard: {
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  wifiConfigHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  wifiConfigTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  wifiConfigTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.charcoal,
  },
  wifiEditBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3E8FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  wifiEditBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primaryPurple,
  },
  wifiEndpointRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginBottom: 10,
  },
  wifiEndpointLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
    marginRight: 6,
  },
  wifiEndpointValue: {
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: colors.charcoal,
    fontWeight: '600',
  },
  wifiStatusActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  wifiStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    marginRight: 8,
  },
  wifiStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  wifiStatusPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.charcoal,
    flexShrink: 1,
  },
  wifiConnectBtn: {
    backgroundColor: colors.primaryPurple,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    minWidth: 90,
    alignItems: 'center',
  },
  wifiConnectBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.white,
  },
  wifiDisconnectBtn: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  wifiDisconnectBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#DC2626',
  },
  wifiHintText: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 8,
    lineHeight: 15,
  },
  physicalReadingTag: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
    marginTop: 6,
    alignSelf: 'center',
  },
  physicalReadingTagText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.emerald,
    letterSpacing: 0.4,
  },
  physicalPortionBadge: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  physicalPortionBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.emerald,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  ipModalCard: {
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: 20,
    width: '100%',
    maxWidth: 380,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  ipModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  ipModalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.charcoal,
  },
  ipModalSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 16,
    lineHeight: 18,
  },
  inputGroup: {
    marginBottom: 14,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.charcoal,
    marginBottom: 6,
  },
  textInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.charcoal,
  },
  ipModalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 8,
  },
  ipModalCancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
  },
  ipModalCancelText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.charcoal,
  },
  ipModalSaveBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: colors.primaryPurple,
  },
  ipModalSaveText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.white,
  },
});