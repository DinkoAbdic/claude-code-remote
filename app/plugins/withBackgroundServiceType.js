const { withAndroidManifest } = require('@expo/config-plugins');

/**
 * Expo config plugin that adds android:foregroundServiceType="dataSync"
 * to the react-native-background-actions service declaration.
 *
 * Required for Android 14+ (targetSDK 34+) which throws
 * MissingForegroundServiceTypeException without it.
 */
module.exports = function withBackgroundServiceType(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;

    // Ensure permissions exist
    if (!manifest['uses-permission']) {
      manifest['uses-permission'] = [];
    }
    const perms = manifest['uses-permission'];
    for (const name of [
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_DATA_SYNC',
    ]) {
      if (!perms.some((p) => p.$?.['android:name'] === name)) {
        perms.push({ $: { 'android:name': name } });
      }
    }

    // Add foregroundServiceType to the background-actions service
    const app = manifest.application?.[0];
    if (app) {
      if (!app.service) {
        app.service = [];
      }

      const serviceName = 'com.asterinet.react.bgactions.RNBackgroundActionsTask';
      const existing = app.service.find(
        (s) => s.$?.['android:name'] === serviceName
      );

      if (existing) {
        existing.$['android:foregroundServiceType'] = 'dataSync';
      } else {
        app.service.push({
          $: {
            'android:name': serviceName,
            'android:foregroundServiceType': 'dataSync',
          },
        });
      }
    }

    return config;
  });
};
