import { NativeModules, Platform } from 'react-native';
import Constants from 'expo-constants';

// Current machine local Wi-Fi IP address
const FALLBACK_HOST = '192.168.8.104';

/**
 * Resolves the host IP or domain of the dev server / host machine.
 * 1. Web: Uses window.location.hostname (works on desktop and mobile browser)
 * 2. Expo Go (Mobile): Uses Constants.expoConfig.hostUri or manifest debuggerHost
 * 3. React Native NativeModules: Uses SourceCode.scriptURL
 * 4. Fallback: Uses active LAN IP
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

  // 1. In modern Expo Go, hostUri contains the exact IP Metro runs on (e.g. "192.168.8.104:8081")
  const hostUri = Constants?.expoConfig?.hostUri 
    || (Constants as any)?.manifest2?.extra?.expoGo?.debuggerHost 
    || (Constants as any)?.manifest?.debuggerHost;

  if (hostUri && typeof hostUri === 'string') {
    const host = hostUri.replace(/^[a-z]+:\/\//i, '').split('/')[0].split(':')[0];
    if (host && host !== 'localhost' && host !== '127.0.0.1') {
      return host;
    }
  }

  // 2. Try NativeModules scriptURL
  const scriptURL = NativeModules?.SourceCode?.scriptURL as string | undefined;
  if (scriptURL) {
    try {
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
    if (typeof window !== 'undefined' && window.location?.hostname) {
      const host = window.location.hostname;
      if (host && host !== 'localhost' && host !== '127.0.0.1') {
        return `http://${host}:5000/api`;
      }
    }
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
