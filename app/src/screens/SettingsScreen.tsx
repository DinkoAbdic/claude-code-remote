import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useConnectionStore } from '../store/useConnectionStore';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

type Props = {
  navigation: NativeStackNavigationProp<any>;
};

export function SettingsScreen({ navigation }: Props) {
  const { host, port, token, geminiApiKey, setHost, setPort, setToken, setGeminiApiKey } = useConnectionStore();
  const [testStatus, setTestStatus] = useState<string | null>(null);

  const testConnection = async () => {
    if (!host || !token) {
      Alert.alert('Error', 'Please enter host and token');
      return;
    }

    setTestStatus('Testing...');
    try {
      const ws = new WebSocket(
        `ws://${host}:${port}?token=${encodeURIComponent(token)}`
      );

      const timeout = setTimeout(() => {
        ws.close();
        setTestStatus('Timeout — could not connect');
      }, 5000);

      ws.onopen = () => {
        clearTimeout(timeout);
        setTestStatus('Connected successfully!');
        ws.close();
      };

      ws.onerror = () => {
        clearTimeout(timeout);
        setTestStatus('Connection failed');
      };
    } catch {
      setTestStatus('Connection failed');
    }
  };

  const connect = () => {
    if (!host || !token) {
      Alert.alert('Error', 'Please enter host and token');
      return;
    }
    navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Claude Code Remote</Text>
        <Text style={styles.subtitle}>Connect to your PC daemon</Text>

        <TouchableOpacity
          style={styles.scanButton}
          onPress={() => navigation.navigate('Scan')}
        >
          <Text style={styles.scanButtonText}>Scan QR Code</Text>
        </TouchableOpacity>

        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or enter manually</Text>
          <View style={styles.dividerLine} />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Host (Tailscale IP)</Text>
          <TextInput
            style={styles.input}
            value={host}
            onChangeText={setHost}
            placeholder="100.x.x.x"
            placeholderTextColor="#666"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Port</Text>
          <TextInput
            style={styles.input}
            value={String(port)}
            onChangeText={(v) => setPort(parseInt(v, 10) || 8485)}
            keyboardType="number-pad"
            placeholderTextColor="#666"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Token</Text>
          <TextInput
            style={[styles.input, styles.tokenInput]}
            value={token}
            onChangeText={setToken}
            placeholder="Paste token from daemon config"
            placeholderTextColor="#666"
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry={false}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Gemini API Key</Text>
          <TextInput
            style={[styles.input, styles.tokenInput]}
            value={geminiApiKey}
            onChangeText={setGeminiApiKey}
            placeholder="For voice transcription (optional)"
            placeholderTextColor="#666"
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry={false}
          />
        </View>

        <TouchableOpacity style={styles.testButton} onPress={testConnection}>
          <Text style={styles.testButtonText}>Test Connection</Text>
        </TouchableOpacity>

        {testStatus && (
          <Text
            style={[
              styles.testStatus,
              testStatus.includes('success') ? styles.testSuccess : styles.testFail,
            ]}
          >
            {testStatus}
          </Text>
        )}

        <TouchableOpacity style={styles.connectButton} onPress={connect}>
          <Text style={styles.connectButtonText}>Connect</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1e1e1e',
  },
  content: {
    padding: 24,
    paddingTop: 16,
    paddingBottom: 48,
  },
  title: {
    color: '#d4d4d4',
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 4,
  },
  subtitle: {
    color: '#808080',
    fontSize: 14,
    marginBottom: 24,
  },
  scanButton: {
    backgroundColor: '#da7756',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 20,
  },
  scanButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#3c3c3c',
  },
  dividerText: {
    color: '#808080',
    fontSize: 13,
    marginHorizontal: 12,
  },
  field: {
    marginBottom: 20,
  },
  label: {
    color: '#d4d4d4',
    fontSize: 14,
    marginBottom: 6,
    fontWeight: '600',
  },
  input: {
    backgroundColor: '#2d2d2d',
    color: '#d4d4d4',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#3c3c3c',
  },
  tokenInput: {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  testButton: {
    backgroundColor: '#3c3c3c',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  testButtonText: {
    color: '#d4d4d4',
    fontSize: 16,
    fontWeight: '600',
  },
  testStatus: {
    textAlign: 'center',
    marginTop: 12,
    fontSize: 14,
  },
  testSuccess: {
    color: '#4caf50',
  },
  testFail: {
    color: '#ff9800',
  },
  connectButton: {
    backgroundColor: '#da7756',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 24,
  },
  connectButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
});
