import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { CheckCircle, FileText, PenTool, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiClient } from '@/lib/api-client';
import MERCHANT_AGREEMENT_TERMS from '@/constants/merchantAgreementTerms';

interface PGAgreementProps {
    merchantProfile: any;
    onSigned: () => void;
}

const buildCommercialsText = (commercials: any): string => {
    if (!commercials) return '';
    let text = '\n\n════════════════════════════════════════\nPAYMENT GATEWAY COMMERCIAL RATES\n(As agreed with the bank)\n════════════════════════════════════════\n\n';

    if (commercials.bank?.length) {
        text += 'BANK COMMERCIALS\n';
        text += '─────────────────────────────────────────\n';
        text += 'Bank                  Processing Fee  Platform Fee  Other Fee  System Fee\n';
        commercials.bank.forEach((r: any) => {
            text += `${r.name.padEnd(22)}${r.processingFee.padEnd(16)}${r.platformFee.padEnd(14)}${r.otherFee.padEnd(11)}${r.merchantSystemFee}\n`;
        });
        text += '\n';
    }

    if (commercials.creditCard?.length) {
        text += 'CREDIT CARD\n';
        text += '─────────────────────────────────────────\n';
        commercials.creditCard.forEach((r: any) => {
            text += `${r.name.padEnd(30)}Processing: ${r.processingFee}  Platform: ${r.platformFee}\n`;
        });
        text += '\n';
    }

    if (commercials.debitCard?.length) {
        text += 'DEBIT CARD\n';
        text += '─────────────────────────────────────────\n';
        commercials.debitCard.forEach((r: any) => {
            text += `${r.name.padEnd(30)}Processing: ${r.processingFee}  Other: ${r.otherFee}\n`;
        });
        text += '\n';
    }

    if (commercials.upi?.length) {
        text += 'UPI\n';
        text += '─────────────────────────────────────────\n';
        commercials.upi.forEach((r: any) => {
            text += `${r.name.padEnd(30)}Processing: ${r.processingFee}  Platform: ${r.platformFee}  System: ${r.merchantSystemFee}\n`;
        });
        text += '\n';
    }

    text += '════════════════════════════════════════\n\n';
    return text;
};

export const PGAgreement: React.FC<PGAgreementProps> = ({ merchantProfile, onSigned }) => {
    const { toast } = useToast();
    const [showAgreement, setShowAgreement] = useState(false);
    const [hasReadAgreement, setHasReadAgreement] = useState(false);
    const [agreedToTerms, setAgreedToTerms] = useState(false);
    const [signature, setSignature] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const agreementRef = useRef<HTMLDivElement>(null);

    const commercials = merchantProfile?.bank_commercials;
    const fullAgreementText = buildCommercialsText(commercials) + MERCHANT_AGREEMENT_TERMS;

    const handleAgreementScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const el = e.currentTarget;
        const isAtBottom = el.scrollHeight - el.scrollTop <= el.clientHeight + 50;
        if (isAtBottom) setHasReadAgreement(true);
    };

    const handleSign = async () => {
        if (!hasReadAgreement) {
            toast({ variant: 'destructive', title: 'Please read the agreement', description: 'Scroll to the bottom of the agreement first.' });
            return;
        }
        if (!agreedToTerms) {
            toast({ variant: 'destructive', title: 'Agreement required', description: 'Please accept the terms and conditions.' });
            return;
        }
        if (!signature.trim()) {
            toast({ variant: 'destructive', title: 'Signature required', description: 'Please enter your full name as digital signature.' });
            return;
        }

        setSubmitting(true);
        try {
            const { data } = await apiClient.post('/merchants/sign-pg-agreement', { signature });
            if (data.success) {
                toast({ title: '✅ Agreement Signed', description: 'Your Payment Gateway agreement has been signed successfully.' });
                setShowAgreement(false);
                onSigned();
            } else {
                throw new Error(data.message);
            }
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Error', description: e.message || 'Failed to sign agreement' });
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <>
            {/* Trigger Card */}
            <Card className="border-indigo-200 bg-indigo-50">
                <CardContent className="p-6">
                    <div className="flex items-start gap-4">
                        <div className="p-3 rounded-full bg-indigo-500 text-white flex-shrink-0">
                            <FileText className="h-6 w-6" />
                        </div>
                        <div className="flex-1">
                            <h3 className="text-lg font-semibold text-indigo-900 mb-1">
                                Payment Gateway Agreement Ready
                            </h3>
                            <p className="text-sm text-indigo-700 mb-4">
                                The bank has set your commercial rates. Please review and sign the
                                Payment Gateway merchant agreement to proceed to final approval.
                            </p>
                            <Button
                                onClick={() => setShowAgreement(true)}
                                className="bg-indigo-600 hover:bg-indigo-700"
                            >
                                <PenTool className="h-4 w-4 mr-2" />
                                Review & Sign Agreement
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Agreement Dialog — same format as ReviewSubmit */}
            <Dialog open={showAgreement} onOpenChange={setShowAgreement}>
                <DialogContent className="max-w-4xl h-[90vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle>Payment Gateway Merchant Agreement</DialogTitle>
                        <DialogDescription>
                            One78 SabbPe Technology Solutions India Private Limited
                        </DialogDescription>
                    </DialogHeader>

                    {/* Scrollable Agreement — commercials + T&C */}
                    <div
                        className="flex-1 overflow-y-auto border rounded-lg p-6 bg-gray-50"
                        onScroll={handleAgreementScroll}
                        ref={agreementRef}
                    >
                        <pre className="whitespace-pre-wrap text-sm font-sans leading-relaxed text-gray-800">
                            {fullAgreementText}
                        </pre>
                    </div>

                    {/* Signature Section — same as ReviewSubmit */}
                    <div className="border-t pt-4 space-y-4">
                        <div className="flex items-center space-x-2">
                            <Checkbox
                                id="pg-read-agreement"
                                checked={hasReadAgreement}
                                onCheckedChange={(checked) => setHasReadAgreement(!!checked)}
                            />
                            <Label htmlFor="pg-read-agreement" className="text-sm font-medium leading-none">
                                I confirm that I have read the entire agreement
                                {!hasReadAgreement && ' (scroll to bottom)'}
                            </Label>
                        </div>

                        <div className="flex items-center space-x-2">
                            <Checkbox
                                id="pg-agree-terms"
                                checked={agreedToTerms}
                                onCheckedChange={(checked) => setAgreedToTerms(!!checked)}
                                disabled={!hasReadAgreement}
                            />
                            <Label htmlFor="pg-agree-terms" className="text-sm font-medium leading-none">
                                I agree to all terms, conditions and commercial rates stated in this agreement
                            </Label>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="pg-signature" className="text-sm font-medium">
                                Digital Signature (Enter your full name)
                            </Label>
                            <div className="relative">
                                <PenTool className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                                <Input
                                    id="pg-signature"
                                    type="text"
                                    placeholder="Enter your full legal name"
                                    value={signature}
                                    onChange={(e) => setSignature(e.target.value)}
                                    disabled={!agreedToTerms}
                                    className="pl-10"
                                />
                            </div>
                            <p className="text-xs text-muted-foreground">
                                By entering your name, you agree that this constitutes a legal digital signature
                            </p>
                        </div>

                        <div className="flex gap-3 justify-end">
                            <Button variant="outline" onClick={() => setShowAgreement(false)} disabled={submitting}>
                                Cancel
                            </Button>
                            <Button
                                onClick={handleSign}
                                disabled={!hasReadAgreement || !agreedToTerms || !signature.trim() || submitting}
                                className="bg-green-600 hover:bg-green-700"
                            >
                                {submitting ? (
                                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Signing...</>
                                ) : (
                                    <><CheckCircle className="h-4 w-4 mr-2" />Sign Agreement</>
                                )}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
};
