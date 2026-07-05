import { logger } from '../logger';

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

interface ExpoPushResponse {
  data?: { status: 'ok' | 'error'; message?: string; details?: Record<string, unknown> };
}

// Best-effort: a failed or unreachable push send should never fail the
// request that triggered it (e.g. sending a chat message), so errors are
// swallowed here rather than propagated to the caller — but still logged,
// since this is otherwise a silent failure mode (e.g. a stale/uninstalled
// token) with no other visibility.
export async function sendPushNotification(message: PushMessage): Promise<void> {
  try {
    const res = await fetch(EXPO_PUSH_ENDPOINT, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });
    const json = (await res.json().catch(() => null)) as ExpoPushResponse | null;
    const ticket = json?.data;

    if (!res.ok || ticket?.status === 'error') {
      logger.error({ status: res.status, ticket }, 'Expo push send was rejected');
    }
  } catch (err) {
    logger.error({ err }, 'Expo push send failed');
  }
}
