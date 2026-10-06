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
      const url = `${API_BASE}/api/auth/register`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          fullName,
          name: fullName,
          mobileNumber,
          role,
        }),
      });

      const text = await res.text();
      let data: any = null;
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          data = null;
        }
      }

      if (!res.ok) {
        const errorMsg = data?.message || data?.error?.message || (text && text.length < 200 ? text : `Registration failed (HTTP ${res.status})`);
        return {
          success: false,
          error: {
            code: data?.status ? String(data.status) : `HTTP_${res.status}`,
            message: errorMsg,
          },
        };
      }

      if (!data) {
        return {
          success: false,
          error: {
            code: 'EMPTY_RESPONSE',
            message: 'Server returned an empty response. Please ensure the backend is running.',
          },
        };
      }

      if (data.success === false || (data.status && data.status >= 400)) {
        return {
          success: false,
          error: {
            code: data.status ? String(data.status) : 'ERROR',
            message: data.message || data.error?.message || 'Registration failed',
          },
        };
      }

      const payload = data.data || data;
      const token = payload.token || payload.accessToken || '';
      const userId = payload.userId || payload.id || 'user_' + Date.now();
      const userEmail = payload.email || email;
      const userName = payload.fullName || payload.name || fullName;
      const rawRoles = payload.roles || (payload.role ? [payload.role.toLowerCase()] : [role.toLowerCase()]);
      const roles = Array.isArray(rawRoles) ? rawRoles : [String(rawRoles)];
      const merchantId = payload.merchantId;

      if (token) {
        localStorage.setItem(TOKEN_KEY, token);
      }
      if (payload.refreshToken) {
        localStorage.setItem(REFRESH_KEY, payload.refreshToken);
      }

      const userInfo: UserInfo = {
        id: userId,
        email: userEmail,
        fullName: userName,
        mobileNumber: payload.mobileNumber || mobileNumber,
        roles,
        merchantId,
      };

      localStorage.setItem(USER_KEY, JSON.stringify(userInfo));

      return {
        success: true,
        message: data.message || 'Registration successful',
        data: {
          token,
          userId: userInfo.id,
          email: userInfo.email,
          fullName: userInfo.fullName,
          roles: userInfo.roles,
          merchantId: userInfo.merchantId,
        },
      };
    } catch (err: any) {
      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: err.message || 'Network error occurred while connecting to the server',
        },
      };
    }
  },

  async login(email: string, password: string): Promise<AuthResponse> {
    try {
      const url = `${API_BASE}/api/auth/login`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const text = await res.text();
      let data: any = null;
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          data = null;
        }
      }

      if (!res.ok) {
        const errorMsg = data?.message || data?.error?.message || (text && text.length < 200 ? text : `Login failed (HTTP ${res.status})`);
        return {
          success: false,
          error: {
            code: data?.status ? String(data.status) : `HTTP_${res.status}`,
            message: errorMsg,
          },
        };
      }

      if (!data) {
        return {
          success: false,
          error: {
            code: 'EMPTY_RESPONSE',
            message: 'Server returned an empty response. Please ensure the backend is running.',
          },
        };
      }

      if (data.success === false || (data.status && data.status >= 400)) {
        return {
          success: false,
          error: {
            code: data.status ? String(data.status) : 'ERROR',
            message: data.message || data.error?.message || 'Login failed',
          },
        };
      }

      const payload = data.data || data;
      const token = payload.token || payload.accessToken || '';
      const userId = payload.userId || payload.id || 'user_' + Date.now();
      const userEmail = payload.email || email;
      const userName = payload.fullName || payload.name || '';
      const rawRoles = payload.roles || (payload.role ? [payload.role.toLowerCase()] : ['merchant']);
      const roles = Array.isArray(rawRoles) ? rawRoles : [String(rawRoles)];
      const merchantId = payload.merchantId;

      if (token) {
        localStorage.setItem(TOKEN_KEY, token);
      }
      if (payload.refreshToken) {
        localStorage.setItem(REFRESH_KEY, payload.refreshToken);
      }

      const userInfo: UserInfo = {
        id: userId,
        email: userEmail,
        fullName: userName,
        roles,
        merchantId,
      };

      localStorage.setItem(USER_KEY, JSON.stringify(userInfo));

      return {
        success: true,
        message: data.message || 'Login successful',
        data: {
          token,
          userId: userInfo.id,
          email: userInfo.email,
          fullName: userInfo.fullName,
          roles: userInfo.roles,
          merchantId: userInfo.merchantId,
        },
      };
    } catch (err: any) {
      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: err.message || 'Network error occurred while connecting to the server',
        },
      };
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
