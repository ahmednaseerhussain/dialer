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
    activeCall, isMuted, isOnHold,
    setActiveCall, setCallState, setCallInfo,
    setIsMuted, setIsOnHold, setIsSpeaker, setIncomingInvite,
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

  // register() requires Firebase Cloud Messaging (FCM) on Android.
  // Without google-services.json configured, calling voice.register()
  // will crash the app with "Default FirebaseApp is not initialized".
  // Incoming call push notifications need FCM. Outbound calls work without it.
  const register = useCallback(async () => {
    if (!Voice || !voiceRef.current) {
      console.warn('Twilio Voice SDK not available, skipping registration');
      return null;
    }
    try {
      const { data } = await api.get('/api/token');
      // Only attempt registration if Firebase is configured.
      // voice.register() is needed for incoming call push notifications.
      // voice.connect() for outbound calls works without registration.
      await voiceRef.current.register(data.token);
      return data.token;
    } catch (err) {
      console.warn('Voice registration failed (Firebase may not be configured):', err?.message || err);
      return null;
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

  const hangup = useCallback(async () => {
    try {
      if (activeCall) await activeCall.disconnect();
    } catch (err) {
      console.error('Hangup error:', err);
      resetCall();
    }
  }, [activeCall]);

  const toggleMute = useCallback(async () => {
    try {
      if (activeCall) {
        await activeCall.mute(!isMuted);
        setIsMuted(!isMuted);
      }
    } catch (err) {
      console.error('Mute error:', err);
    }
  }, [activeCall, isMuted]);

  const toggleHold = useCallback(async () => {
    try {
      if (activeCall) {
        await activeCall.hold(!isOnHold);
        setIsOnHold(!isOnHold);
      }
    } catch (err) {
      console.error('Hold error:', err);
    }
  }, [activeCall, isOnHold]);

  const sendDigits = useCallback(async (digits) => {
    try {
      if (activeCall) await activeCall.sendDigits(digits);
    } catch (err) {
      console.error('Send digits error:', err);
    }
  }, [activeCall]);

  const toggleSpeaker = useCallback(async (speakerOn) => {
    if (!Voice || !voiceRef.current) return;
    try {
      const audioDevices = await voiceRef.current.getAudioDevices();
      if (!audioDevices || !audioDevices.audioDevices) return;
      
      const targetType = speakerOn ? 'speaker' : 'earpiece';
      const device = audioDevices.audioDevices.find(
        d => d.type?.toLowerCase() === targetType
      );
      
      if (device) {
        await device.select();
        setIsSpeaker(speakerOn);
      }
    } catch (err) {
      console.error('Toggle speaker error:', err);
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
    toggleSpeaker,
    isAvailable: !!Voice,
  };
}
