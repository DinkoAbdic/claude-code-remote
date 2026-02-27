import React, { useState, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, StyleSheet, LogBox } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { HomeScreen } from './src/screens/HomeScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { TerminalScreen } from './src/screens/TerminalScreen';
import { ScanScreen } from './src/screens/ScanScreen';
import { BrowseScreen } from './src/screens/BrowseScreen';
import { AppHeader } from './src/components/AppHeader';
import { useConnectionStore } from './src/store/useConnectionStore';
import { setupNotifications } from './src/notifications';
import { ErrorBoundary } from './src/components/ErrorBoundary';

export type RootStackParamList = {
  Settings: undefined;
  Home: { selectedPath?: string; selectedName?: string } | undefined;
  Scan: undefined;
  Browse: undefined;
  Terminal: { sessionId?: string; cwd?: string; command?: string } | undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

function AppNavigator() {
  const { host, token } = useConnectionStore();
  const [ready, setReady] = useState(false);
  const [initialRoute, setInitialRoute] = useState<keyof RootStackParamList>('Settings');

  useEffect(() => {
    const unsub = useConnectionStore.persist.onFinishHydration(() => {
      const state = useConnectionStore.getState();
      if (state.host && state.token) {
        setInitialRoute('Home');
      }
      setReady(true);
    });

    if (useConnectionStore.persist.hasHydrated()) {
      if (host && token) {
        setInitialRoute('Home');
      }
      setReady(true);
    }

    return unsub;
  }, []);

  if (!ready) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#569cd6" />
      </View>
    );
  }

  return (
    <Stack.Navigator
      initialRouteName={initialRoute}
      screenOptions={{
        header: (props) => <AppHeader {...props} />,
        contentStyle: { backgroundColor: '#1e1e1e' },
      }}
    >
      <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Connection' }} />
      <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'Claude Remote' }} />
      <Stack.Screen name="Scan" component={ScanScreen} options={{ title: 'Scan QR Code' }} />
      <Stack.Screen name="Browse" component={BrowseScreen} options={{ title: 'Select Directory' }} />
      <Stack.Screen name="Terminal" component={TerminalScreen} options={{ title: 'Terminal' }} />
    </Stack.Navigator>
  );
}

// Prevent unhandled promise rejections from crashing the app
const origHandler = (globalThis as any).ErrorUtils?.getGlobalHandler?.();
(globalThis as any).ErrorUtils?.setGlobalHandler?.((error: Error, isFatal?: boolean) => {
  console.error('Global error:', error);
  if (origHandler) origHandler(error, isFatal);
});

export default function App() {
  useEffect(() => {
    setupNotifications();
  }, []);

  return (
    <ErrorBoundary>
      <NavigationContainer>
        <StatusBar style="light" />
        <AppNavigator />
      </NavigationContainer>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: '#1e1e1e',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
