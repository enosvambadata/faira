import { getSession, saveSession, clearSession } from './session';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  auth?: boolean;
  formData?: FormData;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};

  if (options.auth) {
    const session = await getSession();
    if (session) {
      headers.Authorization = `Bearer ${session.accessToken}`;
    }
  }

  let body: BodyInit | undefined;
  if (options.formData) {
    body = options.formData;
  } else if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }

  const res = await fetch(`${API_URL}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body,
  });

  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    const err = json?.error ?? {};
    throw new ApiError(err.code ?? 'UNKNOWN_ERROR', err.message ?? 'Something went wrong', res.status);
  }

  return json.data as T;
}

export interface AuthUser {
  id: string;
  email: string | null;
  phone: string | null;
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: AuthUser;
}

export interface Profile {
  id: string;
  displayName: string | null;
  city: string | null;
  avatarUrl: string | null;
}

export const auth = {
  signup: (payload: { email?: string; phone?: string; password?: string }) =>
    request<AuthUser & { otpSent?: boolean }>('/api/v1/auth/signup', { method: 'POST', body: payload }),

  login: (payload: { email: string; password: string }) =>
    request<AuthSession>('/api/v1/auth/login', { method: 'POST', body: payload }),

  otpResend: (payload: { phone: string }) =>
    request<{ message: string }>('/api/v1/auth/otp/resend', { method: 'POST', body: payload }),

  async otpVerify(payload: { phone: string; token: string }) {
    const result = await request<AuthSession & { phoneConfirmed: boolean }>('/api/v1/auth/otp/verify', {
      method: 'POST',
      body: payload,
    });
    await saveSession(result);
    return result;
  },

  async loginAndSave(payload: { email: string; password: string }) {
    const result = await this.login(payload);
    await saveSession(result);
    return result;
  },

  async logout() {
    await clearSession();
  },
};

export const profile = {
  get: () => request<Profile>('/api/v1/profile', { method: 'GET', auth: true }),

  update: (payload: { displayName?: string; city?: string }) =>
    request<Profile>('/api/v1/profile', { method: 'PATCH', body: payload, auth: true }),

  uploadAvatar: (fileUri: string, mimeType: string, fileName: string) => {
    const formData = new FormData();
    // React Native's fetch/FormData accepts this {uri, type, name} shape for files.
    formData.append('avatar', { uri: fileUri, type: mimeType, name: fileName } as unknown as Blob);
    return request<Profile>('/api/v1/profile/avatar', { method: 'POST', formData, auth: true });
  },
};
