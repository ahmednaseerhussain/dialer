import React from 'react';
import { ActivityIndicator, View, Text, TouchableOpacity } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

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
  headerStyle: { backgroundColor: '#1a1a2e' },
  headerTintColor: '#fff',
  headerTitleStyle: { fontWeight: '600' },
  contentStyle: { backgroundColor: '#1a1a2e' },
};

function MainTabs() {
  const { user, logout } = useAuth();

  return (
    <Tab.Navigator
      screenOptions={{
        ...screenOptions,
        tabBarStyle: { 
          backgroundColor: '#1a1a2e', 
          borderTopColor: '#2a2a3e',
          borderTopWidth: 1,
          height: 60,
          paddingBottom: 8,
          paddingTop: 8,
        },
        tabBarActiveTintColor: '#4CAF50',
        tabBarInactiveTintColor: '#666',
      }}
    >
      <Tab.Screen
        name="Dialer"
        component={DialerScreen}
        options={{
          title: 'Dialer',
          tabBarLabel: 'Dial',
          tabBarStyle: { display: 'none' }, // Hide tab bar on Dialer screen
          headerStyle: { backgroundColor: '#1a1a2e' },
          headerShown: false, // Hide header on Dialer screen
        }}
      />
      <Tab.Screen
        name="History"
        component={CallHistoryScreen}
        options={{ 
          title: 'Call History', 
          tabBarLabel: 'History',
          headerStyle: { backgroundColor: '#1a1a2e' },
        }}
      />
      <Tab.Screen
        name="Contacts"
        component={ContactsScreen}
        options={{ 
          title: 'Contacts', 
          tabBarLabel: 'Contacts',
          headerStyle: { backgroundColor: '#1a1a2e' },
          headerRight: () => (
            <TouchableOpacity onPress={logout} style={{ marginRight: 16 }}>
              <Text style={{ color: '#f44336', fontSize: 14, fontWeight: '600' }}>Logout</Text>
            </TouchableOpacity>
          ),
        }}
      />
      {user?.is_admin ? (
        <Tab.Screen
          name="Admin"
          component={AdminScreen}
          options={{ 
            title: 'Admin', 
            tabBarLabel: 'Admin',
            headerStyle: { backgroundColor: '#1a1a2e' },
          }}
        />
      ) : null}
    </Tab.Navigator>
  );
}

function AppNavigator() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1a1a2e' }}>
        <ActivityIndicator size="large" color="#4CAF50" />
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
