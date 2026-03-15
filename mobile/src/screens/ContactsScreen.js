import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  TextInput, Alert, RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import api from '../services/api';
import useTwilioVoice from '../hooks/useTwilioVoice';

const STATUS_FILTERS = ['All', 'New', 'Called', 'Interested', 'Not Interested', 'Callback'];
const STATUS_VALUES = {
  'All': null, 'New': 'new', 'Called': 'called',
  'Interested': 'interested', 'Not Interested': 'not_interested', 'Callback': 'callback',
};

export default function ContactsScreen() {
  const navigation = useNavigation();
  const { makeCall } = useTwilioVoice();
  const [contacts, setContacts] = useState([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [refreshing, setRefreshing] = useState(false);

  const loadContacts = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const params = {};
      if (search) params.search = search;
      if (STATUS_VALUES[statusFilter]) params.status = STATUS_VALUES[statusFilter];

      const { data } = await api.get('/api/contacts', { params });
      setContacts(data.contacts);
    } catch {}
    finally {
      setRefreshing(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  async function handleDelete(id) {
    Alert.alert('Delete Contact', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/api/contacts/${id}`);
            setContacts((prev) => prev.filter((c) => c.id !== id));
          } catch {
            Alert.alert('Error', 'Failed to delete contact');
          }
        },
      },
    ]);
  }

  async function handleCall(phone) {
    try {
      await makeCall(phone);
    } catch (err) {
      Alert.alert('Call Failed', err.message);
    }
  }

  function getStatusColor(status) {
    switch (status) {
      case 'new': return '#3b82f6';
      case 'called': return '#f59e0b';
      case 'interested': return '#22c55e';
      case 'not_interested': return '#ef4444';
      case 'callback': return '#8b5cf6';
      default: return '#94a3b8';
    }
  }

  return (
    <View style={styles.container}>
      {/* Search */}
      <View style={styles.searchBar}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search contacts..."
          placeholderTextColor="#64748b"
          value={search}
          onChangeText={setSearch}
        />
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => navigation.navigate('ContactDetail', { contact: null })}
        >
          <Text style={styles.addButtonText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      {/* Status Filter */}
      <FlatList
        horizontal
        data={STATUS_FILTERS}
        keyExtractor={(item) => item}
        showsHorizontalScrollIndicator={false}
        style={styles.filterList}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.filterChip, statusFilter === item && styles.filterChipActive]}
            onPress={() => setStatusFilter(item)}
          >
            <Text style={[styles.filterChipText, statusFilter === item && styles.filterChipTextActive]}>
              {item}
            </Text>
          </TouchableOpacity>
        )}
      />

      {/* Contacts List */}
      <FlatList
        data={contacts}
        keyExtractor={(item) => item.id.toString()}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadContacts(true)}
            tintColor="#3b82f6"
          />
        }
        ListEmptyComponent={
          <Text style={styles.emptyText}>No contacts found</Text>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.contactItem}
            onPress={() => navigation.navigate('ContactDetail', { contact: item })}
          >
            <View style={styles.contactInfo}>
              <Text style={styles.contactName}>{item.name || 'No Name'}</Text>
              <Text style={styles.contactPhone}>{item.phone}</Text>
              {item.company && (
                <Text style={styles.contactCompany}>{item.company}</Text>
              )}
            </View>
            <View style={styles.contactActions}>
              <View style={[styles.statusDot, { backgroundColor: getStatusColor(item.status) }]} />
              <TouchableOpacity
                style={styles.callIcon}
                onPress={() => handleCall(item.phone)}
              >
                <Text style={{ fontSize: 20 }}>📞</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.deleteIcon}
                onPress={() => handleDelete(item.id)}
              >
                <Text style={{ fontSize: 18, color: '#ef4444' }}>🗑️</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  searchBar: {
    flexDirection: 'row',
    padding: 12,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    backgroundColor: '#1e293b',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#fff',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  addButton: {
    backgroundColor: '#3b82f6',
    borderRadius: 10,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  addButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  filterList: {
    maxHeight: 44,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#1e293b',
    marginRight: 8,
  },
  filterChipActive: {
    backgroundColor: '#3b82f6',
  },
  filterChipText: {
    color: '#94a3b8',
    fontSize: 13,
  },
  filterChipTextActive: {
    color: '#fff',
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  contactInfo: {
    flex: 1,
  },
  contactName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
  contactPhone: {
    color: '#94a3b8',
    fontSize: 13,
    marginTop: 2,
  },
  contactCompany: {
    color: '#64748b',
    fontSize: 12,
    marginTop: 2,
  },
  contactActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  callIcon: {
    padding: 4,
  },
  deleteIcon: {
    padding: 4,
  },
  emptyText: {
    color: '#64748b',
    textAlign: 'center',
    marginTop: 40,
    fontSize: 16,
  },
});
