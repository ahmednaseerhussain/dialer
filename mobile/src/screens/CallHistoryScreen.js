import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import api from '../services/api';

const FILTERS = ['All', 'Outbound', 'Inbound'];

export default function CallHistoryScreen() {
  const navigation = useNavigation();
  const [calls, setCalls] = useState([]);
  const [filter, setFilter] = useState('All');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadCalls = useCallback(async (pageNum = 1, isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const params = { page: pageNum, limit: 20 };
      if (filter !== 'All') params.direction = filter.toLowerCase();

      const { data } = await api.get('/api/calls', { params });
      if (pageNum === 1) {
        setCalls(data.calls);
      } else {
        setCalls((prev) => [...prev, ...data.calls]);
      }
      setPage(pageNum);
      setTotalPages(data.pagination.pages);
    } catch {}
    finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter]);

  useEffect(() => {
    loadCalls(1);
  }, [loadCalls]);

  function formatDuration(sec) {
    if (!sec) return '0:00';
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  function formatTime(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleString('en-US', {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }

  function getStatusColor(status) {
    switch (status) {
      case 'completed': return '#22c55e';
      case 'no-answer': return '#f59e0b';
      case 'busy': return '#f97316';
      case 'failed': return '#ef4444';
      default: return '#94a3b8';
    }
  }

  function renderCall({ item }) {
    const isOutbound = item.direction === 'outbound';
    const displayNumber = isOutbound ? item.to_number : item.from_number;

    return (
      <TouchableOpacity
        style={styles.callItem}
        onPress={() => {
          // Could navigate to detail or redial
        }}
      >
        <View style={styles.directionIconWrap}>
          <Ionicons
            name={isOutbound ? 'arrow-redo' : item.status === 'no-answer' ? 'call-outline' : 'arrow-undo'}
            size={18}
            color={isOutbound ? '#3b82f6' : item.status === 'no-answer' ? '#f59e0b' : '#22c55e'}
          />
        </View>
        <View style={styles.callInfo}>
          <Text style={styles.callNumber}>{displayNumber || 'Unknown'}</Text>
          <Text style={styles.callMeta}>
            {formatTime(item.created_at)} · {formatDuration(item.duration_sec)}
          </Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) + '22' }]}>
          <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
            {item.status || 'unknown'}
          </Text>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.container}>
      {/* Filter Tabs */}
      <View style={styles.filters}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.filterTab, filter === f && styles.filterActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
              {f}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={calls}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderCall}
        ListEmptyComponent={
          !loading && (
            <Text style={styles.emptyText}>No calls yet</Text>
          )
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadCalls(1, true)}
            tintColor="#3b82f6"
          />
        }
        onEndReached={() => {
          if (page < totalPages && !loading) {
            loadCalls(page + 1);
          }
        }}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          loading && page > 1 ? <ActivityIndicator color="#3b82f6" style={{ padding: 16 }} /> : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  filters: {
    flexDirection: 'row',
    padding: 12,
    gap: 8,
  },
  filterTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#1e293b',
  },
  filterActive: {
    backgroundColor: '#3b82f6',
  },
  filterText: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '500',
  },
  filterTextActive: {
    color: '#fff',
  },
  callItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  directionIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1e293b',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  callInfo: {
    flex: 1,
  },
  callNumber: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
  callMeta: {
    color: '#64748b',
    fontSize: 12,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  emptyText: {
    color: '#64748b',
    textAlign: 'center',
    marginTop: 40,
    fontSize: 16,
  },
});
