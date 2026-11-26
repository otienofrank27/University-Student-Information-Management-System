let memoryToken: string | null = null;
let onUnauthorizedHandler: (() => void) | null = null;

export class ApiError extends Error {
  status: number;
  retryAfterSeconds?: number;

  constructor(message: string, status: number, retryAfterSeconds?: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export function setAuthToken(token: string | null): void {
  memoryToken = token;
}

export function getAuthToken(): string | null {
  return memoryToken;
}

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorizedHandler = handler;
}

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (memoryToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${memoryToken}`);
  }

  const res = await fetch(path, {
    ...options,
    headers,
  });

  const isPublicAuthMutation =
    path === '/api/auth/login' ||
    path === '/api/auth/signup' ||
    path.startsWith('/api/auth/forgot-password/');

  if (res.status === 401 && !isPublicAuthMutation && onUnauthorizedHandler) {
    onUnauthorizedHandler();
  }

  const text = await res.text();
  let data: unknown = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text };
    }
  }

  if (!res.ok) {
    const errMsg =
      typeof data === 'object' && data !== null && 'error' in data
        ? String((data as { error: unknown }).error)
        : `Request failed (${res.status})`;

    let retryAfterSeconds: number | undefined;
    if (
      typeof data === 'object' &&
      data !== null &&
      'retryAfterSeconds' in data &&
      typeof (data as { retryAfterSeconds: unknown }).retryAfterSeconds === 'number'
    ) {
      retryAfterSeconds = (data as { retryAfterSeconds: number }).retryAfterSeconds;
    } else {
      const retryHeader = res.headers.get('Retry-After');
      if (retryHeader && /^\d+$/.test(retryHeader.trim())) {
        retryAfterSeconds = Number(retryHeader.trim());
      }
    }

    throw new ApiError(errMsg, res.status, retryAfterSeconds);
  }

  return data as T;
}

export async function apiDownloadFile(path: string, filename: string): Promise<void> {
  const headers = new Headers();
  if (memoryToken) {
    headers.set('Authorization', `Bearer ${memoryToken}`);
  }

  const res = await fetch(path, { headers });
  if (res.status === 401 && onUnauthorizedHandler) {
    onUnauthorizedHandler();
  }
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(errText || 'Failed to download file.');
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
