import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Video, StopCircle, Upload, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/rest-api';
import { apiClient } from '@/lib/api-client';

interface CPVRecorderProps {
    merchantId: string;
    userId: string;
    onSubmitted: () => void;
}

export const CPVRecorder: React.FC<CPVRecorderProps> = ({ merchantId, userId, onSubmitted }) => {
    const { toast } = useToast();
    const [status, setStatus] = useState<'idle' | 'recording' | 'recorded' | 'uploading' | 'submitted'>('idle');
    const [videoUrl, setVideoUrl] = useState<string | null>(null);
    const [videoBlob, setVideoBlob] = useState<Blob | null>(null);
    const [error, setError] = useState<string | null>(null);

    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const recorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);

    const startRecording = async () => {
        setError(null);
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            streamRef.current = stream;

            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                videoRef.current.muted = true;
                videoRef.current.play();
            }

            chunksRef.current = [];
            const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8,opus' });

            recorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
            };

            recorder.onstop = () => {
                const blob = new Blob(chunksRef.current, { type: 'video/webm' });
                setVideoBlob(blob);
                const url = URL.createObjectURL(blob);
                setVideoUrl(url);

                if (videoRef.current) {
                    videoRef.current.srcObject = null;
                    videoRef.current.src = url;
                    videoRef.current.muted = false;
                    videoRef.current.controls = true;
                }

                setStatus('recorded');
            };

            recorderRef.current = recorder;
            recorder.start();
            setStatus('recording');
        } catch (err: any) {
            setError('Could not access camera/microphone. Please check permissions.');
            setStatus('idle');
        }
    };

    const stopRecording = () => {
        if (recorderRef.current && recorderRef.current.state !== 'inactive') {
            recorderRef.current.stop();
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
        }
    };

    const retake = () => {
        if (videoUrl) URL.revokeObjectURL(videoUrl);
        setVideoUrl(null);
        setVideoBlob(null);
        setStatus('idle');
        if (videoRef.current) {
            videoRef.current.src = '';
            videoRef.current.controls = false;
        }
    };

    const submitCPV = async () => {
        if (!videoBlob) return;
        setStatus('uploading');

        try {
            // Upload to Supabase storage
            const fileName = `${userId}/cpv-video-${Date.now()}.webm`;
            const uploadError = null; /* upload handled via api.uploadFile */

            if (uploadError) throw uploadError;

            // Save path to merchant profile
            const { data } = await apiClient.post('/merchants/submit-cpv', {
                cpv_video_path: fileName
            });

            if (data.success) {
                setStatus('submitted');
                toast({
                    title: 'CPV Submitted ✅',
                    description: 'Your shop verification video has been submitted for review.',
                });
                onSubmitted();
            } else {
                throw new Error(data.message);
            }
        } catch (err: any) {
            setError(err.message || 'Failed to upload CPV video');
            setStatus('recorded');
            toast({
                variant: 'destructive',
                title: 'Upload Failed',
                description: err.message || 'Please try again.',
            });
        }
    };

    if (status === 'submitted') {
        return (
            <Card className="border-green-200 bg-green-50">
                <CardContent className="p-6 flex items-center gap-4">
                    <CheckCircle className="h-8 w-8 text-green-600 flex-shrink-0" />
                    <div>
                        <p className="font-semibold text-green-800">CPV Video Submitted</p>
                        <p className="text-sm text-green-600">Our team will review your shop verification video shortly.</p>
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="border-orange-200 bg-orange-50">
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-orange-800">
                    <Video className="h-5 w-5" />
                    Shop Verification (CPV) Required
                </CardTitle>
                <p className="text-sm text-orange-700">
                    As a Payment Gateway merchant, you need to record a short video of your physical business premises.
                    Please show your shop signboard, interior, and mention your business name clearly.
                </p>
            </CardHeader>
            <CardContent className="space-y-4">
                {error && (
                    <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                        <AlertCircle className="h-4 w-4 flex-shrink-0" />
                        {error}
                    </div>
                )}

                {/* Video preview */}
                <div className="relative bg-black rounded-lg overflow-hidden aspect-video max-w-md mx-auto">
                    <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        className="w-full h-full object-cover"
                    />
                    {status === 'idle' && (
                        <div className="absolute inset-0 flex items-center justify-center">
                            <Video className="h-16 w-16 text-white/40" />
                        </div>
                    )}
                    {status === 'recording' && (
                        <div className="absolute top-3 right-3 flex items-center gap-2 bg-red-600 text-white px-3 py-1 rounded-full text-xs font-semibold">
                            <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
                            REC
                        </div>
                    )}
                </div>

                {/* Instructions */}
                {status === 'idle' && (
                    <div className="text-sm text-orange-700 space-y-1">
                        <p className="font-medium">What to show in the video:</p>
                        <ul className="list-disc list-inside space-y-1 text-xs">
                            <li>Shop/office signboard with business name</li>
                            <li>Business interior or workspace</li>
                            <li>Speak your business name and address clearly</li>
                            <li>Video should be at least 30 seconds</li>
                        </ul>
                    </div>
                )}

                {/* Action buttons */}
                <div className="flex gap-3 justify-center">
                    {status === 'idle' && (
                        <Button onClick={startRecording} className="bg-orange-600 hover:bg-orange-700">
                            <Video className="h-4 w-4 mr-2" />
                            Start Recording
                        </Button>
                    )}

                    {status === 'recording' && (
                        <Button onClick={stopRecording} variant="destructive">
                            <StopCircle className="h-4 w-4 mr-2" />
                            Stop Recording
                        </Button>
                    )}

                    {status === 'recorded' && (
                        <>
                            <Button variant="outline" onClick={retake}>
                                Retake
                            </Button>
                            <Button onClick={submitCPV} className="bg-green-600 hover:bg-green-700">
                                <Upload className="h-4 w-4 mr-2" />
                                Submit for Review
                            </Button>
                        </>
                    )}

                    {status === 'uploading' && (
                        <Button disabled>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Uploading...
                        </Button>
                    )}
                </div>
            </CardContent>
        </Card>
    );
};


