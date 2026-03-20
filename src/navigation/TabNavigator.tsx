import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { HomeScreen } from '../screens/HomeScreen';
import { StatsScreen } from '../screens/StatsScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { useApp } from '../context/AppContext';
import { getTheme, radius } from '../utils/theme';

type TabName = 'home' | 'stats' | 'settings';

interface Tab {
  name: TabName;
  iconFocused: keyof typeof Ionicons.glyphMap;
  iconUnfocused: keyof typeof Ionicons.glyphMap;
  label: string;
}

const TABS: Tab[] = [
  { name: 'home',     iconFocused: 'home',      iconUnfocused: 'home-outline',      label: 'Öğren' },
  { name: 'stats',    iconFocused: 'bar-chart',  iconUnfocused: 'bar-chart-outline', label: 'İstatistik' },
  { name: 'settings', iconFocused: 'settings',   iconUnfocused: 'settings-outline',  label: 'Ayarlar' },
];

const TAB_BAR_HEIGHT = Platform.OS === 'ios' ? 84 : 64;

interface Props { navigation: any; }

export const TabNavigator: React.FC<Props> = ({ navigation }) => {
  const [activeTab, setActiveTab] = useState<TabName>('home');
  const { state } = useApp();
  const theme = getTheme(state.darkMode);

  const renderScreen = () => {
    switch (activeTab) {
      case 'home':     return <HomeScreen navigation={navigation} />;
      case 'stats':    return <StatsScreen />;
      case 'settings': return <SettingsScreen navigation={navigation} />;
    }
  };

  // On web: position:fixed pins to the actual viewport regardless of overflow.
  // On native: position:absolute within the root View works as normal.
  const tabBarPositionStyle = Platform.select({
    web: {
      position: 'fixed' as any,
      bottom: 0,
      left: 0,
      right: 0,
      zIndex: 9999,
    } as any,
    default: {
      position: 'absolute' as const,
      bottom: 0,
      left: 0,
      right: 0,
      zIndex: 100,
    },
  });

  return (
    <View style={styles.root}>
      {/* Screen content — paddingBottom clears the fixed tab bar */}
      <View style={[styles.screenArea, { paddingBottom: TAB_BAR_HEIGHT }]}>
        {renderScreen()}
      </View>

      {/* Tab Bar */}
      <View
        style={[
          styles.tabBar,
          tabBarPositionStyle,
          {
            height: TAB_BAR_HEIGHT,
            paddingBottom: Platform.OS === 'ios' ? 20 : 4,
            backgroundColor: theme.surface,
            borderTopColor: theme.border,
          },
        ]}
      >
        {TABS.map(tab => {
          const focused = activeTab === tab.name;
          const iconColor = focused ? theme.primary : theme.textTertiary;
          const iconName = focused ? tab.iconFocused : tab.iconUnfocused;
          return (
            <TouchableOpacity
              key={tab.name}
              onPress={() => setActiveTab(tab.name)}
              activeOpacity={0.75}
              style={styles.tabItem}
            >
              {focused && (
                <View style={[styles.activePill, { backgroundColor: theme.primary }]} />
              )}
              <Ionicons
                name={iconName}
                size={focused ? 26 : 24}
                color={iconColor}
              />
              <Text
                style={[
                  styles.tabLabel,
                  { color: iconColor, fontWeight: focused ? '700' : '500' },
                ]}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  screenArea: {
    flex: 1,
  },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingTop: 8,
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    gap: 3,
    paddingTop: 2,
  },
  activePill: {
    position: 'absolute',
    top: -8,
    width: 32,
    height: 3,
    borderRadius: radius.full,
  },
  tabLabel: { fontSize: 10, letterSpacing: 0.2 },
});
