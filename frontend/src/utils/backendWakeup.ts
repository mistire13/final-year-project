/**
 * Frontend Keep-Alive & Wakeup Service
 * Pings the Render backend health endpoint every 10 minutes while the web app is open
 * to prevent the free tier service from idling / spinning down.
 */

let wakeupInterval: ReturnType<typeof setInterval> | null = null;
let lastPingTime = 0;
const TEN_MINUTES_MS = 10 * 60 * 1000;

function resolveHealthUrl(): string {
  const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'https://ankelba-api.onrender.com/api';
  return apiUrl.replace(/\/api\/?$/, '') + '/health';
}

export function pingBackendWakeup(): void {
  try {
    const url = resolveHealthUrl();
    lastPingTime = Date.now();
    fetch(url, {
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
    }).catch(() => {
      // Silently ignore ping network errors
    });
  } catch {
    // Ignore
  }
}

export function initFrontendBackendWakeup(): () => void {
  if (typeof window === 'undefined') return () => {};

  // Ping immediately on app load
  pingBackendWakeup();

  // Recurring ping every 10 minutes
  if (!wakeupInterval) {
    wakeupInterval = setInterval(pingBackendWakeup, TEN_MINUTES_MS);
  }

  // Wakeup when browser tab is brought back into focus after > 10 minutes
  const handleVisibility = () => {
    if (document.visibilityState === 'visible') {
      const elapsed = Date.now() - lastPingTime;
      if (elapsed >= TEN_MINUTES_MS) {
        pingBackendWakeup();
      }
    }
  };

  document.addEventListener('visibilitychange', handleVisibility);

  return () => {
    if (wakeupInterval) {
      clearInterval(wakeupInterval);
      wakeupInterval = null;
    }
    document.removeEventListener('visibilitychange', handleVisibility);
  };
}

