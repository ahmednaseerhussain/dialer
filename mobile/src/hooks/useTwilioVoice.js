import { useCallback } from 'react';
import { useCall } from '../context/CallContext';
import api from '../services/api';
import {
  getVoice, isVoiceAvailable, registerVoice, unregisterVoice, setSpeakerphoneOn,
} from '../services/voice';

// A call can reach the app twice (JS accept() resolving AND the invite's
// 'accepted' event), and the SDK constructs a DIFFERENT JS Call object for
// each — both wrapping the same native call uuid and both receiving its
// events. Dedupe by native uuid so listeners attach exactly once, otherwise
// the duration timer runs double-speed and handlers fire twice.
const wiredCallIds = new Set();

function callId(call) {
  return call?._uuid ?? call?.getSid?.() ?? null;
}

function isWired(call) {
  const id = callId(call);
  return id != null && wiredCallIds.has(id);
}

// Pure action hook. NO listener wiring here — that lives in VoiceBootstrap.
// All callers share the same singleton Voice instance.
export default function useTwilioVoice() {
  const {
    setActiveCall, setCallState, setCallInfo,
    setIsMuted, setIsOnHold, setIsSpeaker, setIncomingInvite,
    startTimer, stopTimer, resetCall,
  } = useCall();

  const wireCallEvents = useCallback((call) => {
    if (!call || isWired(call)) return;
    const id = callId(call);
    if (id != null) wiredCallIds.add(id);

    call.on('connected', () => {
      setCallState('connected');
      startTimer();
    });
    call.on('reconnecting', () => setCallState('reconnecting'));
    call.on('reconnected', () => setCallState('connected'));
    call.on('disconnected', () => {
      if (id != null) wiredCallIds.delete(id);
      setCallState('disconnected');
      stopTimer();
      setSpeakerphoneOn(false).catch(() => {});
      setTimeout(() => resetCall(), 2000);
    });
    call.on('connectFailure', (error) => {
      console.error('Call connect failure:', error);
      if (id != null) wiredCallIds.delete(id);
      setSpeakerphoneOn(false).catch(() => {});
      resetCall();
    });
  }, [setCallState, startTimer, stopTimer, resetCall]);

  // Take ownership of a call regardless of where it came from (dialed here,
  // accepted in-app, or accepted from the native notification while the app
  // was in background). Safe to call more than once for the same call.
  const adoptCall = useCallback((call, info) => {
    if (!call) return;
    if (info) setCallInfo(info);
    setIncomingInvite(null);
    if (!isWired(call)) {
      setActiveCall(call);
      setCallState('connecting');
      wireCallEvents(call);
      // Background-accepted calls may already be live by the time JS wakes
      // up — the 'connected' event already fired, so sync state manually.
      const state = call.getState?.();
      if (state === 'connected') {
        setCallState('connected');
        startTimer();
      } else if (state === 'disconnected') {
        setCallState('disconnected');
        setTimeout(() => resetCall(), 2000);
      }
    }
  }, [setActiveCall, setCallState, setCallInfo, setIncomingInvite, wireCallEvents, startTimer, resetCall]);

  const register = useCallback(() => registerVoice({ force: true }), []);

  const unregister = useCallback(() => unregisterVoice(), []);

  const makeCall = useCallback(async (toNumber) => {
    const voice = getVoice();
    if (!voice) {
      console.warn('Twilio Voice SDK not available. Install @twilio/voice-react-native-sdk');
      return;
    }
    try {
      setCallState('connecting');
      setCallInfo({ number: toNumber, direction: 'outbound' });

      const { data } = await api.get('/api/token');
      const call = await voice.connect(data.token, {
        params: { To: toNumber },
      });

      adoptCall(call);
      return call;
    } catch (err) {
      console.error('Make call error:', err);
      resetCall();
      throw err;
    }
  }, [setCallState, setCallInfo, resetCall, adoptCall]);

  const acceptIncoming = useCallback(async (callInvite) => {
    try {
      setCallState('connecting');
      const from = callInvite?.getFrom?.() || callInvite?.from;
      setCallInfo({ number: from, direction: 'inbound' });

      const call = await callInvite.accept();
      adoptCall(call);
      return call;
    } catch (err) {
      console.error('Accept call error:', err);
      resetCall();
      throw err;
    }
  }, [setCallState, setCallInfo, resetCall, adoptCall]);

  const rejectIncoming = useCallback(async (callInvite) => {
    try {
      await callInvite.reject();
    } catch (err) {
      console.error('Reject call error:', err);
    } finally {
      setIncomingInvite(null);
    }
  }, [setIncomingInvite]);

  const hangup = useCallback(async (call) => {
    try {
      await call.disconnect();
    } catch (err) {
      console.error('Hangup error:', err);
      resetCall();
    }
  }, [resetCall]);

  const toggleMute = useCallback(async (call, muted) => {
    try {
      await call.mute(!muted);
      setIsMuted(!muted);
    } catch (err) {
      console.error('Mute error:', err);
    }
  }, [setIsMuted]);

  const toggleHold = useCallback(async (call, held) => {
    try {
      await call.hold(!held);
      setIsOnHold(!held);
    } catch (err) {
      console.error('Hold error:', err);
    }
  }, [setIsOnHold]);

  const sendDigits = useCallback(async (call, digits) => {
    try {
      await call.sendDigits(digits);
    } catch (err) {
      console.error('Send digits error:', err);
    }
  }, []);

  const toggleSpeaker = useCallback(async (speakerOn) => {
    const ok = await setSpeakerphoneOn(!speakerOn);
    if (ok) setIsSpeaker(!speakerOn);
  }, [setIsSpeaker]);

  return {
    register,
    unregister,
    makeCall,
    acceptIncoming,
    rejectIncoming,
    hangup,
    toggleMute,
    toggleHold,
    sendDigits,
    toggleSpeaker,
    wireCallEvents,
    adoptCall,
    isAvailable: isVoiceAvailable(),
  };
}
