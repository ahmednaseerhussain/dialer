import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Vibration } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useCall } from '../context/CallContext';
import useTwilioVoice from '../hooks/useTwilioVoice';

export default function IncomingCallScreen() {
  const navigation = useNavigation();
  const { incomingInvite } = useCall();
  const { acceptIncoming, rejectIncoming } = useTwilioVoice();

  React.useEffect(() => {
    Vibration.vibrate([0, 500, 200, 500], true);
    return () => Vibration.cancel();
  }, []);

  async function handleAccept() {
    if (incomingInvite) {
      await acceptIncoming(incomingInvite);
      navigation.replace('ActiveCall');
    }
  }

  async function handleReject() {
    if (incomingInvite) {
      await rejectIncoming(incomingInvite);
      navigation.goBack();
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.callerInfo}>
        <View style={styles.avatarRing}>
          <View style={styles.avatar}>
            <Ionicons name="call" size={40} color="#22c55e" />
          </View>
        </View>
        <Text style={styles.label}>Incoming Call</Text>
        <Text style={styles.callerNumber}>
          {incomingInvite?.from || 'Unknown Caller'}
        </Text>
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
