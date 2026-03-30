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

let InCallManager;
try {
  InCallManager = require('react-native-incall-manager').default;
} catch {
  InCallManager = null;
}

export default function useTwilioVoice() {
  const voiceRef = useRef(null);
  const {
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
        if (InCallManager) InCallManager.start({ media: 'audio' });
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
        if (InCallManager) InCallManager.start({ media: 'audio' });
      });

      call.on('disconnected', () => {
        setCallState('disconnected');
        stopTimer();
        if (InCallManager) {
          InCallManager.setForceSpeakerphoneOn(false);
          InCallManager.stop();
        }
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

  const toggleSpeaker = useCallback((speakerOn) => {
    if (InCallManager) {
      InCallManager.setForceSpeakerphoneOn(!speakerOn);
    }
    setIsSpeaker(!speakerOn);
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
