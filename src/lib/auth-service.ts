const API_BASE = import.meta.env.VITE_API_URL || '';

interface AuthResponse {
  success: boolean;
  message?: string;
  data?: {
    token: string;
    refreshToken?: string;
    userId: string;
    email: string;
    fullName?: string;
    roles: string[];
    merchantId?: string;
  };
  error?: {
    code: string;
    message: string;
  };
}

interface UserInfo {
  id: string;
  email: string;
  fullName: string;
  mobileNumber?: string;
  roles: string[];
  merchantId?: string;
}

const TOKEN_KEY = 'sabbpe_token';
const REFRESH_KEY = 'sabbpe_refresh';
const USER_KEY = 'sabbpe_user';

export const authService = {
  async register(email: string, password: string, fullName: string, mobileNumber: string, role: string): Promise<AuthResponse> {
    try {
      const res = await fetch(`${API_BASE}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, fullName, mobileNumber, role }),
      });
      const data = await res.json();

      const normalized = data.user && data.token
        ? {
            success: true,
            data: {
              token: data.token,
              refreshToken: data.refreshToken,
              userId: data.user.id,
              email: data.user.email,
              fullName: data.user.name || fullName,
              roles: data.user.role ? [data.user.role] : [],
              merchantId: data.user.merchantId,
            },
          }
        : data;

      if (normalized.success && normalized.data) {
        localStorage.setItem(TOKEN_KEY, normalized.data.token);
        if (normalized.data.refreshToken) localStorage.setItem(REFRESH_KEY, normalized.data.refreshToken);
        localStorage.setItem(USER_KEY, JSON.stringify({
          id: normalized.data.userId,
          email: normalized.data.email,
          fullName: normalized.data.fullName || fullName,
          roles: normalized.data.roles,
          merchantId: normalized.data.merchantId,
        }));
      }
      return normalized;
    } catch (err: any) {
      return { success: false, error: { code: 'NETWORK_ERROR', message: err.message } };
    }
  },

  async login(email: string, password: string): Promise<AuthResponse> {
    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();

      const normalized = data.user && data.token
        ? {
            success: true,
            data: {
              token: data.token,
              refreshToken: data.refreshToken,
              userId: data.user.id,
              email: data.user.email,
              fullName: data.user.name || '',
              roles: data.user.role ? [data.user.role] : [],
              merchantId: data.user.merchantId,
            },
          }
        : data;

      if (normalized.success && normalized.data) {
        localStorage.setItem(TOKEN_KEY, normalized.data.token);
        if (normalized.data.refreshToken) localStorage.setItem(REFRESH_KEY, normalized.data.refreshToken);
        localStorage.setItem(USER_KEY, JSON.stringify({
          id: normalized.data.userId,
          email: normalized.data.email,
          fullName: normalized.data.fullName || '',
          roles: normalized.data.roles,
          merchantId: normalized.data.merchantId,
        }));
      }
      return normalized;
    } catch (err: any) {
      return { success: false, error: { code: 'NETWORK_ERROR', message: err.message } };
    }
  },

  logout(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(USER_KEY);
  },

  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  },

  getUser(): UserInfo | null {
    try {
      const raw = localStorage.getItem(USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  isAuthenticated(): boolean {
    return !!this.getToken();
  },

  getAuthHeaders(): Record<string, string> {
    const token = this.getToken();
    return token ? { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
  },
};
