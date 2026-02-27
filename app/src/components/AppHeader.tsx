import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Animated,
  Dimensions,
  PanResponder,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackHeaderProps } from '@react-navigation/native-stack';
import { useSessionStore, SessionInfo } from '../store/useSessionStore';
import { useConnectionStore } from '../store/useConnectionStore';
import { useTerminalStore, ConnectionStatus } from '../store/useTerminalStore';
import { fetchSessions, deleteSession } from '../ws/api';

export function AppHeader({ navigation, route, options, back }: NativeStackHeaderProps) {
  const insets = useSafeAreaInsets();
  const { sessions, activeSessionId, syncWithDaemon, removeSession, setActiveSession } =
    useSessionStore();
  const { host, port, token } = useConnectionStore();
  const { connectionStatus, hadSession } = useTerminalStore();

  const [sheetVisible, setSheetVisible] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    onConfirm: () => void;
  } | null>(null);

  const slideAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const screenName = route.name;
  const isTerminal = screenName === 'Terminal';
  const activeSession = isTerminal ? sessions.find((s) => s.id === activeSessionId) : null;
  const title = isTerminal && activeSession?.name
    ? activeSession.name
    : (options.title ?? route.name);
  const showHamburger = !!host && !!token && screenName !== 'Settings' && screenName !== 'Scan';
  const showGear = screenName === 'Home';
  const headerBg = screenName === 'Scan' ? '#000' : '#1e1e1e';

  // Connection status sub-bar (Terminal only)
  const isReconnecting = isTerminal && connectionStatus === 'connecting' && hadSession;

  let statusColor = '#f44336';
  let statusLabel = 'Disconnected';
  if (isReconnecting) {
    statusColor = '#e6a817';
    statusLabel = 'Reconnecting...';
  } else if (connectionStatus === 'connected') {
    statusColor = '#4caf50';
    statusLabel = 'Connected';
  } else if (connectionStatus === 'connecting') {
    statusColor = '#ff9800';
    statusLabel = 'Connecting...';
  }

  // Pulse animation for reconnecting
  useEffect(() => {
    if (isReconnecting) {
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.4, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        ])
      );
      animation.start();
      return () => animation.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isReconnecting, pulseAnim]);

  // Right drawer
  const openSheet = useCallback(async () => {
    if (host && token) {
      try {
        const daemonSessions = await fetchSessions(host, port, token);
        syncWithDaemon(daemonSessions);
      } catch {}
    }
    setSheetVisible(true);
    Animated.timing(slideAnim, {
      toValue: 1,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [host, port, token, slideAnim, syncWithDaemon]);

  const closeSheet = useCallback(() => {
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => setSheetVisible(false));
  }, [slideAnim]);

  const navigateToSession = useCallback(
    (sessionId: string) => {
      closeSheet();
      setActiveSession(sessionId);
      navigation.navigate('Terminal', { sessionId });
    },
    [closeSheet, setActiveSession, navigation]
  );

  const handleNewTerminal = useCallback(() => {
    closeSheet();
    navigation.navigate('Terminal', {});
  }, [closeSheet, navigation]);

  const handleDeleteSession = useCallback(
    (session: SessionInfo) => {
      setConfirmDialog({
        title: 'Close Session',
        message: `Close "${session.name || session.id.slice(0, 8)}"?`,
        confirmLabel: 'Close',
        onConfirm: async () => {
          try {
            await deleteSession(host, port, token, session.id);
          } catch {}
          removeSession(session.id);
        },
      });
    },
    [host, port, token, removeSession]
  );

  const screenWidth = Dimensions.get('window').width;
  const drawerWidth = screenWidth * 0.8;
  const drawerTranslateX = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [drawerWidth, 0],
  });

  return (
    <>
      <View style={[styles.headerContainer, { paddingTop: insets.top, backgroundColor: headerBg }]}>
        {/* Main header row */}
        <View style={styles.headerRow}>
          {/* Left: back button */}
          <View style={styles.leftGroup}>
            {back && (
              <TouchableOpacity style={styles.backButton} onPress={navigation.goBack}>
                <Text style={styles.backArrow}>{'\u2190'}</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Center: title */}
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>

          {/* Right: gear + hamburger */}
          <View style={styles.rightGroup}>
            {showGear && (
              <TouchableOpacity
                style={styles.iconButton}
                onPress={() => navigation.navigate('Settings')}
              >
                <Text style={styles.gearIcon}>{'\u2699'}</Text>
              </TouchableOpacity>
            )}
            {showHamburger && (
              <TouchableOpacity style={styles.iconButton} onPress={openSheet}>
                <Text style={styles.hamburgerIcon}>{'\u2630'}</Text>
                {sessions.length > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{sessions.length}</Text>
                  </View>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Connection status sub-bar (Terminal only) */}
        {isTerminal && (
          <Animated.View
            style={[
              styles.statusBar,
              { backgroundColor: statusColor, opacity: isReconnecting ? pulseAnim : 1 },
            ]}
          >
            <Text style={styles.statusText}>{statusLabel}</Text>
          </Animated.View>
        )}
      </View>

      {/* Right Drawer Modal */}
      <Modal visible={sheetVisible} transparent animationType="none" onRequestClose={closeSheet}>
        <View style={styles.backdrop}>
          <TouchableOpacity style={styles.backdropTouch} activeOpacity={1} onPress={closeSheet} />
          <Animated.View
            style={[styles.drawer, { width: drawerWidth, paddingBottom: Math.max(insets.bottom, 16), transform: [{ translateX: drawerTranslateX }] }]}
          >
            <Text style={styles.drawerTitle}>Sessions</Text>

            {sessions.length === 0 && (
              <Text style={styles.emptyText}>No active sessions</Text>
            )}

            <View style={styles.drawerContent}>
              {sessions.map((session) => (
                <SessionRow
                  key={session.id}
                  session={session}
                  isActive={session.id === activeSessionId}
                  onPress={() => navigateToSession(session.id)}
                  onDelete={() => handleDeleteSession(session)}
                />
              ))}
            </View>

            <TouchableOpacity style={styles.newButton} onPress={handleNewTerminal}>
              <Text style={styles.newButtonText}>+ New Terminal</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </Modal>

      {/* Confirm dialog */}
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
    </>
  );
}

function SessionRow({
  session,
  isActive,
  onPress,
  onDelete,
}: {
  session: SessionInfo;
  isActive: boolean;
  onPress: () => void;
  onDelete: () => void;
}) {
  const translateX = useRef(new Animated.Value(0)).current;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        Math.abs(gesture.dx) > 20 && Math.abs(gesture.dy) < 20,
      onPanResponderMove: (_, gesture) => {
        if (gesture.dx < 0) {
          translateX.setValue(Math.max(gesture.dx, -100));
        }
      },
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dx < -60) {
          Animated.spring(translateX, {
            toValue: -100,
            useNativeDriver: true,
          }).start(() => {
            onDelete();
            translateX.setValue(0);
          });
        } else {
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;

  return (
    <View style={styles.rowContainer}>
      <View style={styles.deleteAction}>
        <Text style={styles.deleteActionText}>Close</Text>
      </View>
      <Animated.View
        style={[styles.sessionRow, { transform: [{ translateX }] }]}
        {...panResponder.panHandlers}
      >
        <TouchableOpacity style={styles.sessionRowContent} onPress={onPress} activeOpacity={0.7}>
          <View style={[styles.dot, isActive ? styles.dotActive : styles.dotInactive]} />
          <View style={styles.sessionInfo}>
            <Text style={styles.sessionName} numberOfLines={1}>
              {session.name}
            </Text>
            <Text style={styles.sessionPath} numberOfLines={1}>
              {session.cwd}
            </Text>
          </View>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Header
  headerContainer: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#3c3c3c',
  },
  headerRow: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  leftGroup: {
    width: 52,
    alignItems: 'flex-start',
  },
  backButton: {
    padding: 8,
  },
  backArrow: {
    color: '#da7756',
    fontSize: 24,
    fontWeight: '700',
  },
  title: {
    flex: 1,
    color: '#d4d4d4',
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  rightGroup: {
    minWidth: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  iconButton: {
    padding: 8,
  },
  gearIcon: {
    color: '#808080',
    fontSize: 22,
  },
  hamburgerIcon: {
    color: '#d4d4d4',
    fontSize: 22,
  },
  badge: {
    position: 'absolute',
    top: 2,
    right: 0,
    backgroundColor: '#f44747',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },

  // Connection status sub-bar
  statusBar: {
    paddingVertical: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },

  // Right drawer
  backdrop: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  backdropTouch: {
    flex: 1,
  },
  drawer: {
    backgroundColor: '#252526',
    borderLeftWidth: 1,
    borderLeftColor: '#3c3c3c',
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  drawerTitle: {
    color: '#d4d4d4',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 14,
    marginTop: 32,
  },
  drawerContent: {
    flex: 1,
  },
  emptyText: {
    color: '#666',
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 20,
  },
  rowContainer: {
    marginBottom: 8,
    borderRadius: 10,
    overflow: 'hidden',
  },
  deleteAction: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 100,
    backgroundColor: '#f44747',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 10,
  },
  deleteActionText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  sessionRow: {
    backgroundColor: '#2d2d2d',
    borderRadius: 10,
  },
  sessionRowContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 12,
  },
  dotActive: {
    backgroundColor: '#4caf50',
  },
  dotInactive: {
    backgroundColor: '#666',
  },
  sessionInfo: {
    flex: 1,
  },
  sessionName: {
    color: '#d4d4d4',
    fontSize: 15,
    fontWeight: '600',
  },
  sessionPath: {
    color: '#808080',
    fontSize: 12,
    marginTop: 2,
  },
  newButton: {
    backgroundColor: '#da7756',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  newButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },

  // Confirm dialog
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
