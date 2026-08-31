import React, { useEffect, useRef } from 'react';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { LanguageProvider } from './src/context/LanguageContext';
import LoginScreen from './src/screens/LoginScreen';
import DemoScreen from './src/screens/DemoScreen';
import HomeScreen from './src/screens/HomeScreen';
import CameraView from './src/screens/CameraView';
import VoiceNoteScreen from './src/screens/VoiceNoteScreen';
import ProjectsScreen from './src/screens/ProjectsScreen';
import ProjectAlbumScreen from './src/screens/ProjectAlbumScreen';
import TimesheetScreen from './src/screens/TimesheetScreen';
import ScheduleScreen from './src/screens/ScheduleScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import ChatListScreen from './src/screens/ChatListScreen';
import ChatScreen from './src/screens/ChatScreen';
import NewChatScreen from './src/screens/NewChatScreen';
import CrewTrackingScreen from './src/screens/CrewTrackingScreen';
import AIAssistantScreen from './src/screens/AIAssistantScreen';
import CrewClockScreen from './src/screens/CrewClockScreen';
import TasksScreen from './src/screens/TasksScreen';
import PTOScreen from './src/screens/PTOScreen';
import KioskScreen from './src/screens/KioskScreen';
import GPSPlaybackScreen from './src/screens/GPSPlaybackScreen';
import TeamScreen from './src/screens/TeamScreen';
import SubscriptionScreen from './src/screens/SubscriptionScreen';
import { StatusBar } from 'expo-status-bar';
import { listenToNetworkChanges, processQueue } from './src/services/offlineService';
import { AppState, DeviceEventEmitter, View, Text, TouchableOpacity } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ContactScreen from './src/screens/ContactScreen';
import PrivacyScreen from './src/screens/PrivacyScreen';
import TermsScreen from './src/screens/TermsScreen';
import AboutScreen from './src/screens/AboutScreen';
import SecurityScreen from './src/screens/SecurityScreen';
import SupportScreen from './src/screens/SupportScreen';
import FoldersScreen from './src/screens/FoldersScreen';
import ProjectMediaScreen from './src/screens/ProjectMediaScreen';
import MonthMediaScreen from './src/screens/MonthMediaScreen';
import { api } from './src/services/api';
import MonthMediaTypeScreen from './src/screens/MonthMediaTypeScreen';
import WebViewScreen from './src/screens/WebViewScreen';
import SelectEmployeesScreen from './src/screens/SelectEmployeesScreen';
import CreateShiftScreen from './src/screens/CreateShiftScreen';
import CompanySettingsScreen from './src/screens/CompanySettingsScreen';
import { WakeWordService } from './src/services/wakeWordService';

const Stack = createStackNavigator();
const navigationRef = createNavigationContainerRef<any>();

// Error boundary (temporary)
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError && this.state.error) {
      const err = this.state.error;
      return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0A0A0A', padding: 20 }}>
          <Text style={{ color: '#F44336', fontSize: 16, fontWeight: 'bold', marginBottom: 10 }}>Error</Text>
          <Text style={{ color: '#FFF', textAlign: 'center' }}>{err.message}</Text>
          <Text style={{ color: '#888', marginTop: 10 }}>File: {err.stack?.split('\n')[1]?.trim()}</Text>
          <TouchableOpacity style={{ marginTop: 20, backgroundColor: '#00D4FF', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 }} onPress={() => this.setState({ hasError: false, error: null })}>
            <Text style={{ color: '#0A0A0A', fontWeight: '600' }}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

function AppNavigator() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const isProcessing = useRef(false);
  const wakeWordRef = useRef<WakeWordService | null>(null);

  useEffect(() => {
    // Set the 401 handler to navigate to Login
    api.setUnauthorizedHandler(() => {
      if (navigationRef.isReady()) navigationRef.navigate('Login');
    });
  }, []);

  useEffect(() => {
    let disposed = false;

    const stopWakeWord = async () => {
      const service = wakeWordRef.current;
      wakeWordRef.current = null;
      if (service) await service.stop();
    };

    const syncWakeWord = async (preference?: boolean) => {
      await stopWakeWord();
      const enabled = preference ?? (await AsyncStorage.getItem('lucyWakeWordEnabled')) === 'true';
      if (disposed || !enabled || !isAuthenticated || !user || AppState.currentState !== 'active') return;

      const service = new WakeWordService(() => {
        // Release the wake microphone before Lucy starts command recording on iOS.
        void service.stop().finally(() => {
          if (navigationRef.isReady()) navigationRef.navigate('AIAssistant', { autoRecord: true, wakeEvent: Date.now() });
        });
      });
      wakeWordRef.current = service;
      try {
        await service.start();
      } catch (error) {
        console.warn('Hey Lucy is unavailable:', error);
      }
    };

    syncWakeWord();
    const preferenceListener = DeviceEventEmitter.addListener('lucyWakeWordPreferenceChanged', (enabled: boolean) => syncWakeWord(Boolean(enabled)));
    const conversationListener = DeviceEventEmitter.addListener('lucyConversationEnded', () => syncWakeWord());
    const appStateListener = AppState.addEventListener('change', state => {
      if (state === 'active') syncWakeWord();
      else stopWakeWord();
    });

    return () => {
      disposed = true;
      preferenceListener.remove();
      conversationListener.remove();
      appStateListener.remove();
      stopWakeWord();
    };
  }, [isAuthenticated, user?.id]);

  useEffect(() => {
    const cleanup = listenToNetworkChanges(async (online) => {
      if (online && !isProcessing.current) {
        isProcessing.current = true;
        try { await processQueue(); } catch (e) { console.error(e); }
        finally { isProcessing.current = false; }
      }
    });
    return cleanup;
  }, []);

  if (isLoading) return null;

  return (
    <ErrorBoundary>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!isAuthenticated ? (
          <>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Demo" component={DemoScreen} />
          </>
        ) : (
          <>
            <Stack.Screen name="Home" component={HomeScreen} />
            <Stack.Screen name="Camera" component={CameraView} />
            <Stack.Screen name="VoiceNote" component={VoiceNoteScreen} />
            <Stack.Screen name="Projects" component={ProjectsScreen} />
            <Stack.Screen name="ProjectAlbum" component={ProjectAlbumScreen} />
            <Stack.Screen name="Timesheet" component={TimesheetScreen} />
            <Stack.Screen name="Schedule" component={ScheduleScreen} />
            <Stack.Screen name="History" component={HistoryScreen} />
            <Stack.Screen name="Profile" component={ProfileScreen} />
            <Stack.Screen name="ChatList" component={ChatListScreen} />
            <Stack.Screen name="Chat" component={ChatScreen} />
            <Stack.Screen name="NewChat" component={NewChatScreen} />
            <Stack.Screen name="CrewTracking" component={CrewTrackingScreen} />
            <Stack.Screen name="AIAssistant" component={AIAssistantScreen} />
            <Stack.Screen name="CrewClock" component={CrewClockScreen} />
            <Stack.Screen name="Tasks" component={TasksScreen} />
            <Stack.Screen name="PTO" component={PTOScreen} />
            <Stack.Screen name="Kiosk" component={KioskScreen} />
            <Stack.Screen name="GPSPlayback" component={GPSPlaybackScreen} />
            <Stack.Screen name="Team" component={TeamScreen} />
            <Stack.Screen name="Subscription" component={SubscriptionScreen} />
            <Stack.Screen name="Contact" component={ContactScreen} />
            <Stack.Screen name="Privacy" component={PrivacyScreen} />
            <Stack.Screen name="Terms" component={TermsScreen} />
            <Stack.Screen name="About" component={AboutScreen} />
            <Stack.Screen name="Security" component={SecurityScreen} />
            <Stack.Screen name="Support" component={SupportScreen} />
            <Stack.Screen name="Folders" component={FoldersScreen} />
            <Stack.Screen name="ProjectMedia" component={ProjectMediaScreen} />
            <Stack.Screen name="MonthMedia" component={MonthMediaScreen} />
            <Stack.Screen name="MonthMediaType" component={MonthMediaTypeScreen} />
            <Stack.Screen name="WebView" component={WebViewScreen} />
            <Stack.Screen name="SelectEmployees" component={SelectEmployeesScreen} />
            <Stack.Screen name="CreateShift" component={CreateShiftScreen} />
            <Stack.Screen name="CompanySettings" component={CompanySettingsScreen as React.ComponentType<any>} />
          </>
        )}
      </Stack.Navigator>
    </ErrorBoundary>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <LanguageProvider>
        <NavigationContainer ref={navigationRef}>
          <StatusBar style="light" />
          <AppNavigator />
        </NavigationContainer>
      </LanguageProvider>
    </AuthProvider>
  );
}
