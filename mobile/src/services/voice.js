// Singleton wrapper around @twilio/voice-react-native-sdk
// Avoids the multiple-`new Voice()` problem and ensures listeners
// are attached exactly once for the entire app lifetime.

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

// Handlers wired by the React layer (CallProvider/VoiceBootstrap).
// Using a single object so the latest-mounted bootstrap can replace them.
const handlers = {
  onCallInvite: null,
  onCallInviteAccepted: null,
  onCallInviteRejected: null,
  onCancelledCallInvite: null,
  onRegistered: null,
  onRegistrationFailed: null,
  onError: null,
};

function getVoice() {
  if (!Voice) return null;
  if (!voiceInstance) {
    voiceInstance = new Voice();
  }
  if (!listenersAttached) {
    // Use string event names — they're stable across SDK versions
    voiceInstance.on('callInvite', (invite) => {
      console.log('[voice] callInvite from', invite?.getFrom?.() || invite?.from);
      handlers.onCallInvite && handlers.onCallInvite(invite);
    });
    voiceInstance.on('callInviteAccepted', (invite, call) => {
      // Fired when user accepts via the native push notification UI
      console.log('[voice] callInviteAccepted');
      handlers.onCallInviteAccepted && handlers.onCallInviteAccepted(invite, call);
    });
    voiceInstance.on('callInviteRejected', (invite) => {
      console.log('[voice] callInviteRejected');
      handlers.onCallInviteRejected && handlers.onCallInviteRejected(invite);
    });
    voiceInstance.on('cancelledCallInvite', (invite) => {
      console.log('[voice] cancelledCallInvite');
      handlers.onCancelledCallInvite && handlers.onCancelledCallInvite(invite);
    });
    voiceInstance.on('registered', () => {
      console.log('[voice] device registered for incoming calls');
      handlers.onRegistered && handlers.onRegistered();
    });
    voiceInstance.on('registrationFailed', (err) => {
      console.warn('[voice] registrationFailed:', err?.message || err);
      handlers.onRegistrationFailed && handlers.onRegistrationFailed(err);
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

export { getVoice, InCallManager };
