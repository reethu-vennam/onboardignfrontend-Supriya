import React, { createContext, useContext, useState, useEffect } from 'react';
import { bankLogin, handleError } from '../lib/bankApi';

export interface BankUser {
    userId: string;
    email: string;
    name: string;
    role: string;
    bankStaffId: string;
}

interface BankAuthContextType {
    user: BankUser | null;
    token: string | null;
    isAuthenticated: boolean;
    loading: boolean;
    error: string | null;
    login: (email: string, password: string) => Promise<void>;
    logout: () => void;
    clearError: () => void;
}

const BankAuthContext = createContext<BankAuthContextType | undefined>(undefined);

export const BankAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<BankUser | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const storedToken = localStorage.getItem('bank_token');
        const storedUser = localStorage.getItem('bank_user');
        if (storedToken && storedUser) {
            try {
                setToken(storedToken);
                setUser(JSON.parse(storedUser));
            } catch (err) {
                localStorage.removeItem('bank_token');
                localStorage.removeItem('bank_user');
            }
        }
    }, []);

    const login = async (email: string, password: string) => {
        try {
            setLoading(true);
            setError(null);
            const response = await bankLogin({ email, password });
            setToken(response.token);
            setUser(response.user);
            localStorage.setItem('bank_token', response.token);
            localStorage.setItem('bank_user', JSON.stringify(response.user));
        } catch (err) {
            const errorMessage = handleError(err);
            setError(errorMessage);
            throw err;
        } finally {
            setLoading(false);
        }
    };

    const logout = () => {
        setUser(null);
        setToken(null);
        setError(null);
        localStorage.removeItem('bank_token');
        localStorage.removeItem('bank_user');
    };

    const clearError = () => setError(null);

    return (
        <BankAuthContext.Provider value={{ user, token, isAuthenticated: !!token, loading, error, login, logout, clearError }}>
            {children}
        </BankAuthContext.Provider>
    );
};

export const useBankAuth = () => {
    const context = useContext(BankAuthContext);
    if (!context) throw new Error('useBankAuth must be used within BankAuthProvider');
    return context;
};