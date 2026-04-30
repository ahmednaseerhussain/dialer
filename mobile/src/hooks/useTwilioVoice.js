import { useCallback } from 'react';
import { useCall } from '../context/CallContext';
import api from '../services/api';
import { getVoice, isVoiceAvailable, InCallManager } from '../services/voice';

// Pure action hook. NO listener wiring here — that lives in VoiceBootstrap.
// All callers share the same singleton Voice instance.
export default function useTwilioVoice() {
  const {
    setActiveCall, setCallState, setCallInfo,
    setIsMuted, setIsOnHold, setIsSpeaker, setIncomingInvite,
    startTimer, stopTimer, resetCall,
  } = useCall();

  const wireCallEvents = useCallback((call) => {
    call.on('connected', () => {
      setCallState('connected');
      startTimer();
      if (InCallManager) InCallManager.start({ media: 'audio' });
    });
    call.on('reconnecting', () => setCallState('reconnecting'));
    call.on('reconnected', () => setCallState('connected'));
    call.on('disconnected', () => {
      setCallState('disconnected');
      stopTimer();
      if (InCallManager) {
        InCallManager.setForceSpeakerphoneOn(false);
        InCallManager.stop();
      }
      setTimeout(() => resetCall(), 2000);
    });
    call.on('connectFailure', (error) => {
      console.error('Call connect failure:', error);
      if (InCallManager) InCallManager.stop();
      resetCall();
    });
  }, [setCallState, startTimer, stopTimer, resetCall]);

  const register = useCallback(async () => {
    const voice = getVoice();
    if (!voice) {
      console.warn('Twilio Voice SDK not available, skipping registration');
      return null;
    }
    try {
      const { data } = await api.get('/api/token');
      await voice.register(data.token);
      return data.token;
    } catch (err) {
      console.warn('Voice registration failed:', err?.response?.data || err?.message || err);
      return null;
    }
  }, []);

  const unregister = useCallback(async () => {
    const voice = getVoice();
    if (!voice) return;
    try {
      const { data } = await api.get('/api/token');
      await voice.unregister(data.token);
    } catch (err) {
      console.warn('Voice unregister failed:', err?.message || err);
    }
  }, []);

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

      setActiveCall(call);
      wireCallEvents(call);
      return call;
    } catch (err) {
      console.error('Make call error:', err);
      resetCall();
      throw err;
    }
  }, [setActiveCall, setCallState, setCallInfo, resetCall, wireCallEvents]);

  const acceptIncoming = useCallback(async (callInvite) => {
    try {
      setCallState('connecting');
      const from = callInvite?.getFrom?.() || callInvite?.from;
      setCallInfo({ number: from, direction: 'inbound' });

      const call = await callInvite.accept();
      setActiveCall(call);
      setIncomingInvite(null);
      wireCallEvents(call);
      return call;
    } catch (err) {
      console.error('Accept call error:', err);
      resetCall();
      throw err;
    }
  }, [setActiveCall, setCallState, setCallInfo, setIncomingInvite, resetCall, wireCallEvents]);

  const rejectIncoming = useCallback(async (callInvite) => {
    try {
      await callInvite.reject();
      setIncomingInvite(null);
    } catch (err) {
      console.error('Reject call error:', err);
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

  const toggleSpeaker = useCallback((speakerOn) => {
    if (InCallManager) {
      InCallManager.setForceSpeakerphoneOn(!speakerOn);
    }
    setIsSpeaker(!speakerOn);
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
    isAvailable: isVoiceAvailable(),
  };
}
