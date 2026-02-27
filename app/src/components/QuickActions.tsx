import React, { useState } from 'react';
import {
  View,
  TouchableOpacity,
  Text,
  StyleSheet,
  Modal,
  FlatList,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface Props {
  onKey: (data: string) => void;
  onMicPress?: () => void;
  micActive?: boolean;
  onCopy?: () => void;
  onPaste?: () => void;
}

interface SlashCommand {
  command: string;
  description: string;
}

const SLASH_COMMANDS: SlashCommand[] = [
  { command: 'bug', description: 'Report bugs in Claude Code' },
  { command: 'clear', description: 'Clear conversation history' },
  { command: 'compact', description: 'Compact and summarize conversation' },
  { command: 'config', description: 'View or modify configuration' },
  { command: 'cost', description: 'Show token usage and cost' },
  { command: 'doctor', description: 'Check Claude Code installation health' },
  { command: 'help', description: 'Get help with Claude Code' },
  { command: 'init', description: 'Initialize a CLAUDE.md project file' },
  { command: 'login', description: 'Switch Anthropic accounts' },
  { command: 'logout', description: 'Sign out from your account' },
  { command: 'memory', description: 'Edit CLAUDE.md memory files' },
  { command: 'model', description: 'Switch the AI model' },
  { command: 'permissions', description: 'View and manage tool permissions' },
  { command: 'review', description: 'Review a pull request' },
  { command: 'status', description: 'View account and session status' },
  { command: 'terminal-setup', description: 'Install shell integration' },
  { command: 'vim', description: 'Toggle vim editing mode' },
];

function SlashCommandsModal({
  visible,
  onClose,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (cmd: string) => void;
}) {
  const insets = useSafeAreaInsets();

  const renderItem = ({ item }: { item: SlashCommand }) => (
    <TouchableOpacity
      style={styles.cmdRow}
      onPress={() => onSelect(item.command)}
      activeOpacity={0.6}
    >
      <Text style={styles.cmdName}>/{item.command}</Text>
      <Text style={styles.cmdDesc}>{item.description}</Text>
    </TouchableOpacity>
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.modalContainer, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Commands</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.6}>
            <Text style={styles.closeBtnText}>{'\u2715'}</Text>
          </TouchableOpacity>
        </View>
        <FlatList
          data={SLASH_COMMANDS}
          renderItem={renderItem}
          keyExtractor={(item) => item.command}
          contentContainerStyle={styles.cmdList}
          keyboardShouldPersistTaps="always"
        />
      </View>
    </Modal>
  );
}

export function QuickActions({ onKey, onMicPress, micActive, onCopy, onPaste }: Props) {
  const [showCommands, setShowCommands] = useState(false);

  const handleSelectCommand = (cmd: string) => {
    setShowCommands(false);
    onKey(`/${cmd}\r`);
  };

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        {/* Mic button — left side */}
        <TouchableOpacity
          style={[styles.micBtn, micActive && styles.micBtnActive]}
          onPress={onMicPress}
          activeOpacity={0.6}
        >
          <Text style={styles.micIcon}>{'\uD83C\uDF99'}</Text>
        </TouchableOpacity>

        {/* Ctrl+C */}
        <TouchableOpacity
          style={styles.pill}
          onPress={() => onKey('\x03')}
          activeOpacity={0.6}
        >
          <Text style={styles.pillText}>Ctrl+C</Text>
        </TouchableOpacity>

        {/* Copy */}
        <TouchableOpacity
          style={[styles.pill, styles.pillGap]}
          onPress={onCopy}
          activeOpacity={0.6}
        >
          <Text style={styles.pillText}>Copy</Text>
        </TouchableOpacity>

        {/* Paste */}
        <TouchableOpacity
          style={[styles.pill, styles.pillGap]}
          onPress={onPaste}
          activeOpacity={0.6}
        >
          <Text style={styles.pillText}>Paste</Text>
        </TouchableOpacity>

        <View style={styles.spacer} />

        {/* Slash commands — right side */}
        <TouchableOpacity
          style={styles.slashBtn}
          onPress={() => setShowCommands(true)}
          activeOpacity={0.6}
        >
          <Text style={styles.slashBtnText}>/</Text>
        </TouchableOpacity>
      </View>
      <SlashCommandsModal
        visible={showCommands}
        onClose={() => setShowCommands(false)}
        onSelect={handleSelectCommand}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#252525',
    paddingVertical: 5,
    paddingHorizontal: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  spacer: {
    flex: 1,
  },
  micBtn: {
    backgroundColor: '#5c2020',
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  micBtnActive: {
    backgroundColor: '#d32f2f',
  },
  micIcon: {
    fontSize: 16,
  },
  pill: {
    backgroundColor: '#3c3c3c',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
  },
  pillGap: {
    marginLeft: 6,
  },
  pillText: {
    color: '#d4d4d4',
    fontSize: 13,
    fontWeight: '600',
  },
  slashBtn: {
    backgroundColor: '#da7756',
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slashBtnText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
  // Modal styles
  modalContainer: {
    flex: 1,
    backgroundColor: '#1e1e1e',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  modalTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  closeBtn: {
    padding: 8,
  },
  closeBtnText: {
    color: '#999',
    fontSize: 20,
    fontWeight: '600',
  },
  cmdList: {
    paddingVertical: 8,
  },
  cmdRow: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#333',
  },
  cmdName: {
    color: '#da7756',
    fontSize: 16,
    fontFamily: 'monospace',
    fontWeight: '600',
    marginBottom: 4,
  },
  cmdDesc: {
    color: '#999',
    fontSize: 13,
  },
});
