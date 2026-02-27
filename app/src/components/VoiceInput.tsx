import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  Text,
  StyleSheet,
  Animated,
  Alert,
  ActivityIndicator,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Audio } from 'expo-av';
import { File } from 'expo-file-system';
import { transcribeAudio } from '../ws/gemini';
import { useConnectionStore } from '../store/useConnectionStore';

type Phase = 'recording' | 'transcribing' | 'editing';

interface Props {
  visible: boolean;
  onSend: (text: string) => void;
  onClose: () => void;
}

export function VoiceInput({ visible, onSend, onClose }: Props) {
  const [phase, setPhase] = useState<Phase>('recording');
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const recordingRef = useRef<Audio.Recording | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const geminiApiKey = useConnectionStore((s) => s.geminiApiKey);

  // Pulsing red dot animation during recording
  useEffect(() => {
    if (phase === 'recording') {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.3, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        ]),
      );
      loop.start();
      return () => loop.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [phase]);

  // Start recording when visible becomes true
  useEffect(() => {
    if (!visible) return;

    setPhase('recording');
    setText('');
    setError('');

    if (!geminiApiKey) {
      Alert.alert(
        'Gemini API Key Required',
        'Set your Gemini API key in Settings to use voice transcription.',
      );
      onClose();
      return;
    }

    let cancelled = false;

    // Delay recording start to let the modal animation settle —
    // some Android devices crash when requesting permissions mid-animation
    const timer = setTimeout(async () => {
      try {
        const { granted } = await Audio.requestPermissionsAsync();
        if (!granted || cancelled) {
          if (!cancelled) onClose();
          return;
        }

        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
        });

        const { recording } = await Audio.Recording.createAsync(
          Audio.RecordingOptionsPresets.HIGH_QUALITY,
        );
        if (cancelled) {
          await recording.stopAndUnloadAsync().catch(() => {});
          return;
        }
        recordingRef.current = recording;
      } catch (e: any) {
        console.error('Recording start failed:', e);
        if (!cancelled) {
          setError(e?.message || 'Failed to start recording');
          setPhase('editing');
        }
      }
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      stopRecording();
    };
  }, [visible]);

  const stopRecording = async () => {
    const rec = recordingRef.current;
    if (rec) {
      recordingRef.current = null;
      try {
        await rec.stopAndUnloadAsync();
      } catch {}
    }
  };

  const handleStop = async () => {
    const rec = recordingRef.current;
    if (!rec) return;

    recordingRef.current = null;
    setPhase('transcribing');
    setError('');

    try {
      await rec.stopAndUnloadAsync();
      const uri = rec.getURI();
      if (!uri) throw new Error('No recording file');

      const base64 = await new File(uri).base64();

      const result = await transcribeAudio(base64, 'audio/m4a', geminiApiKey);
      setText(result);
      setPhase('editing');
    } catch (e: any) {
      setError(e?.message || 'Transcription failed');
      setPhase('editing');
    }
  };

  const handleSend = () => {
    if (text.trim()) {
      onSend(text.trim());
    }
    onClose();
  };

  const handleCancel = async () => {
    await stopRecording();
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleCancel}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={handleCancel} />

        <View style={styles.modal}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              {phase === 'recording' && (
                <Animated.View style={[styles.dot, { opacity: pulseAnim }]}>
                  <View style={styles.dotInner} />
                </Animated.View>
              )}
              {phase === 'transcribing' && (
                <ActivityIndicator size="small" color="#da7756" style={{ marginRight: 8 }} />
              )}
              <Text style={styles.headerTitle}>
                {phase === 'recording' ? 'Recording...' :
                 phase === 'transcribing' ? 'Transcribing...' :
                 'Edit & Send'}
              </Text>
            </View>
            <TouchableOpacity onPress={handleCancel} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Text style={styles.closeBtn}>X</Text>
            </TouchableOpacity>
          </View>

          {/* Body */}
          <View style={styles.body}>
            {phase === 'recording' && (
              <View style={styles.recordingBody}>
                <Text style={styles.recordingHint}>Tap Stop when you're done speaking</Text>
              </View>
            )}

            {phase === 'transcribing' && (
              <View style={styles.recordingBody}>
                <Text style={styles.recordingHint}>Processing audio with Gemini...</Text>
              </View>
            )}

            {phase === 'editing' && (
              <ScrollView style={styles.textScroll} keyboardShouldPersistTaps="handled">
                <TextInput
                  style={styles.textInput}
                  value={text}
                  onChangeText={setText}
                  placeholder={error || 'Transcription will appear here...'}
                  placeholderTextColor={error ? '#e04040' : '#666'}
                  multiline
                  autoFocus={false}
                  textAlignVertical="top"
                />
              </ScrollView>
            )}
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            {phase === 'recording' && (
              <TouchableOpacity style={styles.stopBtn} onPress={handleStop} activeOpacity={0.7}>
                <Text style={styles.btnText}>Stop Recording</Text>
              </TouchableOpacity>
            )}

            {phase === 'editing' && (
              <TouchableOpacity
                style={[styles.sendBtn, !text.trim() && styles.sendBtnDisabled]}
                onPress={handleSend}
                activeOpacity={0.7}
                disabled={!text.trim()}
              >
                <Text style={styles.btnText}>Send to Terminal</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={handleCancel} />
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  backdrop: {
    flex: 1,
    width: '100%',
  },
  modal: {
    width: '90%',
    maxHeight: '70%',
    backgroundColor: '#252525',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#3c3c3c',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#3c3c3c',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: {
    color: '#d4d4d4',
    fontSize: 16,
    fontWeight: '600',
  },
  closeBtn: {
    color: '#888',
    fontSize: 16,
    fontWeight: '700',
  },
  dot: {
    marginRight: 10,
  },
  dotInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#e04040',
  },
  body: {
    minHeight: 150,
    maxHeight: 300,
  },
  recordingBody: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    minHeight: 150,
  },
  recordingHint: {
    color: '#888',
    fontSize: 15,
    textAlign: 'center',
  },
  textScroll: {
    maxHeight: 300,
  },
  textInput: {
    color: '#d4d4d4',
    fontSize: 15,
    lineHeight: 22,
    padding: 16,
    minHeight: 150,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  footer: {
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#3c3c3c',
  },
  stopBtn: {
    backgroundColor: '#e04040',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  sendBtn: {
    backgroundColor: '#da7756',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  sendBtnDisabled: {
    opacity: 0.4,
  },
  btnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
