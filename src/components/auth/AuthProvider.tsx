import React, { createContext, useContext, useEffect, useState } from 'react';
import { authService } from '@/lib/auth-service';

interface AuthError {
    message: string;
    status?: number;
}

interface AuthResponse {
    error: AuthError | null;
    message?: string;
}

interface AuthContextType {
    user: { id: string; email: string; fullName: string; roles: string[]; merchantId?: string } | null;
    loading: boolean;
    signUp: (email: string, password: string, fullName: string, mobileNumber: string, role: 'merchant' | 'distributor' | 'employee') => Promise<AuthResponse>;
    signIn: (email: string, password: string) => Promise<AuthResponse>;
    signOut: () => Promise<void>;
    signInWithGoogle: () => Promise<AuthResponse>;
    resetPassword: (email: string) => Promise<{ error: any }>;
    updatePassword: (password: string) => Promise<{ error: any }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<AuthContextType['user']>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const saved = authService.getUser();
        if (saved) {
            setUser(saved);
        }
        setLoading(false);
    }, []);

    const signUp = async (
        email: string,
        password: string,
        fullName: string,
        mobileNumber: string,
        role: 'merchant' | 'distributor' | 'employee'
    ): Promise<AuthResponse> => {
        try {
            if (!email || !password || !fullName) {
                return { error: { message: 'Please fill in all required fields' } };
            }
            if (password.length < 6) {
                return { error: { message: 'Password must be at least 6 characters long' } };
            }

            const result = await authService.register(email, password, fullName, mobileNumber, role);

            if (result.success && result.data) {
                setUser({
                    id: result.data.userId,
                    email: result.data.email,
                    fullName: result.data.fullName || fullName,
                    roles: result.data.roles,
                    merchantId: result.data.merchantId,
                });
                return { error: null };
            }

            return { error: { message: result.error?.message || 'Registration failed' } };
        } catch (err: any) {
            return { error: { message: err.message || 'An unexpected error occurred' } };
        }
    };

    const signIn = async (email: string, password: string): Promise<AuthResponse> => {
        try {
            if (!email || !password) {
                return { error: { message: 'Email and password are required' } };
            }

            const result = await authService.login(email, password);

            if (result.success && result.data) {
                setUser({
                    id: result.data.userId,
                    email: result.data.email,
                    fullName: result.data.fullName || '',
                    roles: result.data.roles,
                    merchantId: result.data.merchantId,
                });
                return { error: null };
            }

            if (result.error?.message?.includes('Invalid login credentials') || result.error?.message?.includes('Bad credentials')) {
                return { error: { message: 'Invalid email or password. Please check your credentials.' } };
            }

            return { error: { message: result.error?.message || 'Login failed' } };
        } catch (err: any) {
            return { error: { message: err.message || 'An unexpected error occurred' } };
        }
    };

    const signOut = async () => {
        authService.logout();
        setUser(null);
    };

    const signInWithGoogle = async (): Promise<AuthResponse> => {
        return { error: { message: 'Google sign-in is not available. Please use email and password.' } };
    };

    const resetPassword = async (email: string): Promise<{ error: any }> => {
        return { error: { message: 'Password reset is handled by the admin. Please contact support.' } };
    };

    const updatePassword = async (newPassword: string): Promise<{ error: any }> => {
        return { error: { message: 'Password update is handled by the admin. Please contact support.' } };
    };

    const value = {
        user,
        loading,
        signUp,
        signIn,
        signOut,
        signInWithGoogle,
        resetPassword,
        updatePassword,
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
