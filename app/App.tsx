import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { TerminalScreen } from './src/screens/TerminalScreen';

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <StatusBar style="light" />
      <Stack.Navigator
        initialRouteName="Settings"
        screenOptions={{
          headerStyle: { backgroundColor: '#1e1e1e' },
          headerTintColor: '#d4d4d4',
          headerTitleStyle: { fontWeight: '600' },
          contentStyle: { backgroundColor: '#1e1e1e' },
        }}
      >
        <Stack.Screen
          name="Settings"
          component={SettingsScreen}
          options={{ title: 'Connection' }}
        />
        <Stack.Screen
          name="Terminal"
          component={TerminalScreen}
          options={{
            title: 'Terminal',
            headerShown: false,
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
