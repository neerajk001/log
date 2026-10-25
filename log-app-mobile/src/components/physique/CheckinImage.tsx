import { useEffect, useState } from "react";
import {
  Image,
  StyleSheet,
  View,
  type ImageResizeMode,
  type ImageStyle,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useAuth } from "@clerk/clerk-expo";
import { physiqueImageUrl } from "../../api/coach";
import { makeUseStyles } from "../../theme/ThemeContext";

/**
 * An owner-only check-in image. The API requires the Clerk token, so the token
 * is put on the image request itself; the server answers with `private,
 * no-store`. `version` (the row's updated_at) busts the cache after a same-week
 * replacement.
 */
export function CheckinImage({
  id,
  version,
  style,
  resizeMode = "cover",
  accessibilityLabel = "Body check-in photo",
}: {
  id: string;
  version?: string;
  style?: StyleProp<ImageStyle>;
  resizeMode?: ImageResizeMode;
  accessibilityLabel?: string;
}) {
  const { getToken } = useAuth();
  const styles = useStyles();
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getToken()
      .then((value) => {
        if (!cancelled) setToken(value);
      })
      .catch(() => {
        if (!cancelled) setToken(null);
      });
    return () => {
      cancelled = true;
    };
  }, [getToken]);

  if (!token) {
    return <View style={[styles.placeholder, style as StyleProp<ViewStyle>]} />;
  }

  return (
    <Image
      source={{
        uri: physiqueImageUrl(id, version),
        headers: { Authorization: `Bearer ${token}` },
      }}
      style={style}
      resizeMode={resizeMode}
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
    />
  );
}

const useStyles = makeUseStyles((t) =>
  StyleSheet.create({
    placeholder: { backgroundColor: t.colors.surfaceAlt },
  }),
);
