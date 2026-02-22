import React, { useRef, useEffect, useCallback } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { XTermView, XTermViewRef } from '../components/XTermView';
import { ConnectionStatus } from '../components/ConnectionStatus';
import { KeyboardBar } from '../components/KeyboardBar';
import { useTerminalStore } from '../store/useTerminalStore';
import { useConnectionStore } from '../store/useConnectionStore';
import { wsClient } from '../ws/WebSocketClient';
import { MessageType, ServerMessage } from '../ws/protocol';

export function TerminalScreen() {
  const xtermRef = useRef<XTermViewRef>(null);
  const { sessionId, connectionStatus, setSessionId, setConnectionStatus, setDimensions } =
    useTerminalStore();
  const { host, port, token } = useConnectionStore();

  const handleMessage = useCallback(
    (msg: ServerMessage) => {
      switch (msg.type) {
        case MessageType.SESSION_CREATED:
          setSessionId(msg.sessionId);
          setDimensions(msg.cols, msg.rows);
          break;
        case MessageType.TERMINAL_OUTPUT:
          xtermRef.current?.write(msg.data);
          break;
        case MessageType.ERROR:
          console.warn('Server error:', msg.message);
          break;
      }
    },
    [setSessionId, setDimensions]
  );

  useEffect(() => {
    wsClient.setHandlers(handleMessage, setConnectionStatus);
    if (host && token) {
      wsClient.connect(host, port, token);
    }
    return () => {
      wsClient.disconnect();
      setSessionId(null);
      setConnectionStatus('disconnected');
    };
  }, [host, port, token, handleMessage, setConnectionStatus, setSessionId]);

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

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ConnectionStatus status={connectionStatus} />
      <XTermView ref={xtermRef} onInput={handleInput} onResize={handleResize} />
      <KeyboardBar onKey={handleInput} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1e1e1e',
  },
});
