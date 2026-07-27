


// src/pages/SupportLogin.tsx

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSupportAuth } from '../context/SupportAuthContext';
import { Lock, Mail, AlertCircle, Loader2 } from 'lucide-react';

export const SupportLogin: React.FC = () => {
    const navigate = useNavigate();
    const { login } = useSupportAuth(); // ✅ only login from context

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (!email || !password) {
            setError('Email and password are required');
            return;
        }

        try {
            setLoading(true);

            await login(email, password);

            const storedUser = JSON.parse(localStorage.getItem('user') || '{}');

            // if (storedUser.role === 'super_admin' || storedUser.role === 'admin') {
            //     navigate('/admin');
            // } else {
            //     navigate('/dashboard');
            // }
if (storedUser.role === 'super_admin' || storedUser.role === 'admin') {
    navigate('/admin');
} else {
    navigate('/support');
}
        } catch (err: any) {
            setError(err.message || 'Login failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-600 via-blue-700 to-blue-900 flex items-center justify-center p-4">
            <div className="w-full max-w-md">
                {/* Logo/Header */}
                <div className="text-center mb-8">
                    <div className="bg-white rounded-lg p-4 inline-block shadow-lg">
                        <Lock className="w-8 h-8 text-blue-600" />
                    </div>
                    <h1 className="text-3xl font-bold text-white mt-4">SabbPe Support</h1>
                    <p className="text-blue-100 mt-2">Admin & Support Portal</p>
                </div>

                {/* Login Card */}
                <div className="bg-white rounded-lg shadow-2xl p-8 space-y-6">

                    {/* Error Alert */}
                    {error && (
                        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex gap-3">
                            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                            <div className="text-sm text-red-800">{error}</div>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">

                        {/* Email */}
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">
                                Email Address
                            </label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                                    disabled={loading}
                                />
                            </div>
                        </div>

                        {/* Password */}
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">
                                Password
                            </label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                                    disabled={loading}
                                />
                            </div>
                        </div>

                        {/* Submit Button */}
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold py-3 px-4 rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all disabled:opacity-50"
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                                    Signing in...
                                </>
                            ) : (
                                'Sign In'
                            )}
                        </button>
                    </form>

                    {/* Footer */}
                    <div className="pt-4 border-t border-gray-200 text-center text-xs text-gray-600">
                        🔒 Authorized personnel only
                    </div>
                </div>

                <div className="mt-8 text-center text-blue-100 text-sm">
                    Powered by SabbPe
                </div>
            </div>
        </div>
    );
};
