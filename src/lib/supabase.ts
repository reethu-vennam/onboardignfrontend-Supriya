// Compatibility wrapper for legacy imports.
// The onboarding frontend now talks to the Spring/MariaDB backend only.

import { authService } from '@/lib/auth-service';

export const supabase = {
    auth: {
        async signOut() {
            authService.logout();
            return { error: null };
        },
        async getSession() {
            const token = authService.getToken();
            return {
                data: {
                    session: token ? { access_token: token, user: authService.getUser() } : null,
                },
                error: null,
            };
        },
    },
};

export const getCurrentUser = async () => authService.getUser();

export const signOut = async () => {
    authService.logout();
};

export type { Database } from './database.types';
