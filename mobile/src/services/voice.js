// Singleton wrapper around @twilio/voice-react-native-sdk
// Avoids the multiple-`new Voice()` problem and ensures listeners
// are attached exactly once for the entire app lifetime.

import api from './api';

let Voice = null;
try {
  // eslint-disable-next-line global-require
  Voice = require('@twilio/voice-react-native-sdk').Voice;
} catch {
  Voice = null;
}

let InCallManager = null;
try {
  // eslint-disable-next-line global-require
  InCallManager = require('react-native-incall-manager').default;
} catch {
  InCallManager = null;
}

let voiceInstance = null;
let listenersAttached = false;

// Registration lifecycle state
let wantRegistered = false;
let lastRegisterAt = 0;
let registerInFlight = null;

// Handlers wired by the React layer (CallProvider/VoiceBootstrap).
// Using a single object so the latest-mounted bootstrap can replace them.
const handlers = {
  onCallInvite: null,
  onCallInviteAccepted: null,
  onCallInviteRejected: null,
  onCancelledCallInvite: null,
  onCallInviteNotificationTapped: null,
  onRegistered: null,
  onError: null,
};

// SDK v1.x: accepted/rejected/cancelled/notificationTapped are events on the
// CallInvite instance, NOT on Voice. (The old Voice-level names like
// 'callInviteAccepted' never fire on this SDK version.)
function wireInvite(invite) {
  try {
    invite.on('accepted', (call) => {
      console.log('[voice] invite accepted');
      handlers.onCallInviteAccepted && handlers.onCallInviteAccepted(invite, call);
    });
    invite.on('rejected', () => {
      console.log('[voice] invite rejected');
      handlers.onCallInviteRejected && handlers.onCallInviteRejected(invite);
    });
    invite.on('cancelled', (err) => {
      console.log('[voice] invite cancelled', err?.message || '');
      handlers.onCancelledCallInvite && handlers.onCancelledCallInvite(invite, err);
    });
    invite.on('notificationTapped', () => {
      console.log('[voice] invite notification tapped');
      handlers.onCallInviteNotificationTapped && handlers.onCallInviteNotificationTapped(invite);
    });
  } catch (e) {
    console.warn('[voice] failed to wire invite events:', e?.message || e);
  }
}

function getVoice() {
  if (!Voice) return null;
  if (!voiceInstance) {
    voiceInstance = new Voice();
  }
  if (!listenersAttached) {
    voiceInstance.on('callInvite', (invite) => {
      console.log('[voice] callInvite from', invite?.getFrom?.() || invite?.from);
      wireInvite(invite);
      handlers.onCallInvite && handlers.onCallInvite(invite);
    });
    voiceInstance.on('registered', () => {
      console.log('[voice] device registered for incoming calls');
      handlers.onRegistered && handlers.onRegistered();
    });
    voiceInstance.on('unregistered', () => {
      console.log('[voice] device unregistered');
      // If we didn't ask for this (token expiry, push token rotation), get
      // back online — otherwise this device silently stops receiving calls.
      if (wantRegistered) {
        setTimeout(() => {
          registerVoice({ force: true }).catch(() => {});
        }, 5000);
      }
    });
    voiceInstance.on('error', (err) => {
      console.warn('[voice] error:', err?.message || err);
      handlers.onError && handlers.onError(err);
    });
    listenersAttached = true;
  }
  return voiceInstance;
}

export function setVoiceHandlers(next) {
  Object.assign(handlers, next);
}

export function isVoiceAvailable() {
  return !!Voice;
}

// Recover an invite the JS layer may have missed. On a cold start from a
// notification tap (app was killed), the native `callInvite` event can fire
// before JS attaches its listener, so the invite is never surfaced and the
// app just opens to its normal screen. Querying the SDK for still-pending
// invites and replaying the first one through the same handler fixes that.
export async function recoverPendingInvite() {
  const voice = getVoice();
  if (!voice?.getCallInvites) return null;
  try {
    const invites = await voice.getCallInvites();
    const first = invites && invites.size ? Array.from(invites.values())[0] : null;
    if (first) {
      console.log('[voice] recovered pending invite from', first?.getFrom?.() || first?.from);
      wireInvite(first);
      handlers.onCallInvite && handlers.onCallInvite(first);
      return first;
    }
  } catch (e) {
    console.warn('[voice] recoverPendingInvite failed:', e?.message || e);
  }
  return null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Register this device for incoming calls. Retries because the backend
// (Render free tier) can cold-start slower than one request timeout —
// a single silent failure here means this phone never rings.
// Resolves to { ok, error } so callers can surface/report failures.
export async function registerVoice({ force = false } = {}) {
  const voice = getVoice();
  if (!voice) {
    console.warn('[voice] SDK not available, skipping registration');
    return { ok: false, error: 'voice SDK unavailable' };
  }
  if (registerInFlight) return registerInFlight;
  if (!force && Date.now() - lastRegisterAt < 60 * 1000) return { ok: true };

  registerInFlight = (async () => {
    const delays = [0, 3000, 8000];
    let lastError = null;
    for (let attempt = 0; attempt < delays.length; attempt += 1) {
      if (delays[attempt]) await sleep(delays[attempt]);
      try {
        const { data } = await api.get('/api/token');
        await voice.register(data.token);
        wantRegistered = true;
        lastRegisterAt = Date.now();
        return { ok: true };
      } catch (err) {
        lastError = err?.response?.data?.error || err?.message || String(err);
        console.warn(`[voice] registration attempt ${attempt + 1} failed:`, lastError);
      }
    }
    return { ok: false, error: lastError };
  })();

  try {
    return await registerInFlight;
  } finally {
    registerInFlight = null;
  }
}

// Must be called BEFORE the auth token is cleared on logout, otherwise the
// /api/token call 401s and the stale push binding keeps ringing this device.
export async function unregisterVoice() {
  wantRegistered = false;
  lastRegisterAt = 0;
  const voice = getVoice();
  if (!voice) return;
  try {
    const { data } = await api.get('/api/token');
    await voice.unregister(data.token);
  } catch (err) {
    console.warn('[voice] unregister failed:', err?.message || err);
  }
}

// Route call audio via the SDK's own audio-device API (AudioSwitch on
// Android). Mixing InCallManager with the SDK fights AudioSwitch and makes
// the speakerphone work only sometimes — InCallManager is a fallback only.
export async function setSpeakerphoneOn(on) {
  const voice = getVoice();
  if (voice?.getAudioDevices) {
    try {
      const { audioDevices } = await voice.getAudioDevices();
      const wantType = on ? 'speaker' : 'earpiece';
      const device = (audioDevices || []).find(
        (d) => String(d?.type).toLowerCase() === wantType
      );
      if (device) {
        await device.select();
        return true;
      }
    } catch (err) {
      console.warn('[voice] audio device select failed:', err?.message || err);
    }
  }
  if (InCallManager) {
    try {
      InCallManager.setForceSpeakerphoneOn(on);
      return true;
    } catch (err) {
      console.warn('[voice] InCallManager speaker fallback failed:', err?.message || err);
    }
  }
  return false;
}

export { getVoice, InCallManager };
