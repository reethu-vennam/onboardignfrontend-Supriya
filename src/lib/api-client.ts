import { authService } from './auth-service';

export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';

class ApiClient {
    private getAuthHeaders(): HeadersInit {
        const token = authService.getToken();
        const headers: Record<string, string> = {
            'Content-Type': 'application/json'
        };
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        return headers;
    }

    async get(url: string) {
        const headers = this.getAuthHeaders();
        const fullUrl = url.startsWith('/api') ? url : `/api${url}`;
        const response = await fetch(`${API_BASE_URL}${fullUrl}`, {
            method: 'GET',
            headers
        });
        if (!response.ok) {
            const error = await response.json().catch(() => ({
                message: `Request failed with status ${response.status}`
            }));
            throw new Error(error.message || 'Request failed');
        }
        return response.json();
    }

    async post(url: string, body?: any) {
        const headers = this.getAuthHeaders();
        const fullUrl = url.startsWith('/api') ? url : `/api${url}`;
        const response = await fetch(`${API_BASE_URL}${fullUrl}`, {
            method: 'POST',
            headers,
            body: JSON.stringify(body)
        });
        if (!response.ok) {
            const error = await response.json().catch(() => ({
                message: `Request failed with status ${response.status}`
            }));
            throw new Error(error.message || 'Request failed');
        }
        return response.json();
    }

    async submitMerchantApplication(data: any) {
        return this.post('/api/merchant/profile', data);
    }

    async getMerchantProfile() {
        try {
            const result = await this.get('/api/merchant/profile');
            return result;
        } catch (err: any) {
            if (err.message?.includes('404')) {
                return { success: true, data: null };
            }
            throw err;
        }
    }

    async getMerchantStatus() {
        try {
            const result = await this.get('/api/merchant/profile');
            return {
                success: true,
                data: { status: result.data?.onboardingStatus }
            };
        } catch (err: any) {
            if (err.message?.includes('404')) {
                return { success: true, data: null };
            }
            throw err;
        }
    }

    async getStatusHistory() {
        return { success: true, data: [] };
    }
}

export const apiClient = new ApiClient();
