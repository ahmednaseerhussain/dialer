import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import api from '../services/api';

const POLL_MS = 10000;

export default function MessagesScreen() {
  const navigation = useNavigation();
  const [conversations, setConversations] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const pollRef = useRef(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const { data } = await api.get('/api/messages');
      setConversations(data.conversations || []);
      setLoaded(true);
    } catch {}
    finally {
      if (isRefresh) setRefreshing(false);
    }
  }, []);

  // Load on focus and poll while the tab is visible — inbound SMS has no
  // push channel, so polling is how new messages appear.
  useFocusEffect(
    useCallback(() => {
      load();
      pollRef.current = setInterval(load, POLL_MS);
      return () => {
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      };
    }, [load])
  );

  function formatTime(dateStr) {
    const d = new Date(dateStr);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    if (sameDay) {
      return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function renderConversation({ item }) {
    const title = item.contact_name || item.counterpart;
    const unread = parseInt(item.unread_count, 10) || 0;
    const snippet = (item.direction === 'outbound' ? 'You: ' : '') + (item.body || '');

    return (
      <TouchableOpacity
        style={styles.convItem}
        onPress={() => navigation.navigate('Chat', {
          number: item.counterpart,
          name: item.contact_name || null,
        })}
      >
        <View style={[styles.avatar, unread > 0 && styles.avatarUnread]}>
          <Text style={styles.avatarText}>
            {(item.contact_name || item.counterpart || '?').replace('+', '')[0]?.toUpperCase()}
          </Text>
        </View>
        <View style={styles.convInfo}>
          <Text style={[styles.convTitle, unread > 0 && styles.convTitleUnread]} numberOfLines={1}>
            {title}
          </Text>
          <Text style={[styles.convSnippet, unread > 0 && styles.convSnippetUnread]} numberOfLines={1}>
            {snippet}
          </Text>
        </View>
        <View style={styles.convMeta}>
          <Text style={styles.convTime}>{formatTime(item.created_at)}</Text>
          {unread > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadText}>{unread > 99 ? '99+' : unread}</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={conversations}
        keyExtractor={(item) => item.counterpart}
        renderItem={renderConversation}
        ListEmptyComponent={
          loaded ? (
            <View style={styles.empty}>
              <Ionicons name="chatbubbles-outline" size={48} color="#334155" />
              <Text style={styles.emptyText}>No messages yet</Text>
              <Text style={styles.emptyHint}>Tap the button below to start a conversation</Text>
            </View>
          ) : null
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load(true)}
            tintColor="#3b82f6"
          />
        }
      />

      {/* Compose new message */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('Chat', {})}
        activeOpacity={0.8}
      >
        <Ionicons name="create-outline" size={26} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  convItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1e293b',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarUnread: {
    backgroundColor: '#1d4ed8',
  },
  avatarText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  convInfo: {
    flex: 1,
    marginRight: 8,
  },
  convTitle: {
    color: '#e2e8f0',
    fontSize: 16,
    fontWeight: '500',
  },
  convTitleUnread: {
    color: '#fff',
    fontWeight: '700',
  },
  convSnippet: {
    color: '#64748b',
    fontSize: 13,
    marginTop: 2,
  },
  convSnippetUnread: {
    color: '#94a3b8',
    fontWeight: '600',
  },
  convMeta: {
    alignItems: 'flex-end',
  },
  convTime: {
    color: '#64748b',
    fontSize: 12,
  },
  unreadBadge: {
    backgroundColor: '#3b82f6',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
  },
  unreadText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  empty: {
    alignItems: 'center',
    marginTop: 80,
  },
  emptyText: {
    color: '#64748b',
    fontSize: 16,
    marginTop: 12,
  },
  emptyHint: {
    color: '#475569',
    fontSize: 13,
    marginTop: 4,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#3b82f6',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
});
