import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/components/auth/AuthProvider';
import { authService } from '@/lib/auth-service';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertCircle, Mail, Lock, User, Phone, ArrowLeft, Check, X, Circle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Logo } from '@/components/ui/logo';
import { useToast } from '@/hooks/use-toast';

const Auth = () => {
    const { user, signIn, signUp, loading } = useAuth();
    const { toast } = useToast();
    const navigate = useNavigate();
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedRole, setSelectedRole] = useState<'merchant' | 'distributor' | 'employee' | null>(null);

    const [signInData, setSignInData] = useState({
        email: '',
        password: '',
    });

    const [signUpData, setSignUpData] = useState({
        email: '',
        password: '',
        confirmPassword: '',
        fullName: '',
        mobileNumber: '',
    });
    const [isConfirmFocused, setIsConfirmFocused] = useState(false);

    const passwordRequirements = [
        {
            id: 'length',
            label: 'At least 6 characters',
            satisfied: signUpData.password.length >= 6,
        },
        {
            id: 'uppercase',
            label: 'At least 1 uppercase letter (A-Z)',
            satisfied: /[A-Z]/.test(signUpData.password),
        },
        {
            id: 'lowercase',
            label: 'At least 1 lowercase letter (a-z)',
            satisfied: /[a-z]/.test(signUpData.password),
        },
        {
            id: 'number',
            label: 'At least 1 numerical digit (0-9)',
            satisfied: /[0-9]/.test(signUpData.password),
        },
        {
            id: 'special',
            label: 'At least 1 special character (@, #, $, %, !, etc.)',
            satisfied: /[^A-Za-z0-9]/.test(signUpData.password),
        },
    ];

    const isPasswordValid = passwordRequirements.every((req) => req.satisfied);
    const showRequirements = (!isConfirmFocused && signUpData.confirmPassword.length === 0) || !isPasswordValid;

    useEffect(() => {
        const role = sessionStorage.getItem('selected_role') as 'merchant' | 'distributor' | 'employee' | null;
        if (!role) {
            navigate('/select-role', { replace: true });
            return;
        }
        setSelectedRole(role);
    }, [navigate]);

    useEffect(() => {
        if (!loading && user) {
            const roles = user.roles || [];
            if (roles.includes('merchant')) {
                navigate('/merchant-onboarding', { replace: true });
            } else if (roles.includes('distributor')) {
                navigate('/distributor', { replace: true });
            } else if (roles.includes('employee')) {
                navigate('/employee', { replace: true });
            } else if (roles.includes('admin')) {
                navigate('/distributor/admin', { replace: true });
            } else {
                navigate('/select-role', { replace: true });
            }
        }
    }, [user, loading, navigate]);

    const handleSignIn = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        const { error } = await signIn(signInData.email, signInData.password);

        if (error) {
            let errorMessage = error.message;
            if (error.message.includes('Invalid login credentials')) {
                errorMessage = 'No account found with these credentials. Please sign up first.';
            }
            setError(errorMessage);
            toast({
                variant: "destructive",
                title: "Sign in failed",
                description: errorMessage,
            });
        } else {
            toast({
                title: "Welcome back!",
                description: "You have successfully signed in.",
            });
        }
        setIsLoading(false);
    };

    const handleSignUp = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        if (!isPasswordValid) {
            const missing = passwordRequirements
                .filter((r) => !r.satisfied)
                .map((r) => r.label.toLowerCase());
            const errorMsg = `Password must satisfy all requirements: missing ${missing.join(', ')}.`;
            setError(errorMsg);
            toast({
                variant: "destructive",
                title: "Invalid password",
                description: errorMsg,
            });
            setIsLoading(false);
            return;
        }

        if (signUpData.password !== signUpData.confirmPassword) {
            setError("Passwords don't match");
            toast({
                variant: "destructive",
                title: "Passwords don't match",
                description: "Password and Confirm Password must match.",
            });
            setIsLoading(false);
            return;
        }
        if (!selectedRole) {
            setError("Role not selected. Please go back and select your role.");
            setIsLoading(false);
            return;
        }

        const { error } = await signUp(
            signUpData.email,
            signUpData.password,
            signUpData.fullName,
            signUpData.mobileNumber,
            selectedRole
        );

        if (error) {
            setError(error.message);
            toast({
                variant: "destructive",
                title: "Sign up failed",
                description: error.message,
            });
        } else {
            toast({
                title: "Account created!",
                description: "You are now signed in.",
            });
        }
        setIsLoading(false);
    };

    const handleBackToRoleSelection = () => {
        sessionStorage.removeItem('selected_role');
        navigate('/select-role');
    };

    if (loading || !selectedRole) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 to-accent/5">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 to-accent/5 p-4">
            <div className="w-full max-w-md">
                <div className="text-center mb-8">
                    <Logo size="md" className="mb-4" />
                    <h1 className="text-2xl font-bold text-foreground mb-2">
                        SabbPe {selectedRole === 'merchant' ? 'Merchant' : 'Distributor'} Portal
                    </h1>
                    <p className="text-muted-foreground">
                        India's Digital Payments Partner
                    </p>
                </div>

                <Card className="shadow-[var(--shadow-elegant)]">
                    <CardHeader>
                        <div className="flex items-center justify-between mb-2">
                            <CardTitle>Get Started</CardTitle>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleBackToRoleSelection}
                                className="text-muted-foreground hover:text-foreground"
                            >
                                <ArrowLeft className="w-4 h-4 mr-1" />
                                Change Role
                            </Button>
                        </div>
                        <CardDescription>
                            {selectedRole === 'distributor'
                                ? 'Sign in to your Distributor account'
                                : 'Sign in to your account or create a new one as a Merchant'}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {selectedRole === 'merchant' ? (
                        <Tabs defaultValue="signin" className="w-full">
                            <TabsList className="grid w-full grid-cols-2">
                                <TabsTrigger value="signin">Sign In</TabsTrigger>
                                <TabsTrigger value="signup">Sign Up</TabsTrigger>
                            </TabsList>

                            <TabsContent value="signin" className="space-y-4">
                                <form onSubmit={handleSignIn} className="space-y-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="signin-email">Email</Label>
                                        <div className="relative">
                                            <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                            <Input id="signin-email" type="email" placeholder="Enter your email" className="pl-10" value={signInData.email} onChange={(e) => setSignInData({ ...signInData, email: e.target.value })} required />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="signin-password">Password</Label>
                                        <div className="relative">
                                            <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                            <Input id="signin-password" type="password" placeholder="Enter your password" className="pl-10" value={signInData.password} onChange={(e) => setSignInData({ ...signInData, password: e.target.value })} required />
                                        </div>
                                    </div>
                                    {error && (<Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>)}
                                    <Button type="submit" className="w-full" disabled={isLoading}>{isLoading ? "Signing in..." : "Sign In"}</Button>
                                </form>
                            </TabsContent>

                            <TabsContent value="signup" className="space-y-4">
                                <form onSubmit={handleSignUp} className="space-y-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="signup-name">Full Name</Label>
                                        <div className="relative">
                                            <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                            <Input id="signup-name" type="text" placeholder="Enter your full name" className="pl-10" value={signUpData.fullName} onChange={(e) => setSignUpData({ ...signUpData, fullName: e.target.value })} required />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="signup-mobile">Mobile Number</Label>
                                        <div className="relative">
                                            <Phone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                            <Input id="signup-mobile" type="tel" placeholder="Enter your mobile number" className="pl-10" value={signUpData.mobileNumber} onChange={(e) => setSignUpData({ ...signUpData, mobileNumber: e.target.value })} required />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="signup-email">Email</Label>
                                        <div className="relative">
                                            <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                            <Input id="signup-email" type="email" placeholder="Enter your email" className="pl-10" value={signUpData.email} onChange={(e) => setSignUpData({ ...signUpData, email: e.target.value })} required />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="signup-password">Password</Label>
                                        <div className="relative">
                                            <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                            <Input
                                                id="signup-password"
                                                type="password"
                                                placeholder="Create a password"
                                                className="pl-10"
                                                value={signUpData.password}
                                                onChange={(e) => {
                                                    setSignUpData({ ...signUpData, password: e.target.value });
                                                    if (error) setError(null);
                                                }}
                                                required
                                            />
                                        </div>

                                        {/* Password Requirements Checklist - visible while typing password, hidden while confirming password once valid */}
                                        {showRequirements && (
                                            <div className="rounded-lg border border-border/70 bg-muted/40 p-3 space-y-2 text-xs transition-all duration-200">
                                                <p className="font-medium text-foreground/85 text-xs">Password Requirements:</p>
                                                <ul className="space-y-1.5" aria-label="Password requirements">
                                                    {passwordRequirements.map((req) => {
                                                        const isTyped = signUpData.password.length > 0;
                                                        return (
                                                            <li
                                                                key={req.id}
                                                                className={`flex items-center gap-2 text-xs transition-colors duration-150 ${
                                                                    req.satisfied
                                                                        ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                                                                        : isTyped
                                                                        ? 'text-rose-600/90 dark:text-rose-400'
                                                                        : 'text-muted-foreground'
                                                                }`}
                                                            >
                                                                {req.satisfied ? (
                                                                    <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                                                                ) : isTyped ? (
                                                                    <X className="h-3.5 w-3.5 text-rose-500 dark:text-rose-400 shrink-0" />
                                                                ) : (
                                                                    <Circle className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
                                                                )}
                                                                <span>{req.label}</span>
                                                            </li>
                                                        );
                                                    })}
                                                </ul>
                                                {signUpData.password.length > 0 && (
                                                    <div className={`pt-1 border-t border-border/40 text-[11px] font-medium flex items-center gap-1 ${
                                                        isPasswordValid
                                                            ? 'text-emerald-600 dark:text-emerald-400'
                                                            : 'text-rose-500 dark:text-rose-400'
                                                    }`}>
                                                        {isPasswordValid ? (
                                                            <>
                                                                <Check className="h-3.5 w-3.5 shrink-0" />
                                                                <span>All password requirements satisfied</span>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <X className="h-3.5 w-3.5 shrink-0" />
                                                                <span>Password does not satisfy all requirements</span>
                                                            </>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="signup-confirm">Confirm Password</Label>
                                        <div className="relative">
                                            <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                            <Input
                                                id="signup-confirm"
                                                type="password"
                                                placeholder="Confirm your password"
                                                className="pl-10"
                                                value={signUpData.confirmPassword}
                                                onFocus={() => setIsConfirmFocused(true)}
                                                onBlur={() => setIsConfirmFocused(false)}
                                                onChange={(e) => {
                                                    setSignUpData({ ...signUpData, confirmPassword: e.target.value });
                                                    if (error) setError(null);
                                                }}
                                                required
                                            />
                                        </div>
                                        {signUpData.confirmPassword.length > 0 && (
                                            <div className={`text-[11px] font-medium flex items-center gap-1 ${
                                                signUpData.password === signUpData.confirmPassword
                                                    ? 'text-emerald-600 dark:text-emerald-400'
                                                    : 'text-rose-500 dark:text-rose-400'
                                            }`}>
                                                {signUpData.password === signUpData.confirmPassword ? (
                                                    <>
                                                        <Check className="h-3.5 w-3.5 shrink-0" />
                                                        <span>Passwords match</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <X className="h-3.5 w-3.5 shrink-0" />
                                                        <span>Passwords do not match</span>
                                                    </>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                    {error && (<Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>)}
                                    <Button
                                        type="submit"
                                        className="w-full"
                                        disabled={
                                            isLoading ||
                                            !isPasswordValid ||
                                            !signUpData.confirmPassword ||
                                            signUpData.password !== signUpData.confirmPassword
                                        }
                                    >
                                        {isLoading ? "Creating account..." : "Sign Up"}
                                    </Button>
                                </form>
                            </TabsContent>
                        </Tabs>
                        ) : (
                        <form onSubmit={handleSignIn} className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="signin-email">Email</Label>
                                <div className="relative">
                                    <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                    <Input id="signin-email" type="email" placeholder="Enter your email" className="pl-10" value={signInData.email} onChange={(e) => setSignInData({ ...signInData, email: e.target.value })} required />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="signin-password">Password</Label>
                                <div className="relative">
                                    <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                    <Input id="signin-password" type="password" placeholder="Enter your password" className="pl-10" value={signInData.password} onChange={(e) => setSignInData({ ...signInData, password: e.target.value })} required />
                                </div>
                            </div>
                            {error && (<Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>)}
                            <Button type="submit" className="w-full" disabled={isLoading}>{isLoading ? "Signing in..." : "Sign In"}</Button>
                        </form>
                        )}
                    </CardContent>
                </Card>

                <div className="text-center text-xs text-muted-foreground mt-4 space-x-4">
                    <a href="/privacy" target="_blank" rel="noopener noreferrer" className="hover:underline hover:text-primary">Privacy Policy</a>
                    <span>·</span>
                    <a href="/terms" target="_blank" rel="noopener noreferrer" className="hover:underline hover:text-primary">Terms of Service</a>
                    <span>·</span>
                    <span>© 2026 SabbPe</span>
                </div>
            </div>
        </div>
    );
};

export default Auth;
