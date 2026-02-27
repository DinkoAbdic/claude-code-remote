import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  TextInput,
  Modal,
  Switch,
  RefreshControl,
} from 'react-native';
import { useConnectionStore, Bookmark } from '../store/useConnectionStore';
import { useSessionStore } from '../store/useSessionStore';
import { fetchSessions, fetchExternalSessions, deleteSession, ExternalSession } from '../ws/api';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useFocusEffect, RouteProp } from '@react-navigation/native';

type Props = {
  navigation: NativeStackNavigationProp<any>;
  route: RouteProp<any>;
};

type DaemonStatus = {
  reachable: boolean;
  tailscaleIp: string | null;
  sessions: number;
  defaultCwd: string | null;
} | null;

export function HomeScreen({ navigation, route }: Props) {
  const { host, port, token, bookmarks, addBookmark, removeBookmark, setStartingDirectory, autoLaunchClaude, setAutoLaunchClaude } =
    useConnectionStore();
  const { sessions: activeSessions, syncWithDaemon, removeSession: removeLocalSession } = useSessionStore();
  const [status, setStatus] = useState<DaemonStatus>(null);
  const [checking, setChecking] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPath, setNewPath] = useState('');
  const [externalSessions, setExternalSessions] = useState<ExternalSession[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    onConfirm: () => void;
  } | null>(null);

  // Handle return from BrowseScreen
  useEffect(() => {
    const selectedPath = route.params?.selectedPath;
    const selectedName = route.params?.selectedName;
    if (selectedPath) {
      setNewPath(selectedPath);
      if (selectedName && !newName) setNewName(selectedName);
      setShowAddForm(true);
      // Clear params so it doesn't re-trigger
      navigation.setParams({ selectedPath: undefined, selectedName: undefined });
    }
  }, [route.params?.selectedPath]);

  const checkStatus = useCallback(async () => {
    setChecking(true);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    try {
      const res = await fetch(`http://${host}:${port}/api/status?token=${encodeURIComponent(token)}`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const data = await res.json();
      setStatus({
        reachable: true,
        tailscaleIp: data.tailscale?.ip || null,
        sessions: data.sessions || 0,
        defaultCwd: data.defaultCwd || null,
      });
    } catch {
      clearTimeout(timeout);
      setStatus({ reachable: false, tailscaleIp: null, sessions: 0, defaultCwd: null });
    }
    setChecking(false);
  }, [host, port, token]);

  const syncSessions = useCallback(async () => {
    if (host && token) {
      try {
        const [daemonSessions, external] = await Promise.all([
          fetchSessions(host, port, token),
          fetchExternalSessions(host, port, token).catch(() => [] as ExternalSession[]),
        ]);
        syncWithDaemon(daemonSessions);
        setExternalSessions(external);
      } catch {
        // ignore — will show local data
      }
    }
  }, [host, port, token, syncWithDaemon]);

  useFocusEffect(
    useCallback(() => {
      checkStatus();
      syncSessions();
      // Poll every 10s while screen is focused
      pollRef.current = setInterval(() => {
        syncSessions();
      }, 10000);
      return () => {
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      };
    }, [checkStatus, syncSessions])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([checkStatus(), syncSessions()]);
    setRefreshing(false);
  }, [checkStatus, syncSessions]);

  const openTerminal = (cwd?: string) => {
    setStartingDirectory(cwd || '');
    navigation.navigate('Terminal', cwd ? { cwd } : undefined);
  };

  const openSession = (sessionId: string) => {
    navigation.navigate('Terminal', { sessionId });
  };

  const confirmCloseSession = (session: { id: string; name: string }) => {
    setConfirmDialog({
      title: 'Close Session',
      message: `Close "${session.name || session.id.slice(0, 8)}"?`,
      confirmLabel: 'Close',
      onConfirm: async () => {
        try {
          await deleteSession(host, port, token, session.id);
        } catch {}
        removeLocalSession(session.id);
      },
    });
  };

  const handleAddBookmark = () => {
    const trimmedPath = newPath.trim();
    const trimmedName = newName.trim();
    if (!trimmedPath) {
      Alert.alert('Error', 'Path is required');
      return;
    }
    addBookmark({
      name: trimmedName || trimmedPath.split(/[\\/]/).pop() || trimmedPath,
      path: trimmedPath,
    });
    setNewName('');
    setNewPath('');
    setShowAddForm(false);
  };

  const confirmRemove = (bookmark: Bookmark) => {
    setConfirmDialog({
      title: 'Remove Bookmark',
      message: `Remove "${bookmark.name}"?`,
      confirmLabel: 'Remove',
      onConfirm: () => removeBookmark(bookmark.path),
    });
  };

  const statusColor = checking ? '#808080' : status?.reachable ? '#4caf50' : '#f44747';
  const statusText = checking
    ? 'Checking...'
    : status?.reachable
      ? `Connected — ${status.tailscaleIp || host}`
      : 'Daemon unreachable';

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor="#569cd6"
          colors={['#569cd6']}
          progressBackgroundColor="#252526"
        />
      }
    >
      {/* Status card */}
      <View style={styles.statusCard}>
        <View style={styles.statusRow}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.statusText, { color: statusColor }]}>{statusText}</Text>
        </View>
        {status?.reachable && activeSessions.length > 0 && (
          <Text style={styles.sessionCount}>
            {activeSessions.length} active session{activeSessions.length !== 1 ? 's' : ''}
          </Text>
        )}
      </View>

      {/* Auto-launch Claude toggle */}
      <View style={styles.toggleRow}>
        <View>
          <Text style={styles.toggleLabel}>Auto-launch Claude</Text>
          <Text style={styles.toggleHint}>Run `claude` when opening new terminals</Text>
        </View>
        <Switch
          value={autoLaunchClaude}
          onValueChange={setAutoLaunchClaude}
          trackColor={{ false: '#3c3c3c', true: '#da7756' }}
          thumbColor={autoLaunchClaude ? '#fff' : '#808080'}
        />
      </View>

      {/* Detected Sessions (external Claude Code) */}
      {externalSessions.length > 0 && (
        <>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Detected Sessions</Text>
          </View>
          {externalSessions.map((ext) => (
            <TouchableOpacity
              key={ext.pid}
              style={styles.externalSessionCard}
              onPress={() => {
                if (ext.cwd) {
                  navigation.navigate('Terminal', { cwd: ext.cwd, command: 'claude --continue' });
                } else {
                  Alert.alert(
                    'Unknown Directory',
                    'Could not detect the working directory for this session. Browse to the project directory manually.',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Browse', onPress: () => navigation.navigate('Browse') },
                    ]
                  );
                }
              }}
            >
              <View style={styles.externalSessionRow}>
                <View style={styles.externalDot} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.externalSessionName}>
                    {ext.cwd ? ext.cwd.split(/[\\/]/).pop() : ext.projectName}
                  </Text>
                  <Text style={styles.externalSessionPath} numberOfLines={1}>
                    {ext.cwd || 'CWD unknown'}
                  </Text>
                </View>
                <Text style={styles.takeOverLabel}>Take Over</Text>
              </View>
            </TouchableOpacity>
          ))}
          <Text style={styles.hintText}>Tap to resume with `claude --continue`</Text>
          <View style={{ height: 16 }} />
        </>
      )}

      {/* Active Sessions */}
      {activeSessions.length > 0 && (
        <>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Active Sessions</Text>
          </View>
          {activeSessions.map((session) => (
            <TouchableOpacity
              key={session.id}
              style={styles.activeSessionCard}
              onPress={() => openSession(session.id)}
              onLongPress={() => confirmCloseSession(session)}
            >
              <View style={styles.activeSessionRow}>
                <View style={[styles.statusDot, { backgroundColor: session.hasClient ? '#4caf50' : '#666' }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.activeSessionName}>{session.name || session.cwd}</Text>
                  <Text style={styles.activeSessionPath} numberOfLines={1}>{session.cwd}</Text>
                </View>
              </View>
            </TouchableOpacity>
          ))}
          <Text style={styles.hintText}>Long press a session to close it</Text>
          <View style={{ height: 16 }} />
        </>
      )}

      {/* New Terminal button */}
      <TouchableOpacity
        style={[styles.newTerminalButton, !status?.reachable && styles.buttonDisabled]}
        onPress={() => openTerminal()}
        disabled={!status?.reachable}
      >
        <Text style={styles.newTerminalText}>New Terminal</Text>
        <Text style={styles.newTerminalSub} numberOfLines={1}>
          {status?.defaultCwd || 'Default directory'}
        </Text>
      </TouchableOpacity>

      {/* Bookmarks section */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Projects</Text>
        <TouchableOpacity onPress={() => setShowAddForm(!showAddForm)}>
          <Text style={styles.addButton}>{showAddForm ? 'Cancel' : '+ Add'}</Text>
        </TouchableOpacity>
      </View>

      {showAddForm && (
        <View style={styles.addForm}>
          <TextInput
            style={styles.addInput}
            value={newName}
            onChangeText={setNewName}
            placeholder="Name (optional)"
            placeholderTextColor="#666"
            autoCapitalize="none"
          />
          <TouchableOpacity
            style={styles.browseButton}
            onPress={() => navigation.navigate('Browse')}
          >
            <Text style={styles.browseButtonText}>
              {newPath ? 'Change Directory...' : 'Browse...'}
            </Text>
          </TouchableOpacity>
          {newPath ? (
            <Text style={styles.selectedPath} numberOfLines={2}>{newPath}</Text>
          ) : null}
          <TouchableOpacity
            style={[styles.addConfirmButton, !newPath && styles.buttonDisabled]}
            onPress={handleAddBookmark}
            disabled={!newPath}
          >
            <Text style={styles.addConfirmText}>Add Project</Text>
          </TouchableOpacity>
        </View>
      )}

      {bookmarks.length === 0 && !showAddForm && (
        <Text style={styles.emptyText}>
          No projects bookmarked yet. Tap "+ Add" to save a directory for quick access.
        </Text>
      )}

      {bookmarks.map((bookmark) => (
        <TouchableOpacity
          key={bookmark.path}
          style={[styles.bookmarkCard, !status?.reachable && styles.buttonDisabled]}
          onPress={() => openTerminal(bookmark.path)}
          onLongPress={() => confirmRemove(bookmark)}
          disabled={!status?.reachable}
        >
          <Text style={styles.bookmarkName}>{bookmark.name}</Text>
          <Text style={styles.bookmarkPath} numberOfLines={1}>{bookmark.path}</Text>
        </TouchableOpacity>
      ))}

      {bookmarks.length > 0 && (
        <Text style={styles.hintText}>Long press a project to remove it</Text>
      )}

      {/* Custom dark confirm dialog */}
      <Modal
        visible={confirmDialog !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmDialog(null)}
      >
        <View style={styles.dialogBackdrop}>
          <View style={styles.dialogCard}>
            <Text style={styles.dialogTitle}>{confirmDialog?.title}</Text>
            <Text style={styles.dialogMessage}>{confirmDialog?.message}</Text>
            <View style={styles.dialogButtons}>
              <TouchableOpacity
                style={styles.dialogCancelButton}
                onPress={() => setConfirmDialog(null)}
              >
                <Text style={styles.dialogCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.dialogConfirmButton}
                onPress={() => {
                  confirmDialog?.onConfirm();
                  setConfirmDialog(null);
                }}
              >
                <Text style={styles.dialogConfirmText}>{confirmDialog?.confirmLabel}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1e1e1e',
  },
  content: {
    padding: 20,
    paddingTop: 16,
  },
  title: {
    color: '#d4d4d4',
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 16,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#252526',
    borderRadius: 10,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#3c3c3c',
  },
  toggleLabel: {
    color: '#d4d4d4',
    fontSize: 15,
    fontWeight: '600',
  },
  toggleHint: {
    color: '#808080',
    fontSize: 12,
    marginTop: 2,
  },
  statusCard: {
    backgroundColor: '#252526',
    borderRadius: 10,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#3c3c3c',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 10,
  },
  statusText: {
    fontSize: 15,
    fontWeight: '600',
  },
  sessionCount: {
    color: '#808080',
    fontSize: 13,
    marginTop: 6,
    marginLeft: 20,
  },
  newTerminalButton: {
    backgroundColor: '#da7756',
    borderRadius: 10,
    paddingVertical: 16,
    paddingHorizontal: 18,
    marginBottom: 24,
  },
  newTerminalText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  newTerminalSub: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    marginTop: 2,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    color: '#d4d4d4',
    fontSize: 18,
    fontWeight: '600',
  },
  addButton: {
    color: '#da7756',
    fontSize: 15,
    fontWeight: '600',
  },
  addForm: {
    backgroundColor: '#252526',
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#3c3c3c',
  },
  addInput: {
    backgroundColor: '#2d2d2d',
    color: '#d4d4d4',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#3c3c3c',
    marginBottom: 10,
  },
  browseButton: {
    backgroundColor: '#2d2d2d',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#da7756',
    marginBottom: 10,
    alignItems: 'center',
  },
  browseButtonText: {
    color: '#da7756',
    fontSize: 15,
    fontWeight: '600',
  },
  selectedPath: {
    color: '#808080',
    fontSize: 13,
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  addConfirmButton: {
    backgroundColor: '#da7756',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  addConfirmText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  emptyText: {
    color: '#666',
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 20,
    lineHeight: 20,
  },
  bookmarkCard: {
    backgroundColor: '#252526',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#3c3c3c',
  },
  bookmarkName: {
    color: '#d4d4d4',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 3,
  },
  bookmarkPath: {
    color: '#808080',
    fontSize: 13,
  },
  hintText: {
    color: '#555',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
  },
  externalSessionCard: {
    backgroundColor: '#252526',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#2a4a6b',
  },
  externalSessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  externalDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#569cd6',
    marginRight: 10,
  },
  externalSessionName: {
    color: '#d4d4d4',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  externalSessionPath: {
    color: '#808080',
    fontSize: 13,
  },
  takeOverLabel: {
    color: '#569cd6',
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 8,
  },
  activeSessionCard: {
    backgroundColor: '#252526',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#3c3c3c',
  },
  activeSessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  activeSessionName: {
    color: '#d4d4d4',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  activeSessionPath: {
    color: '#808080',
    fontSize: 13,
  },
  dialogBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  dialogCard: {
    backgroundColor: '#252526',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 340,
    borderWidth: 1,
    borderColor: '#3c3c3c',
  },
  dialogTitle: {
    color: '#d4d4d4',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  dialogMessage: {
    color: '#999',
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 24,
  },
  dialogButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  dialogCancelButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3c3c3c',
  },
  dialogCancelText: {
    color: '#808080',
    fontSize: 15,
    fontWeight: '600',
  },
  dialogConfirmButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: '#f44747',
  },
  dialogConfirmText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});
