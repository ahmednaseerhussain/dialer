import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList, TextInput, Alert,
  PermissionsAndroid, Platform, StatusBar,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useCall } from '../context/CallContext';
import { useAuth } from '../context/AuthContext';
import useTwilioVoice from '../hooks/useTwilioVoice';
import api from '../services/api';

const KEYPAD = [
  [{ key: '1', sub: '' }, { key: '2', sub: 'ABC' }, { key: '3', sub: 'DEF' }],
  [{ key: '4', sub: 'GHI' }, { key: '5', sub: 'JKL' }, { key: '6', sub: 'MNO' }],
  [{ key: '7', sub: 'PQRS' }, { key: '8', sub: 'TUV' }, { key: '9', sub: 'WXYZ' }],
  [{ key: '*', sub: '' }, { key: '0', sub: '+' }, { key: '#', sub: '' }],
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
      <StatusBar barStyle="light-content" backgroundColor="#1a1a2e" />
      
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.agentName}>{user?.full_name}</Text>
        <View style={[styles.statusBadge, callState !== 'idle' && styles.statusBusy]}>
          <View style={styles.statusDot} />
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
          placeholder="Enter phone number"
          placeholderTextColor="#666"
          keyboardType="phone-pad"
          selectionColor="#4CAF50"
        />
        {number.length > 0 && (
          <TouchableOpacity onPress={handleBackspace} style={styles.backspace}>
            <MaterialIcons name="backspace" size={28} color="#fff" />
          </TouchableOpacity>
        )}
      </View>

      {/* Keypad */}
      <View style={styles.keypad}>
        {KEYPAD.map((row, i) => (
          <View key={i} style={styles.keypadRow}>
            {row.map((item) => (
              <TouchableOpacity
                key={item.key}
                style={styles.keypadButton}
                onPress={() => handleKeyPress(item.key)}
                activeOpacity={0.7}
              >
                <Text style={styles.keypadText}>{item.key}</Text>
                {item.sub ? <Text style={styles.keypadSubText}>{item.sub}</Text> : null}
              </TouchableOpacity>
            ))}
          </View>
        ))}
      </View>

      {/* Call Button */}
      <TouchableOpacity 
        style={[styles.callButton, !number && styles.callButtonDisabled]} 
        onPress={handleCall}
        disabled={!number}
        activeOpacity={0.8}
      >
        <Ionicons name="call" size={32} color="#fff" />
      </TouchableOpacity>

      {/* Recent Calls */}
      {recentCalls.length > 0 && (
        <View style={styles.recentSection}>
          <Text style={styles.recentTitle}>RECENT</Text>
          <FlatList
            data={recentCalls}
            keyExtractor={(item) => item.id.toString()}
            renderItem={({ item }) => {
              const isOutbound = item.direction === 'outbound';
              const displayNumber = isOutbound ? item.to_number : item.from_number;
              return (
                <TouchableOpacity
                  style={styles.recentItem}
                  onPress={() => setNumber(displayNumber || '')}
                  activeOpacity={0.7}
                >
                  <View style={styles.recentIcon}>
                    <MaterialIcons 
                      name={isOutbound ? 'call-made' : (item.status === 'no-answer' ? 'call-missed' : 'call-received')} 
                      size={20} 
                      color={isOutbound ? '#4CAF50' : (item.status === 'no-answer' ? '#f44336' : '#2196F3')} 
                    />
                  </View>
                  <View style={styles.recentInfo}>
                    <Text style={styles.recentNumber}>{displayNumber || 'Unknown'}</Text>
                    <Text style={styles.recentMeta}>
                      {formatDuration(item.duration_sec)} · {item.status}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={handleCall} style={styles.recentCallBtn}>
                    <Ionicons name="call" size={20} color="#4CAF50" />
                  </TouchableOpacity>
                </TouchableOpacity>
              );
            }}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  agentName: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4CAF50',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusBusy: {
    backgroundColor: '#f44336',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#fff',
    marginRight: 6,
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  numberDisplay: {
    paddingHorizontal: 20,
    paddingVertical: 24,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a3e',
  },
  numberText: {
    flex: 1,
    color: '#fff',
    fontSize: 32,
    fontWeight: '300',
    letterSpacing: 2,
  },
  backspace: {
    padding: 8,
  },
  keypad: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  keypadRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
  },
  keypadButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#2a2a3e',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  keypadText: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '400',
  },
  keypadSubText: {
    color: '#888',
    fontSize: 10,
    marginTop: 2,
    letterSpacing: 1,
  },
  callButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginTop: 24,
    elevation: 4,
    shadowColor: '#4CAF50',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  callButtonDisabled: {
    backgroundColor: '#444',
    elevation: 0,
  },
  recentSection: {
    flex: 1,
    marginTop: 24,
    paddingHorizontal: 20,
  },
  recentTitle: {
    color: '#888',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1,
    marginBottom: 12,
  },
  recentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a3e',
  },
  recentIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2a2a3e',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  recentInfo: {
    flex: 1,
  },
  recentNumber: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
  recentMeta: {
    color: '#888',
    fontSize: 12,
    marginTop: 2,
  },
  recentCallBtn: {
    padding: 8,
  },
});
