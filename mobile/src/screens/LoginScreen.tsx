import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';

export default function LoginScreen() {
  const navigation = useNavigation<any>();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !password) {
      Alert.alert('Missing information', 'Enter your email address and password.');
      return;
    }
    setIsLoading(true);
    try {
      await login(normalizedEmail, password);
    } catch (error: any) {
      Alert.alert('Sign in failed', error.response?.data?.message || 'Check your credentials and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <LinearGradient colors={['#06101D', '#0B1B31', '#08111E']} style={styles.background}>
      <StatusBar style="light" />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.brandRow}>
            <LinearGradient colors={['#6FE7FF', '#218BFF']} style={styles.logoMark}>
              <Ionicons name="pulse" size={27} color="#06101D" />
            </LinearGradient>
            <View>
              <Text style={styles.brand}>Future Jobs Pro AI</Text>
              <Text style={styles.brandCaption}>FIELD OPERATIONS, INTELLIGENTLY CONNECTED</Text>
            </View>
          </View>

          <View style={styles.hero}>
            <View style={styles.livePill}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>WORKFORCE COMMAND CENTER</Text>
            </View>
            <Text style={styles.heroTitle}>Run every job from one clear view.</Text>
            <Text style={styles.heroCopy}>
              Time, crews, GPS, evidence, payroll and Lucy AI—built for teams that work beyond a desk.
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Welcome back</Text>
            <Text style={styles.cardSubtitle}>Sign in to your secure company workspace.</Text>

            <Text style={styles.label}>Work email</Text>
            <View style={styles.inputShell}>
              <Ionicons name="mail-outline" size={19} color="#7F91A8" />
              <TextInput
                style={styles.input}
                placeholder="name@company.com"
                placeholderTextColor="#65758A"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                returnKeyType="next"
              />
            </View>

            <Text style={styles.label}>Password</Text>
            <View style={styles.inputShell}>
              <Ionicons name="lock-closed-outline" size={19} color="#7F91A8" />
              <TextInput
                style={styles.input}
                placeholder="Your password"
                placeholderTextColor="#65758A"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete="current-password"
                returnKeyType="done"
                onSubmitEditing={() => void handleLogin()}
              />
            </View>

            <TouchableOpacity disabled={isLoading} onPress={() => void handleLogin()} activeOpacity={0.85}>
              <LinearGradient colors={['#6FE7FF', '#2B9CFF']} style={styles.signInButton}>
                {isLoading ? (
                  <ActivityIndicator color="#06101D" />
                ) : (
                  <>
                    <Text style={styles.signInText}>Open workspace</Text>
                    <Ionicons name="arrow-forward" size={19} color="#06101D" />
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>

            <View style={styles.dividerRow}>
              <View style={styles.divider} />
              <Text style={styles.dividerText}>NEW TO FUTURE JOBS PRO AI?</Text>
              <View style={styles.divider} />
            </View>

            <TouchableOpacity style={styles.demoButton} onPress={() => navigation.navigate('Demo')}>
              <View style={styles.demoIcon}>
                <Ionicons name="play" size={17} color="#6FE7FF" />
              </View>
              <View style={styles.demoCopy}>
                <Text style={styles.demoTitle}>Explore the interactive demo</Text>
                <Text style={styles.demoSubtitle}>No account required · Read-only sample workspace</Text>
              </View>
              <Ionicons name="chevron-forward" size={19} color="#7F91A8" />
            </TouchableOpacity>
          </View>

          <View style={styles.trustRow}>
            <Trust icon="shield-checkmark-outline" text="Encrypted access" />
            <Trust icon="location-outline" text="Field ready" />
            <Trust icon="sparkles-outline" text="Lucy AI" />
          </View>
          <Text style={styles.footer}>Built by Samuel B. · Future Jobs Pro AI</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

function Trust({ icon, text }: { icon: React.ComponentProps<typeof Ionicons>['name']; text: string }) {
  return (
    <View style={styles.trustItem}>
      <Ionicons name={icon} size={15} color="#6FE7FF" />
      <Text style={styles.trustText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  background: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 64, paddingBottom: 34 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logoMark: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  brand: { color: '#FFFFFF', fontSize: 18, fontWeight: '900', letterSpacing: -0.3 },
  brandCaption: { color: '#6FE7FF', fontSize: 7.5, fontWeight: '800', letterSpacing: 1.15, marginTop: 3 },
  hero: { marginTop: 36, marginBottom: 25 },
  livePill: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 20, backgroundColor: 'rgba(66,232,167,0.10)', borderWidth: 1, borderColor: 'rgba(66,232,167,0.24)' },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#42E8A7' },
  liveText: { color: '#8EF5C8', fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  heroTitle: { color: '#FFFFFF', fontSize: 35, lineHeight: 40, fontWeight: '900', letterSpacing: -1.15, marginTop: 15, maxWidth: 340 },
  heroCopy: { color: '#9DACBF', fontSize: 14, lineHeight: 21, marginTop: 10, maxWidth: 345 },
  card: { backgroundColor: 'rgba(14,30,51,0.94)', borderRadius: 25, padding: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.11)', shadowColor: '#000000', shadowOpacity: 0.3, shadowRadius: 22, shadowOffset: { width: 0, height: 12 }, elevation: 8 },
  cardTitle: { color: '#FFFFFF', fontSize: 21, fontWeight: '900' },
  cardSubtitle: { color: '#91A1B5', fontSize: 13, marginTop: 4, marginBottom: 20 },
  label: { color: '#C9D4E2', fontSize: 11, fontWeight: '800', letterSpacing: 0.5, marginBottom: 7, marginTop: 4 },
  inputShell: { height: 53, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#081421', borderRadius: 15, paddingHorizontal: 14, borderWidth: 1, borderColor: '#26394D', marginBottom: 14 },
  input: { flex: 1, color: '#FFFFFF', fontSize: 15, height: '100%' },
  signInButton: { height: 54, borderRadius: 15, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  signInText: { color: '#06101D', fontSize: 15, fontWeight: '900' },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 9, marginVertical: 19 },
  divider: { flex: 1, height: 1, backgroundColor: '#26394D' },
  dividerText: { color: '#65758A', fontSize: 8, fontWeight: '800', letterSpacing: 0.7 },
  demoButton: { minHeight: 67, flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(111,231,255,0.25)', backgroundColor: 'rgba(111,231,255,0.07)' },
  demoIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: 'rgba(111,231,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  demoCopy: { flex: 1, marginLeft: 11 },
  demoTitle: { color: '#EAFBFF', fontSize: 13, fontWeight: '800' },
  demoSubtitle: { color: '#8092A8', fontSize: 10, marginTop: 3 },
  trustRow: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 14, marginTop: 22 },
  trustItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  trustText: { color: '#8292A7', fontSize: 10, fontWeight: '600' },
  footer: { color: '#526277', fontSize: 10, textAlign: 'center', marginTop: 16 },
});
