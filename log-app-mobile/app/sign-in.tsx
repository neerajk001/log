import { useState, useCallback, useEffect } from "react";
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
import * as Linking from "expo-linking";
import { useSignIn, useSSO } from "@clerk/clerk-expo";
import { makeUseStyles, useTheme } from "../src/theme/ThemeContext";
import { radii, spacing } from "../src/theme/spacing";
import { BrandWordmark } from "../src/components/ScreenHeader";

type Step = "options" | "email" | "code";

export default function SignInScreen() {
  const { signIn, isLoaded: signInLoaded, setActive } = useSignIn();
  const { startSSOFlow } = useSSO();
  const { colors, typography } = useTheme();
  const styles = useStyles();

  const [step, setStep] = useState<Step>("options");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    WebBrowser.maybeCompleteAuthSession();
  }, []);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  const handleGoogleSignIn = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const result = await startSSOFlow({
        strategy: "oauth_google",
        // Expo Go runs under exp://<lan-ip>:8081, a standalone/dev build under
        // log://. createURL() picks the right scheme per environment.
        redirectUrl: Linking.createURL("/sso-callback"),
      });
      const sessionId = result.createdSessionId;
      const activate = result.setActive ?? setActive;

      if (sessionId && activate) {
        await activate({ session: sessionId });
      } else if (
        result.authSessionResult?.type === "cancel" ||
        result.authSessionResult?.type === "dismiss"
      ) {
        setError("");
      } else {
        setError("Google sign in was not completed. Please try again.");
      }
    } catch (err: unknown) {
      const e = err as { errors?: { message?: string }[]; message?: string };
      const message = e?.errors?.[0]?.message ?? e?.message;
      if (message) setError(message);
    } finally {
      setLoading(false);
    }
  }, [startSSOFlow, setActive, loading]);

  const handleSendCode = useCallback(async () => {
    if (!signIn || loading || resendCooldown > 0) return;
    setLoading(true);
    setError("");
    try {
      const created = await signIn.create({ identifier: email.trim() });
      const emailFactor = created.supportedFirstFactors?.find(
        (f) => f.strategy === "email_code",
      );
      const emailAddressId =
        emailFactor && "emailAddressId" in emailFactor
          ? (emailFactor.emailAddressId as string)
          : undefined;
      if (!emailAddressId) {
        setError("Email sign in is not available for this account.");
        return;
      }
      await signIn.prepareFirstFactor({ strategy: "email_code", emailAddressId });
      setResendCooldown(30);
      setStep("code");
    } catch (err: unknown) {
      const e = err as { errors?: { message?: string }[]; message?: string };
      setError(e?.errors?.[0]?.message ?? e?.message ?? "Failed to send code");
    } finally {
      setLoading(false);
    }
  }, [email, signIn, loading, resendCooldown]);

  const handleVerifyCode = useCallback(async () => {
    if (!signIn || !setActive) return;
    setLoading(true);
    setError("");
    try {
      const result = await signIn.attemptFirstFactor({ strategy: "email_code", code: code.trim() });
      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
      } else {
        setError("Verification incomplete. Try again.");
      }
    } catch (err: unknown) {
      const e = err as { errors?: { message?: string }[]; message?: string };
      setError(e?.errors?.[0]?.message ?? e?.message ?? "Invalid code");
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
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.inner}>
        <BrandWordmark size={30} />
        <Text style={[typography.small, styles.subtitle]}>
          {step === "options"
            ? "Track. Train. Improve."
            : step === "email"
              ? "Enter your email"
              : "Enter verification code"}
        </Text>

        <View style={styles.form}>
          {step === "options" && (
            <>
              <Pressable
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={handleGoogleSignIn}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator size="small" color={colors.onPrimary} />
                ) : (
                  <Text style={styles.buttonText}>Sign in with Google</Text>
                )}
              </Pressable>

              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={typography.small}>or</Text>
                <View style={styles.dividerLine} />
              </View>

              <Pressable style={styles.buttonOutline} onPress={() => setStep("email")}>
                <Text style={styles.buttonOutlineText}>Sign in with Email</Text>
              </Pressable>
            </>
          )}

          {step === "email" && (
            <>
              <TextInput
                style={styles.input}
                placeholder="Email"
                placeholderTextColor={colors.textMuted}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
              />

              {error ? <Text style={styles.error}>{error}</Text> : null}

              <Pressable
                style={[styles.button, (loading || !email.trim()) && styles.buttonDisabled]}
                onPress={handleSendCode}
                disabled={loading || !email.trim()}
              >
                {loading ? (
                  <ActivityIndicator size="small" color={colors.onPrimary} />
                ) : (
                  <Text style={styles.buttonText}>Send Code</Text>
                )}
              </Pressable>

              <Pressable style={styles.textButton} onPress={handleBack}>
                <Text style={typography.small}>Back</Text>
              </Pressable>
            </>
          )}

          {step === "code" && (
            <>
              <Text style={[typography.small, styles.codeInfo]}>
                A verification code was sent to{`\n`}
                {email}
              </Text>

              <TextInput
                style={[styles.input, styles.codeInput]}
                placeholder="000000"
                placeholderTextColor={colors.textMuted}
                value={code}
                onChangeText={setCode}
                keyboardType="number-pad"
                maxLength={6}
                autoFocus
              />

              {error ? <Text style={styles.error}>{error}</Text> : null}

              <Pressable
                style={[styles.button, (loading || code.trim().length < 6) && styles.buttonDisabled]}
                onPress={handleVerifyCode}
                disabled={loading || code.trim().length < 6}
              >
                {loading ? (
                  <ActivityIndicator size="small" color={colors.onPrimary} />
                ) : (
                  <Text style={styles.buttonText}>Verify</Text>
                )}
              </Pressable>

              <View style={styles.codeActions}>
                <Pressable
                  style={styles.textButton}
                  onPress={handleSendCode}
                  disabled={loading || resendCooldown > 0}
                >
                  <Text style={typography.small}>
                    {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend Code"}
                  </Text>
                </Pressable>
                <Pressable style={styles.textButton} onPress={handleBack}>
                  <Text style={typography.small}>Change Email</Text>
                </Pressable>
              </View>
            </>
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const useStyles = makeUseStyles((t) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: t.colors.bg, justifyContent: "center" },
    inner: { paddingHorizontal: spacing.screen, alignItems: "center" },
    subtitle: { marginTop: 6, marginBottom: 32 },
    form: { width: "100%", gap: 14 },
    input: {
      backgroundColor: t.colors.surface,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: t.colors.border,
      padding: 14,
      fontSize: 16,
      color: t.colors.text,
    },
    codeInput: { fontSize: 24, textAlign: "center", letterSpacing: 8 },
    codeInfo: { textAlign: "center", marginBottom: 4 },
    button: {
      backgroundColor: t.colors.primary,
      borderRadius: radii.md,
      padding: 16,
      alignItems: "center",
    },
    buttonDisabled: { opacity: 0.5 },
    buttonText: { fontSize: 16, fontWeight: "600", color: t.colors.onPrimary },
    buttonOutline: {
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: t.colors.borderStrong,
      padding: 16,
      alignItems: "center",
      backgroundColor: t.colors.surface,
    },
    buttonOutlineText: { fontSize: 16, fontWeight: "600", color: t.colors.text },
    divider: { flexDirection: "row", alignItems: "center", gap: 10 },
    dividerLine: { flex: 1, height: 1, backgroundColor: t.colors.border },
    textButton: { alignSelf: "center", padding: 8 },
    codeActions: { flexDirection: "row", justifyContent: "center", gap: 8 },
    error: { fontSize: 13, color: t.colors.danger, textAlign: "center" },
  }),
);
