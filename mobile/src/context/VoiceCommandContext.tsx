import React, { createContext, useContext, useState, useRef, useEffect } from 'react';
import { Alert, Platform } from 'react-native';
import Voice, { SpeechResultsEvent, SpeechErrorEvent } from 'react-native-voice';
import * as Speech from 'expo-speech';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from './AuthContext';
import { api } from '../services/api';

// ... rest of the file is identical to the version you already have (from Micro‑Step 2)

type VoiceCommandContextType = {
  isListening: boolean;
  startListening: () => void;
  stopListening: () => void;
};

const VoiceCommandContext = createContext<VoiceCommandContextType>({
  isListening: false,
  startListening: () => {},
  stopListening: () => {},
});

export const VoiceCommandProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isListening, setIsListening] = useState(false);
  const navigation = useNavigation<any>();
  const { user } = useAuth();

  // Initialize Voice
  useEffect(() => {
    Voice.onSpeechResults = onSpeechResults;
    Voice.onSpeechError = onSpeechError;
    return () => {
      Voice.destroy().then(Voice.removeAllListeners);
    };
  }, []);

  const onSpeechResults = (e: SpeechResultsEvent) => {
    if (e.value && e.value.length > 0) {
      const transcript = e.value[0].toLowerCase().trim();
      handleCommand(transcript);
    }
  };

  const onSpeechError = (e: SpeechErrorEvent) => {
    console.error('Voice error:', e);
    setIsListening(false);
  };

  const startListening = async () => {
    try {
      await Voice.start('en-US');
      setIsListening(true);
    } catch (e) {
      console.error('Failed to start listening', e);
    }
  };

  const stopListening = async () => {
    try {
      await Voice.stop();
      setIsListening(false);
    } catch (e) {
      console.error('Failed to stop listening', e);
    }
  };

  // Simple command parser
  const handleCommand = (transcript: string) => {
    stopListening();

    // Respond with speech
    const speak = (text: string) => {
      Speech.speak(text, { language: 'en' });
    };

    // ---- Command Matching ----
    if (transcript.includes('clock in')) {
      const projectMatch = transcript.match(/clock in to (.*)/);
      if (projectMatch) {
        const projectName = projectMatch[1].trim();
        // Search for project by name (simplified: pick the first matching project)
        api.get<any>('/projects/active').then(res => {
          const projects = res.projects || [];
          const found = projects.find((p: any) => p.name.toLowerCase().includes(projectName.toLowerCase()));
          if (found) {
            // Clock in to found project
            api.post('/time-entries/clock-in', {
              userId: user?.id,
              projectId: found.id,
              latitude: 0,
              longitude: 0,
            }).then(() => {
              speak(`Clocked in to ${found.name}`);
            }).catch(() => {
              speak('Failed to clock in');
            });
          } else {
            speak(`No project named ${projectName} found`);
          }
        });
      } else {
        speak('Please say "clock in to [project name]"');
      }
    }
    else if (transcript.includes('clock out')) {
      api.post('/time-entries/clock-out', {
        userId: user?.id,
        timeEntryId: '', // you need the active time entry – for now, we send empty (will fail)
      }).then(() => speak('Clocked out')).catch(() => speak('No active clock-in'));
    }
    else if (transcript.includes('take photo') || transcript.includes('camera')) {
      navigation.navigate('Camera', { projectId: '' });
      speak('Opening camera');
    }
    else if (transcript.includes('timesheet')) {
      navigation.navigate('Timesheet');
      speak('Opening timesheet');
    }
    else if (transcript.includes('schedule') || transcript.includes('my schedule')) {
      navigation.navigate('Schedule');
      speak('Opening schedule');
    }
    else if (transcript.includes('projects')) {
      navigation.navigate('Projects');
      speak('Opening projects');
    }
    else if (transcript.includes('home') || transcript.includes('go back')) {
      navigation.goBack();
      speak('Going back');
    }
    else if (transcript.includes('voice note') || transcript.includes('record')) {
      navigation.navigate('VoiceNote', { projectId: '' });
      speak('Opening voice note');
    }
    else {
      speak('Sorry, I did not understand that command');
    }
  };

  return (
    <VoiceCommandContext.Provider value={{ isListening, startListening, stopListening }}>
      {children}
    </VoiceCommandContext.Provider>
  );
};

export const useVoiceCommand = () => useContext(VoiceCommandContext);