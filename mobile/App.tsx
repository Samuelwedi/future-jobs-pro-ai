import React, { useEffect, useRef } from 'react';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { LanguageProvider } from './src/context/LanguageContext';
import LoginScreen from './src/screens/LoginScreen';
import HomeScreen from './src/screens/HomeScreen';
import { StatusBar } from 'expo-status-bar';
import {
  ActivityIndicator,
  DeviceEventEmitter,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from './src/services/api';

const Stack = createStackNavigator();
const navigationRef = createNavigationContainerRef<any>();

type WakeWordController = {
  start: () => Promise<void>;
  stop: () => Promise<void>;
};

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
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
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#050B16', padding: 20 }}>
          <Text style={{ color: '#F87171', fontSize: 16, fontWeight: 'bold', marginBottom: 10 }}>Something went wrong</Text>
          <Text style={{ color: '#FFF', textAlign: 'center' }}>{err.message}</Text>
          <TouchableOpacity
            style={{ marginTop: 20, backgroundColor: '#22D3EE', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 }}
            onPress={() => this.setState({ hasError: false, error: null })}
          >
            <Text style={{ color: '#07111F', fontWeight: '700' }}>Try again</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return this.props.children;
  }
}

function LaunchScreen() {
  return (
    <View
      accessible
      accessibilityLabel="Future Jobs Pro AI is starting"
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#050B16',
        padding: 28,
      }}
    >
      <View
        style={{
          width: 72,
          height: 72,
          borderRadius: 22,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#0E7490',
          borderWidth: 1,
          borderColor: '#22D3EE',
        }}
      >
        <Text style={{ color: '#FFF', fontSize: 30, fontWeight: '900' }}>FJ</Text>
      </View>
      <Text style={{ color: '#FFF', fontSize: 22, fontWeight: '800', marginTop: 20 }}>
        Future Jobs Pro AI
      </Text>
      <Text style={{ color: '#94A3B8', fontSize: 14, marginTop: 7 }}>
        Preparing your command center
      </Text>
      <ActivityIndicator color="#22D3EE" size="small" style={{ marginTop: 24 }} />
    </View>
  );
}

function AppNavigator() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const isProcessing = useRef(false);
  const wakeWordRef = useRef<WakeWordController | null>(null);

  useEffect(() => {
    api.setUnauthorizedHandler(() => {
      if (navigationRef.isReady()) navigationRef.navigate('Login');
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    let cleanup: undefined | (() => void);

    void import('./src/services/offlineService').then(({ listenToNetworkChanges, processQueue }) => {
      if (cancelled) return;

      cleanup = listenToNetworkChanges(async (online) => {
        if (!online || isProcessing.current) return;
        isProcessing.current = true;
        try {
          await processQueue();
        } catch (error) {
          console.warn('Offline queue processing failed:', error);
        } finally {
          isProcessing.current = false;
        }
      });
    });

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const configure = async (enabled?: boolean) => {
      const optedIn =
        enabled ?? (await AsyncStorage.getItem('lucyWakeWordEnabled')) === 'true';

      await wakeWordRef.current?.stop();
      wakeWordRef.current = null;

      if (cancelled || !isAuthenticated || !user || !optedIn) return;

      // Wake-word/audio code is intentionally loaded only after explicit opt-in.
      const { WakeWordService } = await import('./src/services/wakeWordService');
      if (cancelled) return;

      const service: WakeWordController = new WakeWordService(() => {
        if (navigationRef.isReady()) {
          navigationRef.navigate('AIAssistant', { autoRecord: true });
        }
      });
      wakeWordRef.current = service;

      try {
        await service.start();
      } catch (error) {
        console.warn('Wake word is unavailable:', error);
      }
    };

    void configure();
    const listener = DeviceEventEmitter.addListener(
      'lucyWakeWordPreferenceChanged',
      configure,
    );

    return () => {
      cancelled = true;
      listener.remove();
      void wakeWordRef.current?.stop();
      wakeWordRef.current = null;
    };
  }, [isAuthenticated, user]);

  if (isLoading) return <LaunchScreen />;

  return (
    <ErrorBoundary>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!isAuthenticated ? (
          <>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Demo" getComponent={() => require('./src/screens/DemoScreen').default} />
          </>
        ) : (
          <>
            <Stack.Screen name="Home" component={HomeScreen} />
            <Stack.Screen name="Camera" getComponent={() => require('./src/screens/CameraView').default} />
            <Stack.Screen name="VoiceNote" getComponent={() => require('./src/screens/VoiceNoteScreen').default} />
            <Stack.Screen name="Projects" getComponent={() => require('./src/screens/ProjectsScreen').default} />
            <Stack.Screen name="ProjectAlbum" getComponent={() => require('./src/screens/ProjectAlbumScreen').default} />
            <Stack.Screen name="Timesheet" getComponent={() => require('./src/screens/TimesheetScreen').default} />
            <Stack.Screen name="Schedule" getComponent={() => require('./src/screens/ScheduleScreen').default} />
            <Stack.Screen name="History" getComponent={() => require('./src/screens/HistoryScreen').default} />
            <Stack.Screen name="Profile" getComponent={() => require('./src/screens/ProfileScreen').default} />
            <Stack.Screen name="ChatList" getComponent={() => require('./src/screens/ChatListScreen').default} />
            <Stack.Screen name="Chat" getComponent={() => require('./src/screens/ChatScreen').default} />
            <Stack.Screen name="NewChat" getComponent={() => require('./src/screens/NewChatScreen').default} />
            <Stack.Screen name="CrewTracking" getComponent={() => require('./src/screens/CrewTrackingScreen').default} />
            <Stack.Screen name="AIAssistant" getComponent={() => require('./src/screens/AIAssistantScreen').default} />
            <Stack.Screen name="CrewClock" getComponent={() => require('./src/screens/CrewClockScreen').default} />
            <Stack.Screen name="Tasks" getComponent={() => require('./src/screens/TasksScreen').default} />
            <Stack.Screen name="PTO" getComponent={() => require('./src/screens/PTOScreen').default} />
            <Stack.Screen name="Kiosk" getComponent={() => require('./src/screens/KioskScreen').default} />
            <Stack.Screen name="GPSPlayback" getComponent={() => require('./src/screens/GPSPlaybackScreen').default} />
            <Stack.Screen name="Team" getComponent={() => require('./src/screens/TeamScreen').default} />
            <Stack.Screen name="Subscription" getComponent={() => require('./src/screens/SubscriptionScreen').default} />
            <Stack.Screen name="Contact" getComponent={() => require('./src/screens/ContactScreen').default} />
            <Stack.Screen name="Privacy" getComponent={() => require('./src/screens/PrivacyScreen').default} />
            <Stack.Screen name="Terms" getComponent={() => require('./src/screens/TermsScreen').default} />
            <Stack.Screen name="About" getComponent={() => require('./src/screens/AboutScreen').default} />
            <Stack.Screen name="Security" getComponent={() => require('./src/screens/SecurityScreen').default} />
            <Stack.Screen name="Support" getComponent={() => require('./src/screens/SupportScreen').default} />
            <Stack.Screen name="Folders" getComponent={() => require('./src/screens/FoldersScreen').default} />
            <Stack.Screen name="ProjectMedia" getComponent={() => require('./src/screens/ProjectMediaScreen').default} />
            <Stack.Screen name="MonthMedia" getComponent={() => require('./src/screens/MonthMediaScreen').default} />
            <Stack.Screen name="MonthMediaType" getComponent={() => require('./src/screens/MonthMediaTypeScreen').default} />
            <Stack.Screen name="WebView" getComponent={() => require('./src/screens/WebViewScreen').default} />
            <Stack.Screen name="SelectEmployees" getComponent={() => require('./src/screens/SelectEmployeesScreen').default} />
            <Stack.Screen name="CreateShift" getComponent={() => require('./src/screens/CreateShiftScreen').default} />
            <Stack.Screen name="CompanySettings" getComponent={() => require('./src/screens/CompanySettingsScreen').default} />
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
