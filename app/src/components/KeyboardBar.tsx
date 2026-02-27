import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';

interface Props {
  onKey: (data: string) => void;
}

export function KeyboardBar({ onKey }: Props) {
  const [ctrlActive, setCtrlActive] = React.useState(false);
  const [altActive, setAltActive] = React.useState(false);

  const handleKey = (value: string) => {
    let data = value;

    if (ctrlActive && data.length === 1) {
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

  const handleModifier = (mod: 'ctrl' | 'alt') => {
    if (mod === 'ctrl') setCtrlActive((v) => !v);
    else setAltActive((v) => !v);
  };

  return (
    <View style={styles.container}>
      {/* Main keys */}
      <View style={styles.keysRow}>
        <TouchableOpacity style={styles.key} onPress={() => handleKey('\r')} activeOpacity={0.5}>
          <Text style={styles.keyText}>Enter</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.key} onPress={() => handleKey('\x1b')} activeOpacity={0.5}>
          <Text style={styles.keyText}>Esc</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.key} onPress={() => handleKey('\t')} activeOpacity={0.5}>
          <Text style={styles.keyText}>Tab</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.key, ctrlActive && styles.keyActive]}
          onPress={() => handleModifier('ctrl')}
          activeOpacity={0.5}
        >
          <Text style={[styles.keyText, ctrlActive && styles.keyTextActive]}>Ctrl</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.key, altActive && styles.keyActive]}
          onPress={() => handleModifier('alt')}
          activeOpacity={0.5}
        >
          <Text style={[styles.keyText, altActive && styles.keyTextActive]}>Alt</Text>
        </TouchableOpacity>
      </View>

      {/* D-pad */}
      <View style={styles.dpad}>
        {/* Top row: Up arrow */}
        <View style={styles.dpadRow}>
          <View style={styles.dpadSpacer} />
          <TouchableOpacity style={styles.dpadKey} onPress={() => handleKey('\x1b[A')} activeOpacity={0.5}>
            <Text style={styles.arrowText}>{'\u25B2'}</Text>
          </TouchableOpacity>
          <View style={styles.dpadSpacer} />
        </View>
        {/* Bottom row: Left, Down, Right */}
        <View style={styles.dpadRow}>
          <TouchableOpacity style={styles.dpadKey} onPress={() => handleKey('\x1b[D')} activeOpacity={0.5}>
            <Text style={styles.arrowText}>{'\u25C0'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.dpadKey} onPress={() => handleKey('\x1b[B')} activeOpacity={0.5}>
            <Text style={styles.arrowText}>{'\u25BC'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.dpadKey} onPress={() => handleKey('\x1b[C')} activeOpacity={0.5}>
            <Text style={styles.arrowText}>{'\u25B6'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#2d2d2d',
    paddingVertical: 6,
    paddingHorizontal: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },
  keysRow: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
  },
  key: {
    flex: 1,
    backgroundColor: '#3c3c3c',
    paddingVertical: 12,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyActive: {
    backgroundColor: '#da7756',
  },
  keyText: {
    color: '#d4d4d4',
    fontSize: 14,
    fontWeight: '600',
  },
  keyTextActive: {
    color: '#fff',
  },
  // D-pad cluster
  dpad: {
    marginLeft: 8,
    width: 108,
  },
  dpadRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 2,
  },
  dpadSpacer: {
    width: 34,
    height: 2,
  },
  dpadKey: {
    width: 34,
    height: 30,
    backgroundColor: '#3c3c3c',
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowText: {
    color: '#d4d4d4',
    fontSize: 12,
  },
});
