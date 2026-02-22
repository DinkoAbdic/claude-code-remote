import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet, ScrollView } from 'react-native';

interface Props {
  onKey: (data: string) => void;
}

interface KeyDef {
  label: string;
  value: string;
  width?: number;
}

const KEYS: KeyDef[] = [
  { label: 'Esc', value: '\x1b' },
  { label: 'Tab', value: '\t' },
  { label: 'Ctrl', value: 'MODIFIER_CTRL' },
  { label: 'Alt', value: 'MODIFIER_ALT' },
  { label: '↑', value: '\x1b[A' },
  { label: '↓', value: '\x1b[B' },
  { label: '←', value: '\x1b[D' },
  { label: '→', value: '\x1b[C' },
  { label: '|', value: '|' },
  { label: '/', value: '/' },
  { label: '-', value: '-' },
  { label: '~', value: '~' },
];

export function KeyboardBar({ onKey }: Props) {
  const [ctrlActive, setCtrlActive] = React.useState(false);
  const [altActive, setAltActive] = React.useState(false);

  const handlePress = (key: KeyDef) => {
    if (key.value === 'MODIFIER_CTRL') {
      setCtrlActive((v) => !v);
      return;
    }
    if (key.value === 'MODIFIER_ALT') {
      setAltActive((v) => !v);
      return;
    }

    let data = key.value;

    if (ctrlActive && data.length === 1) {
      // Ctrl+<letter> = char code 1-26
      const code = data.toLowerCase().charCodeAt(0) - 96;
      if (code >= 1 && code <= 26) {
        data = String.fromCharCode(code);
      }
      setCtrlActive(false);
    }

    if (altActive) {
      data = '\x1b' + data;
      setAltActive(false);
    }

    onKey(data);
  };

  return (
    <View style={styles.container}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always">
        {KEYS.map((key) => {
          const isActive =
            (key.value === 'MODIFIER_CTRL' && ctrlActive) ||
            (key.value === 'MODIFIER_ALT' && altActive);

          return (
            <TouchableOpacity
              key={key.label}
              style={[styles.key, isActive && styles.keyActive]}
              onPress={() => handlePress(key)}
              activeOpacity={0.6}
            >
              <Text style={[styles.keyText, isActive && styles.keyTextActive]}>
                {key.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#2d2d2d',
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  key: {
    backgroundColor: '#3c3c3c',
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginHorizontal: 3,
    borderRadius: 4,
    minWidth: 40,
    alignItems: 'center',
  },
  keyActive: {
    backgroundColor: '#569cd6',
  },
  keyText: {
    color: '#d4d4d4',
    fontSize: 13,
    fontWeight: '600',
  },
  keyTextActive: {
    color: '#fff',
  },
});
