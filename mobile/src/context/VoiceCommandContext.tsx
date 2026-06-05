import React, { createContext, useContext, useState, useRef, useEffect } from 'react';
import { Alert, Platform } from 'react-native';
// Voice library removed – tap‑to‑talk uses the Web Speech API on web and @react-native-voice/voice on mobile (but we stubbed it out)
import * as Speech from 'expo-speech';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from './AuthContext';

interface VoiceCommandContextType {
  isListening: boolean;
  startListening: () => void;
  stopListening: () => void;
  transcript: string;
}

const VoiceCommandContext = createContext<VoiceCommandContextType>({
  isListening: false,
  startListening: () => {},
  stopListening: () => {},
  transcript: '',
});

export const useVoiceCommand = () => useContext(VoiceCommandContext);

export const VoiceCommandProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const navigation = useNavigation<any>();
  const { user } = useAuth();

  // Stub: voice recognition is disabled; the mic button shows a "Coming Soon" alert.
  const startListening = async () => {
    Alert.alert('🚀 Coming Soon', 'Lucy voice assistant will be available soon!');
  };

  const stopListening = () => {
    // no-op
  };

  return (
    <VoiceCommandContext.Provider value={{ isListening, startListening, stopListening, transcript }}>
      {children}
    </VoiceCommandContext.Provider>
  );
};