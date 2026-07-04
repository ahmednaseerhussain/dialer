import { useEffect } from 'react';
import { AppState, PermissionsAndroid, Platform } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useCall } from '../context/CallContext';
import useTwilioVoice from '../hooks/useTwilioVoice';
import { setVoiceHandlers, isVoiceAvailable, registerVoice } from '../services/voice';
import { syncDeviceToken } from '../services/pushToken';

async function requestNotificationPermission() {
  if (Platform.OS !== 'android') return true;
  if (Platform.Version < 33) return true; // Android < 13: granted at install
  try {
    const perm = PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS;
    if (!perm) return true;
    const has = await PermissionsAndroid.check(perm);
    if (has) return true;
    const result = await PermissionsAndroid.request(perm, {
      title: 'Notifications',
      message: 'Allow notifications so you can be alerted to incoming calls.',
      buttonPositive: 'Allow',
    });
    return result === PermissionsAndroid.RESULTS.GRANTED;
  } catch (e) {
    console.warn('POST_NOTIFICATIONS request failed:', e?.message || e);
    return false;
  }
}

// Wires the singleton Voice listeners to React state, registers the device
// for incoming push notifications on login, and surfaces background-accepted
// invites (when user accepts from the native notification UI) into the app.
export default function VoiceBootstrap({ navigationRef }) {
  const { user } = useAuth();
  const { setIncomingInvite } = useCall();
  const { adoptCall } = useTwilioVoice();

  // Wire singleton handlers once
  useEffect(() => {
    if (!isVoiceAvailable()) {
      console.warn('[voice] @twilio/voice-react-native-sdk not available');
      return;
    }
    const goToIncoming = () => {
      if (navigationRef?.isReady?.()) {
        const route = navigationRef.getCurrentRoute?.();
        if (route?.name !== 'IncomingCall') {
          navigationRef.navigate('IncomingCall');
        }
      }
    };
    setVoiceHandlers({
      onCallInvite: (invite) => {
        setIncomingInvite(invite);
        goToIncoming();
      },
      onCancelledCallInvite: () => {
        // Caller hung up before we answered — stop the ringing UI
        setIncomingInvite(null);
      },
      onCallInviteRejected: () => {
        setIncomingInvite(null);
      },
      // Fires for ANY accept — in-app button or the native notification UI
      // while the app was in background. adoptCall is idempotent, so the
      // in-app path (which already adopted) is unaffected.
      onCallInviteAccepted: (invite, call) => {
        const from = invite?.getFrom?.() || invite?.from;
        adoptCall(call, { number: from, direction: 'inbound' });
        if (navigationRef?.isReady?.()) {
          const route = navigationRef.getCurrentRoute?.();
          if (route?.name !== 'ActiveCall') {
            navigationRef.navigate('ActiveCall');
          }
        }
      },
      // User tapped the incoming-call notification body — show the app UI
      onCallInviteNotificationTapped: () => {
        goToIncoming();
      },
    });
  }, [navigationRef, setIncomingInvite, adoptCall]);

  // Register on login and re-register whenever the app returns to the
  // foreground (throttled inside registerVoice). Keeps this device's push
  // binding fresh even when the same account is signed in elsewhere.
  useEffect(() => {
    if (!user) return;

    (async () => {
      await requestNotificationPermission();
      if (isVoiceAvailable()) await registerVoice({ force: true });
      await syncDeviceToken({ force: true }); // SMS push for this device
    })();

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        if (isVoiceAvailable()) registerVoice().catch(() => {});
        syncDeviceToken().catch(() => {});
      }
    });
    return () => sub.remove();
  }, [user]);

  return null;
}
