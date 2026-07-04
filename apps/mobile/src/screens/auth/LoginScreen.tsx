import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AuthStackParamList, RootStackParamList } from '@/navigation/types';
import { colors, textStyles } from '@/theme';
import { auth, ApiError } from '@/lib/api';
import { resolvePostAuthRoute } from '@/lib/postAuthRoute';

type Nav = NativeStackNavigationProp<AuthStackParamList, 'Login'>;

export default function LoginScreen() {
  const navigation = useNavigation<Nav>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setError(null);
    setLoading(true);
    try {
      await auth.loginAndSave({ email: email.trim(), password });
      const route = await resolvePostAuthRoute();
      navigation.getParent<NativeStackNavigationProp<RootStackParamList>>()?.reset({
        index: 0,
        routes: [{ name: route }],
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Log In</Text>
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
        placeholder="Password"
        placeholderTextColor={colors.muted}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      {error && <Text style={styles.error}>{error}</Text>}
      <TouchableOpacity
        style={styles.button}
        onPress={handleLogin}
        disabled={loading || !email || !password}
      >
        {loading ? <ActivityIndicator color={colors.white} /> : <Text style={styles.buttonText}>Log In</Text>}
      </TouchableOpacity>
      <TouchableOpacity onPress={() => navigation.navigate('Signup')} style={styles.link}>
        <Text style={styles.linkText}>Don&apos;t have an account? Sign up</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: 24, justifyContent: 'center', gap: 12 },
  title: { ...textStyles.h1, color: colors.text, marginBottom: 12, textAlign: 'center' },
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
  button: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
    opacity: 1,
  },
  buttonText: { ...textStyles.bodyMedium, color: colors.white, fontSize: 17 },
  link: { alignItems: 'center', marginTop: 16 },
  linkText: { ...textStyles.body, color: colors.primary },
});
