import { PermissionsAndroid, Platform } from 'react-native';

// Android 13+: notifications need a runtime grant. IMPORTANT: Android shows
// one permission dialog at a time — if this races the location request, one
// of them silently returns denied without any dialog. Callers must sequence.
export async function requestNotificationPermission() {
  if (Platform.OS !== 'android') return true;
  if (Platform.Version < 33) return true; // Android < 13: granted at install
  try {
    const perm = PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS;
    if (!perm) return true;
    const has = await PermissionsAndroid.check(perm);
    if (has) return true;
    const result = await PermissionsAndroid.request(perm, {
      title: 'Notifications',
      message: 'Allow notifications so you can be alerted to incoming calls and messages.',
      buttonPositive: 'Allow',
    });
    return result === PermissionsAndroid.RESULTS.GRANTED;
  } catch (e) {
    console.warn('POST_NOTIFICATIONS request failed:', e?.message || e);
    return false;
  }
}

export async function ensureMicPermission() {
  if (Platform.OS !== 'android') return true;
  const check = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
  if (check) return true;
  const granted = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    {
      title: 'Microphone Permission',
      message: 'Kraydl Dialer needs microphone access to make calls.',
      buttonPositive: 'Allow',
    }
  );
  return granted === PermissionsAndroid.RESULTS.GRANTED;
}
