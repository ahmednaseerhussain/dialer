import { useEffect, useRef } from 'react';
import { Alert, AppState } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useCall } from '../context/CallContext';
import useTwilioVoice from '../hooks/useTwilioVoice';
import { setVoiceHandlers, isVoiceAvailable, registerVoice } from '../services/voice';
import { syncDeviceToken } from '../services/pushToken';
import { requestNotificationPermission } from '../utils/permissions';

// Wires the singleton Voice listeners to React state, registers the device
// for incoming push notifications on login, and surfaces background-accepted
// invites (when user accepts from the native notification UI) into the app.
export default function VoiceBootstrap({ navigationRef }) {
  const { user } = useAuth();
  const { setIncomingInvite } = useCall();
  const { adoptCall } = useTwilioVoice();
  const warnedRegisterFail = useRef(false);

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

    const registerAll = async ({ force = false } = {}) => {
      // Registration first — it must never sit behind a permission dialog.
      let voiceResult = { ok: false, error: 'not attempted' };
      if (isVoiceAvailable()) {
        voiceResult = await registerVoice({ force });
        if (!voiceResult.ok && force) {
          // One more try after a pause (cold backend), then tell the user —
          // silent failure here means the phone simply never rings.
          await new Promise((r) => setTimeout(r, 15000));
          voiceResult = await registerVoice({ force: true });
        }
        if (!voiceResult.ok && !warnedRegisterFail.current) {
          warnedRegisterFail.current = true;
          Alert.alert(
            'Incoming calls not ready',
            `Device could not register for incoming calls: ${voiceResult.error || 'unknown error'}.\n\nCheck your internet and reopen the app.`
          );
        }
        if (voiceResult.ok) warnedRegisterFail.current = false;
      }
      // Report voice status alongside the SMS-push token — shows up in
      // server logs so "phone kyun nahi baja" is diagnosable remotely.
      await syncDeviceToken({
        force,
        voiceRegistered: voiceResult.ok,
        voiceError: voiceResult.ok ? undefined : voiceResult.error,
      });
    };

    (async () => {
      await registerAll({ force: true });
      // Permission dialog AFTER registration + after the location dialog
      // (AuthContext sequences notification→location on login; this is a
      // safety net for app restarts where login() didn't run).
      await requestNotificationPermission();
    })();

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        registerAll().catch(() => {});
      }
    });
    return () => sub.remove();
  }, [user]);

  return null;
}
