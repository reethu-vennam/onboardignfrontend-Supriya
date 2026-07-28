import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MessageCircle, X, Send, Mic, MicOff, Loader2 } from 'lucide-react';
import { authService } from '@/lib/auth-service';

interface Message {
    role: 'bot' | 'user';
    content: string;
    stepComplete?: boolean;
}

interface ChatResponseData {
    sessionId: string;
    reply: string;
    currentStep: string;
    currentQuestion: string;
    questionIndex: number;
    totalQuestions: number;
    stepComplete: boolean;
    collectedData: Record<string, any> | null;
}

interface Props {
    currentStep: string;
    onDataChange: (data: Record<string, any>) => void;
    language?: string;
}

const STEPS_WITHOUT_QUESTIONS = new Set([
    'welcome', 'entity-documents', 'kyc', 'review', 'dashboard'
]);

function getStepDisplayName(step: string): string {
    switch (step) {
        case 'entity-type': return 'Entity Type';
        case 'products': return 'Products';
        case 'business-details': return 'Business Details';
        case 'person-kyc': return 'Person KYC';
        case 'entity-documents': return 'Documents';
        case 'doing-business': return 'Address Proof';
        case 'bank-details': return 'Bank Details';
        case 'kyc': return 'KYC';
        case 'review': return 'Review';
        default: return 'Onboarding';
    }
}

export const OnboardingChatbot: React.FC<Props> = ({ currentStep, onDataChange, language = 'en' }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [isRecording, setIsRecording] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [stepDataCollected, setStepDataCollected] = useState(false);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const recognitionRef = useRef<any>(null);
    const lastStepRef = useRef<string>('');

    useEffect(() => {
        if (lastStepRef.current !== currentStep) {
            lastStepRef.current = currentStep;
            setStepDataCollected(false);
            if (isOpen && !STEPS_WITHOUT_QUESTIONS.has(currentStep)) {
                startSession();
            }
        }
    }, [currentStep, isOpen]);

    useEffect(() => {
        if (isOpen && messages.length === 0 && !STEPS_WITHOUT_QUESTIONS.has(currentStep)) {
            startSession();
        }
    }, [isOpen]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const startSession = useCallback(async () => {
        setMessages([]);
        setStepDataCollected(false);
        setIsLoading(true);
        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/chat`.replace(/\/$/, ''), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authService.getToken()}`,
                },
                body: JSON.stringify({
                    currentStep,
                    language,
                    message: '',
                }),
            });
            const data = await res.json();
            if (data.success && data.data) {
                const d = data.data as ChatResponseData;
                setSessionId(d.sessionId);
                setMessages([{ role: 'bot', content: d.reply, stepComplete: d.stepComplete }]);
                if (d.stepComplete) {
                    setStepDataCollected(true);
                    if (d.collectedData) {
                        onDataChange(d.collectedData);
                    }
                }
            }
        } catch (err) {
            setMessages([{ role: 'bot', content: 'Hello! I can help you fill out this form. Type or speak your answers.' }]);
        } finally {
            setIsLoading(false);
        }
    }, [currentStep, language, onDataChange]);

    const sendMessage = useCallback(async (text: string) => {
        if (!text.trim() || isLoading) return;

        const userMsg: Message = { role: 'user', content: text };
        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setIsLoading(true);

        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/chat`.replace(/\/$/, ''), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authService.getToken()}`,
                },
                body: JSON.stringify({
                    sessionId: sessionId || undefined,
                    message: text,
                    currentStep,
                    language,
                }),
            });
            const data = await res.json();
            if (data.success && data.data) {
                const d = data.data as ChatResponseData;
                setSessionId(d.sessionId);
                const botMsg: Message = { role: 'bot', content: d.reply, stepComplete: d.stepComplete };
                setMessages(prev => [...prev, botMsg]);
                if (d.stepComplete && d.collectedData) {
                    setStepDataCollected(true);
                    onDataChange(d.collectedData);
                }
            } else {
                setMessages(prev => [...prev, { role: 'bot', content: 'Sorry, something went wrong. Please try again.' }]);
            }
        } catch {
            setMessages(prev => [...prev, { role: 'bot', content: 'Connection error. Please check your network and try again.' }]);
        } finally {
            setIsLoading(false);
        }
    }, [sessionId, currentStep, language, isLoading, onDataChange]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage(input);
        }
    };

    const handleSend = () => sendMessage(input);

    const clearMessages = () => {
        setMessages([]);
        setSessionId(null);
        setStepDataCollected(false);
    };

    const startRecording = () => {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SpeechRecognition) {
            console.error('Speech recognition not supported');
            return;
        }

        if (recognitionRef.current) {
            recognitionRef.current.stop();
            recognitionRef.current = null;
            setIsRecording(false);
            return;
        }

        const recognition = new SpeechRecognition();
        recognition.lang = language === 'en' ? 'en-IN' : `${language}-IN`;
        recognition.interimResults = true;
        recognition.continuous = true;

        let finalTranscript = '';

        recognition.onresult = (event: any) => {
            let interim = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    finalTranscript += transcript + ' ';
                    setInput(prev => {
                        const base = prev.replace(/\| listening\.\.\./, '').trim();
                        return (base ? base + ' ' : '') + finalTranscript.trim();
                    });
                } else {
                    interim = transcript;
                    setInput(prev => {
                        const base = prev.replace(/\| listening\.\.\./, '').trim();
                        return (base ? base + ' ' : '') + finalTranscript.trim() + (interim ? ' ' + interim : '') + ' | listening...';
                    });
                }
            }
        };

        recognition.onerror = (event: any) => {
            if (event.error !== 'no-speech') {
                console.error('Speech error:', event.error);
            }
        };

        recognition.onend = () => {
            setIsRecording(false);
            recognitionRef.current = null;
            setInput(prev => prev.replace(/\s*\|\s*listening\.\.\./, '').trim());
        };

        recognition.start();
        recognitionRef.current = recognition;
        setIsRecording(true);
        setInput(prev => prev + ' | listening...');
    };

    const stopRecording = () => {
        if (recognitionRef.current) {
            recognitionRef.current.stop();
            recognitionRef.current = null;
        }
    };

    const hasQuestions = !STEPS_WITHOUT_QUESTIONS.has(currentStep);

    return (
        <>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-gradient-to-r from-blue-600 to-blue-500 rounded-full shadow-lg flex items-center justify-center text-white hover:shadow-xl hover:scale-105 transition-all duration-200"
                title="SabbPe Onboarding Assistant"
            >
                {isOpen ? <X className="w-6 h-6" /> : <MessageCircle className="w-6 h-6" />}
            </button>

            {isOpen && (
                <div className="fixed bottom-24 right-6 z-50 w-[380px] h-[540px] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 duration-200">
                    <div className="bg-gradient-to-r from-blue-600 to-blue-500 px-4 py-3 flex items-center justify-between shrink-0">
                        <div>
                            <h3 className="text-white font-semibold text-sm">SabbPe Assistant</h3>
                            <p className="text-blue-100 text-xs">{getStepDisplayName(currentStep)}</p>
                        </div>
                        <button onClick={clearMessages} className="text-white/70 hover:text-white text-xs">
                            Reset
                        </button>
                    </div>

                    <div className="absolute top-11 left-0 right-0 h-1 bg-blue-100">
                        <div
                            className="h-full bg-blue-500 transition-all duration-300"
                            style={{
                                width: messages.length > 0
                                    ? `${Math.min(
                                        (messages.filter(m => m.role === 'bot').length / (messages.filter(m => m.role === 'bot').length + 1)) * 100,
                                        100
                                    )}%`
                                    : '0%'
                            }}
                        />
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
                        {messages.length === 0 && isLoading && (
                            <div className="flex justify-center py-8">
                                <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
                            </div>
                        )}

                        {messages.length === 0 && !isLoading && hasQuestions && (
                            <div className="text-center py-8 text-gray-400 text-sm">
                                Click Reset to start fresh, or type a message to begin.
                            </div>
                        )}

                        {messages.map((msg, i) => (
                            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div
                                    className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap leading-relaxed ${
                                        msg.role === 'user'
                                            ? 'bg-blue-600 text-white rounded-br-md'
                                            : msg.stepComplete
                                                ? 'bg-green-50 border border-green-200 text-gray-800 rounded-bl-md'
                                                : 'bg-white border border-gray-200 text-gray-800 rounded-bl-md shadow-sm'
                                    }`}
                                >
                                    {msg.content}
                                </div>
                            </div>
                        ))}

                        {isLoading && (
                            <div className="flex justify-start">
                                <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-md px-4 py-3 shadow-sm">
                                    <div className="flex gap-1.5">
                                        <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                        <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                        <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                                    </div>
                                </div>
                            </div>
                        )}

                        {stepDataCollected && hasQuestions && (
                            <div className="flex justify-center pt-2">
                                <div className="bg-green-50 border border-green-200 rounded-xl px-3 py-1.5 text-green-700 text-xs font-medium">
                                    Form filled! Review it and continue when ready.
                                </div>
                            </div>
                        )}

                        <div ref={messagesEndRef} />
                    </div>

                    <div className="border-t border-gray-200 p-3 bg-white shrink-0">
                        {hasQuestions ? (
                            <div className="flex items-end gap-2">
                                <button
                                    onClick={startRecording}
                                    disabled={isLoading}
                                    className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                                        isRecording
                                            ? 'bg-red-500 text-white animate-pulse'
                                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200 disabled:opacity-50'
                                    }`}
                                    title={isRecording ? 'Stop listening' : 'Start voice input'}
                                >
                                    {isRecording ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                                </button>

                                <textarea
                                    ref={inputRef}
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    placeholder={isRecording ? 'Listening...' : 'Type your answer...'}
                                    disabled={isLoading}
                                    rows={1}
                                    className="flex-1 resize-none rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 disabled:opacity-50"
                                />

                                <button
                                    onClick={handleSend}
                                    disabled={!input.trim() || isLoading}
                                    className="shrink-0 w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center hover:bg-blue-700 disabled:opacity-50 transition-colors"
                                >
                                    {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                                </button>
                            </div>
                        ) : (
                            <div className="text-center text-sm text-gray-500 py-1">
                                This step requires manual input. Use the form to continue.
                            </div>
                        )}
                    </div>
                </div>
            )}
        </>
    );
};
