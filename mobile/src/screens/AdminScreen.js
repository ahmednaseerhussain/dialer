import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, Switch, ActivityIndicator, Linking,
} from 'react-native';
import api from '../services/api';

export default function AdminScreen() {
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState([]);
  const [locations, setLocations] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Form fields
  const [formUsername, setFormUsername] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formFullName, setFormFullName] = useState('');
  const [formTwilioNumber, setFormTwilioNumber] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [usersRes, statsRes, locRes] = await Promise.allSettled([
        api.get('/api/admin/users'),
        api.get('/api/admin/stats'),
        api.get('/api/location'),
      ]);
      if (usersRes.status === 'fulfilled') setUsers(usersRes.value.data.users);
      if (statsRes.status === 'fulfilled') setStats(statsRes.value.data.stats);
      if (locRes.status === 'fulfilled') setLocations(locRes.value.data.locations || []);
      else console.warn('Failed to load locations:', locRes.reason?.message);
    } catch (err) {
      Alert.alert('Error', 'Failed to load admin data');
    } finally {
      setLoading(false);
    }
  }

  function openMap(lat, lng, name) {
    const url = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    Linking.openURL(url);
  }

  function formatLocationTime(ts) {
    if (!ts) return 'Never';
    const d = new Date(ts);
    const now = new Date();
    const diffMin = Math.round((now - d) / 60000);
    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.round(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    return d.toLocaleDateString();
  }

  function resetForm() {
    setFormUsername('');
    setFormPassword('');
    setFormFullName('');
    setFormTwilioNumber('');
    setEditingUser(null);
    setShowForm(false);
  }

  async function handleCreateUser() {
    if (!formUsername.trim() || !formPassword.trim() || !formFullName.trim()) {
      Alert.alert('Error', 'Username, password, and name are required');
      return;
    }
    try {
      await api.post('/api/admin/users', {
        username: formUsername.trim(),
        password: formPassword,
        full_name: formFullName.trim(),
        twilio_number: formTwilioNumber.trim() || undefined,
      });
      Alert.alert('Success', 'Agent created');
      resetForm();
      loadData();
    } catch (err) {
      Alert.alert('Error', err.response?.data?.error || 'Failed to create user');
    }
  }

  async function handleUpdateUser() {
    if (!editingUser) return;
    try {
      const payload = {};
      if (formFullName.trim()) payload.full_name = formFullName.trim();
      if (formTwilioNumber.trim()) payload.twilio_number = formTwilioNumber.trim();
      if (formPassword.trim()) payload.password = formPassword;

      await api.patch(`/api/admin/users/${editingUser.id}`, payload);
      Alert.alert('Success', 'Agent updated');
      resetForm();
      loadData();
    } catch (err) {
      Alert.alert('Error', err.response?.data?.error || 'Failed to update');
    }
  }

  async function handleToggleActive(user) {
    try {
      await api.patch(`/api/admin/users/${user.id}`, { is_active: !user.is_active });
      loadData();
    } catch {
      Alert.alert('Error', 'Failed to update user');
    }
  }

  function startEdit(user) {
    setEditingUser(user);
    setFormFullName(user.full_name);
    setFormTwilioNumber(user.twilio_number || '');
    setFormUsername(user.username);
    setFormPassword('');
    setShowForm(true);
  }

  function getAgentStats(userId) {
    return stats.find((s) => s.id === userId);
  }

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>Team Management</Text>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => { resetForm(); setShowForm(true); }}
        >
          <Text style={styles.addBtnText}>+ Add Agent</Text>
        </TouchableOpacity>
      </View>

      {/* Add/Edit Form */}
      {showForm && (
        <View style={styles.formCard}>
          <Text style={styles.formTitle}>
            {editingUser ? `Edit: ${editingUser.username}` : 'New Agent'}
          </Text>
          {!editingUser && (
            <TextInput
              style={styles.input}
              placeholder="Username"
              placeholderTextColor="#64748b"
              value={formUsername}
              onChangeText={setFormUsername}
              autoCapitalize="none"
            />
          )}
          <TextInput
            style={styles.input}
            placeholder={editingUser ? 'New Password (leave blank to keep)' : 'Password'}
            placeholderTextColor="#64748b"
            value={formPassword}
            onChangeText={setFormPassword}
            secureTextEntry
          />
          <TextInput
            style={styles.input}
            placeholder="Full Name"
            placeholderTextColor="#64748b"
            value={formFullName}
            onChangeText={setFormFullName}
          />
          <TextInput
            style={styles.input}
            placeholder="Twilio Number (+1XXXXXXXXXX)"
            placeholderTextColor="#64748b"
            value={formTwilioNumber}
            onChangeText={setFormTwilioNumber}
            keyboardType="phone-pad"
          />
          <View style={styles.formButtons}>
            <TouchableOpacity style={styles.cancelBtn} onPress={resetForm}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.submitBtn}
              onPress={editingUser ? handleUpdateUser : handleCreateUser}
            >
              <Text style={styles.submitBtnText}>
                {editingUser ? 'Update' : 'Create'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Agent Locations */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Agent Locations</Text>
        <TouchableOpacity onPress={async () => {
          try {
            const locRes = await api.get('/api/location');
            setLocations(locRes.data.locations || []);
          } catch (err) {
            console.warn('Refresh locations failed:', err?.message);
          }
        }}>
          <Text style={styles.refreshBtn}>↻ Refresh</Text>
        </TouchableOpacity>
      </View>
      {locations.map((agent) => (
        <View key={agent.id} style={styles.locationCard}>
          <View style={styles.locationInfo}>
            <View style={styles.locationDot(!!agent.latitude)} />
            <View>
              <Text style={styles.locationName}>{agent.full_name}</Text>
              <Text style={styles.locationSub}>
                {agent.latitude
                  ? `${parseFloat(agent.latitude).toFixed(5)}, ${parseFloat(agent.longitude).toFixed(5)}`
                  : 'No location yet'}
              </Text>
              <Text style={styles.locationTime}>
                Updated: {formatLocationTime(agent.location_updated_at)}
              </Text>
            </View>
          </View>
          {agent.latitude ? (
            <TouchableOpacity
              style={styles.mapBtn}
              onPress={() => openMap(agent.latitude, agent.longitude, agent.full_name)}
            >
              <Text style={styles.mapBtnText}>Map</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ))}

      {/* Team Stats Dashboard */}
      <Text style={styles.sectionTitle}>Today's Performance</Text>
      {stats.map((agent) => (
        <View key={agent.id} style={styles.statsCard}>
          <Text style={styles.statsName}>{agent.full_name}</Text>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{agent.calls_today}</Text>
              <Text style={styles.statLabel}>Today</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{agent.total_calls}</Text>
              <Text style={styles.statLabel}>Total</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{agent.answered}</Text>
              <Text style={styles.statLabel}>Answered</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>
                {Math.round(agent.avg_duration)}s
              </Text>
              <Text style={styles.statLabel}>Avg Dur.</Text>
            </View>
          </View>
        </View>
      ))}

      {/* Team List */}
      <Text style={styles.sectionTitle}>All Agents</Text>
      {users.map((user) => (
        <View key={user.id} style={styles.userCard}>
          <View style={styles.userInfo}>
            <Text style={styles.userName}>{user.full_name}</Text>
            <Text style={styles.userUsername}>@{user.username}</Text>
            <Text style={styles.userNumber}>
              {user.twilio_number || 'No number assigned'}
            </Text>
          </View>
          <View style={styles.userActions}>
            <View style={styles.activeToggle}>
              <Text style={styles.activeLabel}>
                {user.is_active ? 'Active' : 'Disabled'}
              </Text>
              <Switch
                value={user.is_active}
                onValueChange={() => handleToggleActive(user)}
                trackColor={{ false: '#334155', true: '#22c55e' }}
                thumbColor="#fff"
              />
            </View>
            <TouchableOpacity style={styles.editBtn} onPress={() => startEdit(user)}>
              <Text style={styles.editBtnText}>Edit</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
  },
  addBtn: {
    backgroundColor: '#3b82f6',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  addBtnText: {
    color: '#fff',
    fontWeight: '600',
  },
  formCard: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#334155',
  },
  formTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  input: {
    backgroundColor: '#0f172a',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#fff',
    fontSize: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  formButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#475569',
    alignItems: 'center',
  },
  cancelBtnText: {
    color: '#94a3b8',
    fontWeight: '600',
  },
  submitBtn: {
    flex: 1,
    backgroundColor: '#3b82f6',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  submitBtnText: {
    color: '#fff',
    fontWeight: '600',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    marginTop: 8,
  },
  sectionTitle: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  refreshBtn: {
    color: '#3b82f6',
    fontSize: 14,
    fontWeight: '600',
  },
  statsCard: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  statsName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    color: '#3b82f6',
    fontSize: 20,
    fontWeight: '700',
  },
  statLabel: {
    color: '#64748b',
    fontSize: 11,
    marginTop: 2,
  },
  userCard: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
  userUsername: {
    color: '#94a3b8',
    fontSize: 13,
    marginTop: 2,
  },
  userNumber: {
    color: '#64748b',
    fontSize: 12,
    marginTop: 2,
  },
  userActions: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  activeToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  activeLabel: {
    color: '#94a3b8',
    fontSize: 12,
  },
  editBtn: {
    marginTop: 8,
    backgroundColor: '#334155',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 6,
  },
  editBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '500',
  },
  locationCard: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  locationInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  locationDot: (active) => ({
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: active ? '#22c55e' : '#475569',
    marginRight: 12,
  }),
  locationName: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  locationSub: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 2,
  },
  locationTime: {
    color: '#475569',
    fontSize: 11,
    marginTop: 2,
  },
  mapBtn: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  mapBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
});
