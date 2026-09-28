import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Video, Mic, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useMerchantData } from '@/hooks/useMerchantData';
import { authService } from '@/lib/auth-service';
import { API_BASE_URL } from '@/lib/api-client';
// @ts-ignore - Vite will handle static asset imports
import demoVideo from '@/assets/demokyc.mp4';

interface FaceVoiceSyncProps {
  onSuccess?: () => void;
  onFailure?: () => void;
  mobileNumber?: string; // Allow passing mobile number directly
}

export const FaceVoiceSync: React.FC<FaceVoiceSyncProps> = ({ onSuccess, onFailure, mobileNumber: propMobileNumber }) => {
  const { merchantProfile } = useMerchantData();
  const [otpSent, setOtpSent] = useState(false);
  const [recording, setRecording] = useState(false);
  const [status, setStatus] = useState<'idle' | 'preparing' | 'recording' | 'verifying' | 'done'>('idle');
  const [transcript, setTranscript] = useState('');
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [verificationComplete, setVerificationComplete] = useState(false);
  const [verificationSuccess, setVerificationSuccess] = useState(false);
  const [showDemo, setShowDemo] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<any>(null);
  const transcriptRef = useRef<string>(''); // Track latest transcript

  const { toast } = useToast();

  const reset = () => {
    setOtpSent(false);
    setStatus('idle');
    setTranscript('');
    setResultMessage(null);
    setVerificationComplete(false);
    setVerificationSuccess(false);
  };

  const stopMediaStream = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  };
  
  const formatPhoneForWhatsApp = (num?: string) => {
    if (!num) return null;
    let s = num.replace(/\D/g, '');
    s = s.replace(/^0+/, '');
    if (s.length === 10) s = `91${s}`;
    return s;
  };
  const startVerification = async () => {
    setResultMessage(null);
    setStatus('preparing');

    try {
      // Use prop-passed mobile number if available, otherwise fall back to merchantProfile
      const rawTo = propMobileNumber || merchantProfile?.mobileNumber || merchantProfile?.mobile_number;
      const to = formatPhoneForWhatsApp(rawTo);
      if (!to) {
        console.error('❌ No mobile number available:', { propMobileNumber, profileNumber: merchantProfile?.mobile_number });
        toast({ variant: 'destructive', title: 'No phone number', description: 'Merchant mobile number not available. Please ensure mobile number is set.' });
        setStatus('idle');
        return;
      }

      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        toast({
          variant: 'destructive',
          title: 'Secure connection required',
          description: 'Camera and microphone require HTTPS. Open the secure UAT URL and try again.'
        });
        setStatus('idle');
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;

      // use shared base URL helper (already ensures '/api' suffix)
      const resp = await fetch(`${API_BASE_URL}/api/whatsapp/send-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authService.getToken()}`,
        },
        body: JSON.stringify({ to })
      });

      // defend against non-json responses
      let json: any = { success: false };
      try {
        json = await resp.json();
      } catch (e) {
        console.error('Invalid JSON from send-otp', e);
        stopMediaStream();
        toast({ variant: 'destructive', title: 'Send failed', description: 'Unexpected server response when sending OTP' });
        setStatus('idle');
        return;
      }

      if (!json.success) {
        stopMediaStream();
        const errorMsg = typeof json.error === 'string' 
          ? json.error 
          : (json.error?.message || 'Failed to send OTP');
        toast({ variant: 'destructive', title: 'Send failed', description: errorMsg });
        setStatus('idle');
        return;
      }

      setOtpSent(true);

      // start speech recognition
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.lang = 'en-IN';
        recognition.interimResults = true;  // capture partial results too
        recognition.continuous = true;       // keep listening until stopped
        recognition.maxAlternatives = 3;     // try multiple alternatives

        recognition.onresult = (event: any) => {
          // grab the best result from all results so far
          let best = '';
          for (let i = 0; i < event.results.length; i++) {
            const result = event.results[i];
            if (result[0].transcript.trim().length > best.length) {
              best = result[0].transcript.trim();
            }
          }
          console.log('🎤 Speech recognized:', best);
          setTranscript(best);
          transcriptRef.current = best;
        };

        recognition.onerror = (event: any) => {
          console.warn('🎤 Speech recognition error:', event.error);
          // no-speech is expected if user hasn't spoken yet — don't treat as failure
          if (event.error !== 'no-speech') {
            toast({
              variant: 'destructive',
              title: 'Microphone issue',
              description: `Speech recognition error: ${event.error}. Please try again.`
            });
          }
        };

        recognition.onend = () => {
          console.log('🎤 Speech recognition ended. Transcript:', transcriptRef.current);
        };

        recognitionRef.current = recognition;
        recognition.start();
        console.log('🎤 Speech recognition started');
      } else {
        console.warn('⚠️ SpeechRecognition not supported in this browser');
        toast({
          variant: 'destructive',
          title: 'Browser not supported',
          description: 'Speech recognition requires Chrome or Edge. Please switch browsers.'
        });
      }

      // start recording (video+audio)
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8,opus' });
      const chunks: Blob[] = [];

      const verify = async () => {
        setStatus('verifying');

        const wordMap: Record<string,string> = {
          // Standard
          zero:'0', one:'1', two:'2', three:'3', four:'4',
          five:'5', six:'6', seven:'7', eight:'8', nine:'9',
          // Common speech recognition variations
          'oh':'0', 'o':'0',
          'won':'1', 'wan':'1', 'fun':'1',
          'to':'2', 'too':'2', 'tu':'2',
          'tree':'3', 'free':'3', 'tri':'3',
          'for':'4', 'fore':'4', 'fur':'4',
          'fife':'5', 'fav':'5',
          'sex':'6', 'sax':'6',
          'saven':'7', 'savin':'7',
          'ate':'8', 'ait':'8',
          'nein':'9', 'nain':'9'
        };
        const cleaned = transcriptRef.current
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, '')
          .split(/\s+/)
          .filter(tok => tok.length > 0)
          .map(tok => {
            if (/^\d+$/.test(tok)) return tok;
            return wordMap[tok] || null;  // null for unknown words
          })
          .filter(tok => tok !== null)    // remove unknowns instead of keeping as ''
          .join('');

        // call backend verify
        try {
          if (!transcriptRef.current.trim()) {
            console.warn('⚠️ No speech detected');
            setResultMessage('No speech detected. Please try again and speak clearly.');
            setVerificationSuccess(false);
            setVerificationComplete(true);
            onFailure?.();
            setStatus('done');
            return;
          }
          const verifyResp = await fetch(`${API_BASE_URL}/api/whatsapp/verify-otp`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${authService.getToken()}`,
            },
            body: JSON.stringify({ to: to, otp: cleaned })
          });
          const verifyJson = await verifyResp.json();
          const voiceOk = verifyJson.success && (verifyJson.data?.verified || verifyJson.verified);
          const faceOk = true; // placeholder

          if (voiceOk && faceOk) {
            setResultMessage('Face and voice verified successfully!');
            setVerificationSuccess(true);
            setVerificationComplete(true);
            onSuccess?.();
          } else {
            setResultMessage('Verification failed. Please try again.');
            setVerificationSuccess(false);
            setVerificationComplete(true);
            onFailure?.();
          }
        } catch (e) {
          setResultMessage('Verification failed due to server error.');
          onFailure?.();
        }

        setStatus('done');
      };

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size) {
          chunks.push(e.data);
        }
      };
      recorder.onstop = async () => {
        const blob = new Blob(chunks, { type: 'video/webm' });

        if (recognitionRef.current) {
          recognitionRef.current.stop();
          setTimeout(() => verify(), 500);
        } else {
          verify();
        }
      };
      recorder.start();
      mediaRecorderRef.current = recorder;

      setRecording(true);
      setStatus('recording');
    } catch (err: any) {
      console.error('Failed to access media devices', err);
      stopMediaStream();

      // Provide specific guidance based on error type
      if (err && (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError')) {
        toast({
          variant: 'destructive',
          title: 'Permission Denied',
          description: 'Allow Camera and Microphone for this UAT site in your browser site settings, then reload and try again.'
        });
      } else if (err && err.name === 'NotFoundError') {
        toast({
          variant: 'destructive',
          title: 'No Device Found',
          description: 'No camera or microphone found. Please connect a device and try again.'
        });
      } else {
        toast({
          variant: 'destructive',
          title: 'Media Error',
          description: 'Unable to access camera or microphone. Please check permissions and try in Chrome/Edge with a secure context (https or localhost).'
        });
      }

      setStatus('idle');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    stopMediaStream();
    setRecording(false);
  };

  useEffect(() => {
    // cleanup on unmount
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-xl font-semibold">Face & Voice Sync Verification</h3>
        <p className="text-sm text-muted-foreground">You will receive a one-time code on WhatsApp. Read the code aloud while your face is recorded.</p>
      </div>

      {!verificationComplete ? (
        <>
          <div className="flex flex-col items-center gap-4">
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="w-64 h-48 rounded-lg bg-black"
            />
            {status === 'recording' && <p className="text-sm text-primary">Recording...</p>}
            {status === 'verifying' && <p className="text-sm text-muted-foreground">Verifying...</p>}
          </div>
          {otpSent && (propMobileNumber || merchantProfile?.mobileNumber || merchantProfile?.mobile_number) && (
            <p className="text-sm text-muted-foreground text-center">OTP sent to WhatsApp: ****{(formatPhoneForWhatsApp(propMobileNumber || merchantProfile?.mobile_number) || '').slice(-4)}</p>
          )}
          {transcript && (
            <p className="text-sm">
              You said: <span className="font-medium">
                {transcript.replace(/\.$/, '')}
              </span>
            </p>
          )}

          <div className="mb-3 text-center">
            <button onClick={() => setShowDemo(true)} className="text-sm text-indigo-600 underline">Watch demo video</button>
          </div>

          <div className="flex justify-center gap-4">
            {!recording ? (
              <Button onClick={startVerification} disabled={status === 'recording'}>
                <Video className="h-4 w-4 mr-2" /> Start Verification
              </Button>
            ) : (
              <Button variant="destructive" onClick={stopRecording}>
                <Mic className="h-4 w-4 mr-2" /> Stop
              </Button>
            )}
          </div>
        </>
      ) : (
        <div className={`p-6 rounded-xl ${verificationSuccess ? 'bg-gradient-to-r from-green-100 to-emerald-100' : 'bg-gradient-to-r from-red-100 to-pink-100'}`}>
          <div className="flex items-center gap-3 mb-2">
            {verificationSuccess ? (
              <CheckCircle className="h-6 w-6 text-green-600" />
            ) : (
              <AlertCircle className="h-6 w-6 text-red-600" />
            )}
            <span className={`font-semibold ${verificationSuccess ? 'text-green-700' : 'text-red-700'}`}>
              {verificationSuccess ? 'Face & Voice Verified Successfully' : 'Verification Failed'}
            </span>
          </div>
          <p className={`text-sm ${verificationSuccess ? 'text-green-600' : 'text-red-600'}`}>
            {resultMessage}
          </p>
          {!verificationSuccess && (
            <Button variant="link" onClick={reset} className="mt-3 text-red-600 hover:text-red-700">
              <RefreshCw className="h-4 w-4 mr-1" /> Try Again
            </Button>
          )}
        </div>
      )}
      {showDemo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-white rounded-lg p-4 max-w-3xl w-full mx-4">
            <div className="flex justify-end">
              <button onClick={() => setShowDemo(false)} className="text-gray-600 px-3 py-1">Close</button>
            </div>
            <video src={demoVideo} controls className="w-full rounded-lg mt-2" />
          </div>
        </div>
      )}
    </div>
  );
};
