import { useRef, useEffect, useCallback } from 'react';
import { useCall } from '../context/CallContext';
import api from '../services/api';

let Voice;
try {
  const twilioModule = require('@twilio/voice-react-native-sdk');
  Voice = twilioModule.Voice;
} catch {
  Voice = null;
}

let InCallManager;
try {
  InCallManager = require('react-native-incall-manager').default;
} catch {
  InCallManager = null;
}

// Singleton Voice instance — shared across all screens
let voiceInstance = null;
let listenersAttached = false;

function getVoice() {
  if (!Voice) return null;
  if (!voiceInstance) {
    voiceInstance = new Voice();
    console.log('[Voice] Created singleton Voice instance');
  }
  return voiceInstance;
}

export default function useTwilioVoice() {
  const {
    setActiveCall, setCallState, setCallInfo,
    setIsMuted, setIsOnHold, setIsSpeaker, setIncomingInvite,
    startTimer, stopTimer, resetCall,
  } = useCall();

  // Attach listeners only once (singleton)
  useEffect(() => {
    const voice = getVoice();
    if (!voice || listenersAttached) return;
    listenersAttached = true;

    console.log('[Voice] Attaching event listeners (one-time)');

    voice.on('callInvite', (callInvite) => {
      console.log('[Voice] >>> callInvite received! From:', callInvite?.from);
      setIncomingInvite(callInvite);
    });

    voice.on('cancelledCallInvite', () => {
      console.log('[Voice] >>> cancelledCallInvite');
      setIncomingInvite(null);
    });

    voice.on('error', (error) => {
      console.error('[Voice] >>> error:', error);
    });

    voice.on('registered', () => {
      console.log('[Voice] >>> registered');
    });

    voice.on('unregistered', () => {
      console.log('[Voice] >>> unregistered');
    });

    // No cleanup — singleton lives for app lifetime
  }, []);

  const register = useCallback(async () => {
    const voice = getVoice();
    console.log('[register] Voice available:', !!voice);
    if (!voice) {
      console.warn('[register] Twilio Voice SDK not available');
      return null;
    }
    try {
      console.log('[register] Fetching access token...');
      const { data } = await api.get('/api/token');
      console.log('[register] Token received, identity:', data.identity);
      try {
        const parts = data.token.split('.');
        const payload = JSON.parse(atob(parts[1]));
        console.log('[register] Token grants:', JSON.stringify(payload.grants));
      } catch (e) {}
      console.log('[register] Registering for push...');
      await voice.register(data.token);
      console.log('[register] Successfully registered!');
      return data.token;
    } catch (err) {
      console.error('[register] Failed:', err?.message || err);
      return null;
    }
  }, []);

  const makeCall = useCallback(async (toNumber) => {
    const voice = getVoice();
    if (!voice) {
      console.warn('Twilio Voice SDK not available');
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

      return call;
    } catch (err) {
      console.error('Make call error:', err);
      resetCall();
      throw err;
    }
  }, []);

  const acceptIncoming = useCallback(async (callInvite) => {
    try {
      console.log('[acceptIncoming] Accepting call from:', callInvite?.from);
      setCallState('connecting');
      setCallInfo({
        number: callInvite.from || 'Unknown',
        direction: 'inbound',
      });

      const call = await callInvite.accept();
      console.log('[acceptIncoming] Call accepted');
      setActiveCall(call);
      setIncomingInvite(null);

      call.on('connected', () => {
        console.log('[acceptIncoming] Call connected');
        setCallState('connected');
        startTimer();
        if (InCallManager) InCallManager.start({ media: 'audio' });
      });

      call.on('disconnected', () => {
        console.log('[acceptIncoming] Call disconnected');
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
      console.error('[acceptIncoming] Error:', err);
      setIncomingInvite(null);
      resetCall();
      throw err;
    }
  }, []);

  const rejectIncoming = useCallback(async (callInvite) => {
    try {
      console.log('[rejectIncoming] Rejecting call');
      await callInvite.reject();
      setIncomingInvite(null);
    } catch (err) {
      console.error('[rejectIncoming] Error:', err);
      setIncomingInvite(null);
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
