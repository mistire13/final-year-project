import { NativeModules, Platform } from 'react-native';

const FALLBACK_HOST = '192.168.8.114';

/**
 * Resolves the host IP or domain of the dev server / host machine.
 * In React Native / Expo Go, `NativeModules.SourceCode.scriptURL` contains
 * the exact host the JS bundle was downloaded from (e.g. 192.168.100.236).
 */
export const getDevServerHost = (): string => {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.location?.hostname) {
      const host = window.location.hostname;
      if (host === 'localhost' || host === '127.0.0.1') return 'localhost';
      return host;
    }
    return 'localhost';
  }

  const scriptURL = NativeModules?.SourceCode?.scriptURL as string | undefined;
  if (scriptURL) {
    try {
      // Formats: "http://192.168.100.236:8081/index.bundle?platform=..."
      const parts = scriptURL.split('://');
      if (parts.length > 1) {
        const hostWithPort = parts[1].split('/')[0];
        const host = hostWithPort.split(':')[0];
        if (host && host !== 'localhost' && host !== '127.0.0.1') {
          return host;
        }
      }
    } catch {
      // Fallback
    }
  }

  return FALLBACK_HOST;
};

/**
 * Resolves the backend API base URL dynamically.
 */
export const getApiBaseUrl = (): string => {
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }
  if (Platform.OS === 'web') {
    return 'http://localhost:5000/api';
  }
  const host = getDevServerHost();
  return `http://${host}:5000/api`;
};

/**
 * Resolves a web portal destination URL dynamically.
 */
export const getWebPortalUrl = (path: string): string => {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  if (Platform.OS === 'web') {
    return cleanPath;
  }
  const host = getDevServerHost();
  return `http://${host}:8081${cleanPath}`;
};
