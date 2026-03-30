import React from 'react';
import { ActivityIndicator, View, Text, TouchableOpacity } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Ionicons from '@expo/vector-icons/Ionicons';

import { AuthProvider, useAuth } from './src/context/AuthContext';
import { CallProvider } from './src/context/CallContext';

import LoginScreen from './src/screens/LoginScreen';
import DialerScreen from './src/screens/DialerScreen';
import ActiveCallScreen from './src/screens/ActiveCallScreen';
import IncomingCallScreen from './src/screens/IncomingCallScreen';
import CallHistoryScreen from './src/screens/CallHistoryScreen';
import ContactsScreen from './src/screens/ContactsScreen';
import ContactDetailScreen from './src/screens/ContactDetailScreen';
import AdminScreen from './src/screens/AdminScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const screenOptions = {
  headerStyle: { backgroundColor: '#0f172a' },
  headerTintColor: '#fff',
  headerTitleStyle: { fontWeight: '600' },
};

function MainTabs() {
  const { user, logout } = useAuth();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        ...screenOptions,
        tabBarStyle: { backgroundColor: '#0f172a', borderTopColor: '#1e293b' },
        tabBarActiveTintColor: '#3b82f6',
        tabBarInactiveTintColor: '#64748b',
        tabBarIcon: ({ color, size }) => {
          const icons = {
            Dialer: 'keypad',
            History: 'time',
            Contacts: 'people',
            Admin: 'settings',
          };
          return <Ionicons name={icons[route.name] || 'ellipse'} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen
        name="Dialer"
        component={DialerScreen}
        options={{
          title: 'Dialer',
          tabBarLabel: 'Dial',
          headerRight: () => (
            <TouchableOpacity onPress={logout} style={{ marginRight: 16 }}>
              <Text style={{ color: '#ef4444', fontSize: 14, fontWeight: '600' }}>Logout</Text>
            </TouchableOpacity>
          ),
        }}
      />
      <Tab.Screen
        name="History"
        component={CallHistoryScreen}
        options={{ title: 'Call History', tabBarLabel: 'History' }}
      />
      <Tab.Screen
        name="Contacts"
        component={ContactsScreen}
        options={{ title: 'Contacts', tabBarLabel: 'Contacts' }}
      />
      {user?.is_admin ? (
        <Tab.Screen
          name="Admin"
          component={AdminScreen}
          options={{ title: 'Admin', tabBarLabel: 'Admin' }}
        />
      ) : null}
    </Tab.Navigator>
  );
}

function AppNavigator() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f172a' }}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={screenOptions}>
      {!user ? (
        <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
      ) : (
        <>
          <Stack.Screen name="Main" component={MainTabs} options={{ headerShown: false }} />
          <Stack.Screen name="ActiveCall" component={ActiveCallScreen} options={{ title: 'Active Call', headerBackVisible: false }} />
          <Stack.Screen name="IncomingCall" component={IncomingCallScreen} options={{ title: 'Incoming Call', headerShown: false, presentation: 'fullScreenModal' }} />
          <Stack.Screen name="ContactDetail" component={ContactDetailScreen} options={{ title: 'Contact' }} />
        </>
      )}
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <CallProvider>
        <NavigationContainer>
          <AppNavigator />
        </NavigationContainer>
      </CallProvider>
    </AuthProvider>
  );
}
