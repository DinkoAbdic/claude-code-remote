import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

/**
 * Request permissions, create Android notification channel,
 * and set default foreground handler.
 */
export async function setupNotifications() {
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') {
    console.warn('Notification permission not granted');
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('claude-remote', {
      name: 'Claude Remote',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  // Don't show notifications when app is in foreground
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: false,
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: false,
      shouldShowList: false,
    }),
  });
}

/**
 * Fire a local notification telling the user Claude finished.
 */
export async function notifyClaudeDone(sessionName?: string) {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Claude is done',
      body: sessionName
        ? `Terminal "${sessionName}" is ready for input`
        : 'Terminal is ready for input',
      sound: 'default',
      ...(Platform.OS === 'android' && { channelId: 'claude-remote' }),
    },
    trigger: null, // fire immediately
  });
}
