// Syncs the device's FCM token with the backend so inbound SMS can be
// pushed to this device (shown natively by AppFirebaseMessagingService).
// The FcmToken native module is Android-only and ships in the dev build —
// everything here degrades to a no-op when it's unavailable.

import { NativeModules, Platform } from 'react-native';
import api from './api';

let lastSyncedToken = null;
let lastSyncAt = 0;

async function getFcmToken() {
  if (Platform.OS !== 'android') return null;
  const mod = NativeModules.FcmToken;
  if (!mod?.getToken) {
    console.warn('[push] FcmToken native module unavailable — rebuild the app to enable SMS push');
    return null;
  }
  try {
    return await mod.getToken();
  } catch (err) {
    console.warn('[push] getToken failed:', err?.message || err);
    return null;
  }
}

// Register the token with the backend. Throttled — safe to call on every
// app-foreground alongside the Twilio re-register. voiceRegistered/voiceError
// piggyback the Twilio registration outcome for server-side visibility.
export async function syncDeviceToken({ force = false, voiceRegistered, voiceError } = {}) {
  if (!force && Date.now() - lastSyncAt < 5 * 60 * 1000) return;
  const token = await getFcmToken();
  if (!token) return;
  try {
    await api.post('/api/notifications/device', {
      token,
      platform: Platform.OS,
      voiceRegistered,
      voiceError,
    });
    lastSyncedToken = token;
    lastSyncAt = Date.now();
  } catch (err) {
    console.warn('[push] device token sync failed:', err?.response?.data?.error || err?.message);
  }
}

// Called on logout BEFORE the auth token is cleared, so this device stops
// getting SMS pushes for the account that just signed out.
export async function removeDeviceToken() {
  lastSyncAt = 0;
  const token = lastSyncedToken || (await getFcmToken());
  lastSyncedToken = null;
  if (!token) return;
  try {
    await api.delete('/api/notifications/device', { data: { token } });
  } catch (err) {
    console.warn('[push] device token removal failed:', err?.message);
  }
}
