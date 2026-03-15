import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, TextInput, ScrollView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useCall } from '../context/CallContext';
import useTwilioVoice from '../hooks/useTwilioVoice';

const DTMF_KEYS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['*', '0', '#'],
];

export default function ActiveCallScreen() {
  const navigation = useNavigation();
  const {
    activeCall, callState, callInfo,
    isMuted, isOnHold, callDuration,
  } = useCall();
  const { hangup, toggleMute, toggleHold, sendDigits } = useTwilioVoice();
  const [notes, setNotes] = useState('');
  const [showDTMF, setShowDTMF] = useState(false);

  function formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  async function handleHangup() {
    if (activeCall) {
      await hangup(activeCall);
    }
    navigation.goBack();
  }

  function handleDTMF(digit) {
    if (activeCall) {
      sendDigits(activeCall, digit);
    }
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Caller Info */}
        <View style={styles.callerInfo}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {callInfo?.name?.[0] || '📞'}
            </Text>
          </View>
          <Text style={styles.callerNumber}>{callInfo?.number || 'Unknown'}</Text>
          <Text style={styles.callStatus}>
            {callState === 'connecting' ? 'Connecting...' :
             callState === 'connected' ? formatTime(callDuration) :
             callState === 'reconnecting' ? 'Reconnecting...' :
             'Call Ended'}
          </Text>
          <Text style={styles.direction}>
            {callInfo?.direction === 'inbound' ? '↙️ Incoming' : '↗️ Outgoing'}
          </Text>
        </View>

        {/* DTMF Keypad */}
        {showDTMF && (
          <View style={styles.dtmfPad}>
            {DTMF_KEYS.map((row, i) => (
              <View key={i} style={styles.dtmfRow}>
                {row.map((key) => (
                  <TouchableOpacity
                    key={key}
                    style={styles.dtmfButton}
                    onPress={() => handleDTMF(key)}
                  >
                    <Text style={styles.dtmfText}>{key}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ))}
          </View>
        )}

        {/* Notes */}
        <TextInput
          style={styles.notesInput}
          placeholder="Call notes..."
          placeholderTextColor="#64748b"
          value={notes}
          onChangeText={setNotes}
          multiline
          numberOfLines={3}
        />

        {/* Controls */}
        <View style={styles.controls}>
          <TouchableOpacity
            style={[styles.controlButton, isMuted && styles.controlActive]}
            onPress={() => activeCall && toggleMute(activeCall, isMuted)}
          >
            <Text style={styles.controlIcon}>{isMuted ? '🔇' : '🎤'}</Text>
            <Text style={styles.controlLabel}>Mute</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.controlButton, isOnHold && styles.controlActive]}
            onPress={() => activeCall && toggleHold(activeCall, isOnHold)}
          >
            <Text style={styles.controlIcon}>{isOnHold ? '▶️' : '⏸️'}</Text>
            <Text style={styles.controlLabel}>Hold</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.controlButton}
            onPress={() => setShowDTMF(!showDTMF)}
          >
            <Text style={styles.controlIcon}>🔢</Text>
            <Text style={styles.controlLabel}>Keypad</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.controlButton}>
            <Text style={styles.controlIcon}>🔊</Text>
            <Text style={styles.controlLabel}>Speaker</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Hangup */}
      <TouchableOpacity style={styles.hangupButton} onPress={handleHangup}>
        <Text style={styles.hangupText}>End Call</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  content: {
    padding: 20,
    alignItems: 'center',
  },
  callerInfo: {
    alignItems: 'center',
    marginTop: 40,
    marginBottom: 30,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#1e293b',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarText: {
    fontSize: 32,
  },
  callerNumber: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '600',
    marginBottom: 8,
  },
  callStatus: {
    color: '#22c55e',
    fontSize: 18,
    fontWeight: '500',
    marginBottom: 4,
  },
  direction: {
    color: '#94a3b8',
    fontSize: 14,
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginVertical: 20,
  },
  controlButton: {
    alignItems: 'center',
    padding: 12,
  },
  controlActive: {
    backgroundColor: '#334155',
    borderRadius: 12,
  },
  controlIcon: {
    fontSize: 28,
    marginBottom: 4,
  },
  controlLabel: {
    color: '#94a3b8',
    fontSize: 12,
  },
  dtmfPad: {
    marginVertical: 16,
  },
  dtmfRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 8,
  },
  dtmfButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#1e293b',
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 10,
  },
  dtmfText: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '500',
  },
  notesInput: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: '#fff',
    fontSize: 14,
    width: '100%',
    minHeight: 80,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: '#334155',
  },
  hangupButton: {
    backgroundColor: '#ef4444',
    borderRadius: 16,
    paddingVertical: 18,
    marginHorizontal: 20,
    marginBottom: 40,
    alignItems: 'center',
  },
  hangupText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
});
