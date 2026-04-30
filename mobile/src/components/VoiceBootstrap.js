import { useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCall } from '../context/CallContext';
import useTwilioVoice from '../hooks/useTwilioVoice';
import { setVoiceHandlers, isVoiceAvailable } from '../services/voice';

// Wires the singleton Voice listeners to React state, registers the device
// for incoming push notifications on login, and surfaces background-accepted
// invites (when user accepts from the native notification UI) into the app.
export default function VoiceBootstrap({ navigationRef }) {
  const { user } = useAuth();
  const { setIncomingInvite, setActiveCall, setCallState, setCallInfo } = useCall();
  const { register, unregister, wireCallEvents } = useTwilioVoice();
  const registeredFor = useRef(null);

  // Wire singleton handlers once
  useEffect(() => {
    if (!isVoiceAvailable()) {
      console.warn('[voice] @twilio/voice-react-native-sdk not available');
      return;
    }
    setVoiceHandlers({
      onCallInvite: (invite) => {
        setIncomingInvite(invite);
        // Navigate to incoming UI if app is foreground and not already there
        if (navigationRef?.isReady?.()) {
          const route = navigationRef.getCurrentRoute?.();
          if (route?.name !== 'IncomingCall') {
            navigationRef.navigate('IncomingCall');
          }
        }
      },
      onCancelledCallInvite: () => {
        setIncomingInvite(null);
      },
      onCallInviteAccepted: (invite, call) => {
        // User accepted via native notification UI while app was in background
        const from = invite?.getFrom?.() || invite?.from;
        setCallInfo({ number: from, direction: 'inbound' });
        setCallState('connecting');
        setIncomingInvite(null);
        if (call) {
          setActiveCall(call);
          wireCallEvents(call);
        }
        if (navigationRef?.isReady?.()) {
          navigationRef.navigate('ActiveCall');
        }
      },
      onCallInviteRejected: () => {
        setIncomingInvite(null);
      },
    });
  }, [navigationRef, setIncomingInvite, setActiveCall, setCallState, setCallInfo, wireCallEvents]);

  // Register/unregister on login state changes
  useEffect(() => {
    if (!isVoiceAvailable()) return;
    if (user && registeredFor.current !== user.username) {
      register().then((tok) => {
        if (tok) registeredFor.current = user.username;
      });
    }
    if (!user && registeredFor.current) {
      unregister();
      registeredFor.current = null;
    }
  }, [user, register, unregister]);

  return null;
}
