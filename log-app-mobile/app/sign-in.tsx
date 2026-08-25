import { useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import * as WebBrowser from "expo-web-browser";
import { useSignIn, useSSO } from "@clerk/clerk-expo";
import { useEffect } from "react";
import { colors } from "../src/theme/colors";
import { typography } from "../src/theme/typography";
import { spacing } from "../src/theme/spacing";

type Step = "options" | "email" | "code";

export default function SignInScreen() {
  const { signIn, isLoaded: signInLoaded, setActive } = useSignIn();
  const { startSSOFlow } = useSSO();

  const [step, setStep] = useState<Step>("options");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    WebBrowser.maybeCompleteAuthSession();
  }, []);

  const handleGoogleSignIn = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await startSSOFlow({
        strategy: "oauth_google",
      });

      const sessionId = result.createdSessionId;
      const activate = result.setActive ?? setActive;

      if (sessionId && activate) {
        await activate({ session: sessionId });
      } else if (result.authSessionResult?.type === "cancel" || result.authSessionResult?.type === "dismiss") {
        setError("");
      } else {
        setError("Google sign in was not completed. Please try again.");
      }
    } catch (err: any) {
      const message = err?.errors?.[0]?.message ?? err?.message;
      if (message) setError(message);
    } finally {
      setLoading(false);
    }
  }, [startSSOFlow, setActive]);

  const handleSendCode = useCallback(async () => {
    if (!signIn) return;
    setLoading(true);
    setError("");
    try {
      await signIn.create({ identifier: email.trim() });
      setStep("code");
    } catch (err: any) {
      const message = err?.errors?.[0]?.message ?? err?.message ?? "Failed to send code";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [email, signIn]);

  const handleVerifyCode = useCallback(async () => {
    if (!signIn || !setActive) return;
    setLoading(true);
    setError("");
    try {
      const result = await signIn.attemptFirstFactor({
        strategy: "email_code",
        code: code.trim(),
      });

      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
      } else {
        setError("Verification incomplete. Try again.");
      }
    } catch (err: any) {
      const message = err?.errors?.[0]?.message ?? err?.message ?? "Invalid code";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [code, signIn, setActive]);

  const handleBack = useCallback(() => {
    setStep("options");
    setEmail("");
    setCode("");
    setError("");
  }, []);

  if (!signInLoaded) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={colors.rust} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.inner}>
        <Text style={typography.screenTitle}>Log</Text>
        <Text style={[typography.bodyLabel, styles.subtitle]}>
          {step === "options"
            ? "Sign in to continue"
            : step === "email"
              ? "Enter your email"
              : "Enter verification code"}
        </Text>

        <View style={styles.form}>
          {step === "options" && (
            <>
              <Pressable
                style={[styles.button, styles.googleButton]}
                onPress={handleGoogleSignIn}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator size="small" color={colors.chalk} />
                ) : (
                  <Text style={styles.buttonText}>Sign in with Google</Text>
                )}
              </Pressable>

              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={typography.bodySmall}>or</Text>
                <View style={styles.dividerLine} />
              </View>

              <Pressable
                style={styles.buttonOutline}
                onPress={() => setStep("email")}
              >
                <Text style={styles.buttonOutlineText}>Sign in with Email</Text>
              </Pressable>
            </>
          )}

          {step === "email" && (
            <>
              <TextInput
                style={styles.input}
                placeholder="Email"
                placeholderTextColor={colors.chalkDim}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
              />

              {error ? <Text style={styles.error}>{error}</Text> : null}

              <Pressable
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={handleSendCode}
                disabled={loading || !email.trim()}
              >
                {loading ? (
                  <ActivityIndicator size="small" color={colors.chalk} />
                ) : (
                  <Text style={styles.buttonText}>Send Code</Text>
                )}
              </Pressable>

              <Pressable style={styles.textButton} onPress={handleBack}>
                <Text style={typography.bodySmall}>Back</Text>
              </Pressable>
            </>
          )}

          {step === "code" && (
            <>
              <Text style={[typography.bodySmall, styles.codeInfo]}>
                A verification code was sent to{`\n`}{email}
              </Text>

              <TextInput
                style={[styles.input, styles.codeInput]}
                placeholder="000000"
                placeholderTextColor={colors.chalkDim}
                value={code}
                onChangeText={setCode}
                keyboardType="number-pad"
                maxLength={6}
                autoFocus
              />

              {error ? <Text style={styles.error}>{error}</Text> : null}

              <Pressable
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={handleVerifyCode}
                disabled={loading || code.trim().length < 6}
              >
                {loading ? (
                  <ActivityIndicator size="small" color={colors.chalk} />
                ) : (
                  <Text style={styles.buttonText}>Verify</Text>
                )}
              </Pressable>

              <View style={styles.codeActions}>
                <Pressable style={styles.textButton} onPress={handleSendCode}>
                  <Text style={typography.bodySmall}>Resend Code</Text>
                </Pressable>
                <Pressable style={styles.textButton} onPress={handleBack}>
                  <Text style={typography.bodySmall}>Change Email</Text>
                </Pressable>
              </View>
            </>
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.graphite,
    justifyContent: "center",
  },
  inner: {
    paddingHorizontal: spacing.screenPadding,
    alignItems: "center",
  },
  subtitle: {
    marginTop: 4,
    marginBottom: 32,
  },
  form: {
    width: "100%",
    gap: 14,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: 14,
    fontFamily: "Inter",
    fontSize: 16,
    color: colors.chalk,
  },
  codeInput: {
    fontSize: 24,
    fontFamily: "JetBrainsMono",
    textAlign: "center",
    letterSpacing: 8,
  },
  codeInfo: {
    textAlign: "center",
    marginBottom: 4,
  },
  button: {
    backgroundColor: colors.rust,
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontFamily: "Inter-SemiBold",
    fontSize: 16,
    color: colors.chalk,
  },
  googleButton: {
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  buttonOutline: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: 16,
    alignItems: "center",
  },
  buttonOutlineText: {
    fontFamily: "Inter-Medium",
    fontSize: 16,
    color: colors.chalk,
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.hairline,
  },
  textButton: {
    alignSelf: "center",
    padding: 8,
  },
  codeActions: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  error: {
    fontFamily: "Inter",
    fontSize: 13,
    color: colors.rustSoft,
    textAlign: "center",
  },
});
