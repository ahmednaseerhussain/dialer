import { useEffect, useRef } from 'react';
import { Alert, AppState } from 'react-native';
import { StackActions } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { useCall } from '../context/CallContext';
import useTwilioVoice from '../hooks/useTwilioVoice';
import { setVoiceHandlers, isVoiceAvailable, registerVoice, recoverPendingInvite } from '../services/voice';
import { syncDeviceToken } from '../services/pushToken';

// Wires the singleton Voice listeners to React state, registers the device
// for incoming push notifications on login, and surfaces background-accepted
// invites (when user accepts from the native notification UI) into the app.
export default function VoiceBootstrap({ navigationRef }) {
  const { user } = useAuth();
  const { incomingInvite, callState, setIncomingInvite } = useCall();
  const { adoptCall } = useTwilioVoice();
  const warnedRegisterFail = useRef(false);

  // Wire singleton handlers once. Handlers ONLY touch call state — all screen
  // navigation is centralized in the effect below so there's a single source
  // of truth (previously Dialer, the screens, and here all navigated, which
  // raced and left the call screen stuck after a call ended).
  useEffect(() => {
    if (!isVoiceAvailable()) {
      console.warn('[voice] @twilio/voice-react-native-sdk not available');
      return;
    }
    setVoiceHandlers({
      onCallInvite: (invite) => setIncomingInvite(invite),
      onCancelledCallInvite: () => setIncomingInvite(null),
      onCallInviteRejected: () => setIncomingInvite(null),
      // Fires for ANY accept — in-app button or the native notification UI
      // while the app was in background. adoptCall is idempotent.
      onCallInviteAccepted: (invite, call) => {
        const from = invite?.getFrom?.() || invite?.from;
        adoptCall(call, { number: from, direction: 'inbound' });
      },
      // Tapping the notification just needs the app open; the effect below
      // will already be showing IncomingCall for the pending invite.
      onCallInviteNotificationTapped: () => {},
    });
  }, [setIncomingInvite, adoptCall]);

  // Single owner of call-screen navigation. Keeps exactly one call screen in
  // the stack at a time and, crucially, POPS it when the call ends — no matter
  // who ended it (local hangup, remote hangup, timeout, connect failure).
  useEffect(() => {
    const nav = navigationRef;
    if (!nav?.isReady?.()) return;
    const current = nav.getCurrentRoute?.()?.name;
    const inCall = callState === 'connecting' || callState === 'connected' || callState === 'reconnecting';
    const onCallScreen = current === 'ActiveCall' || current === 'IncomingCall';

    if (inCall) {
      // Answered/dialing → ActiveCall. Replace IncomingCall (not push) so the
      // stack has one call screen and a single pop returns to where we were.
      if (current === 'IncomingCall') {
        nav.dispatch(StackActions.replace('ActiveCall'));
      } else if (current !== 'ActiveCall') {
        nav.navigate('ActiveCall');
      }
    } else if (incomingInvite) {
      // Ringing, not yet answered
      if (current !== 'IncomingCall') nav.navigate('IncomingCall');
    } else if (callState === 'idle' && onCallScreen) {
      // Call fully ended and reset (or invite rejected/cancelled) → leave the
      // call screen. 'disconnected' holds briefly on ActiveCall ("Call Ended")
      // until CallContext.resetCall flips state to 'idle' ~2s later.
      if (nav.canGoBack()) nav.goBack();
    }
  }, [incomingInvite, callState, navigationRef]);

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

    // Runtime permissions (notification + mic) are owned by AuthContext's
    // single sequential chain — requesting them here too would race Android's
    // one-dialog-at-a-time limit and auto-deny one of them.
    registerAll({ force: true }).catch(() => {});
    // Cold start from a notification tap: replay any invite JS missed.
    if (isVoiceAvailable()) recoverPendingInvite().catch(() => {});

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        registerAll().catch(() => {});
        // Returning to foreground while a call is still ringing — make sure
        // the invite is surfaced even if the live event was missed.
        if (isVoiceAvailable()) recoverPendingInvite().catch(() => {});
      }
    });
    return () => sub.remove();
  }, [user]);

  return null;
}
