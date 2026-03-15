import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Vibration, StatusBar } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
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
      <StatusBar barStyle="light-content" backgroundColor="#0f172a" />
      <View style={styles.callerInfo}>
        <View style={styles.avatar}>
          <Ionicons name="call" size={50} color="#22c55e" />
        </View>
        <Text style={styles.label}>Incoming Call</Text>
        <Text style={styles.callerNumber}>
          {incomingInvite?.from || 'Unknown Caller'}
        </Text>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity style={styles.rejectButton} onPress={handleReject}>
          <Ionicons name="close" size={32} color="#fff" />
          <Text style={styles.actionLabel}>Decline</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.acceptButton} onPress={handleAccept}>
          <Ionicons name="checkmark" size={32} color="#fff" />
          <Text style={styles.actionLabel}>Accept</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    justifyContent: 'space-between',
    paddingVertical: 80,
  },
  callerInfo: {
    alignItems: 'center',
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#2a2a3e',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
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
  rejectButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#ef4444',
    justifyContent: 'center',
    alignItems: 'center',
  },
  acceptButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#22c55e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionLabel: {
    color: '#fff',
    fontSize: 12,
    marginTop: 4,
  },
});
