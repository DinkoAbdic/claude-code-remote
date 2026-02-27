import React, { useRef, useEffect, useCallback, useState } from 'react';
import { StyleSheet, AppState, PanResponder, View, Animated, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Device from 'expo-device';
import * as Clipboard from 'expo-clipboard';
import { XTermView, XTermViewRef } from '../components/XTermView';
import { QuickActions } from '../components/QuickActions';
import { KeyboardBar } from '../components/KeyboardBar';
import { VoiceInput } from '../components/VoiceInput';
import { useTerminalStore } from '../store/useTerminalStore';
import { useConnectionStore } from '../store/useConnectionStore';
import { useSessionStore } from '../store/useSessionStore';
import { wsClient } from '../ws/WebSocketClient';
import { MessageType, ServerMessage } from '../ws/protocol';
import { notifyClaudeDone } from '../notifications';
import { startBackgroundService, stopBackgroundService } from '../background';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../../App';

const DEBUG_TERMINAL_FLOW = true;

function debugTerminalFlow(...args: unknown[]) {
  if (!DEBUG_TERMINAL_FLOW) return;
  console.log('[terminal-flow]', ...args);
}

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Terminal'>;
  route: RouteProp<RootStackParamList, 'Terminal'>;
};

const EDGE_THRESHOLD = 50; // px from edge to start swipe
const SWIPE_MIN_DX = 50; // minimum horizontal distance for swipe

export function TerminalScreen({ navigation, route }: Props) {
  const xtermRef = useRef<XTermViewRef>(null);
  const outputLogCountRef = useRef(0);
  const { sessionId, connectionStatus, setSessionId, setConnectionStatus, setHadSession, setDimensions } =
    useTerminalStore();
  const { host, port, token, startingDirectory, fontSize, autoLaunchClaude } = useConnectionStore();
  const { sessions, addSession, removeSession, setActiveSession } = useSessionStore();
  const [voiceVisible, setVoiceVisible] = useState(false);
  const sessionIdRef = useRef<string | null>(null);
  const isNewSessionRef = useRef(!route.params?.sessionId);

  const appIsActive = useRef(AppState.currentState === 'active');

  const routeSessionId = route.params?.sessionId;
  const routeCwd = route.params?.cwd;
  const deviceName = Device.deviceName ?? Device.modelName ?? 'Android';

  // Keep ref in sync with state
  sessionIdRef.current = sessionId;

  const handleMessage = useCallback(
    (msg: ServerMessage) => {
      switch (msg.type) {
        case MessageType.SESSION_CREATED: {
          debugTerminalFlow('session.created', { sessionId: msg.sessionId, cols: msg.cols, rows: msg.rows });
          const prevId = sessionIdRef.current;
          if (prevId !== null && msg.sessionId !== prevId) {
            xtermRef.current?.reset();
          }
          setSessionId(msg.sessionId);
          wsClient.sessionId = msg.sessionId;
          setDimensions(msg.cols, msg.rows);
          setActiveSession(msg.sessionId);
          setHadSession(true);
          // Register session in store
          addSession({
            id: msg.sessionId,
            cwd: msg.cwd || '',
            name: msg.name || 'Terminal',
            createdAt: msg.createdAt || new Date().toISOString(),
            lastConnectedAt: new Date().toISOString(),
          });
          // Auto-launch: custom command takes priority, then auto-launch setting
          const launchCommand = route.params?.command;
          if (isNewSessionRef.current && launchCommand) {
            setTimeout(() => wsClient.sendInput(msg.sessionId, launchCommand + '\r'), 600);
          } else if (isNewSessionRef.current && autoLaunchClaude) {
            setTimeout(() => wsClient.sendInput(msg.sessionId, 'claude\r'), 600);
          }
          isNewSessionRef.current = false;
          break;
        }
        case MessageType.TERMINAL_OUTPUT:
          outputLogCountRef.current += 1;
          if (outputLogCountRef.current <= 10 || outputLogCountRef.current % 25 === 0) {
            debugTerminalFlow('terminal.output', {
              sessionId: msg.sessionId,
              bytes: msg.data.length,
              chunk: outputLogCountRef.current,
            });
          }
          xtermRef.current?.write(msg.data);
          break;
        case MessageType.SESSION_ENDED: {
          removeSession(msg.sessionId);
          // Auto-switch to next session or go home
          const remaining = useSessionStore.getState().sessions;
          if (remaining.length > 0) {
            const next = remaining[0];
            xtermRef.current?.reset();
            wsClient.switchSession(next.id);
            setActiveSession(next.id);
          } else {
            navigation.navigate('Home');
          }
          break;
        }
        case MessageType.SESSION_IDLE:
          if (!appIsActive.current) {
            const session = useSessionStore.getState().sessions.find((s) => s.id === msg.sessionId);
            notifyClaudeDone(session?.name);
          }
          break;
        case MessageType.ERROR:
          console.warn('Server error:', msg.message);
          break;
      }
    },
    [setSessionId, setDimensions, addSession, removeSession, setActiveSession, navigation, autoLaunchClaude]
  );

  useEffect(() => {
    wsClient.setHandlers(handleMessage, setConnectionStatus);
    if (host && token) {
      if (routeSessionId) {
        // Reconnect to existing session
        wsClient.sessionId = routeSessionId;
        wsClient.connect(host, port, token, undefined, undefined, deviceName);
      } else {
        // New session
        wsClient.sessionId = null;
        const cwd = routeCwd || startingDirectory || undefined;
        wsClient.connect(host, port, token, cwd, undefined, deviceName);
      }
    }
    return () => {
      // Don't destroy the session — keep it alive on the daemon so
      // the user can return to it from the home screen / sidebar.
      wsClient.disconnect();
      setConnectionStatus('disconnected');
      stopBackgroundService();
    };
  }, [host, port, token, routeSessionId, routeCwd, startingDirectory, handleMessage, setConnectionStatus]);

  // Background service: keep WS alive when app is backgrounded
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      const wasActive = appIsActive.current;
      appIsActive.current = nextState === 'active';

      if (nextState === 'active' && !wasActive) {
        // Returned to foreground — stop background service
        stopBackgroundService();
        // Reconnect only if WS is actually dead and no retry is pending
        if (!wsClient.isConnected && !wsClient.isConnecting && host && token) {
          wsClient.connect(host, port, token, undefined, undefined, deviceName);
        }
      } else if (nextState === 'background' && wasActive) {
        // Going to background — start foreground service to keep JS alive
        startBackgroundService();
      }
    });
    return () => sub.remove();
  }, [host, port, token]);

  const handleInput = useCallback(
    (data: string) => {
      if (sessionId) {
        wsClient.sendInput(sessionId, data);
      }
    },
    [sessionId]
  );

  const handleResize = useCallback(
    (cols: number, rows: number) => {
      setDimensions(cols, rows);
      if (sessionId) {
        wsClient.sendResize(sessionId, cols, rows);
      }
    },
    [sessionId, setDimensions]
  );

  const handleSelection = useCallback((text: string) => {
    if (text) {
      Clipboard.setStringAsync(text);
    }
  }, []);

  const handleCopy = useCallback(() => {
    xtermRef.current?.getSelection();
  }, []);

  const handlePaste = useCallback(async () => {
    const text = await Clipboard.getStringAsync();
    if (text) {
      xtermRef.current?.paste(text);
    }
  }, []);

  // Swipe animation for session switching
  const slideAnim = useRef(new Animated.Value(0)).current;
  const screenWidth = Dimensions.get('window').width;
  const isSwitchingRef = useRef(false);

  const switchSession = useCallback((direction: 'left' | 'right') => {
    const { sessions: currentSessions, activeSessionId: activeId } = useSessionStore.getState();
    if (currentSessions.length < 2) return false;
    const currentIndex = currentSessions.findIndex((s) => s.id === activeId);
    if (currentIndex === -1) return false;
    const nextIndex = direction === 'right'
      ? (currentIndex - 1 + currentSessions.length) % currentSessions.length
      : (currentIndex + 1) % currentSessions.length;
    const next = currentSessions[nextIndex];
    xtermRef.current?.reset();
    wsClient.switchSession(next.id);
    setActiveSession(next.id);
    setSessionId(next.id);
    return true;
  }, [setActiveSession, setSessionId]);

  const makeEdgePanResponder = useCallback((side: 'left' | 'right') =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gesture) =>
        Math.abs(gesture.dx) > 10 && Math.abs(gesture.dy) < 40,
      onPanResponderMove: (_, gesture) => {
        if (!isSwitchingRef.current) {
          slideAnim.setValue(gesture.dx);
        }
      },
      onPanResponderRelease: (_, gesture) => {
        if (isSwitchingRef.current) return;
        if (Math.abs(gesture.dx) < SWIPE_MIN_DX) {
          // Snap back
          Animated.spring(slideAnim, {
            toValue: 0,
            useNativeDriver: true,
            tension: 120,
            friction: 14,
          }).start();
          return;
        }
        const direction = gesture.dx > 0 ? 'right' : 'left';
        const exitTarget = gesture.dx > 0 ? screenWidth : -screenWidth;
        isSwitchingRef.current = true;

        // Slide current view off-screen
        Animated.timing(slideAnim, {
          toValue: exitTarget,
          duration: 150,
          useNativeDriver: true,
        }).start(() => {
          // Switch session data
          const switched = switchSession(direction);
          if (!switched) {
            slideAnim.setValue(0);
            isSwitchingRef.current = false;
            return;
          }
          // Position new content on opposite side
          slideAnim.setValue(-exitTarget);
          // Slide new content in
          Animated.timing(slideAnim, {
            toValue: 0,
            duration: 150,
            useNativeDriver: true,
          }).start(() => {
            isSwitchingRef.current = false;
          });
        });
      },
    }),
  [switchSession, slideAnim, screenWidth]);

  const leftEdgePan = useRef(makeEdgePanResponder('left')).current;
  const rightEdgePan = useRef(makeEdgePanResponder('right')).current;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Animated.View style={[styles.terminalWrapper, { transform: [{ translateX: slideAnim }] }]}>
        <XTermView ref={xtermRef} onInput={handleInput} onResize={handleResize} onSelection={handleSelection} fontSize={fontSize} />
        {/* Invisible edge overlays for swipe session switching */}
        <View style={styles.leftEdge} {...leftEdgePan.panHandlers} />
        <View style={styles.rightEdge} {...rightEdgePan.panHandlers} />
      </Animated.View>
      <QuickActions
        onKey={handleInput}
        onMicPress={() => setVoiceVisible(true)}
        micActive={voiceVisible}
        onCopy={handleCopy}
        onPaste={handlePaste}
      />
      <VoiceInput
        visible={voiceVisible}
        onSend={(text) => {
          handleInput(text);
          setTimeout(() => handleInput('\r'), 100);
        }}
        onClose={() => setVoiceVisible(false)}
      />
      <KeyboardBar onKey={handleInput} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1e1e1e',
  },
  terminalWrapper: {
    flex: 1,
  },
  leftEdge: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: EDGE_THRESHOLD,
  },
  rightEdge: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: EDGE_THRESHOLD,
  },
});
