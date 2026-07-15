export interface AuthSession {
  user: {
    id: string;
    email: string;
    displayName: string;
    createdAt: string;
    updatedAt: string;
  };
  organisation: { id: string; name: string; slug: string; role: string };
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface RegisterInput extends LoginInput {
  displayName: string;
  organisationName: string;
}

export class AuthApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'AuthApiError';
  }
}

export interface AuthApi {
  login(input: LoginInput): Promise<AuthSession>;
  register(input: RegisterInput): Promise<AuthSession>;
  me(): Promise<AuthSession>;
  refresh(): Promise<AuthSession>;
  logout(): Promise<void>;
}

export class HttpAuthApi implements AuthApi {
  constructor(private readonly baseUrl: string) {}

  login(input: LoginInput): Promise<AuthSession> {
    return this.request<AuthSession>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  register(input: RegisterInput): Promise<AuthSession> {
    return this.request<AuthSession>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  me(): Promise<AuthSession> {
    return this.request<AuthSession>('/auth/me', { method: 'GET' });
  }

  refresh(): Promise<AuthSession> {
    return this.request<AuthSession>('/auth/refresh', { method: 'POST' });
  }

  async logout(): Promise<void> {
    await this.request<void>('/auth/logout', { method: 'POST' });
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...init.headers },
      });
    } catch {
      throw new AuthApiError(
        'WorldLab could not be reached. Check your connection and try again.',
        'NETWORK_ERROR',
        0,
      );
    }

    const payload = response.status === 204 ? undefined : ((await response.json()) as unknown);
    if (!response.ok) {
      const error = payload as { error?: { code?: string; message?: string } } | undefined;
      throw new AuthApiError(
        error?.error?.message ?? 'We could not complete that request. Please try again.',
        error?.error?.code ?? 'AUTH_REQUEST_FAILED',
        response.status,
      );
    }
    return payload as T;
  }
}

export const authApi: AuthApi = new HttpAuthApi(
  import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api',
);
