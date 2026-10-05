import React from 'react';
import { KeyboardAvoidingView, Modal as NativeModal, ModalProps, Platform, StyleSheet } from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

/** Native modals live in a separate window. Measure its edges, not the navigator's. */
export function AdaptiveModal({ children, ...props }: ModalProps) {
  return <NativeModal {...props}>
    <SafeAreaProvider style={styles.fill}>
      <SafeAreaView style={styles.fill} edges={['top', 'bottom', 'left', 'right']}>
        <ModalBody>{children}</ModalBody>
      </SafeAreaView>
    </SafeAreaProvider>
  </NativeModal>;
}
const styles = StyleSheet.create({ fill: { flex: 1 } });

function ModalBody({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return <KeyboardAvoidingView style={styles.fill} keyboardVerticalOffset={insets.top} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>{children}</KeyboardAvoidingView>;
}
