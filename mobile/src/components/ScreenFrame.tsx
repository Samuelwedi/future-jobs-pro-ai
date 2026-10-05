import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

/** The navigator has no native headers; reserve all system edges once here. */
export function ScreenFrame({ children }: { children: React.ReactNode }) {
  return <SafeAreaView style={{ flex: 1, backgroundColor: '#0A0A0A' }} edges={['top', 'bottom', 'left', 'right']}>
    {children}
  </SafeAreaView>;
}
