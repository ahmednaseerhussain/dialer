import { PermissionsAndroid, Platform } from 'react-native';

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
