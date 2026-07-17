// // src/pages/MerchantDashboard.tsx
// import { useEffect, useState } from 'react';
// import { authService } from '@/lib/auth-service';
// import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
// import { Badge } from '@/components/ui/badge';
// import { Alert, AlertDescription } from '@/components/ui/alert';
// import { Button } from '@/components/ui/button';
// import { CreditCard, FileText, Gift, CheckCircle, Clock, XCircle, Download, QrCode } from 'lucide-react';
// import { QRCodeSVG } from 'qrcode.react';

// interface MerchantProfile {
//     id: string;
//     user_id: string;
//     full_name: string;
//     mobile_number: string;
//     email: string;
//     business_name: string;
//     entity_type?: string | null;
//     onboarding_status: string;
//     gst_number?: string;
//     pan_number?: string;
//     aadhaar_number?: string;
//     rejection_reason?: string;
//     upi_vpa?: string;
//     upi_qr_string?: string;
//     created_at: string;
//     updated_at: string;
// }

// export default function MerchantDashboard() {
//     const [profile, setProfile] = useState<MerchantProfile | null>(null);
//     const [loading, setLoading] = useState(true);

//     useEffect(() => {
//         fetchProfile();
//     }, []);

//     const fetchProfile = async () => {
//         const user = authService.getUser();
//         if (!user) return;

//         const { data } = await supabase
//             .from('merchant_profiles')
//             .select('*')
//             .eq('user_id', user.id)
//             .single();

//         setProfile(data);
//         setLoading(false);
//     };

//     const downloadQRCode = () => {
//         const svg = document.getElementById('qr-code-canvas');
//         if (!svg) return;

//         const svgData = new XMLSerializer().serializeToString(svg);
//         const canvas = document.createElement('canvas');
//         const ctx = canvas.getContext('2d');
//         const img = new Image();

//         canvas.width = 200;
//         canvas.height = 200;

//         img.onload = () => {
//             ctx?.drawImage(img, 0, 0);
//             const url = canvas.toDataURL('image/png');
//             const link = document.createElement('a');
//             link.download = `${profile?.business_name || 'merchant'}_UPI_QR.png`;
//             link.href = url;
//             link.click();
//         };

//         img.src = 'data:image/svg+xml;base64,' + btoa(svgData);
//     };

//     const getStatusBadge = (status: string) => {
//         const config: Record<string, { color: string; icon: React.ElementType }> = {
//             pending: { color: 'bg-yellow-100 text-yellow-800', icon: Clock },
//             submitted: { color: 'bg-blue-100 text-blue-800', icon: Clock },
//             in_progress: { color: 'bg-blue-100 text-blue-800', icon: Clock },
//             validating: { color: 'bg-blue-100 text-blue-800', icon: Clock },
//             approved: { color: 'bg-green-100 text-green-800', icon: CheckCircle },
//             rejected: { color: 'bg-red-100 text-red-800', icon: XCircle }
//         };
//         const { color, icon: Icon } = config[status] || config.pending;
//         return (
//             <Badge className={`${color} flex items-center gap-1`}>
//                 <Icon className="w-3 h-3" />
//                 {status.replace('_', ' ').toUpperCase()}
//             </Badge>
//         );
//     };

//     if (loading) {
//         return (
//             <div className="flex items-center justify-center min-h-screen">
//                 <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
//             </div>
//         );
//     }

//     if (profile?.onboarding_status === 'approved') {
//         return (
//             <div className="container mx-auto p-6">
//                 <h1 className="text-3xl font-bold mb-6">Merchant Dashboard</h1>

//                 {/* UPI QR Code Section - Only show when approved */}
//                 {profile?.upi_qr_string && profile?.upi_vpa && (
//                     <Card className="mb-6 border-2 border-green-500">
//                         <CardHeader className="bg-green-50">
//                             <CardTitle className="flex items-center gap-2 text-green-800">
//                                 <QrCode className="w-6 h-6" />
//                                 Your Payment QR Code
//                             </CardTitle>
//                         </CardHeader>
//                         <CardContent className="pt-6">
//                             <div className="flex flex-col md:flex-row items-center gap-6">
//                                 <div className="flex flex-col items-center">
//                                     <div className="bg-white p-4 rounded-lg shadow-lg border-2 border-gray-200">
//                                         <QRCodeSVG
//                                             id="qr-code-canvas"
//                                             value={profile.upi_qr_string}
//                                             size={200}
//                                             level="H"
//                                             includeMargin={true}
//                                         />
//                                     </div>
//                                     <Button
//                                         onClick={downloadQRCode}
//                                         className="mt-4 w-full"
//                                         variant="outline"
//                                     >
//                                         <Download className="w-4 h-4 mr-2" />
//                                         Download QR Code
//                                     </Button>
//                                 </div>

//                                 <div className="flex-1 space-y-3">
//                                     <div>
//                                         <p className="text-sm text-muted-foreground">UPI ID</p>
//                                         <p className="text-lg font-semibold">{profile.upi_vpa}</p>
//                                     </div>
//                                     <div>
//                                         <p className="text-sm text-muted-foreground">Business Name</p>
//                                         <p className="text-lg font-semibold">{profile.business_name}</p>
//                                     </div>
//                                     <Alert className="bg-green-50 border-green-200">
//                                         <AlertDescription className="text-green-800">
//                                             <strong>Your account is active!</strong> Share this QR code with customers to receive payments instantly.
//                                         </AlertDescription>
//                                     </Alert>
//                                 </div>
//                             </div>
//                         </CardContent>
//                     </Card>
//                 )}

//                 {/* Services Grid */}
//                 <div className="grid md:grid-cols-3 gap-4">
//                     <Card className="hover:shadow-lg transition-shadow cursor-pointer">
//                         <CardHeader>
//                             <CardTitle className="flex items-center gap-2">
//                                 <CreditCard className="w-5 h-5" />
//                                 Transactions
//                             </CardTitle>
//                         </CardHeader>
//                         <CardContent>
//                             <p className="text-muted-foreground">View and manage transactions</p>
//                         </CardContent>
//                     </Card>

//                     <Card className="hover:shadow-lg transition-shadow cursor-pointer">
//                         <CardHeader>
//                             <CardTitle className="flex items-center gap-2">
//                                 <FileText className="w-5 h-5" />
//                                 Lending Services
//                             </CardTitle>
//                         </CardHeader>
//                         <CardContent>
//                             <p className="text-muted-foreground">Apply for business loans</p>
//                         </CardContent>
//                     </Card>

//                     <Card className="hover:shadow-lg transition-shadow cursor-pointer">
//                         <CardHeader>
//                             <CardTitle className="flex items-center gap-2">
//                                 <Gift className="w-5 h-5" />
//                                 Gift Vouchers
//                             </CardTitle>
//                         </CardHeader>
//                         <CardContent>
//                             <p className="text-muted-foreground">Purchase and manage vouchers</p>
//                         </CardContent>
//                     </Card>
//                 </div>
//             </div>
//         );
//     }

//     // Pending/Rejected Status View
//     return (
//         <div className="container mx-auto p-6">
//             <Card>
//                 <CardHeader>
//                     <CardTitle>Application Status</CardTitle>
//                 </CardHeader>
//                 <CardContent className="space-y-4">
//                     <div className="flex justify-between items-center">
//                         <span className="font-medium">Current Status:</span>
//                         {getStatusBadge(profile?.onboarding_status || 'pending')}
//                     </div>

//                     {profile?.onboarding_status === 'rejected' && profile?.rejection_reason && (
//                         <Alert variant="destructive">
//                             <AlertDescription>
//                                 <strong>Rejection Reason:</strong> {profile.rejection_reason}
//                             </AlertDescription>
//                         </Alert>
//                     )}

//                     {(profile?.onboarding_status === 'submitted' ||
//                         profile?.onboarding_status === 'in_progress' ||
//                         profile?.onboarding_status === 'validating') && (
//                             <Alert>
//                                 <AlertDescription>
//                                     Your application is under review. You'll be notified once it's processed.
//                                 </AlertDescription>
//                             </Alert>
//                         )}

//                     {profile?.onboarding_status === 'pending' && (
//                         <Alert>
//                             <AlertDescription>
//                                 Please complete your onboarding application to activate your account.
//                             </AlertDescription>
//                         </Alert>
//                     )}
//                 </CardContent>
//             </Card>
//         </div>
//     );
// }
// src/pages/MerchantDashboard.tsx
import { useEffect, useState } from 'react';
import { api } from '@/lib/rest-api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { CreditCard, FileText, Gift, CheckCircle, Clock, XCircle, Download, QrCode } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

interface MerchantProfile {
    id: string;
    user_id: string;
    full_name: string;
    mobile_number: string;
    email: string;
    business_name: string;
    entity_type?: string | null;
    onboarding_status: string;
    gst_number?: string;
    pan_number?: string;
    aadhaar_number?: string;
    rejection_reason?: string;
    upi_vpa?: string;
    upi_qr_string?: string;
    created_at: string;
    updated_at: string;
}

export default function MerchantDashboard() {
    const [profile, setProfile] = useState<MerchantProfile | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchProfile();
    }, []);

    const fetchProfile = async () => {
        try {
            const data = await api.get('/merchant/profile');
            setProfile(data);
        } catch {
            setProfile(null);
        }
        setLoading(false);
    };

    const downloadQRCode = () => {
        const svg = document.getElementById('qr-code-canvas');
        if (!svg) return;

        const svgData = new XMLSerializer().serializeToString(svg);
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const img = new Image();

        canvas.width = 200;
        canvas.height = 200;

        img.onload = () => {
            ctx?.drawImage(img, 0, 0);
            const url = canvas.toDataURL('image/png');
            const link = document.createElement('a');
            link.download = `${profile?.business_name || 'merchant'}_UPI_QR.png`;
            link.href = url;
            link.click();
        };

        img.src = 'data:image/svg+xml;base64,' + btoa(svgData);
    };

    const getStatusBadge = (status: string) => {
        const config: Record<string, { color: string; icon: React.ElementType }> = {
            pending: { color: 'bg-yellow-100 text-yellow-800', icon: Clock },
            submitted: { color: 'bg-blue-100 text-blue-800', icon: Clock },
            in_progress: { color: 'bg-blue-100 text-blue-800', icon: Clock },
            validating: { color: 'bg-blue-100 text-blue-800', icon: Clock },
            approved: { color: 'bg-green-100 text-green-800', icon: CheckCircle },
            rejected: { color: 'bg-red-100 text-red-800', icon: XCircle }
        };
        const { color, icon: Icon } = config[status] || config.pending;
        return (
            <Badge className={`${color} flex items-center gap-1`}>
                <Icon className="w-3 h-3" />
                {status.replace('_', ' ').toUpperCase()}
            </Badge>
        );
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
        );
    }

    if (profile?.onboarding_status === 'approved') {
        return (
            <div className="container mx-auto p-6">
                <h1 className="text-3xl font-bold mb-6">Merchant Dashboard</h1>

                {/* UPI QR Code Section - Only show when approved */}
                {profile?.upi_qr_string && profile?.upi_vpa && (
                    <Card className="mb-6 border-2 border-green-500">
                        <CardHeader className="bg-green-50">
                            <CardTitle className="flex items-center gap-2 text-green-800">
                                <QrCode className="w-6 h-6" />
                                Your Payment QR Code
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-6">
                            <div className="flex flex-col md:flex-row items-center gap-6">
                                <div className="flex flex-col items-center">
                                    <div className="bg-white p-4 rounded-lg shadow-lg border-2 border-gray-200">
                                        <QRCodeSVG
                                            id="qr-code-canvas"
                                            value={profile.upi_qr_string}
                                            size={200}
                                            level="H"
                                            includeMargin={true}
                                        />
                                    </div>
                                    <Button
                                        onClick={downloadQRCode}
                                        className="mt-4 w-full"
                                        variant="outline"
                                    >
                                        <Download className="w-4 h-4 mr-2" />
                                        Download QR Code
                                    </Button>
                                </div>

                                <div className="flex-1 space-y-3">
                                    <div>
                                        <p className="text-sm text-muted-foreground">UPI ID</p>
                                        <p className="text-lg font-semibold">{profile.upi_vpa}</p>
                                    </div>
                                    <div>
                                        <p className="text-sm text-muted-foreground">Business Name</p>
                                        <p className="text-lg font-semibold">{profile.business_name}</p>
                                    </div>
                                    <Alert className="bg-green-50 border-green-200">
                                        <AlertDescription className="text-green-800">
                                            <strong>Your account is active!</strong> Share this QR code with customers to receive payments instantly.
                                        </AlertDescription>
                                    </Alert>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Services Grid */}
                <div className="grid md:grid-cols-3 gap-4">
                    <Card className="hover:shadow-lg transition-shadow cursor-pointer">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <CreditCard className="w-5 h-5" />
                                Transactions
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-muted-foreground">View and manage transactions</p>
                        </CardContent>
                    </Card>

                    <Card className="hover:shadow-lg transition-shadow cursor-pointer">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <FileText className="w-5 h-5" />
                                Lending Services
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-muted-foreground">Apply for business loans</p>
                        </CardContent>
                    </Card>

                    <Card className="hover:shadow-lg transition-shadow cursor-pointer">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Gift className="w-5 h-5" />
                                Gift Vouchers
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-muted-foreground">Purchase and manage vouchers</p>
                        </CardContent>
                    </Card>
                </div>
            </div>
        );
    }

    // Pending/Rejected Status View
    return (
        <div className="container mx-auto p-6">
            <Card>
                <CardHeader>
                    <CardTitle>Application Status</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex justify-between items-center">
                        <span className="font-medium">Current Status:</span>
                        {getStatusBadge(profile?.onboarding_status || 'pending')}
                    </div>

                    {profile?.onboarding_status === 'rejected' && profile?.rejection_reason && (
                        <Alert variant="destructive">
                            <AlertDescription>
                                <strong>Rejection Reason:</strong> {profile.rejection_reason}
                            </AlertDescription>
                        </Alert>
                    )}

                    {(profile?.onboarding_status === 'submitted' ||
                        profile?.onboarding_status === 'in_progress' ||
                        profile?.onboarding_status === 'validating') && (
                            <Alert>
                                <AlertDescription>
                                    Your application is under review. You'll be notified once it's processed.
                                </AlertDescription>
                            </Alert>
                        )}

                    {profile?.onboarding_status === 'pending' && (
                        <Alert>
                            <AlertDescription>
                                Please complete your onboarding application to activate your account.
                            </AlertDescription>
                        </Alert>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
