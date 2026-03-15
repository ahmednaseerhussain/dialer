import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList, TextInput, Alert,
  PermissionsAndroid, Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useCall } from '../context/CallContext';
import { useAuth } from '../context/AuthContext';
import useTwilioVoice from '../hooks/useTwilioVoice';
import api from '../services/api';

const KEYPAD = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['*', '0', '#'],
];

export default function DialerScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const { callState, incomingInvite } = useCall();
  const { makeCall, register, isAvailable } = useTwilioVoice();
  const [number, setNumber] = useState('');
  const [recentCalls, setRecentCalls] = useState([]);

  useEffect(() => {
    loadRecentCalls();
  }, []);

  async function ensureMicPermission() {
    if (Platform.OS !== 'android') return true;
    const check = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
    if (check) return true;
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      {
        title: 'Microphone Permission',
        message: 'Kraydl Dialer needs microphone access to make calls.',
        buttonPositive: 'Allow',
      }
    );
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  }

  // Navigate to incoming call screen when invite arrives
  useEffect(() => {
    if (incomingInvite) {
      navigation.navigate('IncomingCall');
    }
  }, [incomingInvite]);

  // Navigate to active call screen when call connects
  useEffect(() => {
    if (callState === 'connecting' || callState === 'connected') {
      navigation.navigate('ActiveCall');
    }
  }, [callState]);

  async function loadRecentCalls() {
    try {
      const { data } = await api.get('/api/calls', { params: { limit: 5 } });
      setRecentCalls(data.calls);
    } catch {}
  }

  function handleKeyPress(key) {
    setNumber((prev) => prev + key);
  }

  function handleBackspace() {
    setNumber((prev) => prev.slice(0, -1));
  }

  async function handleCall() {
    const dialNumber = number.trim();
    if (!dialNumber) {
      Alert.alert('Error', 'Enter a number to call');
      return;
    }

    const hasMic = await ensureMicPermission();
    if (!hasMic) {
      Alert.alert('Permission Required', 'Microphone permission is needed to make calls.');
      return;
    }

    // Ensure E.164 format
    const formatted = dialNumber.startsWith('+') ? dialNumber : `+${dialNumber}`;
    try {
      await makeCall(formatted);
    } catch (err) {
      Alert.alert('Call Failed', err.message || 'Could not place call');
    }
  }

  function formatDuration(sec) {
    if (!sec) return '0:00';
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  return (
    <View style={styles.container}>
      {/* Status */}
      <View style={styles.statusBar}>
        <Text style={styles.agentName}>{user?.full_name}</Text>
        <View style={[styles.statusBadge, callState !== 'idle' && styles.statusBusy]}>
          <Text style={styles.statusText}>
            {callState === 'idle' ? 'Available' : 'On Call'}
          </Text>
        </View>
      </View>

      {/* Number Display */}
      <View style={styles.numberDisplay}>
        <TextInput
          style={styles.numberText}
          value={number}
          onChangeText={setNumber}
          placeholder="Enter number"
          placeholderTextColor="#64748b"
          keyboardType="phone-pad"
        />
        {number.length > 0 && (
          <TouchableOpacity onPress={handleBackspace} style={styles.backspace}>
            <Text style={styles.backspaceText}>⌫</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Keypad */}
      <View style={styles.keypad}>
        {KEYPAD.map((row, i) => (
          <View key={i} style={styles.keypadRow}>
            {row.map((key) => (
              <TouchableOpacity
                key={key}
                style={styles.keypadButton}
                onPress={() => handleKeyPress(key)}
              >
                <Text style={styles.keypadText}>{key}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ))}
      </View>

      {/* Call Button */}
      <TouchableOpacity style={styles.callButton} onPress={handleCall}>
        <Text style={styles.callButtonText}>📞 Call</Text>
      </TouchableOpacity>

      {/* Recent Calls */}
      {recentCalls.length > 0 && (
        <View style={styles.recentSection}>
          <Text style={styles.recentTitle}>Recent</Text>
          <FlatList
            data={recentCalls}
            keyExtractor={(item) => item.id.toString()}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.recentItem}
                onPress={() => {
                  const redialNumber = item.direction === 'outbound' ? item.to_number : item.from_number;
                  setNumber(redialNumber || '');
                }}
              >
                <Text style={styles.recentIcon}>
                  {item.direction === 'outbound' ? '↗️' : '↙️'}
                </Text>
                <View style={styles.recentInfo}>
                  <Text style={styles.recentNumber}>
                    {item.direction === 'outbound' ? item.to_number : item.from_number}
                  </Text>
                  <Text style={styles.recentMeta}>
                    {formatDuration(item.duration_sec)} · {item.status}
                  </Text>
                </View>
              </TouchableOpacity>
            )}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  statusBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  agentName: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  statusBadge: {
    backgroundColor: '#22c55e',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusBusy: {
    backgroundColor: '#ef4444',
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  numberDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 16,
  },
  numberText: {
    flex: 1,
    color: '#fff',
    fontSize: 24,
    fontWeight: '500',
    letterSpacing: 2,
  },
  backspace: {
    padding: 8,
  },
  backspaceText: {
    color: '#94a3b8',
    fontSize: 24,
  },
  keypad: {
    marginBottom: 16,
  },
  keypadRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 8,
  },
  keypadButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#1e293b',
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 12,
  },
  keypadText: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '500',
  },
  callButton: {
    backgroundColor: '#22c55e',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  callButtonText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  recentSection: {
    flex: 1,
  },
  recentTitle: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  recentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  recentIcon: {
    fontSize: 18,
    marginRight: 12,
  },
  recentInfo: {
    flex: 1,
  },
  recentNumber: {
    color: '#fff',
    fontSize: 16,
  },
  recentMeta: {
    color: '#64748b',
    fontSize: 12,
    marginTop: 2,
  },
});
