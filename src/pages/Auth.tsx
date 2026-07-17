import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/components/auth/AuthProvider';
import { authService } from '@/lib/auth-service';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertCircle, Mail, Lock, User, Phone, ArrowLeft } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Logo } from '@/components/ui/logo';
import { useToast } from '@/hooks/use-toast';

const Auth = () => {
    const { user, signIn, signUp, loading } = useAuth();
    const { toast } = useToast();
    const navigate = useNavigate();
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedRole, setSelectedRole] = useState<'merchant' | 'distributor' | 'employee' | 'admin' | null>(null);

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

        if (signUpData.password !== signUpData.confirmPassword) {
            setError("Passwords don't match");
            setIsLoading(false);
            return;
        }
        if (signUpData.password.length < 6) {
            setError("Password must be at least 6 characters");
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
                                            <Input id="signup-password" type="password" placeholder="Create a password" className="pl-10" value={signUpData.password} onChange={(e) => setSignUpData({ ...signUpData, password: e.target.value })} required />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="signup-confirm">Confirm Password</Label>
                                        <div className="relative">
                                            <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                            <Input id="signup-confirm" type="password" placeholder="Confirm your password" className="pl-10" value={signUpData.confirmPassword} onChange={(e) => setSignUpData({ ...signUpData, confirmPassword: e.target.value })} required />
                                        </div>
                                    </div>
                                    {error && (<Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>)}
                                    <Button type="submit" className="w-full" disabled={isLoading}>{isLoading ? "Creating account..." : "Sign Up"}</Button>
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
