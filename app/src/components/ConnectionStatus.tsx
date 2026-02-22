import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ConnectionStatus as Status } from '../store/useTerminalStore';

const STATUS_CONFIG: Record<Status, { color: string; label: string }> = {
  connected: { color: '#4caf50', label: 'Connected' },
  connecting: { color: '#ff9800', label: 'Connecting...' },
  disconnected: { color: '#f44336', label: 'Disconnected' },
};

interface Props {
  status: Status;
}

export function ConnectionStatus({ status }: Props) {
  const { color, label } = STATUS_CONFIG[status];

  return (
    <View style={[styles.bar, { backgroundColor: color }]}>
      <Text style={styles.text}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    paddingVertical: 4,
    alignItems: 'center',
  },
  text: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
});
