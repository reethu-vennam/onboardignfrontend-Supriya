import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBankAuth } from '../context/BankAuthContext';
import { Lock, Mail, AlertCircle, Loader2 } from 'lucide-react';

export const BankLogin: React.FC = () => {
    const navigate = useNavigate();
    const { login, loading, error, clearError } = useBankAuth();
    const [email, setEmail] = useState('bank@nsdlb.com');
    const [password, setPassword] = useState('bank123');
    const [localError, setLocalError] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLocalError('');
        clearError();

        if (!email || !password) {
            setLocalError('Email and password required');
            return;
        }

        try {
            await login(email, password);
            navigate('/dashboard');
        } catch (err) {
            setLocalError(err instanceof Error ? err.message : 'Login failed');
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-purple-600 via-purple-700 to-purple-900 flex items-center justify-center p-4">
            <div className="w-full max-w-md">
                <div className="text-center mb-8">
                    <div className="bg-white rounded-lg p-4 inline-block shadow-lg">
                        <Lock className="w-8 h-8 text-purple-600" />
                    </div>
                    <h1 className="text-3xl font-bold text-white mt-4">SabbPe Bank</h1>
                    <p className="text-purple-100 mt-2">Application Review Portal</p>
                </div>

                <div className="bg-white rounded-lg shadow-2xl p-8 space-y-6">
                    {(error || localError) && (
                        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex gap-3">
                            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
                            <div className="text-sm text-red-800">{error || localError}</div>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">Email</label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => { setEmail(e.target.value); setLocalError(''); clearError(); }}
                                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                                    placeholder="bank@nsdlb.com"
                                    disabled={loading}
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">Password</label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => { setPassword(e.target.value); setLocalError(''); clearError(); }}
                                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                                    placeholder="••••••••"
                                    disabled={loading}
                                />
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-gradient-to-r from-purple-600 to-purple-700 text-white font-semibold py-3 rounded-lg hover:from-purple-700 hover:to-purple-800 flex items-center justify-center gap-2"
                        >
                            {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Signing in...</> : 'Sign In'}
                        </button>
                    </form>

                    <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
                        <p className="text-xs font-semibold text-purple-900 mb-2">📋 Demo Credentials</p>
                        <p className="text-xs text-purple-800"><strong>Email:</strong> bank@nsdlb.com<br /><strong>Password:</strong> bank123</p>
                    </div>
                </div>

                <div className="mt-8 text-center text-purple-100 text-sm">
                    <p>Powered by SabbPe</p>
                    <p className="text-xs mt-2 opacity-75">Bank Module v1.0</p>
                </div>
            </div>
        </div>
    );
};