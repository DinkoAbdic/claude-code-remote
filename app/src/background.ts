import BackgroundService from 'react-native-background-actions';

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const bgOptions = {
  taskName: 'ClaudeRemote',
  taskTitle: 'Claude Remote — Connected',
  taskDesc: 'Keeping connection alive in background',
  taskIcon: { name: 'ic_launcher', type: 'mipmap' },
  color: '#569cd6',
  linkingURI: 'clauderemote://',
};

/**
 * Start an Android foreground service that keeps the JS thread alive.
 * The existing WebSocket singleton stays connected — this just prevents
 * the OS from killing the JS bridge while the app is backgrounded.
 */
export async function startBackgroundService() {
  try {
    if (BackgroundService.isRunning()) return;

    await BackgroundService.start(async () => {
      // Keep-alive loop — the actual work (WS) runs in the main JS thread
      while (BackgroundService.isRunning()) {
        await sleep(30_000);
      }
    }, bgOptions);
  } catch (e) {
    console.warn('Background service failed to start:', e);
  }
}

/**
 * Stop the Android foreground service.
 */
export async function stopBackgroundService() {
  try {
    if (!BackgroundService.isRunning()) return;
    await BackgroundService.stop();
  } catch (e) {
    console.warn('Background service failed to stop:', e);
  }
}
