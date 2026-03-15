import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal, StatusBar, Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useCall } from '../context/CallContext';
import useTwilioVoice from '../hooks/useTwilioVoice';

const KEYPAD = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['*', '0', '#'],
];

export default function ActiveCallScreen() {
  const navigation = useNavigation();
  const {
    activeCall, callState, callInfo, isMuted, isOnHold, isSpeaker,
    callDuration,
  } = useCall();
  const { hangup, toggleMute, toggleHold, sendDigits, toggleSpeaker } = useTwilioVoice();
  const [showKeypad, setShowKeypad] = useState(false);
  const [dtmf, setDtmf] = useState('');

  const displayNumber = callInfo?.number || 'Unknown';
  const displayName = callInfo?.name || '';

  useEffect(() => {
    if (callState === 'disconnected') {
      navigation.replace('Main');
    }
  }, [callState]);

  function formatDuration(sec) {
    if (!sec) return '00:00';
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  function handleHangup() {
    Alert.alert('End Call', 'Are you sure you want to end this call?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'End Call', style: 'destructive', onPress: () => hangup() },
    ]);
  }

  function handleMute() {
    toggleMute();
  }

  function handleHold() {
    toggleHold();
  }

  function handleSpeaker() {
    toggleSpeaker(!isSpeaker);
  }

  function handleKeypadPress(digit) {
    setDtmf((prev) => prev + digit);
    sendDigits(digit);
  }

  function handleKeypadClose() {
    setShowKeypad(false);
    setDtmf('');
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1a1a2e" />

      {/* Call Info */}
      <View style={styles.callInfo}>
        <Text style={styles.callState}>
          {callState === 'connecting' && 'Calling...'}
          {callState === 'ringing' && 'Ringing...'}
          {callState === 'connected' && (isOnHold ? 'On Hold' : 'Connected')}
        </Text>
        
        <View style={styles.contactCircle}>
          <Ionicons name="person" size={60} color="#4CAF50" />
        </View>

        {displayName ? (
          <>
            <Text style={styles.contactName}>{displayName}</Text>
            <Text style={styles.phoneNumber}>{displayNumber}</Text>
          </>
        ) : (
          <Text style={styles.contactName}>{displayNumber}</Text>
        )}

        {callState === 'connected' && (
          <Text style={styles.duration}>{formatDuration(callDuration)}</Text>
        )}
      </View>

      {/* Controls */}
      <View style={styles.controls}>
        <View style={styles.controlRow}>
          <TouchableOpacity 
            style={[styles.controlButton, isMuted && styles.controlButtonActive]}
            onPress={handleMute}
            activeOpacity={0.7}
          >
            <Ionicons 
              name={isMuted ? 'mic-off' : 'mic'} 
              size={28} 
              color={isMuted ? '#f44336' : '#fff'} 
            />
            <Text style={[styles.controlLabel, isMuted && styles.controlLabelActive]}>Mute</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.controlButton}
            onPress={() => setShowKeypad(true)}
            activeOpacity={0.7}
          >
            <MaterialCommunityIcons name="dialpad" size={28} color="#fff" />
            <Text style={styles.controlLabel}>Keypad</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.controlButton, isSpeaker && styles.controlButtonActive]}
            onPress={handleSpeaker}
            activeOpacity={0.7}
          >
            <Ionicons 
              name={isSpeaker ? 'volume-high' : 'volume-medium'} 
              size={28} 
              color={isSpeaker ? '#4CAF50' : '#fff'} 
            />
            <Text style={[styles.controlLabel, isSpeaker && styles.controlLabelActive]}>Speaker</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.controlRow}>
          <TouchableOpacity 
            style={[styles.controlButton, isOnHold && styles.controlButtonActive]}
            onPress={handleHold}
            activeOpacity={0.7}
          >
            <Ionicons 
              name={isOnHold ? 'play' : 'pause'} 
              size={28} 
              color={isOnHold ? '#FF9800' : '#fff'} 
            />
            <Text style={[styles.controlLabel, isOnHold && styles.controlLabelActive]}>
              {isOnHold ? 'Resume' : 'Hold'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.controlButton}
            disabled
            activeOpacity={0.7}
          >
            <MaterialCommunityIcons name="account-plus" size={28} color="#666" />
            <Text style={[styles.controlLabel, { color: '#666' }]}>Add Call</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.controlButton}
            disabled
            activeOpacity={0.7}
          >
            <MaterialCommunityIcons name="phone-forward" size={28} color="#666" />
            <Text style={[styles.controlLabel, { color: '#666' }]}>Transfer</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Hang Up Button */}
      <TouchableOpacity 
        style={styles.hangupButton}
        onPress={handleHangup}
        activeOpacity={0.8}
      >
        <Ionicons name="call" size={32} color="#fff" />
      </TouchableOpacity>

      {/* DTMF Keypad Modal */}
      <Modal
        visible={showKeypad}
        transparent
        animationType="slide"
        onRequestClose={handleKeypadClose}
      >
        <TouchableOpacity 
          style={styles.modalOverlay} 
          activeOpacity={1} 
          onPress={handleKeypadClose}
        >
          <TouchableOpacity 
            style={styles.keypadModal} 
            activeOpacity={1}
          >
            <View style={styles.keypadHeader}>
              <Text style={styles.dtmfDisplay}>{dtmf || 'Enter digits'}</Text>
              <TouchableOpacity onPress={handleKeypadClose}>
                <Ionicons name="close" size={28} color="#fff" />
              </TouchableOpacity>
            </View>

            <View style={styles.keypadGrid}>
              {KEYPAD.map((row, i) => (
                <View key={i} style={styles.keypadRow}>
                  {row.map((digit) => (
                    <TouchableOpacity
                      key={digit}
                      style={styles.keypadBtn}
                      onPress={() => handleKeypadPress(digit)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.keypadDigit}>{digit}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ))}
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    justifyContent: 'space-between',
    paddingVertical: 40,
  },
  callInfo: {
    alignItems: 'center',
    paddingTop: 40,
  },
  callState: {
    color: '#888',
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 32,
  },
  contactCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#2a2a3e',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 3,
    borderColor: '#4CAF50',
  },
  contactName: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '600',
    marginBottom: 8,
  },
  phoneNumber: {
    color: '#888',
    fontSize: 18,
    marginBottom: 12,
  },
  duration: {
    color: '#4CAF50',
    fontSize: 20,
    fontWeight: '500',
    marginTop: 8,
  },
  controls: {
    paddingHorizontal: 20,
  },
  controlRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 32,
  },
  controlButton: {
    alignItems: 'center',
    width: 80,
  },
  controlButtonActive: {
    opacity: 1,
  },
  controlLabel: {
    color: '#fff',
    fontSize: 12,
    marginTop: 8,
  },
  controlLabelActive: {
    color: '#4CAF50',
  },
  hangupButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#f44336',
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    elevation: 4,
    shadowColor: '#f44336',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    transform: [{ rotate: '135deg' }],
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'flex-end',
  },
  keypadModal: {
    backgroundColor: '#1a1a2e',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 32,
  },
  keypadHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a3e',
  },
  dtmfDisplay: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '300',
    letterSpacing: 4,
  },
  keypadGrid: {
    padding: 20,
  },
  keypadRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
  },
  keypadBtn: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#2a2a3e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  keypadDigit: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '400',
  },
});
