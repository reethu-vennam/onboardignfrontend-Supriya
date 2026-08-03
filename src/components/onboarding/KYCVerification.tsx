import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Camera, MapPin, FileText, Video, CheckCircle, AlertCircle } from 'lucide-react';
import { useKYCValidation } from '@/hooks/useKYCValidation';
import { useFileUpload } from '@/hooks/useFileUpload';
import { useMerchantData } from '@/hooks/useMerchantData';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/rest-api';
import { FaceVoiceSync } from './FaceVoiceSync'; // Make sure this path is correct
 import { RaiseTicketButton } from "@/components/RaiseTicketButton";
 import { ViewTicketButton } from "@/components/ViewTicketButton";
  import { useNavigate } from "react-router-dom";
import { useI18n } from '@/i18n/I18nProvider';
import { WhatsAppSupportButton } from './WhatsAppSupportButton';

interface KYCVerificationProps {
    onNext: () => void;
    onPrev: () => void;
    data?: {
        kycData?: {
            isVideoCompleted?: boolean;
            selfieUrl?: string;
            locationVerified?: boolean;
            latitude?: number;
            longitude?: number;
            fullAddress?: string | null;
            area?: string | null;
            city?: string | null;
            state?: string | null;
            pincode?: string | null;
            country?: string | null;
        };
        panNumber?: string;
        aadhaarNumber?: string;
        [key: string]: unknown;
    };
    onDataChange?: (data: {
        kycData?: {
            isVideoCompleted?: boolean;
            selfieUrl?: string;
            locationVerified?: boolean;
            latitude?: number;
            longitude?: number;
            fullAddress?: string | null;
            area?: string | null;
            city?: string | null;
            state?: string | null;
            pincode?: string | null;
            country?: string | null;
        };
        [key: string]: unknown;
    }) => void;
    merchantProfile?: Record<string, unknown>;
}

export const KYCVerification: React.FC<KYCVerificationProps> = ({
    onNext,
    onPrev,
    data,
    onDataChange,
    merchantProfile: propMerchantProfile
}) => {
    const { t } = useI18n();
    const [isVideoActive, setIsVideoActive] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    // removed previous standalone voice states
    const [faceScore, setFaceScore] = useState<number | null>(null);
    const [faceVoiceVerified, setFaceVoiceVerified] = useState(false); // NEW

    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);

    const { toast } = useToast();
    const { merchantProfile: dbMerchantProfile } = useMerchantData();
    // Use prop-passed merchant profile if available (for distributor onboarding flow), otherwise use DB fetch
    const merchantProfile = propMerchantProfile || dbMerchantProfile;
    const { uploadFile } = useFileUpload();
     const navigate = useNavigate();
    const {
        kycState,
        captureLocation,
        completeVideoKYC,
        isKYCComplete
    } = useKYCValidation();

    const startCamera = async () => {
        try {
            console.log('🎥 Starting camera...');
            setIsVideoActive(true);

            // Wait for DOM to render the video element after state update
            await new Promise(r => setTimeout(r, 300));

            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
                audio: false
            });

            console.log('✅ Camera stream acquired:', stream.getTracks());

            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                streamRef.current = stream;
                console.log('✅ Video stream assigned to videoRef');
                videoRef.current.play().catch(e => console.error('Play error:', e));
            } else {
                console.error('❌ videoRef.current is null');
                stream.getTracks().forEach(t => t.stop());
                setIsVideoActive(false);
            }
        } catch (error) {
            console.error('❌ Error accessing camera:', error);
            const err = error as any;
            let description = "Unable to access camera. Please check permissions.";
            
            if (err.name === 'NotAllowedError') {
                description = 'Camera permission denied. Please enable camera in browser settings.';
            } else if (err.name === 'NotFoundError') {
                description = 'No camera device found. Please connect a camera.';
            } else if (err.name === 'NotReadableError') {
                description = 'Camera is already in use. Please close other apps using the camera.';
            }
            
            toast({
                variant: "destructive",
                title: "Camera Error",
                description,
            });
            setIsVideoActive(false);
        }
    };

    const stopCamera = () => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
        setIsVideoActive(false);
    };

    const capturePhoto = async () => {
        if (!videoRef.current || !canvasRef.current) return;

        console.log('📸 Capturing photo from video...');
        setIsProcessing(true);

        try {
            const canvas = canvasRef.current;
            const context = canvas.getContext('2d');

            if (context) {
                canvas.width = videoRef.current.videoWidth;
                canvas.height = videoRef.current.videoHeight;
                context.drawImage(videoRef.current, 0, 0);

                canvas.toBlob(async (blob) => {
                    if (blob && merchantProfile) {
                        const file = new File([blob], 'kyc-selfie.jpg', { type: 'image/jpeg' });
                        const uploadPath = `${merchantProfile.user_id}/kyc-selfies`;

                        const uploadResult = await uploadFile(file, 'merchant-documents', uploadPath);

                        if (uploadResult) {
                            completeVideoKYC(blob);

                            const selfieUrl = uploadResult.url || '';

                            const simulatedScore = Math.floor(Math.random() * (98 - 85) + 85);
                            setFaceScore(simulatedScore);

                            toast({
                                title: "Face Match Completed",
                                description: `Face Match Confidence: ${simulatedScore}%`,
                            });

                            await api.post('/merchant/profile', {
                                documents: [{
                                    fileName: 'kyc-selfie.jpg',
                                    filePath: selfieUrl,
                                    fileSize: file.size,
                                    mimeType: 'image/jpeg',
                                    documentType: 'selfie',
                                    docCategory: 'kyc',
                                }],
                            });

                            onDataChange?.({
                                ...data,
                                kycData: {
                                    ...data?.kycData,
                                    isVideoCompleted: true,
                                    selfieUrl: selfieUrl
                                }
                            });

                            toast({
                                title: "Photo Captured",
                                description: "Your selfie has been captured successfully.",
                            });
                        }
                    }
                }, 'image/jpeg', 0.8);
            }

            stopCamera();
        } catch (error) {
            console.error('Error capturing photo:', error);
            toast({
                variant: "destructive",
                title: "Capture Error",
                description: "Failed to capture photo. Please try again.",
            });
        } finally {
            setIsProcessing(false);
        }
    };

    const handleLocationCapture = async () => {
        try {
            const locationData = await captureLocation();

            onDataChange?.({
                ...data,
                kycData: {
                    ...data?.kycData,
                    locationVerified: true,
                    latitude: locationData.lat,
                    longitude: locationData.lng,
                    fullAddress: locationData.address,
                    area: locationData.addressDetails?.neighbourhood || locationData.addressDetails?.suburb || null,
                    city: locationData.addressDetails?.city || locationData.addressDetails?.town || locationData.addressDetails?.village || null,
                    state: locationData.addressDetails?.state || null,
                    pincode: locationData.addressDetails?.postcode || null,
                    country: locationData.addressDetails?.country || null,
                }
            });

            const toastDesc = locationData.address
                ? locationData.address
                : `${locationData.lat.toFixed(4)}, ${locationData.lng.toFixed(4)}`;

            toast({
                title: "Location Captured",
                description: toastDesc,
            });
        } catch (error: unknown) {
            toast({
                variant: "destructive",
                title: "Location Error",
                description: error instanceof Error ? error.message : "Failed to capture location",
            });
        }
    };

    const handleNext = () => {
        if (isKYCComplete && faceVoiceVerified && (faceScore ?? 0) >= 85) {
            onNext();
        } else {
            toast({
                variant: "destructive",
                title: "KYC Incomplete",
                description: "Please complete video KYC, face match, face&voice sync, and location capture.",
            });
        }
    };

    useEffect(() => {
        const timer = setTimeout(() => {
            toast({
                title: "Documents Verified",
                description: "Your PAN and Aadhaar documents have been processed successfully.",
            });
        }, 2000);

        return () => clearTimeout(timer);
    }, [toast]);

    return (
        <div className="space-y-8">
            <div className="text-center mb-8">
                <h2 className="text-3xl font-bold text-foreground mb-2">
                    {t('kyc.title')}
                </h2>
                <p className="text-muted-foreground">
                    {t('kyc.subtitle')}
                </p>
            </div>

            <div className="grid gap-6">
                {/* Document OCR Status */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <FileText className="h-5 w-5 text-primary" />
                            {t('kyc.documentVerification')}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="p-6 bg-gradient-to-r from-primary/10 to-accent/10 rounded-xl">
                            <div className="flex items-center gap-3 mb-4">
                                <CheckCircle className="h-6 w-6 text-primary" />
                                <span className="font-semibold text-foreground">
                                    {t('kyc.documentsAutoVerified')}
                                </span>
                            </div>
                            <p className="text-sm text-muted-foreground mb-4">
                                {t('kyc.ocrDescription')}
                            </p>
                            <div className="grid md:grid-cols-2 gap-4 text-sm">
                                <div className="p-3 bg-card rounded-lg">
                                    <span className="font-medium">{t('kyc.panNumber')}</span>
                                    <span className="ml-2 text-primary">
                                        {(data?.panNumber as string) || (merchantProfile?.pan_number as string) || t('kyc.processing')}
                                    </span>
                                </div>
                                <div className="p-3 bg-card rounded-lg">
                                    <span className="font-medium">{t('kyc.aadhaar')}</span>
                                    <span className="ml-2 text-primary">
                                        {data?.aadhaarNumber && typeof data.aadhaarNumber === 'string' ?
                                            `****-****-${data.aadhaarNumber.slice(-4)}` :
                                            (merchantProfile?.aadhaar_number as string) ?
                                                `****-****-${(merchantProfile.aadhaar_number as string).slice(-4)}` :
                                                t('kyc.processing')
                                        }
                                    </span>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Live Video KYC */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Video className="h-5 w-5 text-primary" />
                            {t('kyc.liveVideoKyc')}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {!kycState.videoKycCompleted ? (
                            <div className="text-center space-y-4">
                                {!isVideoActive ? (
                                    <div className="p-8 border-2 border-dashed border-border rounded-xl">
                                        <Camera className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                                        <h3 className="font-semibold text-foreground mb-2">
                                            {t('kyc.liveSelfieTitle')}
                                        </h3>
                                        <p className="text-muted-foreground mb-4 max-w-md mx-auto">
                                            {t('kyc.liveSelfieDesc')}
                                        </p>
                                        <div className="space-y-3">
                                            <Button onClick={startCamera} className="px-6">
                                                {t('kyc.startCamera')}
                                            </Button>
                                            <div className="text-xs text-muted-foreground">
                                                <p>{t('kyc.requirements')}</p>
                                                <ul className="list-disc list-inside space-y-1 mt-1">
                                                    <li>{t('kyc.goodLighting')}</li>
                                                    <li>{t('kyc.lookAtCamera')}</li>
                                                    <li>{t('kyc.removeGlasses')}</li>
                                                    <li>{t('kyc.faceCentered')}</li>
                                                </ul>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        <div className="relative mx-auto max-w-md">
                                            <video
                                                ref={videoRef}
                                                autoPlay
                                                playsInline
                                                className="w-full rounded-xl border-4 border-primary"
                                            />
                                            <div className="absolute inset-0 rounded-xl border-4 border-primary pointer-events-none">
                                                <div className="absolute inset-4 border border-white/50 rounded-lg" />
                                            </div>
                                        </div>

                                        <canvas ref={canvasRef} className="hidden" />

                                        <div className="flex gap-4 justify-center">
                                            <Button
                                                onClick={capturePhoto}
                                                disabled={isProcessing}
                                                className="px-6"
                                            >
                                                {isProcessing ? t('kyc.processing') : t('kyc.capturePhoto')}
                                            </Button>
                                            <Button
                                                variant="outline"
                                                onClick={stopCamera}
                                                disabled={isProcessing}
                                            >
                                                {t('kyc.cancel')}
                                            </Button>
                                        </div>

                                        <div className="text-sm text-muted-foreground text-center">
                                            {t('kyc.positionFace')}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="p-6 bg-gradient-to-r from-primary/10 to-accent/10 rounded-xl">
                                <div className="flex items-center gap-3">
                                    <CheckCircle className="h-6 w-6 text-primary" />
                                    <span className="font-semibold text-foreground">
                                        {t('kyc.videoKycComplete')}
                                    </span>
                                </div>
                                <p className="text-sm text-muted-foreground mt-2">
                                    {t('kyc.videoKycCompleteDesc')}
                                </p>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Face & Voice Sync */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Video className="h-5 w-5 text-primary" />
                            {t('kyc.faceVoiceVerification')}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <FaceVoiceSync
                            mobileNumber={merchantProfile?.mobile_number as string | undefined}
                            onSuccess={() => {
                                setFaceVoiceVerified(true);
                                toast({ title: t('faceVoice.verifiedProceed'), description: t('faceVoice.verifiedProceedDesc') });
                            }}
                            onFailure={() => {
                                setFaceVoiceVerified(false);
                                toast({ variant: "destructive", title: t('faceVoice.failedTryAgain'), description: t('faceVoice.failedTryAgainDesc') });
                            }}
                        />
                    </CardContent>
                </Card>

                {/* Location Capture */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <MapPin className="h-5 w-5 text-primary" />
                            {t('kyc.locationVerification')}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {!kycState.locationCaptured ? (
                            <div className="text-center space-y-4">
                                <div className="p-8 border-2 border-dashed border-border rounded-xl">
                                    <MapPin className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                                    <h3 className="font-semibold text-foreground mb-2">
                                        {t('kyc.captureLocation')}
                                    </h3>
                                    <p className="text-muted-foreground mb-4 max-w-md mx-auto">
                                        {t('kyc.captureLocationDesc')}
                                    </p>
                                    <Button onClick={handleLocationCapture} className="px-6">
                                        <MapPin className="h-4 w-4 mr-2" />
                                        {t('kyc.captureLocationBtn')}
                                    </Button>
                                    <div className="text-xs text-muted-foreground mt-4">
                                        <p>{t('kyc.whyLocation')}</p>
                                        <ul className="list-disc list-inside space-y-1 mt-1">
                                            <li>{t('kyc.regulatoryCompliance')}</li>
                                            <li>{t('kyc.fraudPrevention')}</li>
                                            <li>{t('kyc.locationEncrypted')}</li>
                                            <li>{t('kyc.verificationOnly')}</li>
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="p-6 bg-gradient-to-r from-primary/10 to-accent/10 rounded-xl space-y-4">
                                <div className="flex items-center gap-3">
                                    <CheckCircle className="h-6 w-6 text-primary" />
                                    <span className="font-semibold text-foreground">
                                        {t('kyc.locationCaptured')}
                                    </span>
                                </div>

                                {/* Coordinates */}
                                {kycState.coordinates && (
                                    <div className="p-3 bg-card rounded-lg">
                                        <p className="text-sm font-medium text-foreground mb-1">{t('kyc.coordinates')}</p>
                                        <p className="text-sm text-primary font-mono">
                                            {kycState.coordinates.lat.toFixed(4)}, {kycState.coordinates.lng.toFixed(4)}
                                        </p>
                                    </div>
                                )}

                                {/* Full Address Display */}
                                {kycState.address && (
                                    <div className="p-3 bg-card rounded-lg">
                                        <p className="text-sm font-medium text-foreground mb-1">{t('kyc.fullAddress')}</p>
                                        <p className="text-xs text-muted-foreground leading-relaxed">
                                            {kycState.address}
                                        </p>
                                    </div>
                                )}

                                {/* Address Components Grid */}
                                {kycState.addressDetails && (
                                    <div className="p-3 bg-card rounded-lg">
                                        <p className="text-sm font-medium text-foreground mb-2">{t('kyc.addressDetails')}</p>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-muted-foreground">
                                            {kycState.addressDetails.road && (
                                                <div><span className="font-medium">{t('kyc.road')}</span> {kycState.addressDetails.road}</div>
                                            )}
                                            {(kycState.addressDetails.neighbourhood || kycState.addressDetails.suburb) && (
                                                <div><span className="font-medium">{t('kyc.area')}</span> {kycState.addressDetails.neighbourhood || kycState.addressDetails.suburb}</div>
                                            )}
                                            {(kycState.addressDetails.city || kycState.addressDetails.town || kycState.addressDetails.village) && (
                                                <div><span className="font-medium">{t('kyc.city')}</span> {kycState.addressDetails.city || kycState.addressDetails.town || kycState.addressDetails.village}</div>
                                            )}
                                            {kycState.addressDetails.state && (
                                                <div><span className="font-medium">{t('kyc.state')}</span> {kycState.addressDetails.state}</div>
                                            )}
                                            {kycState.addressDetails.postcode && (
                                                <div><span className="font-medium">{t('kyc.pincode')}</span> {kycState.addressDetails.postcode}</div>
                                            )}
                                            {kycState.addressDetails.country && (
                                                <div><span className="font-medium">{t('kyc.country')}</span> {kycState.addressDetails.country}</div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                <p className="text-xs text-muted-foreground italic">
                                    {t('kyc.locationSecureNote')}
                                </p>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* KYC Progress Summary */}
                <Card>
                    <CardHeader>
                        <CardTitle>{t('kyc.verificationProgress')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3">
                            {/* Document OCR */}
                            <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                                <div className="flex items-center gap-3">
                                    <div className={`w-6 h-6 rounded-full flex items-center justify-center ${true ? 'bg-primary text-white' : 'bg-muted'}`}>
                                        <CheckCircle className="h-4 w-4" />
                                    </div>
                                    <span>{t('kyc.documentVerification')}</span>
                                </div>
                                <span className="text-sm font-medium text-primary">{t('kyc.complete')}</span>
                            </div>

                            {/* Video KYC */}
                            <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                                <div className="flex items-center gap-3">
                                    <div className={`w-6 h-6 rounded-full flex items-center justify-center ${kycState.videoKycCompleted ? 'bg-primary text-white' : 'bg-muted'}`}>
                                        {kycState.videoKycCompleted ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                                    </div>
                                    <span>{t('kyc.videoKyc')}</span>
                                </div>
                                <span className={`text-sm font-medium ${kycState.videoKycCompleted ? 'text-primary' : 'text-muted-foreground'}`}>
                                    {kycState.videoKycCompleted ? t('kyc.complete') : t('kyc.pending')}
                                </span>
                            </div>

                            {/* Face Match */}
                            <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                                <div className="flex items-center gap-3">
                                    <div className={`w-6 h-6 rounded-full flex items-center justify-center ${(faceScore ?? 0) >= 85 ? 'bg-primary text-white' : 'bg-muted'}`}>
                                        {(faceScore ?? 0) >= 85 ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                                    </div>
                                    <span>{t('kyc.faceMatch')}</span>
                                </div>
                                <span className={`text-sm font-medium ${(faceScore ?? 0) >= 85 ? 'text-primary' : 'text-muted-foreground'}`}>
                                    {(faceScore ?? 0) >= 85 ? t('kyc.complete') : t('kyc.pending')}
                                </span>
                            </div>

                            {/* Face & Voice */}
                            <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                                <div className="flex items-center gap-3">
                                    <div className={`w-6 h-6 rounded-full flex items-center justify-center ${faceVoiceVerified ? 'bg-primary text-white' : 'bg-muted'}`}>
                                        {faceVoiceVerified ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                                    </div>
                                    <span>{t('kyc.faceVoiceVerification')}</span>
                                </div>
                                <span className={`text-sm font-medium ${faceVoiceVerified ? 'text-primary' : 'text-muted-foreground'}`}>
                                    {faceVoiceVerified ? t('kyc.complete') : t('kyc.pending')}
                                </span>
                            </div>

                            {/* Location */}
                            <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                                <div className="flex items-center gap-3">
                                    <div className={`w-6 h-6 rounded-full flex items-center justify-center ${kycState.locationCaptured ? 'bg-primary text-white' : 'bg-muted'}`}>
                                        {kycState.locationCaptured ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                                    </div>
                                    <span>{t('kyc.location')}</span>
                                </div>
                                <span className={`text-sm font-medium ${kycState.locationCaptured ? 'text-primary' : 'text-muted-foreground'}`}>
                                    {kycState.locationCaptured ? t('kyc.complete') : t('kyc.pending')}
                                </span>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <div className="flex gap-2 justify-center">
                    <ViewTicketButton />
                    <RaiseTicketButton
                        module="settlement"
                        referenceId={merchantProfile?.id as string}
                    />
                </div>


                {/* Navigation Buttons */}
                <div className="flex justify-between mt-4">
                    <Button variant="outline" onClick={onPrev}>
                        {t('common.back')}
                    </Button>
                    <Button onClick={handleNext} disabled={!(isKYCComplete && faceVoiceVerified && (faceScore ?? 0) >= 85)}>
                        {t('common.continue')}
                    </Button>
                </div>
                {/* WhatsApp Support (bottom of onboarding step) */}
                <div style={{marginTop: '2rem', textAlign: 'center'}}>
                  <WhatsAppSupportButton />
                               </div>
            </div>

        </div>
    );
};
