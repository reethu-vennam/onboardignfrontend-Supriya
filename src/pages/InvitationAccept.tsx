// src/pages/InvitationAccept.tsx
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '@/lib/rest-api';
import { authService } from '@/lib/auth-service';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';

interface InvitationData {
    id: string;
    distributor_id: string;
    merchant_name: string;
    merchant_mobile: string;
    status: string;
    expires_at: string;
}

export default function InvitationAccept() {
    const { token } = useParams<{ token: string }>();
    const navigate = useNavigate();
    const [invitation, setInvitation] = useState<InvitationData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const { toast } = useToast();

    useEffect(() => {
        if (token) {
            validateInvitation();
        }
    }, [token]);

    const validateInvitation = async () => {
        try {
            const data = null; const error = null; /* supabase removed */
            if (error || !data) {
                setError('Invalid or expired invitation link');
                return;
            }

            if (data.status === 'accepted') {
                setError('This invitation has already been used');
                return;
            }

            if (new Date(data.expires_at) < new Date()) {
                setError('This invitation has expired');
                /* supabase removed */
                return;
            }

            setInvitation(data);
        } catch (err) {
            console.error('Error validating invitation:', err);
            setError('Failed to validate invitation');
        } finally {
            setLoading(false);
        }
    };

    const handleAcceptInvitation = async () => {
        if (!invitation || !email || !password) return;

        setSubmitting(true);
        try {
            const result = await authService.register(email, password, invitation.merchant_name, invitation.merchant_mobile, 'merchant');
            if (!result.success) throw new Error(result.error?.message || 'Registration failed');

            toast({
                title: "Welcome!",
                description: "Your account has been created. Please complete your onboarding."
            });
            navigate('/merchant-onboarding');
        } catch (err: unknown) {
            console.error('Error accepting invitation:', err);
            const errorMessage = err instanceof Error ? err.message : "Failed to accept invitation";
            toast({
                title: "Error",
                description: errorMessage,
                variant: "destructive"
            });
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex items-center justify-center min-h-screen p-4">
                <Card className="w-full max-w-md">
                    <CardHeader>
                        <div className="flex items-center justify-center mb-4">
                            <XCircle className="w-16 h-16 text-red-500" />
                        </div>
                        <CardTitle className="text-center">Invalid Invitation</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-center text-muted-foreground mb-4">{error}</p>
                        <Button onClick={() => navigate('/auth')} className="w-full">
                            Go to Login
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (!invitation) {
        return null;
    }

    return (
        <div className="flex items-center justify-center min-h-screen p-4 bg-gradient-to-br from-blue-50 to-purple-50">
            <Card className="w-full max-w-md">
                <CardHeader>
                    <div className="flex items-center justify-center mb-4">
                        <CheckCircle className="w-16 h-16 text-green-500" />
                    </div>
                    <CardTitle className="text-center text-2xl">You're Invited!</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
                        <p className="text-sm text-blue-800">
                            You've been invited to join as a merchant
                        </p>
                    </div>

                    <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Your Name:</span>
                            <span className="font-medium">{invitation.merchant_name}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Mobile:</span>
                            <span className="font-medium">{invitation.merchant_mobile}</span>
                        </div>
                    </div>

                    <div className="space-y-4 pt-4 border-t">
                        <h3 className="font-semibold">Create Your Account</h3>

                        <div className="space-y-2">
                            <Label htmlFor="email">Email Address</Label>
                            <Input
                                id="email"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="your.email@example.com"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="password">Create Password</Label>
                            <Input
                                id="password"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Min. 8 characters"
                            />
                        </div>

                        <Button
                            onClick={handleAcceptInvitation}
                            disabled={submitting || !email || !password}
                            className="w-full"
                        >
                            {submitting ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Creating Account...
                                </>
                            ) : (
                                'Accept Invitation & Continue'
                            )}
                        </Button>
                    </div>

                    <p className="text-xs text-center text-muted-foreground">
                        By accepting, you agree to complete the merchant onboarding process
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}


