import React from 'react';
import { ActivityIndicator, Platform, StyleSheet, TouchableOpacity, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from '../context/AuthContext';
import { colors, shadows } from '../theme';

import LoginScreen from '../screens/LoginScreen';
import HomeScreen from '../screens/HomeScreen';
import ResultScreen from '../screens/ResultScreen';
import ReportScreen from '../screens/ReportScreen';
import InsightsScreen from '../screens/InsightsScreen';
import ProfileScreen from '../screens/ProfileScreen';
import ManualEntryScreen from '../screens/ManualEntryScreen';
import OCRScanScreen from '../screens/OCRScanScreen';
import NutriScaleFlowScreen from '../screens/NutriScaleFlowScreen';
import DevicesScreen from '../screens/DevicesScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function CenterScanButton({ onPress }) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel="Weigh and scan on NutriScale"
      activeOpacity={0.85}
      onPress={onPress}
      style={styles.centerScanWrapper}
    >
      <View style={styles.centerScanCircle}>
        <Ionicons name="scan-outline" size={24} color={colors.white} />
      </View>
    </TouchableOpacity>
  );
}

function TabNavigator() {
  return (
    <Tab.Navigator
      initialRouteName="Home"
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primaryPurple,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.white,
          borderTopColor: colors.borderLight,
          borderTopWidth: 1,
          height: Platform.OS === 'ios' ? 88 : 68,
          paddingBottom: Platform.OS === 'ios' ? 24 : 10,
          paddingTop: 8,
          ...shadows.md,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
        tabBarIcon: ({ focused, color }) => {
          let iconName;
          if (route.name === 'Home') {
            iconName = focused ? 'home' : 'home-outline';
          } else if (route.name === 'Insights') {
            iconName = focused ? 'stats-chart' : 'stats-chart-outline';
          } else if (route.name === 'Scale') {
            iconName = focused ? 'scale' : 'scale-outline';
          } else if (route.name === 'Profile') {
            iconName = focused ? 'person' : 'person-outline';
          }

          return <Ionicons name={iconName || 'ellipse'} size={22} color={color} />;
        },
      })}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{ tabBarLabel: 'Home' }}
      />
      <Tab.Screen
        name="Insights"
        component={InsightsScreen}
        options={{ tabBarLabel: 'Insights' }}
      />
      <Tab.Screen
        name="CenterScan"
        component={NutriScaleFlowScreen}
        options={({ navigation }) => ({
          tabBarLabel: () => null,
          tabBarButton: (props) => (
            <CenterScanButton
              {...props}
              onPress={() => navigation.navigate('Scale')}
            />
          ),
        })}
      />
      <Tab.Screen
        name="Scale"
        component={NutriScaleFlowScreen}
        options={{ tabBarLabel: 'Scale' }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ tabBarLabel: 'Profile' }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  centerScanWrapper: {
    top: -14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerScanCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.primaryPurple,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.white,
    ...shadows.md,
  },
});

export default function AppNavigator() {
  const { isLoggedIn } = useAuth();

  if (isLoggedIn === null) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primaryPurple} />
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {!isLoggedIn ? (
        <Stack.Screen name="Login" component={LoginScreen} />
      ) : (
        <>
          <Stack.Screen name="Main" component={TabNavigator} />
          <Stack.Screen
            name="Result"
            component={ResultScreen}
            options={{ unmountOnBlur: true, headerShown: false }}
          />
          <Stack.Screen name="NutriScaleFlow" component={NutriScaleFlowScreen} />
          {/* Legacy navigation alias for any direct 'Scan' references */}
          <Stack.Screen name="Scan" component={NutriScaleFlowScreen} />
          <Stack.Screen name="Report" component={ReportScreen} />
          <Stack.Screen name="Devices" component={DevicesScreen} />
          <Stack.Screen name="ManualEntry" component={ManualEntryScreen} options={{ headerShown: false }} />
          <Stack.Screen name="OCRScan" component={OCRScanScreen} options={{ headerShown: false }} />
        </>
      )}
    </Stack.Navigator>
  );
}
