import React from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import SectionHeader from '../components/SectionHeader';
import StatusIndicator from '../components/StatusIndicator';
import { colors, spacing, typography } from '../theme';

const C = colors;

function HardwareItem({ icon, label, value, detail }) {
  return (
    <View style={styles.hardwareItem}>
      <View style={styles.hardwareIconBox}>
        <Ionicons name={icon} size={20} color={C.emerald} />
      </View>
      <View style={styles.hardwareContent}>
        <Text style={styles.hardwareLabel}>{label}</Text>
        <Text style={styles.hardwareValue}>{value}</Text>
        {detail ? <Text style={styles.hardwareDetail}>{detail}</Text> : null}
      </View>
    </View>
  );
}

export default function DevicesScreen({ navigation }) {
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
            <Ionicons name="hardware-chip-outline" size={14} color={C.emerald} />
            <Text style={styles.badgePillText}>HARDWARE HUB</Text>
          </View>
        </View>

        <Text style={styles.title}>Your NutriScale</Text>
        <Text style={styles.subtitle}>Manage the physical smart scale & webcam scanner used to measure your portions.</Text>

        {/* Primary Active Device Card */}
        <View style={styles.deviceCard}>
          <View style={styles.deviceCardHeader}>
            <View style={styles.deviceMark}>
              <Ionicons name="scale-outline" size={32} color={C.white} />
            </View>
            <View style={styles.deviceHeaderInfo}>
              <View style={styles.deviceStatusRow}>
                <View style={styles.activeDot} />
                <Text style={styles.deviceStatusText}>CONNECTED · READY</Text>
              </View>
              <Text style={styles.deviceName}>NutriScale Pro</Text>
              <Text style={styles.deviceModel}>Virtual Sensor & Scale v1.0</Text>
            </View>
          </View>

          <View style={styles.deviceDivider} />

          <View style={styles.deviceStatsRow}>
            <View style={styles.statCol}>
              <Text style={styles.statLabel}>MODE</Text>
              <Text style={styles.statVal}>Software Scale</Text>
            </View>
            <View style={styles.statCol}>
              <Text style={styles.statLabel}>LATENCY</Text>
              <Text style={styles.statVal}>&lt; 5 ms</Text>
            </View>
            <View style={styles.statCol}>
              <Text style={styles.statLabel}>PRECISION</Text>
              <Text style={styles.statVal}>± 0.1 g</Text>
            </View>
          </View>
        </View>

        {/* Status Indicator */}
        <View style={styles.statusBox}>
          <StatusIndicator>SIMULATED SOFTWARE SCALE ACTIVE</StatusIndicator>
        </View>

        {/* Scale Mode Explanation */}
        <View style={styles.infoCard}>
          <View style={styles.infoHeader}>
            <Ionicons name="information-circle-outline" size={20} color={C.emerald} />
            <Text style={styles.infoTitle}>Scale Simulation Mode</Text>
          </View>
          <Text style={styles.infoBody}>
            NutriScale is currently running the internal software weight sensor. All portion calculations, macro scaling, and nutritional breakdowns work seamlessly without physical hardware.
          </Text>
        </View>

        {/* Physical Hardware Blueprint */}
        <View style={styles.section}>
          <SectionHeader action={<Text style={styles.sectionPill}>ESP8266 IOT</Text>}>
            PHYSICAL HARDWARE SPECS
          </SectionHeader>
          <View style={styles.hardwareCard}>
            <HardwareItem
              icon="hardware-chip-outline"
              label="MICROCONTROLLER"
              value="ESP8266 NodeMCU ESP-12E"
              detail="80/160 MHz Tensilica L106 · 802.11 b/g/n Wi-Fi"
            />
            <HardwareItem
              icon="speedometer-outline"
              label="WEIGHT MEASUREMENT"
              value="HX711 + 10 kg Load Cell"
              detail="24-bit differential ADC · Configurable calibration factor"
            />
            <HardwareItem
              icon="videocam-outline"
              label="BARCODE & OCR SCANNER"
              value="Webcam / Device Camera"
              detail="Live barcode detection & nutrition label OCR"
            />
            <HardwareItem
              icon="tv-outline"
              label="ON-DEVICE DISPLAY & LED"
              value="I2C LCD & RGB Status LED"
              detail="Live weight display & three-colour stability indication"
            />
          </View>
        </View>

        {/* Pairing Readiness */}
        <View style={styles.setupCard}>
          <View style={styles.setupHeader}>
            <Ionicons name="wifi-outline" size={22} color={C.textSecondary} />
            <Text style={styles.setupTitle}>Connect Physical NutriScale</Text>
          </View>
          <Text style={styles.setupBody}>
            When powering on your ESP8266 NodeMCU, it joins your local Wi-Fi and exposes a lightweight REST endpoint: http://[esp-ip]/weight.
          </Text>
          <View style={styles.setupTag}>
            <Ionicons name="radio-outline" size={14} color={C.emerald} />
            <Text style={styles.setupTagText}>Local Wi-Fi REST endpoint ready</Text>
          </View>
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
    lineHeight: 21,
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },

  // Primary Device Card
  deviceCard: {
    backgroundColor: C.surfaceCard,
    borderRadius: 20,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: C.borderLight,
    shadowColor: C.shadows.md.shadowColor,
    shadowOffset: C.shadows.md.shadowOffset,
    shadowOpacity: C.shadows.md.shadowOpacity,
    shadowRadius: C.shadows.md.shadowRadius,
    elevation: 3,
  },
  deviceCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  deviceMark: {
    width: 60,
    height: 60,
    borderRadius: 18,
    backgroundColor: C.emerald,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: C.emerald,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  deviceHeaderInfo: {
    flex: 1,
  },
  deviceStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  activeDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: C.emerald,
  },
  deviceStatusText: {
    color: C.emerald,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  deviceName: {
    color: C.charcoal,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  deviceModel: {
    color: C.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  deviceDivider: {
    height: 1,
    backgroundColor: C.borderLight,
    marginVertical: spacing.md,
  },
  deviceStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statCol: {
    alignItems: 'flex-start',
  },
  statLabel: {
    color: C.muted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  statVal: {
    color: C.charcoal,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 3,
  },

  statusBox: {
    marginVertical: spacing.md,
  },

  // Info Card
  infoCard: {
    backgroundColor: C.emeraldSoft,
    borderRadius: 16,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(5, 150, 105, 0.2)',
    marginBottom: spacing.lg,
  },
  infoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: spacing.xs,
  },
  infoTitle: {
    color: C.emeraldDark,
    fontSize: 14,
    fontWeight: '800',
  },
  infoBody: {
    color: C.emeraldDark,
    fontSize: 13,
    lineHeight: 19,
    opacity: 0.9,
  },

  // Hardware Specs
  section: {
    marginBottom: spacing.lg,
  },
  sectionPill: {
    color: C.emerald,
    fontSize: 11,
    fontWeight: '800',
    backgroundColor: C.emeraldSoft,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  hardwareCard: {
    backgroundColor: C.surfaceCard,
    borderRadius: 16,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: C.borderLight,
    marginTop: spacing.xs,
    shadowColor: C.shadows.sm.shadowColor,
    shadowOffset: C.shadows.sm.shadowOffset,
    shadowOpacity: C.shadows.sm.shadowOpacity,
    shadowRadius: C.shadows.sm.shadowRadius,
    elevation: 2,
  },
  hardwareItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: C.borderLight,
  },
  hardwareIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: C.emeraldSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  hardwareContent: {
    flex: 1,
  },
  hardwareLabel: {
    color: C.muted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  hardwareValue: {
    color: C.charcoal,
    fontSize: 14,
    fontWeight: '700',
    marginTop: 1,
  },
  hardwareDetail: {
    color: C.textSecondary,
    fontSize: 11,
    marginTop: 2,
  },

  // Setup Card
  setupCard: {
    backgroundColor: C.surfaceCard,
    borderRadius: 16,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: C.borderLight,
  },
  setupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: spacing.xs,
  },
  setupTitle: {
    color: C.charcoal,
    fontSize: 15,
    fontWeight: '800',
  },
  setupBody: {
    color: C.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: spacing.md,
  },
  setupTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: C.surfaceSelected,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    alignSelf: 'flex-start',
  },
  setupTagText: {
    color: C.emeraldDark,
    fontSize: 12,
    fontWeight: '700',
  },
});
