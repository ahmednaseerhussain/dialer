import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput, Alert,
  PermissionsAndroid, Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useCall } from '../context/CallContext';
import { useAuth } from '../context/AuthContext';
import useTwilioVoice from '../hooks/useTwilioVoice';
import api from '../services/api';

const KEYPAD = [
  [{ digit: '1', sub: '' }, { digit: '2', sub: 'ABC' }, { digit: '3', sub: 'DEF' }],
  [{ digit: '4', sub: 'GHI' }, { digit: '5', sub: 'JKL' }, { digit: '6', sub: 'MNO' }],
  [{ digit: '7', sub: 'PQRS' }, { digit: '8', sub: 'TUV' }, { digit: '9', sub: 'WXYZ' }],
  [{ digit: '*', sub: '' }, { digit: '0', sub: '+' }, { digit: '#', sub: '' }],
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
    // Request all required permissions then register for incoming calls
    async function initRegistration() {
      if (Platform.OS === 'android') {
        const perms = [PermissionsAndroid.PERMISSIONS.RECORD_AUDIO];
        if (Platform.Version >= 31) {
          perms.push(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT);
        }
        if (Platform.Version >= 33) {
          perms.push(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
        }
        const results = await PermissionsAndroid.requestMultiple(perms);
        console.log('[DialerScreen] Permissions:', JSON.stringify(results));
      }
      // Delay to ensure Voice SDK is initialized in its own useEffect
      setTimeout(() => {
        console.log('[DialerScreen] Calling register()...');
        register();
      }, 1500);
    }
    initRegistration();
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
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      {/* Status */}
      <View style={styles.statusBar}>
        <Text style={styles.agentName}>{user?.full_name}</Text>
        <View style={[styles.statusBadge, callState !== 'idle' && styles.statusBusy]}>
          <View style={[styles.statusDot, callState !== 'idle' && styles.statusDotBusy]} />
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
            <Ionicons name="backspace-outline" size={24} color="#94a3b8" />
          </TouchableOpacity>
        )}
      </View>

      {/* Keypad */}
      <View style={styles.keypad}>
        {KEYPAD.map((row, i) => (
          <View key={i} style={styles.keypadRow}>
            {row.map(({ digit, sub }) => (
              <TouchableOpacity
                key={digit}
                style={styles.keypadButton}
                onPress={() => handleKeyPress(digit)}
                activeOpacity={0.6}
              >
                <Text style={styles.keypadText}>{digit}</Text>
                {sub ? <Text style={styles.keypadSub}>{sub}</Text> : null}
              </TouchableOpacity>
            ))}
          </View>
        ))}
      </View>

      {/* Call Button */}
      <TouchableOpacity style={styles.callButton} onPress={handleCall} activeOpacity={0.7}>
        <Ionicons name="call" size={24} color="#fff" />
      </TouchableOpacity>

      {/* Recent Calls */}
      {recentCalls.length > 0 && (
        <View style={styles.recentSection}>
          <Text style={styles.recentTitle}>Recent</Text>
          {recentCalls.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={styles.recentItem}
              onPress={() => {
                const redialNumber = item.direction === 'outbound' ? item.to_number : item.from_number;
                setNumber(redialNumber || '');
              }}
            >
              <View style={[styles.recentIconWrap, item.direction === 'inbound' && styles.recentIconInbound]}>
                <Ionicons
                  name={item.direction === 'outbound' ? 'call-outline' : 'call-outline'}
                  size={16}
                  color={item.direction === 'outbound' ? '#3b82f6' : '#22c55e'}
                />
              </View>
              <View style={styles.recentInfo}>
                <Text style={styles.recentNumber}>
                  {item.direction === 'outbound' ? item.to_number : item.from_number}
                </Text>
                <Text style={styles.recentMeta}>
                  {item.direction === 'outbound' ? 'Outgoing' : 'Incoming'} · {formatDuration(item.duration_sec)} · {item.status}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#475569" />
            </TouchableOpacity>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 32,
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
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(34,197,94,0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  statusBusy: {
    backgroundColor: 'rgba(239,68,68,0.15)',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#22c55e',
    marginRight: 6,
  },
  statusDotBusy: {
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
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#334155',
  },
  numberText: {
    flex: 1,
    color: '#fff',
    fontSize: 26,
    fontWeight: '500',
    letterSpacing: 2,
  },
  backspace: {
    padding: 8,
  },
  keypad: {
    marginBottom: 16,
    alignItems: 'center',
  },
  keypadRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 10,
  },
  keypadButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#1e293b',
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 10,
  },
  keypadText: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '500',
  },
  keypadSub: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 2,
    marginTop: -2,
  },
  callButton: {
    backgroundColor: '#22c55e',
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: 24,
    elevation: 4,
    shadowColor: '#22c55e',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  recentSection: {
    marginTop: 4,
  },
  recentTitle: {
    color: '#64748b',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  recentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  recentIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(59,130,246,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  recentIconInbound: {
    backgroundColor: 'rgba(34,197,94,0.12)',
  },
  recentInfo: {
    flex: 1,
  },
  recentNumber: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '500',
  },
  recentMeta: {
    color: '#64748b',
    fontSize: 12,
    marginTop: 2,
  },
});
