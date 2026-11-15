const { withAndroidManifest } = require('@expo/config-plugins');

// Cleartext is enabled only for the explicit local-network test build.
module.exports = ({ config }) => {
  const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
  const googleServicesFile = process.env.GOOGLE_SERVICES_FILE;
  config = {
    ...config,
    ...(projectId ? { extra: { ...config.extra, eas: { ...config.extra?.eas, projectId } } } : {}),
    android: { ...config.android, ...(googleServicesFile ? { googleServicesFile } : {}) },
  };
  if (process.env.EXPO_LAN_TEST !== '1') return config;
  return withAndroidManifest({
    ...config,
    android: { ...config.android, package: 'com.ankelba.app.lantest' },
  }, (manifestConfig) => {
    manifestConfig.modResults.manifest.application[0].$['android:usesCleartextTraffic'] = 'true';
    return manifestConfig;
  });
};
