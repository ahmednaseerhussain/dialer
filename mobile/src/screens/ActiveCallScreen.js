import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, TextInput, ScrollView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
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
    isMuted, isOnHold, isSpeaker, callDuration,
  } = useCall();
  const { hangup, toggleMute, toggleHold, sendDigits, toggleSpeaker } = useTwilioVoice();
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
            {callInfo?.name?.[0] ? (
              <Text style={styles.avatarText}>{callInfo.name[0]}</Text>
            ) : (
              <Ionicons name="person" size={36} color="#94a3b8" />
            )}
          </View>
          <Text style={styles.callerNumber}>{callInfo?.number || 'Unknown'}</Text>
          <Text style={[
            styles.callStatus,
            callState === 'connecting' && styles.callStatusConnecting,
            callState === 'disconnected' && styles.callStatusEnded,
          ]}>
            {callState === 'connecting' ? 'Connecting...' :
             callState === 'connected' ? formatTime(callDuration) :
             callState === 'reconnecting' ? 'Reconnecting...' :
             'Call Ended'}
          </Text>
          <View style={styles.directionBadge}>
            <Ionicons
              name={callInfo?.direction === 'inbound' ? 'arrow-down' : 'arrow-up'}
              size={14}
              color={callInfo?.direction === 'inbound' ? '#22c55e' : '#3b82f6'}
            />
            <Text style={styles.directionText}>
              {callInfo?.direction === 'inbound' ? 'Incoming' : 'Outgoing'}
            </Text>
          </View>
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
                    activeOpacity={0.6}
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
            activeOpacity={0.7}
          >
            <View style={[styles.controlIconWrap, isMuted && styles.controlIconWrapActive]}>
              <Ionicons name={isMuted ? 'mic-off' : 'mic'} size={24} color={isMuted ? '#ef4444' : '#fff'} />
            </View>
            <Text style={[styles.controlLabel, isMuted && styles.controlLabelActive]}>Mute</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.controlButton, isOnHold && styles.controlActive]}
            onPress={() => activeCall && toggleHold(activeCall, isOnHold)}
            activeOpacity={0.7}
          >
            <View style={[styles.controlIconWrap, isOnHold && styles.controlIconWrapActive]}>
              <Ionicons name={isOnHold ? 'play' : 'pause'} size={24} color={isOnHold ? '#f59e0b' : '#fff'} />
            </View>
            <Text style={[styles.controlLabel, isOnHold && styles.controlLabelActive]}>Hold</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.controlButton, showDTMF && styles.controlActive]}
            onPress={() => setShowDTMF(!showDTMF)}
            activeOpacity={0.7}
          >
            <View style={[styles.controlIconWrap, showDTMF && styles.controlIconWrapActive]}>
              <Ionicons name="keypad" size={24} color="#fff" />
            </View>
            <Text style={styles.controlLabel}>Keypad</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.controlButton, isSpeaker && styles.controlActive]}
            onPress={() => toggleSpeaker(isSpeaker)}
            activeOpacity={0.7}
          >
            <View style={[styles.controlIconWrap, isSpeaker && styles.controlIconWrapActive]}>
              <Ionicons name={isSpeaker ? 'volume-high' : 'volume-medium'} size={24} color={isSpeaker ? '#3b82f6' : '#fff'} />
            </View>
            <Text style={[styles.controlLabel, isSpeaker && styles.controlLabelActive]}>Speaker</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Hangup */}
      <TouchableOpacity style={styles.hangupButton} onPress={handleHangup} activeOpacity={0.7}>
        <Ionicons name="call" size={28} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
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
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#1e293b',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#334155',
  },
  avatarText: {
    fontSize: 34,
    color: '#fff',
    fontWeight: '700',
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
    marginBottom: 8,
  },
  callStatusConnecting: {
    color: '#f59e0b',
  },
  callStatusEnded: {
    color: '#ef4444',
  },
  directionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  directionText: {
    color: '#94a3b8',
    fontSize: 13,
    marginLeft: 4,
    fontWeight: '500',
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginVertical: 20,
  },
  controlButton: {
    alignItems: 'center',
    padding: 8,
  },
  controlActive: {},
  controlIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#1e293b',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  controlIconWrapActive: {
    backgroundColor: '#334155',
    borderWidth: 1,
    borderColor: '#475569',
  },
  controlLabel: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '500',
  },
  controlLabelActive: {
    color: '#fff',
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
    borderRadius: 14,
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
    paddingVertical: 16,
    marginHorizontal: 20,
    marginBottom: 40,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    elevation: 4,
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  hangupText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
});
