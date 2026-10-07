import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/components/auth/AuthProvider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertCircle,
  Mail,
  Lock,
  User,
  Phone,
  ArrowLeft,
  Check,
  X,
  Circle,
  Eye,
  EyeOff,
  KeyRound,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Logo } from '@/components/ui/logo';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const Auth = () => {
  const { user, signIn, signUp, loading } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<'merchant' | 'distributor' | 'employee' | null>(null);

  // Password visibility states
  const [showSignInPassword, setShowSignInPassword] = useState(false);
  const [showSignUpPassword, setShowSignUpPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Forgot password modal state
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [isSendingReset, setIsSendingReset] = useState(false);

  // Form states
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
  const showRequirements =
    (!isConfirmFocused && signUpData.confirmPassword.length === 0) || !isPasswordValid;

  useEffect(() => {
    const role = sessionStorage.getItem('selected_role') as
      | 'merchant'
      | 'distributor'
      | 'employee'
      | null;
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
        variant: 'destructive',
        title: 'Sign in failed',
        description: errorMessage,
      });
    } else {
      toast({
        title: 'Welcome back!',
        description: 'You have successfully signed in.',
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
        variant: 'destructive',
        title: 'Invalid password',
        description: errorMsg,
      });
      setIsLoading(false);
      return;
    }

    if (signUpData.password !== signUpData.confirmPassword) {
      setError("Passwords don't match");
      toast({
        variant: 'destructive',
        title: "Passwords don't match",
        description: 'Password and Confirm Password must match.',
      });
      setIsLoading(false);
      return;
    }
    if (!selectedRole) {
      setError('Role not selected. Please go back and select your role.');
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
        variant: 'destructive',
        title: 'Sign up failed',
        description: error.message,
      });
    } else {
      toast({
        title: 'Account created!',
        description: 'You are now signed in to SabbPe.',
      });
    }
    setIsLoading(false);
  };

  const handleForgotPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail) return;
    setIsSendingReset(true);
    setTimeout(() => {
      setIsSendingReset(false);
      setShowForgotPassword(false);
      toast({
        title: 'Password reset instructions sent',
        description: `If an account exists for ${forgotEmail}, you will receive a reset link shortly.`,
      });
      setForgotEmail('');
    }, 1000);
  };

  const handleBackToRoleSelection = () => {
    sessionStorage.removeItem('selected_role');
    navigate('/select-role');
  };

  if (loading || !selectedRole) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F8FC]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const roleTitle =
    selectedRole === 'merchant'
      ? 'Merchant Portal'
      : selectedRole === 'distributor'
      ? 'Distributor Portal'
      : 'Operations Portal';

  return (
    <div className="min-h-screen bg-[#F5F8FC] flex flex-col justify-between p-4 sm:p-6 lg:p-8">
      {/* Top Header */}
      <div className="max-w-6xl w-full mx-auto flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleBackToRoleSelection}
          className="text-xs font-semibold text-slate-600 hover:text-slate-900 gap-1.5"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Change Role</span>
        </Button>
        <Logo size="sm" className="h-8 w-auto" />
      </div>

      {/* Main Container */}
      <div className="max-w-md w-full mx-auto my-6">
        <div className="text-center mb-6">
          <span className="text-xs font-bold uppercase tracking-wider text-primary mb-1 inline-block">
            {roleTitle}
          </span>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Welcome to SabbPe
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            {selectedRole === 'merchant'
              ? 'Sign in to manage onboarding or register a new business'
              : 'Sign in to access your partner dashboard'}
          </p>
        </div>

        <Card className="rounded-2xl border-slate-200/90 shadow-sm bg-white overflow-hidden text-left">
          <CardHeader className="pb-4 pt-6 px-6 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-bold text-slate-900">
                Authentication
              </CardTitle>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary capitalize">
                {selectedRole}
              </span>
            </div>
          </CardHeader>

          <CardContent className="p-6">
            {selectedRole === 'merchant' ? (
              <Tabs defaultValue="signin" className="w-full">
                <TabsList className="grid w-full grid-cols-2 mb-6 h-10 p-1 bg-slate-100 rounded-xl">
                  <TabsTrigger
                    value="signin"
                    className="rounded-lg text-xs font-semibold data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-sm"
                  >
                    Sign In
                  </TabsTrigger>
                  <TabsTrigger
                    value="signup"
                    className="rounded-lg text-xs font-semibold data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-sm"
                  >
                    Sign Up
                  </TabsTrigger>
                </TabsList>

                {/* SIGN IN TAB */}
                <TabsContent value="signin" className="space-y-4 m-0">
                  <form onSubmit={handleSignIn} className="space-y-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="signin-email" className="text-xs font-semibold text-slate-700">
                        Email Address
                      </Label>
                      <div className="relative">
                        <Mail className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                        <Input
                          id="signin-email"
                          type="email"
                          placeholder="name@business.com"
                          className="pl-10 h-11 text-xs rounded-xl border-slate-200 focus-visible:ring-primary"
                          value={signInData.email}
                          onChange={(e) => setSignInData({ ...signInData, email: e.target.value })}
                          required
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="signin-password" className="text-xs font-semibold text-slate-700">
                          Password
                        </Label>
                        <button
                          type="button"
                          onClick={() => setShowForgotPassword(true)}
                          className="text-xs font-semibold text-primary hover:underline"
                        >
                          Forgot Password?
                        </button>
                      </div>
                      <div className="relative">
                        <Lock className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                        <Input
                          id="signin-password"
                          type={showSignInPassword ? 'text' : 'password'}
                          placeholder="Enter your password"
                          className="pl-10 pr-10 h-11 text-xs rounded-xl border-slate-200 focus-visible:ring-primary"
                          value={signInData.password}
                          onChange={(e) => setSignInData({ ...signInData, password: e.target.value })}
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowSignInPassword(!showSignInPassword)}
                          className="absolute right-3.5 top-3 text-slate-400 hover:text-slate-600 focus:outline-none"
                          tabIndex={-1}
                        >
                          {showSignInPassword ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    {error && (
                      <Alert variant="destructive" className="py-2.5 rounded-xl text-xs">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>{error}</AlertDescription>
                      </Alert>
                    )}

                    <Button
                      type="submit"
                      className="w-full h-11 text-xs font-semibold rounded-xl bg-primary hover:bg-primary/90 text-white shadow-sm"
                      disabled={isLoading}
                    >
                      {isLoading ? 'Signing in...' : 'Sign In to SabbPe'}
                    </Button>
                  </form>
                </TabsContent>

                {/* SIGN UP TAB */}
                <TabsContent value="signup" className="space-y-4 m-0">
                  <form onSubmit={handleSignUp} className="space-y-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="signup-name" className="text-xs font-semibold text-slate-700">
                        Full Name (as per PAN)
                      </Label>
                      <div className="relative">
                        <User className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                        <Input
                          id="signup-name"
                          type="text"
                          placeholder="e.g. Rajesh Kumar"
                          className="pl-10 h-11 text-xs rounded-xl border-slate-200 focus-visible:ring-primary"
                          value={signUpData.fullName}
                          onChange={(e) => setSignUpData({ ...signUpData, fullName: e.target.value })}
                          required
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="signup-mobile" className="text-xs font-semibold text-slate-700">
                        Mobile Number
                      </Label>
                      <div className="relative">
                        <Phone className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                        <Input
                          id="signup-mobile"
                          type="tel"
                          inputMode="numeric"
                          maxLength={10}
                          placeholder="10-digit mobile number"
                          className="pl-10 h-11 text-xs rounded-xl border-slate-200 focus-visible:ring-primary"
                          value={signUpData.mobileNumber}
                          onChange={(e) => {
                            const val = e.target.value.replace(/\D/g, '');
                            setSignUpData({ ...signUpData, mobileNumber: val });
                          }}
                          required
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="signup-email" className="text-xs font-semibold text-slate-700">
                        Work Email Address
                      </Label>
                      <div className="relative">
                        <Mail className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                        <Input
                          id="signup-email"
                          type="email"
                          placeholder="rajesh@enterprise.in"
                          className="pl-10 h-11 text-xs rounded-xl border-slate-200 focus-visible:ring-primary"
                          value={signUpData.email}
                          onChange={(e) => setSignUpData({ ...signUpData, email: e.target.value })}
                          required
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="signup-password" className="text-xs font-semibold text-slate-700">
                        Create Password
                      </Label>
                      <div className="relative">
                        <Lock className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                        <Input
                          id="signup-password"
                          type={showSignUpPassword ? 'text' : 'password'}
                          placeholder="Min 6 chars with Uppercase, number & symbol"
                          className="pl-10 pr-10 h-11 text-xs rounded-xl border-slate-200 focus-visible:ring-primary"
                          value={signUpData.password}
                          onChange={(e) => {
                            setSignUpData({ ...signUpData, password: e.target.value });
                            if (error) setError(null);
                          }}
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowSignUpPassword(!showSignUpPassword)}
                          className="absolute right-3.5 top-3 text-slate-400 hover:text-slate-600 focus:outline-none"
                          tabIndex={-1}
                        >
                          {showSignUpPassword ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      </div>

                      {/* Password Requirements live checklist */}
                      {showRequirements && (
                        <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 space-y-2 text-xs transition-all duration-200">
                          <p className="font-semibold text-slate-800 text-[11px] uppercase tracking-wider">
                            Password Requirements:
                          </p>
                          <ul className="space-y-1.5" aria-label="Password requirements">
                            {passwordRequirements.map((req) => {
                              const isTyped = signUpData.password.length > 0;
                              return (
                                <li
                                  key={req.id}
                                  className={`flex items-center gap-2 text-xs transition-colors duration-150 ${
                                    req.satisfied
                                      ? 'text-emerald-700 font-medium'
                                      : isTyped
                                      ? 'text-rose-600'
                                      : 'text-slate-500'
                                  }`}
                                >
                                  {req.satisfied ? (
                                    <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0 stroke-[3]" />
                                  ) : isTyped ? (
                                    <X className="h-3.5 w-3.5 text-rose-500 shrink-0 stroke-[3]" />
                                  ) : (
                                    <Circle className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                                  )}
                                  <span>{req.label}</span>
                                </li>
                              );
                            })}
                          </ul>
                          {signUpData.password.length > 0 && (
                            <div
                              className={`pt-1.5 border-t border-slate-200/60 text-[11px] font-semibold flex items-center gap-1 ${
                                isPasswordValid ? 'text-emerald-700' : 'text-rose-600'
                              }`}
                            >
                              {isPasswordValid ? (
                                <>
                                  <Check className="h-3.5 w-3.5 shrink-0 stroke-[3]" />
                                  <span>All password requirements satisfied</span>
                                </>
                              ) : (
                                <>
                                  <X className="h-3.5 w-3.5 shrink-0 stroke-[3]" />
                                  <span>Password does not satisfy all requirements</span>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="signup-confirm" className="text-xs font-semibold text-slate-700">
                        Confirm Password
                      </Label>
                      <div className="relative">
                        <Lock className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                        <Input
                          id="signup-confirm"
                          type={showConfirmPassword ? 'text' : 'password'}
                          placeholder="Re-enter your password"
                          className="pl-10 pr-10 h-11 text-xs rounded-xl border-slate-200 focus-visible:ring-primary"
                          value={signUpData.confirmPassword}
                          onFocus={() => setIsConfirmFocused(true)}
                          onBlur={() => setIsConfirmFocused(false)}
                          onChange={(e) => {
                            setSignUpData({ ...signUpData, confirmPassword: e.target.value });
                            if (error) setError(null);
                          }}
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          className="absolute right-3.5 top-3 text-slate-400 hover:text-slate-600 focus:outline-none"
                          tabIndex={-1}
                        >
                          {showConfirmPassword ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                      {signUpData.confirmPassword.length > 0 && (
                        <div
                          className={`text-[11px] font-semibold flex items-center gap-1 pt-0.5 ${
                            signUpData.password === signUpData.confirmPassword
                              ? 'text-emerald-700'
                              : 'text-rose-600'
                          }`}
                        >
                          {signUpData.password === signUpData.confirmPassword ? (
                            <>
                              <Check className="h-3.5 w-3.5 shrink-0 stroke-[3]" />
                              <span>Passwords match</span>
                            </>
                          ) : (
                            <>
                              <X className="h-3.5 w-3.5 shrink-0 stroke-[3]" />
                              <span>Passwords do not match</span>
                            </>
                          )}
                        </div>
                      )}
                    </div>

                    {error && (
                      <Alert variant="destructive" className="py-2.5 rounded-xl text-xs">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>{error}</AlertDescription>
                      </Alert>
                    )}

                    <Button
                      type="submit"
                      className="w-full h-11 text-xs font-semibold rounded-xl bg-primary hover:bg-primary/90 text-white shadow-sm"
                      disabled={
                        isLoading ||
                        !isPasswordValid ||
                        !signUpData.confirmPassword ||
                        signUpData.password !== signUpData.confirmPassword
                      }
                    >
                      {isLoading ? 'Creating account...' : 'Create Merchant Account'}
                    </Button>
                  </form>
                </TabsContent>
              </Tabs>
            ) : (
              /* Non-merchant Sign In */
              <form onSubmit={handleSignIn} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="signin-email" className="text-xs font-semibold text-slate-700">
                    Partner Email
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                    <Input
                      id="signin-email"
                      type="email"
                      placeholder="partner@sabbpe.com"
                      className="pl-10 h-11 text-xs rounded-xl border-slate-200 focus-visible:ring-primary"
                      value={signInData.email}
                      onChange={(e) => setSignInData({ ...signInData, email: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="signin-password" className="text-xs font-semibold text-slate-700">
                      Password
                    </Label>
                    <button
                      type="button"
                      onClick={() => setShowForgotPassword(true)}
                      className="text-xs font-semibold text-primary hover:underline"
                    >
                      Forgot Password?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                    <Input
                      id="signin-password"
                      type={showSignInPassword ? 'text' : 'password'}
                      placeholder="Enter your password"
                      className="pl-10 pr-10 h-11 text-xs rounded-xl border-slate-200 focus-visible:ring-primary"
                      value={signInData.password}
                      onChange={(e) => setSignInData({ ...signInData, password: e.target.value })}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowSignInPassword(!showSignInPassword)}
                      className="absolute right-3.5 top-3 text-slate-400 hover:text-slate-600 focus:outline-none"
                      tabIndex={-1}
                    >
                      {showSignInPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                {error && (
                  <Alert variant="destructive" className="py-2.5 rounded-xl text-xs">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <Button
                  type="submit"
                  className="w-full h-11 text-xs font-semibold rounded-xl bg-primary hover:bg-primary/90 text-white shadow-sm"
                  disabled={isLoading}
                >
                  {isLoading ? 'Signing in...' : 'Sign In'}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        {/* Security Notice */}
        <div className="mt-6 flex items-center justify-center gap-2 text-xs text-slate-500">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <span>Secured with 256-bit SSL encryption</span>
        </div>
      </div>

      {/* Forgot Password Dialog */}
      <Dialog open={showForgotPassword} onOpenChange={setShowForgotPassword}>
        <DialogContent className="sm:max-w-md rounded-2xl p-6 text-left">
          <DialogHeader>
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-2">
              <KeyRound className="w-5 h-5" />
            </div>
            <DialogTitle className="text-lg font-bold text-slate-900">
              Reset Your Password
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Enter your registered email address to receive password reset instructions.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleForgotPasswordSubmit} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="forgot-email" className="text-xs font-semibold text-slate-700">
                Registered Email
              </Label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                <Input
                  id="forgot-email"
                  type="email"
                  placeholder="name@business.com"
                  className="pl-10 h-11 text-xs rounded-xl border-slate-200"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <DialogFooter className="flex gap-2 sm:justify-end pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowForgotPassword(false)}
                className="text-xs h-10 rounded-xl"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={isSendingReset || !forgotEmail}
                className="text-xs h-10 rounded-xl bg-primary text-white"
              >
                {isSendingReset ? 'Sending...' : 'Send Reset Link'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Footer */}
      <footer className="text-center text-xs text-slate-500 py-4">
        <div className="flex items-center justify-center gap-4">
          <a href="/privacy" className="hover:text-primary transition-colors">Privacy Policy</a>
          <span>·</span>
          <a href="/terms" className="hover:text-primary transition-colors">Terms of Service</a>
          <span>·</span>
          <span>© 2026 SabbPe</span>
        </div>
      </footer>
    </div>
  );
};

export default Auth;
