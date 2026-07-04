import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AuthStackParamList, RootStackParamList } from '@/navigation/types';
import { colors, textStyles } from '@/theme';
import { auth, ApiError } from '@/lib/api';
import { resolvePostAuthRoute } from '@/lib/postAuthRoute';

type Nav = NativeStackNavigationProp<AuthStackParamList, 'OtpVerify'>;
type Rt = RouteProp<AuthStackParamList, 'OtpVerify'>;

export default function OtpVerifyScreen() {
  const navigation = useNavigation<Nav>();
  const { phone } = useRoute<Rt>().params;
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  const handleVerify = async () => {
    setError(null);
    setLoading(true);
    try {
      await auth.otpVerify({ phone, token });
      const route = await resolvePostAuthRoute();
      navigation.getParent<NativeStackNavigationProp<RootStackParamList>>()?.reset({
        index: 0,
        routes: [{ name: route }],
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Invalid or expired code');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setError(null);
    setInfo(null);
    setResending(true);
    try {
      await auth.otpResend({ phone });
      setInfo('A new code was sent');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not resend the code');
    } finally {
      setResending(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Verify your phone</Text>
      <Text style={styles.subtitle}>Enter the 6-digit code sent to {phone}</Text>
      <TextInput
        style={styles.input}
        placeholder="123456"
        placeholderTextColor={colors.muted}
        keyboardType="number-pad"
        maxLength={6}
        value={token}
        onChangeText={setToken}
      />
      {error && <Text style={styles.error}>{error}</Text>}
      {info && <Text style={styles.info}>{info}</Text>}
      <TouchableOpacity style={styles.button} onPress={handleVerify} disabled={loading || token.length !== 6}>
        {loading ? <ActivityIndicator color={colors.white} /> : <Text style={styles.buttonText}>Verify</Text>}
      </TouchableOpacity>
      <TouchableOpacity onPress={handleResend} style={styles.link} disabled={resending}>
        <Text style={styles.linkText}>{resending ? 'Resending…' : 'Resend code'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: 24, justifyContent: 'center', gap: 12 },
  title: { ...textStyles.h1, color: colors.text, textAlign: 'center' },
  subtitle: { ...textStyles.body, color: colors.muted, textAlign: 'center', marginBottom: 12 },
  input: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    textAlign: 'center',
    letterSpacing: 8,
    ...textStyles.h3,
    color: colors.text,
  },
  error: { ...textStyles.caption, color: colors.red, textAlign: 'center' },
  info: { ...textStyles.caption, color: colors.green, textAlign: 'center' },
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
