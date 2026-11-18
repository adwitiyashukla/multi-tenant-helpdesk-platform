import { router } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { ApiError } from '@/api';
import { useSession } from '@/session';
import { theme } from '@/theme';

export default function Login() {
  const { signIn } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async () => {
    setPending(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
      router.replace('/inbox');
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'could not sign in');
      setPending(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Text style={styles.title}>helpdesk</Text>
      <Text style={styles.subtitle}>one inbox for the whole support team</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Work email</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          style={styles.input}
          placeholder="you@company.com"
          placeholderTextColor={theme.muted}
        />

        <Text style={styles.label}>Password</Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          style={styles.input}
          placeholder="your password"
          placeholderTextColor={theme.muted}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          onPress={submit}
          disabled={pending || !email || !password}
          style={({ pressed }) => [
            styles.button,
            (pending || !email || !password) && styles.buttonDisabled,
            pressed && styles.buttonPressed,
          ]}
        >
          <Text style={styles.buttonText}>{pending ? 'Signing in' : 'Sign in'}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: theme.background },
  title: { fontSize: 28, fontWeight: '700', textAlign: 'center', color: theme.text },
  subtitle: { marginTop: 4, textAlign: 'center', color: theme.muted, marginBottom: 24 },
  card: {
    backgroundColor: theme.surface,
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: theme.border,
  },
  label: { fontSize: 12, fontWeight: '600', color: theme.muted, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 14,
    color: theme.text,
    fontSize: 15,
  },
  error: { color: theme.danger, marginBottom: 10, fontSize: 13 },
  button: {
    backgroundColor: theme.accent,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.5 },
  buttonPressed: { opacity: 0.8 },
  buttonText: { color: '#ffffff', fontWeight: '600', fontSize: 15 },
});
