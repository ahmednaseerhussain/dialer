import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import api from '../services/api';

const POLL_MS = 5000;

function normalizeNumber(raw) {
  let n = (raw || '').trim().replace(/[^\d+]/g, '');
  if (n && !n.startsWith('+')) n = `+${n}`;
  return n;
}

export default function ChatScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  // Edge-to-edge display: without this the input row sits behind the
  // Android system navigation bar.
  const insets = useSafeAreaInsets();

  // Compose mode when opened without a number (from the FAB)
  const [number, setNumber] = useState(route.params?.number || null);
  const [toInput, setToInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const pollRef = useRef(null);

  useEffect(() => {
    navigation.setOptions({
      title: route.params?.name || number || 'New Message',
    });
  }, [navigation, route.params?.name, number]);

  const loadThread = useCallback(async (num) => {
    if (!num) return;
    try {
      const { data } = await api.get('/api/messages/thread', { params: { number: num } });
      setMessages(data.messages || []);
    } catch {}
  }, []);

  // Poll the thread while the screen is focused — inbound SMS arrives via
  // webhook on the server; the app sees it on the next poll.
  useFocusEffect(
    useCallback(() => {
      if (!number) return undefined;
      loadThread(number);
      pollRef.current = setInterval(() => loadThread(number), POLL_MS);
      return () => {
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      };
    }, [number, loadThread])
  );

  async function handleSend() {
    const body = draft.trim();
    if (!body || sending) return;

    let target = number;
    if (!target) {
      target = normalizeNumber(toInput);
      if (!/^\+\d{8,15}$/.test(target)) {
        Alert.alert('Invalid Number', 'Use international format: country code + full number (e.g. +923001234567).');
        return;
      }
    }

    setSending(true);
    try {
      const { data } = await api.post('/api/messages/send', { to: target, body });
      setDraft('');
      if (!number) setNumber(target); // lock compose mode; polling starts
      if (data.message) {
        setMessages((prev) => [data.message, ...prev]);
      } else {
        loadThread(target);
      }
    } catch (err) {
      Alert.alert('Send Failed', err?.response?.data?.error || err?.message || 'Could not send message');
    } finally {
      setSending(false);
    }
  }

  function formatTime(dateStr) {
    const d = new Date(dateStr);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    if (sameDay) return time;
    return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${time}`;
  }

  function renderMessage({ item }) {
    const isOut = item.direction === 'outbound';
    return (
      <View style={[styles.bubbleRow, isOut ? styles.bubbleRowOut : styles.bubbleRowIn]}>
        <View style={[styles.bubble, isOut ? styles.bubbleOut : styles.bubbleIn]}>
          <Text style={styles.bubbleText}>{item.body}</Text>
          <Text style={[styles.bubbleMeta, isOut && styles.bubbleMetaOut]}>
            {formatTime(item.created_at)}
            {isOut ? ` · ${item.status || 'sent'}` : ''}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {/* Compose mode: destination number input */}
      {!number && (
        <View style={styles.toRow}>
          <Text style={styles.toLabel}>To</Text>
          <TextInput
            style={styles.toInput}
            placeholder="+923001234567"
            placeholderTextColor="#64748b"
            value={toInput}
            onChangeText={setToInput}
            keyboardType="phone-pad"
            autoFocus
          />
        </View>
      )}

      <FlatList
        data={messages}
        keyExtractor={(item) => (item.message_sid || String(item.id))}
        renderItem={renderMessage}
        inverted={messages.length > 0}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          number ? null : (
            <Text style={styles.emptyHint}>Enter a number and write your message below</Text>
          )
        }
      />

      {/* Input row */}
      <View style={[styles.inputRow, { paddingBottom: 10 + insets.bottom }]}>
        <TextInput
          style={styles.input}
          placeholder="Type a message…"
          placeholderTextColor="#64748b"
          value={draft}
          onChangeText={setDraft}
          multiline
          maxLength={1600}
        />
        <TouchableOpacity
          style={[styles.sendButton, (!draft.trim() || sending) && styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={!draft.trim() || sending}
          activeOpacity={0.7}
        >
          {sending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="send" size={20} color="#fff" />
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  toRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  toLabel: {
    color: '#94a3b8',
    fontSize: 15,
    marginRight: 12,
    fontWeight: '600',
  },
  toInput: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
    paddingVertical: 6,
  },
  listContent: {
    padding: 14,
    flexGrow: 1,
  },
  emptyHint: {
    color: '#475569',
    textAlign: 'center',
    marginTop: 40,
    fontSize: 14,
  },
  bubbleRow: {
    flexDirection: 'row',
    marginVertical: 3,
  },
  bubbleRowOut: {
    justifyContent: 'flex-end',
  },
  bubbleRowIn: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: '80%',
    borderRadius: 16,
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  bubbleOut: {
    backgroundColor: '#2563eb',
    borderBottomRightRadius: 4,
  },
  bubbleIn: {
    backgroundColor: '#1e293b',
    borderBottomLeftRadius: 4,
  },
  bubbleText: {
    color: '#fff',
    fontSize: 15,
    lineHeight: 20,
  },
  bubbleMeta: {
    color: '#64748b',
    fontSize: 10,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  bubbleMetaOut: {
    color: 'rgba(255,255,255,0.65)',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
    backgroundColor: '#0f172a',
  },
  input: {
    flex: 1,
    backgroundColor: '#1e293b',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    color: '#fff',
    fontSize: 15,
    maxHeight: 120,
    marginRight: 10,
  },
  sendButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#3b82f6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#334155',
  },
});
