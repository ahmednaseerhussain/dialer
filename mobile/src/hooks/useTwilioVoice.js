import { useRef, useEffect, useCallback } from 'react';
import { useCall } from '../context/CallContext';
import api from '../services/api';

// NOTE: @twilio/voice-react-native-sdk must be installed separately
// yarn add @twilio/voice-react-native-sdk
// It requires a development build (not Expo Go) since it has native modules.
// For development, use: npx expo prebuild && npx expo run:android/ios

let Voice;
try {
  const twilioModule = require('@twilio/voice-react-native-sdk');
  Voice = twilioModule.Voice;
} catch {
  // SDK not installed yet — provide a stub for development
  Voice = null;
}

export default function useTwilioVoice() {
  const voiceRef = useRef(null);
  const {
    setActiveCall, setCallState, setCallInfo,
    setIsMuted, setIsOnHold, setIncomingInvite,
    startTimer, stopTimer, resetCall,
  } = useCall();

  useEffect(() => {
    if (!Voice) return;
    const voice = new Voice();
    voiceRef.current = voice;

    voice.on('callInvite', (callInvite) => {
      setIncomingInvite(callInvite);
    });

    voice.on('cancelledCallInvite', () => {
      setIncomingInvite(null);
    });

    return () => {
      voice.removeAllListeners();
    };
  }, []);

  const register = useCallback(async () => {
    if (!Voice || !voiceRef.current) return;
    try {
      const { data } = await api.get('/api/token');
      await voiceRef.current.register(data.token);
      return data.token;
    } catch (err) {
      console.error('Voice registration failed:', err);
      throw err;
    }
  }, []);

  const makeCall = useCallback(async (toNumber) => {
    if (!Voice) {
      console.warn('Twilio Voice SDK not available. Install @twilio/voice-react-native-sdk');
      return;
    }

    try {
      setCallState('connecting');
      setCallInfo({ number: toNumber, direction: 'outbound' });

      const { data } = await api.get('/api/token');
      const call = await voiceRef.current.connect(data.token, {
        params: { To: toNumber },
      });

      setActiveCall(call);

      call.on('connected', () => {
        setCallState('connected');
        startTimer();
      });

      call.on('reconnecting', () => {
        setCallState('reconnecting');
      });

      call.on('reconnected', () => {
        setCallState('connected');
      });

      call.on('disconnected', () => {
        setCallState('disconnected');
        stopTimer();
        setTimeout(() => resetCall(), 2000);
      });

      call.on('connectFailure', (error) => {
        console.error('Call connect failure:', error);
        resetCall();
      });

      return call;
    } catch (err) {
      console.error('Make call error:', err);
      resetCall();
      throw err;
    }
  }, []);

  const acceptIncoming = useCallback(async (callInvite) => {
    try {
      setCallState('connecting');
      setCallInfo({
        number: callInvite.from,
        direction: 'inbound',
      });

      const call = await callInvite.accept();
      setActiveCall(call);
      setIncomingInvite(null);

      call.on('connected', () => {
        setCallState('connected');
        startTimer();
      });

      call.on('disconnected', () => {
        setCallState('disconnected');
        stopTimer();
        setTimeout(() => resetCall(), 2000);
      });

      return call;
    } catch (err) {
      console.error('Accept call error:', err);
      resetCall();
      throw err;
    }
  }, []);

  const rejectIncoming = useCallback(async (callInvite) => {
    try {
      await callInvite.reject();
      setIncomingInvite(null);
    } catch (err) {
      console.error('Reject call error:', err);
    }
  }, []);

  const hangup = useCallback(async (call) => {
    try {
      await call.disconnect();
    } catch (err) {
      console.error('Hangup error:', err);
      resetCall();
    }
  }, []);

  const toggleMute = useCallback(async (call, muted) => {
    try {
      await call.mute(!muted);
      setIsMuted(!muted);
    } catch (err) {
      console.error('Mute error:', err);
    }
  }, []);

  const toggleHold = useCallback(async (call, held) => {
    try {
      await call.hold(!held);
      setIsOnHold(!held);
    } catch (err) {
      console.error('Hold error:', err);
    }
  }, []);

  const sendDigits = useCallback(async (call, digits) => {
    try {
      await call.sendDigits(digits);
    } catch (err) {
      console.error('Send digits error:', err);
    }
  }, []);

  return {
    register,
    makeCall,
    acceptIncoming,
    rejectIncoming,
    hangup,
    toggleMute,
    toggleHold,
    sendDigits,
    isAvailable: !!Voice,
  };
}
