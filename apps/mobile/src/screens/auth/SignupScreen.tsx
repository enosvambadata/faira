import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AuthStackParamList } from '@/navigation/types';
import { colors, textStyles } from '@/theme';
import { auth, ApiError } from '@/lib/api';

type Nav = NativeStackNavigationProp<AuthStackParamList, 'Signup'>;

type Mode = 'email' | 'phone';

export default function SignupScreen() {
  const navigation = useNavigation<Nav>();
  const [mode, setMode] = useState<Mode>('phone');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Set once an email account is created: we no longer auto-login, the
  // account is unconfirmed until the emailed link is clicked.
  const [sentTo, setSentTo] = useState<string | null>(null);

  const canSubmit = mode === 'phone' ? phone.length > 0 : email.length > 0 && password.length >= 8;

  const handleSubmit = async () => {
    setError(null);
    setLoading(true);
    try {
      if (mode === 'phone') {
        await auth.signup({ phone: phone.trim() });
        navigation.navigate('OtpVerify', { phone: phone.trim() });
        return;
      }

      await auth.signup({ email: email.trim(), password });
      setSentTo(email.trim());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (sentTo) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Confirm your email</Text>
        <Text style={styles.confirmBody}>
          We&apos;ve sent a confirmation link to {sentTo}. Tap it to activate your account, then log in.
        </Text>
        <TouchableOpacity style={styles.button} onPress={() => navigation.navigate('Login')}>
          <Text style={styles.buttonText}>Go to log in</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Create Account</Text>

      <View style={styles.toggle}>
        <TouchableOpacity
          style={[styles.toggleButton, mode === 'phone' && styles.toggleButtonActive]}
          onPress={() => setMode('phone')}
        >
          <Text style={[styles.toggleText, mode === 'phone' && styles.toggleTextActive]}>Phone</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleButton, mode === 'email' && styles.toggleButtonActive]}
          onPress={() => setMode('email')}
        >
          <Text style={[styles.toggleText, mode === 'email' && styles.toggleTextActive]}>Email</Text>
        </TouchableOpacity>
      </View>

      {mode === 'phone' ? (
        <TextInput
          style={styles.input}
          placeholder="+263771234567"
          placeholderTextColor={colors.muted}
          keyboardType="phone-pad"
          value={phone}
          onChangeText={setPhone}
        />
      ) : (
        <>
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <TextInput
            style={styles.input}
            placeholder="Password (min. 8 characters)"
            placeholderTextColor={colors.muted}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />
        </>
      )}

      {error && <Text style={styles.error}>{error}</Text>}

      <TouchableOpacity style={styles.button} onPress={handleSubmit} disabled={loading || !canSubmit}>
        {loading ? (
          <ActivityIndicator color={colors.white} />
        ) : (
          <Text style={styles.buttonText}>{mode === 'phone' ? 'Send Code' : 'Sign Up'}</Text>
        )}
      </TouchableOpacity>
      <TouchableOpacity onPress={() => navigation.navigate('Login')} style={styles.link}>
        <Text style={styles.linkText}>Already have an account? Log in</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: 24, justifyContent: 'center', gap: 12 },
  title: { ...textStyles.h1, color: colors.text, marginBottom: 12, textAlign: 'center' },
  toggle: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 4,
    marginBottom: 4,
  },
  toggleButton: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
  toggleButtonActive: { backgroundColor: colors.primaryLight },
  toggleText: { ...textStyles.bodyMedium, color: colors.muted },
  toggleTextActive: { color: colors.primary },
  input: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    ...textStyles.body,
    color: colors.text,
  },
  error: { ...textStyles.caption, color: colors.red },
  confirmBody: { ...textStyles.body, color: colors.muted, textAlign: 'center', marginBottom: 12 },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: { ...textStyles.bodyMedium, color: colors.white, fontSize: 17 },
  link: { alignItems: 'center', marginTop: 16 },
  linkText: { ...textStyles.body, color: colors.primary },
});
