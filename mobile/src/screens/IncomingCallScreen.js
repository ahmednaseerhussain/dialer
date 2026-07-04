import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Vibration } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useCall } from '../context/CallContext';
import useTwilioVoice from '../hooks/useTwilioVoice';

let InCallManager = null;
try {
  InCallManager = require('react-native-incall-manager').default;
} catch {
  InCallManager = null;
}

function getInviteFrom(invite) {
  if (!invite) return null;
  // SDK exposes getter methods; fall back to legacy props
  return invite.getFrom?.() ?? invite.from ?? invite._from ?? null;
}

export default function IncomingCallScreen() {
  const navigation = useNavigation();
  const { incomingInvite } = useCall();
  const { acceptIncoming, rejectIncoming } = useTwilioVoice();
  const busyRef = React.useRef(false);

  React.useEffect(() => {
    // Vibrate + play ringtone while the screen is visible
    Vibration.vibrate([0, 1000, 1000], true);
    if (InCallManager) {
      try {
        InCallManager.startRingtone('_BUNDLE_');
      } catch (e) {
        console.warn('startRingtone failed:', e?.message || e);
      }
    }
    return () => {
      Vibration.cancel();
      if (InCallManager) {
        try { InCallManager.stopRingtone(); } catch {}
      }
    };
  }, []);

  // If the invite gets cancelled (caller hangs up) or accepted via the
  // native notification while we're still here, leave the screen.
  React.useEffect(() => {
    if (!incomingInvite) {
      navigation.canGoBack() && navigation.goBack();
    }
  }, [incomingInvite, navigation]);

  async function handleAccept() {
    if (!incomingInvite || busyRef.current) return;
    busyRef.current = true;
    Vibration.cancel();
    if (InCallManager) { try { InCallManager.stopRingtone(); } catch {} }
    try {
      await acceptIncoming(incomingInvite);
      navigation.replace('ActiveCall');
    } catch (err) {
      console.error('Accept failed:', err);
      busyRef.current = false;
      navigation.canGoBack() && navigation.goBack();
    }
  }

  async function handleReject() {
    if (busyRef.current) return;
    if (!incomingInvite) {
      navigation.canGoBack() && navigation.goBack();
      return;
    }
    busyRef.current = true;
    try {
      await rejectIncoming(incomingInvite);
    } finally {
      navigation.canGoBack() && navigation.goBack();
    }
  }

  const fromDisplay = getInviteFrom(incomingInvite) || 'Unknown Caller';

  return (
    <View style={styles.container}>
      <View style={styles.callerInfo}>
        <View style={styles.avatarRing}>
          <View style={styles.avatar}>
            <Ionicons name="call" size={40} color="#22c55e" />
          </View>
        </View>
        <Text style={styles.label}>Incoming Call</Text>
        <Text style={styles.callerNumber}>{fromDisplay}</Text>
      </View>

      <View style={styles.actions}>
        <View style={styles.actionWrap}>
          <TouchableOpacity style={styles.rejectButton} onPress={handleReject} activeOpacity={0.7}>
            <Ionicons name="close" size={36} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.actionLabel}>Decline</Text>
        </View>

        <View style={styles.actionWrap}>
          <TouchableOpacity style={styles.acceptButton} onPress={handleAccept} activeOpacity={0.7}>
            <Ionicons name="call" size={32} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.actionLabel}>Accept</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
    justifyContent: 'space-between',
    paddingVertical: 80,
  },
  callerInfo: {
    alignItems: 'center',
  },
  avatarRing: {
    width: 112,
    height: 112,
    borderRadius: 56,
    borderWidth: 2,
    borderColor: 'rgba(34,197,94,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#1e293b',
    justifyContent: 'center',
    alignItems: 'center',
  },
  label: {
    color: '#22c55e',
    fontSize: 16,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: 12,
  },
  callerNumber: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 40,
  },
  actionWrap: {
    alignItems: 'center',
  },
  rejectButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#ef4444',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  acceptButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#22c55e',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#22c55e',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  actionLabel: {
    color: '#94a3b8',
    fontSize: 13,
    marginTop: 8,
    fontWeight: '500',
  },
});
