import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, FlatList, PermissionsAndroid, Platform,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import api from '../services/api';
import useTwilioVoice from '../hooks/useTwilioVoice';

const STATUSES = ['new', 'called', 'interested', 'not_interested', 'callback'];

export default function ContactDetailScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { makeCall } = useTwilioVoice();

  const existing = route.params?.contact;
  const isNew = !existing;

  const [name, setName] = useState(existing?.name || '');
  const [phone, setPhone] = useState(existing?.phone || '');
  const [company, setCompany] = useState(existing?.company || '');
  const [email, setEmail] = useState(existing?.email || '');
  const [status, setStatus] = useState(existing?.status || 'new');
  const [notes, setNotes] = useState(existing?.notes || '');
  const [callHistory, setCallHistory] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (existing?.phone) {
      loadCallHistory();
    }
  }, []);

  async function loadCallHistory() {
    try {
      const { data } = await api.get('/api/calls', { params: { limit: 10 } });
      const filtered = data.calls.filter(
        (c) => c.to_number === existing.phone || c.from_number === existing.phone
      );
      setCallHistory(filtered);
    } catch {}
  }

  async function handleSave() {
    if (!phone.trim()) {
      Alert.alert('Error', 'Phone number is required');
      return;
    }
    if (!/^\+[1-9]\d{6,14}$/.test(phone.trim())) {
      Alert.alert('Error', 'Phone must be in E.164 format (e.g., +923001234567)');
      return;
    }

    setSaving(true);
    try {
      const payload = { name, phone: phone.trim(), company, email, status, notes };
      if (isNew) {
        await api.post('/api/contacts', payload);
        Alert.alert('Success', 'Contact created');
      } else {
        await api.patch(`/api/contacts/${existing.id}`, payload);
        Alert.alert('Success', 'Contact updated');
      }
      navigation.goBack();
    } catch (err) {
      Alert.alert('Error', err.response?.data?.error || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function handleCall() {
    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
        Alert.alert('Permission Required', 'Microphone permission is needed to make calls.');
        return;
      }
    }
    try {
      await makeCall(phone.trim());
    } catch (err) {
      Alert.alert('Call Failed', err.message);
    }
  }

  function formatDuration(sec) {
    if (!sec) return '0:00';
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{isNew ? 'New Contact' : 'Edit Contact'}</Text>

      <TextInput
        style={styles.input}
        placeholder="Full Name"
        placeholderTextColor="#64748b"
        value={name}
        onChangeText={setName}
      />
      <TextInput
        style={styles.input}
        placeholder="Phone (+923001234567)"
        placeholderTextColor="#64748b"
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
      />
      <TextInput
        style={styles.input}
        placeholder="Company"
        placeholderTextColor="#64748b"
        value={company}
        onChangeText={setCompany}
      />
      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor="#64748b"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
      />

      {/* Status Picker */}
      <Text style={styles.label}>Status</Text>
      <View style={styles.statusRow}>
        {STATUSES.map((s) => (
          <TouchableOpacity
            key={s}
            style={[styles.statusChip, status === s && styles.statusChipActive]}
            onPress={() => setStatus(s)}
          >
            <Text style={[styles.statusChipText, status === s && styles.statusChipTextActive]}>
              {s.replace('_', ' ')}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <TextInput
        style={[styles.input, { minHeight: 80, textAlignVertical: 'top' }]}
        placeholder="Notes"
        placeholderTextColor="#64748b"
        value={notes}
        onChangeText={setNotes}
        multiline
      />

      <View style={styles.buttonRow}>
        <TouchableOpacity
          style={[styles.saveButton, saving && { opacity: 0.6 }]}
          onPress={handleSave}
          disabled={saving}
        >
          <Text style={styles.saveButtonText}>
            {isNew ? 'Create Contact' : 'Update Contact'}
          </Text>
        </TouchableOpacity>

        {!isNew && phone && (
          <TouchableOpacity style={styles.callButton} onPress={handleCall}>
            <Ionicons name="call" size={18} color="#fff" />
            <Text style={styles.callButtonText}>Call</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Call History for this contact */}
      {callHistory.length > 0 && (
        <View style={styles.historySection}>
          <Text style={styles.historyTitle}>Call History</Text>
          {callHistory.map((c) => (
            <View key={c.id} style={styles.historyItem}>
              <View style={styles.historyIcon}>
                <MaterialIcons 
                  name={c.direction === 'outbound' ? 'call-made' : 'call-received'} 
                  size={18} 
                  color={c.direction === 'outbound' ? '#22c55e' : '#3b82f6'} 
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.historyDate}>
                  {new Date(c.created_at).toLocaleString()}
                </Text>
                <Text style={styles.historyMeta}>
                  {formatDuration(c.duration_sec)} · {c.status}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  title: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 20,
  },
  input: {
    backgroundColor: '#2a2a3e',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#fff',
    fontSize: 15,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  label: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  statusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  statusChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: '#2a2a3e',
  },
  statusChipActive: {
    backgroundColor: '#3b82f6',
  },
  statusChipText: {
    color: '#94a3b8',
    fontSize: 12,
    textTransform: 'capitalize',
  },
  statusChipTextActive: {
    color: '#fff',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  saveButton: {
    flex: 1,
    backgroundColor: '#3b82f6',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  callButton: {
    backgroundColor: '#22c55e',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  callButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  historySection: {
    marginTop: 28,
  },
  historyTitle: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  historyIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#2a2a3e',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  historyDate: {
    color: '#fff',
    fontSize: 14,
  },
  historyMeta: {
    color: '#64748b',
    fontSize: 12,
    marginTop: 2,
  },
});
