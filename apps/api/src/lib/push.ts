// Sends via Expo's push service rather than calling FCM/APNs directly — Expo
// routes to the right platform transport under the hood, so no separate
// Firebase service-account credentials are needed on the server.
const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';

interface PushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

// Best-effort: a failed or unreachable push send should never fail the
// request that triggered it (e.g. sending a chat message), so errors are
// swallowed here rather than propagated to the caller.
export async function sendPushNotification(message: PushMessage): Promise<void> {
  try {
    await fetch(EXPO_PUSH_ENDPOINT, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });
  } catch {
    // Notification delivery is not critical to the request that triggered it.
  }
}
